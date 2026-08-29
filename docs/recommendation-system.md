# Manikan AI Recommendation Service — Technical Documentation

## 1. System Overview

The **Manikan AI Recommendation Service** is a stateless SaaS backend powering the 3D Try-On & Sizing chat widget on e-commerce storefronts. It blends natural language understanding with deterministic geometric size-matching and catalog-aware product discovery.

### 1.1 Architecture & Pipeline

```
Browser
  └─ recommend-widget.js
       └─ POST /api/widget/recommend  (Next.js proxy — the only entry point)
            └─ authorizeWidgetRequest (key → retailer → origin → quota → rate limit)
                 └─ builds size_chart server-side from ProductVariant rows
                      └─ POST /recommend  (FastAPI)
                           └─ verify_internal_key (hmac.compare_digest)
                                └─ LangGraph 5-node pipeline
                                     ├─ analyze_turn          (classify + state)
                                     ├─ retrieve_rag_context  (catalog retrieval)
                                     ├─ compute_size_math     (deterministic sizing)
                                     ├─ fit_reasoning_agent   (LLM + deterministic handlers)
                                     └─ format_response       (assemble ChatRecommendResponse)
```

**Key architectural decisions:**

- This service has **no direct database connection**. All catalog, profile, and size-chart data arrives from the Next.js proxy in the request body. No ORM, no Postgres, no vector store.
- The `size_chart` is always built server-side by the proxy — the client cannot supply or fabricate it.
- All LLM calls are to a single configured provider (DeepSeek). There is no fallback chain to other providers.

---

## 2. Security Model (Zero Trust)

The Python FastAPI service exposes its endpoint exclusively to the Next.js proxy, enforced by `verify_internal_key` (`main.py`), which compares the `X-Manikan-Internal-Key` header against `RECOMMEND_SERVICE_KEY` using `hmac.compare_digest` (constant-time). A previous-key slot (`RECOMMEND_SERVICE_KEY_PREVIOUS`) is also accepted, enabling zero-downtime key rotation.

Direct client-to-backend connections are blocked. There is no second authenticated path.

The proxy (`widget-auth.ts`, `authorizeWidgetRequest`) enforces the full security gate before the Python service is ever reached:

1. `X-Manikan-Key` header present
2. `Origin` header present and in the retailer's allowlist (fail-closed — missing Origin is rejected)
3. Key resolves to an active `ServiceApiKey` scoped to `RECOMMENDATION`
4. Subscription active with remaining quota
5. Per-retailer rate limit

Any failure returns a generic 401/403/429; the specific check that failed is never disclosed.

---

## 3. Request Validation

### 3.1 Pydantic Request Schema (`ChatRecommendRequest`, `main.py`)

All fields are validated by Pydantic on arrival. The authoritative fields:

| Field | Type | Notes |
|---|---|---|
| `session_id` | `str` | Used for per-process rate limiting |
| `messages` | `list[dict]` | Full chat history; last user message extracted as `query` |
| `betas` | `MeasurementInput` or null | 5 floats: `height_cm, weight_kg, chest_cm, waist_cm, hips_cm` |
| `product_id` | `str` or null | Product the shopper is viewing |
| `product_name` | `str` or null | Display name for the current product |
| `profile_context` | `SafeProfileContext` or null | Name, saved measurements, fit history |
| `active_search` | `dict` or null | Validated into `ActiveSearch` by the route handler |
| `product_detail_question` | `bool` | Set by proxy when the shopper asks about the product, not sizing |
| `size_chart` | `str` or null | JSON array — always built server-side, never accepted raw from the client |
| `available_categories` | `list[str]` or null | Exact category strings from the retailer's catalog |
| `available_departments` | `list[str]` or null | Departments/genders available in the catalog |
| `available_brands` | `list[str]` or null | Brands available in the catalog |
| `category_department_mapping` | `dict[str, list[str]]` or null | Maps each category to its valid departments |
| `catalog_products` | `list[dict]` or null | Compact catalog for in-memory RAG (id, name, category, description) |
| `pending_state` | `PendingState` or null | Tracks the current multi-turn task |
| `shown_product_ids` | `list[str]` or null | IDs already presented; used to avoid repeat cards |

### 3.2 Measurement Input Validation (`MeasurementInput`, `schemas.py`)

```python
class MeasurementInput(BaseModel):
    height_cm: float
    weight_kg: float
    chest_cm: float
    waist_cm: float
    hips_cm: float
```

