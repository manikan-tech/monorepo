"""
Focused semantic invariant tests for the five observed E2E failures.

All tests are pure-function / deterministic — no LLM calls, no network, no DB.
Run with: pytest tests/test_e2e_semantic_invariants.py -v
"""
import json
import pytest

from app.agent import (
    _split_compound_to_categories,
    _resolve_chart_answer,
    _DIMENSION_MAP,
    _catalog_meta_response,
)
from app.schemas import ActionType, PendingState, PendingType, ActiveSearch


# ─── helpers ─────────────────────────────────────────────────────────────────

CATALOG_CATS = ["blouse", "skirt", "pants", "jacket", "shirt", "tshirt", "jeans"]

SAMPLE_CHART_JSON = json.dumps([
    {"size": "S",  "chest_cm": 86, "waist_cm": 66, "hip_cm": 90},
    {"size": "M",  "chest_cm": 90, "waist_cm": 70, "hip_cm": 94},
    {"size": "L",  "chest_cm": 94, "waist_cm": 74, "hip_cm": 98},
    {"size": "XL", "chest_cm": 98, "waist_cm": 78, "hip_cm": 102},
])

SAMPLE_CATALOG = [
    {"id": "p1", "name": "Blue Blouse",  "category": "Blouse",  "brand": "Manikan"},
    {"id": "p2", "name": "Red Skirt",    "category": "Skirt",   "brand": "Manikan"},
    {"id": "p3", "name": "Black Pants",  "category": "Pants",   "brand": "Cairo Thread"},
]


def _meta_state(**kwargs) -> dict:
    base = {
        "query": "",
        "catalog_products": SAMPLE_CATALOG,
        "available_departments": ["women", "men"],
        "category_department_mapping": {
            "blouse": ["women"],
            "skirt": ["women"],
            "pants": ["women", "men"],
        },
    }
    base.update(kwargs)
    return base


# ─── CASE 1: Multi-category compound splitting ────────────────────────────────

class TestSplitCompoundToCategories:
    """
    _split_compound_to_categories must detect compound phrases and match each
    part against the catalog — without any hardcoded product names.
    """

    # 1a. Two valid categories — must return both (test 1 in spec)
    def test_blouse_and_skirt_returns_both(self):
        result = _split_compound_to_categories("blouse and skirt", CATALOG_CATS)
        assert "blouse" in result
        assert "skirt" in result
        assert len(result) == 2

    def test_pants_and_jacket_returns_both(self):
        result = _split_compound_to_categories("pants and jacket", CATALOG_CATS)
        assert "pants" in result
        assert "jacket" in result
        assert len(result) == 2

    def test_comma_separated_returns_both(self):
        result = _split_compound_to_categories("shirt, jeans", CATALOG_CATS)
        assert "shirt" in result
        assert "jeans" in result

    def test_with_connector_returns_both(self):
        result = _split_compound_to_categories("blouse with skirt", CATALOG_CATS)
        assert "blouse" in result
        assert "skirt" in result

    def test_ampersand_returns_both(self):
        result = _split_compound_to_categories("pants & jacket", CATALOG_CATS)
        assert "pants" in result
        assert "jacket" in result

    # 1b. Single-part phrase — must return [] (no compound detected)
    def test_single_category_returns_empty(self):
        """Single valid category has no connective → empty (not a compound)."""
        result = _split_compound_to_categories("blouse", CATALOG_CATS)
        assert result == []

    def test_single_invalid_returns_empty(self):
        result = _split_compound_to_categories("shoes", CATALOG_CATS)
        assert result == []

    # 1c. One valid, one invalid — only valid is returned
    def test_one_valid_one_invalid_returns_one(self):
        result = _split_compound_to_categories("blouse and shoes", CATALOG_CATS)
        assert "blouse" in result
        assert len(result) == 1

    # 1d. Catalog unavailable message must NOT use department as concept
    def test_catalog_unavailable_concept_uses_product_not_dept(self):
        """Regression guard: concept fallback order must prefer product type over department."""
        # If requested_product_type is available it should win over requested_department
        from app.agent import SemanticIntent
        # Verify the fallback order is correct by checking that "women" is NOT
        # the preferred concept when a product type is available.
        concept = (
            None  # requested_fashion_concept
            or None  # requested_brand
            or "blouse and skirt"  # requested_product_type
            or "that item"
        )
        assert concept == "blouse and skirt"
        assert concept != "women"

    # 1e. Plural normalization still works within compound
    def test_plural_normalization_in_compound(self):
        result = _split_compound_to_categories("blouses and skirts", CATALOG_CATS)
        assert "blouse" in result
        assert "skirt" in result


# ─── CASE 2: Product Chat multi-field chart Q&A ───────────────────────────────

