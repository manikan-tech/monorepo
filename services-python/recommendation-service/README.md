# Manikan Recommendation Service

AI-powered size recommendation and product search agent for the Manikan
e-commerce platform. Built as an independent, database-free SaaS
component: it can be embedded on any retailer's storefront, as long as
that storefront's own backend supplies product/size data in the shape
described below.

---

## 1. Architecture

```
Shopper types in the chat widget (widget.js)
        |
        v
Widget POSTs to  ->  FastAPI  /recommend  (this service)
        |                     |
        |                     v
        |              LangGraph agent decides:
        |              - compute a size deterministically, OR
        |              - answer via an LLM (Gemini -> Bedrock -> Ollama)
        |
        v
Widget uses the response to:
  - show a size + confidence in the chat
  - call the storefront's own /api/products for real product data
  - log the recommendation via the storefront's /api/measurement-sessions
```

**Key architectural decision:** this service has **no direct database
connection**. Supabase/Postgres access lives entirely in the storefront's
own Next.js API. The widget fetches whatever product/size data it needs
from the storefront and sends it to this service in the request body.
This keeps the service portable — any retailer can point their own
widget at it without granting database access.

---

## 2. Request/response contract (`POST /recommend`)

### Request body

| Field | Type | Notes |
|---|---|---|
| `session_id` | string | Used for rate limiting and conversation continuity |
| `messages` | list of `{role, content}` | Full chat history so far |
| `betas` | object or null | `{height_cm, weight_kg, chest_cm, waist_cm, hips_cm}` — all 5 required together, matching `MeasurementSession`'s required fields |
| `product_id` | string or null | Set when the shopper is on a specific product page |
| `size_chart` | string or null | JSON string: `[{"size": "M", "chest_cm": 90, "waist_cm": 72, "hip_cm": 94}, ...]` — the widget builds this from the storefront's own `ProductVariant` data |
| `intent` | string | `"general"` or `"search"` (a hint, not the sole driver of behavior — see agent.py) |
| `selected_category` | string or null | Category filter from the widget's dropdown |
| `available_categories` | list of string or null | Real category values from the storefront's catalog, used to ground the LLM (prevents hallucinating categories that don't exist) |

### Response body

| Field | Notes |
|---|---|
| `action` | One of `ask_measurements`, `provide_recommendation`, `fetch_products`, `redirect_to_product`, `request_data` |
| `reply` | Natural-language message to show in the chat |
| `recommended_size` | Set when a size was computed or stated |
| `confidence_score` | 0-1, only meaningful for `provide_recommendation` from the deterministic calculator |
| `explanation` | Short reasoning behind the recommendation |
| `provider` | Which backend actually answered (`STATIC-CALC`, `STATIC`, `STATIC-LOCAL`, `GEMINI`, `BEDROCK`, `OLLAMA-FALLBACK`, `EMERGENCY-FALLBACK`) — useful for debugging which tier served a given reply |

### `GET /health`

Pings every configured LLM provider individually and reports which one
is currently active, plus the specific error for any that failed. Use
this first when diagnosing "why is the chat slow/wrong" issues.

---

## 3. Decision logic inside the agent (`agent.py`)

The agent picks between a fast, deterministic path and an LLM path,
in this order:

1. **Numeric size-chart question** (e.g. "what's the max chest size?")
   — answered instantly from the parsed `size_chart`, no LLM call at
   all. Falls back to an LLM answer (still grounded in the real chart)
   only if the question doesn't match a recognizable numeric pattern.

2. **Measurements + a size chart are both present** — the size is
   computed deterministically (`compute_recommended_size`): nearest
   match by chest/waist/hip distance, with an honest "no real match"
   result (plus the list of sizes that ARE available) if the closest
   size is still further than `OUT_OF_RANGE_THRESHOLD_CM` (15cm) away.
   **No LLM involved.**

3. **Measurements given, but no size chart yet** (e.g. general chat,
   no product/category selected) — an instant static reply asking
   which category they're shopping for. No LLM call.

