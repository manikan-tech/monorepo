import asyncio
import json
import logging
import re
import typing_extensions
from dataclasses import dataclass
from enum import Enum
from typing import Optional, List, Any, Dict

import httpx
from openai import AsyncOpenAI
from langgraph.graph import StateGraph, END
from pydantic import ValidationError

from .config import get_settings
from .schemas import (
    ActionType,
    RecommendationOutput,
    MeasurementInput,
    PendingState,
    PendingType,
    ActiveSearch,
)
from .retrieval import retrieve_relevant_products, format_retrieved_context


logger = logging.getLogger("manikan.agent")


class SemanticIntent(str, Enum):
    GREETING = "GREETING"
    SELF_AWARENESS = "SELF_AWARENESS"
    PROFILE = "PROFILE"
    CURRENT_PRODUCT = "CURRENT_PRODUCT"
    SIZING = "SIZING"
    PRODUCT_DISCOVERY = "PRODUCT_DISCOVERY"
    CATALOG_META = "CATALOG_META"
    CONTINUATION = "CONTINUATION"
    OUT_OF_SCOPE = "OUT_OF_SCOPE"
    CLARIFICATION = "CLARIFICATION"
    CATALOG_UNAVAILABLE = "CATALOG_UNAVAILABLE"


# Intents that temporarily interrupt a pending task but do not replace it.
# When the current turn has one of these intents and pending_state is active,
# the pending task is preserved so the next turn can resume it without the
# user having to re-state the whole context.
# Only PRODUCT_DISCOVERY and CATALOG_UNAVAILABLE (new shopping requests) and
# AWAITING_CATEGORY cross-department mismatches (explicit new context) are
# allowed to clear a pending task.
_PENDING_PRESERVING_INTENTS = frozenset({
    SemanticIntent.SELF_AWARENESS.value,
    SemanticIntent.PROFILE.value,
    SemanticIntent.CURRENT_PRODUCT.value,
    SemanticIntent.GREETING.value,
    SemanticIntent.SIZING.value,
    SemanticIntent.OUT_OF_SCOPE.value,
    SemanticIntent.CONTINUATION.value,
    SemanticIntent.CLARIFICATION.value,
})


class FitState(typing_extensions.TypedDict, total=False):
    messages: list[dict]
    product_id: Optional[str]
    product_name: Optional[str]
    product_detail_question: bool
    query: str

    user_measurements: Optional[MeasurementInput]
    betas: Optional[MeasurementInput]
    size_chart: Optional[str]

    intent: Optional[str]
    selected_category: Optional[str]
    available_categories: Optional[List[str]]
    available_departments: Optional[List[str]]
    available_brands: Optional[List[str]]
    category_department_mapping: Optional[Dict[str, List[str]]]
    catalog_products: Optional[List[dict]]

    customer_name: Optional[str]
    saved_measurements: Optional[dict]
    previous_product_size: Optional[str]
    recent_fit_history: list[dict]

    pending_state: Optional[PendingState]
    active_search: Optional[ActiveSearch]

    shown_product_ids: list[str]

    force_sizing_intent: bool
    force_in_scope: bool

    resolved_intent: Optional[SemanticIntent]
    requires_catalog: bool

    requested_material: Optional[str]
    requested_price_range: Optional[tuple[Optional[float], Optional[float]]]
    material_price_constrained: bool

    retrieved_products: list[dict]
    size_math_result: Optional[dict]
    reasoning_output: Optional[RecommendationOutput]
    final_response: Optional[RecommendationOutput]
    structured_response: Optional[RecommendationOutput]

    trace_id: str
    _parsed_classification: Optional[dict]


@dataclass
class SizeMatchResult:
    recommended_size: Optional[str]
    confidence_score: Optional[float]
    explanation: Optional[str]
    available_sizes: list[str]
    is_out_of_range: bool


@dataclass
class SizeMathResult:
    recommended_size: Optional[str]
    confidence_score: Optional[float]
    dimension_deltas: dict[str, float]
    available_sizes: list[str]
    is_out_of_range: bool


OUT_OF_RANGE_THRESHOLD_CM = 15.0

_SIZE_LABEL_PATTERN = re.compile(
    r"\b(XXS|XS|S|M|L|XL|XXL|XXXL)\b",
    re.IGNORECASE,
)

_CONFIDENCE_PATTERN = re.compile(r"\b(\d{1,3})\s*%?\b")

# Schema-driven dimension alias map — bounded to actual size_chart JSON fields.
_DIMENSION_MAP: dict[str, str] = {
    "chest": "chest_cm",
    "bust": "chest_cm",
    "waist": "waist_cm",
    "hip": "hip_cm",
    "hips": "hip_cm",
}

# Bounded deterministic aliases for natural department variants.
# Applied after LLM classification to catch inconsistent LLM output.
# Child/kids/kidswear intentionally absent — they are NOT adult department
# aliases and must NOT be silently mapped to men or women.
_DEPT_ALIAS_MAP: dict[str, str] = {
    "man": "men",
    "male": "men",
    "boy": "men",
    "menswear": "men",
    "woman": "women",
    "female": "women",
    "girl": "women",
    "womenswear": "women",
}


def _normalize_category_text(text: str) -> str:
    """Normalize a category string for fuzzy comparison: lowercase, collapse punctuation/spaces."""
    return re.sub(r"[-_\s]+", "", (text or "").lower())


def _split_compound_to_categories(phrase: str, available_categories: list[str]) -> list[str]:
    """
    Split a compound phrase on natural language connectives and match each part
    against available catalog categories.  Handles the case where the LLM returns
    a combined string like "blouse and skirt" instead of two separate fields.

    Only fires when a connective is present (returns [] for single-part phrases).
    Uses the same normalization as the existing catalog match so there are no
    special-cased product names.
    """
    parts = [
        p.strip()
        for p in re.split(r"\s+and\s+|\s*&\s*|,\s*|\s+with\s+", phrase.lower())
        if p.strip()
    ]
    if len(parts) < 2:
        return []  # no connective found — not a compound phrase
    norm_cat_map = {_normalize_category_text(c): c for c in available_categories}
    matched: list[str] = []
    for part in parts:
        norm_part = _normalize_category_text(part)
        cat = norm_cat_map.get(norm_part)
        if not cat:
            for norm_cat, orig_cat in norm_cat_map.items():
                if norm_part.rstrip("s") == norm_cat or norm_part == norm_cat.rstrip("s"):
                    cat = orig_cat
                    break
        if cat and cat not in matched:
            matched.append(cat)
    return matched[:2]


def _map_get_departments(mapping: dict, category: str) -> Optional[list]:
    """Case-insensitive lookup into category_department_mapping.
    DB stores capitalized keys ('Skirt'); runtime uses lowercased names ('skirt').
    """
    if not mapping or not category:
        return None
    if category in mapping:
        return mapping[category]
    cat_lower = category.lower()
    for key, val in mapping.items():
        if key.lower() == cat_lower:
            return val
    return None


def _resolve_chart_answer(
    size_chart_raw: str,
    dimensions: list[str],
    operation: Optional[str],
    for_size: Optional[str],
) -> Optional[str]:
    try:
        chart = json.loads(size_chart_raw)
    except (json.JSONDecodeError, TypeError):
        return None

    if not isinstance(chart, list) or not chart:
        return None

    chart_keys = []
    for row in chart:
        for k in row.keys():
            if k.lower() != "size" and k not in chart_keys:
                chart_keys.append(k)

    if operation == "available_dimensions":
        if not chart_keys:
            return "This size chart does not contain any dimensions."
        labels = sorted([k.replace("_cm", "").replace("_kg", "").replace("_", " ").capitalize() for k in chart_keys])
        return f"This size chart includes measurements for: {', '.join(labels)}."

    if operation == "full":
        lines = []
        for row in chart:
            size = row.get("size", "?")
            parts = []
            for k in chart_keys:
                val = row.get(k)
                if val is not None:
                    label = k.replace("_cm", "").replace("_kg", "").replace("_", " ").capitalize()
                    parts.append(f"{label}: {val}cm")
            if parts:
                lines.append(f"{size}: {', '.join(parts)}")
        if not lines:
            return None
        return "Here is the full size chart:\n" + "\n".join(lines)

    fields: list[tuple[str, Optional[str]]] = []
    for dim in dimensions or []:
        dim_clean = (dim or "").lower().strip()
        found_field = None
        # Check alias map first (e.g. "bust" → "chest_cm", "hips" → "hip_cm")
        _alias_target = _DIMENSION_MAP.get(dim_clean)
        if _alias_target and _alias_target in chart_keys:
            found_field = _alias_target
        else:
            for k in chart_keys:
                if dim_clean in k.lower().replace("_", " "):
                    found_field = k
                    break
        fields.append((dim_clean, found_field))

    if not fields:
        return None

    if for_size:
        target = next(
            (
                row
                for row in chart
                if str(row.get("size", "")).upper() == (for_size or "").upper()
            ),
            None,
        )
        if target is None:
            available = [str(r.get("size", "")) for r in chart if r.get("size")]
            return (
                f"Size {for_size} is not in this product's chart. "
                f"Available sizes are: {', '.join(available)}."
            )
        parts = []
        for label, field in fields:
            if not field:
                parts.append(f"{label.capitalize()} is not included in this product's size chart")
                continue
            val = target.get(field)
            if val is not None:
                parts.append(f"{label.capitalize()}: {val}cm")
            else:
                parts.append(f"{label.capitalize()}: not specified")
        return f"For size {for_size}: {', '.join(parts)}."

    parts = []
    for label, field in fields:
        if not field:
            parts.append(f"{label.capitalize()} is not included in this product's size chart")
            continue
        values = [
            (str(row.get("size", "")), row.get(field))
            for row in chart
            if isinstance(row.get(field), (int, float))
        ]
        if not values:
            parts.append(f"No {label} data in this product's chart")
            continue

        if operation == "max":
            size_lbl, val = max(values, key=lambda x: x[1])
            parts.append(f"Maximum {label} is {val}cm (size {size_lbl})")
        elif operation == "min":
            size_lbl, val = min(values, key=lambda x: x[1])
            parts.append(f"Minimum {label} is {val}cm (size {size_lbl})")
        elif operation == "range":
            _, vmin = min(values, key=lambda x: x[1])
            _, vmax = max(values, key=lambda x: x[1])
            parts.append(f"{label.capitalize()} ranges from {vmin}cm to {vmax}cm")
        else:
            summary = ", ".join(f"{s}: {v}cm" for s, v in values)
            parts.append(f"{label.capitalize()} by size — {summary}")

    return (" ".join(parts) + ".") if parts else None


_OUT_OF_SCOPE_REPLY = (
    "I'm Manikan, your fashion and styling assistant. I can help you discover "
    "great clothing, find your perfect fit, and answer questions about our "
    "catalog. However, that topic is a bit outside my expertise. How can I "
    "help you with your wardrobe today?"
)


_DATA_ACCESS_DENIED_REPLY = (
    "To keep your account secure, I don't have access to sensitive personal, "
    "payment, or private account information. I can only use the shopping and "
    "sizing details Manikan safely shares with me to help you find the right fit."
)


def _last_user_query(messages: list[dict]) -> str:
    for message in reversed(messages or []):
        if (
            message.get("role") == "user"
            and isinstance(message.get("content"), str)
        ):
            return message["content"]

    return ""


def _previous_user_query(messages: list[dict], current_query: str) -> str:
    skipped_current = False

    for message in reversed(messages or []):
        if message.get("role") != "user":
            continue

        content = message.get("content")
        if not isinstance(content, str):
            continue

        if not skipped_current and content == current_query:
            skipped_current = True
            continue

        return content

    return ""


def _trace(state: FitState, event: str, **fields: object) -> None:
    logger.info(
        "workflow_event=%s trace_id=%s %s",
        event,
        state.get("trace_id", "unknown"),
        fields,
    )


def _extract_size_label(text: str) -> Optional[str]:
    match = _SIZE_LABEL_PATTERN.search(text or "")
    return match.group(1).upper() if match else None


def _extract_confidence_pct(text: str) -> Optional[int]:
    match = _CONFIDENCE_PATTERN.search(text or "")

    if not match:
        return None

    value = int(match.group(1))

    return value if 0 <= value <= 100 else None


def _find_stated_size_and_confidence(
    messages: list[dict],
) -> tuple[Optional[str], Optional[int]]:
    user_messages = [
        message.get("content", "")
        for message in messages or []
        if message.get("role") == "user"
    ]

    if not user_messages:
        return None, None

    confidence = _extract_confidence_pct(user_messages[-1])
    current_label = _extract_size_label(user_messages[-1])

    # If the current message carries a size label, use it directly.
    if current_label:
        return current_label, confidence

    # If the current message is a confidence reply (number only, no label),
    # look back one message for the label that this confidence is answering.
    # This supports the two-turn "I wear M" → "85%" exchange.
    # Never inherit a stale label when the current message is a bare
    # topic/question with neither a label nor a confidence number.
    if confidence is not None and len(user_messages) >= 2:
        prev_label = _extract_size_label(user_messages[-2])
        return prev_label, confidence

    return None, confidence


def _normalized_pending_type(
    pending_state: PendingState | dict | None,
) -> Optional[str]:
    if not pending_state:
        return None

    if isinstance(pending_state, dict):
        value = pending_state.get("type")
    else:
        value = pending_state.type

    if isinstance(value, Enum):
        return str(value.value)

    return str(value) if value else None


def _pending_value(
    pending_state: PendingState | dict | None,
    key: str,
) -> Any:
    if not pending_state:
        return None

    if isinstance(pending_state, dict):
        return pending_state.get(key)

    return getattr(pending_state, key, None)


def _is_affirmative(text: str) -> bool:
    lowered = (text or "").strip().lower()

    normalized = re.sub(r"[^a-z0-9\s]", " ", lowered)
    normalized = re.sub(r"\s+", " ", normalized).strip()

    if not normalized:
        return False

    affirmative_tokens = {
        "yes",
        "yeah",
        "yep",
        "correct",
        "same",
        "same ones",
        "same measurements",
        "use them",
        "use those",
        "they are",
        "they're",
        "still same",
        "the same",
        "the sam",
    }

    return normalized in affirmative_tokens


def _is_update_intent(text: str) -> bool:
    lowered = (text or "").strip().lower()

    normalized = re.sub(r"[^a-z0-9\s]", " ", lowered)
    normalized = re.sub(r"\s+", " ", normalized).strip()

    if not normalized:
        return False

    update_tokens = {
        "no",
        "nope",
        "new",
        "new ones",
        "new measurements",
        "change them",
        "update them",
        "different",
        "not the same",
    }

    return normalized in update_tokens


async def _resolve_pending_semantic(query: str) -> str:
    settings = get_settings()
    if not settings.deepseek_api_key:
        return "UNCLEAR"

    client = AsyncOpenAI(
        api_key=settings.deepseek_api_key,
        base_url="https://api.deepseek.com",
    )

    instruction = """
You are evaluating a user's reply to a pending request regarding sizing (e.g., confirming saved measurements, or asking for their confidence in a size).
Classify the response into exactly one of: CONFIRMATION, CORRECTION, REJECTION, UPDATE, INTERRUPTION, UNKNOWN.

CONFIRMATION: user agrees or provides the requested confirmation/confidence (e.g., "yes", "use them", "they're the same", "80%", "I am sure").
CORRECTION: user corrects the sizing assumption (e.g., "I am actually M", "make it an L").
REJECTION: user denies the premise, says they don't know, or rejects the size (e.g., "I never said S", "I have no idea", "that's wrong", "I don't know").
UPDATE: user wants to provide new measurements or says they changed (e.g., "I gained weight", "my waist is 70 now").
INTERRUPTION: user asks an entirely unrelated question or changes the topic (e.g., "show me jackets instead", "what's the price?").
UNKNOWN: the response is ambiguous.

Return ONLY valid JSON with the key "action" and value as one of the 6 allowed strings.
"""
    try:
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": instruction},
                {"role": "user", "content": query},
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
        )
        content = response.choices[0].message.content or ""
        parsed = json.loads(_strip_json_fences(content))
        return parsed.get("action", "UNKNOWN")
    except Exception as exc:
        logger.warning(f"Pending resolver failed: {exc}")
        return "UNKNOWN"


