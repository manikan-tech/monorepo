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
    # Only meaningful when action=fetch_products. The exact category string
    # from the available_categories list the user is shopping for - lets
    # the widget filter /api/products by real category instead of guessing
    # from free-text keyword matching (which breaks for non-English input
    # and any category name that isn't a hardcoded keyword).
    matched_category: Optional[str] = Field(
        None, description="If action=fetch_products, the exact category string from available_categories the user wants"
    )

    # NOTE: deliberately no auto-downgrade validator here (a previous
    # iteration force-changed action='fetch_products' to
    # 'provide_recommendation' whenever recommended_size was empty - this
    # broke plain category browsing, which legitimately has no size yet).
    # Keeping the model itself passive and letting the prompt instructions
    # in agent.py control behavior is safer and easier to reason about.