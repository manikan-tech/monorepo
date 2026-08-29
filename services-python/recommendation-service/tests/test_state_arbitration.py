"""
State arbitration unit tests for the Recommendation Agent.

These tests verify that category, department, and price constraints are
correctly resolved and preserved across agent turns — independent of LLM output.
Tests that require analyze_turn mock _classify_intent_with_llm so they are
deterministic and require no live API calls.
"""
import asyncio
from unittest.mock import patch, AsyncMock

import pytest

from app.agent import analyze_turn, retrieve_rag_context, SemanticIntent
from app.schemas import ActiveSearch, ActionType


# ─── helpers ────────────────────────────────────────────────────────────────

def _run(coro):
    """Run a coroutine synchronously in a fresh event loop."""
    return asyncio.run(coro)


def _base_state(**overrides) -> dict:
    """Minimal FitState dict for arbitration tests."""
    state: dict = {
        "query": "test",
        "messages": [],
        "trace_id": "test-arbitration",
        "product_id": None,
        "product_name": None,
        "product_detail_question": False,
        "pending_state": None,
        "force_sizing_intent": False,
        "force_in_scope": False,
        "user_measurements": None,
        "betas": None,
        "size_chart": None,
        "intent": "general",
        "selected_category": None,
        "available_categories": ["shirt", "pants", "skirt", "blouse"],
        "available_departments": ["men", "women", "unisex"],
        "available_brands": ["brand-a", "brand-b"],
        "category_department_mapping": {
            "shirt": ["men"],
            "blouse": ["women"],
            "skirt": ["women"],
            "pants": ["men", "women", "unisex"],
        },
        "catalog_products": [
            {"id": "s1", "name": "Men Shirt A", "category": "shirt", "gender": "men",
             "price": 50.0, "description": "casual men cotton shirt"},
            {"id": "b1", "name": "Women Blouse A", "category": "blouse", "gender": "women",
             "price": 40.0, "description": "elegant women silk blouse"},
            {"id": "sk1", "name": "Women Skirt A", "category": "skirt", "gender": "women",
             "price": 30.0, "description": "midi women skirt floral"},
            {"id": "p1", "name": "Women Pants A", "category": "pants", "gender": "women",
             "price": 60.0, "description": "slim women dress pants"},
            {"id": "p2", "name": "Men Pants B", "category": "pants", "gender": "men",
             "price": 65.0, "description": "straight men chino pants"},
        ],
        "active_search": None,
        "shown_product_ids": [],
        "retrieved_products": [],
        "size_math_result": None,
        "reasoning_output": None,
        "final_response": None,
        "structured_response": None,
        "resolved_intent": None,
        "requires_catalog": False,
        "_parsed_classification": {},
        "customer_name": None,
        "saved_measurements": None,
        "previous_product_size": None,
        "recent_fit_history": [],
        "requested_material": None,
        "requested_price_range": None,
        "material_price_constrained": False,
    }
    state.update(overrides)
    return state


def _mock_classify(parsed: dict):
    """Patch _classify_intent_with_llm to return a fixed parsed dict."""
    return patch("app.agent._classify_intent_with_llm", new_callable=AsyncMock,
                 return_value=parsed)


def _discovery_parsed(**overrides) -> dict:
    """Minimal PRODUCT_DISCOVERY classifier output with safe defaults."""
    base = {
        "resolved_intent": "PRODUCT_DISCOVERY",
        "requires_catalog": True,
        "canonical_catalog_category": None,
        "additional_requested_category": None,
        "requested_product_type": None,
        "requested_fashion_concept": None,
        "canonical_department": None,
        "requested_department": None,
        "requested_brand": None,
        "requested_material": None,
        "min_price": None,
        "max_price": None,
        "is_human_fashion_request": True,
        "is_insufficient_for_retrieval": False,
        "stated_wearer_type": None,
        "catalog_meta_subject": None,
    }
    base.update(overrides)
    return base


# ─── test 1: single-department category infers its one valid department ──────

def test_1_single_department_inference():
    """
    A category whose mapping has exactly one department (shirt → men) must
    have that department inferred when the classifier emits no explicit dept.
    """
    state = _base_state(query="i want shirts")
    parsed = _discovery_parsed(canonical_catalog_category="shirt")

    with _mock_classify(parsed):
        state_after = _run(analyze_turn(state))

    assert state_after["selected_category"] == "shirt"
    assert state_after["_parsed_classification"].get("canonical_department") == "men"

    # retrieve_rag_context must build active_search with the inferred department.
    state_after["requires_catalog"] = True
    state_rag = _run(retrieve_rag_context(state_after))
    assert state_rag["active_search"].selected_category == "shirt"
    assert state_rag["active_search"].department == "men"