async def _resolve_pending_state(
    state: FitState,
    query: str,
) -> Optional[RecommendationOutput]:
    pending = state.get("pending_state")

    if not pending:
        return None

    pending_type = _normalized_pending_type(pending)

    action = await _resolve_pending_semantic(query)

    if action == "INTERRUPTION":
        # Preserve pending_state!
        return None

    if pending_type == PendingType.CONFIRM_MEASUREMENTS.value:
        if action == "CONFIRMATION":
            state["pending_state"] = None
            state["force_sizing_intent"] = True
            return None

        if action == "UPDATE":
            state["pending_state"] = None
            return RecommendationOutput(
                action=ActionType.ASK_MEASUREMENTS,
                message=(
                    "No problem! Please share your current height, weight, chest, "
                    "waist, and hip measurements. Once I have those, I can calculate "
                    "the perfect fit for this item."
                ),
                provider="STATIC-PENDING",
                pending_state=None,
            )

        if action == "REJECTION":
            state["pending_state"] = None
            return RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message="Okay, I've cancelled the sizing calculation. What else can I help you with?",
                provider="STATIC-PENDING",
                pending_state=None,
            )

        # UNKNOWN — current message does not answer the pending question.
        # Let normal intent classification handle it; pending remains resumable.
        return None

    if pending_type == PendingType.REQUEST_CONFIDENCE.value:
        if action == "UNKNOWN":
            # Don't assume rejection — let the current turn be classified normally.
            # The pending state is preserved and resumable next turn.
            return None

        if action == "REJECTION":
            state["pending_state"] = None
            return RecommendationOutput(
                action=ActionType.ASK_MEASUREMENTS,
                message=(
                    "No problem. To make sure you get the perfect fit, could you please share "
                    "your exact height, weight, chest, waist, and hip measurements? "
                    "I'll use them to calculate the best size for this specific product."
                ),
                provider="STATIC-LABEL-UNTRUSTED",
                pending_state=None,
            )

        if action == "CORRECTION":
            # the user corrected their size, e.g. "I am M". Let's parse the size or trust it.
            # but wait, it's easier to just pass through and let the intent router handle it as SIZING.
            # by clearing pending state, they are no longer trapped.
            state["pending_state"] = None
            # Return None to let analyze_turn route it naturally as SIZING.
            return None

        # CONFIRMATION or otherwise, let's extract the confidence.
        confidence = _extract_confidence_pct(query)
        size_label = _pending_value(pending, "recommended_size")

        if confidence is None:
            return RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=(
                    "Could you provide a confidence score between 0 and 100? "
                    "This helps me ensure the size recommendation is as accurate as possible."
                ),
                provider="STATIC-PENDING",
                pending_state=pending,
            )

        state["pending_state"] = None

        if size_label and confidence > 80:
            return RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                recommended_size=size_label,
                confidence_score=confidence / 100,
                message=f"Perfect. I'll confidently recommend size {size_label} for this item based on your input.",
                provider="STATIC-LABEL-TRUSTED",
                pending_state=None,
            )

        return RecommendationOutput(
            action=ActionType.ASK_MEASUREMENTS,
            message=(
                "I want to make sure you get the perfect fit. Could you please share "
                "your exact height, weight, chest, waist, and hip measurements? "
                "I'll use them to calculate the best size for this specific product."
            ),
            provider="STATIC-LABEL-UNTRUSTED",
            pending_state=None,
        )

    return None


def _is_data_access_denied_question(text: str) -> bool:
    lowered = (text or "").lower()

    sensitive_markers = (
        "password",
        "credit card",
        "card number",
        "cvv",
        "bank account",
        "bank details",
        "api key",
        "secret key",
        "access token",
        "private key",
        "home address",
        "phone number",
        "email address",
    )

    return any(marker in lowered for marker in sensitive_markers)


def _answer_profile_question(
    state: FitState,
) -> RecommendationOutput:
    customer_name = state.get("customer_name")
    measurements = state.get("saved_measurements")
    previous_size = state.get("previous_product_size")
    history = state.get("recent_fit_history") or []

    name_part = f" {customer_name}" if customer_name else ""

    if measurements:
        height = measurements.get("height_cm")
        weight = measurements.get("weight_kg")
        chest = measurements.get("chest_cm")
        waist = measurements.get("waist_cm")
        hips = measurements.get("hips_cm")

        parts = []

        if height is not None:
            parts.append(f"height {height}cm")

        if weight is not None:
            parts.append(f"weight {weight}kg")

        if chest is not None:
            parts.append(f"chest {chest}cm")

        if waist is not None:
            parts.append(f"waist {waist}cm")

        if hips is not None:
            parts.append(f"hips {hips}cm")

        details = ", ".join(parts)

        message = (
            f"Yes{name_part}, I currently have your sizing measurements saved on file"
            + (f": {details}." if details else ".")
        )

        if previous_size:
            message += f" It looks like your most recently saved product size was a {previous_size}."

        if history:
            message += (
                f" Additionally, I can see {len(history)} of your recent fit "
                f"recommendation{'s' if len(history) != 1 else ''} in your history."
            )

        return RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message=message,
            provider="STATIC-PROFILE",
        )

    if previous_size:
        return RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message=(
                f"I don't currently have any specific body measurements saved for you{name_part}. "
                f"However, I can see that your most recently saved product size was a {previous_size}."
            ),
            provider="STATIC-PROFILE",
        )

    if history:
        last = history[0]

        last_size = last.get("recommended_size")
        last_product = last.get("product_name")

        if last_size:
            product_part = (
                f" for {last_product}"
                if last_product
                else ""
            )

            return RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=(
                    f"I found your most recent fit recommendation{product_part}. "
                    f"Based on that session, we recommended a size {last_size}."
                ),
                provider="STATIC-PROFILE",
            )

    return RecommendationOutput(
        action=ActionType.PROVIDE_RECOMMENDATION,
        message=(
            "I checked your profile, but I don't currently have any saved sizing "
            "information or measurements available for you right now."
        ),
        provider="STATIC-PROFILE",
    )


def _answer_self_awareness_question(
    customer_name: Optional[str],
    has_product: bool = False,
) -> RecommendationOutput:
    name_part = f", {customer_name}" if customer_name else ""

    if has_product:
        message = (
            f"I'm Manikan{name_part}, your personal fashion and sizing assistant! "
            "Right now I'm in Product mode for the item you're viewing. I can:\n"
            "• Answer questions about this product (material, brand, available sizes, size chart)\n"
            "• Calculate your exact fit using this product's authoritative size chart and your measurements\n"
            "• Walk you through the confidence flow if you already know your size\n"
            "• Find similar alternatives within the same category\n"
            "For a different category or a new product search, head back to the main store "
            "and I'll help you there."
        )
    else:
        message = (
            f"I'm Manikan{name_part}, your personal fashion shopping and sizing assistant! "
            "In General Chat I can:\n"
            "• Help you discover products by category, department, occasion, material, brand, or price\n"
            "• Browse and filter our full catalog with recommendation cards\n"
            "• Answer fashion and style questions\n"
            "• Explain what we carry and what's available\n"
            "For exact garment sizing, open a product you like using View Item — "
            "I'll then use that product's own size chart to find your perfect fit."
        )

    return RecommendationOutput(
        action=ActionType.PROVIDE_RECOMMENDATION,
        message=message,
        provider="STATIC-SELF-AWARENESS",
    )


def _strip_json_fences(text: str) -> str:
    return re.sub(
        r"^```(?:json)?|```$",
        "",
        (text or "").strip(),
        flags=re.MULTILINE,
    ).strip()


def _extract_price_constraint(
    query: str,
) -> Optional[tuple[Optional[float], Optional[float]]]:
    lowered = (query or "").lower()

    between_match = re.search(
        r"\bbetween\s+(?:egp\s*)?(\d+(?:\.\d+)?)"
        r"\s*(?:and|to|-)\s*"
        r"(?:egp\s*)?(\d+(?:\.\d+)?)",
        lowered,
    )

    if between_match:
        first = float(between_match.group(1))
        second = float(between_match.group(2))
        return min(first, second), max(first, second)

    range_match = re.search(
        r"\b(?:from\s+)?(?:egp\s*)?(\d+(?:\.\d+)?)"
        r"\s*(?:to|-)\s*"
        r"(?:egp\s*)?(\d+(?:\.\d+)?)",
        lowered,
    )

    if range_match:
        first = float(range_match.group(1))
        second = float(range_match.group(2))
        return min(first, second), max(first, second)

    max_match = re.search(
        r"\b(?:under|below|less than|max(?:imum)?(?: of)?)\s*"
        r"(?:egp\s*)?(\d+(?:\.\d+)?)",
        lowered,
    )

    if max_match:
        return None, float(max_match.group(1))

    min_match = re.search(
        r"\b(?:over|above|more than|min(?:imum)?(?: of)?)\s*"
        r"(?:egp\s*)?(\d+(?:\.\d+)?)",
        lowered,
    )

    if min_match:
        return float(min_match.group(1)), None

    return None


def _filter_catalog_by_material_and_price(
    products: list[dict],
    material: Optional[str],
    price_range: Optional[tuple[Optional[float], Optional[float]]],
) -> list[dict]:
    filtered = []

    for product in products:
        if material:
            fabric = str(product.get("fabric") or "").lower()

            if material.lower() not in fabric:
                continue

        if price_range:
            price = product.get("price")

            if not isinstance(price, (int, float)):
                continue

            min_price, max_price = price_range

            if min_price is not None and price < min_price:
                continue

            if max_price is not None and price > max_price:
                continue

        filtered.append(product)

    return filtered


def _find_product_by_id(
    product_id: Optional[str],
    products: Optional[list[dict]],
) -> Optional[dict]:
    if not product_id:
        return None

    for product in products or []:
        if product.get("id") == product_id:
            return product

    return None


def _chart_from_variants(
    variants: list[dict],
) -> list[dict]:
    return [
        {
            "size": (
                variant.get("sizeLabel")
                or variant.get("size_label")
                or variant.get("size")
            ),
            "chest_cm": (
                variant.get("chestCm")
                if "chestCm" in variant
                else variant.get("chest_cm")
            ),
            "waist_cm": (
                variant.get("waistCm")
                if "waistCm" in variant
                else variant.get("waist_cm")
            ),
            "hip_cm": (
                variant.get("hipCm")
                if "hipCm" in variant
                else variant.get("hip_cm")
            ),
        }
        for variant in variants
    ]


def _available_size_labels(
    size_chart_raw: Optional[str],
) -> list[str]:
    if not size_chart_raw:
        return []

    try:
        chart = json.loads(size_chart_raw)
    except (json.JSONDecodeError, TypeError):
        return []

    if not isinstance(chart, list):
        return []

    return [
        str(row.get("size"))
        for row in chart
        if row.get("size")
    ]


def compute_recommended_size(
    betas: MeasurementInput,
    size_chart_raw: str,
) -> SizeMatchResult:
    try:
        size_chart = json.loads(size_chart_raw)
    except (json.JSONDecodeError, TypeError):
        return SizeMatchResult(
            None,
            None,
            None,
            [],
            True,
        )

    if not size_chart:
        return SizeMatchResult(
            None,
            None,
            None,
            [],
            True,
        )

    available_sizes = [
        entry.get("size")
        for entry in size_chart
        if entry.get("size")
    ]

    best_size = None
    best_distance = float("inf")

    for entry in size_chart:
        squared_diff = 0.0
        dimensions_used = 0

        waist_value = entry.get("waist_cm")

        if isinstance(waist_value, (int, float)):
            squared_diff += (
                waist_value - betas.waist_cm
            ) ** 2
            dimensions_used += 1

        chest_value = entry.get("chest_cm")

        if isinstance(chest_value, (int, float)):
            squared_diff += (
                chest_value - betas.chest_cm
            ) ** 2
            dimensions_used += 1

        hip_value = entry.get("hip_cm")

        if isinstance(hip_value, (int, float)):
            squared_diff += (
                hip_value - betas.hips_cm
            ) ** 2
            dimensions_used += 1

        if dimensions_used == 0:
            continue

        distance = squared_diff ** 0.5

        if distance < best_distance:
            best_distance = distance
            best_size = entry.get("size")

    if best_size is None:
        return SizeMatchResult(
            None,
            None,
            None,
            available_sizes,
            True,
        )

    if best_distance > OUT_OF_RANGE_THRESHOLD_CM:
        return SizeMatchResult(
            None,
            None,
            None,
            available_sizes,
            True,
        )

    confidence = max(
        0.0,
        1.0 - (
            best_distance / OUT_OF_RANGE_THRESHOLD_CM
        ),
    )

    explanation = (
        f"Based on your measurements: chest "
        f"({betas.chest_cm}cm), waist ({betas.waist_cm}cm), "
        f"and hip ({betas.hips_cm}cm), size {best_size} "
        f"is the closest chart match."
    )

    return SizeMatchResult(
        best_size,
        round(confidence, 2),
        explanation,
        available_sizes,
        False,
    )


async def call_llm_with_fallback(
    messages: list[dict],
    fallback_action: ActionType = ActionType.PROVIDE_RECOMMENDATION,
) -> tuple[RecommendationOutput, str]:
    settings = get_settings()

    if not settings.deepseek_api_key:
        raise RuntimeError("DeepSeek provider is not configured.")

    client = AsyncOpenAI(
        api_key=settings.deepseek_api_key,
        base_url="https://api.deepseek.com",
    )

    payload = [
        {
            "role": message.get("role"),
            "content": message.get("content"),
        }
        for message in messages
        if message.get("role")
        and message.get("content") is not None
    ]

    json_instruction = (
        "Return ONLY one valid JSON object. JSON is mandatory. "
        "Required keys: message (string), action (string). "
        "Valid action values are: ask_measurements, "
        "provide_recommendation, fetch_products, "
        "redirect_to_product, request_data. "
        "Optional keys: recommended_size, confidence_score, "
        "explanation, matched_category. "
        "Do not wrap the JSON in Markdown."
    )

    system_indexes = [
        index
        for index, message in enumerate(payload)
        if message["role"] == "system"
    ]

    if system_indexes:
        last_system_index = system_indexes[-1]
        payload[last_system_index]["content"] = (
            str(payload[last_system_index]["content"])
            + "\n\n"
            + json_instruction
        )
    else:
        payload.insert(
            0,
            {
                "role": "system",
                "content": json_instruction,
            },
        )

    try:
        # An occasional successful HTTP response has no usable content. Retry
        # that narrow transient condition once before callers select their
        # existing deterministic/degraded fallback. This matches the
        # classifier's retry policy and never retries normal completions.
        for llm_attempt in range(2):
            response = await client.chat.completions.create(
                model="deepseek-chat",
                messages=payload,
                response_format={"type": "json_object"},
                temperature=0.0,
            )

            raw_content = (
                response.choices[0].message.content
                or ""
            )

            try:
                parsed = json.loads(
                    _strip_json_fences(raw_content)
                )
            except json.JSONDecodeError:
                parsed = {
                    "message": raw_content.strip(),
                    "action": fallback_action.value,
                }

            if isinstance(parsed, list):
                if parsed and isinstance(parsed[0], dict):
                    parsed = parsed[0]
                else:
                    parsed = {
                        "message": raw_content.strip(),
                        "action": fallback_action.value,
                    }

            if not isinstance(parsed, dict):
                parsed = {
                    "message": raw_content.strip(),
                    "action": fallback_action.value,
                }

            if "message" not in parsed:
                for alternate_key in (
                    "reply",
                    "text",
                    "response",
                    "content",
                ):
                    if alternate_key in parsed:
                        parsed["message"] = parsed.pop(
                            alternate_key
                        )
                        break

            message = str(parsed.get("message") or "").strip()
            if not message:
                logger.warning(
                    "workflow_event=llm_empty_message action=%s attempt=%d",
                    fallback_action.value,
                    llm_attempt,
                )
                if fallback_action == ActionType.FETCH_PRODUCTS:
                    # Product-fetch context: a neutral caption is fine — the cards are the content.
                    parsed["message"] = "Here are some options that may match what you're looking for."
                elif llm_attempt == 0:
                    await asyncio.sleep(0.4)
                    continue
                else:
                    # Raise so each caller can apply its own contextually-correct fallback
                    # (GREETING → "You're welcome!", CATALOG_META → deterministic catalog facts,
                    # PROFILE → profile summary, general LLM → degraded technical message).
                    # Injecting "I'm having trouble..." here would suppress all caller fallbacks.
                    raise ValueError("llm_empty_message")

            valid_actions = {
                action.value
                for action in ActionType
            }

            if parsed.get("action") not in valid_actions:
                parsed["action"] = fallback_action.value

            try:
                result = RecommendationOutput.model_validate(
                    parsed
                )
            except ValidationError:
                result = RecommendationOutput(
                    action=fallback_action,
                    message=str(
                        parsed.get("message") or raw_content
                    ).strip(),
                )

            result.provider = "DEEPSEEK"

            return result, "DEEPSEEK"

    except Exception as exc:
        logger.warning(
            "Provider DEEPSEEK failed: %s: %s",
            type(exc).__name__,
            exc,
        )

        raise


