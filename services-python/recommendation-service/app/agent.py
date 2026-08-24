import asyncio
import json
import logging
import re
import typing_extensions
from typing import Optional, List

import httpx
from openai import AsyncOpenAI
from langgraph.graph import StateGraph, END

from .config import get_settings
from .schemas import ActionType, RecommendationOutput, MeasurementInput
from .retrieval import retrieve_relevant_products, format_retrieved_context

logger = logging.getLogger("manikan.agent")


class FitState(typing_extensions.TypedDict):
    # Request and legacy-widget fields.
    messages: list[dict]
    product_id: Optional[str]
    product_detail_question: bool
    query: str
    user_measurements: Optional[MeasurementInput]
    betas: Optional[MeasurementInput]
    size_chart: Optional[str]
    intent: Optional[str]
    selected_category: Optional[str]
    available_categories: Optional[List[str]]
    catalog_products: Optional[List[dict]]
    # Explicit multi-node workflow artifacts.
    retrieved_products: list[dict]
    size_math_result: Optional[dict]
    reasoning_output: Optional[RecommendationOutput]
    final_response: Optional[RecommendationOutput]
    trace_id: str
    structured_response: Optional[RecommendationOutput]


from dataclasses import dataclass


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

_SIZE_LABEL_PATTERN = re.compile(r'\b(XXS|XS|S|M|L|XL|XXL|XXXL)\b', re.IGNORECASE)
_CONFIDENCE_PATTERN = re.compile(r'\b(\d{1,3})\s*%')


def _extract_size_label(text: str) -> Optional[str]:
    match = _SIZE_LABEL_PATTERN.search(text or "")
    return match.group(1).upper() if match else None


def _extract_confidence_pct(text: str) -> Optional[int]:
    match = _CONFIDENCE_PATTERN.search(text or "")
    if not match:
        return None
    value = int(match.group(1))
    return value if 0 <= value <= 100 else None


def _find_stated_size_and_confidence(messages: list[dict]) -> tuple[Optional[str], Optional[int]]:
    """
    Scans user messages for the most recently stated size label, and the
    most recent user message for a confidence percentage (they may arrive
    in the same message, e.g. "XL, about 70% sure", or across two turns:
    "I'm size XL" then "70%").
    """
    user_messages = [m.get("content", "") for m in messages if m.get("role") == "user"]
    if not user_messages:
        return None, None

    confidence = _extract_confidence_pct(user_messages[-1])

    label = None
    for text in reversed(user_messages):
        label = _extract_size_label(text)
        if label:
            break

    return label, confidence


_QUESTION_MARKERS = (
    "?", "what", "how", "max", "min", "maximum", "minimum",
    "which size", "does this", "is this", "range", "largest", "smallest",
    "waist", "chest", "hip", "length",
)

# Keywords that signal a fashion / sizing intent.
_FASHION_KEYWORDS = (
    "size", "fit", "chest", "waist", "hip", "measurement", "measure",
    "shirt", "blouse", "dress", "pants", "skirt", "jacket", "coat",
    "jeans", "trousers", "top", "bottom", "outfit", "wear", "cloth",
    "garment", "fashion", "style", "look", "color", "colour", "fabric",
    "sleeve", "length", "shoulder", "xl", "xs", "xxl", "small", "medium",
    "large", "brand", "product", "item", "collection", "category",
    "recommend", "suggest", "show me", "browse", "shop",
)


def _is_fashion_related(text: str) -> bool:
    """Return True only when the query is clearly about fashion, clothing, or sizing."""
    lowered = (text or "").lower()
    return any(kw in lowered for kw in _FASHION_KEYWORDS)


def _is_descriptive_question(text: str) -> bool:
    lowered = (text or "").lower()
    if lowered.startswith("my measurements:"):
        return False
    return any(marker in lowered for marker in _QUESTION_MARKERS)