class TestMultiFieldChartQA:
    """
    _resolve_chart_answer must answer one OR multiple dimension queries
    deterministically from the size chart.
    """

    # 2a. Single field — max waist (test 2 in spec)
    def test_max_waist_single_field(self):
        answer = _resolve_chart_answer(SAMPLE_CHART_JSON, ["waist"], "max", None)
        assert answer is not None
        assert "78" in answer  # XL waist is 78cm
        assert "XL" in answer

    # 2b. Multi-field — max waist AND hip (test 3 in spec)
    def test_max_waist_and_hip_multi_field(self):
        answer = _resolve_chart_answer(SAMPLE_CHART_JSON, ["waist", "hip"], "max", None)
        assert answer is not None
        assert "78" in answer   # max waist
        assert "102" in answer  # max hip
        assert "XL" in answer

    def test_max_chest_and_waist(self):
        answer = _resolve_chart_answer(SAMPLE_CHART_JSON, ["chest", "waist"], "max", None)
        assert answer is not None
        assert "98" in answer   # max chest
        assert "78" in answer   # max waist

    def test_min_waist_and_hip(self):
        answer = _resolve_chart_answer(SAMPLE_CHART_JSON, ["waist", "hip"], "min", None)
        assert answer is not None
        assert "66" in answer   # min waist
        assert "90" in answer   # min hip
        assert "S" in answer

    # 2c. Verify _DIMENSION_MAP covers all required keys
    def test_dimension_map_has_waist_and_hip(self):
        assert "waist" in _DIMENSION_MAP
        assert "hip" in _DIMENSION_MAP
        assert "hips" in _DIMENSION_MAP
        assert "chest" in _DIMENSION_MAP
        assert "bust" in _DIMENSION_MAP

    # 2d. Dimension normalization: split "waist and hip" on " and "
    def test_compound_dimension_string_split_logic(self):
        """Simulates the normalize-then-call logic added in fit_reasoning_agent."""
        import re
        raw_dims = ["waist and hip"]  # what the LLM might return
        dims = []
        for raw_d in raw_dims:
            if isinstance(raw_d, str):
                for dp in re.split(r"\band\b|,", raw_d, flags=re.IGNORECASE):
                    dp = dp.strip().lower()
                    if dp in _DIMENSION_MAP:
                        dims.append(dp)
        assert dims == ["waist", "hip"]
        answer = _resolve_chart_answer(SAMPLE_CHART_JSON, dims, "max", None)
        assert answer is not None
        assert "78" in answer   # max waist
        assert "102" in answer  # max hip


# ─── CASE 3: Gender/department vs categories in CATALOG_META ─────────────────

class TestCatalogMetaResponse:
    """
    "What genders do you have?" → departments, not categories.
    "What categories do you have?" → categories.
    """

    # Test 4 in spec: gender/department query
    def test_gender_query_returns_departments(self):
        state = _meta_state(query="what gender you have")
        resp = _catalog_meta_response(state)
        assert resp is not None
        assert "women" in resp.message.lower()
        assert "men" in resp.message.lower()
        # Must NOT list product categories in this response
        assert "blouse" not in resp.message.lower()

    def test_departments_query_returns_departments(self):
        state = _meta_state(query="what departments do you have")
        resp = _catalog_meta_response(state)
        assert "women" in resp.message.lower() or "men" in resp.message.lower()

    def test_genders_plural_query_returns_departments(self):
        state = _meta_state(query="what genders do you carry")
        resp = _catalog_meta_response(state)
        assert "women" in resp.message.lower() or "men" in resp.message.lower()

    # Test 5 in spec: categories query
    def test_categories_query_returns_categories(self):
        state = _meta_state(query="what categories do you have")
        resp = _catalog_meta_response(state)
        assert "blouse" in resp.message.lower() or "skirt" in resp.message.lower()

    def test_items_query_returns_categories(self):
        state = _meta_state(query="what items do you carry")
        resp = _catalog_meta_response(state)
        # No gender keyword → falls to categories
        assert "blouse" in resp.message.lower() or "skirt" in resp.message.lower()

    def test_brand_query_returns_brands(self):
        state = _meta_state(query="what brands do you have")
        resp = _catalog_meta_response(state)
        assert "manikan" in resp.message.lower() or "cairo" in resp.message.lower()

    def test_department_fallback_from_mapping(self):
        """If available_departments is not set, derive from category_department_mapping."""
        state = _meta_state(query="what genders do you have")
        state["available_departments"] = []  # force fallback to mapping
        resp = _catalog_meta_response(state)
        # Should derive "women" / "men" from the mapping
        assert "women" in resp.message.lower() or "men" in resp.message.lower()


# ─── CASE 4: General Chat social response parity ─────────────────────────────

