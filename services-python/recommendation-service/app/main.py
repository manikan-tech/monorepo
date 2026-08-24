import hmac
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
import time
from collections import defaultdict, deque
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .agent import FitState, recommendation_graph, check_all_providers
from .config import get_settings
from .schemas import ActionType, MeasurementInput

logger = logging.getLogger("manikan.recommendation")

app = FastAPI(
    title="Manikan Recommendation Service",
    description="AI recommendation engine with multi-tier LLM fallback",
    version="3.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins_list,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_RATE_LIMIT_MAX_REQUESTS = 10
_RATE_LIMIT_WINDOW_SECONDS = 60
_request_log: dict[str, deque] = defaultdict(deque)


def _check_rate_limit(session_id: str) -> None:
    now = time.time()
    log = _request_log[session_id]
    while log and now - log[0] > _RATE_LIMIT_WINDOW_SECONDS:
        log.popleft()
    if len(log) >= _RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail="Too many requests - please slow down a moment and try again.",
        )
    log.append(now)


_usage_log: deque = deque()
_ANOMALY_WINDOW_SECONDS = 3600
_ANOMALY_THRESHOLD = 200


def _track_usage() -> None:
    now = time.time()
    _usage_log.append(now)
    while _usage_log and now - _usage_log[0] > _ANOMALY_WINDOW_SECONDS:
        _usage_log.popleft()
    if len(_usage_log) > _ANOMALY_THRESHOLD:
        logger.warning(
            f"Usage anomaly: {len(_usage_log)} requests in the last hour "
            f"(threshold {_ANOMALY_THRESHOLD}). Review for possible abuse."
        )


async def verify_internal_key(x_manikan_internal_key: str = Header(default="")) -> None:
    """
    Zero Trust Proxy Gate. This service no longer accepts direct client connections.
    It expects the Next.js proxy to validate the client's API key, quotas, and subscription,
    and then forward the request using the securely injected internal shared secret.
    """
    settings = get_settings()
    candidates = [key for key in (settings.recommend_service_key, settings.recommend_service_key_previous) if key]
    if not candidates or not any(
        hmac.compare_digest(x_manikan_internal_key, key) for key in candidates
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")
    _track_usage()


class ChatRecommendRequest(BaseModel):
    session_id: str
    messages: List[Dict[str, Any]]
    betas: Optional[MeasurementInput] = None
    product_id: Optional[str] = None
    # Set only by the authenticated Store proxy when the shopper explicitly
    # asks for information about the selected product, rather than sizing.
    product_detail_question: bool = False
    retailer_id: Optional[str] = None
    size_chart: Optional[str] = None
    intent: Optional[str] = "general"
    selected_category: Optional[str] = None
    available_categories: Optional[List[str]] = None
    # Compact catalog (id, name, category, description) used for RAG
    # retrieval on open-ended style questions - not stored, not persisted,
    # used in-memory for this one request only.
    catalog_products: Optional[List[Dict[str, Any]]] = None


class ChatRecommendResponse(BaseModel):
    session_id: str
    success: bool
    reply: str
    action: ActionType
    recommended_size: Optional[str] = None
    link: Optional[str] = None
    provider: Optional[str] = None
    confidence_score: Optional[float] = None
    explanation: Optional[str] = None
    matched_category: Optional[str] = None
    retrieved_product_ids: Optional[List[str]] = None
    error_code: Optional[str] = None


@app.get("/health", tags=["health"])
async def health_check():
    provider_results = await check_all_providers()
    active_provider = next((p["provider"] for p in provider_results if p["status"] == "ok"), None)

    return {
        "service": "manikan-recommendation-service",
        "status": "healthy" if active_provider else "degraded",
        "active_provider": active_provider,
        "providers": provider_results,
    }


@app.post(
    "/recommend",
    response_model=ChatRecommendResponse,
    tags=["recommendation"],
    dependencies=[Depends(verify_internal_key)],
)
async def recommend(body: ChatRecommendRequest) -> ChatRecommendResponse:
    _check_rate_limit(body.session_id)
    logger.debug(f"Received request: session={body.session_id} intent={body.intent}")

    initial_state: FitState = {
        "messages": body.messages,
        "product_id": body.product_id,
        "product_detail_question": body.product_detail_question,
        "query": next(
            (
                message["content"]
                for message in reversed(body.messages)
                if message.get("role") == "user" and isinstance(message.get("content"), str)
            ),
            "",
        ),
        "user_measurements": body.betas,
        "betas": body.betas,
        "size_chart": body.size_chart,
        "intent": body.intent,
        "selected_category": body.selected_category,
        "available_categories": body.available_categories,
        "catalog_products": body.catalog_products,
        "retrieved_products": [],
        "size_math_result": None,
        "reasoning_output": None,
        "final_response": None,
        "trace_id": body.session_id,
        "structured_response": None,
    }

    try:
        final_state = await recommendation_graph.ainvoke(initial_state)
        res = final_state.get("structured_response")

        if not res:
            raise ValueError("Agent returned no structured_response")

        return ChatRecommendResponse(
            session_id=body.session_id,
            success=True,
            reply=res.message,
            action=res.action,
            recommended_size=res.recommended_size,
            link=res.link,
            provider=res.provider,
            confidence_score=res.confidence_score,
            explanation=res.explanation,
            matched_category=res.matched_category,
            retrieved_product_ids=res.retrieved_product_ids,
        )
    except Exception as e:
        logger.error(f"Workflow execution failed: {e}", exc_info=True)
        fallback_action = (
            ActionType.FETCH_PRODUCTS if body.intent == "search" else ActionType.PROVIDE_RECOMMENDATION
        )
        return ChatRecommendResponse(
            session_id=body.session_id,
            success=False,
            reply="AI service is currently recalibrating. Please try again in a moment.",
            action=fallback_action,
            provider="EMERGENCY-FALLBACK",
            error_code=type(e).__name__,
        )
