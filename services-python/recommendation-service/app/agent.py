import asyncio
import json
import logging
import typing_extensions
from typing import Optional, List

import httpx
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from langgraph.graph import StateGraph, END

from .config import get_settings
from .schemas import ActionType, RecommendationOutput, MeasurementInput

logger = logging.getLogger("manikan.agent")


class FitState(typing_extensions.TypedDict):
    messages: list[dict]
    product_id: Optional[str]
    betas: Optional[MeasurementInput]
    size_chart: Optional[str]
    intent: Optional[str]
    selected_category: Optional[str]
    available_categories: Optional[List[str]]
    structured_response: Optional[RecommendationOutput]


from dataclasses import dataclass


@dataclass
class SizeMatchResult:
    recommended_size: Optional[str]
    confidence_score: Optional[float]
    explanation: Optional[str]
    available_sizes: list[str]
    is_out_of_range: bool


# Beyond this combined chest+waist distance (cm), the "closest" size is no
# longer a meaningful fit - the measurements are genuinely outside what
# this product's size chart covers.
OUT_OF_RANGE_THRESHOLD_CM = 15.0


def _confidence_phrase(score: Optional[float]) -> str:
    """Turns a 0-1 confidence score into a short, honest, natural phrase."""
    if score is None:
        return ""
    pct = round(score * 100)
    if score >= 0.8:
        return f"I'm very confident about this ({pct}% match)."
    if score >= 0.5:
        return f"I'm fairly confident about this ({pct}% match)."
    return f"This is my best estimate, though it's not a perfect match ({pct}%) - consider checking the size chart yourself too."


def compute_recommended_size(betas: MeasurementInput, size_chart_raw: str) -> SizeMatchResult:
    """
    Compares user measurements against a product's size chart.

    NOTE: this is a placeholder nearest-match calculation. Replace with
    the real measurement algorithm used by the 3D model once available.
    Expected size_chart_raw shape: JSON list of
    {"size": str, "chest_cm": float, "waist_cm": float, ...}
    (retailer-specific field names should be normalized to this shape
    by the Next.js API before this service ever sees them)
    """
    try:
        size_chart = json.loads(size_chart_raw)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Could not parse size_chart, falling back to no recommendation")
        return SizeMatchResult(None, None, None, [], True)

    if not size_chart:
        return SizeMatchResult(None, None, None, [], True)

    available_sizes = [entry.get("size") for entry in size_chart if entry.get("size")]

    best_size = None
    best_distance = float("inf")
    for entry in size_chart:
        try:
            squared_diff = (
                (entry["chest_cm"] - betas.chest_cm) ** 2
                + (entry["waist_cm"] - betas.waist_cm) ** 2
            )
            # Include hip in the match when this chart entry has it -
            # not every retailer's variant data includes hip_cm, so this
            # degrades gracefully to chest+waist only when it's missing.
            hip_value = entry.get("hip_cm")
            if isinstance(hip_value, (int, float)):
                squared_diff += (hip_value - betas.hips_cm) ** 2
            distance = squared_diff ** 0.5
        except (KeyError, TypeError):
            continue
        if distance < best_distance:
            best_distance = distance
            best_size = entry.get("size")

    if best_size is None:
        # size_chart entries didn't have usable chest_cm/waist_cm fields
        return SizeMatchResult(None, None, None, available_sizes, True)

    if best_distance > OUT_OF_RANGE_THRESHOLD_CM:
        # A "nearest" size technically exists, but it's not a real fit -
        # be honest about that instead of silently recommending it.
        return SizeMatchResult(None, None, None, available_sizes, True)

    # Rough placeholder confidence: closer match -> higher confidence.
    # Replace with a real confidence model once the 3D algorithm is available.
    confidence = max(0.0, 1.0 - (best_distance / OUT_OF_RANGE_THRESHOLD_CM))
    explanation = (
        f"Closest match based on chest ({betas.chest_cm}cm), waist ({betas.waist_cm}cm), "
        f"and hip ({betas.hips_cm}cm)."
    )
    return SizeMatchResult(best_size, round(confidence, 2), explanation, available_sizes, False)


def _build_gemini_client(api_key: str) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=api_key,
        # Google's API rejects any deadline below 10s outright (400
        # INVALID_ARGUMENT) - this is a hard minimum, not tunable lower.
        timeout=10,
        # Quota/auth errors should fall through to the next provider
        # immediately instead of the client silently retrying for up to
        # a minute+, which is what made /recommend look "stuck" in the
        # Network tab.
        max_retries=0,
    )