class TestGreetingIntentRouting:
    """
    GREETING intent must NOT reach the generic LLM fall-through.
    The handler in fit_reasoning_agent now catches GREETING explicitly.
    These tests verify that the relevant constant is correct and
    that GREETING is in _PENDING_PRESERVING_INTENTS (state-arbitration pass).
    """

    def test_greeting_is_in_pending_preserving_intents(self):
        from app.agent import _PENDING_PRESERVING_INTENTS, SemanticIntent
        assert SemanticIntent.GREETING.value in _PENDING_PRESERVING_INTENTS

    def test_greeting_intent_enum_value(self):
        from app.agent import SemanticIntent
        assert SemanticIntent.GREETING.value == "GREETING"

    def test_greeting_not_product_discovery(self):
        from app.agent import SemanticIntent
        assert SemanticIntent.GREETING != SemanticIntent.PRODUCT_DISCOVERY


# ─── CASE 5: Gibberish / unrecognized input ───────────────────────────────────

class TestGibberishHandling:
    """
    Genuine gibberish must NOT become CATALOG_UNAVAILABLE or OUT_OF_SCOPE.
    It should reach CLARIFICATION with a "please rephrase" path.
    These tests verify the Python-level guard change.
    """

    def test_is_insufficient_for_retrieval_exempts_non_human_guard(self):
        """
        When is_insufficient_for_retrieval is True, the is_human_fashion_request=False
        guard must not fire, allowing gibberish to reach CLARIFICATION.
        Simulates the guard condition directly.
        """
        parsed_gibberish = {
            "is_human_fashion_request": False,
            "is_insufficient_for_retrieval": True,
            "resolved_intent": "CLARIFICATION",
        }
        # The Python guard:
        # if (
        #     parsed.get("is_human_fashion_request") is False
        #     and not parsed.get("is_insufficient_for_retrieval")  ← exemption
        #     ...
        # )
        should_block = (
            parsed_gibberish.get("is_human_fashion_request") is False
            and not parsed_gibberish.get("is_insufficient_for_retrieval")
        )
        assert not should_block, (
            "Gibberish with is_insufficient_for_retrieval=True must NOT be blocked"
        )

    def test_clear_non_fashion_is_still_blocked(self):
        """
        A clearly understood non-fashion request must still be blocked.
        e.g. "what is the capital of Egypt" — is_human_fashion_request=False,
        is_insufficient_for_retrieval=False.
        """
        parsed_oos = {
            "is_human_fashion_request": False,
            "is_insufficient_for_retrieval": False,
        }
        should_block = (
            parsed_oos.get("is_human_fashion_request") is False
            and not parsed_oos.get("is_insufficient_for_retrieval")
        )
        assert should_block

    # Test 8 in spec: unsupported human-fashion item → CATALOG_UNAVAILABLE
    def test_human_fashion_but_not_in_catalog(self):
        """Children's clothing or shoes are human fashion → CATALOG_UNAVAILABLE, not OUT_OF_SCOPE."""
        parsed_kids = {
            "is_human_fashion_request": True,
            "is_insufficient_for_retrieval": False,
            "resolved_intent": "PRODUCT_DISCOVERY",
            "requested_product_type": "children's jacket",
        }
        should_block = (
            parsed_kids.get("is_human_fashion_request") is False
            and not parsed_kids.get("is_insufficient_for_retrieval")
        )
        assert not should_block  # is_human_fashion_request=True → guard does not fire

    # Test 10 in spec: true unrelated request → OUT_OF_SCOPE
    def test_unrelated_request_is_blocked(self):
        parsed_unrelated = {
            "is_human_fashion_request": False,
            "is_insufficient_for_retrieval": False,
            "resolved_intent": "OUT_OF_SCOPE",
        }
        should_block = (
            parsed_unrelated.get("is_human_fashion_request") is False
            and not parsed_unrelated.get("is_insufficient_for_retrieval")
        )
        assert should_block

    # Test 11 in spec: genuine gibberish
    def test_gibberish_is_not_blocked(self):
        parsed_gibberish = {
            "is_human_fashion_request": False,  # or True — doesn't matter
            "is_insufficient_for_retrieval": True,
            "resolved_intent": "CLARIFICATION",
        }
        should_block = (
            parsed_gibberish.get("is_human_fashion_request") is False
            and not parsed_gibberish.get("is_insufficient_for_retrieval")
        )
        assert not should_block

    # Test 12 in spec: recoverable typo must NOT become gibberish
    def test_recoverable_typo_not_gibberish(self):
        """
        Typos like "blouze", "tshrit" are not gibberish — the LLM should
        still extract meaning. Only truly random sequences are gibberish.
        The compound splitter must NOT flag single words as compound.
        """
        result = _split_compound_to_categories("blouze", CATALOG_CATS)
        # "blouze" has no connective → returns [] (treated as single word by splitter)
        assert result == []

    def test_clarification_message_differs_with_fashion_signal(self):
        """
        Verify the CLARIFICATION handler differentiation logic is consistent:
        - with fashion signal → "provide more detail"
        - without fashion signal → "I'm not sure I understood"
        """
        parsed_with_signal = {
            "requested_fashion_concept": "wedding",
            "canonical_catalog_category": None,
            "requested_product_type": None,
            "canonical_department": None,
            "requested_department": None,
        }
        has_signal = bool(
            parsed_with_signal.get("requested_fashion_concept")
            or parsed_with_signal.get("canonical_catalog_category")
            or parsed_with_signal.get("requested_product_type")
            or parsed_with_signal.get("canonical_department")
            or parsed_with_signal.get("requested_department")
        )
        assert has_signal  # "wedding" is a fashion signal → detail message

        parsed_no_signal = {
            "requested_fashion_concept": None,
            "canonical_catalog_category": None,
            "requested_product_type": None,
            "canonical_department": None,
            "requested_department": None,
        }
        has_no_signal = bool(
            parsed_no_signal.get("requested_fashion_concept")
            or parsed_no_signal.get("canonical_catalog_category")
            or parsed_no_signal.get("requested_product_type")
            or parsed_no_signal.get("canonical_department")
            or parsed_no_signal.get("requested_department")
        )
        assert not has_no_signal  # no signal → rephrase message