def _try_answer_from_size_chart_locally(question: str, size_chart_raw: str) -> Optional[str]:
    """
    Answers informational questions about a product's real size chart
    directly (e.g. "what's the max chest size?") without invoking the LLM
    or the personal fit-match calculation - this is a different intent
    from "does this fit ME", and must not be hijacked by the body-fit
    guardrail just because measurements happen to be present in this
    session.
    """
    try:
        size_chart = json.loads(size_chart_raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not size_chart:
        return None

    question = question.lower()
    field = None
    if "chest" in question:
        field = "chest_cm"
    elif "waist" in question:
        field = "waist_cm"
    elif "hip" in question:
        field = "hip_cm"

    if not field:
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


def compute_recommended_size(betas: MeasurementInput, size_chart_raw: str) -> SizeMatchResult:
    try:
        size_chart = json.loads(size_chart_raw)
    except (json.JSONDecodeError, TypeError):
        return SizeMatchResult(None, None, None, [], True)

    if not size_chart:
        return SizeMatchResult(None, None, None, [], True)

    available_sizes = [entry.get("size") for entry in size_chart if entry.get("size")]

    # waist_cm is the one field every category's chart is expected to
    # have (pants/skirts included) - required. chest_cm and hip_cm are
    # both optional now: pants/skirts commonly have no chest_cm at all
    # (garment-fit data, not a body measurement that applies to them),
    # so a row missing it is still matched on whatever fields it does
    # have, instead of being skipped entirely. This mirrors how hip_cm
    # was already handled - chest_cm just joins it as optional.
    best_size = None
    best_distance = float("inf")
    for entry in size_chart:
        try:
            waist_value = entry["waist_cm"]
            squared_diff = (waist_value - betas.waist_cm) ** 2
        except (KeyError, TypeError):
            continue

        chest_value = entry.get("chest_cm")
        if isinstance(chest_value, (int, float)):
            squared_diff += (chest_value - betas.chest_cm) ** 2

        hip_value = entry.get("hip_cm")
        if isinstance(hip_value, (int, float)):
            squared_diff += (hip_value - betas.hips_cm) ** 2

        distance = squared_diff ** 0.5
        if distance < best_distance:
            best_distance = distance
            best_size = entry.get("size")

    if best_size is None:
        return SizeMatchResult(None, None, None, available_sizes, True)

    if best_distance > OUT_OF_RANGE_THRESHOLD_CM:
        return SizeMatchResult(None, None, None, available_sizes, True)

    confidence = max(0.0, 1.0 - (best_distance / OUT_OF_RANGE_THRESHOLD_CM))
    explanation = (
        f"Based on your measurements: chest ({betas.chest_cm}cm), waist ({betas.waist_cm}cm), "
        f"and hip ({betas.hips_cm}cm), size {best_size} is the best match."
    )
    return SizeMatchResult(best_size, round(confidence, 2), explanation, available_sizes, False)


def _strip_json_fences(text: str) -> str:
    return re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()


async def call_llm_with_fallback(messages: list[dict]) -> tuple[RecommendationOutput, str]:
    settings = get_settings()
    last_error = None

    if settings.deepseek_api_key:
        try:
            client = AsyncOpenAI(api_key=settings.deepseek_api_key, base_url="https://api.deepseek.com")
            resp = await client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Return ONLY a JSON object. It MUST include a key named exactly "
                            "'message' (string) with your reply text - not 'reply', not 'text', "
                            "not anything else. Other keys: action, recommended_size, "
                            "confidence_score, explanation, matched_category."
                        ),
                    }
                ] + messages,
                response_format={"type": "json_object"}
            )
            parsed = json.loads(_strip_json_fences(resp.choices[0].message.content))
            # DeepSeek sometimes names the reply field something other than
            # "message" (e.g. "reply") despite the instruction above -
            # normalize known variants before validating, instead of
            # failing the whole provider over a field-name mismatch.
            if "message" not in parsed:
                for alt_key in ("reply", "text", "response", "content"):
                    if alt_key in parsed:
                        parsed["message"] = parsed.pop(alt_key)
                        break
            response = RecommendationOutput.model_validate(parsed)
            response.provider = "DEEPSEEK"
            return response, "DEEPSEEK"
        except Exception as e:
            logger.warning(f"Provider DEEPSEEK failed: {type(e).__name__}: {e}")
            last_error = e

    raise RuntimeError(f"DeepSeek provider failed. Last error: {last_error}")


