"""
Core invariant unit tests for the Recommendation Agent.

All tests here are pure-function tests — no LLM calls, no network, no DB.
They validate deterministic business rules that must never regress.

Run with: pytest tests/test_core_invariants.py -v
"""
import json
import pytest

from app.agent import (
    _normalize_category_text,
    _DEPT_ALIAS_MAP,
    _resolve_chart_answer,
    _answer_current_product_fact,
    _find_stated_size_and_confidence,
    compute_recommended_size,
)
from app.retrieval import retrieve_relevant_products
from app.schemas import MeasurementInput, ActionType


# ─── helpers ────────────────────────────────────────────────────────────────

def _chart(rows: list[dict]) -> str:
    return json.dumps(rows)


SAMPLE_CHART = _chart([
    {"size": "S",  "chest_cm": 86, "waist_cm": 68, "hip_cm": 90},
    {"size": "M",  "chest_cm": 90, "waist_cm": 72, "hip_cm": 94},
    {"size": "L",  "chest_cm": 94, "waist_cm": 76, "hip_cm": 98},
    {"size": "XL", "chest_cm": 98, "waist_cm": 80, "hip_cm": 102},
])

SAMPLE_CATALOG = [
    {"id": "p1", "name": "Silk Blouse",     "category": "Blouse", "description": "Elegant silk blouse for formal occasions."},
    {"id": "p2", "name": "Cotton Trousers", "category": "Pants",  "description": "Classic cotton chino trousers."},
    {"id": "p3", "name": "Linen Shirt",     "category": "Shirt",  "description": "Breathable linen casual shirt."},
]


# ─── category text normalization ────────────────────────────────────────────

class TestNormalizeCategoryText:
    def test_lowercase(self):
        assert _normalize_category_text("T-Shirt") == "tshirt"

    def test_spaces_collapsed(self):
        assert _normalize_category_text("Wide Leg Pants") == "widelegpants"

    def test_hyphens_removed(self):
        assert _normalize_category_text("t-shirt") == "tshirt"

    def test_underscores_removed(self):
        assert _normalize_category_text("t_shirt") == "tshirt"

    def test_empty_string(self):
        assert _normalize_category_text("") == ""

    def test_none_safe(self):
        assert _normalize_category_text(None) == ""

    def test_plural_still_distinct(self):
        # normalization only collapses punctuation/spaces; plural handling is separate
        assert _normalize_category_text("Shirts") == "shirts"
        assert _normalize_category_text("Shirt") == "shirt"


# ─── department alias map ────────────────────────────────────────────────────

class TestDeptAliasMap:
    """_DEPT_ALIAS_MAP must map natural variants to canonical men/women.
    Kids/children intentionally absent."""

    MEN_VARIANTS = ["man", "male", "boy", "menswear"]
    WOMEN_VARIANTS = ["woman", "female", "girl", "womenswear"]
    KIDS_TERMS = ["child", "children", "kid", "kids", "kidswear"]

    def test_men_variants_resolve(self):
        for variant in self.MEN_VARIANTS:
            assert _DEPT_ALIAS_MAP.get(variant) == "men", f"{variant!r} should map to 'men'"

    def test_women_variants_resolve(self):
        for variant in self.WOMEN_VARIANTS:
            assert _DEPT_ALIAS_MAP.get(variant) == "women", f"{variant!r} should map to 'women'"

    def test_kids_not_in_map(self):
        for term in self.KIDS_TERMS:
            assert term not in _DEPT_ALIAS_MAP, f"{term!r} must NOT be in _DEPT_ALIAS_MAP"

    def test_canonical_forms_not_in_map(self):
        # Canonical values shouldn't be self-mapped — they pass through unchanged
        assert "men" not in _DEPT_ALIAS_MAP
        assert "women" not in _DEPT_ALIAS_MAP


# ─── deterministic size chart Q&A ───────────────────────────────────────────

