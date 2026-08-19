# Manikan AI Recommendation Service — Technical Documentation & Demo Flow

## 0. Demo-Readiness Status (verified live, 2026-08-19)

**End-to-end Zero Trust path confirmed working tonight**, via real `curl` requests against the actually-running FastAPI (`:8000`) and Next.js (`:3000`) servers — not a throwaway test instance:

- `recommend-widget.js` → `/api/widget/recommend` (Next.js proxy) → `/recommend` (FastAPI) → LLM/RAG/sizing → response, full round trip, `200 OK`, no CORS or 403 errors.
- All three demo-critical flows verified through the **real proxy** (not just direct-to-FastAPI): general greeting (no cards), category browsing (`fetch_products` + visual cards), and deterministic sizing (exact + near matches).

**Two real bugs were found and fixed tonight while verifying this** — both config/data issues, no application logic beyond one function's data format was touched:

1. **Internal proxy→backend key was never configured.** `services-python/recommendation-service/.env` had no `RECOMMEND_SERVICE_KEY` at all, so `verify_internal_key` (`main.py:66-78`) rejected every request, including legitimate ones from the Next.js proxy — independent of the widget-key issue described below. Fixed by adding `RECOMMEND_SERVICE_KEY` to that `.env`, matching `RECOMMENDATION_SERVICE_KEY` in `apps/store/.env`.
2. **Public widget key (`NEXT_PUBLIC_WIDGET_API_KEY` in `apps/store/.env`) held the wrong value** — it was set to the *internal* proxy→backend secret instead of a real per-retailer `ServiceApiKey.apiKey` row. `widget-auth.ts`'s `authorizeWidgetRequest` does an exact DB lookup on this value, so it matched no row and every widget request 403'd. Fixed by fetching the real key live from `ServiceApiKey` (`service='RECOMMENDATION'`) via a Prisma script and updating `apps/store/.env`, then restarting Next.js (`NEXT_PUBLIC_*` vars are inlined at start/build time).

**One more bug found and fixed, unrelated to the proxy work — worth knowing for the demo:** `apps/store/app/lib/size-chart.ts` was building the `size_chart` field as a **CSV string**, but `agent.py`'s `compute_recommended_size` does `json.loads(...)` on it — a format mismatch that silently made *every* real measurement lookup through the proxy return "doesn't come in a size that fits," regardless of actual fit, with no error surfaced. Confirmed by a direct A/B test (see §5) and a git-tracked pytest suite (`tests/test_agent.py`, 6 tests) that explicitly documents JSON as `compute_recommended_size`'s real contract — so `size-chart.ts` was fixed to emit JSON instead of touching the tested Python function. Re-verified live through the proxy after the fix: exact and near-match measurements both now return the correct size and confidence.

**One known quirk to be aware of live, not a bug:** the TF-IDF RAG retrieval (§6) does no stemming — "show me your **blouses**" (plural) does not match catalog descriptions written as "**Blouse**" (singular), so `retrieved_product_ids` can legitimately come back empty even though `fetch_products` correctly fires and `matched_category` is correct. Confirmed live: `"show me your blouses"` → no cards; `"show me a silk blouse"` → 3 cards. **If doing a live style-query demo, phrase it in singular** (or however the actual catalog copy is worded) to be safe.

## 1. System Overview

The **Manikan AI Recommendation Service** is an intelligent, stateless SaaS backend designed to power the 3D Try-On & Sizing widget on e-commerce storefronts. Built using FastAPI and a LangGraph state-machine, it blends natural language understanding with deterministic geometric size-matching.

### 1.1 Architecture & Pipeline
1. **Frontend Integration:** A Next.js widget (`recommend-widget.js`) captures user intents and sizing queries.
2. **Next.js Proxy (Zero Trust):** The Next.js API layer authenticates the widget API key, validates subscription tiers, deducts quota, and securely proxies the request to the FastAPI backend using a server-side shared internal key (`X-Manikan-Internal-Key`).
3. **Stateless Conversational Agent (`agent.py`):**
   - **Multi-tier LLM Fallback:** DeepSeek → Bedrock → Gemini → Local Ollama.
   - **TF-IDF RAG Pipeline (`retrieval.py`):** In-memory cosine similarity search across the current active product catalog.
   - **Deterministic Sizing:** Euclidean distance across user body measurements vs. product size charts — never left to the LLM.