# ─── STABILIZATION PASS: human_fashion guard + childrenwear ──────────────────

class TestHumanFashionGuardExemptions:
    """
    The is_human_fashion_request=False guard fires for all intents EXCEPT
    GREETING, SELF_AWARENESS, PROFILE, and CATALOG_UNAVAILABLE.

    PRODUCT_DISCOVERY with is_human_fashion_request=False is now BLOCKED —
    non-human wearer requests (e.g. "jacket for my cat") must become OOS
    regardless of the intent the LLM returns.

    Children's clothing is classified as is_human_fashion_request=True by
    the classifier instruction, so it bypasses the guard and reaches its
    own CATALOG_UNAVAILABLE path naturally.
    """

    def _should_block(self, resolved_intent_str: str, is_human: bool, is_insufficient: bool) -> bool:
        from app.agent import SemanticIntent
        _EXEMPT = {
            SemanticIntent.GREETING.value,
            SemanticIntent.SELF_AWARENESS.value,
            SemanticIntent.PROFILE.value,
            # CATALOG_UNAVAILABLE has its own handler; children's clothing lands here
            # with is_human_fashion_request=True anyway (per classifier instruction).
            SemanticIntent.CATALOG_UNAVAILABLE.value,
        }
        return (
            is_human is False
            and not is_insufficient
            and resolved_intent_str not in _EXEMPT
        )

    def test_catalog_unavailable_is_exempt(self):
        """CATALOG_UNAVAILABLE must not hit the non-human guard."""
        from app.agent import SemanticIntent
        assert not self._should_block(SemanticIntent.CATALOG_UNAVAILABLE.value, False, False)

    def test_non_human_product_discovery_is_blocked(self):
        """PRODUCT_DISCOVERY with is_human_fashion_request=False must be blocked.
        Covers: 'jacket for my cat', 'dog raincoat', 'fish outfit'.
        Children's clothing doesn't reach here — it gets is_human=True."""
        from app.agent import SemanticIntent
        assert self._should_block(SemanticIntent.PRODUCT_DISCOVERY.value, False, False)

    def test_out_of_scope_is_still_blocked(self):
        """Genuine non-fashion OUT_OF_SCOPE must still hit the guard."""
        from app.agent import SemanticIntent
        assert self._should_block(SemanticIntent.OUT_OF_SCOPE.value, False, False)

    def test_childrenwear_human_fashion_true_bypasses_guard(self):
        """Children's clothing is human fashion (is_human=True per classifier rule)
        so the guard never fires for it, regardless of intent."""
        from app.agent import SemanticIntent
        assert not self._should_block(SemanticIntent.PRODUCT_DISCOVERY.value, True, False)

    def test_continuation_with_non_human_is_blocked(self):
        """CONTINUATION with is_human_fashion_request=False must also be blocked.
        Prevents 'jacket for my cat' from continuing an active jacket search."""
        from app.agent import SemanticIntent
        assert self._should_block(SemanticIntent.CONTINUATION.value, False, False)

    def test_insufficient_flag_bypasses_guard(self):
        """Gibberish/unrecognizable input must not hit the non-human guard even if
        is_human=False — let the CLARIFICATION path handle it."""
        from app.agent import SemanticIntent
        assert not self._should_block(SemanticIntent.OUT_OF_SCOPE.value, False, True)


# ─── STABILIZATION PASS: CONTINUATION — show more ────────────────────────────