async def _call_bedrock_gateway(messages: list[dict]) -> RecommendationOutput:
    """
    Actual attempt at calling the ITI Bedrock gateway. The exact request/
    response shape was never confirmed, so this uses a best-guess
    OpenAI-compatible chat completions format. If this shape is wrong,
    the raw error response is logged so the real shape can be worked out
    from what the server actually says back.
    """
    settings = get_settings()
    if not settings.bedrock_full_url or not settings.bedrock_api_key:
        raise RuntimeError("Bedrock gateway not configured (missing base_url or api_key)")

    async with httpx.AsyncClient(timeout=4, follow_redirects=True) as client:
        response = await client.post(
            settings.bedrock_full_url,
            headers={
                "Authorization": f"Bearer {settings.bedrock_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "anthropic.claude-haiku-4-5-20251001",
                "messages": messages,
            },
        )
        response.raise_for_status()
        data = response.json()
        logger.info(f"Bedrock gateway raw response: {data}")

        # Best-guess parsing (OpenAI-style). Adjust once the real shape is known.
        content = data["choices"][0]["message"]["content"]
        return RecommendationOutput.model_validate_json(content)


async def call_llm_with_fallback(messages: list[dict]) -> tuple[RecommendationOutput, str]:
    """
    Tries providers in order: Gemini key 1 -> Gemini key 2 -> Bedrock -> Ollama.
    Each attempt wraps the actual invoke call, since auth/quota errors
    only surface at call time, not at client construction time.
    """
    settings = get_settings()
    attempts = []

    for key in settings.gemini_keys:
        attempts.append(("GEMINI", _build_gemini_client(key)))

    last_error = None
    for provider_tag, llm in attempts:
        try:
            structured_llm = llm.with_structured_output(RecommendationOutput)
            response = await structured_llm.ainvoke(messages)
            response.provider = provider_tag
            return response, provider_tag
        except Exception as e:
            logger.warning(f"Provider {provider_tag} failed: {type(e).__name__}: {e}")
            last_error = e
            continue

    # Real Bedrock attempt - not commented out anymore
    try:
        response = await _call_bedrock_gateway(messages)
        response.provider = "BEDROCK"
        return response, "BEDROCK"
    except Exception as e:
        logger.warning(f"Provider BEDROCK failed: {type(e).__name__}: {e}")
        last_error = e

    try:
        ollama_llm = ChatOllama(model=settings.ollama_model, base_url=settings.ollama_base_url)
        structured_llm = ollama_llm.with_structured_output(RecommendationOutput)
        # Ollama had no timeout at all before this - if the local model was
        # ever slow (e.g. a longer prompt), this call could hang
        # indefinitely with nothing left in the chain to catch it.
        response = await asyncio.wait_for(structured_llm.ainvoke(messages), timeout=10)
        response.provider = "OLLAMA-FALLBACK"
        return response, "OLLAMA-FALLBACK"
    except Exception as e:
        logger.warning(f"Provider OLLAMA-FALLBACK failed: {type(e).__name__}: {e}")
        last_error = e

    raise RuntimeError(f"All LLM providers failed. Last error: {last_error}")


async def check_all_providers() -> list[dict]:
    """Pings each configured provider individually and reports whether
    it responded, so /health can show exactly which one is active."""
    settings = get_settings()
    results = []

    for idx, key in enumerate(settings.gemini_keys, start=1):
        provider_name = f"GEMINI_KEY_{idx}"
        try:
            llm = _build_gemini_client(key)
            await llm.ainvoke("ping")
            results.append({"provider": provider_name, "status": "ok"})
        except Exception as e:
            results.append({"provider": provider_name, "status": "failed", "error": str(e)})

    # Real Bedrock ping - reports the actual error if the request shape is wrong
    if settings.bedrock_full_url and settings.bedrock_api_key:
        try:
            await _call_bedrock_gateway([{"role": "user", "content": "ping"}])
            results.append({"provider": "BEDROCK", "status": "ok"})
        except Exception as e:
            results.append({"provider": "BEDROCK", "status": "failed", "error": str(e)})
    else:
        results.append({"provider": "BEDROCK", "status": "not_configured", "error": "missing base_url or api_key"})

    try:
        llm = ChatOllama(model=settings.ollama_model, base_url=settings.ollama_base_url)
        await asyncio.wait_for(llm.ainvoke("ping"), timeout=10)
        results.append({"provider": "OLLAMA", "status": "ok"})
    except Exception as e:
        results.append({"provider": "OLLAMA", "status": "failed", "error": str(e)})

    return results