4. **Everything else** goes through the LLM, grounded by a shared
   system instruction (`build_general_instruction`) that:
   - Refuses to trust a stated size label (e.g. "my size is L") as
     sufficient for a fit recommendation — sizes aren't standardized
     across brands/products, so it always asks for real measurements
     when the user wants a recommendation.
   - Still allows label-based **browsing** ("show me your Large
     shirts") to trigger `fetch_products` directly.
   - Is told the real category list, so it won't claim to search for
     a category the store doesn't carry.
   - Is explicitly told never to invent product names, prices, or
     stock data.

### Why size labels (S/M/L/XL) aren't trusted for recommendations

The same label means different real measurements across brands and
even across items from the same brand. Treating "L" as reliable data
defeats the purpose of a *measurement-based* recommendation system.
If a "browse by size label" feature is wanted, it should be a plain
catalog filter (deterministic, no AI) on the storefront's own product
listing page — a different feature from the chat's fit recommendation.

---

## 4. Multi-provider fallback

Providers are tried in this order, each wrapped in its own timeout so
a slow/failing provider can't block the others indefinitely:

| Provider | Timeout | Notes |
|---|---|---|
| Gemini (key 1) | 5s | `max_retries=0` — fails fast on quota errors instead of the client's default retry/backoff behavior |
| Gemini (key 2) | 5s | Same |
| Bedrock (ITI gateway) | 4s | Request/response shape is a best-effort guess (OpenAI-style `chat/completions`) — **not confirmed working yet**. Check `/health` for the real error if it's relevant to you. |
| Ollama (local) | 10s | Wrapped in `asyncio.wait_for` — previously had no timeout at all, which could hang indefinitely |

Worst-case total latency is bounded (~24s), safely under the widget's
30s abort timeout.

### Known current status (as of this session)

- **Gemini**: returns `429 RESOURCE_EXHAUSTED` — the linked Google
  Cloud project has 0 free-tier quota for `gemini-2.0-flash`. This is
  a Google billing/quota issue, not a code issue. Requires enabling
  billing on the project (even without spending) to unlock quota.
- **Bedrock**: not confirmed working — the real request/response shape
  of the ITI gateway's `/student/chat` endpoint was never provided.
- **Ollama**: stable, and is the currently active provider in practice.

---

## 5. Environment variables (`.env`)

```dotenv
# Gemini (Google AI Studio) - primary provider, 2 keys for redundancy
GEMINI_API_KEY_1=
GEMINI_API_KEY_2=

# Bedrock Gateway (ITI) - shape unconfirmed
BEDROCK_API_KEY=
BEDROCK_BASE_URL=
BEDROCK_CHAT_ENDPOINT=

# Ollama - local fallback
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# CORS - comma-separated allowed origins (defaults to localhost:3000 only)
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Shared secret between widget.js and this service (set the SAME value
# in the storefront's NEXT_PUBLIC_WIDGET_API_KEY). If left unset, the
# check is skipped - fine for local dev, must be set before deployment.
RECOMMEND_API_KEY=
```

---

## 6. Running locally

**Important:** The Next.js gateway (`apps/store`) proxies to **port 8002** by default
(`RECOMMENDATION_SERVICE_URL=http://localhost:8002`). Start uvicorn on 8002 or set that env
var to the actual port. Starting on 8000 means Next.js never reaches this process.

```bash
cd services-python/recommendation-service
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8002
```

Swagger docs: `http://127.0.0.1:8002/docs`

### Clean demo startup (avoids stale-process issues)

```bash
# 1. Kill any stale uvicorn on port 8002
pkill -f "uvicorn app.main:app" 2>/dev/null || true

# 2. Start fresh with --reload so code changes hot-reload
cd services-python/recommendation-service
source venv/bin/activate
uvicorn app.main:app --reload --port 8002

# 3. In a separate terminal, start Next.js
cd apps/store
npm run dev
```

Reload/consistency rule: `--reload` hot-reloads on file saves. If uvicorn logs a syntax error
the old module stays live — fix the error and save again. For clean restarts, `pkill` first.

---

## 7. Testing

```bash
python -m pytest tests/ -v
```

Current coverage focuses on `compute_recommended_size` (the
deterministic sizing logic), since it's a pure function and the part
of the system where correctness matters most:

- exact and near matches return the right size
- measurements genuinely outside any size chart are honestly rejected
  (not silently forced into the nearest size)
- malformed/empty size chart data doesn't crash the service
- missing optional chart fields (e.g. no `hip_cm` on some variants)
  degrade gracefully instead of erroring

**Not yet covered:** `/health` and `/recommend` endpoint-level tests,
and the LLM-grounded paths (hard to unit test deterministically since
they depend on live model output).

---

## 8. Known gaps / open questions for the team

- Whether this service should stay database-free (current design) or
  connect to Postgres directly, per some Trello cards that assume
  direct DB access (`SQLAlchemy`/`psycopg`). These are mutually
  exclusive designs — needs a team decision.
- `MeasurementSession` is currently written by this service's widget
  integration (`/api/measurement-sessions`), while a separate Trello
  card describes writing it from the tryon service instead. Needs
  reconciling — one source of truth, or two intentionally.
- No endpoint-level auth beyond the shared-secret header check and
  basic per-session rate limiting (10 req/min) — fine for a demo, not
  hardened for production traffic.
- Category-level size chart caching in the widget uses a *single
  representative product's* variants per category, not an average
  across all products in that category — a reasonable approximation
  for a demo, not a substitute for per-product accuracy.