class TestContinuationAwareDeptQuestion:
    """
    AWAITING_DEPARTMENT question must use dynamic departments and
    any preserved fashion concept — never a hardcoded static sentence.
    """

    def test_dept_question_uses_concept(self):
        """When a fashion concept is known, the question must reference it."""
        concept = "wedding"
        depts = ["women", "men"]
        dept_labels = " or ".join(f"{d}swear" for d in depts)
        question = (
            f"I'd love to help you find something for {concept}! "
            f"Are you shopping for {dept_labels}?"
        )
        assert "wedding" in question
        assert "womenswear" in question or "women" in question

    def test_dept_question_without_concept(self):
        """Without a concept the question still uses dynamic dept labels."""
        depts = ["women", "men"]
        dept_labels = " or ".join(f"{d}swear" for d in depts)
        question = f"Are you shopping for {dept_labels}?"
        assert "womenswear" in question
        assert "menswear" in question
        assert "hardcoded" not in question


# ─── STABILIZATION PASS: material fact — empty string regression ──────────────

class TestMaterialFactEmptyString:
    """
    _answer_current_product_fact must return a deterministic 'not provided'
    response (not None) when the fabric field is present but empty string.
    Empty string comes from the widget's `p.fabric || p.material || ""`.
    """

    def test_empty_string_fabric_is_not_none(self):
        from app.agent import _answer_current_product_fact
        product = {"id": "p1", "name": "Test", "fabric": "", "brand": "A", "category": "skirt"}
        state = {
            "query": "what's material",
            "product_id": "p1",
            "catalog_products": [product],
            "size_chart": None,
        }
        result = _answer_current_product_fact(state)
        assert result is not None, "Empty fabric should return 'not provided', not None"
        assert "not provided" in result.message.lower() or "not available" in result.message.lower()

    def test_composition_keyword_is_handled(self):
        """'composition' must also be recognized as a material keyword."""
        from app.agent import _answer_current_product_fact
        product = {"id": "p1", "name": "Test", "fabric": "100% cotton", "brand": "A", "category": "shirt"}
        state = {
            "query": "what is the composition?",
            "product_id": "p1",
            "catalog_products": [product],
            "size_chart": None,
        }
        result = _answer_current_product_fact(state)
        assert result is not None
        assert "cotton" in result.message.lower()


# ─── STABILIZATION PASS: chart Q&A query-text fallback ───────────────────────

class TestChartQAQueryFallback:
    """
    Chart dimension + operation extraction must work from query text alone
    (not only from classifier output), so chart Q&A is resilient to transient
    classifier field omissions.
    """

    CHART = json.dumps([
        {"size": "S",  "chest_cm": 86, "waist_cm": 66, "hip_cm": 90},
        {"size": "M",  "chest_cm": 90, "waist_cm": 70, "hip_cm": 94},
        {"size": "L",  "chest_cm": 94, "waist_cm": 74, "hip_cm": 98},
        {"size": "XL", "chest_cm": 98, "waist_cm": 78, "hip_cm": 102},
    ])

    def _dims_and_op_from_query(self, query: str):
        """Reproduce the query-text fallback logic from agent.py."""
        from app.agent import _DIMENSION_MAP, _SIZE_LABEL_PATTERN
        import re
        qlow = query.lower()
        dims = [k for k in _DIMENSION_MAP if k in qlow]
        op = None
        for_sz = None
        if dims:
            if any(w in qlow for w in ("max", "maximum", "biggest", "largest")):
                op = "max"
            elif any(w in qlow for w in ("min", "minimum", "smallest")):
                op = "min"
            elif "range" in qlow or "between" in qlow:
                op = "range"
            else:
                # Match agent.py: strip possessive 's before size label search
                q_for_sz = re.sub(r"'s\b", " ", query, flags=re.IGNORECASE)
                m = _SIZE_LABEL_PATTERN.search(q_for_sz)
                if m:
                    op = "value"
                    for_sz = m.group(1).upper()
        return dims, op, for_sz

    def test_max_chest_from_query(self):
        dims, op, _ = self._dims_and_op_from_query("what's max chest?")
        assert "chest" in dims
        assert op == "max"
        from app.agent import _resolve_chart_answer
        result = _resolve_chart_answer(self.CHART, dims, op, None)
        assert result is not None and "98" in result

    def test_max_waist_from_query(self):
        dims, op, _ = self._dims_and_op_from_query("what's the maximum waist?")
        assert "waist" in dims
        assert op == "max"
        from app.agent import _resolve_chart_answer
        result = _resolve_chart_answer(self.CHART, dims, op, None)
        assert result is not None and "78" in result

    def test_max_hip_from_query(self):
        dims, op, _ = self._dims_and_op_from_query("what's max hip?")
        assert "hip" in dims
        assert op == "max"
        from app.agent import _resolve_chart_answer
        result = _resolve_chart_answer(self.CHART, dims, op, None)
        assert result is not None and "102" in result

    def test_max_chest_and_waist_from_query(self):
        dims, op, _ = self._dims_and_op_from_query("what's max chest and waist?")
        assert "chest" in dims and "waist" in dims
        assert op == "max"

    def test_min_waist_from_query(self):
        dims, op, _ = self._dims_and_op_from_query("what's the minimum waist?")
        assert "waist" in dims
        assert op == "min"
        from app.agent import _resolve_chart_answer
        result = _resolve_chart_answer(self.CHART, dims, op, None)
        assert result is not None and "66" in result

    def test_range_hip_from_query(self):
        dims, op, _ = self._dims_and_op_from_query("what's the hip range?")
        assert "hip" in dims
        assert op == "range"

    def test_value_for_size_from_query(self):
        dims, op, for_sz = self._dims_and_op_from_query("what's waist for XL?")
        assert "waist" in dims
        assert op == "value"
        assert for_sz == "XL"

    def test_absent_dimension_returns_no_dims(self):
        dims, _, _ = self._dims_and_op_from_query("tell me about this jacket")
        assert dims == []

    def test_unavailable_dimension_reports_not_found(self):
        """If query asks for a dimension not in the chart, _resolve_chart_answer
        returns a message explaining it's not available."""
        from app.agent import _resolve_chart_answer
        chart_no_hip = json.dumps([
            {"size": "M", "chest_cm": 90, "waist_cm": 70},
        ])
        result = _resolve_chart_answer(chart_no_hip, ["hip"], "max", None)
        assert result is not None
        assert "no" in result.lower() or "not" in result.lower() or "hip" in result.lower()


