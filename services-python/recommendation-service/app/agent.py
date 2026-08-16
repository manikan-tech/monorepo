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


OUT_OF_RANGE_THRESHOLD_CM = 15.0


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
        "CRITICAL RULE - NEVER INVENT DATA: Never state a specific size (S, M, L, XL, "
        "a number, etc.) unless the user explicitly typed that size themselves in this "
        "conversation, OR it was computed from real measurements you were given. If you "
        "don't actually know the user's size yet, do not mention any size at all - ask "
        "for it instead. Never invent product names, prices, or stock availability either.\n\n"
        "FLOW:\n"
        "1. If the user names an item/category (e.g. 'I want a blouse') without giving a "
        "size or measurements: respond with action='provide_recommendation' and ask about "
        "their style preference AND whether they know their size for it - don't show "
        "products yet.\n"
        "2. If the user states a size label (e.g. 'Large') for a specific category: ask "
        "'How confident are you in this size, from 0-100%?' - respond with "
        "action='provide_recommendation'.\n"
        "3. Once the user gives a confidence percentage for a stated label:\n"
        "   - If confidence >= 70%: trust the label. Set action='fetch_products', "
        "recommended_size to the exact label the user gave, and matched_category to the "
        "EXACT matching string from the categories list above.\n"
        "   - If confidence < 70%: do NOT trust the label. Set action='ask_measurements' "
        "and ask for their real height, weight, chest, waist measurements instead - a "
        "label they're unsure about isn't reliable enough to shop by.\n"
        "4. If the user is just browsing/asking to see items with NO fit question implied "
        "at all (e.g. 'show me your shirts'): action='fetch_products', matched_category "
        "set to the exact matching category string, recommended_size left null.\n"
        "5. Otherwise: action='provide_recommendation', reply conversationally.\n"
        "matched_category must ALWAYS be copied EXACTLY (same spelling/case) from the "
        "categories list - never invent a category not in that list. If the user asks for "
        "something not in the list, say so honestly and mention what IS available instead."
    )
    return base


async def call_conversational_agent(state: FitState) -> FitState:
    product_id = state.get("product_id")
    betas = state.get("betas")
    size_chart = state.get("size_chart")

    # On a specific product page, waiting on measurements: prompt for them
    if product_id and size_chart and not betas:
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
    instruction = {"role": "system", "content": build_general_instruction(available_categories)}
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

    state["structured_response"] = response
    return state


workflow = StateGraph(FitState)
workflow.add_node("agent", call_conversational_agent)
workflow.set_entry_point("agent")
workflow.add_edge("agent", END)
recommendation_graph = workflow.compile()