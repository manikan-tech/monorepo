from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any

app = FastAPI(
    title="Manikan Tryon Service",
    description="Service for VTON & Replicate integration",
    version="0.1.0"
)

class TryonRequest(BaseModel):
    person_image_url: str
    garment_image_url: str

@app.get("/")
def read_root():
    return {"service": "tryon-service", "status": "active", "description": "VTON & Replicate integration API"}

@app.post("/tryon/generate")
def generate_tryon(request: TryonRequest) -> Dict[str, Any]:
    try:
        # Mock replicate API integration for VTON
        return {
            "status": "queued",
            "prediction_id": "mock_replicate_pred_12345",
            "info": "To trigger actual model, configure REPLICATE_API_TOKEN environment variable."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