class TestResolveChartAnswer:
    def test_max_chest(self):
        result = _resolve_chart_answer(SAMPLE_CHART, ["chest"], "max", None)
        assert result is not None
        assert "98" in result

    def test_min_waist(self):
        result = _resolve_chart_answer(SAMPLE_CHART, ["waist"], "min", None)
        assert result is not None
        assert "68" in result

    def test_range_hip(self):
        result = _resolve_chart_answer(SAMPLE_CHART, ["hip"], "range", None)
        assert result is not None
        assert "90" in result
        assert "102" in result

    def test_value_for_size(self):
        result = _resolve_chart_answer(SAMPLE_CHART, ["chest"], "value", "M")
        assert result is not None
        assert "90" in result

    def test_bust_alias_resolves_to_chest(self):
        result = _resolve_chart_answer(SAMPLE_CHART, ["bust"], "max", None)
        assert result is not None
        assert "98" in result

    def test_hips_alias_resolves_to_hip(self):
        result = _resolve_chart_answer(SAMPLE_CHART, ["hips"], "max", None)
        assert result is not None
        assert "102" in result

    def test_unknown_size_returns_helpful_message(self):
        # _resolve_chart_answer returns a "not in chart" message (not None) for unknown size labels
        result = _resolve_chart_answer(SAMPLE_CHART, ["chest"], "value", "XXL")
        assert result is not None
        assert "XXL" in result or "not" in result.lower() or "available" in result.lower()

    def test_malformed_chart_returns_none(self):
        result = _resolve_chart_answer("not valid json", ["chest"], "max", None)
        assert result is None

    def test_empty_chart_returns_none(self):
        result = _resolve_chart_answer("[]", ["chest"], "max", None)
        assert result is None


# ─── current product fact answers ───────────────────────────────────────────

class TestAnswerCurrentProductFact:
    PRODUCT = {
        "id": "p1",
        "name": "Ruched Blouse",
        "category": "Blouse",
        "description": "A beautiful ruched side blouse.",
        "fabric": "Cotton",
        "brand": "Cairo Thread Co.",
    }

    def _state(self, query: str, size_chart: str | None = None) -> dict:
        return {
            "query": query,
            "product_id": "p1",
            "catalog_products": [self.PRODUCT],
            "size_chart": size_chart,
        }

    def test_material_keyword(self):
        r = _answer_current_product_fact(self._state("what material is it"))
        assert r is not None
        assert "Cotton" in r.message
        assert r.provider == "STATIC-CURRENT-PRODUCT"

    def test_fabric_keyword(self):
        r = _answer_current_product_fact(self._state("what fabric"))
        assert r is not None
        assert "Cotton" in r.message

    def test_brand_keyword(self):
        r = _answer_current_product_fact(self._state("what brand is this"))
        assert r is not None
        assert "Cairo Thread Co." in r.message

    def test_description_keyword(self):
        r = _answer_current_product_fact(self._state("product description"))
        assert r is not None
        assert "ruched" in r.message.lower()

    def test_details_keyword_synthesizes_all_fields(self):
        r = _answer_current_product_fact(self._state("product details"))
        assert r is not None
        assert "Cotton" in r.message or "Cairo Thread Co." in r.message or "ruched" in r.message.lower()

    def test_info_keyword_synthesizes_fields(self):
        r = _answer_current_product_fact(self._state("product info"))
        assert r is not None

    def test_available_sizes_keyword(self):
        chart = _chart([{"size": "S", "chest_cm": 86}, {"size": "M", "chest_cm": 90}])
        r = _answer_current_product_fact(self._state("what sizes are available", chart))
        assert r is not None
        assert "S" in r.message and "M" in r.message

    def test_no_product_returns_none(self):
        state = {"query": "what material", "product_id": None, "catalog_products": [], "size_chart": None}
        r = _answer_current_product_fact(state)
        assert r is None

    def test_missing_fabric_returns_not_available_for_material_query(self):
        """When fabric is absent, return a deterministic 'not provided' response
        instead of None — prevents the generic LLM fallback from firing."""
        product = {**self.PRODUCT, "fabric": None}
        state = {"query": "material", "product_id": "p1", "catalog_products": [product], "size_chart": None}
        r = _answer_current_product_fact(state)
        assert r is not None
        assert "not provided" in r.message.lower() or "not available" in r.message.lower()

    def test_empty_string_fabric_returns_not_available_for_material_query(self):
        """Empty string fabric (from widget p.fabric || p.material || '') must also
        return a deterministic 'not provided' response."""
        product = {**self.PRODUCT, "fabric": ""}
        state = {"query": "what's material", "product_id": "p1", "catalog_products": [product], "size_chart": None}
        r = _answer_current_product_fact(state)
        assert r is not None
        assert "not provided" in r.message.lower() or "not available" in r.message.lower()