All five fields are required. Height and weight are present in the contract but currently contribute nothing to the Euclidean size calculation — only `chest_cm`, `waist_cm`, and optionally `hips_cm` (when present in the size chart) are used.

### 3.3 Profile Context Validation (`SafeProfileContext`, `schemas.py`)

The proxy passes a read-only view of the shopper's persisted profile. The service reads but never writes profile data.

```python
class SafeProfileContext(BaseModel):
    first_name: Optional[str]
    saved_measurements: Optional[MeasurementInput]
    previous_product_size: Optional[str]
    recent_fit_history: list[ProfileHistoryItem]
```

### 3.4 Active Search Validation (`ActiveSearch`, `schemas.py`)

```python
class ActiveSearch(BaseModel):
    query: str
    department: Optional[str]
    selected_category: Optional[str]
    requested_material: Optional[str]
    min_price: Optional[float]
    max_price: Optional[float]
    style_occasion: Optional[str]
```

`active_search` persists structured search state across turns. Its `department` field is the authoritative constraint for eligibility checks in `retrieve_rag_context`.

### 3.5 Pending State Validation (`PendingState`, `schemas.py`)

```python
class PendingState(BaseModel):
    type: PendingType  # CONFIRM_MEASUREMENTS | REQUEST_CONFIDENCE | AWAITING_DEPARTMENT | AWAITING_CATEGORY
    product_id: Optional[str]
    product_name: Optional[str]
    recommended_size: Optional[str]
    size_provenance: Optional[str]
```

`PendingType` is an enum — any value outside the four declared members is rejected by Pydantic.

### 3.6 Per-Session Rate Limiting

`_check_rate_limit(session_id)` enforces 10 requests per 60-second window per session, tracked in a per-process in-memory deque. Excess requests raise `HTTP 429`. Additionally, a global anomaly deque logs a warning when any hour exceeds 200 requests across all sessions.

---

## 4. LLM Provider

`call_llm_with_fallback` (`agent.py`) uses **DeepSeek** as the sole LLM provider:

| Provider | Client | Config |
|---|---|---|
| DeepSeek `deepseek-chat` | `AsyncOpenAI` pointed at `api.deepseek.com` | `DEEPSEEK_API_KEY` |

If `DEEPSEEK_API_KEY` is absent, `call_llm_with_fallback` raises `RuntimeError` immediately. There is no multi-provider fallback chain; the single endpoint must succeed or the turn falls through to the deterministic emergency response.

`response_format={"type": "json_object"}` is set on every call, requesting a structured JSON reply. The returned JSON is parsed and validated against `RecommendationOutput` via Pydantic. An invalid action value is replaced with the caller's `fallback_action`. A missing `message` field raises `ValueError("llm_empty_message")` so each call-site can apply its own contextually-correct fallback rather than a generic error.

`check_all_providers()` (used by `GET /health`) probes DeepSeek and returns its live status.

---

## 5. Graph Architecture — 5-Node LangGraph Pipeline

The service compiles a `StateGraph(FitState)` with five nodes and conditional routing:

```
START
  │
  ▼
analyze_turn
  │
  ├─ final_response already set? ──────────────────────────────────► format_response
  │
  ├─ resolved_intent == SIZING ────────────────────────────────────► compute_size_math
  │                                                                        │
  │                                                                        ▼
  │                                                                  format_response
  │
  ├─ requires_catalog == True ─────────────────────────────────────► retrieve_rag_context
  │                                                                        │
  │                                                                        ▼
  │                                                                  fit_reasoning_agent
  │                                                                        │
  │                                                                        ▼
  └─ (default) ────────────────────────────────────────────────────► fit_reasoning_agent
                                                                           │
                                                                           ▼
                                                                     format_response
                                                                           │
                                                                           ▼
                                                                         END
```

### 5.1 `analyze_turn`

The first node. Resolves the last user message as `query`, handles any active `pending_state`, runs the LLM-based semantic intent classifier (`_classify_intent_with_llm`), and populates the `FitState` with:
- `resolved_intent` (a `SemanticIntent` enum value)
- `requires_catalog` (whether `retrieve_rag_context` should run)
- `_parsed_classification` (raw classifier output — declared in `FitState` so LangGraph propagates it)
- Constraint fields: `requested_material`, `requested_price_range`, `requested_brand`, `active_search`

Deterministic short-circuit: if `pending_state` resolves the turn fully (e.g., the user confirms or corrects a size), `final_response` is set and the remaining nodes are skipped via the `format_response` conditional edge.

### 5.2 `retrieve_rag_context`