async def check_all_providers() -> list[dict]:
    settings = get_settings()
    results = []

    if settings.deepseek_api_key:
        try:
            client = AsyncOpenAI(
                api_key=settings.deepseek_api_key,
                base_url="https://api.deepseek.com",
            )

            await client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {
                        "role": "user",
                        "content": "ping",
                    }
                ],
                max_tokens=10,
            )

            results.append(
                {
                    "provider": "DEEPSEEK",
                    "status": "ok",
                }
            )

        except Exception as exc:
            results.append(
                {
                    "provider": "DEEPSEEK",
                    "status": "failed",
                    "error": str(exc),
                }
            )

    else:
        results.append(
            {
                "provider": "DEEPSEEK",
                "status": "not_configured",
                "error": "missing api_key",
            }
        )

    return results


def _build_chart_section(size_chart_raw: Optional[str]) -> str:
    """Format the size chart as a compact authoritative block for the LLM prompt."""
    if not size_chart_raw:
        return ""
    try:
        chart = json.loads(size_chart_raw)
        if not isinstance(chart, list) or not chart:
            return ""
        # Derive field names from actual chart data — no hardcoded schema
        field_keys = []
        for row in chart:
            for k in row.keys():
                if k.lower() != "size" and k not in field_keys:
                    field_keys.append(k)
        lines = []
        for row in chart:
            sz = row.get("size", "?")
            fields = []
            for k in field_keys:
                val = row.get(k)
                if val is not None:
                    label = k.replace("_cm", "").replace("_kg", "").replace("_", " ")
                    fields.append(f"{label}={val}")
            if fields:
                lines.append(f"  {sz}: {', '.join(fields)}")
        if not lines:
            return ""
        return (
            "\n\nCURRENT PRODUCT SIZE CHART (authoritative — use these exact numbers, "
            "never invent values):\n" + "\n".join(lines)
        )
    except Exception:
        return ""


def build_general_instruction(
    available_categories: Optional[List[str]],
    product_name: Optional[str] = None,
    customer_name: Optional[str] = None,
    saved_measurements: Optional[dict] = None,
    previous_product_size: Optional[str] = None,
    recent_fit_history: Optional[list[dict]] = None,
    size_chart_raw: Optional[str] = None,
) -> str:
    categories = (
        ", ".join(available_categories)
        if available_categories
        else "no categories configured"
    )

    profile_summary = {
        "customer_name": customer_name,
        "saved_measurements_available": bool(
            saved_measurements
        ),
        "previous_product_size": previous_product_size,
        "recent_fit_history_count": len(
            recent_fit_history or []
        ),
    }

    return (
        "You are Manikan AI, the shopping and sizing assistant "
        "for a clothing e-commerce platform.\n\n"
        f"Available clothing categories: {categories}.\n"
        f"Current product: {product_name or 'none'}.\n"
        f"Safe profile context summary: "
        f"{json.dumps(profile_summary)}.\n\n"
        "GENERAL CHAT:\n"
        "- Help users browse and discover products.\n"
        "- Do not calculate a garment-specific size without "
        "a current product and an authoritative size chart.\n"
        "- If the user asks for an exact size in general chat, "
        "guide them to open a product using View Item.\n\n"
        "PRODUCT CHAT:\n"
        "- Use trusted current-product information only.\n"
        "- Product-specific sizing is allowed only when a real "
        "size chart and measurements are available.\n\n"
        "FASHION SCOPE:\n"
        "- Fashion includes clothing, footwear, accessories, "
        "jewelry, styling, materials, fit, and related shopping.\n"
        "- A fashion item not sold by the current store is NOT "
        "out of scope. Explain that it is currently unavailable.\n"
        "- Unrelated requests such as geography, cooking, "
        "programming, politics, or food are outside scope.\n\n"
        "GROUNDING:\n"
        "- Never invent products, brands, prices, materials, "
        "sizes, stock, profile data, or measurements.\n"
        "- Retrieved catalog context and deterministic sizing "
        "results are authoritative.\n"
        "- Do NOT claim the user 'stated', 'said', or 'mentioned' a size unless "
        "they explicitly did so in this exact conversation. Never fabricate a size "
        "assertion from profile history or previous context.\n"
        "- Do NOT say 'You mentioned [size]' unless the user actually said that size "
        "in their most recent messages. If there is no explicit user size statement, "
        "ask for measurements or ask what size they usually wear.\n"
        "- Be completely honest about what constraints were used to filter results "
        "(e.g., if a gender filter was applied, admit it; if an item wasn't in the catalog, state that).\n"
        "- Keep responses concise and natural.\n\n"
        "RESPONSE ACTION:\n"
        "- Use action: fetch_products when presenting product search results or recommendations "
        "that should be displayed as visual product cards.\n"
        "- Use action: provide_recommendation for conversational text-only responses, "
        "guidance, clarifications, and answers that do not involve product cards."
        + (
            f"\n\nCURRENT PRODUCT: The user is currently viewing \"{product_name}\". "
            "Do NOT suggest 'View Item' or redirect them to open this product — they are "
            "already viewing it. Answer product questions from the context provided."
            if product_name else ""
        )
        + (
            _build_chart_section(size_chart_raw)
            if product_name and size_chart_raw else ""
        )
    )



async def _extract_department_only(query: str, available_departments: list[str]) -> str | None:
    from openai import AsyncOpenAI
    from .config import get_settings
    import json
    
    settings = get_settings()
    if not settings.deepseek_api_key:
        return None
        
    client = AsyncOpenAI(
        api_key=settings.deepseek_api_key,
        base_url="https://api.deepseek.com",
    )
    
    instruction = (
        "Extract the fashion department or gender specified in the user's query.\n"
        "Map it semantically (e.g. 'for my husband' -> 'men', 'womenswear' -> 'women').\n"
        f"Available departments: {', '.join(available_departments) if available_departments else 'none'}.\n"
        "If it matches an available department, output that exact string.\n"
        "If the user is asking a completely new explicit search intent (e.g. 'actually show me skirts', 'I want pants'), output 'NEW_INTENT'.\n"
        "If no clear department is found and it's not a new search, output 'NONE'.\n"
        "Return ONLY a JSON object with a single key 'department'."
    )
    
    try:
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": instruction},
                {"role": "user", "content": json.dumps({"query": query})}
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
        )
        content = response.choices[0].message.content
        if not content: return None
        parsed = json.loads(content)
        dept = parsed.get("department")
        if dept == "NONE" or not dept:
            return None
        return dept
    except Exception as e:
        return None