# ─── test 2: multi-department category stays unconstrained ────────────────────

def test_2_multi_department_category_unconstrained():
    """
    A category with multiple valid departments (pants → men/women/unisex) and
    no explicit department in the classifier output must leave department None.
    """
    state = _base_state(query="i want pants")
    parsed = _discovery_parsed(canonical_catalog_category="pants")

    with _mock_classify(parsed):
        state_after = _run(analyze_turn(state))

    assert state_after["selected_category"] == "pants"
    assert state_after["_parsed_classification"].get("canonical_department") is None

    state_after["requires_catalog"] = True
    state_rag = _run(retrieve_rag_context(state_after))
    assert state_rag["active_search"].selected_category == "pants"
    assert state_rag["active_search"].department is None


# ─── test 3: new category replaces stale search state ────────────────────────

def test_3_new_category_replaces_stale_state():
    """
    An active search for blouse/women must not cause a false CATALOG_UNAVAILABLE
    when the current turn requests shirt (which maps to men only).
    """
    state = _base_state(
        query="i want shirts",
        active_search=ActiveSearch(
            query="i want blouse", selected_category="blouse", department="women"
        ),
    )
    parsed = _discovery_parsed(canonical_catalog_category="shirt")

    with _mock_classify(parsed):
        state_after = _run(analyze_turn(state))

    # Must not produce CATALOG_UNAVAILABLE from the stale department.
    assert state_after.get("final_response") is None
    assert state_after["selected_category"] == "shirt"
    # Department must be inferred from shirt's mapping, not inherited from blouse.
    assert state_after["_parsed_classification"].get("canonical_department") == "men"

    state_after["requires_catalog"] = True
    state_rag = _run(retrieve_rag_context(state_after))
    assert state_rag["active_search"].selected_category == "shirt"
    assert state_rag["active_search"].department == "men"


# ─── test 4: explicit compatible department preserved ─────────────────────────

def test_4_explicit_compatible_department():
    """
    An explicit department that is valid for the requested category must be
    preserved as-is (pants + women → compatible → active_search.dept = women).
    """
    state = _base_state(query="i want women's pants")
    # Real LLM output for "women's pants" populates both department fields.
    parsed = _discovery_parsed(
        canonical_catalog_category="pants",
        canonical_department="women",
        requested_department="women",
    )

    with _mock_classify(parsed):
        state_after = _run(analyze_turn(state))

    assert state_after["selected_category"] == "pants"
    assert state_after.get("final_response") is None

    state_after["requires_catalog"] = True
    state_rag = _run(retrieve_rag_context(state_after))
    assert state_rag["active_search"].selected_category == "pants"
    assert state_rag["active_search"].department == "women"


# ─── test 5: explicit incompatible department → CATALOG_UNAVAILABLE ───────────

def test_5_explicit_incompatible_department():
    """
    Requesting a category with a department that the mapping does not support
    must produce CATALOG_UNAVAILABLE with a specific message, not products.
    """
    state = _base_state(query="i want women's shirts")
    parsed = _discovery_parsed(
        canonical_catalog_category="shirt",
        canonical_department="women",
    )

    with _mock_classify(parsed):
        state_after = _run(analyze_turn(state))

    assert state_after.get("final_response") is not None
    response = state_after["final_response"]
    assert response.provider == "STATIC-UNAVAILABLE"
    assert "shirt" in response.message.lower()
    assert "women" in response.message.lower()


# ─── test 6: unavailable turn does not poison the next valid request ──────────

