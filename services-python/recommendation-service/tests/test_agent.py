import json
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest

from app import agent
from app.agent import compute_recommended_size, fit_reasoning_agent
from app.schemas import ActionType, MeasurementInput, RecommendationOutput


def _deepseek_completion(content: str):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )


def _patch_deepseek_client(monkeypatch, responses: list[str]):
    calls = []

    async def create(**_kwargs):
        calls.append(None)
        return _deepseek_completion(responses.pop(0))

    client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=create)
        )
    )
    monkeypatch.setattr(
        agent,
        "get_settings",
        lambda: SimpleNamespace(deepseek_api_key="test-key"),
    )
    monkeypatch.setattr(agent, "AsyncOpenAI", lambda **_kwargs: client)
    return calls


def test_llm_retries_once_after_empty_response(monkeypatch):
    calls = _patch_deepseek_client(
        monkeypatch,
        ["", '{"message":"A relaxed cotton shirt.","action":"provide_recommendation"}'],
    )
    sleep = AsyncMock()
    monkeypatch.setattr(agent.asyncio, "sleep", sleep)

    result, provider = asyncio.run(
        agent.call_llm_with_fallback([{"role": "user", "content": "Tell me about this shirt"}])
    )

    assert len(calls) == 2
    sleep.assert_awaited_once_with(0.4)
    assert result.message == "A relaxed cotton shirt."
    assert provider == "DEEPSEEK"


def test_llm_raises_after_two_empty_responses(monkeypatch):
    calls = _patch_deepseek_client(monkeypatch, ["", ""])
    sleep = AsyncMock()
    monkeypatch.setattr(agent.asyncio, "sleep", sleep)

    with pytest.raises(ValueError, match="llm_empty_message"):
        asyncio.run(
            agent.call_llm_with_fallback([{"role": "user", "content": "Help me choose"}])
        )

    assert len(calls) == 2
    sleep.assert_awaited_once_with(0.4)


def test_product_fetch_keeps_existing_empty_response_fallback(monkeypatch):
    calls = _patch_deepseek_client(monkeypatch, [""])
    sleep = AsyncMock()
    monkeypatch.setattr(agent.asyncio, "sleep", sleep)

    result, provider = asyncio.run(
        agent.call_llm_with_fallback(
            [{"role": "user", "content": "Show me shirts"}],
            fallback_action=ActionType.FETCH_PRODUCTS,
        )
    )

    assert len(calls) == 1
    sleep.assert_not_awaited()
    assert result.message == "Here are some options that may match what you're looking for."
    assert provider == "DEEPSEEK"


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