async def _classify_intent_with_llm(
    state: FitState,
) -> dict:
    query = state.get("query", "")

    recent_history = "\n".join(
        f"{message.get('role')}: "
        f"{message.get('content')}"
        for message in (
            state.get("messages") or []
        )[-6:]
    )

    context = {
        "current_query": query,
        "recent_conversation": recent_history,
        "has_product_id": bool(
            state.get("product_id")
        ),
        "has_size_chart": bool(
            state.get("size_chart")
        ),
        "has_profile_context": bool(
            state.get("customer_name")
            or state.get("saved_measurements")
            or state.get("recent_fit_history")
        ),
        "selected_category": state.get(
            "selected_category"
        ),
        "available_categories": state.get(
            "available_categories"
        )
    }

    instruction = f"""
You are the authoritative semantic intent classifier for
Manikan, a fashion e-commerce assistant.

AVAILABLE CATALOG CATEGORIES:
{', '.join(state.get("available_categories") or []) if state.get("available_categories") else 'none'}

Return ONLY valid JSON with these keys:

resolved_intent
requires_catalog
is_insufficient_for_retrieval
is_human_fashion_request
stated_wearer_type
requested_fashion_concept
requested_product_type
canonical_catalog_category
additional_requested_category
requested_department
canonical_department
catalog_meta_subject
requested_material
requested_brand
min_price
max_price

resolved_intent MUST be exactly one of:

GREETING
SELF_AWARENESS
PROFILE
CURRENT_PRODUCT
SIZING
PRODUCT_DISCOVERY
CATALOG_META
CONTINUATION
OUT_OF_SCOPE
CLARIFICATION
CATALOG_UNAVAILABLE

Definitions:

GREETING:
Simple conversational greetings, gratitude, praise, surprise,
acknowledgement, and social/emotional reactions such as
"thank you", "thanks", "wow", "great", "okay", "are you sure?", or
"I liked that". These are GREETING regardless of any active
product search or pending task.

CRITICAL OVERRIDE — these exact phrases are ALWAYS GREETING, no
matter how long the conversation or what topic preceded them:
"thank you", "thanks", "ok", "okay", "wow", "great", "perfect",
"got it", "nice", "cool", "alright". They are social acknowledgments —
NEVER CONTINUATION, SIZING, or CLARIFICATION.

When in doubt between GREETING and CONTINUATION for a clearly social
or emotional expression, always prefer GREETING.

SELF_AWARENESS:
Questions about Manikan itself, its identity, capabilities, role,
or services. Includes: "what can you do?", "how can you help me?",
"how do recommendations work?", "what should I ask you?",
"how do I use this?", "what does this assistant do?".

PROFILE:
Questions about the authenticated shopper's own profile data —
name, saved measurements, previous fit recommendations, previous
product size, or sizing history — whether asking for the value
or asking if the assistant knows/has that information.

The following are ALWAYS PROFILE regardless of has_profile_context
(the handler will respond "not available" if nothing is stored):
"What is my name?", "what's my name?", "Do you know my name?",
"What are my measurements?", "what's my measurement?",
"Do you know my measurements?", "What do you know about me?",
"Do you have my sizing info?", "What size did you recommend me
last time?", "Do you know me?".

has_profile_context being false does NOT change the intent —
the user is still asking about THEIR data. If nothing is stored
the PROFILE handler will say so naturally.

DISAMBIGUATION — "my" vs "your":
"what's MY name?" → PROFILE (about the shopper's own name)
"what's YOUR name?" → SELF_AWARENESS (about the assistant's name)
"what's my measurement?" → PROFILE
"what can YOU do?" → SELF_AWARENESS

The semantic SUBJECT of these questions is the USER's own data,
not the assistant's capabilities or identity.

PROFILE is distinct from:
- SELF_AWARENESS (subject is the assistant itself — its capabilities,
  role, or identity, NOT the user's data)
- SIZING (subject is which size fits the user for a specific
  garment right now)

"Do you know my [profile field]?" → PROFILE, not SELF_AWARENESS.
"Can you tell me my [profile field]?" → PROFILE, not SELF_AWARENESS.

CURRENT_PRODUCT:
Questions about the product currently being viewed, including
its description, material, fabric, brand, price, features,
available size labels, size chart dimensions, variants, or
general suitability.

When has_product_id is true, broad requests for product
information or details referencing the current item — such as
"product details?", "what are the details?", "product info?",
"tell me more about it", "product information?" — are
CURRENT_PRODUCT, not SELF_AWARENESS or GREETING.

When has_product_id is true, short factual questions about any
product attribute are CURRENT_PRODUCT, not GREETING or
SELF_AWARENESS. This includes: "what's the fabric?",
"what material is this?", "what's it made of?", "what brand?",
"what's the price?", "what category?", "what's the fabric like?",
"how is it made?", "does it have a relaxed fit?",
"tell me about the design", "what are its features?".

Asking which size labels the product offers is CURRENT_PRODUCT,
not SIZING.

Asking for a measurement value from the product's size chart
(e.g., "what is the max chest?", "waist for XL") is
CURRENT_PRODUCT, not SIZING.

SIZING:
The shopper wants to know which size or fit is appropriate FOR
THEM, wants a garment-specific fit calculation, asks whether a
size fits them, or asks to calculate size from measurements.

IMPORTANT: A message where the user states their own personal
size (e.g., "I wear XL", "my size is M", "I am a large") is
SIZING even when an active product search exists in the
conversation. Do NOT classify these as CONTINUATION.

ALSO SIZING: Messages that indicate the shopper's measurements
have changed, are different from what was used, or need to be
updated — even without stating new values yet. Examples:
"my measurements are different now", "those measurements are
outdated", "but my measurement it's being different",
"I've changed, my measurements are different",
"I want to re-enter my measurements". These signal the user
wants to provide fresh measurements → classify as SIZING.

PRODUCT_DISCOVERY:
Any request to find, browse, shop for, or check availability of a fashion
product/category/style/occasion/material/price/brand/segment, including
categories the current catalog may not stock (e.g., shoes, children's clothing).

A statement of occasion or need followed by a request for help is
PRODUCT_DISCOVERY — the user wants to find products, not to know about the
assistant. Examples:
- "I have a wedding and I want your help" → PRODUCT_DISCOVERY (wedding occasion)
- "I need something for a party, can you help?" → PRODUCT_DISCOVERY
- "I'm attending a gala, what do you suggest?" → PRODUCT_DISCOVERY

Price-only refinements like "under 900", "cheaper than 800 EGP", or
"show me under 700" on an active search are PRODUCT_DISCOVERY (they add a
new constraint), not CONTINUATION.

A request for something similar to the current product is
PRODUCT_DISCOVERY seeded by current-product context.

CATALOG_META:
Questions about what the store carries, its catalog structure, or its
general capabilities — including available categories, brands, departments,
genders, or whether a department/gender/type is supported. Also covers
questions about whether the current search results are all that's available
(i.e., asking about completeness of the catalog for a given type).

CATALOG_META covers:
- "What categories do you have?"
- "What brands do you sell?"
- "What departments do you carry?"
- "What genders do you have?"
- "Do you have clothes for women? for men? for children?"
- "Do you sell men's and women's clothing?"
- "Do you have clothes for women, men and children?"
- "What kinds of clothes do you offer?"
- "What do you sell?"
- "Is that all the jackets you have?" (asking if the catalog is exhausted)
- "That's only jackets you have?" (confirming catalog scope)
- "Are those all the options?" (asking about catalog completeness)
- "Do you have more brands?"
- "What brands do you have?"
- "Which brands are available?"
- "What categories do you have for men?"
- "What do you carry for women?"
- "What men's categories are available?"

These are META/CAPABILITY questions — the user wants to understand what
the store stocks, NOT to start a specific shopping search.

"Do you have blouses?" when the user clearly wants to browse → PRODUCT_DISCOVERY
"What categories do you carry?" (capability inquiry) → CATALOG_META
"Do you have clothes for men and women?" (capability inquiry) → CATALOG_META
"Is that all [category] you have?" (catalog completeness inquiry) → CATALOG_META

CONTINUATION:
Continue an already-active product search or browse result set
with the SAME constraints. Examples: "show me more", "next ones",
"any others?", "can you show me more?", "show me more of those".

"show me more [same category already active]" is CONTINUATION,
not PRODUCT_DISCOVERY — the category is not changing.
Example: if pants are the active search and user says
"can you show me more pants" → CONTINUATION.
Only use PRODUCT_DISCOVERY when the user is requesting a
genuinely different or new category/style/department.

Do not use CONTINUATION for a new similar-product search seeded
by a current product.
A user changing the active search constraint or category (e.g.,
adding a new price constraint, switching back to another category,
or changing material/style) is a NEW PRODUCT_DISCOVERY,
not CONTINUATION.
Social reactions to shown products, explicit personal size
statements, and off-topic questions are NOT CONTINUATION.

IMPORTANT — CONTEXTUAL REFERENCE FOLLOW-UPS:
When the user's message is a clear short follow-up that references
a subject introduced in the IMMEDIATELY PRECEDING assistant turn
(using pronouns or references such as "it", "that", "this",
"which one", "those", "how can I get it", "which do you recommend",
"tell me more"), classify as CONTINUATION with requires_catalog: false.
The reasoning agent will resolve the referent from conversation history.
Use CONTINUATION only when the referent is clear from recent context.
If genuinely ambiguous, use CLARIFICATION.

OUT_OF_SCOPE:
Only genuinely non-fashion/non-shopping topics.
Requests unrelated to fashion, clothing, shopping, sizing,
fit, Manikan services, or permitted shopping-profile context.

shoes, accessories, jewelry, bags, and children's clothing are
fashion-related. Do not classify them as OUT_OF_SCOPE.

CLARIFICATION:
Use when the intent cannot be resolved because:
- The request is so broad no structured dimension (category, department,
  occasion) can be extracted, e.g. "something nice", "I need clothes".
- The input is genuinely unrecognizable — random characters, sequences
  with no recoverable semantic meaning (gibberish).
For CLARIFICATION also set is_insufficient_for_retrieval: true and
is_human_fashion_request: true (since meaning is unknown, do not assume
non-fashion). Do NOT use OUT_OF_SCOPE for unrecognizable input —
OUT_OF_SCOPE is only for clearly understood but non-fashion requests.
Normal typos, imperfect English, or short replies are NOT CLARIFICATION
if their meaning can be reasonably recovered.

is_insufficient_for_retrieval:
True when the request is too broad to extract any useful structured
dimension (category, department, occasion) OR when the input is
genuinely unrecognizable (gibberish). Set to true for CLARIFICATION.
For PRODUCT_DISCOVERY set to true only when no dimension is extractable.

is_human_fashion_request:
══════════════════════════════════════════════════════
CRITICAL — READ THIS BEFORE SETTING is_human_fashion_request:
══════════════════════════════════════════════════════

THIS FIELD IS ABOUT THE WEARER, NOT THE CLOTHING ITEM.

A jacket is a human clothing item — but the request
"i'm a fish, i want a jacket" has a NON-HUMAN wearer.
→ is_human_fashion_request: FALSE

The clothing item being human fashion DOES NOT MAKE
this field true when the stated wearer is non-human.

RULE:
If the stated wearer / shopper / subject is explicitly
an animal, pet, creature, or any clearly non-human
entity → set is_human_fashion_request: FALSE and
resolved_intent: OUT_OF_SCOPE.

Do NOT give "benefit of the doubt" to these patterns.
Treat them literally:
  "i'm a fish i want a jacket"  → FALSE, OUT_OF_SCOPE
  "i'm a cat i want a skirt"    → FALSE, OUT_OF_SCOPE
  "my dog needs pants"           → FALSE, OUT_OF_SCOPE
  "get a raincoat for my parrot" → FALSE, OUT_OF_SCOPE

These ARE human fashion (TRUE):
  "i'm a student i want a jacket" → TRUE
  "i'm a tall woman, need a dress" → TRUE
  children's / kids clothing      → TRUE (children are human)

The keyword is WHO is wearing it, not WHAT they want.

IMPORTANT: children's clothing, childrenswear, kidswear, kids clothes,
baby clothes, and any clothing for children are ALL human fashion —
set is_human_fashion_request: true even if we don't carry them.
Same for shoes, accessories, jewelry, and bags.

stated_wearer_type:
"HUMAN", "NON_HUMAN", or "UNSPECIFIED".
If the stated wearer, shopper, or subject is explicitly an animal, pet, creature, or any clearly non-human entity (e.g., "fish", "dog", "cat", "parrot"), set this to "NON_HUMAN".
If the stated wearer is explicitly human (e.g., "student", "tall woman", "child", "baby", "men", "women"), set this to "HUMAN".
If no specific wearer is mentioned or if it is just an implied normal shopper (e.g., "I want a jacket", "show me shirts"), set this to "UNSPECIFIED".

requested_fashion_concept:
An occasion, style, use-case, theme, or context the user wants (e.g. "beach", "wedding", "work interview", "romantic dinner", "date night"). This is an open semantic field. It is NOT a concrete product type.

requested_product_type:
A concrete fashion product type explicitly requested (e.g. "shoes", "necklace", "loafers", "boots", "bag"). This is an open semantic field and may or may not currently exist in the catalog.

canonical_catalog_category:
Only a canonical value from AVAILABLE CATALOG CATEGORIES, or null.
Never invent categories. If the user asks for a specific fashion category,
semantically canonicalize it and output the EXACT category string from
AVAILABLE CATALOG CATEGORIES if it matches. Otherwise output null.
IMPORTANT: if the user names two categories (e.g. "blouse and skirt"),
output only the FIRST one here and put the second in
additional_requested_category. Never combine two categories into one
string in this field.

additional_requested_category:
When the user simultaneously names TWO distinct catalog categories in
one request (e.g. "a blouse and a skirt", "pants and jacket",
"shirts with trousers"), output the SECOND category here using the
exact same canonicalization rules as canonical_catalog_category —
it must be an EXACT string from AVAILABLE CATALOG CATEGORIES, or
null. Only populate this field when two clearly separate product
categories are present in the same request. Output null when only
one category is mentioned or when the second item is not in the
available categories list.
IMPORTANT: When you populate this field, canonical_catalog_category
MUST also be populated with the first category. Both must be separate
exact strings from AVAILABLE CATALOG CATEGORIES.

requested_department:
The requested department/gender if explicit or implied (e.g., "men", "women", "boys").

canonical_department:
Semantically canonicalize the requested department into the EXACT match from
`available_departments`. Natural variants must resolve to their canonical form:
man / male / boy / menswear → "men"
woman / female / girl / womenswear → "women"
husband → "men", wife → "women"
Do NOT map child / children / kid / kids / kidswear to "men" or "women" —
those are a separate scope and must be output as-is.
If they ask for a department NOT in the list, output their requested department.
If no department is requested, output null.

requested_brand:
The explicitly requested brand name (e.g. 'Nike', 'Cairo Thread Co.').

requested_material:
The explicitly requested material/fabric.

min_price:
The minimum numeric price (float).

max_price:
The maximum numeric price (float).

requires_catalog:
True only when product/catalog retrieval is needed.

chart_query_dimensions:
When resolved_intent is CURRENT_PRODUCT and the user is asking
about specific measurement values from the product size chart,
output a JSON array of the dimension terms being asked about.
Extract exactly the dimension concepts the user requested (e.g. chest, length, weight, etc).
Each element must be a SEPARATE string in the array, e.g.
["waist", "hip"] — NEVER combine into one string like "waist and hip".
Return null (not an empty array) if not a chart dimension question.

IMPORTANT: If the user asks for the FULL size chart (all sizes, all
measurements), set chart_query_dimensions to null and
chart_query_operation to "full". Do NOT invent dimension arrays.

If the user asks for a chart dimension that is not typically tracked,
still set chart_query_operation appropriately and put the requested
dimension string in the array — the system will handle absent fields.

Examples (all assume resolved_intent is CURRENT_PRODUCT):
- "what's max waist?" → ["waist"]
- "what's the maximum waist?" → ["waist"]
- "what's max waist and hip?" → ["waist", "hip"]
- "what's max waist and hip size?" → ["waist", "hip"]
- "what's the max chest measurement?" → ["chest"]
- "minimum chest size?" → ["chest"]
- "what's the chest range?" → ["chest"]
- "waist for XL?" → ["waist"]
- "what's the size chart?" → null (use chart_query_operation: "full")
- "show me the full size chart" → null (use chart_query_operation: "full")
- "what's max height?" → ["height"] (absent field — system handles it)
- "what's max weight?" → ["weight"] (absent field — system handles it)

chart_query_operation:
When the user asks about chart measurements, the type of query:
"max" (largest/maximum/biggest value), "min" (smallest/minimum value),
"range" (both min and max), "value" (look up for a specific size label),
"full" (user wants the complete size chart — all sizes and all dimensions),
"available_dimensions" (user asks what measurements/dimensions are included in the chart).
Return null if the query is not about the size chart at all.

Examples: "max waist" → "max", "minimum chest" → "min",
"waist range" → "range", "waist for M" → "value",
"what's the size chart?" → "full", "full chart" → "full",
"what measurements are in the size chart?" → "available_dimensions",
"what dimensions do you have?" → "available_dimensions".

chart_query_for_size:
When chart_query_operation is "value", the specific size label
being queried (e.g., "XL", "M", "S"). Return null otherwise.

catalog_meta_subject:
Only set when resolved_intent is CATALOG_META. Identifies what
catalog dimension the user is asking about:
- "BRANDS"                  — asks about available brands ("what brands do you have?")
- "CATEGORIES"              — asks about categories in general ("what categories do you carry?")
- "DEPARTMENTS"             — asks about departments/genders ("what genders do you have?")
- "CATEGORIES_FOR_DEPARTMENT" — asks about categories within a specific department ("what categories do you have for men?", "what do you carry for women?")
- null                      — general catalog capability question or not CATALOG_META

Examples:
- "What brands do you have?" → "BRANDS"
- "What categories do you carry?" → "CATEGORIES"
- "What genders do you have?" → "DEPARTMENTS"
- "What departments do you carry?" → "DEPARTMENTS"
- "Do you have clothes for men and women?" → "DEPARTMENTS"
- "What categories for men?" → "CATEGORIES_FOR_DEPARTMENT"
- "What do you carry for women?" → "CATEGORIES_FOR_DEPARTMENT"
- "What kinds of clothes do you sell?" → "CATEGORIES"
- "Is that all the jackets you have?" → "CATEGORIES"
""".strip()

    settings = get_settings()

    if not settings.deepseek_api_key:
        raise RuntimeError("Missing deepseek_api_key")

    client = AsyncOpenAI(
        api_key=settings.deepseek_api_key,
        base_url="https://api.deepseek.com",
    )

    try:
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": instruction,
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        context
                    ),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
        )

        content = (
            response.choices[0].message.content
            or ""
        )

        parsed = json.loads(
            _strip_json_fences(content)
        )

        return parsed

    except Exception as exc:
        logger.warning(
            "workflow_event=intent_classifier_failed "
            "trace_id=%s error=%s",
            state.get("trace_id"),
            type(exc).__name__,
        )
        raise exc