async def check_all_providers() -> list[dict]:
    settings = get_settings()
    results = []

    if settings.deepseek_api_key:
        try:
            client = AsyncOpenAI(api_key=settings.deepseek_api_key, base_url="https://api.deepseek.com")
            await client.chat.completions.create(model="deepseek-chat", messages=[{"role": "user", "content": "ping"}], max_tokens=10)
            results.append({"provider": "DEEPSEEK", "status": "ok"})
        except Exception as e:
            results.append({"provider": "DEEPSEEK", "status": "failed", "error": str(e)})
    else:
        results.append({"provider": "DEEPSEEK", "status": "not_configured", "error": "missing api_key"})

    return results


def build_general_instruction(available_categories: Optional[List[str]]) -> str:
    categories_str = ", ".join(available_categories) if available_categories else "no categories configured yet"
    base = (
        "You are Manikan AI, the interactive shopping and sizing assistant for an online "
        f"clothing store. Available store categories (EXACT strings, case-sensitive): {categories_str}.\n\n"
        "This is the GENERAL chat (not a specific product page). You have NO real size "
        "chart here - you can never compute or verify an exact fit. Exact sizing only "
        "happens later, on a specific product's own page.\n\n"
        "SCOPE - CRITICAL: You ONLY answer questions about fashion, clothing, sizing, "
        "outfit recommendations, and this store's catalog. If the user asks about "
        "anything outside fashion and clothing (geography, history, science, current "
        "events, general knowledge, etc.) you MUST reply ONLY with: \"I'm Manikan AI, "
        "your fashion and sizing assistant — I can only help with clothing "
        "recommendations and size matching. That question is outside my scope.\", "
        "action='provide_recommendation'. Never answer off-topic questions, even "
        "partially.\n\n"
        "FLOW:\n"
        "1. If the user describes a STYLE, OCCASION, or VIBE without naming one exact "
        "category (e.g. 'something formal', 'an outfit for a wedding'): ask which "
        "category they want, using 2-3 of the ACTUAL category names from the list "
        "above (never a hardcoded example category - always pull from what this "
        "store genuinely carries, so the question fits the real catalog rather than "
        "assuming who's asking or what's available). "
        "action='provide_recommendation', no products shown yet.\n"
        "2. If the user names or confirms a SPECIFIC category that exactly matches one "
        "from the list above (e.g. 'a blouse'): action='fetch_products', matched_category "
        "set to that EXACT string from the list, and a short 1-sentence intro (e.g. "
        "'Here are our blouses:'). You may casually ask if they know their usual size "
        "in the same message, purely as small talk - you will not act on their answer.\n"
        "3. If the user is just browsing generally with no occasion/category context at "
        "all (e.g. 'show me what you have'): action='fetch_products' with matched_category "
        "null (retrieval will ground it), short intro.\n"
        "4. If the user states anything about size or fit here - a label like 'Large'/"
        "'XL', raw measurements (height/weight/chest/waist/hips), or a question like "
        "'what size should I get' - you have NO real chart for any specific product to "
        "check it against in this general chat. Do NOT ask about confidence here, do "
        "NOT accept or state any size as fact. Immediately respond with "
        "action='provide_recommendation' (no products) and redirect them: 'Pick the "
        "item you like from the options and click **View Item** - I will calculate "
        "your exact size for that specific piece right there.' NEVER ask them to type "
        "in height/weight/measurements in this general chat - that only happens "
        "automatically after they click View Item on a product.\n"
        "5. action='fetch_products' means you are ACTIVELY showing items right now, in "
        "this exact response - product cards render ONLY for this action. Any question "
        "or clarification you're asking (not yet showing items) must use "
        "action='provide_recommendation' instead, or the cards shown will contradict "
        "what you just asked.\n"
        "6. Never invent product names, prices, stock, or a category not in the list "
        "above. If the user asks for something not carried, say so honestly and mention "
        "what IS available.\n\n"
        "BREVITY - CRITICAL: Keep your message to 1-2 short sentences MAX. Never list, "
        "name, or describe individual products in your text reply - if relevant items "
        "were retrieved, they will be shown to the user as visual cards separately, so "
        "your text should just be a brief intro or a short clarifying question. Do not "
        "repeat product names/descriptions from the retrieved-items context - that "
        "context is for you to understand what exists, not to recite back."
    )
    return base