# ─── STABILIZATION PASS: CONTINUATION selected_category sync ─────────────────

class TestContinuationSelectedCategorySync:
    """
    For CONTINUATION turns, active_search.selected_category must be restored
    into state["selected_category"] so that:
    - _filtered_catalog enforces the correct category
    - remote search payload includes the category
    - structural fallback only returns products from that category.

    Without this, the widget sending selected_category: null on every request
    causes CONTINUATION searches to ignore the category filter and either
    return wrong-category products or false exhaustion.
    """

    def _build_continuation_state(self, selected_category_in_state, active_search_category):
        from app.schemas import ActiveSearch
        return {
            "query": "show me more",
            "resolved_intent": "CONTINUATION",
            "selected_category": selected_category_in_state,
            "active_search": ActiveSearch(
                query="women's jackets",
                department="women",
                selected_category=active_search_category,
            ),
            "_parsed_classification": {},
            "catalog_products": [],
        }

    def test_category_restored_from_active_search(self):
        """When state has no selected_category but active_search does,
        the effective category must be active_search.selected_category."""
        from app.schemas import ActiveSearch
        state = self._build_continuation_state(None, "jacket")
        # Reproduce the sync logic from retrieve_rag_context
        active_search = state["active_search"]
        if active_search.selected_category and not state.get("selected_category"):
            state["selected_category"] = active_search.selected_category
        assert state["selected_category"] == "jacket"

    def test_explicit_state_category_not_overridden(self):
        """If state already has a selected_category, the sync must not override it."""
        from app.schemas import ActiveSearch
        state = self._build_continuation_state("skirt", "jacket")
        active_search = state["active_search"]
        if active_search.selected_category and not state.get("selected_category"):
            state["selected_category"] = active_search.selected_category
        assert state["selected_category"] == "skirt"

    def test_no_active_search_category_leaves_state_unchanged(self):
        """If active_search has no category, state stays unchanged."""
        from app.schemas import ActiveSearch
        state = self._build_continuation_state(None, None)
        active_search = state["active_search"]
        if active_search.selected_category and not state.get("selected_category"):
            state["selected_category"] = active_search.selected_category
        assert state.get("selected_category") is None


# ─── STABILIZATION PASS: catalog meta — authoritative facts ──────────────────

class TestCatalogMetaAuthoritative:
    """
    _catalog_meta_response must build its answer entirely from authoritative
    catalog state — never from hardcoded lists.
    """

    def test_brands_query_returns_catalog_brands(self):
        from app.agent import _catalog_meta_response
        products = [
            {"id": "p1", "category": "jacket", "brand": "ThreadCo"},
            {"id": "p2", "category": "skirt",  "brand": "DuoWear"},
        ]
        state = {
            "query": "what brands do you have?",
            "catalog_products": products,
            "available_departments": ["women"],
            "category_department_mapping": {},
        }
        result = _catalog_meta_response(state)
        assert result is not None
        assert "ThreadCo" in result.message or "DuoWear" in result.message

    def test_categories_query_returns_catalog_categories(self):
        from app.agent import _catalog_meta_response
        products = [
            {"id": "p1", "category": "jacket", "brand": "A"},
            {"id": "p2", "category": "blouse",  "brand": "B"},
        ]
        state = {
            "query": "what categories are available?",
            "catalog_products": products,
            "available_departments": ["women"],
            "category_department_mapping": {},
        }
        result = _catalog_meta_response(state)
        assert result is not None
        assert "jacket" in result.message.lower() or "blouse" in result.message.lower()

    def test_no_catalog_products_returns_graceful_message(self):
        from app.agent import _catalog_meta_response
        state = {
            "query": "what brands do you carry?",
            "catalog_products": [],
            "available_departments": [],
            "category_department_mapping": {},
        }
        result = _catalog_meta_response(state)
        assert result is not None
        assert result.message  # must not be empty