async def analyze_turn(
    state: FitState,
) -> FitState:
    query = (
        state.get("query")
        or _last_user_query(
            state.get("messages") or []
        )
    )

    state["query"] = query
    state.setdefault("requires_catalog", False)
    state.setdefault("requested_material", None)
    state.setdefault(
        "requested_price_range",
        None,
    )
    state.setdefault(
        "material_price_constrained",
        False,
    )

    pending_response = await _resolve_pending_state(
        state,
        query,
    )

    if pending_response:
        state["final_response"] = (
            pending_response
        )
        state["resolved_intent"] = (
            SemanticIntent.SIZING
        )
        state["requires_catalog"] = False

        return state

    if (
        query
        and _is_data_access_denied_question(
            query
        )
    ):
        state["final_response"] = (
            RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=_DATA_ACCESS_DENIED_REPLY,
                provider="STATIC-DATA-ACCESS-DENIED",
            )
        )

        state["resolved_intent"] = (
            SemanticIntent.OUT_OF_SCOPE
        )
        state["requires_catalog"] = False

        return state

    if state.get("force_sizing_intent"):
        state["resolved_intent"] = (
            SemanticIntent.SIZING
        )
        state["requires_catalog"] = False

        return state

    if not query:
        if state.get("intent") == "sizing":
            state["resolved_intent"] = (
                SemanticIntent.SIZING
            )
            state["requires_catalog"] = False
            return state

        if (
            state.get("product_id")
            and state.get("size_chart")
            and (
                state.get("user_measurements")
                or state.get("betas")
            )
        ):
            state["resolved_intent"] = (
                SemanticIntent.SIZING
            )
            state["requires_catalog"] = False

            return state

    # Business invariant: pure social acknowledgments are always GREETING.
    # These are universal language expressions — not catalog-specific phrases.
    # The LLM classifier is unreliable for short social phrases in long contexts
    # because surrounding shopping history biases it toward CONTINUATION/SIZING.
    # A social-phrase match here is a language rule, same as the deterministic
    # sizing math that bypasses the LLM for numeric chart questions.
    _SOCIAL_ACKS = frozenset({
        "thank you", "thanks", "ok", "okay", "wow", "great", "perfect",
        "got it", "nice", "cool", "alright", "noted", "yep", "yup",
    })
    _query_cleaned = query.strip().lower().rstrip("!.,? ")
    if _query_cleaned in _SOCIAL_ACKS:
        state["resolved_intent"] = SemanticIntent.GREETING
        state["requires_catalog"] = False
        state["_parsed_classification"] = {
            "resolved_intent": SemanticIntent.GREETING.value,
            "requires_catalog": False,
        }
        return state

    # Classifier: one retry on transient failures before emitting technical error.
    # Most intermittent failures (network timeout, API blip) resolve on a single retry.
    _cls_exc_final: Optional[Exception] = None
    parsed: dict = {}
    for _cls_attempt in range(2):
        try:
            import time as _time
            _t0 = _time.time()
            logger.info("workflow_event=classifier_start attempt=%d trace_id=%s", _cls_attempt, state.get("trace_id"))
            parsed = await _classify_intent_with_llm(state)
            logger.info("workflow_event=classifier_done attempt=%d duration=%.2fs", _cls_attempt, _time.time() - _t0)
            state["_debug_parsed"] = parsed
            logger.info("LLM PARSED: %s", parsed)
            _cls_exc_final = None
            break
        except Exception as _cls_exc:
            _cls_exc_final = _cls_exc
            logger.warning(
                "workflow_event=classifier_attempt_failed attempt=%d trace_id=%s error=%s: %s",
                _cls_attempt,
                state.get("trace_id"),
                type(_cls_exc).__name__,
                _cls_exc,
            )
            if _cls_attempt == 0:
                await asyncio.sleep(0.4)

    if _cls_exc_final is not None:
        # Both attempts failed — genuine provider/network failure.
        # This is INTERNAL: do not suggest the shopper's question was wrong.
        logger.warning(
            "workflow_event=classifier_failed_both_attempts trace_id=%s error=%s",
            state.get("trace_id"),
            type(_cls_exc_final).__name__,
        )
        state["final_response"] = RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message="I'm having trouble processing your request right now. Please try again in a moment.",
            provider="STATIC-DEGRADED",
        )
        return state

    resolved_intent_str = parsed.get("resolved_intent", SemanticIntent.PRODUCT_DISCOVERY.value)

    # Post-classifier correction: profile-ownership questions misclassified as
    # SELF_AWARENESS, CLARIFICATION, or CONTINUATION when sizing context is active.
    # "my [profile field]" has the USER as subject — always PROFILE.
    # This is a disambiguation rule, not a phrase match: the subject pronoun
    # decides the intent, regardless of what the previous turn was about.
    if resolved_intent_str in (
        SemanticIntent.SELF_AWARENESS.value,
        SemanticIntent.CLARIFICATION.value,
        SemanticIntent.CONTINUATION.value,
        SemanticIntent.CATALOG_META.value,
        SemanticIntent.PRODUCT_DISCOVERY.value,
    ):
        _q_low = query.strip().lower()
        _PROFILE_SUBJECTS = ("my name", "my measurement", "about me", "know me", "know about me")
        if any(_s in _q_low for _s in _PROFILE_SUBJECTS):
            resolved_intent_str = SemanticIntent.PROFILE.value
            parsed["resolved_intent"] = SemanticIntent.PROFILE.value

    # Deterministic department alias normalization — applied before any downstream
    # department read (AWAITING_DEPARTMENT resolution, validation, active_search merge).
    # Catches natural variants the LLM may emit inconsistently.
    # Kids/children/kidswear are intentionally absent and are NOT normalized here.
    for _dept_key in ("canonical_department", "requested_department"):
        _raw_dept = parsed.get(_dept_key)
        if _raw_dept:
            _normalized = _DEPT_ALIAS_MAP.get(_raw_dept.strip().lower())
            if _normalized:
                parsed[_dept_key] = _normalized

    if (
        (parsed.get("stated_wearer_type") == "NON_HUMAN")
        or (parsed.get("is_human_fashion_request") is False and not parsed.get("is_insufficient_for_retrieval"))
    ) and resolved_intent_str not in (
        SemanticIntent.GREETING.value,
        SemanticIntent.SELF_AWARENESS.value,
        SemanticIntent.PROFILE.value,
        # CATALOG_UNAVAILABLE already communicates "we don't carry it" — don't
        # override with a misleading scope message for items like childrenwear
        # that ARE human fashion but not in our catalog.
        # Children's clothing is human fashion (is_human_fashion_request: true
        # per classifier instruction), so it never reaches this guard.
        SemanticIntent.CATALOG_UNAVAILABLE.value,
    ):
        state["final_response"] = RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message="Manikan specializes in fashion for men and women. I can't help with that.",
            provider="STATIC-OUT-OF-SCOPE",
        )
        return state
    
    # Handle AWAITING_DEPARTMENT resolution cleanly
    pending_state = state.get("pending_state")
    if pending_state and pending_state.type == PendingType.AWAITING_DEPARTMENT:
        extracted_dept = parsed.get("canonical_department") or parsed.get("requested_department")
        # Check if they explicitly asked for a completely new category
        new_requested_category = parsed.get("canonical_catalog_category")
        new_requested_type = parsed.get("requested_product_type")
        active_search = state.get("active_search")
        
        # Robust validation: only break out of awaiting state if the user explicitly requested 
        # a DIFFERENT valid category. Ignore LLM hallucinations.
        is_same_category = True
        available_categories_list = [c.lower() for c in (state.get("available_categories") or [])]
        
        if active_search and active_search.selected_category:
            existing_cat = active_search.selected_category.lower()
            
            if new_requested_category:
                cat = new_requested_category.strip().lower()
                if cat != existing_cat and cat not in (extracted_dept or "") and cat in available_categories_list:
                    is_same_category = False
                    
            if new_requested_type:
                rtype = new_requested_type.strip().lower()
                if rtype != existing_cat and rtype not in (extracted_dept or ""):
                    if rtype in available_categories_list or any(rtype in c for c in available_categories_list):
                        is_same_category = False
        
        # If they just answered the department (even if the LLM hallucinated it into requested_category)
        # or if they gave a valid department and NO new category, resolve it!
        if extracted_dept and active_search and is_same_category:
            active_search.department = extracted_dept.strip().lower()
            # Sync state["selected_category"] from active_search so downstream
            # filtering (local catalog, remote RAG payload, structural fallback)
            # all enforce the original category constraint.  Mirrors what
            # AWAITING_CATEGORY resolution already does at its resolution site.
            if active_search.selected_category:
                state["selected_category"] = active_search.selected_category
            resolved_intent_str = SemanticIntent.PRODUCT_DISCOVERY.value
            parsed["requires_catalog"] = True

            # Clear stale fields so they don't override the pending search or falsely trigger CATALOG_UNAVAILABLE
            parsed["canonical_catalog_category"] = None
            parsed["requested_product_type"] = None
            parsed["requested_fashion_concept"] = None
            parsed["requested_brand"] = None
            parsed["requested_material"] = None
            parsed["is_continuation_from_clarification"] = True
            
            state["pending_state"] = None
        else:
            # Non-department turn. Only clear pending for new shopping requests
            # (PRODUCT_DISCOVERY, CATALOG_UNAVAILABLE). Preserve pending for
            # profile, self-awareness, sizing, social, and other interrupting
            # intents so the next turn can resume the shopping task.
            if resolved_intent_str not in _PENDING_PRESERVING_INTENTS:
                state["pending_state"] = None

    if pending_state and pending_state.type == PendingType.AWAITING_CATEGORY:
        # Check if they answered the category question
        new_requested_category = parsed.get("canonical_catalog_category")
        new_requested_type = parsed.get("requested_product_type")
        active_search = state.get("active_search")
        available_categories_list = [c.lower() for c in (state.get("available_categories") or [])]
        
        extracted_cat = None
        if new_requested_category and new_requested_category.strip().lower() in available_categories_list:
            extracted_cat = new_requested_category.strip().lower()
        elif new_requested_type:
            rtype = new_requested_type.strip().lower()
            if rtype in available_categories_list:
                extracted_cat = rtype
            else:
                for cat in available_categories_list:
                    if rtype in cat or cat in rtype:
                        extracted_cat = cat
                        break
        
        if extracted_cat and active_search:
            # We need to validate if this category is valid for the existing department!
            category_mapping = state.get("category_department_mapping") or {}
            valid_departments = category_mapping.get(extracted_cat, [])
            valid_departments = [d.lower() for d in valid_departments]
            
            # If the category is valid for the active department, or active department is None (unlikely here)
            if not active_search.department or active_search.department in valid_departments:
                active_search.selected_category = extracted_cat
                resolved_intent_str = SemanticIntent.PRODUCT_DISCOVERY.value
                parsed["requires_catalog"] = True
                
                parsed["canonical_catalog_category"] = extracted_cat
                parsed["requested_product_type"] = None
                parsed["requested_fashion_concept"] = None
                parsed["is_continuation_from_clarification"] = True
                state["selected_category"] = extracted_cat
                
                state["pending_state"] = None
            else:
                # User asked for a category that doesn't exist in the current department.
                # Treat as an interruption (new search)
                state["pending_state"] = None
        else:
            # No valid catalog category in this turn. Only clear pending for
            # new shopping requests (PRODUCT_DISCOVERY, CATALOG_UNAVAILABLE).
            # Profile, self-awareness, sizing, social, and other interrupting
            # intents preserve the pending task for the next turn to resume.
            if resolved_intent_str not in _PENDING_PRESERVING_INTENTS:
                state["pending_state"] = None


    # Handle CLARIFICATION explicitly
    if parsed.get("is_insufficient_for_retrieval") and not state.get("active_search") and resolved_intent_str not in (SemanticIntent.GREETING.value, SemanticIntent.SELF_AWARENESS.value):
        resolved_intent_str = SemanticIntent.CLARIFICATION.value

    # Authoritative Catalog Extraction
    available_departments = [d.lower() for d in (state.get("available_departments") or [])]
    available_brands = [b.lower() for b in (state.get("available_brands") or [])]

    
    # Brand Validation — skip for CATALOG_META: asking about brands IS the query,
    # not a product search that requires the brand to exist.
    requested_brand = parsed.get("requested_brand")
    if requested_brand and resolved_intent_str != SemanticIntent.CATALOG_META.value:
        requested_brand = requested_brand.strip().lower()
        if available_brands and not any(requested_brand in b or b in requested_brand for b in available_brands):
            resolved_intent_str = SemanticIntent.CATALOG_UNAVAILABLE.value

    # Department Validation — skip for CATALOG_META: the user is asking WHETHER a
    # department exists, so the answer must come from CATALOG_META handler (with real
    # catalog facts), not a hard CATALOG_UNAVAILABLE rejection before that handler fires.
    requested_department = parsed.get("requested_department")
    canonical_department = parsed.get("canonical_department")
    if resolved_intent_str != SemanticIntent.CATALOG_META.value:
        if canonical_department:
            canonical_department = canonical_department.strip().lower()
            if available_departments and canonical_department not in available_departments:
                resolved_intent_str = SemanticIntent.CATALOG_UNAVAILABLE.value
        elif requested_department:
            # Fallback if the LLM populated requested but not canonical
            if available_departments and requested_department.strip().lower() not in available_departments:
                resolved_intent_str = SemanticIntent.CATALOG_UNAVAILABLE.value

    # Deterministic Category Validation & Semantic Concept Routing
    requested_category = parsed.get("canonical_catalog_category")
    requested_product_type = parsed.get("requested_product_type")
    requested_fashion_concept = parsed.get("requested_fashion_concept")
    
    if resolved_intent_str != SemanticIntent.CATALOG_UNAVAILABLE.value:
        available_categories = [c.lower() for c in (state.get("available_categories") or [])]

        # Compound-phrase guard: the LLM may return "blouse and skirt" as a single
        # canonical_catalog_category or requested_product_type instead of splitting
        # it into canonical + additional_requested_category.  Detect and pre-split
        # before entering the branch logic so the multi-category path can fire.
        _compound_src = (
            (parsed.get("canonical_catalog_category") or "").strip().lower()
            or (parsed.get("requested_product_type") or "").strip().lower()
        )
        if _compound_src and not parsed.get("additional_requested_category"):
            _compound_split = _split_compound_to_categories(_compound_src, available_categories)
            if len(_compound_split) >= 2:
                parsed["canonical_catalog_category"] = _compound_split[0]
                parsed["additional_requested_category"] = _compound_split[1]
                parsed["requested_product_type"] = None
                requested_category = _compound_split[0]
                requested_product_type = None
            elif len(_compound_split) == 1 and _compound_src not in available_categories:
                # Single valid category recovered from compound phrasing
                parsed["canonical_catalog_category"] = _compound_split[0]
                parsed["requested_product_type"] = None
                requested_category = _compound_split[0]
                requested_product_type = None

        def _resolve_effective_department_for_category(cat: str) -> tuple[Optional[str], bool, Optional[str]]:
            explicit_dept = parsed.get("canonical_department") or parsed.get("requested_department")
            explicit_dept = explicit_dept.strip().lower() if explicit_dept else None
            mapping = state.get("category_department_mapping") or {}
            valid_depts = _map_get_departments(mapping, cat)
            if valid_depts is not None:
                valid_depts = [d.lower() for d in valid_depts]
            if explicit_dept:
                if valid_depts is not None and explicit_dept not in valid_depts:
                    return None, True, explicit_dept
                return explicit_dept, False, None
            if valid_depts and len(valid_depts) == 1:
                return valid_depts[0], False, None
            return None, False, None

        if requested_category:
            # A) A valid canonical category exists
            requested_category = requested_category.strip().lower()
            # Plural normalization before exact-match check: "Shirts" → "shirt"
            # when "shirt" is in available_categories but "shirts" is not.
            if requested_category not in available_categories:
                _stripped = requested_category.rstrip("s")
                if _stripped and _stripped in available_categories:
                    requested_category = _stripped
            if requested_category in available_categories:
                eff_dept, is_incompat, failed_dept = _resolve_effective_department_for_category(requested_category)
                if is_incompat:
                    parsed["canonical_catalog_category"] = None
                    resolved_intent_str = SemanticIntent.CATALOG_UNAVAILABLE.value
                    
                    state["final_response"] = RecommendationOutput(
                        action=ActionType.PROVIDE_RECOMMENDATION,
                        message=f"We carry {requested_category}, but we don't currently have any for {failed_dept}.",
                        provider="STATIC-UNAVAILABLE",
                    )
                    requested_category = None
                    return state

                if requested_category:
                    state["selected_category"] = requested_category
                    if eff_dept:
                        parsed["canonical_department"] = eff_dept

                # Multi-category: user named a second distinct valid category.
                # Do NOT silently pick one — ask which to browse first.
                _additional_raw = parsed.get("additional_requested_category")
                if _additional_raw:
                    _additional_cat = _additional_raw.strip().lower()
                    if _additional_cat in available_categories and _additional_cat != requested_category:
                        eff_dept_add, is_incompat_add, _ = _resolve_effective_department_for_category(_additional_cat)
                        if not is_incompat_add:
                            from app.schemas import ActiveSearch
                            _multi_search = ActiveSearch(
                                query=query,
                                department=eff_dept_add,
                                selected_category=None,
                                requested_material=parsed.get("requested_material"),
                                style_occasion=parsed.get("requested_fashion_concept"),
                            )
                            if parsed.get("min_price") is not None:
                                _multi_search.min_price = float(parsed["min_price"])
                            if parsed.get("max_price") is not None:
                                _multi_search.max_price = float(parsed["max_price"])
                            state["active_search"] = _multi_search
                            state["selected_category"] = None
                            state["shown_product_ids"] = []
                            state["pending_state"] = PendingState(type=PendingType.AWAITING_CATEGORY)
                            state["final_response"] = RecommendationOutput(
                                action=ActionType.PROVIDE_RECOMMENDATION,
                                message=(
                                    f"Both {requested_category} and {_additional_cat} are available. "
                                    f"Which would you like to browse first?"
                                ),
                                provider="STATIC-CLARIFICATION",
                            )
                            state["requires_catalog"] = False
                            return state
            else:
                # Discard the invented/unresolved canonical value
                parsed["canonical_catalog_category"] = None
                resolved_intent_str = SemanticIntent.CATALOG_UNAVAILABLE.value

        elif requested_product_type:
            # B) No canonical category + requested_product_type exists.
            # Use generic text normalization (collapse punctuation/case) to match
            # surface variants like "tshirt"→"t-shirt", "blouses"→"blouse", etc.
            # This avoids false CATALOG_UNAVAILABLE on LLM canonicalization failures.
            req_type = requested_product_type.strip().lower()
            norm_req = _normalize_category_text(req_type)
            # Build normalized lookup table for available categories
            norm_cat_map = {
                _normalize_category_text(c): c
                for c in available_categories
            }
            matched_category = norm_cat_map.get(norm_req)
            if not matched_category:
                # Trailing-s plural normalization: "shirts"→"shirt", "tshirts"→"tshirt"
                for norm_cat, orig_cat in norm_cat_map.items():
                    if norm_req.rstrip("s") == norm_cat or norm_req == norm_cat.rstrip("s"):
                        matched_category = orig_cat
                        break

            if matched_category:
                eff_dept, is_incompat, failed_dept = _resolve_effective_department_for_category(matched_category)
                if is_incompat:
                    parsed["canonical_catalog_category"] = None
                    resolved_intent_str = SemanticIntent.CATALOG_UNAVAILABLE.value
                    state["final_response"] = RecommendationOutput(
                        action=ActionType.PROVIDE_RECOMMENDATION,
                        message=f"We carry {matched_category}, but we don't currently have any for {failed_dept}.",
                        provider="STATIC-UNAVAILABLE",
                    )
                    matched_category = None
                    return state

                if matched_category:
                    state["selected_category"] = matched_category
                    parsed["canonical_catalog_category"] = matched_category
                    if eff_dept:
                        parsed["canonical_department"] = eff_dept

                # Multi-category via product_type path: check for second category.
                _additional_raw = parsed.get("additional_requested_category")
                if _additional_raw:
                    _additional_cat = _additional_raw.strip().lower()
                    if _additional_cat in available_categories and _additional_cat != matched_category:
                        eff_dept_add, is_incompat_add, _ = _resolve_effective_department_for_category(_additional_cat)
                        if not is_incompat_add:
                            from app.schemas import ActiveSearch
                            _multi_search = ActiveSearch(
                                query=query,
                                department=eff_dept_add,
                                selected_category=None,
                                requested_material=parsed.get("requested_material"),
                                style_occasion=parsed.get("requested_fashion_concept"),
                            )
                            if parsed.get("min_price") is not None:
                                _multi_search.min_price = float(parsed["min_price"])
                            if parsed.get("max_price") is not None:
                                _multi_search.max_price = float(parsed["max_price"])
                            state["active_search"] = _multi_search
                            state["selected_category"] = None
                            state["shown_product_ids"] = []
                            state["pending_state"] = PendingState(type=PendingType.AWAITING_CATEGORY)
                            state["final_response"] = RecommendationOutput(
                                action=ActionType.PROVIDE_RECOMMENDATION,
                                message=(
                                    f"Both {matched_category} and {_additional_cat} are available. "
                                    f"Which would you like to browse first?"
                                ),
                                provider="STATIC-CLARIFICATION",
                            )
                            state["requires_catalog"] = False
                            return state
            else:
                # Concrete product type with no catalog match.
                # If a department is already established, the user is browsing
                # a gender's catalog generally — fall through as PRODUCT_DISCOVERY
                # so the category-clarification branch can ask which category.
                # If no department context exists, the product type genuinely isn't
                # carried → CATALOG_UNAVAILABLE.
                _has_dept_ctx = (
                    parsed.get("requested_department")
                    or parsed.get("canonical_department")
                )
                if not _has_dept_ctx:
                    parsed["canonical_catalog_category"] = None
                    resolved_intent_str = SemanticIntent.CATALOG_UNAVAILABLE.value
                # else: department known, unmatched product type → fall through as
                # PRODUCT_DISCOVERY; category-clarification branch will ask.

        elif requested_fashion_concept:
            # C) No category + no product type + requested_fashion_concept exists
            # PRODUCT_DISCOVERY, do NOT perform category-unavailable rejection.
            pass
            
        else:
            # D) No category/type/concept
            pass



    # RC-E: Product Chat cross-category enforcement.
    # When a product is open (product_id present) and PRODUCT_DISCOVERY targets a
    # DIFFERENT category, redirect politely rather than retrieving the wrong category.
    if (
        state.get("product_id")
        and resolved_intent_str == SemanticIntent.PRODUCT_DISCOVERY.value
        and state.get("selected_category")
    ):
        _current_prd = _find_product_by_id(
            state.get("product_id"), state.get("catalog_products")
        )
        if _current_prd:
            _current_cat = str(_current_prd.get("category", "")).lower()
            _req_cat = str(state.get("selected_category", "")).lower()
            if _current_cat and _req_cat and _current_cat != _req_cat:
                _prd_label = state.get("product_name") or _current_prd.get("name") or "this item"
                state["final_response"] = RecommendationOutput(
                    action=ActionType.PROVIDE_RECOMMENDATION,
                    message=(
                        f"While I'm focused on {_prd_label} right now, "
                        f"I can't browse other categories from here. "
                        f"To explore {state['selected_category']}, head to the main store "
                        f"or use the search — I can help you there. "
                        f"In the meantime, I can find similar {_current_cat}s, "
                        f"check sizing, or answer questions about this item."
                    ),
                    provider="STATIC-PRODUCT-SCOPE",
                )
                state["requires_catalog"] = False
                return state

    # Clarification for missing department
    current_active_search = state.get("active_search")
    inherited_department = current_active_search.department if current_active_search else None
    effective_department = requested_department or inherited_department

    if resolved_intent_str == SemanticIntent.PRODUCT_DISCOVERY and not effective_department and not state.get("product_id") and available_departments:
        category_mapping = state.get("category_department_mapping") or {}
        selected_category = state.get("selected_category")
        
        # New Rule: Infer department if category exists in exactly one department
        needs_clarification = True
        if selected_category:
            valid_departments = _map_get_departments(category_mapping, selected_category)
            if valid_departments is not None and len(valid_departments) == 1:
                parsed["requested_department"] = valid_departments[0].lower()
                needs_clarification = False

        if needs_clarification:
            # We MUST create active_search so the next turn can resume the original discovery!
            from app.schemas import ActiveSearch
            new_active_search = ActiveSearch(
                query=query,
                department=None,
                selected_category=state.get("selected_category"),
                requested_material=parsed.get("requested_material"),
                style_occasion=parsed.get("requested_fashion_concept")
            )
            if parsed.get("min_price") is not None:
                new_active_search.min_price = float(parsed["min_price"])
            if parsed.get("max_price") is not None:
                new_active_search.max_price = float(parsed["max_price"])
            state["active_search"] = new_active_search
            state["shown_product_ids"] = []

            state["pending_state"] = PendingState(type=PendingType.AWAITING_DEPARTMENT)
            # Build a natural, context-aware department question using dynamic catalog
            # departments and any fashion concept the user mentioned (e.g. "wedding").
            _concept_for_dept = parsed.get("requested_fashion_concept")
            _dept_names = available_departments if available_departments else ["womenswear", "menswear"]
            _dept_labels = " or ".join(f"{d}swear" if not d.endswith("swear") else d for d in _dept_names)
            if _concept_for_dept:
                _dept_question = (
                    f"I'd love to help you find something for {_concept_for_dept}! "
                    f"Are you shopping for {_dept_labels}?"
                )
            else:
                _dept_question = f"Are you shopping for {_dept_labels}?"
            state["final_response"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=_dept_question,
                provider="STATIC-CLARIFICATION",
            )
            state["requires_catalog"] = False
            return state

    # Clarification for missing category — fires for any department-only discovery.
    selected_category = state.get("selected_category")
    # Business invariant: PRODUCT_DISCOVERY with a known department but no category
    # must always ask which category to browse. RAG without a category would return
    # arbitrary products — the deterministic layer decides WHAT to retrieve.
    _needs_category_clarification = (
        resolved_intent_str == SemanticIntent.PRODUCT_DISCOVERY
        and not selected_category
        and effective_department
        and not state.get("product_id")
    )
    if _needs_category_clarification:
        # We have a department but NO category. Ask which category.
        category_mapping = state.get("category_department_mapping") or {}
        valid_cats = [c for c, depts in category_mapping.items() if effective_department in [d.lower() for d in depts]]

        if valid_cats:
            from app.schemas import ActiveSearch
            new_active_search = ActiveSearch(
                query=query,
                department=effective_department,
                selected_category=None,
                requested_material=parsed.get("requested_material"),
                style_occasion=parsed.get("requested_fashion_concept")
            )
            if parsed.get("min_price") is not None:
                new_active_search.min_price = float(parsed["min_price"])
            if parsed.get("max_price") is not None:
                new_active_search.max_price = float(parsed["max_price"])

            state["active_search"] = new_active_search
            state["shown_product_ids"] = []

            state["pending_state"] = PendingState(type=PendingType.AWAITING_CATEGORY)

            # Natural, context-aware category question — uses fashion concept if present
            # and dynamic category list for the chosen department (never hardcoded).
            cats_list = ", ".join(valid_cats)
            _concept_for_cat = parsed.get("requested_fashion_concept") or (
                new_active_search.style_occasion if new_active_search else None
            )
            if _concept_for_cat:
                options_text = (
                    f"For {_concept_for_cat} in {effective_department}'s fashion, "
                    f"we carry: {cats_list}. What would you like to look for?"
                )
            else:
                options_text = (
                    f"What kind of {effective_department}'s item are you looking for? "
                    f"We have: {cats_list}."
                )

            state["final_response"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=options_text,
                provider="STATIC-CLARIFICATION",
            )
            state["requires_catalog"] = False
            return state


    try:
        resolved_intent = SemanticIntent(resolved_intent_str)
    except ValueError:
        # LLM returned an unrecognized intent string. Do NOT invent shopping intent.
        # CLARIFICATION is the safe fallback: asks the user to rephrase, no RAG,
        # no product fetch, no false PRODUCT_DISCOVERY routing.
        logger.warning(
            "workflow_event=invalid_intent_value trace_id=%s value=%r — defaulting to CLARIFICATION",
            state.get("trace_id"),
            resolved_intent_str,
        )
        resolved_intent = SemanticIntent.CLARIFICATION

    requires_catalog = bool(
        parsed.get(
            "requires_catalog",
            resolved_intent in {
                SemanticIntent.PRODUCT_DISCOVERY,
                SemanticIntent.CONTINUATION,
            },
        )
    )

    # CATALOG_META is handled deterministically from authoritative state data.
    # Force requires_catalog=False regardless of what the LLM returned — no RAG needed.
    if resolved_intent == SemanticIntent.CATALOG_META:
        requires_catalog = False

    requested_material = parsed.get("requested_material")
    if requested_material is not None:
        requested_material = str(requested_material).strip().lower() or None

    state["resolved_intent"] = resolved_intent
    state["requires_catalog"] = requires_catalog
    state["requested_material"] = requested_material
    
    state["_parsed_classification"] = parsed

    if (
        resolved_intent
        == SemanticIntent.OUT_OF_SCOPE
    ):
        state["final_response"] = (
            RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=_OUT_OF_SCOPE_REPLY,
                provider="STATIC-OUT-OF-SCOPE",
            )
        )
        return state
        
    if resolved_intent == SemanticIntent.CATALOG_UNAVAILABLE:
        # Use the most specific available concept. When a whole department/gender is
        # unavailable (e.g. "children") use "<dept>'s clothing" rather than "that item".
        _dept_unavail = (
            parsed.get("canonical_department") or parsed.get("requested_department") or ""
        ).strip().lower().rstrip("swear").rstrip("wear") or None
        concept = (
            parsed.get("requested_fashion_concept")
            or parsed.get("requested_brand")
            or parsed.get("requested_product_type")
            or (_dept_unavail + "'s clothing" if _dept_unavail else None)
            or "that item"
        )
        state["final_response"] = RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message=f"I'm sorry, but we don't currently carry {concept} in our catalog.",
            provider="STATIC-UNAVAILABLE",
        )
        return state

    # PROFILE: let fit_reasoning_agent answer field-specifically using LLM
    # with authoritative profile facts, rather than a static dump of all data.
    # requires_catalog was already set to False above for PROFILE.

    return state


