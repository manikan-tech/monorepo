from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any

app = FastAPI(
    title="Manikan Recommendation Service",
    description="Service for AI Agent and LangGraph personalization",
    version="0.1.0"
)

class RecommendationQuery(BaseModel):
    user_id: str
    body_shape_parameters: List[float]
    preferences: List[str]

@app.get("/")
def read_root():
    return {"service": "recommendation-service", "status": "active", "description": "AI Agent & LangGraph logic API"}

@app.post("/recommend/items")
def recommend_items(query: RecommendationQuery) -> Dict[str, Any]:
    try:
        # Mock recommendation logic
        # Will integrate LangGraph agent later
        recommended_outfits = [
            {"item_id": "outfit_01", "name": "Classic Fit Suit", "match_confidence": 0.95},
            {"item_id": "outfit_02", "name": "Minimalist Casual", "match_confidence": 0.88}
        ]
        return {
            "status": "success",
            "user_id": query.user_id,
            "recommendations": recommended_outfits
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