def build_general_instruction(available_categories: Optional[List[str]]) -> str:
    base = (
        "You are Manikan's shopping and sizing assistant for an online clothing store. "
        "IMPORTANT: size labels like S, M, L, XL are NOT standardized across "
        "brands or products - the same label can mean very different actual "
        "body measurements from one item to another. Because of this:\n"
        "- If the user states a size label (e.g. 'my size is L') because they "
        "want a size RECOMMENDATION or fit check, do NOT treat that label as "
        "reliable by itself. Respond with action='ask_measurements' and ask "
        "for their real height, weight, chest, and waist, plus which category "
        "they're shopping for if that isn't already clear - only real "
        "measurements checked against a specific item's chart can determine "
        "actual fit.\n"
        "- If the user is just asking to browse or see products (by category "
        "or style, with no fit recommendation implied), respond with "
        "action='fetch_products'.\n"
        "- Otherwise, respond with action='provide_recommendation' and just "
        "reply conversationally in the message field.\n"
        "Never invent product names, brand names, prices, or stock availability "
        "that were not provided to you - the widget fetches real product data "
        "separately based on your action."
    )
    if available_categories:
        categories_str = ", ".join(available_categories)
        base += (
            f"\nThe store currently carries these categories only: {categories_str}. "
            "If the user asks for a category not in this list, say so honestly and "
            "friendly, and mention the categories that ARE available instead of "
            "pretending to search for something we don't carry."
        )
    return base


_QUESTION_MARKERS = (
    "?", "what", "how", "max", "min", "maximum", "minimum",
    "which size", "does this", "is this", "range", "largest", "smallest",
)


def _last_user_message(messages: list[dict]) -> str:
    for m in reversed(messages):
        if m.get("role") == "user":
            return (m.get("content") or "").lower()
    return ""


def _is_descriptive_question(messages: list[dict]) -> bool:
    """
    Heuristic: does the latest user message read like a question about the
    product (e.g. "what's the max chest size?") rather than a submission of
    the user's own body measurements? Our own auto-generated measurement
    message always starts with "my measurements:", so that's excluded here.
    """
    text = _last_user_message(messages)
    if text.startswith("my measurements:"):
        return False
    return any(marker in text for marker in _QUESTION_MARKERS)