async def _retrieve_local_candidates(
    query: str,
    catalog_products: list[dict],
    top_k: int,
) -> list[dict]:
    if not catalog_products:
        return []

    expanded_k = max(
        top_k,
        len(catalog_products),
    )

    try:
        products = await asyncio.to_thread(
            retrieve_relevant_products,
            query,
            catalog_products,
            top_k=expanded_k,
        )

    except TypeError:
        products = await asyncio.to_thread(
            retrieve_relevant_products,
            query,
            catalog_products,
        )

    return [
        product
        for product in products
        if isinstance(product, dict)
    ]


async def retrieve_rag_context(
    state: FitState,
) -> FitState:
    if state.get("final_response"):
        return state

    query = state.get("query", "")
    intent = state.get("resolved_intent")

    parsed = state.get("_parsed_classification", {})
    active_search = state.get("active_search")

    if intent == SemanticIntent.CONTINUATION and active_search:
        retrieval_query = active_search.query if active_search.query else query

        # Merge new constraints if provided
        if parsed.get("requested_material"):
            active_search.requested_material = str(parsed["requested_material"]).strip().lower()
        if parsed.get("min_price") is not None:
            active_search.min_price = float(parsed["min_price"])
        if parsed.get("max_price") is not None:
            active_search.max_price = float(parsed["max_price"])
        if parsed.get("requested_department"):
            active_search.department = str(parsed["requested_department"]).strip().lower()
        if state.get("selected_category"):
            active_search.selected_category = state["selected_category"]

        # The widget always sends selected_category: null (never persists it across
        # turns). Restore the effective category from active_search so that the
        # _filtered_catalog category guard and the remote search category payload
        # both use the correct constraint — without this, CONTINUATION searches
        # skip the category filter and can return wrong-category products or fail
        # to find the correct unseen batch (false exhaustion).
        if active_search.selected_category and not state.get("selected_category"):
            state["selected_category"] = active_search.selected_category
            
        requested_material = active_search.requested_material
        min_price = active_search.min_price
        max_price = active_search.max_price
        requested_price_range = (min_price, max_price) if min_price is not None and max_price is not None else None
    else:
        retrieval_query = query
        requested_material = state.get("requested_material")
        min_price = parsed.get("min_price")
        max_price = parsed.get("max_price")
        
        if min_price is None and max_price is None:
            requested_price_range = _extract_price_constraint(retrieval_query) if retrieval_query else None
            if requested_price_range:
                min_price, max_price = requested_price_range
        else:
            requested_price_range = (float(min_price) if min_price is not None else 0.0, float(max_price) if max_price is not None else float('inf'))

        if intent in (SemanticIntent.PRODUCT_DISCOVERY, SemanticIntent.CATALOG_META):
            if not parsed.get("is_continuation_from_clarification"):
                _prior_search = state.get("active_search")
                
                current_cat = state.get("selected_category")
                prior_cat = _prior_search.selected_category if _prior_search else None
                is_new_category = bool(current_cat and current_cat != prior_cat)

                if is_new_category:
                    extracted_department = parsed.get("canonical_department") or parsed.get("requested_department")
                else:
                    extracted_department = (
                        parsed.get("canonical_department")
                        or parsed.get("requested_department")
                        or (_prior_search.department if _prior_search else None)
                    )

                new_active_search = ActiveSearch(
                    query=retrieval_query,
                    department=extracted_department,
                    selected_category=state.get("selected_category"),
                    requested_material=requested_material,
                )
                if requested_price_range:
                    new_active_search.min_price = requested_price_range[0]
                    new_active_search.max_price = requested_price_range[1]
                state["active_search"] = new_active_search
                state["shown_product_ids"] = []
            else:
                # The active_search was perfectly merged during clarification resolution.
                # Just ensure retrieval_query uses the preserved query so we don't search for "men".
                current_active_search = state.get("active_search")
                if current_active_search and current_active_search.query:
                    retrieval_query = current_active_search.query

    state["requested_price_range"] = requested_price_range

    retrieved: list[dict] = []

    catalog_products = (
        state.get("catalog_products")
        or []
    )

    active_search_obj = state.get("active_search")

    # RC-E: Enforce Product Chat category scope at retrieval level.
    # When a product is open, constrain retrieval to that product's category so
    # a classify error or intent slip cannot retrieve a different category.
    if state.get("product_id"):
        _pc_product = _find_product_by_id(
            state.get("product_id"), state.get("catalog_products")
        )
        if _pc_product and _pc_product.get("category"):
            _pc_cat = str(_pc_product["category"]).lower()
            if not state.get("selected_category"):
                state["selected_category"] = _pc_cat
            if active_search_obj and not active_search_obj.selected_category:
                active_search_obj.selected_category = _pc_cat

    def _is_eligible(p: dict) -> bool:
        if active_search_obj and active_search_obj.department:
            p_dept = (p.get("department") or p.get("gender") or "").lower()
            if p_dept != active_search_obj.department.lower():
                return False
        if state.get("selected_category"):
            if str(p.get("category", "")).lower() != state.get("selected_category").lower():
                return False
        if parsed.get("requested_brand"):
            if str(p.get("brand", "")).lower() != parsed.get("requested_brand").lower():
                return False
        return True

    _filtered_catalog = [p for p in catalog_products if _is_eligible(p)]

    if (
        requested_material
        or requested_price_range
    ):
        constrained_catalog = (
            _filter_catalog_by_material_and_price(
                _filtered_catalog,
                requested_material,
                requested_price_range,
            )
        )

        state["material_price_constrained"] = True

    else:
        constrained_catalog = (
            _filtered_catalog
        )

    shown_ids = set(
        state.get("shown_product_ids")
        or []
    )
    # Business invariant: when browsing similar alternatives from a product page,
    # the currently viewed product must never appear in the results.
    _current_pid = state.get("product_id")
    if _current_pid and intent == SemanticIntent.PRODUCT_DISCOVERY:
        shown_ids.add(_current_pid)

    settings = get_settings()

    # In Compose, RAG should use Store's private service DNS. Keep the
    # existing STORE_BASE_URL behavior when no explicit service override is
    # configured so local development remains unchanged.
    store_rag_base_url = (
        settings.store_service_base_url
        or settings.store_base_url
    )

    if (
        intent != SemanticIntent.CATALOG_META
        and store_rag_base_url
        and retrieval_query
    ):
        try:
            url = (
                f"{store_rag_base_url}"
                "/api/products/search"
            )

            payload = {
                "queryText": retrieval_query,
            }

            if state.get(
                "selected_category"
            ):
                payload["category"] = (
                    state["selected_category"]
                )
                
            active_search_obj = state.get("active_search")
            if active_search_obj and active_search_obj.department:
                payload["gender"] = active_search_obj.department

            headers = {}
            if settings.recommend_service_key:
                headers["X-Manikan-Internal-Key"] = settings.recommend_service_key

            async with httpx.AsyncClient(
                timeout=(
                    settings
                    .store_service_rag_timeout_seconds
                )
            ) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers=headers,
                )

                response.raise_for_status()

                data = response.json()

            products = data.get(
                "products",
                [],
            )

            if isinstance(products, list):
                retrieved = [
                    product
                    for product in products
                    if isinstance(product, dict) and _is_eligible(product)
                ]

            _trace(
                state,
                "rag_store_complete",
                candidates=len(retrieved),
            )

        except (
            httpx.HTTPError,
            ValueError,
            TypeError,
        ) as exc:
            logger.warning(
                "workflow_event=rag_store_failed "
                "trace_id=%s error=%s",
                state.get("trace_id"),
                type(exc).__name__,
            )

    if (
        requested_material
        or requested_price_range
    ):
        retrieved = (
            _filter_catalog_by_material_and_price(
                retrieved,
                requested_material,
                requested_price_range,
            )
        )

    if (
        intent == SemanticIntent.CONTINUATION
        and shown_ids
    ):
        retrieved = [
            product
            for product in retrieved
            if product.get("id")
            not in shown_ids
        ]

    desired_page_size = 4

    if (
        intent != SemanticIntent.CATALOG_META
        and len(retrieved)
        < desired_page_size
        and constrained_catalog
        and retrieval_query
    ):
        local_candidates = (
            await _retrieve_local_candidates(
                retrieval_query,
                constrained_catalog,
                top_k=max(
                    desired_page_size * 3,
                    12,
                ),
            )
        )

        existing_ids = {
            product.get("id")
            for product in retrieved
            if product.get("id")
        }

        for product in local_candidates:
            product_id = product.get("id")

            if (
                intent
                == SemanticIntent.CONTINUATION
                and product_id
                in shown_ids
            ):
                continue

            if (
                product_id
                and product_id
                in existing_ids
            ):
                continue

            retrieved.append(product)

            if product_id:
                existing_ids.add(
                    product_id
                )

        _trace(
            state,
            "rag_local_complete",
            candidates=len(
                local_candidates
            ),
        )

    # Structural-filter fallback: when TF-IDF scored everything below threshold
    # but the structural filters (category + department + price) already narrowed
    # the catalog to relevant products, return those directly. This handles
    # plural/stemming mismatches (e.g. "skirts"→"skirt") in the TF-IDF layer.
    if not retrieved and constrained_catalog and intent != SemanticIntent.CATALOG_META:
        existing_ids = {p.get("id") for p in retrieved if p.get("id")}
        for product in constrained_catalog:
            pid = product.get("id")
            if intent == SemanticIntent.CONTINUATION and pid in shown_ids:
                continue
            if pid and pid in existing_ids:
                continue
            retrieved.append(product)

    if (
        intent
        == SemanticIntent.CONTINUATION
    ):
        retrieved = [
            product
            for product in retrieved
            if product.get("id")
            not in shown_ids
        ]

    retrieved = retrieved[
        :desired_page_size
    ]

    state["retrieved_products"] = (
        retrieved
    )

    _trace(
        state,
        "rag_complete",
        intent=(
            intent.value
            if isinstance(
                intent,
                SemanticIntent,
            )
            else str(intent)
        ),
        shown_count=len(shown_ids),
        returned_count=len(
            retrieved
        ),
    )

    return state


