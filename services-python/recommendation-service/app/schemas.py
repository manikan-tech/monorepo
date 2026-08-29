from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ActionType(str, Enum):
    ASK_MEASUREMENTS = "ask_measurements"
    PROVIDE_RECOMMENDATION = "provide_recommendation"
    FETCH_PRODUCTS = "fetch_products"
    REDIRECT_TO_PRODUCT = "redirect_to_product"
    REQUEST_DATA = "request_data"


class ActiveSearch(BaseModel):
    query: str
    department: Optional[str] = None
    selected_category: Optional[str] = None
    requested_material: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    style_occasion: Optional[str] = None


class PendingType(str, Enum):
    CONFIRM_MEASUREMENTS = "confirm_measurements"
    REQUEST_CONFIDENCE = "request_confidence"
    AWAITING_DEPARTMENT = "awaiting_department"
    AWAITING_CATEGORY = "awaiting_category"


class PendingAction(str, Enum):
    CONFIRMATION = "confirmation"
    CORRECTION = "correction"
    REJECTION = "rejection"
    UPDATE = "update"
    UNKNOWN = "unknown"
    INTERRUPTION = "interruption"


class PendingState(BaseModel):
    type: PendingType
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    recommended_size: Optional[str] = None
    size_provenance: Optional[str] = None


class MeasurementInput(BaseModel):
    height_cm: float
    weight_kg: float
    chest_cm: float
    waist_cm: float
    hips_cm: float


class ProfileHistoryItem(BaseModel):
    product_id: str
    product_name: Optional[str] = None
    recommended_size: Optional[str] = None
    confidence_score: Optional[float] = None
    created_at: Optional[str] = None


class SafeProfileContext(BaseModel):
    first_name: Optional[str] = None
    saved_measurements: Optional[MeasurementInput] = None
    previous_product_size: Optional[str] = None
    recent_fit_history: list[ProfileHistoryItem] = Field(default_factory=list)


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
    pending_state: Optional[PendingState] = Field(None)
    active_search: Optional[ActiveSearch] = Field(None)
    resolved_intent: Optional[str] = Field(None, description="The resolved semantic intent of this turn")