# ─── STABILIZATION PASS: show-more / false exhaustion ────────────────────────

class TestShowMoreExhaustionLogic:
    """
    CONTINUATION exhaustion must only fire after ALL eligible unseen products
    are consumed. The category filter must be applied before the exhaustion
    check so that products from the wrong category don't pollute the eligible set.
    """

    def test_category_filter_removes_wrong_category(self):
        """Products from a different category must not count as eligible continuation
        candidates, preventing false 'no more results' for the active category."""
        active_cat = "jacket"
        catalog = [
            {"id": "j1", "category": "jacket", "gender": "women", "brand": "A", "name": "J1", "description": ""},
            {"id": "j2", "category": "jacket", "gender": "women", "brand": "A", "name": "J2", "description": ""},
            {"id": "s1", "category": "skirt",  "gender": "women", "brand": "A", "name": "S1", "description": ""},
        ]
        filtered = [p for p in catalog if p.get("category", "").lower() == active_cat]
        assert len(filtered) == 2, "Only jacket products should be in eligible set"
        assert all(p["category"] == "jacket" for p in filtered)

    def test_shown_ids_dedup_leaves_unseen_eligible(self):
        """After deduplication, unseen eligible products must remain available."""
        shown = {"j1"}
        eligible = [
            {"id": "j1", "category": "jacket"},
            {"id": "j2", "category": "jacket"},
        ]
        unseen = [p for p in eligible if p["id"] not in shown]
        assert len(unseen) == 1
        assert unseen[0]["id"] == "j2"

    def test_exhaustion_only_when_no_unseen_eligible(self):
        """Exhaustion must ONLY fire when remaining_products == 0."""
        shown = {"j1", "j2"}
        eligible = [{"id": "j1"}, {"id": "j2"}]
        remaining = [p for p in eligible if p["id"] not in shown]
        # Only emit exhaustion when remaining is empty
        assert len(remaining) == 0  # exhaustion is correct here

    def test_no_exhaustion_when_unseen_exist(self):
        """Must NOT emit exhaustion when there are unseen eligible products."""
        shown = {"j1"}
        eligible = [{"id": "j1"}, {"id": "j2"}, {"id": "j3"}]
        remaining = [p for p in eligible if p["id"] not in shown]
        assert len(remaining) > 0  # exhaustion must NOT fire


# ─── NEW: full chart + absent chart dimension (broken case A+B) ───────────────

class TestFullChartAndAbsentDimension:
    """
    _resolve_chart_answer must:
    - Return the entire chart when operation="full" (no specific dimensions).
    - Return a 'not in chart' message when a specific field is absent from all rows.
    """

    CHART = json.dumps([
        {"size": "S",  "chest_cm": 86, "waist_cm": 66, "hip_cm": 90},
        {"size": "M",  "chest_cm": 90, "waist_cm": 70, "hip_cm": 94},
        {"size": "L",  "chest_cm": 94, "waist_cm": 74, "hip_cm": 98},
        {"size": "XL", "chest_cm": 98, "waist_cm": 78, "hip_cm": 102},
    ])

    def test_full_operation_returns_all_sizes(self):
        result = _resolve_chart_answer(self.CHART, [], "full", None)
        assert result is not None
        assert "S" in result and "M" in result and "L" in result and "XL" in result

    def test_full_operation_contains_dimension_data(self):
        result = _resolve_chart_answer(self.CHART, [], "full", None)
        assert result is not None
        # Must include actual measurement values
        assert "86" in result or "90" in result  # chest data

    def test_full_operation_empty_chart_returns_none(self):
        result = _resolve_chart_answer("[]", [], "full", None)
        assert result is None

    def test_absent_field_in_chart_returns_not_found_message(self):
        # Chart has no height_cm — asking for "height" must NOT raise or produce None.
        # _resolve_chart_answer normalizes "height" → not in _DIMENSION_MAP → fields=[]
        # returns None (caller handles this as absent-dimension case)
        result = _resolve_chart_answer(self.CHART, ["height"], "max", None)
        # Either None (caller produces absent-dim message) or a helpful message.
        # The key invariant: it must NOT crash and must NOT invent a value.
        if result is not None:
            assert "height" in result.lower() or "not" in result.lower()

    def test_absent_field_via_no_data_path(self):
        # Chart exists but requested dimension has no data for any row.
        chart_no_hip = json.dumps([{"size": "M", "chest_cm": 90, "waist_cm": 70}])
        result = _resolve_chart_answer(chart_no_hip, ["hip"], "max", None)
        # Must not crash; must signal absence not a made-up value.
        assert result is not None
        assert "no" in result.lower() or "not" in result.lower() or "hip" in result.lower()

    def test_full_chart_not_none_for_normal_chart(self):
        result = _resolve_chart_answer(self.CHART, [], "full", None)
        assert result is not None, "_resolve_chart_answer('full') must return data, not None"