async def compute_size_math(
    state: FitState,
) -> FitState:
    if state.get("final_response"):
        return state

    if (
        state.get("resolved_intent")
        != SemanticIntent.SIZING
        and not state.get(
            "force_sizing_intent"
        )
    ):
        state["size_math_result"] = None
        return state

    measurements = (
        state.get("user_measurements")
        or state.get("betas")
    )

    chart_raw = state.get(
        "size_chart"
    )

    if not chart_raw:
        product = _find_product_by_id(
            state.get("product_id"),
            state.get(
                "retrieved_products"
            ),
        )

        if (
            product
            and isinstance(
                product.get("variants"),
                list,
            )
        ):
            chart_raw = json.dumps(
                _chart_from_variants(
                    product["variants"]
                )
            )

    if not state.get("product_id"):
        state["size_math_result"] = None
        return state

    if not measurements or not chart_raw:
        state["size_math_result"] = None
        return state

    result = await asyncio.to_thread(
        compute_recommended_size,
        measurements,
        chart_raw,
    )

    deltas: dict[str, float] = {}

    try:
        chart = json.loads(
            chart_raw
        )

        selected = next(
            (
                row
                for row in chart
                if row.get("size")
                == result.recommended_size
            ),
            {},
        )

        fields = (
            (
                "chest_cm",
                measurements.chest_cm,
            ),
            (
                "waist_cm",
                measurements.waist_cm,
            ),
            (
                "hip_cm",
                measurements.hips_cm,
            ),
        )

        for field, user_value in fields:
            chart_value = selected.get(
                field
            )

            if isinstance(
                chart_value,
                (int, float),
            ):
                deltas[field] = round(
                    chart_value
                    - user_value,
                    1,
                )

    except (
        json.JSONDecodeError,
        TypeError,
        AttributeError,
    ):
        pass

    state["size_math_result"] = (
        SizeMathResult(
            recommended_size=(
                result.recommended_size
            ),
            confidence_score=(
                result.confidence_score
            ),
            dimension_deltas=deltas,
            available_sizes=(
                result.available_sizes
            ),
            is_out_of_range=(
                result.is_out_of_range
            ),
        ).__dict__
    )

    _trace(
        state,
        "size_math_complete",
        recommended_size=(
            result.recommended_size
        ),
        out_of_range=(
            result.is_out_of_range
        ),
    )

    return state


def _deterministic_size_response(
    state: FitState,
) -> Optional[RecommendationOutput]:
    math = state.get(
        "size_math_result"
    )

    if not math:
        return None

    if (
        math.get("recommended_size")
        and not math.get(
            "is_out_of_range"
        )
    ):
        confidence = (
            math.get(
                "confidence_score"
            )
            or 0.0
        )

        return RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            recommended_size=math[
                "recommended_size"
            ],
            confidence_score=confidence,
            explanation=(
                "The recommendation comes "
                "from the product's "
                "authoritative size chart."
            ),
            message=(
                f"Based on this product's exact size chart and your measurements, "
                f"I recommend a size {math['recommended_size']}. "
                f"I'm {round(confidence * 100)}% confident this will be your best fit!"
            ),
            provider="STATIC-CALC",
        )

    return RecommendationOutput(
        action=ActionType.PROVIDE_RECOMMENDATION,
        message=(
            "Based on your measurements, I couldn't find a size in this "
            "product's chart that would be a perfect fit. You might want to "
            "check the detailed size chart or look for a different style."
        ),
        provider="STATIC-CALC",
    )


def _answer_current_product_fact(
    state: FitState,
) -> Optional[RecommendationOutput]:
    query = (
        state.get("query")
        or ""
    ).lower()

    product = _find_product_by_id(
        state.get("product_id"),
        state.get("catalog_products"),
    )

    size_labels = (
        _available_size_labels(
            state.get("size_chart")
        )
    )

    if (
        "size" in query
        and (
            "available" in query
            or "come in" in query
            or "sizes" in query
        )
        and size_labels
    ):
        return RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message=(
                "This item is available in: "
                + ", ".join(
                    size_labels
                )
                + "."
            ),
            provider="STATIC-CURRENT-PRODUCT",
        )

    if not product:
        return None

    if (
        "material" in query
        or "fabric" in query
        or "composition" in query
        or "made of" in query
        or "made from" in query
    ):
        fabric = product.get("fabric") or None  # normalize "" → None
        if fabric:
            return RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=f"This item is made from {fabric}.",
                provider="STATIC-CURRENT-PRODUCT",
            )
        else:
            # Deterministic owner: prevents generic LLM fallback for material questions
            # when the field is absent — fabric may not be supplied for all products.
            return RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message="Material information is not provided for this item.",
                provider="STATIC-CURRENT-PRODUCT",
            )

    if "brand" in query:
        brand = product.get(
            "brand"
        )

        if brand:
            return RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=(
                    f"This item is by "
                    f"{brand}."
                ),
                provider="STATIC-CURRENT-PRODUCT",
            )

    if (
        "describe" in query
        or "description" in query
        or "tell me about" in query
    ):
        description = product.get(
            "description"
        )

        if description:
            return RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=str(
                    description
                ),
                provider="STATIC-CURRENT-PRODUCT",
            )

    # Gender / department handler — uses field names, not example phrases.
    # Absent field → deterministic "not specified" prevents LLM from inventing
    # "works for anyone" or other fabricated gender claims.
    _asks_gender = (
        "gender" in query
        or "department" in query
        or ("who" in query and "for" in query)
    )
    if _asks_gender:
        dept = product.get("department") or product.get("gender")
        if dept:
            return RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=f"This item is from the {dept.lower()} department.",
                provider="STATIC-CURRENT-PRODUCT",
            )
        else:
            return RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message="Department or gender information is not specified for this item.",
                provider="STATIC-CURRENT-PRODUCT",
            )

    # Broad product information request — synthesize all available fields.
    if (
        "detail" in query
        or "info" in query
        or "measurement" in query
    ):
        parts: list[str] = []
        description = product.get("description")
        fabric = product.get("fabric")
        brand = product.get("brand")
        if description:
            parts.append(description)
        if fabric:
            parts.append(f"Material: {fabric}")
        if brand:
            parts.append(f"Brand: {brand}")
        if size_labels:
            parts.append(f"Available sizes: {', '.join(size_labels)}")
        if parts:
            return RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message="\n\n".join(parts),
                provider="STATIC-CURRENT-PRODUCT",
            )

    return None


def _catalog_meta_response(
    state: FitState,
) -> RecommendationOutput:
    products = state.get("catalog_products") or []
    parsed_cls = state.get("_parsed_classification") or {}

    # Authoritative brand list: DB-sourced available_brands takes precedence
    _state_brands = state.get("available_brands") or []
    brands = sorted(_state_brands) if _state_brands else sorted(
        {str(p.get("brand")) for p in products if p.get("brand")}
    )

    # Authoritative department list: from state, or derived from mapping
    available_departments = state.get("available_departments") or []
    if not available_departments:
        _mapping = state.get("category_department_mapping") or {}
        available_departments = sorted({d for depts in _mapping.values() for d in depts})

    # All categories from catalog_products
    all_categories = sorted({str(p.get("category")) for p in products if p.get("category")})

    # Requested department from classifier (e.g. "what categories for men" → "men")
    requested_dept = (
        parsed_cls.get("canonical_department")
        or parsed_cls.get("requested_department")
        or ""
    ).strip().lower()

    # Department-scoped category list (e.g. "what categories for men")
    _dept_scoped_categories: list[str] = []
    if requested_dept:
        _mapping = state.get("category_department_mapping") or {}
        _dept_scoped_categories = sorted(
            c for c, depts in _mapping.items()
            if requested_dept in [d.lower() for d in depts]
        )

    query = (state.get("query") or "").lower()
    query_words = set(query.split())

    # Within-handler data-selection: determine which authoritative fact to surface.
    # Primary: use catalog_meta_subject from the classifier (structured signal).
    # Fallback: word-based detection from query when classifier subject is absent.
    catalog_meta_subject = (parsed_cls.get("catalog_meta_subject") or "").upper()
    _dept_words = {"gender", "genders", "department", "departments"}
    _asks_brand = (
        catalog_meta_subject == "BRANDS"
        or (not catalog_meta_subject and ("brand" in query_words or "brands" in query_words))
    )
    _asks_categories_for_dept = (
        catalog_meta_subject == "CATEGORIES_FOR_DEPARTMENT"
        or (
            # Fallback: dept-scoped context exists but no brand question
            # covers: "what categories for men?", "what do you carry for women?"
            not _asks_brand
            and _dept_scoped_categories
            and requested_dept
            and not bool(_dept_words & query_words)
        )
    )
    # Only treat as pure dept/gender query when explicitly asked AND no dept-scoped
    # category context is available to give a more specific answer.
    _asks_dept = (
        catalog_meta_subject == "DEPARTMENTS"
        or (not catalog_meta_subject and bool(_dept_words & query_words))
    ) and not _asks_categories_for_dept

    if _asks_categories_for_dept and _dept_scoped_categories and requested_dept:
        message = (
            f"For {requested_dept}'s fashion we carry: "
            + ", ".join(_dept_scoped_categories) + "."
        )
    elif _asks_dept:
        # User explicitly asked about departments/genders
        if available_departments:
            dept_list = ", ".join(sorted(d.lower() for d in available_departments))
            message = f"We currently carry clothing for: {dept_list}."
        else:
            message = "I don't currently have department information available."

    elif _asks_brand:
        # User explicitly asked about brands
        if brands:
            message = "The brands currently available are: " + ", ".join(brands) + "."
        else:
            message = "I don't currently have brand information available for this catalog."

    elif all_categories:
        message = (
            "The clothing categories currently available are: "
            + ", ".join(all_categories) + "."
        )

    elif available_departments:
        dept_list = ", ".join(sorted(d.lower() for d in available_departments))
        message = f"We currently carry clothing for: {dept_list}."

    elif brands:
        message = "The brands currently available are: " + ", ".join(brands) + "."

    else:
        message = "I don't currently have catalog information available."

    return RecommendationOutput(
        action=ActionType.PROVIDE_RECOMMENDATION,
        message=message,
        provider="STATIC-CATALOG-META",
    )


