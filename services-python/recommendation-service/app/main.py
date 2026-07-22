import logging
from typing import Optional, List, Dict, Any
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .agent import FitState, recommendation_graph, check_all_providers
from .schemas import ActionType, MeasurementInput

logger = logging.getLogger("manikan.recommendation")

app = FastAPI(
    title="Manikan Recommendation Service",
    description="AI recommendation engine with multi-tier LLM fallback",
    version="3.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class ChatRecommendRequest(BaseModel):
    session_id: str
    messages: List[Dict[str, Any]]
    betas: Optional[MeasurementInput] = None
    product_id: Optional[str] = None
    retailer_id: Optional[str] = None
    size_chart: Optional[str] = None
    intent: Optional[str] = "general"
    selected_category: Optional[str] = None
    available_categories: Optional[List[str]] = None


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


@app.post("/recommend", response_model=ChatRecommendResponse, tags=["recommendation"])
async def recommend(body: ChatRecommendRequest) -> ChatRecommendResponse:
    logger.debug(f"Received request: session={body.session_id} intent={body.intent}")

    initial_state: FitState = {
        "messages": body.messages,
        "product_id": body.product_id,
        "betas": body.betas,
        "size_chart": body.size_chart,
        "intent": body.intent,
        "selected_category": body.selected_category,
        "available_categories": body.available_categories,
        "structured_response": None,
    }

    try:
        # ainvoke keeps the FastAPI event loop free while the graph runs,
        # even though the node function itself is a plain async function
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
        )
    except Exception as e:
        logger.error(f"Workflow execution failed: {e}", exc_info=True)
        # Keep the action consistent with what the widget expected for this intent,
        # instead of always returning the same action regardless of what failed
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