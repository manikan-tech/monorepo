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
    matched_category: Optional[str] = Field(
        None, description="If action=fetch_products, the exact category string from available_categories the user wants"
    )
    # Product ids retrieved by RAG (see retrieval.py) for open-ended style
    # questions - the widget renders these as visual cards using its own
    # already-cached product data (image, price, slug), not text the LLM
    # composed itself. Kept separate from matched_category's exact-lookup
    # flow.
    retrieved_product_ids: Optional[list[str]] = Field(None)