Runs only when `requires_catalog == True` (PRODUCT_DISCOVERY and CONTINUATION intents by default; CATALOG_META always forces it False).

Retrieves products through two complementary paths:
1. **Store API search** (`/api/products/search`): HTTP call to the Next.js store, results filtered through `_is_eligible` before storing.
2. **Local TF-IDF** (`_retrieve_local_candidates`): in-memory cosine similarity over `catalog_products`; supplements store API results when fewer than `desired_page_size` (4) were found.

Both paths are subject to **eligibility filtering** (see §7). A structural fallback — returning constrained-catalog products directly when TF-IDF scores every product below threshold — handles plural/stemming mismatches without hardcoding synonyms.

### 5.3 `compute_size_math`

Runs only when `resolved_intent == SIZING`. Calls `compute_recommended_size` (pure deterministic function) and stores the result in `size_math_result`. No LLM call.

### 5.4 `fit_reasoning_agent`

Handles all remaining intents. Deterministic intents are dispatched without any LLM call:

| Intent | Handler | Response type |
|---|---|---|
| GREETING | `_answer_self_awareness_question` | STATIC-GREETING |
| SELF_AWARENESS | `_answer_self_awareness_question` | STATIC-SELF-AWARENESS |
| PROFILE | `_answer_profile_question` | STATIC-PROFILE |
| CATALOG_META | `_catalog_meta_response` | STATIC-CATALOG-META |
| CATALOG_UNAVAILABLE | Inline static response | STATIC-UNAVAILABLE |
| OUT_OF_SCOPE | Inline static response | STATIC-OUT-OF-SCOPE |
| CLARIFICATION | Inline static response | STATIC-CLARIFICATION |
| CURRENT_PRODUCT | `_answer_current_product_fact` or `_resolve_chart_answer` | STATIC-CURRENT-PRODUCT |

PRODUCT_DISCOVERY and CONTINUATION call `call_llm_with_fallback` with the retrieved product context.

### 5.5 `format_response`

Assembles the final `RecommendationOutput` into `state["structured_response"]`, which `main.py` reads to build `ChatRecommendResponse`.

---

## 6. Semantic Intent Classification

`_classify_intent_with_llm` (`agent.py`) calls DeepSeek with a structured classifier prompt and returns a JSON object with these fields (among others):

| Field | Values | Purpose |
|---|---|---|
| `resolved_intent` | `SemanticIntent` enum | The primary routing decision |
| `requires_catalog` | bool | Whether `retrieve_rag_context` should run (overridden for CATALOG_META) |
| `catalog_meta_subject` | BRANDS / CATEGORIES / DEPARTMENTS / CATEGORIES_FOR_DEPARTMENT / null | Disambiguates CATALOG_META responses |
| `requested_department` | string or null | Canonicalized to men/women via `_DEPT_ALIAS_MAP` |
| `canonical_department` | string or null | Preferred over `requested_department` when both are present |
| `requested_category` | string or null | Matched case-insensitively against `available_categories` |
| `requested_brand` | string or null | Brand constraint for eligibility filtering |

`_DEPT_ALIAS_MAP` normalizes natural variants (man → men, woman → women, male → men, etc.). Child/kids terms are intentionally absent — they are not silently mapped to an adult department.

A post-classifier guard broadens PROFILE detection: if the query contains profile-reference phrases ("about me", "know about me", etc.) and the intent was classified as CATALOG_META or PRODUCT_DISCOVERY, it is corrected to PROFILE before any further processing.

---

## 7. Catalog Validation & Eligibility

### 7.1 Category-Department Compatibility

`_map_get_departments(mapping, category)` (`agent.py`) performs a **case-insensitive** lookup into `category_department_mapping`. The DB stores capitalized keys ("Skirt"); runtime uses lowercase names ("skirt"). All six lookup sites in the routing and eligibility logic use this helper so no category-department check can silently pass due to a case mismatch.

When a user requests a category for a specific department, the mapping is consulted to determine compatibility. If the requested category has no entries for the requested department in the mapping, the response is CATALOG_UNAVAILABLE.

### 7.2 Authoritative Eligibility Gate (`_is_eligible`, `retrieve_rag_context`)

Every product that may be placed in `retrieved_products` passes through `_is_eligible` — a closure that enforces all active constraints:

```
department/gender match  (from active_search.department — authoritative, takes priority)
category match           (from selected_category — case-insensitive string equality)
brand match              (from parsed_classification.requested_brand — if a brand was requested)
```

