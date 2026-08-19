import asyncio
import json
import logging
import re
import typing_extensions
from typing import Optional, List

from openai import AsyncOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from langgraph.graph import StateGraph, END

from .config import get_settings
from .schemas import ActionType, RecommendationOutput, MeasurementInput
from .Bedrock import _call_bedrock_gateway
from .retrieval import retrieve_relevant_products, format_retrieved_context

logger = logging.getLogger("manikan.agent")


class FitState(typing_extensions.TypedDict):
    messages: list[dict]
    product_id: Optional[str]
    betas: Optional[MeasurementInput]
    size_chart: Optional[str]
    intent: Optional[str]
    selected_category: Optional[str]
    available_categories: Optional[List[str]]
    catalog_products: Optional[List[dict]]
    structured_response: Optional[RecommendationOutput]


from dataclasses import dataclass


@dataclass
class SizeMatchResult:
    recommended_size: Optional[str]
    confidence_score: Optional[float]
    explanation: Optional[str]
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


def compute_recommended_size(betas: MeasurementInput, size_chart_raw: str) -> SizeMatchResult:
    try:
        size_chart = json.loads(size_chart_raw)
    except (json.JSONDecodeError, TypeError):
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
        return SizeMatchResult(None, None, None, available_sizes, True)

    if best_distance > OUT_OF_RANGE_THRESHOLD_CM:
        return SizeMatchResult(None, None, None, available_sizes, True)

    confidence = max(0.0, 1.0 - (best_distance / OUT_OF_RANGE_THRESHOLD_CM))
    explanation = (
        f"Based on your measurements: chest ({betas.chest_cm}cm), waist ({betas.waist_cm}cm), "
        f"and hip ({betas.hips_cm}cm), size {best_size} is the best match."
    )
    return SizeMatchResult(best_size, round(confidence, 2), explanation, available_sizes, False)


def _build_gemini_client(api_key: str) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model="gemini-flash-latest",
        google_api_key=api_key,
        timeout=10,
        max_retries=0,
    )


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

    try:
        response = await _call_bedrock_gateway(messages)
        response.provider = "BEDROCK"
        return response, "BEDROCK"
    except Exception as e:
        logger.warning(f"Provider BEDROCK failed: {type(e).__name__}: {e}")
        last_error = e

    for key in settings.gemini_keys:
        try:
            llm = _build_gemini_client(key)
            structured_llm = llm.with_structured_output(RecommendationOutput)
            response = await structured_llm.ainvoke(messages)
            response.provider = "GEMINI"
            return response, "GEMINI"
        except Exception as e:
            logger.warning(f"Provider GEMINI failed: {type(e).__name__}: {e}")
            last_error = e
            continue

    try:
        ollama_llm = ChatOllama(model=settings.ollama_model, base_url=settings.ollama_base_url)
        structured_llm = ollama_llm.with_structured_output(RecommendationOutput)
        response = await asyncio.wait_for(structured_llm.ainvoke(messages), timeout=10)
        response.provider = "OLLAMA-FALLBACK"
        return response, "OLLAMA-FALLBACK"
    except Exception as e:
        logger.warning(f"Provider OLLAMA-FALLBACK failed: {type(e).__name__}: {e}")
        last_error = e

    raise RuntimeError(f"All LLM providers failed. Last error: {last_error}")


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

    if getattr(settings, "bedrock_base_url", None) and getattr(settings, "bedrock_api_key", None):
        try:
            await _call_bedrock_gateway([{"role": "user", "content": "ping"}])
            results.append({"provider": "BEDROCK", "status": "ok"})
        except Exception as e:
            results.append({"provider": "BEDROCK", "status": "failed", "error": str(e)})
    else:
        results.append({"provider": "BEDROCK", "status": "not_configured", "error": "missing base_url or api_key"})

    for idx, key in enumerate(settings.gemini_keys, start=1):
        try:
            llm = _build_gemini_client(key)
            await llm.ainvoke("ping")
            results.append({"provider": f"GEMINI_KEY_{idx}", "status": "ok"})
        except Exception as e:
            results.append({"provider": f"GEMINI_KEY_{idx}", "status": "failed", "error": str(e)})

    try:
        ollama_llm = ChatOllama(model=settings.ollama_model, base_url=settings.ollama_base_url)
        await asyncio.wait_for(ollama_llm.ainvoke("ping"), timeout=10)
        results.append({"provider": "OLLAMA", "status": "ok"})
    except Exception as e:
        results.append({"provider": "OLLAMA", "status": "failed", "error": str(e)})

    return results


