from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .agent import FitState, recommendation_graph 

app = FastAPI(
    title="Manikan Recommendation Service",
    description="Conversational Pure-AI size recommendation — zero database, GPT-4o powered via JS Widget.",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

class ChatRecommendRequest(BaseModel):
    session_id: str = Field(..., description="Unique session ID for tracking the chatbot conversation.")
    messages: list[dict] = Field(..., description="The chat history between the user and the chatbot.")
    betas: Optional[list[float]] = Field(None, min_length=10, max_length=10, description="10 SMPL body-shape parameters.")
    retailer_id: Optional[str] = Field(None, description="UUID of the retailer.")
    product_id: Optional[str] = Field(None, description="UUID of the product.")
    size_chart: Optional[str] = Field(None, description="Product size chart passed as raw CSV string.")

class ChatRecommendResponse(BaseModel):
    session_id: str
    reply: str = Field(..., description="The conversational response from the AI Agent.")
    recommended_size: Optional[str] = Field(None, description="The detected size if calculated.")
    confidence_score: Optional[float] = Field(None, description="Confidence score from 0.0 to 1.0.")
    explanation: Optional[str] = Field(None, description="Technical reason for this size recommendation.")

@app.get("/", tags=["health"])
def health_check() -> dict[str, str]:
    return {
        "service": "recommendation-service",
        "status": "active",
        "version": "3.0.0",
        "description": "Conversational Pure-AI, zero-database SaaS Widget Backend",
    }

@app.post("/recommend", response_model=ChatRecommendResponse, tags=["recommendation"])
async def recommend(body: ChatRecommendRequest) -> ChatRecommendResponse:
    
    initial_state: FitState = {
        "session_id": body.session_id,
        "messages": body.messages,
        "product_id": body.product_id,
        "retailer_id": body.retailer_id,
        "betas": body.betas,
        "size_chart": body.size_chart,
        "result": None
    }

    final_state: FitState = await recommendation_graph.ainvoke(initial_state)
    result = final_state.get("result")
    
    if result is None:
        last_ai_message = final_state["messages"][-1]["content"] if final_state["messages"] else "How can I help you today?"
        return ChatRecommendResponse(
            session_id=body.session_id,
            reply=last_ai_message
        )

    return ChatRecommendResponse(
        session_id=body.session_id,
        reply=result.explanation,
        recommended_size=result.recommended_size,
        confidence_score=result.confidence_score,
        explanation=result.explanation
    )