`_is_eligible` is applied at three points:
1. To the full `catalog_products` list before any TF-IDF scoring
2. To every product returned by the store API
3. In the structural fallback (when TF-IDF scores everything below threshold)

A product cannot enter `retrieved_products` by any path if it fails eligibility. This is the **final safety gate**: the LLM does not grant eligibility, and RAG scores do not override it.

### 7.3 CATALOG_META — Deterministic Catalog Facts

CATALOG_META intents are answered entirely from authoritative state data without any RAG retrieval or LLM call:

- **BRANDS**: from `state["available_brands"]` (populated by the Next.js proxy from the live DB)
- **CATEGORIES**: from `state["catalog_products"]` or `category_department_mapping` keys
- **DEPARTMENTS**: from `state["available_departments"]` or mapping values
- **CATEGORIES_FOR_DEPARTMENT**: from `category_department_mapping` filtered by the requested department

`requires_catalog` is forced to `False` for CATALOG_META regardless of the LLM's output. No vector search is performed.

### 7.4 Hard Product Constraints

Price and material constraints are resolved in `analyze_turn` and enforced in `retrieve_rag_context`:

- `_extract_price_constraint` parses price ranges from the query ("under 500", "between 300 and 600")
- `_filter_catalog_by_material_and_price` filters the constrained catalog by both material and price before TF-IDF scoring
- Store API results receive the same material/price filter after retrieval

---

## 8. Deterministic Sizing — `compute_recommended_size`

`compute_recommended_size(betas, size_chart_raw)` (`agent.py`) is a pure function. For each size row in the JSON `size_chart`, it computes:

```
distance = sqrt(
    (chest_cm_row - chest_cm_user)²
  + (waist_cm_row - waist_cm_user)²
  [+ (hip_cm_row - hips_cm_user)² if hip data is in the row]
)
```

The row with the smallest distance wins. If that distance exceeds `OUT_OF_RANGE_THRESHOLD_CM = 15.0`, the result is explicitly out-of-range — no size is recommended, and the agent responds honestly rather than forcing a poor match.

`confidence = 1 − (distance / 15.0)`, decaying linearly from 1.0 at a perfect match to 0.0 at the 15 cm cutoff.

The size chart is validated at parse time: non-JSON input and an empty JSON array both produce an explicit out-of-range result rather than a crash. Rows missing `waist_cm` are silently excluded from candidates.

### 8.1 Size Chart Format Validation

The size chart is a JSON array:

```json
[
  {"size": "S",  "chest_cm": 86, "waist_cm": 68, "hip_cm": 90},
  {"size": "M",  "chest_cm": 90, "waist_cm": 72, "hip_cm": 94},
  {"size": "L",  "chest_cm": 94, "waist_cm": 76, "hip_cm": 98}
]
```

`_build_chart_section` derives all field names dynamically from the actual chart data — there are no hardcoded field names. Any `_cm` or `_kg` suffix is stripped for display. This ensures products with non-standard chart schemas (e.g., additional measurement fields) are handled correctly.

### 8.2 Dimension Alias Map

`_DIMENSION_MAP` maps natural language aliases to the canonical JSON field names:

```python
{"chest": "chest_cm", "bust": "chest_cm", "waist": "waist_cm", "hip": "hip_cm", "hips": "hip_cm"}
```

`_resolve_chart_answer` consults this map before falling back to substring matching, so "bust" and "hips" resolve correctly to the corresponding chart columns.

---

## 9. RAG — `retrieve_rag_context`

`retrieve_relevant_products` (`retrieval.py`) vectorizes the query and product descriptions (name + category + description) with scikit-learn's `TfidfVectorizer`, then ranks products by cosine similarity. Results with similarity ≤ 0.05 are dropped so an unrelated query returns nothing rather than forcing weak matches.

**Known limitation — no stemming**: plain `TfidfVectorizer` tokenizes on exact word forms. A plural query term ("skirts") does not match catalog descriptions written in singular ("Skirt"). The structural fallback in `retrieve_rag_context` handles this by returning constrained-catalog products directly when TF-IDF scores all candidates below threshold.

`retrieve_rag_context` supplements TF-IDF results with a store API search when the returned set is below `desired_page_size` (4 products). All API-returned products pass through `_is_eligible` before being added.

**Why TF-IDF rather than dense embeddings**: The service is stateless — `catalog_products` arrives fresh each request. There is no persistent index to pre-build. TF-IDF over a small per-request catalog runs in-process with no network call, at negligible latency. When `HF_TOKEN` is configured, embedding-based retrieval via the Hugging Face Inference API becomes available as an alternative.