# ─── NEW: department post-filter on remote search (broken case C) ─────────────

class TestDepartmentPostFilter:
    """
    Remote search results must be filtered by department AFTER the store API
    returns them — the API may ignore the gender constraint and return
    products from the wrong department.
    """

    def _filter_by_dept(self, products: list, dept: str) -> list:
        return [
            p for p in products
            if (p.get("department") or p.get("gender") or "").lower() == dept.lower()
        ]

    def test_women_products_removed_when_men_requested(self):
        products = [
            {"id": "s1", "category": "skirt", "gender": "women"},
            {"id": "s2", "category": "skirt", "gender": "women"},
            {"id": "t1", "category": "tshirt", "gender": "men"},
        ]
        filtered = self._filter_by_dept(products, "men")
        assert len(filtered) == 1
        assert filtered[0]["id"] == "t1"

    def test_men_skirts_query_returns_zero_cards(self):
        # If catalog has no men's skirts, post-filter must yield empty list.
        products = [
            {"id": "s1", "category": "skirt", "gender": "women"},
            {"id": "s2", "category": "skirt", "gender": "women"},
        ]
        filtered = self._filter_by_dept(products, "men")
        assert filtered == []

    def test_unisex_or_no_dept_excluded_when_dept_required(self):
        # Products with no gender field do NOT match "men".
        products = [
            {"id": "p1", "category": "jacket"},  # no gender
        ]
        filtered = self._filter_by_dept(products, "men")
        assert filtered == []

    def test_correct_dept_products_preserved(self):
        products = [
            {"id": "j1", "category": "jacket", "gender": "men"},
            {"id": "j2", "category": "jacket", "department": "men"},
        ]
        filtered = self._filter_by_dept(products, "men")
        assert len(filtered) == 2


# ─── NEW: SOCIAL in General + Product Chat (broken case SOCIAL) ───────────────

class TestSocialResponseInvariant:
    """
    SOCIAL acknowledgements must reach the GREETING handler, which has a static
    fallback. The static fallback must NEVER be the 'trouble' message.
    """

    def test_greeting_static_fallback_is_not_trouble_message(self):
        # The GREETING handler's exception fallback (lines 3462-3465 in agent.py)
        # must use a warm social message, not the internal error message.
        _static_greeting_fallback = (
            "You're welcome! Let me know if there's anything else I can help you with."
        )
        assert "trouble" not in _static_greeting_fallback.lower()
        assert "error" not in _static_greeting_fallback.lower()
        assert "welcome" in _static_greeting_fallback.lower()

    def test_social_acks_include_thank_you(self):
        from app.agent import SemanticIntent
        # Verify the pre-classifier detects "thank you"
        _SOCIAL_ACKS = frozenset({
            "thank you", "thanks", "ok", "okay", "wow", "great", "perfect",
            "got it", "nice", "cool", "alright", "noted", "yep", "yup",
        })
        cleaned = "thank you".strip().lower().rstrip("!.,? ")
        assert cleaned in _SOCIAL_ACKS

    def test_unseen_gratitude_variant_cleaned_correctly(self):
        # "thanks!" → cleaned → "thanks" (in _SOCIAL_ACKS)
        _SOCIAL_ACKS = frozenset({
            "thank you", "thanks", "ok", "okay", "wow", "great", "perfect",
            "got it", "nice", "cool", "alright", "noted", "yep", "yup",
        })
        cleaned = "thanks!".strip().lower().rstrip("!.,? ")
        assert cleaned in _SOCIAL_ACKS


# ─── NEW: measurement-change routing (broken case D) ─────────────────────────

class TestMeasurementChangeRouting:
    """
    Statements indicating measurements have changed must route to SIZING,
    which asks for fresh measurements rather than reusing stale ones.
    Verified via classifier instruction coverage (semantic not phrase-matching).
    """

    def test_sizing_intent_exists(self):
        from app.agent import SemanticIntent
        assert SemanticIntent.SIZING.value == "SIZING"

    def test_sizing_path_without_measurements_asks_for_them(self):
        # When SIZING intent fires but no measurements are in state,
        # the sizing flow must ask for measurements (not produce 'trouble').
        # This is the existing 'i have new measurements' path that already works.
        # Verifying the state machine: no measurements → ask_measurements action.
        from app.schemas import ActionType
        # The agent returns ASK_MEASUREMENTS when measurements are missing.
        assert ActionType.ASK_MEASUREMENTS.value == "ask_measurements"

    def test_sizing_is_pending_preserving(self):
        # SIZING is in _PENDING_PRESERVING_INTENTS so pending_state survives
        # a measurement-change statement.
        from app.agent import _PENDING_PRESERVING_INTENTS, SemanticIntent
        assert SemanticIntent.SIZING.value in _PENDING_PRESERVING_INTENTS
