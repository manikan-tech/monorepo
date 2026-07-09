from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .agent import FitState, recommendation_graph

app = FastAPI(
    title="Manikan Recommendation Service",
    description="Pure-AI size recommendation — zero database, GPT-4o powered.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

class SizeChartEntry(BaseModel):
    sizeLabel: str = Field(..., description="Size label, e.g. 'XS', 'S', 'M', 'L', 'XL'.")
    chestCm: float = Field(..., description="Garment chest measurement in centimetres.")
    waistCm: float = Field(..., description="Garment waist measurement in centimetres.")
    hipCm: float = Field(..., description="Garment hip measurement in centimetres.")
    lengthCm: float = Field(..., description="Total garment length in centimetres.")
    inseamCm: float = Field(..., description="Inseam length in centimetres.")

class RecommendRequest(BaseModel):
    session_id: str = Field(..., description="Unique session ID for this shopper interaction.")
    betas: list[float] = Field(..., min_length=10, max_length=10, description="10 SMPL body-shape parameters.")
    retailer_id: str = Field(..., description="UUID of the retailer.")
    product_id: str = Field(..., description="UUID of the product.")
    size_chart: list[SizeChartEntry] = Field(..., min_length=1, description="Product size chart forwarded by Store Service.")

class RecommendResponse(BaseModel):
    session_id: str
    product_id: str
    recommended_size: str
    confidence_score: float
    explanation: str
    alternative_size: Optional[str]

@app.get("/", tags=["health"])
def health_check() -> dict[str, str]:
    return {
        "service": "recommendation-service",
        "status": "active",
        "version": "2.0.0",
        "description": "Pure-AI, zero-database GPT-4o size recommendation",
    }

@app.post("/recommend", response_model=RecommendResponse, tags=["recommendation"])
async def recommend(body: RecommendRequest) -> RecommendResponse:
    size_chart_dicts = [entry.model_dump() for entry in body.size_chart]

    initial_state: FitState = {
        "session_id": body.session_id,
        "product_id": body.product_id,
        "retailer_id": body.retailer_id,
        "betas": body.betas,
        "size_chart": size_chart_dicts,
        "result": None
    }

    final_state: FitState = await recommendation_graph.ainvoke(initial_state)
    result = final_state["result"]
    
    if result is None:
        raise HTTPException(status_code=500, detail="Agent returned no recommendation.")

    return RecommendResponse(
        session_id=body.session_id,
        product_id=body.product_id,
        recommended_size=result.recommended_size,
        confidence_score=result.confidence_score,
        explanation=result.explanation,
        alternative_size=result.alternative_size,
    )