---

## 10. Confidence-Threshold Logic — Product Page vs. General Chat

Two confidence policies exist, intentionally separate:

**Product page** (`betas` + `size_chart` both present): the agent runs `compute_recommended_size` (§8). Separately, if the user states a size label (e.g., "I'm an XL"), the agent asks for a confidence percentage. ≥ 80% trusts the stated label; below 80%, the agent requests actual measurements. This branch always has real chart data to verify the claim against.

**General chat** (no `size_chart`): the agent never asks for confidence, never accepts a size label for a recommendation, and redirects the shopper to a specific product page. There is no chart to validate any claim against in this context.

---

## 11. Product Chat — Current Product Validation

When a `product_id` is present, `retrieve_rag_context` enforces retrieval scope:

1. The current product's category is looked up from `catalog_products` and set as `selected_category`, overriding any stale state from a prior turn.
2. If `active_search.selected_category` is unset, it is also set to the current product's category.

This ensures that product discovery attempts from a product page (e.g., "show me similar alternatives") are constrained to that product's own category — a classify error or intent slip cannot retrieve a different category.

`_answer_current_product_fact` handles product information questions deterministically, reading from the product's structured fields (fabric, brand, description). If a field is absent or empty, a deterministic "not provided" response is returned rather than delegating to the LLM.

---

## 12. Pending State Handling

`_resolve_pending_state` (`analyze_turn`) checks whether an active `pending_state` is conclusively answered by the current turn. Recognized action types (`PendingAction`) are: CONFIRMATION, CORRECTION, REJECTION, UPDATE, UNKNOWN, INTERRUPTION.

A pending task is preserved (not cleared) when the current intent is in `_PENDING_PRESERVING_INTENTS`:
```
SELF_AWARENESS, PROFILE, CURRENT_PRODUCT, GREETING,
SIZING, OUT_OF_SCOPE, CONTINUATION, CLARIFICATION
```

Only PRODUCT_DISCOVERY, CATALOG_UNAVAILABLE, and explicit cross-department AWAITING_CATEGORY mismatches are allowed to clear a pending task. This ensures a sidebar question ("what brand is this?") does not lose the shopper's in-progress sizing flow.

---

## 13. Visual Product Cards — Response Validation

`retrieved_product_ids` is attached to the response **only when both** of these hold:
1. `retrieve_rag_context` placed at least one product in `retrieved_products`
2. The LLM's decided `action` is `fetch_products`

If the LLM returns a clarifying question (`provide_recommendation`) despite RAG finding products, `retrieved_product_ids` is not attached. Cards must never appear disconnected from what the reply text is presenting.

A category guard is applied before committing the LLM's `matched_category`: if the value is not an exact (case-insensitive) match against `available_categories`, it is dropped and the action is downgraded from `fetch_products` to `provide_recommendation`. The LLM cannot cause the widget to search for a category that doesn't exist in the catalog.

---

## 14. Error & Fallback Behavior

| Condition | Response |
|---|---|
| `DEEPSEEK_API_KEY` absent | `RuntimeError` → EMERGENCY-FALLBACK |
| DeepSeek returns empty message for non-FETCH_PRODUCTS action | `ValueError("llm_empty_message")` → caller-specific fallback |
| DeepSeek returns empty for `fetch_products` | Neutral caption, cards still rendered |
| CATALOG_META or PROFILE LLM failure | Impossible — both are handled deterministically |
| Workflow raises any unhandled exception | `success=false`, `EMERGENCY-FALLBACK` provider, generic "recalibrating" message |
| `product_id` but no matching product in catalog | CURRENT_PRODUCT fallback: chart displayed if available, otherwise LLM |

The emergency fallback path in `main.py` never exposes internal exception class names to the shopper; the `error_code` field carries the Python exception type name for internal debugging only.

---

## 15. End-to-End Request Flow

1. **Browser** — `recommend-widget.js` POSTs to `/api/widget/recommend` with `X-Manikan-Key`.
2. **`authorizeWidgetRequest`** (`widget-auth.ts`) gates the request: key → retailer → Origin → quota → rate limit.
3. **Server-side size-chart resolution** (`route.ts`) — if `product_id` is present, the proxy verifies the product belongs to this retailer (404 otherwise), then builds `size_chart` as a JSON array from `ProductVariant` rows. The client never supplies its own `size_chart`.
4. **Proxy → FastAPI** — the route forwards to `RECOMMENDATION_SERVICE_URL` with `X-Manikan-Internal-Key: RECOMMENDATION_SERVICE_KEY`.
5. **`verify_internal_key`** (`main.py`) — constant-time comparison; 401 on mismatch.
6. **`recommendation_graph.ainvoke(...)`** — runs the 5-node LangGraph (§5).
7. **Response** — `ChatRecommendResponse` flows back: FastAPI → proxy → widget. Quota is deducted fire-and-forget after the response is sent.