def _try_answer_from_size_chart_locally(question: str, size_chart_raw: str) -> Optional[str]:
    """
    Answers simple, recognizable numeric questions about a size chart
    directly from the parsed data - no LLM call involved, so this is
    instant and can never time out.
    Returns None if the question doesn't match a recognizable pattern,
    so the caller can fall back to an LLM-grounded answer.
    """
    try:
        size_chart = json.loads(size_chart_raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not size_chart:
        return None

    field = None
    if "chest" in question:
        field = "chest_cm"
    elif "waist" in question:
        field = "waist_cm"
    elif "hip" in question:
        field = "hip_cm"

    if not field:
        # No specific dimension mentioned - if this still reads like a
        # generic "what sizes/what's the biggest size" question, answer
        # with the list of available sizes instead of falling through
        # to the (slower, less reliable) LLM path.
        available_sizes = [e.get("size") for e in size_chart if e.get("size")]
        if not available_sizes:
            return None
        if any(w in question for w in ("what size", "which size", "sizes do you", "available size")):
            return f"This item comes in these sizes: {', '.join(available_sizes)}."
        if any(w in question for w in ("max", "largest", "biggest", "up to")):
            return f"The largest size we carry for this item is {available_sizes[-1]}."
        if any(w in question for w in ("min", "smallest")):
            return f"The smallest size we carry for this item is {available_sizes[0]}."
        return None

    values = [e[field] for e in size_chart if isinstance(e.get(field), (int, float))]
    if not values:
        return None

    label = field.replace("_cm", "")
    if any(w in question for w in ("max", "largest", "biggest", "up to")):
        return f"The maximum {label} in our size chart for this item is {max(values)}cm."
    if any(w in question for w in ("min", "smallest")):
        return f"The minimum {label} in our size chart for this item is {min(values)}cm."
    return f"Our {label} sizing for this item ranges from {min(values)}cm to {max(values)}cm."


async def call_conversational_agent(state: FitState) -> FitState:
    product_id = state.get("product_id")
    betas = state.get("betas")
    size_chart = state.get("size_chart")
    is_question = _is_descriptive_question(state["messages"])

    # A sizing question with no product AND no category context at all -
    # "max size" means nothing store-wide (it varies by item), so ask
    # which category instead of guessing or going to the LLM.
    if is_question and not size_chart and not product_id:
        available_categories = state.get("available_categories") or []
        if available_categories:
            categories_str = ", ".join(available_categories)
            message = f"That depends on what you're shopping for - {categories_str}? Pick a category above and I'll give you the exact sizes."
        else:
            message = "That depends on the item - which category are you shopping for?"
        state["structured_response"] = RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message=message,
            provider="STATIC",
        )
        return state

    # The user is asking something descriptive about this product's size
    # chart (e.g. "what's the max chest size?") rather than submitting
    # their own measurements - answer using the LLM, grounded in the real
    # chart data, instead of running the measurement-matching calculation.
    if size_chart and is_question:
        last_message = _last_user_message(state["messages"])
        local_answer = _try_answer_from_size_chart_locally(last_message, size_chart)
        if local_answer:
            state["structured_response"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=local_answer,
                provider="STATIC-LOCAL",
            )
            return state

        # Not a recognizable numeric pattern (e.g. "does this run small?") -
        # fall back to the LLM, still grounded in the real chart data.
        instruction = {
            "role": "system",
            "content": (
                "You are a product sizing assistant. The user is asking a "
                "descriptive question about this specific product's size chart, "
                "not submitting their own body measurements. Use ONLY the "
                f"following real size chart data to answer accurately: {size_chart}. "
                "Never invent numbers that aren't in this data - if something "
                "isn't covered by the chart, say so honestly. Respond with "
                "action='provide_recommendation' and put your answer in the "
                "message field."
            ),
        }
        response, provider_tag = await call_llm_with_fallback([instruction] + state["messages"])
        response.provider = provider_tag
        state["structured_response"] = response
        return state

    # Deterministic case: measurements + a size chart are both available ->
    # compute the real recommendation directly, no LLM needed.
    if betas and size_chart:
        result = compute_recommended_size(betas, size_chart)

        if result.recommended_size and not result.is_out_of_range:
            confidence_phrase = _confidence_phrase(result.confidence_score)
            message = f"Based on your measurements, size {result.recommended_size} should fit you best. {confidence_phrase}".strip()
            state["structured_response"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                recommended_size=result.recommended_size,
                message=message,
                provider="STATIC-CALC",
                confidence_score=result.confidence_score,
                explanation=result.explanation,
            )
        elif result.available_sizes:
            # Measurements don't closely match any size for this item.
            # Be upfront about it and immediately surface what's actually
            # available, instead of a vague error or a yes/no round-trip
            # (which could loop, since the same measurements would be
            # re-evaluated the same way on the next message).
            sizes_str = ", ".join(result.available_sizes)
            state["structured_response"] = RecommendationOutput(
                action=ActionType.FETCH_PRODUCTS,
                recommended_size=None,
                message=(
                    f"Unfortunately your measurements don't closely match any size we "
                    f"carry for this item. The available sizes are: {sizes_str}. "
                    f"Here's what we have:"
                ),
                provider="STATIC-CALC",
            )
        else:
            state["structured_response"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                recommended_size=None,
                message="I couldn't read this item's size chart. Could you try again in a moment?",
                provider="STATIC-CALC",
            )
        return state

    # Fast path: the user gave measurements, but there's no size chart yet
    # (e.g. they're on the general Size Assistant chat with no product or
    # category selected). There's nothing to compute against, so respond
    # immediately instead of falling through to the slower LLM chain.
    if betas and not size_chart:
        available_categories = state.get("available_categories") or []
        if available_categories:
            categories_str = ", ".join(available_categories)
            message = (
                f"Got your measurements, thanks! What are you shopping for - "
                f"{categories_str}? Pick a category above and I'll size you up."
            )
        else:
            message = (
                "Got your measurements, thanks! Which item are you shopping for? "
                "Open a product page and I'll tell you the best size for it."
            )
        state["structured_response"] = RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message=message,
            provider="STATIC",
        )
        return state

    # Everything else goes through the LLM with one shared instruction, so
    # behavior is driven by what the user actually said - not by the
    # widget's category dropdown, which was overriding the model's own
    # judgment and causing inconsistent behavior.
    instruction = {"role": "system", "content": build_general_instruction(state.get("available_categories"))}
    response, provider_tag = await call_llm_with_fallback([instruction] + state["messages"])
    response.provider = provider_tag
    state["structured_response"] = response
    return state


workflow = StateGraph(FitState)
workflow.add_node("agent", call_conversational_agent)
workflow.set_entry_point("agent")
workflow.add_edge("agent", END)
recommendation_graph = workflow.compile()