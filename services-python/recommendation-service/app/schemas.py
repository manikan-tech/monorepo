from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ActionType(str, Enum):
    ASK_MEASUREMENTS = "ask_measurements"
    PROVIDE_RECOMMENDATION = "provide_recommendation"
    FETCH_PRODUCTS = "fetch_products"
    REDIRECT_TO_PRODUCT = "redirect_to_product"
    REQUEST_DATA = "request_data"


class MeasurementInput(BaseModel):
    # Named fields instead of a positional list, so any retailer integration
    # can send these in any order without silently breaking the calculation
    height_cm: float
    weight_kg: float
    chest_cm: float
    waist_cm: float
    hips_cm: float


class RecommendationOutput(BaseModel):
    action: ActionType = Field(description="The action the widget should take next")
    recommended_size: Optional[str] = Field(None)
    message: str = Field(description="Message for the user")
    link: Optional[str] = Field(None)
    provider: Optional[str] = Field(None, description="Which LLM provider produced this response")
    confidence_score: Optional[float] = Field(None, description="0-1 confidence in the size match")
    explanation: Optional[str] = Field(None, description="Short reasoning behind the recommendation")