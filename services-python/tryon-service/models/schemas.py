# Pydantic response schema definitions for the Virtual Try-On service.
from pydantic import BaseModel


class TryOnResponse(BaseModel):
    """Describe a completed Virtual Try-On operation."""
    session_id: str
    tryon_result_url: str
    photo_deleted: bool