def _last_user_query(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user" and isinstance(message.get("content"), str):
            return message["content"]
    return ""


def _trace(state: FitState, event: str, **fields: object) -> None:
    """Structured trace events can be correlated by Langfuse or any log collector."""
    logger.info("workflow_event=%s trace_id=%s %s", event, state["trace_id"], fields)


def _chart_from_variants(variants: list[dict]) -> list[dict]:
    return [
        {
            "size": variant.get("sizeLabel") or variant.get("size_label"),
            "chest_cm": variant.get("chestCm") if "chestCm" in variant else variant.get("chest_cm"),
            "waist_cm": variant.get("waistCm") if "waistCm" in variant else variant.get("waist_cm"),
            "hip_cm": variant.get("hipCm") if "hipCm" in variant else variant.get("hip_cm"),
        }
        for variant in variants
    ]


async def retrieve_rag_context(state: FitState) -> FitState:
    """Retrieve Store Service pgvector results, with request-local RAG as a safe fallback."""
    query = state["query"] or _last_user_query(state["messages"])
    state["query"] = query
    retrieved: list[dict] = []
    settings = get_settings()

    if settings.store_base_url and query:
        try:
            url = f"{get_settings().store_base_url}/api/products/search"
            async with httpx.AsyncClient(timeout=settings.store_service_rag_timeout_seconds) as client:
                response = await client.post(url, json={"queryText": query, "category": state.get("selected_category")})
                response.raise_for_status()
                payload = response.json()
            products = payload.get("products", [])
            if isinstance(products, list):
                retrieved = [product for product in products if isinstance(product, dict)]
            _trace(state, "rag_store_complete", candidates=len(retrieved))
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.warning("workflow_event=rag_store_failed trace_id=%s error=%s", state["trace_id"], type(exc).__name__)

    if not retrieved and state.get("catalog_products"):
        retrieved = await asyncio.to_thread(retrieve_relevant_products, query, state["catalog_products"])
        _trace(state, "rag_local_complete", candidates=len(retrieved))

    if state.get("product_id") and state.get("size_chart"):
        try:
            chart = json.loads(state["size_chart"] or "[]")
            if isinstance(chart, list) and not any(product.get("id") == state["product_id"] for product in retrieved):
                retrieved.insert(0, {"id": state["product_id"], "variants": chart})
        except json.JSONDecodeError:
            logger.warning("workflow_event=size_chart_invalid trace_id=%s", state["trace_id"])

    state["retrieved_products"] = retrieved
    return state


async def compute_size_math(state: FitState) -> FitState:
    """Calculate the nearest chart size and per-dimension deltas without LLM involvement."""
    measurements = state.get("user_measurements") or state.get("betas")
    chart_raw = state.get("size_chart")
    if not chart_raw:
        product = next((p for p in state["retrieved_products"] if p.get("id") == state.get("product_id")), None)
        if product and isinstance(product.get("variants"), list):
            chart_raw = json.dumps(_chart_from_variants(product["variants"]))

    # Only use the size-chart shortcut when the query is genuinely about
    # sizing/fashion. Generic questions like "what is the capital of egypt"
    # match _is_descriptive_question() (because of "what") but must NOT be
    # answered from the chart - they are out-of-scope and handled later.
    if state.get("product_id") and chart_raw and _is_descriptive_question(state["query"]) and _is_fashion_related(state["query"]):
        answer = _try_answer_from_size_chart_locally(state["query"], chart_raw)
        if answer:
            state["final_response"] = RecommendationOutput(action=ActionType.PROVIDE_RECOMMENDATION, message=answer, provider="STATIC-LOCAL")
            return state

    if not measurements or not chart_raw:
        state["size_math_result"] = None
        return state

    result = await asyncio.to_thread(compute_recommended_size, measurements, chart_raw)
    deltas: dict[str, float] = {}
    try:
        chart = json.loads(chart_raw)
        selected = next((row for row in chart if row.get("size") == result.recommended_size), {})
        for field, user_value in (("chest_cm", measurements.chest_cm), ("waist_cm", measurements.waist_cm), ("hip_cm", measurements.hips_cm)):
            value = selected.get(field)
            if isinstance(value, (int, float)):
                deltas[field] = round(value - user_value, 1)
    except (json.JSONDecodeError, TypeError, AttributeError):
        pass

    state["size_math_result"] = SizeMathResult(
        result.recommended_size, result.confidence_score, deltas, result.available_sizes, result.is_out_of_range
    ).__dict__
    _trace(state, "size_math_complete", recommended_size=result.recommended_size, out_of_range=result.is_out_of_range)
    return state


def _rule_based_response(state: FitState) -> RecommendationOutput:
    math = state.get("size_math_result")
    if math:
        if math["recommended_size"] and not math["is_out_of_range"]:
            confidence = math["confidence_score"] or 0.0
            deltas = ", ".join(f"{field} {value:+.1f}cm" for field, value in math["dimension_deltas"].items())
            return RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                recommended_size=math["recommended_size"],
                confidence_score=confidence,
                explanation=f"Nearest chart match; garment-minus-body deltas: {deltas or 'not available'}.",
                message=f"Based on the size chart, {math['recommended_size']} is your closest match ({round(confidence * 100)}% confidence).",
                provider="STATIC-CALC",
            )
        return RecommendationOutput(action=ActionType.PROVIDE_RECOMMENDATION, message="I couldn't find a size that fits your measurements closely enough.", provider="STATIC-CALC")
    categories = state.get("available_categories") or []
    query = state.get("query", "").lower()
    for category in categories:
        normalized = category.lower().rstrip("s")
        if normalized and normalized in query:
            return RecommendationOutput(
                action=ActionType.FETCH_PRODUCTS,
                matched_category=category,
                message=f"Here are our {category.lower()}.",
                provider="STATIC-LOCAL",
            )
    if categories:
        return RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message=f"Which category would you like to browse? We have {', '.join(categories[:3])}.",
            provider="STATIC",
        )
    return RecommendationOutput(action=ActionType.PROVIDE_RECOMMENDATION, message="Please select an item and provide its measurements so I can calculate your fit.", provider="STATIC")


