import httpx
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .agent import FitState, recommendation_graph, ProductRecommendation
from .config import get_settings

app = FastAPI(
    title="Manikan Recommendation Service",
    description="Conversational Pure-AI size recommendation — multi-LLM adaptive architecture (Multi-tier Cloud Gateway with automatic Ollama fallback) via JS Widget.",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# --- API Models ---

class ChatRecommendRequest(BaseModel):
    session_id: str = Field(..., description="Unique session ID for tracking the chatbot conversation.")
    messages: List[Dict[str, Any]] = Field(..., description="The chat history between the user and the chatbot.")
    betas: Optional[List[float]] = Field(None, description="10 SMPL body-shape parameters.")
    retailer_id: Optional[str] = Field(None, description="UUID of the retailer.")
    product_id: Optional[str] = Field(None, description="UUID of the product.")
    size_chart: Optional[str] = Field(None, description="Product size chart passed as raw CSV string.")


class ChatRecommendResponse(BaseModel):
    session_id: str
    reply: str = Field(..., description="The conversational response from the AI Agent.")
    recommended_size: Optional[str] = Field(None, description="The detected size calculated via Python Fit Engine.")
    confidence_score: Optional[float] = Field(None, description="Confidence score from 0.0 to 1.0.")
    explanation: Optional[str] = Field(None, description="Technical reason for this size recommendation.")
    alternative_size: Optional[str] = Field(None, description="The second closest matching size as an alternative.")
    recommended_products: Optional[List[ProductRecommendation]] = Field(None, description="List of recommended products if size is already known.")


# --- Dynamic Provider & Ironclad Health Check Endpoint ---

@app.get("/", tags=["health"])
async def health_check() -> dict:
    settings = get_settings()
    
    cloud_status = "unconfigured"
    ollama_status = "Standby (Only triggers if Multi-tier Cloud Chain fails)"
    
    if settings.openai_api_key and not settings.openai_api_key.startswith("your-"):
        cloud_status = f"Active Chain Enabled (Primary: {settings.openai_model})"
        active_runtime_provider = "Multi-tier Cloud Gateway Chain"
        system_status = "healthy"
    else:
        cloud_status = "Disabled or Missing Key"
        active_runtime_provider = "Ollama Local Fallback (Forced via config)"
        system_status = "Running on local backup"

    return {
        "service": "manikan-recommendation-service",
        "status": system_status,
        "version": "3.0.0",
        "active_primary_provider": active_runtime_provider,
        "cloud_gateway_chain": cloud_status,
        "local_fallback_engine": ollama_status,
        "langgraph_workflow": "active" if recommendation_graph is not None else "failed",
    }


# --- Recommendation Endpoint ---

@app.post("/recommend", response_model=ChatRecommendResponse, tags=["recommendation"])
async def recommend(body: ChatRecommendRequest) -> ChatRecommendResponse:
    if body.betas is not None and len(body.betas) != 10:
        raise HTTPException(
            status_code=420, 
            detail="The 'betas' parameter must contain exactly 10 floating point values."
        )

    initial_state: FitState = {
        "session_id": body.session_id,
        "messages": body.messages,
        "product_id": body.product_id,
        "retailer_id": body.retailer_id,
        "betas": body.betas,
        "size_chart": body.size_chart,
        "known_size": None,
        "result": None,
        "recommended_products": None
    }

    try:
        final_state: FitState = recommendation_graph.invoke(initial_state)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent workflow execution failed: {str(e)}")

    result = final_state.get("result")
    recommended_products = final_state.get("recommended_products")
    
    if result is None:
        last_ai_message = final_state["messages"][-1]["content"] if final_state["messages"] else "How can I help you today?"
        return ChatRecommendResponse(
            session_id=body.session_id,
            reply=last_ai_message,
            recommended_products=recommended_products
        )

    return ChatRecommendResponse(
        session_id=body.session_id,
        reply=result.explanation,
        recommended_size=result.recommended_size,
        confidence_score=result.confidence_score,
        explanation=result.explanation,
        alternative_size=result.alternative_size,
        recommended_products=None
    )