async def fit_reasoning_agent(
    state: FitState,
) -> FitState:
    if state.get("final_response"):
        return state

    intent = state.get(
        "resolved_intent"
    )

    if intent == SemanticIntent.CLARIFICATION:
        # Differentiate "too broad fashion request" from "genuinely unrecognizable".
        # If no fashion signal was extracted, treat as unrecognizable and ask to rephrase.
        _cls_for_clarification = state.get("_parsed_classification") or {}
        _has_fashion_signal = bool(
            _cls_for_clarification.get("requested_fashion_concept")
            or _cls_for_clarification.get("canonical_catalog_category")
            or _cls_for_clarification.get("requested_product_type")
            or _cls_for_clarification.get("canonical_department")
            or _cls_for_clarification.get("requested_department")
        )
        _clarification_msg = (
            "Could you provide a bit more detail? For example, are you looking for a specific category like shirts or pants, or maybe a particular style?"
            if _has_fashion_signal
            else "I'm not sure I understood that. Could you try rephrasing, or tell me what kind of clothing or style you're looking for?"
        )
        state["reasoning_output"] = RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message=_clarification_msg,
            provider="STATIC-CLARIFICATION",
        )
        return state

    if intent == SemanticIntent.GREETING:
        # Social/conversational turn (gratitude, acknowledgement, reaction).
        # Use a focused LLM call so the response is warm and natural in both
        # General Chat and Product Chat — identical treatment in both contexts.
        _social_instruction = (
            "You are Manikan, a warm and friendly fashion assistant. "
            "The user sent a social or conversational message (a greeting, thank-you, "
            "acknowledgement, or reaction). Respond naturally and warmly in 1-2 sentences. "
            "Do not repeat generic product prompts. Do not invent catalog or sizing facts. "
            "Just have a brief, genuine social exchange."
        )
        _cname = state.get("customer_name")
        if _cname:
            _social_instruction += f" The customer's name is {_cname}."
        try:
            _social_resp, _social_provider = await call_llm_with_fallback(
                [{"role": "system", "content": _social_instruction}]
                + (state.get("messages") or []),
                fallback_action=ActionType.PROVIDE_RECOMMENDATION,
            )
            _social_resp.provider = _social_provider
            state["reasoning_output"] = _social_resp
        except Exception:
            state["reasoning_output"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message="You're welcome! Let me know if there's anything else I can help you with.",
                provider="STATIC-GREETING",
            )
        return state

    if (
        intent
        == SemanticIntent.SELF_AWARENESS
    ):
        state["reasoning_output"] = (
            _answer_self_awareness_question(
                state.get("customer_name"),
                has_product=bool(state.get("product_id")),
            )
        )

        return state

    if intent == SemanticIntent.PROFILE:
        # Deterministic: profile facts come exclusively from authoritative state
        # fields (customer_name, saved_measurements, previous_product_size,
        # recent_fit_history). No LLM call — prevents invented profile data.
        state["reasoning_output"] = _answer_profile_question(state)
        return state

    if intent == SemanticIntent.CATALOG_META:
        # Deterministic: catalog capability questions are answered directly from
        # authoritative state data — no LLM call needed or wanted here.
        state["reasoning_output"] = _catalog_meta_response(state)
        return state

    if (
        intent
        == SemanticIntent.SIZING
    ):
        deterministic = (
            _deterministic_size_response(
                state
            )
        )

        if deterministic:
            state["reasoning_output"] = (
                deterministic
            )

            return state

        if not state.get(
            "product_id"
        ):
            state["reasoning_output"] = (
                RecommendationOutput(
                    action=(
                        ActionType
                        .PROVIDE_RECOMMENDATION
                    ),
                    message=(
                        "To calculate your perfect size, I'll need to look at a "
                        "specific product. Please open a product you like, and I'll "
                        "use its exact size chart to find your best fit."
                    ),
                    provider="STATIC-GUIDANCE",
                )
            )

            return state

        measurements = (
            state.get(
                "user_measurements"
            )
            or state.get("betas")
        )

        if not measurements:
            label, confidence = (
                _find_stated_size_and_confidence(
                    state.get(
                        "messages"
                    )
                    or []
                )
            )

            if label and confidence is None:
                state[
                    "reasoning_output"
                ] = RecommendationOutput(
                    action=(
                        ActionType
                        .PROVIDE_RECOMMENDATION
                    ),
                    message=(
                        f"You mentioned {label}. "
                        "How confident are you in "
                        "that size from 0 to 100?"
                    ),
                    provider=(
                        "STATIC-ASK-CONFIDENCE"
                    ),
                    pending_state=(
                        PendingState(
                            type=(
                                PendingType
                                .REQUEST_CONFIDENCE
                            ),
                            product_id=(
                                state.get(
                                    "product_id"
                                )
                            ),
                            product_name=(
                                state.get(
                                    "product_name"
                                )
                            ),
                            recommended_size=label,
                            size_provenance="USER_STATED",
                        )
                    ),
                )

                return state

            if (
                label
                and confidence is not None
            ):
                if confidence > 80:
                    state[
                        "reasoning_output"
                    ] = RecommendationOutput(
                        action=(
                            ActionType
                            .PROVIDE_RECOMMENDATION
                        ),
                        recommended_size=label,
                        confidence_score=(
                            confidence / 100
                        ),
                        message=(
                            f"Got it. We'll use "
                            f"{label} for this item."
                        ),
                        provider=(
                            "STATIC-LABEL-TRUSTED"
                        ),
                    )

                else:
                    state[
                        "reasoning_output"
                    ] = RecommendationOutput(
                        action=(
                            ActionType
                            .ASK_MEASUREMENTS
                        ),
                        message=(
                            "Enter your current "
                            "height, weight, chest, "
                            "waist, and hip "
                            "measurements so I can "
                            "calculate the fit."
                        ),
                        provider=(
                            "STATIC-LABEL-UNTRUSTED"
                        ),
                    )

                return state

            state[
                "reasoning_output"
            ] = RecommendationOutput(
                action=(
                    ActionType
                    .ASK_MEASUREMENTS
                ),
                message=(
                    "Enter your current height, "
                    "weight, chest, waist, and hip "
                    "measurements so I can calculate "
                    "the fit for this item."
                ),
                provider="STATIC-PRODUCT-MODE",
            )

            return state

    if (
        intent
        == SemanticIntent.CURRENT_PRODUCT
    ):
        fact_response = (
            _answer_current_product_fact(
                state
            )
        )

        if fact_response:
            state["reasoning_output"] = (
                fact_response
            )
            return state

        # RC-A: Deterministic chart Q&A using slots extracted by the classifier.
        # The LLM identified the chart operation; we execute it against the real data.
        _chart_raw = state.get("size_chart")
        if _chart_raw:
            _cls = state.get("_parsed_classification") or {}
            _raw_dims = _cls.get("chart_query_dimensions") or []
            _op = _cls.get("chart_query_operation")
            _for_sz = _cls.get("chart_query_for_size")
            # Normalize: LLM may emit ["waist and hip"] or "waist, hip" instead of
            # the proper array ["waist", "hip"]. Split on connectives and keep only
            # terms that exist in _DIMENSION_MAP.
            _dims: list[str] = []
            for _raw_d in (_raw_dims if isinstance(_raw_dims, list) else ([_raw_dims] if _raw_dims else [])):
                if isinstance(_raw_d, str):
                    for _dp in re.split(r"\band\b|,", _raw_d, flags=re.IGNORECASE):
                        _dp = _dp.strip().lower()
                        if _dp:
                            _dims.append(_dp)

            if _op == "available_dimensions":
                _chart_answer = _resolve_chart_answer(_chart_raw, [], "available_dimensions", None)
                if _chart_answer:
                    state["reasoning_output"] = RecommendationOutput(
                        action=ActionType.PROVIDE_RECOMMENDATION,
                        message=_chart_answer,
                        provider="STATIC-CHART-QA",
                    )
                    return state

            # Case A: known chart dimensions — answer the specific query.
            if _dims:
                _chart_answer = _resolve_chart_answer(
                    _chart_raw, _dims, _op, _for_sz
                )
                if _chart_answer:
                    state["reasoning_output"] = RecommendationOutput(
                        action=ActionType.PROVIDE_RECOMMENDATION,
                        message=_chart_answer,
                        provider="STATIC-CHART-QA",
                    )
                    return state

            # Case B: classifier set operation=full (full-chart request) with no
            # specific dimension. Render the entire size chart deterministically.
            elif _op == "full":
                _full_answer = _resolve_chart_answer(_chart_raw, [], "full", None)
                if _full_answer:
                    state["reasoning_output"] = RecommendationOutput(
                        action=ActionType.PROVIDE_RECOMMENDATION,
                        message=_full_answer,
                        provider="STATIC-CHART-QA",
                    )
                    return state

            # Case C: missing dimensions.
            elif _raw_dims:
                _absent_label = ", ".join(
                    str(d) for d in _raw_dims if isinstance(d, str)
                ) or "That field"
                state["reasoning_output"] = RecommendationOutput(
                    action=ActionType.PROVIDE_RECOMMENDATION,
                    message=(
                        f"{_absent_label.capitalize()} isn't measured in this product's "
                        "size chart. The chart covers chest, waist, and hip measurements."
                    ),
                    provider="STATIC-CHART-QA",
                )
                return state

    # CONTINUATION: deterministic owner for no-context and no-results cases.
    # Prevents the generic LLM fallback from firing on "show more" / "any more?".
    if intent == SemanticIntent.CONTINUATION:
        if not state.get("active_search"):
            # No search context to continue — user may have said "show more" cold.
            state["reasoning_output"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=(
                    "I don't have an active search to continue right now. "
                    "What would you like to browse?"
                ),
                provider="STATIC-NO-CONTEXT",
            )
            return state
        if not state.get("retrieved_products"):
            # All products already shown or no matches remain.
            state["reasoning_output"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=(
                    "I've shown all the items I found for that search. "
                    "Would you like to try different filters, or explore something new?"
                ),
                provider="STATIC-CONTINUATION-END",
            )
            return state
        # Products are available — fall through to LLM for natural presentation.

    # RC-I: Zero-result PRODUCT_DISCOVERY — one deterministic owner so the widget
    # never receives an empty fetch-products command alongside an agent message.
    if (
        intent == SemanticIntent.PRODUCT_DISCOVERY
        and not state.get("retrieved_products")
    ):
        state["reasoning_output"] = RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message=(
                "I couldn't find any items matching your search in our catalog right now. "
                "Try adjusting your filters or searching for a different style."
            ),
            provider="STATIC-UNAVAILABLE",
        )
        return state

    context = format_retrieved_context(
        state.get(
            "retrieved_products"
        )
        or []
    )

    instruction = (
        build_general_instruction(
            state.get(
                "available_categories"
            ),
            state.get(
                "product_name"
            ),
            state.get(
                "customer_name"
            ),
            state.get(
                "saved_measurements"
            ),
            state.get(
                "previous_product_size"
            ),
            state.get(
                "recent_fit_history"
            ),
            size_chart_raw=state.get(
                "size_chart"
            ),
        )
    )

    if context:
        instruction += (
            "\n\nTRUSTED CATALOG CONTEXT:\n"
            + context
        )

    # Inject authoritative current-product fields so the LLM can answer
    # factual questions (fabric, brand, price, description, features) from
    # grounded data rather than inventing or deflecting generically.
    # This fires only when the deterministic fact handler returned None
    # (e.g. fabric field absent) and the question falls through to the LLM.
    _cp_id = state.get("product_id")
    if _cp_id:
        _cp = _find_product_by_id(_cp_id, state.get("catalog_products"))
        if _cp:
            _cp_lines: list[str] = []
            if _cp.get("description"):
                _cp_lines.append(f"Description: {_cp['description']}")
            _cp_fabric = _cp.get("fabric") or None  # normalize "" → None
            if _cp_fabric:
                _cp_lines.append(f"Material/Fabric: {_cp_fabric}")
            if _cp.get("brand"):
                _cp_lines.append(f"Brand: {_cp['brand']}")
            if _cp.get("price") is not None:
                _cp_lines.append(f"Price: EGP {_cp['price']}")
            if _cp.get("category"):
                _cp_lines.append(f"Category: {_cp['category']}")
            if _cp_lines:
                instruction += (
                    "\n\nTRUSTED CURRENT PRODUCT FIELDS (authoritative — answer"
                    " product fact questions only from these values;"
                    " if a requested fact is not listed here, say it is not"
                    " provided for this item — never invent):\n"
                    + "\n".join(_cp_lines)
                )

    fallback_action = (
        ActionType.FETCH_PRODUCTS
        if state.get(
            "retrieved_products"
        )
        else ActionType.PROVIDE_RECOMMENDATION
    )

    try:
        response, provider = (
            await call_llm_with_fallback(
                [
                    {
                        "role": "system",
                        "content": instruction,
                    }
                ]
                + (
                    state.get(
                        "messages"
                    )
                    or []
                ),
                fallback_action=(
                    fallback_action
                ),
            )
        )

        response.provider = provider

        # CONTINUATION with retrieved products must surface as product cards.
        # The LLM may choose provide_recommendation; override to FETCH_PRODUCTS
        # so the widget always receives and renders the continuation results.
        if (
            state.get("resolved_intent") == SemanticIntent.CONTINUATION
            and state.get("retrieved_products")
            and response.action != ActionType.FETCH_PRODUCTS
        ):
            response.action = ActionType.FETCH_PRODUCTS

        state["reasoning_output"] = (
            response
        )

        _trace(
            state,
            "reasoning_complete",
            provider=provider,
        )

    except Exception as exc:
        logger.warning(
            "workflow_event=reasoning_fallback "
            "trace_id=%s intent=%s error=%s",
            state.get("trace_id"),
            state.get("resolved_intent"),
            type(exc).__name__,
        )

        if state.get("retrieved_products"):
            # Products were already retrieved — surface them even without LLM narration.
            state["reasoning_output"] = RecommendationOutput(
                action=ActionType.FETCH_PRODUCTS,
                message="Here are the matching options I found.",
                provider="STATIC-RAG-FALLBACK",
            )

        elif state.get("resolved_intent") == SemanticIntent.CLARIFICATION:
            # Genuine semantic ambiguity — the intent was unknown, not the system.
            # Ask the shopper to clarify rather than reporting an internal error.
            state["reasoning_output"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=(
                    "I didn't quite catch that. Could you give me a bit more detail "
                    "about what you're looking for?"
                ),
                provider="STATIC-CLARIFICATION",
            )

        elif (
            intent == SemanticIntent.CURRENT_PRODUCT
            and state.get("size_chart")
        ):
            # LLM failed for a product-page query that has chart data.
            # Show the full chart as the safe deterministic fallback — always
            # correct and never an invention.
            _fallback_msg = _resolve_chart_answer(state["size_chart"], [], "full", None)
            state["reasoning_output"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=_fallback_msg or "Here is the product information. How can I help you further?",
                provider="STATIC-CHART-FALLBACK",
            )

        else:
            # Intent was known but the reasoning step failed — internal failure.
            # Do not suggest the user's question was wrong.
            state["reasoning_output"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=(
                    "I'm having trouble completing your request right now. "
                    "Please try again in a moment."
                ),
                provider="STATIC-DEGRADED",
            )

    return state


async def format_response(
    state: FitState,
) -> FitState:
    response = (
        state.get("final_response")
        or state.get(
            "reasoning_output"
        )
    )

    if not response:
        # Both final_response and reasoning_output are None — the pipeline produced
        # no output. This is an internal failure; log it so developers can diagnose.
        logger.error(
            "workflow_event=format_response_no_output trace_id=%s intent=%s",
            state.get("trace_id"),
            state.get("resolved_intent"),
        )
        response = RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message=(
                "I'm having trouble completing your request right now. "
                "Please try again in a moment."
            ),
            provider="STATIC-DEGRADED",
        )

    product_ids = [
        product["id"]
        for product in (
            state.get(
                "retrieved_products"
            )
            or []
        )
        if isinstance(
            product.get("id"),
            str,
        )
    ]

    if (
        product_ids
        and response.action
        == ActionType.FETCH_PRODUCTS
    ):
        response.retrieved_product_ids = (
            product_ids
        )
    elif (
        not product_ids
        and response.action
        == ActionType.FETCH_PRODUCTS
    ):
        # RC-D: No products to show — downgrade the action so the widget does not
        # emit a redundant "couldn't find matching products" message on top of the
        # agent's own response. One response owner per turn.
        response.action = ActionType.PROVIDE_RECOMMENDATION

    # Social action normalization: when the resolved intent is conversational
    # (GREETING, SELF_AWARENESS) and no genuine data is being requested by
    # a pending state, REQUEST_DATA is semantically wrong — downgrade it.
    _resolved_intent_for_norm = state.get("resolved_intent")
    _conversational_intents = {SemanticIntent.GREETING, SemanticIntent.SELF_AWARENESS}
    if (
        response.action == ActionType.REQUEST_DATA
        and _resolved_intent_for_norm in _conversational_intents
        and not state.get("pending_state")
    ):
        response.action = ActionType.PROVIDE_RECOMMENDATION

    if hasattr(
        response,
        "resolved_intent",
    ):
        intent = state.get(
            "resolved_intent"
        )

        response.resolved_intent = (
            intent.value
            if isinstance(
                intent,
                SemanticIntent,
            )
            else (
                str(intent)
                if intent
                else None
            )
        )

    if state.get("active_search"):
        response.active_search = state.get("active_search")
        
    if state.get("pending_state"):
        response.pending_state = state.get("pending_state")

    state["final_response"] = response
    state["structured_response"] = (
        response
    )

    _trace(
        state,
        "response_formatted",
        provider=response.provider,
        action=response.action.value,
        product_count=len(
            product_ids
        ),
    )

    return state


def _route_after_analyze(
    state: FitState,
) -> str:
    if state.get(
        "final_response"
    ):
        return "format_response"

    intent = state.get(
        "resolved_intent"
    )

    if (
        intent
        == SemanticIntent.SIZING
    ):
        return "compute_size_math"

    if state.get(
        "requires_catalog"
    ):
        return "retrieve_rag_context"

    return "fit_reasoning_agent"


workflow = StateGraph(FitState)

workflow.add_node(
    "analyze_turn",
    analyze_turn,
)

workflow.add_node(
    "retrieve_rag_context",
    retrieve_rag_context,
)

workflow.add_node(
    "compute_size_math",
    compute_size_math,
)

workflow.add_node(
    "fit_reasoning_agent",
    fit_reasoning_agent,
)

workflow.add_node(
    "format_response",
    format_response,
)

workflow.set_entry_point(
    "analyze_turn"
)

workflow.add_conditional_edges(
    "analyze_turn",
    _route_after_analyze,
    {
        "format_response": (
            "format_response"
        ),
        "compute_size_math": (
            "compute_size_math"
        ),
        "retrieve_rag_context": (
            "retrieve_rag_context"
        ),
        "fit_reasoning_agent": (
            "fit_reasoning_agent"
        ),
    },
)

workflow.add_edge(
    "compute_size_math",
    "fit_reasoning_agent",
)

workflow.add_edge(
    "retrieve_rag_context",
    "fit_reasoning_agent",
)

workflow.add_edge(
    "fit_reasoning_agent",
    "format_response",
)

workflow.add_edge(
    "format_response",
    END,
)

recommendation_graph = (
    workflow.compile()
)


async def call_conversational_agent(
    state: FitState,
) -> FitState:
    state.setdefault(
        "messages",
        [],
    )

    state.setdefault(
        "query",
        _last_user_query(
            state["messages"]
        ),
    )

    state.setdefault(
        "product_detail_question",
        False,
    )

    state.setdefault(
        "user_measurements",
        state.get("betas"),
    )

    state.setdefault(
        "retrieved_products",
        [],
    )

    state.setdefault(
        "size_math_result",
        None,
    )

    state.setdefault(
        "reasoning_output",
        None,
    )

    state.setdefault(
        "final_response",
        None,
    )

    state.setdefault(
        "structured_response",
        None,
    )

    state.setdefault(
        "trace_id",
        "direct-agent-call",
    )

    state.setdefault(
        "pending_state",
        None,
    )

    state.setdefault(
        "shown_product_ids",
        [],
    )

    state.setdefault(
        "force_sizing_intent",
        False,
    )

    state.setdefault(
        "force_in_scope",
        False,
    )

    state.setdefault(
        "resolved_intent",
        None,
    )

    state.setdefault(
        "requires_catalog",
        False,
    )

    state.setdefault(
        "requested_material",
        None,
    )

    state.setdefault(
        "requested_price_range",
        None,
    )

    state.setdefault(
        "material_price_constrained",
        False,
    )

    state.setdefault(
        "recent_fit_history",
        [],
    )

    return await recommendation_graph.ainvoke(
        state
    )