# ── Out-of-scope pre-flight ────────────────────────────────────────────────
_OUT_OF_SCOPE_REPLY = (
    "I'm Manikan AI, your fashion and sizing assistant — I can only help with "
    "clothing recommendations, size matching, and outfit ideas. "
    "That question is outside my scope. Try asking me something like "
    "'What size blouse should I get?' or 'Show me your dresses.'"
)


async def fit_reasoning_agent(state: FitState) -> FitState:
    """Ask the LLM to explain math/fabric trade-offs; never let its failure break sizing."""
    if state.get("final_response"):
        return state

    # ── Out-of-scope guard (rule-based, before any LLM call) ──────────────
    # If the query contains a question marker but zero fashion/sizing keywords,
    # it is almost certainly off-topic. Return a deterministic refusal so we
    # never waste an LLM call or echo a size-chart result for e.g.
    # "what is the capital of egypt".
    query = state.get("query", "")
    if query and _is_descriptive_question(query) and not _is_fashion_related(query):
        state["reasoning_output"] = RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message=_OUT_OF_SCOPE_REPLY,
            provider="STATIC-OUT-OF-SCOPE",
        )
        return state

    # ── Direct/Click Sizing Guard (messages empty) ────────────────────────
    # If the user has sent no messages (just clicked "Calculate Size"),
    # there is no conversational query. Complete sizing immediately and
    # bypass any LLM calls entirely.
    if not state.get("messages") or len(state["messages"]) == 0:
        state["reasoning_output"] = _rule_based_response(state)
        return state

    if (
        state.get("product_id")
        and not state.get("product_detail_question")
        and not state.get("user_measurements")
        and not state.get("betas")
    ):
        label, confidence = _find_stated_size_and_confidence(state["messages"])
        if label and confidence is None:
            state["reasoning_output"] = RecommendationOutput(action=ActionType.PROVIDE_RECOMMENDATION, message=f"You mentioned {label} - how confident are you in that size, from 0-100%?", provider="STATIC-ASK-CONFIDENCE")
        elif label and confidence >= 80:
            state["reasoning_output"] = RecommendationOutput(action=ActionType.PROVIDE_RECOMMENDATION, recommended_size=label, confidence_score=confidence / 100, message=f"Your size is {label}.", provider="STATIC-LABEL-TRUSTED")
        else:
            state["reasoning_output"] = RecommendationOutput(action=ActionType.PROVIDE_RECOMMENDATION, message="Please enter your exact height, weight, chest, waist, and hip measurements so I can calculate your fit.", provider="STATIC-PRODUCT-MODE")
        return state

    context = format_retrieved_context(state["retrieved_products"])
    math = state.get("size_math_result")
    instruction = build_general_instruction(state.get("available_categories"))
    if math:
        instruction += f"\n\nFIT MATH (authoritative): {json.dumps(math)}. Use it to explain fabric/fit trade-offs. Do not invent measurements or sizes outside available_sizes."
    if context:
        instruction += "\n\n" + context

    try:
        response, provider = await call_llm_with_fallback([{"role": "system", "content": instruction}] + state["messages"])
        response.provider = provider
        if math and (response.recommended_size not in math["available_sizes"]):
            response.recommended_size = math["recommended_size"]
        state["reasoning_output"] = response
        _trace(state, "reasoning_complete", provider=provider)
    except Exception as exc:
        logger.warning("workflow_event=reasoning_fallback trace_id=%s error=%s", state["trace_id"], type(exc).__name__)
        state["reasoning_output"] = _rule_based_response(state)
    return state