# ─── confidence: last-2-message scan ────────────────────────────────────────

class TestFindStatedSizeAndConfidence:
    def test_stated_size_in_current_message(self):
        msgs = [
            {"role": "user", "content": "I wear XL"},
        ]
        label, confidence = _find_stated_size_and_confidence(msgs)
        assert label == "XL"

    def test_size_from_third_message_ignored(self):
        # Only the last 2 user messages are scanned — stale size must not bleed through
        msgs = [
            {"role": "user", "content": "I wear S"},
            {"role": "assistant", "content": "How confident are you?"},
            {"role": "user", "content": "Totally different topic"},
            {"role": "assistant", "content": "ok"},
            {"role": "user", "content": "what do you have?"},
        ]
        label, _ = _find_stated_size_and_confidence(msgs)
        # "S" is 3 user messages ago — should not be returned
        assert label is None or label == ""

    def test_confidence_pattern_extracted(self):
        msgs = [{"role": "user", "content": "I wear M. 85%"}]
        _, confidence = _find_stated_size_and_confidence(msgs)
        assert confidence == 85.0

    def test_no_user_messages_returns_empty(self):
        msgs = [{"role": "assistant", "content": "Hello!"}]
        label, _ = _find_stated_size_and_confidence(msgs)
        assert label is None or label == ""


# ─── TF-IDF retrieval invariants ─────────────────────────────────────────────

class TestRetrieveRelevantProducts:
    def test_semantic_match_returned(self):
        results = retrieve_relevant_products("formal occasions", SAMPLE_CATALOG, top_k=1)
        assert len(results) == 1
        assert results[0]["id"] == "p1"

    def test_irrelevant_query_returns_empty(self):
        results = retrieve_relevant_products("motorcycle helmet", SAMPLE_CATALOG, top_k=3)
        assert len(results) == 0

    def test_exclude_ids_respected(self):
        results = retrieve_relevant_products("silk blouse", SAMPLE_CATALOG, top_k=3, exclude_ids=["p1"])
        ids = [r["id"] for r in results]
        assert "p1" not in ids

    def test_empty_catalog_returns_empty(self):
        assert retrieve_relevant_products("anything", [], top_k=3) == []

    def test_top_k_respected(self):
        results = retrieve_relevant_products("classic", SAMPLE_CATALOG, top_k=1)
        assert len(results) <= 1


# ─── deterministic sizing boundary ───────────────────────────────────────────

class TestComputeRecommendedSize:
    def test_exact_match(self):
        betas = MeasurementInput(height_cm=170, weight_kg=65, chest_cm=90, waist_cm=72, hips_cm=94)
        r = compute_recommended_size(betas, SAMPLE_CHART)
        assert r.recommended_size == "M"
        assert r.is_out_of_range is False

    def test_out_of_range_honest(self):
        betas = MeasurementInput(height_cm=170, weight_kg=65, chest_cm=30, waist_cm=40, hips_cm=45)
        r = compute_recommended_size(betas, SAMPLE_CHART)
        assert r.recommended_size is None
        assert r.is_out_of_range is True

    def test_available_sizes_always_populated(self):
        betas = MeasurementInput(height_cm=170, weight_kg=65, chest_cm=90, waist_cm=72, hips_cm=94)
        r = compute_recommended_size(betas, SAMPLE_CHART)
        assert r.available_sizes == ["S", "M", "L", "XL"]

    def test_empty_chart_no_crash(self):
        betas = MeasurementInput(height_cm=170, weight_kg=65, chest_cm=90, waist_cm=72, hips_cm=94)
        r = compute_recommended_size(betas, "[]")
        assert r.recommended_size is None
        assert r.available_sizes == []

    def test_malformed_chart_no_crash(self):
        betas = MeasurementInput(height_cm=170, weight_kg=65, chest_cm=90, waist_cm=72, hips_cm=94)
        r = compute_recommended_size(betas, "not json")
        assert r.recommended_size is None
        assert r.is_out_of_range is True

    def test_partial_chart_no_hip(self):
        chart = _chart([{"size": "M", "chest_cm": 90, "waist_cm": 72}])
        betas = MeasurementInput(height_cm=170, weight_kg=65, chest_cm=90, waist_cm=72, hips_cm=94)
        r = compute_recommended_size(betas, chart)
        assert r.recommended_size == "M"
