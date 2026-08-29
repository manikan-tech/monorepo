import json
import asyncio
import pytest

from app import agent
from app.agent import compute_recommended_size, fit_reasoning_agent
from app.schemas import ActionType, MeasurementInput, RecommendationOutput


def _sample_size_chart():
    return json.dumps(
        [
            {"size": "S", "chest_cm": 86, "waist_cm": 68, "hip_cm": 90},
            {"size": "M", "chest_cm": 90, "waist_cm": 72, "hip_cm": 94},
            {"size": "L", "chest_cm": 94, "waist_cm": 76, "hip_cm": 98},
            {"size": "XL", "chest_cm": 98, "waist_cm": 80, "hip_cm": 102},
        ]
    )


def test_exact_match_returns_correct_size():
    betas = MeasurementInput(height_cm=170, weight_kg=65, chest_cm=90, waist_cm=72, hips_cm=94)
    result = compute_recommended_size(betas, _sample_size_chart())

    assert result.recommended_size == "M"
    assert result.is_out_of_range is False
    assert result.confidence_score is not None
    assert result.confidence_score > 0.9


def test_close_match_returns_nearest_size():
    # Slightly off from L, but still close enough to be a real match
    betas = MeasurementInput(height_cm=175, weight_kg=78, chest_cm=95, waist_cm=77, hips_cm=99)
    result = compute_recommended_size(betas, _sample_size_chart())

    assert result.recommended_size == "L"
    assert result.is_out_of_range is False


def test_far_off_measurements_are_honestly_out_of_range():
    # Nowhere near any size in the chart
    betas = MeasurementInput(height_cm=170, weight_kg=65, chest_cm=30, waist_cm=40, hips_cm=45)
    result = compute_recommended_size(betas, _sample_size_chart())

    assert result.recommended_size is None
    assert result.is_out_of_range is True
    # We should still tell the caller what IS available, even on a miss
    assert result.available_sizes == ["S", "M", "L", "XL"]


def test_empty_size_chart_returns_no_match():
    betas = MeasurementInput(height_cm=170, weight_kg=65, chest_cm=90, waist_cm=72, hips_cm=94)
    result = compute_recommended_size(betas, "[]")

    assert result.recommended_size is None
    assert result.available_sizes == []


def test_malformed_size_chart_json_does_not_raise():
    betas = MeasurementInput(height_cm=170, weight_kg=65, chest_cm=90, waist_cm=72, hips_cm=94)
    result = compute_recommended_size(betas, "not valid json")

    assert result.recommended_size is None
    assert result.is_out_of_range is True


def test_size_chart_entries_missing_hip_still_work():
    # Not every retailer's variant data includes hip_cm - should degrade
    # gracefully to chest+waist matching instead of crashing.
    chart = json.dumps([{"size": "M", "chest_cm": 90, "waist_cm": 72}])
    betas = MeasurementInput(height_cm=170, weight_kg=65, chest_cm=90, waist_cm=72, hips_cm=94)
    result = compute_recommended_size(betas, chart)

    assert result.recommended_size == "M"


def test_product_detail_question_bypasses_measurement_gate(monkeypatch):
    """A product question must reach the AI even before measurements exist."""
    async def fake_llm(_messages, fallback_action=None):
        return RecommendationOutput(
            action=ActionType.PROVIDE_RECOMMENDATION,
            message="This trouser has a relaxed, tapered silhouette.",
        ), "TEST"

    monkeypatch.setattr(agent, "call_llm_with_fallback", fake_llm)
    state = {
        "messages": [
            {"role": "user", "content": "tell me about this item"},
            {"role": "system", "content": "TRUSTED CURRENT-PRODUCT CONTEXT"},
        ],
        "product_id": "product-1",
        "product_detail_question": True,
        "query": "tell me about this item",
        "user_measurements": None,
        "betas": None,
        "size_chart": None,
        "intent": "general",
        "selected_category": None,
        "available_categories": ["Pants"],
        "catalog_products": None,
        "retrieved_products": [],
        "size_math_result": None,
        "reasoning_output": None,
        "final_response": None,
        "trace_id": "test",
        "structured_response": None,
    }

    result = asyncio.run(fit_reasoning_agent(state))

    assert result["reasoning_output"].message == "This trouser has a relaxed, tapered silhouette."
    assert result["reasoning_output"].provider == "TEST"