async def format_response(state: FitState) -> FitState:
    """Normalize graph artifacts into the established widget response model."""
    response = state.get("final_response") or state.get("reasoning_output") or _rule_based_response(state)
    categories = state.get("available_categories") or []
    if response.matched_category and response.matched_category.strip().lower() not in {c.lower() for c in categories}:
        response.matched_category = None
        if response.action == ActionType.FETCH_PRODUCTS:
            response.action = ActionType.PROVIDE_RECOMMENDATION
    product_ids = [p["id"] for p in state["retrieved_products"] if isinstance(p.get("id"), str)]
    if product_ids and response.action == ActionType.FETCH_PRODUCTS:
        response.retrieved_product_ids = product_ids
    state["final_response"] = response
    state["structured_response"] = response  # Existing main.py contract.
    _trace(state, "response_formatted", provider=response.provider, action=response.action.value)
    return state


workflow = StateGraph(FitState)
workflow.add_node("retrieve_rag_context", retrieve_rag_context)
workflow.add_node("compute_size_math", compute_size_math)
workflow.add_node("fit_reasoning_agent", fit_reasoning_agent)
workflow.add_node("format_response", format_response)
workflow.set_entry_point("retrieve_rag_context")
workflow.add_edge("retrieve_rag_context", "compute_size_math")
workflow.add_edge("compute_size_math", "fit_reasoning_agent")
workflow.add_edge("fit_reasoning_agent", "format_response")
workflow.add_edge("format_response", END)
recommendation_graph = workflow.compile()


async def call_conversational_agent(state: FitState) -> FitState:
    """Compatibility shim for direct callers of the pre-graph agent function."""
    state.setdefault("query", _last_user_query(state.get("messages", [])))
    state.setdefault("product_detail_question", False)
    state.setdefault("user_measurements", state.get("betas"))
    state.setdefault("retrieved_products", [])
    state.setdefault("size_math_result", None)
    state.setdefault("reasoning_output", None)
    state.setdefault("final_response", None)
    state.setdefault("trace_id", "direct-agent-call")
    state.setdefault("structured_response", None)
    await retrieve_rag_context(state)
    await compute_size_math(state)
    await fit_reasoning_agent(state)
    return await format_response(state)