---

## 16. Configuration Reference

All settings are loaded once per process via `@lru_cache` in `config.py` (using `pydantic_settings`).

| Variable | Required | Purpose |
|---|---|---|
| `DEEPSEEK_API_KEY` | **Required** | LLM provider — service is non-functional without it |
| `RECOMMEND_SERVICE_KEY` or `RECOMMENDATION_SERVICE_KEY` | **Required** | Internal shared secret for `verify_internal_key` |
| `RECOMMEND_SERVICE_KEY_PREVIOUS` | Optional | Accepted during key rotation |
| `ALLOWED_ORIGINS` | Optional | Comma-separated CORS origins; defaults to `http://localhost:3000,http://127.0.0.1:3000` |
| `STORE_BASE_URL` | Optional | Base URL of the Next.js store for the store API RAG path; defaults to `http://localhost:3000` |
| `STORE_SERVICE_BASE_URL` | Optional | Alternative base URL for internal store service calls |
| `STORE_SERVICE_RAG_TIMEOUT_SECONDS` | Optional | Timeout for store API product search calls; defaults to `5.0` |
| `HF_TOKEN` or `HUGGINGFACE_API_KEY` | Optional | Enables HuggingFace Inference API for embedding-based retrieval |

---

## 17. Testing

Five test files, all pure-function or mock-based (no live LLM calls except `test_live_scenarios.py`):

| File | Coverage |
|---|---|
| `test_agent.py` | `compute_recommended_size` — exact match, near match, out-of-range, malformed chart |
| `test_core_invariants.py` | `_resolve_chart_answer` (including aliases), `_answer_current_product_fact`, `_find_stated_size_and_confidence`, `_normalize_category_text`, `_DEPT_ALIAS_MAP`, TF-IDF retrieval, `compute_recommended_size` boundary cases |
| `test_e2e_semantic_invariants.py` | End-to-end semantic invariants: department/category compatibility, eligibility, CATALOG_META, PROFILE, CATALOG_UNAVAILABLE, catalog constraints |
| `test_state_arbitration.py` | State arbitration: pending-state preservation, active_search priority, current-turn constraints vs. stale state |
| `test_live_scenarios.py` | TF-IDF retrieval and routing exercised with real provider calls (non-deterministic) |

Run: `python -m pytest tests/ -v`

---

## 18. Key File Breakdown

| File | Role |
|---|---|
| `apps/store/public/recommend-widget.js` | Embeddable client widget — chat UI, product cards, measurement sliders. Only ever calls `/api/widget/recommend`. |
| `apps/store/app/api/widget/recommend/route.ts` | Zero Trust proxy: runs the security gate, builds `size_chart` server-side, forwards to FastAPI with internal key, deducts quota. |
| `apps/store/app/lib/widget-auth.ts` | `authorizeWidgetRequest` — the security gate (key → retailer → origin → quota → rate limit). |
| `apps/store/app/lib/size-chart.ts` | Builds the JSON `size_chart` array from `ProductVariant` rows server-side. |
| `services-python/recommendation-service/app/main.py` | FastAPI app: `verify_internal_key`, `/recommend` and `/health` endpoints, rate limiting, `ChatRecommendRequest`/`ChatRecommendResponse` schemas. |
| `services-python/recommendation-service/app/agent.py` | Core agent: `FitState`, `SemanticIntent`, all 5 graph nodes, deterministic handlers, LLM classifier, size computation, eligibility gate, catalog validation. |
| `services-python/recommendation-service/app/retrieval.py` | TF-IDF + cosine-similarity RAG over catalog product descriptions. |
| `services-python/recommendation-service/app/config.py` | `pydantic_settings`-based `.env` loader with `@lru_cache`. |
| `services-python/recommendation-service/app/schemas.py` | `ActionType`, `RecommendationOutput`, `MeasurementInput`, `ActiveSearch`, `PendingState`, `SafeProfileContext` — shared Pydantic models. |
| `services-python/recommendation-service/Dockerfile` | Python 3.11-slim image; build-time import test validates the full dependency set on build. |