def test_6_unavailable_turn_does_not_poison_next():
    """
    After a CATALOG_UNAVAILABLE response, a new valid category request must
    succeed without inheriting the rejected category or department.
    """
    # Turn 1: women's shirts — incompatible, must return STATIC-UNAVAILABLE.
    state_t1 = _base_state(
        query="women's shirts",
        active_search=ActiveSearch(
            query="i want blouse", selected_category="blouse", department="women"
        ),
    )
    parsed_t1 = _discovery_parsed(
        canonical_catalog_category="shirt",
        canonical_department="women",
    )
    with _mock_classify(parsed_t1):
        state_t1_after = _run(analyze_turn(state_t1))

    assert state_t1_after.get("final_response") is not None
    assert state_t1_after["final_response"].provider == "STATIC-UNAVAILABLE"

    # Turn 2: pants (multi-dept, no explicit dept) — must succeed.
    state_t2 = dict(state_t1_after)
    state_t2.pop("final_response", None)
    state_t2["query"] = "i want pants"
    state_t2["selected_category"] = None

    parsed_t2 = _discovery_parsed(canonical_catalog_category="pants")
    with _mock_classify(parsed_t2):
        state_t2_after = _run(analyze_turn(state_t2))

    assert state_t2_after.get("final_response") is None
    assert state_t2_after["selected_category"] == "pants"

    state_t2_after["requires_catalog"] = True
    state_t2_rag = _run(retrieve_rag_context(state_t2_after))
    assert state_t2_rag["active_search"].selected_category == "pants"
    assert state_t2_rag["active_search"].department is None


# ─── test 7: price refinement (CONTINUATION) preserves category and dept ──────

def test_7_refinement_preserves_state():
    """
    A price/material refinement sent as CONTINUATION must inherit the existing
    active_search constraints (category + department) and merge the new constraint.
    """
    state = _base_state(
        query="under 50",
        resolved_intent=SemanticIntent.CONTINUATION,
        _parsed_classification={"max_price": 50.0},
        active_search=ActiveSearch(
            query="i want shirts", selected_category="shirt", department="men"
        ),
    )

    state_rag = _run(retrieve_rag_context(state))
    active = state_rag["active_search"]

    assert active.selected_category == "shirt"
    assert active.department == "men"
    assert active.max_price == 50.0


# ─── test 8: continuation preserves active_search and shown_product_ids ───────

def test_8_continuation_preserves_state():
    """
    A CONTINUATION turn must preserve the active_search constraints and must
    not clear the shown_product_ids list.
    """
    state = _base_state(
        query="show me more",
        resolved_intent=SemanticIntent.CONTINUATION,
        _parsed_classification={},
        active_search=ActiveSearch(
            query="i want shirts", selected_category="shirt", department="men"
        ),
        shown_product_ids=["s1"],
    )

    state_rag = _run(retrieve_rag_context(state))
    active = state_rag["active_search"]

    assert active.selected_category == "shirt"
    assert active.department == "men"
    assert state_rag["shown_product_ids"] == ["s1"]


# ─── test 9: plural canonicalization ──────────────────────────────────────────

def test_9_canonicalization():
    """
    When the classifier returns a plural form ("shirts") that is not in
    available_categories, the plural-strip rule must resolve it to "shirt"
    and the single-dept inference must still fire correctly.
    """
    state = _base_state(query="shirts")
    # Classifier returns plural — as if the LLM echoed the raw query.
    parsed = _discovery_parsed(canonical_catalog_category="shirts")

    with _mock_classify(parsed):
        state_after = _run(analyze_turn(state))

    assert state_after["selected_category"] == "shirt"
    assert state_after["_parsed_classification"].get("canonical_department") == "men"


# ─── test 10: final eligibility gate filters incompatible products ────────────

def test_10_final_eligibility_intact():
    """
    Products whose department/category does not match the active_search constraints
    must never appear in retrieved_products, regardless of TF-IDF score.

    Specifically: a women's-pants search must exclude men's pants (p2).
    """
    state = _base_state(
        query="women's pants",
        resolved_intent=SemanticIntent.PRODUCT_DISCOVERY,
        selected_category="pants",
        _parsed_classification={
            "canonical_catalog_category": "pants",
            "canonical_department": "women",
            "requested_department": None,
            "requested_brand": None,
            "requested_material": None,
            "min_price": None,
            "max_price": None,
        },
        active_search=ActiveSearch(
            query="women's pants", selected_category="pants", department="women"
        ),
    )

    state_rag = _run(retrieve_rag_context(state))
    retrieved_ids = {p.get("id") for p in state_rag["retrieved_products"]}

    # Men's pants must never appear, regardless of retrieval path.
    assert "p2" not in retrieved_ids

    # Every retrieved product must satisfy both constraints.
    for product in state_rag["retrieved_products"]:
        gender = (product.get("department") or product.get("gender") or "").lower()
        assert gender == "women", f"Product {product.get('id')} has wrong gender: {gender}"
        assert product.get("category", "").lower() == "pants"