## 2. Security Model (Zero Trust)
The backend service delegates all API key lifecycle and quota management to the Next.js gateway. The Python FastAPI service exposes its endpoints exclusively to the Next.js Proxy, enforced via `verify_internal_key` (`main.py:66-78`), which compares the `X-Manikan-Internal-Key` header against `RECOMMEND_SERVICE_KEY` (and a previous-key value, for rotation) using `hmac.compare_digest`. Direct client-to-backend connections are blocked, protecting the system from client-side credential extraction.

---

## 3. LLM Fallback Chain — Order & Rationale

`call_llm_with_fallback` (`app/agent.py:142-211`) tries providers strictly in this order, falling through to the next on **any** exception:

| Order | Provider | Client | Why here in the chain |
|---|---|---|---|
| 1 | **DeepSeek** | `AsyncOpenAI` pointed at `api.deepseek.com` | Primary provider. OpenAI-compatible API with native `response_format={"type": "json_object"}` support, so structured output is cheap and reliable to get without extra prompt-engineering. Only attempted if `deepseek_api_key` is configured. |
| 2 | **Bedrock** (`Bedrock.py`) | raw `httpx` POST to a course-provided gateway | Second-choice hosted provider (also backed by a `deepseek.v3.2` model, but through a different metered gateway/quota than #1). Used as the first fallback because it's still a full-capability hosted model, just without native JSON-mode — hence the manual JSON-schema-in-prompt instruction and a one-shot re-ask-for-valid-JSON retry (`Bedrock.py:85-98`). |
| 3 | **Gemini** | `ChatGoogleGenerativeAI` (LangChain), looped over `settings.gemini_keys` (up to 2 configured keys) | Third-choice cloud provider, tried across multiple keys before giving up, for extra headroom against per-key rate limits. |
| 4 | **Ollama** (local) | `ChatOllama` (LangChain), `localhost:11434` | Last resort. Needs no API key and no internet — it's the only tier that still works during a total external-network outage, which is precisely why it sits last (worst quality/availability trade in normal conditions) but first in resilience during an outage of *everything else*. A 10s `asyncio.wait_for` timeout keeps a stalled local server from hanging the request indefinitely. |

If all four fail, `call_llm_with_fallback` raises `RuntimeError(...)`, which is caught by the `/recommend` handler's `try/except` (`main.py:147-178`) and turned into the honest `success:false` / `EMERGENCY-FALLBACK` response described in §8.

`check_all_providers()` (`agent.py:214-252`) runs the same tier list as a health probe (used by `GET /health`) without going through the fallback-on-failure logic — it reports **every** provider's live status independently, rather than stopping at the first success.

---

## 4. `call_conversational_agent` — Deterministic Calculation vs. LLM

`call_conversational_agent` (`app/agent.py:304-432`) branches into one of three modes, checked in this priority order:

1. **On a product page, waiting on measurements** (`product_id` + `size_chart` present, `betas` not yet given) — `agent.py:315-348`. Purely deterministic Python: it scans the conversation for a self-reported size label (e.g. "I'm XL") and a stated confidence %, and returns one of four canned `STATIC-*` responses. No LLM call at all.
2. **On a product page, measurements given** (`betas` + `size_chart` both present) — `agent.py:351-374`. Calls `compute_recommended_size()`, a pure Euclidean-distance calculation (§5 detail below) against the product's real size chart. Again, no LLM call.
3. **Everything else (general/open-ended chat)** — `agent.py:376-431`. No `size_chart` exists in this branch, so there is nothing to compute against. This is delegated to the LLM fallback chain (§3), grounded by RAG-retrieved catalog context (§6).

**Why this separation exists:** sizing is the product's core trust proposition — a wrong size is a returned order and a lost customer, so it must be deterministic, auditable, and never subject to hallucination. An LLM is never asked to "guess" a size or invent a confidence score. Open-ended discovery ("what would suit me for a wedding?"), by contrast, has no ground truth to compute — it's inherently a natural-language synthesis task, which is exactly what an LLM is suited for, provided it's grounded in real catalog data (RAG) rather than left to invent products. The dividing line in code is simply *whether a real `size_chart` is in scope*: if yes, compute; if no, converse.

---

## 5. Deterministic Sizing — `compute_recommended_size` (Euclidean Distance)

`agent.py:86-126`. For each size row in the product's `size_chart` (parsed JSON), it computes:

```
distance = sqrt((chest_cm_row - chest_cm_user)^2 + (waist_cm_row - waist_cm_user)^2 [+ (hip_cm_row - hips_cm_user)^2 if hip data exists])
```

The row with the smallest distance wins. If that best distance exceeds `OUT_OF_RANGE_THRESHOLD_CM = 15.0` (`agent.py:45`), the result is treated as **out of range** — no size is recommended, and the agent responds honestly that nothing fits well (`agent.py:365-373`) rather than forcing a bad match. Otherwise, `confidence = 1 - (distance / 15.0)`, i.e. confidence decays linearly from 100% at a perfect (0cm) match down to 0% at the 15cm cutoff.

Confidence handling for **self-reported** size labels (as opposed to computed ones) is covered separately in §7.

---

## 6. RAG — `retrieval.py` (TF-IDF + Cosine Similarity, not Embeddings)

`retrieve_relevant_products` (`retrieval.py:26-60`) vectorizes the query plus every candidate product's `"{name} {category} {description}"` string with scikit-learn's `TfidfVectorizer`, then ranks products by cosine similarity to the query vector, returning up to `top_k=3` results and dropping anything scoring ≤ 0.05 (so an unrelated query returns nothing rather than forcing weak matches).

**Why TF-IDF instead of embeddings**, per the module's own header comment (`retrieval.py:1-12`):
- **No external dependency at request time.** An embeddings approach would need either a network call to an embedding API or a local model load — both are things this project experienced repeated outages with on the same night this was built (see the fallback chain in §3). TF-IDF via scikit-learn runs entirely in-process, in memory, with no network call and no model download.
- **Speed.** Fitting a `TfidfVectorizer` over a small per-request catalog and computing cosine similarity is effectively instant — no embedding-API latency in the hot path.
- **Statelessness fits the service's design.** The service holds no catalog index between requests — `catalog_products` arrives fresh on every call (see `ChatRecommendRequest.catalog_products`, `main.py:91-94`, sent server-side by the Next.js proxy). Since there's no persistent index to maintain, there's no benefit from a heavier embeddings+vector-DB pipeline that would only pay off with a large, stable, pre-indexed corpus.

This is deliberately scoped to **free-text product descriptions only** — the one genuinely unstructured piece of catalog data. Size charts and categories are structured data and are handled by exact-match/deterministic logic instead (§4, §5) — RAG is never used where a precise answer is computable.

**Known limitation — no stemming.** Plain `TfidfVectorizer` tokenizes on exact word forms, so a plural query term won't match a singular catalog term (or vice versa). Verified live: `"show me your blouses"` against catalog descriptions written as `"...Blouse by Nour Atelier..."` returns **zero** matches (similarity below the 0.05 cutoff) even though `fetch_products`/`matched_category` still fire correctly from the LLM's own category detection — `retrieved_product_ids` is simply empty that turn. `"show me a silk blouse"` (singular) against the same catalog returns 3 correct matches. Worth knowing before a live demo of the style-query flow.

---

## 7. Confidence-Threshold Logic — Product Page vs. General Chat

Two entirely different confidence policies exist depending on context, and they are **not** unified — this is intentional:

- **Product page (a real `size_chart` is in scope), user states a size label instead of measurements** (`agent.py:315-341`): the agent asks the user how confident they are (0–100%). If they answer **≥ 80%**, the self-reported label is trusted as-is (`STATIC-LABEL-TRUSTED`, `agent.py:318-326`) — no measurement calculation is performed, since the user already knows their size for that brand/fit. Below 80%, the agent refuses to guess and instead pushes them into providing real measurements (`STATIC-LABEL-UNTRUSTED`, `agent.py:327-333`), where §5's deterministic calculation takes over.
- **General chat (no `size_chart` in scope) — always redirect, no exception** (`build_general_instruction`, rule 4, `agent.py:276-285`): if the user states anything about size/fit here — a label, raw measurements, or a question — the agent is instructed to **never** ask about confidence, accept a label, or attempt any calculation. There is no product-specific chart to validate against in general chat, so any number here is disconnected from an actual measurable claim. The agent unconditionally redirects: "pick an item and click **View Item**." This is a hard rule with no confidence exception, unlike the product-page branch — the two contexts are not interchangeable because only one of them has real ground-truth data to check a claim against.

---

## 8. Visual Product Cards — `retrieved_product_ids` and `action=fetch_products`

`agent.py:419-429`: after the LLM responds, `retrieved_product_ids` is attached to the output **only if both** conditions hold:
1. RAG (§6) actually retrieved at least one product for this turn, **and**
2. the LLM's own decided `action` is `fetch_products` — i.e. the LLM itself decided this turn is actively presenting items right now.

If the LLM instead asks a clarifying question (`provide_recommendation`) even though RAG found a loose textual match, `retrieved_product_ids` is **not** attached — cards must never appear disconnected from what the reply text is actually saying (this exact bug is called out explicitly in the code comment). The widget renders the cards itself from its own already-cached product data (image, price, link) keyed by these ids — the LLM's text is only ever a short intro, never the source of product details shown (`agent.py:419-422`).

A defensive guard runs just before this (`agent.py:403-417`): if the LLM's `matched_category` isn't an exact (case-insensitive) match against `available_categories`, it's dropped and the action is downgraded from `fetch_products` back to `provide_recommendation` with a clarifying message — preventing a hallucinated category from ever reaching the widget's product filter.

The same all-providers-failed path (`main.py:167-178`, `EMERGENCY-FALLBACK`) never sets `retrieved_product_ids` either, since it bypasses the agent graph entirely and returns a static apology with `success:false`.

---

## 9. LangGraph — Confirmed Usage, Currently a Single-Node Graph

LangGraph **is** actually used, not just imported for show: `agent.py:435-439` builds a real `StateGraph(FitState)`, registers one node (`"agent"` → `call_conversational_agent`), sets it as the entry point, and wires it directly to `END`. `main.py:148` invokes it via `recommendation_graph.ainvoke(initial_state)`, and `FitState` (`agent.py:21-30`) is a proper `TypedDict` schema shared across the graph.

**Why it's a single node and not a multi-step chain:** the current business logic (§4) doesn't need graph-level orchestration — there's no multi-step planning, no loop, and no conditional edges between distinct stages. All of the actual branching (deterministic-vs-LLM dispatch, RAG retrieval, category guardrails) happens as plain Python control flow *inside* that one node function, because each incoming request maps to exactly one outgoing response with no intermediate state to persist between graph steps. A single-node graph is the right size for that shape of problem — splitting it into separate "retrieve" / "classify" / "respond" nodes today would add indirection without changing behavior. LangGraph's value here is the typed state contract (`FitState`) and having the wiring already in place so a genuinely multi-step flow (e.g., a separate retrieval node with its own retry/critique logic) could be added later without restructuring the entry point or the FastAPI route.

---

## 10. LangChain — Confirmed Partial Usage (Gemini & Ollama Only)

LangChain integrations are used for exactly two of the four providers:
- **Gemini**: `ChatGoogleGenerativeAI` (`agent.py:129-135`, imported `agent.py:9`)
- **Ollama**: `ChatOllama` (`agent.py:202-206`, imported `agent.py:10`)

Both go through `.with_structured_output(RecommendationOutput)`, letting LangChain handle schema-validated parsing into the Pydantic model automatically.

**DeepSeek and Bedrock deliberately bypass LangChain** and use direct clients instead:
- **DeepSeek** uses the raw `AsyncOpenAI` client (`agent.py:8`, used at `agent.py:148-176`) pointed at DeepSeek's OpenAI-compatible endpoint. DeepSeek's API natively supports `response_format={"type": "json_object"}`, so a direct client call is simpler and more transparent than routing through a LangChain wrapper — it also lets the code apply its own DeepSeek-specific quirk-handling (normalizing the reply field name when the model returns `"reply"` instead of `"message"`, `agent.py:169-173`), which is easier to reason about against a raw response dict than through an abstraction layer.
- **Bedrock** (`Bedrock.py`) is a custom, course-provided gateway with its own non-standard REST shape (`/student/chat`, `model_id` + `messages` + `max_tokens` body, `output_text` response field) — not a provider LangChain ships an integration for. It's called directly via `httpx` (`Bedrock.py:6, 49-82`), with the JSON schema given as an explicit prompt instruction (`Bedrock.py:19-33`) and manual `json.loads` parsing plus a one-shot "that wasn't valid JSON, retry" loop (`Bedrock.py:85-98`), since there's no framework-level structured-output support available for a bespoke gateway like this.

In short: LangChain is used where it buys real convenience (an existing, well-supported integration with structured-output parsing built in); it's skipped where the provider is either non-standard (Bedrock) or where a raw client is simpler and gives more direct control (DeepSeek).

---

## 11. Live Demo Flow / Script

This script outlines the standard user journey demonstrating the core capabilities of the Recommendation Service.

### Step 1: General Discovery Chat
* **Context:** The user lands on the homepage with a vague idea of what they want.
* **User Input:** "I'm looking for an outfit for a formal wedding."
* **System Action:**
  - The AI parses the "formal/wedding" intent.
  - The TF-IDF RAG pipeline scans the available catalog.
  - **Output:** The AI asks for clarification based on available categories: "Are you looking for a blouse or a dress?"

### Step 2: Visual Product Cards
* **User Input:** "A blouse."
* **System Action:**
  - The LLM maps this to the exact `matched_category` string "blouses".
  - It triggers the `fetch_products` action.
  - **Output:** The widget renders visual product cards (images, names, prices) of relevant blouses, using its own already-cached product data.

### Step 3: Deep-linking Auto-Open on Product Pages
* **User Action:** The user clicks "View Item" on a specific blouse card.
* **System Action:**
  - The widget deep-links the user to the exact product page `/products/[id]`.
  - The widget auto-opens on the product page and enters "Static Product Mode."
  - **Output:** The AI prompts, "Please enter your height, weight, chest, and waist measurements below, and I'll calculate your exact size."

### Step 4: Stated Size & Confidence Verification (Optional Branch)
* **User Input:** "I usually wear a size Medium."
* **System Action:**
  - The AI detects a stated size label but lacks measurements.
  - **Output:** "You mentioned Medium - how confident are you in that size, from 0-100%?"
  - If the user says "90%", the AI trusts the label. If "50%", the AI forces the user to input raw measurements.

### Step 5: Deterministic Euclidean Distance Size-Matching
* **User Input:** (User fills in the visual sliders: Chest 90cm, Waist 75cm, Hips 98cm).
* **System Action:**
  - The AI bypasses LLM text generation entirely.
  - It executes `compute_recommended_size()`, calculating the Euclidean distance against the product's specific JSON size chart.
  - **Output:** "Based on your measurements, size M is your best match (85% confidence)."
  - *Out of Range Fallback:* If the Euclidean distance exceeds 15cm, the AI honestly states: "I'm sorry, but based on your measurements, this item doesn't come in a size that would fit you well."

---

## 12. End-to-End Request Flow (what actually happens, step by step)

1. **Browser** — `Navbar.tsx` mounts `<script src="/recommend-widget.js" data-widget-key={NEXT_PUBLIC_WIDGET_API_KEY}>`. The widget script reads that key once at load and sends it as `X-Manikan-Key` on every call it makes.
2. **Widget → Next.js proxy** — `recommend-widget.js` `POST`s to `/api/widget/recommend` with the conversation state (`session_id`, `messages`, `betas`, `product_id`, `intent`, `catalog_products`, etc.) and the `X-Manikan-Key` header. It never talks to FastAPI directly, and never sends `size_chart` — that's server-resolved (see step 4).
3. **`authorizeWidgetRequest`** (`widget-auth.ts:117-195`) gates the request: key present → Origin present (fail-closed) → key resolves to an active retailer's `ServiceApiKey` scoped to `RECOMMENDATION` → Origin is in that retailer's allowlist → active subscription with remaining quota → per-retailer rate limit. Any failure returns a generic 401/403/429 (never revealing which check failed).
4. **Server-side size-chart resolution** (`route.ts:73-90`) — if `product_id` is present, the route first checks the product belongs to *this* retailer (404 otherwise — never leak another tenant's product), then calls `buildBodyFitChartCsv` (`size-chart.ts`) to build `size_chart` itself from `ProductVariant` rows, as a JSON array. The client can never supply its own `size_chart` — that would let a client fabricate the very data used to compute its own result.
5. **Proxy → FastAPI** (`route.ts:96-115`) — the route forwards the request to `RECOMMENDATION_SERVICE_URL` (`:8000`) with `X-Manikan-Internal-Key: RECOMMENDATION_SERVICE_KEY` — the *internal* shared secret, distinct from the public widget key used in step 2.
6. **`verify_internal_key`** (`main.py:66-78`) — FastAPI checks that internal key with `hmac.compare_digest` against `RECOMMEND_SERVICE_KEY` (its own `.env`). This is the only door into the service; there is no other authenticated path.
7. **`recommendation_graph.ainvoke(...)`** (`main.py:148`) — runs the single-node LangGraph (§9) → `call_conversational_agent` (§4) → either the deterministic sizing branch (§5) or the LLM-fallback + RAG branch (§3, §6), producing a `RecommendationOutput`.
8. **Response flows back** FastAPI → proxy → widget. On the way back through the proxy, quota is deducted (`consumeQuota`, fire-and-forget, step doesn't block the response) and the JSON payload is passed through unchanged to the browser.

## 13. Key File Breakdown (quick reference)

| File | Role |
|---|---|
| `apps/store/components/Navbar.tsx` | Mounts the widget script tag on every storefront page, passing the public widget key as `data-widget-key`. |
| `apps/store/public/recommend-widget.js` | The embeddable client widget — chat UI, product cards, measurement sliders. Only ever calls `/api/widget/recommend`, never FastAPI directly. |
| `apps/store/app/api/widget/recommend/route.ts` | The Zero Trust proxy. Runs the security gate, resolves `size_chart` server-side, forwards to FastAPI with the internal key, deducts quota. |
| `apps/store/app/lib/widget-auth.ts` | `authorizeWidgetRequest` — the actual security gate logic (key → retailer → origin → quota → rate limit) shared by all widget proxy routes. |
| `apps/store/app/lib/size-chart.ts` | `buildBodyFitChartCsv` — builds the JSON `size_chart` array from `ProductVariant` rows server-side. (Function name is a holdover from a prior CSV format; see §0.) |
| `services-python/recommendation-service/app/main.py` | FastAPI app. `verify_internal_key` gate, `/recommend` and `/health` endpoints, request/response schemas, the emergency-fallback catch-all. |
| `services-python/recommendation-service/app/agent.py` | The core agent: `FitState`, `compute_recommended_size` (deterministic sizing), `call_llm_with_fallback` (4-tier LLM chain), `call_conversational_agent` (routing logic), the LangGraph definition. |
| `services-python/recommendation-service/app/Bedrock.py` | Direct `httpx` client for the course-provided Bedrock gateway (2nd fallback tier) — manual JSON-schema prompting and parsing since it's not a LangChain-supported provider. |
| `services-python/recommendation-service/app/retrieval.py` | TF-IDF + cosine-similarity RAG over catalog product descriptions (§6). |
| `services-python/recommendation-service/app/config.py` | `pydantic_settings`-based `.env` loader — all API keys, the internal shared secret, allowed origins. |
| `services-python/recommendation-service/app/schemas.py` | `ActionType` enum and the `RecommendationOutput`/`MeasurementInput` Pydantic models shared across the whole agent. |
| `services-python/recommendation-service/tests/test_agent.py` | Git-tracked unit tests for `compute_recommended_size` — the authoritative source of truth that `size_chart` is JSON, not CSV (see §0 incident). |
| `services-python/recommendation-service/tests/test_live_scenarios.py` | Higher-level tests exercising `call_conversational_agent` directly: general discovery, category fetch, deterministic sizing, TF-IDF retrieval. |