def build_general_instruction(available_categories: Optional[List[str]]) -> str:
    categories_str = ", ".join(available_categories) if available_categories else "no categories configured yet"
    base = (
        "You are Manikan AI, the interactive shopping and sizing assistant for an online "
        f"clothing store. Available store categories (EXACT strings, case-sensitive): {categories_str}.\n\n"
        "This is the GENERAL chat (not a specific product page). You have NO real size "
        "chart here - you can never compute or verify an exact fit. Exact sizing only "
        "happens later, on a specific product's own page.\n\n"
        "FLOW:\n"
        "1. If the user describes a STYLE, OCCASION, or VIBE without naming one exact "
        "category (e.g. 'something formal', 'an outfit for a wedding'): ask which "
        "category they want from what's relevant and available (e.g. 'Are you thinking "
        "a blouse or a skirt?'). action='provide_recommendation', no products shown yet.\n"
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


async def call_conversational_agent(state: FitState) -> FitState:
    product_id = state.get("product_id")
    betas = state.get("betas")
    size_chart = state.get("size_chart")

    # On a specific product page, waiting on measurements: check first
    # whether the user stated a size label (e.g. "I'm XL") instead of
    # filling in real measurements - if so, ask how confident they are,
    # and only trust the label (skip the real chart calculation) at
    # high confidence. This is the user's own self-reported estimate,
    # not an AI-invented guess - different from hallucinating a size.
    if product_id and size_chart and not betas:
        stated_label, confidence_pct = _find_stated_size_and_confidence(state["messages"])

        if stated_label and confidence_pct is not None:
            if confidence_pct >= 80:
                state["structured_response"] = RecommendationOutput(
                    action=ActionType.PROVIDE_RECOMMENDATION,
                    recommended_size=stated_label,
                    message=f"Your size is {stated_label}.",
                    provider="STATIC-LABEL-TRUSTED",
                    confidence_score=confidence_pct / 100,
                )
            else:
                state["structured_response"] = RecommendationOutput(
                    action=ActionType.PROVIDE_RECOMMENDATION,
                    message="No worries - please enter your exact height, weight, chest, and waist measurements below so I can calculate your precise size for this item.",
                    provider="STATIC-LABEL-UNTRUSTED",
                )
            return state

        if stated_label and confidence_pct is None:
            state["structured_response"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                message=f"You mentioned {stated_label} - how confident are you in that size, from 0-100%?",
                provider="STATIC-ASK-CONFIDENCE",
            )
            return state

        state["structured_response"] = RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message="Please enter your height, weight, chest, and waist measurements below, and I'll calculate your exact size and confidence score.",
            provider="STATIC-PRODUCT-MODE",
        )
        return state

    # On a specific product page, measurements given: deterministic calculation
    if betas and size_chart:
        result = compute_recommended_size(betas, size_chart)

        if result.recommended_size and not result.is_out_of_range:
            confidence_pct = round((result.confidence_score or 0.0) * 100)
            message = f"Based on your measurements, size {result.recommended_size} is your best match ({confidence_pct}% confidence). {result.explanation}"
            state["structured_response"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                recommended_size=result.recommended_size,
                message=message,
                provider="STATIC-CALC",
                confidence_score=result.confidence_score,
                explanation=result.explanation,
            )
        else:
            # Honest "not available in your size" - a plain message, no
            # automatic alternate-product browsing on a product-specific page.
            state["structured_response"] = RecommendationOutput(
                action=ActionType.PROVIDE_RECOMMENDATION,
                recommended_size=None,
                message="I'm sorry, but based on your measurements, this item doesn't come in a size that would fit you well.",
                provider="STATIC-CALC",
            )
        return state

    available_categories = state.get("available_categories") or []

    # RAG: for open-ended style questions, ground the LLM's answer in the
    # retailer's REAL product descriptions (retrieved by TF-IDF similarity
    # to the user's message) instead of letting it improvise style advice
    # about items that may not exist. Size charts and categories stay
    # exact-match lookups (see above) - this is specifically for the
    # free-text "what would suit me" kind of question.
    last_user_text = ""
    for m in reversed(state["messages"]):
        if m.get("role") == "user":
            last_user_text = m.get("content") or ""
            break
    retrieved = retrieve_relevant_products(last_user_text, state.get("catalog_products"))
    retrieval_context = format_retrieved_context(retrieved)

    instruction_text = build_general_instruction(available_categories)
    if retrieval_context:
        instruction_text += "\n\n" + retrieval_context
    instruction = {"role": "system", "content": instruction_text}
    response, provider_tag = await call_llm_with_fallback([instruction] + state["messages"])
    response.provider = provider_tag

    # Defensive guard: if the LLM's matched_category doesn't exactly match
    # (case-insensitive) anything in available_categories, drop it rather
    # than let a mismatched/hallucinated category reach the widget's
    # product filter.
    if response.matched_category:
        matched_lower = response.matched_category.strip().lower()
        valid_lower = {c.lower() for c in available_categories}
        if matched_lower not in valid_lower:
            logger.warning(
                f"Dropping matched_category '{response.matched_category}' - not in "
                f"available_categories {available_categories}"
            )
            response.matched_category = None
            if response.action == ActionType.FETCH_PRODUCTS:
                response.action = ActionType.PROVIDE_RECOMMENDATION
                response.message = (
                    f"Could you tell me which of these categories you're looking for? "
                    f"{', '.join(available_categories)}"
                )

    # Attach the RAG-retrieved product ids so the widget can render visual
    # cards (image/price/link) from its own already-cached product data -
    # the LLM's text reply stays a short intro, never the source of the
    # product details shown.
    # CRITICAL: only when the LLM itself decided action='fetch_products'
    # (i.e. it's actively suggesting items now) - never on a clarifying
    # question or general chat turn, even if the retrieval step found a
    # loose text match. This is what was causing cards to show up
    # disconnected from what the text was actually saying.
    if retrieved and response.action == ActionType.FETCH_PRODUCTS:
        response.retrieved_product_ids = [p["id"] for p in retrieved if p.get("id")]

    state["structured_response"] = response
    return state


workflow = StateGraph(FitState)
workflow.add_node("agent", call_conversational_agent)
workflow.set_entry_point("agent")
workflow.add_edge("agent", END)
recommendation_graph = workflow.compile()