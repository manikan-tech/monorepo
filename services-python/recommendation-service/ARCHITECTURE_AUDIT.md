# Architecture Audit — Manikan Recommendation Service

Audit date: 2026-08-23. Scope: every file present in `services-python/recommendation-service` before this report was created (14 files, including the stale compiled artifact). Claims cite source locations as `file:line`.

## 1. WHAT THIS SERVICE DOES (Current Reality)

`POST /recommend` is a protected FastAPI chat-and-sizing endpoint. It checks an internal shared-secret header, rate-limits by caller-supplied `session_id`, builds a `FitState`, and invokes a compiled LangGraph. [main.py:125-148](app/main.py#L125)

For a product request with a chart, the graph's only node either answers a simple chart question locally, accepts/rejects a self-reported label, or runs deterministic nearest-size math. [agent.py:381-474](app/agent.py#L381) For general chat, it TF-IDF-searches only the request-provided miniature catalog, injects selected descriptions into an LLM system prompt, validates the LLM's category, and returns a structured response. [agent.py:476-531](app/agent.py#L476)

The endpoint returns `session_id`, success flag, reply, action, optional size/link/provider/confidence/explanation/category/retrieved IDs; exceptions are intentionally converted to HTTP 200-shaped `success=false` bodies. [main.py:97-109](app/main.py#L97), [main.py:167-179](app/main.py#L167) `GET /health` actively calls every provider and exposes their raw error strings. [main.py:112-122](app/main.py#L112)

```text
Client / Next.js proxy
  | POST /recommend + X-Manikan-Internal-Key + catalog/chart/body data
  v
FastAPI auth -> per-process rate limit -> LangGraph START
  -> agent node
     -> local chart/label/Euclidean-size branch, OR
     -> request-local TF-IDF retrieval -> prompt -> LLM fallback chain
  -> END
  v
ChatRecommendResponse (or success=false emergency response)
```

## 2. TECH STACK ACTUALLY USED

Runtime imports actually used are: FastAPI and its CORS/dependency/error features (`fastapi`, `fastapi.middleware.cors`), Pydantic and pydantic-settings, LangGraph (`StateGraph`, `END`), LangChain Google GenAI and Ollama wrappers, OpenAI's async SDK (for DeepSeek), HTTPX (Bedrock gateway), and scikit-learn TF-IDF/cosine similarity. [main.py:8-10](app/main.py#L8), [config.py:1-2](app/config.py#L1), [agent.py:8-16](app/agent.py#L8), [Bedrock.py:6-9](app/Bedrock.py#L6), [retrieval.py:13-16](app/retrieval.py#L13)

The standard library is also materially used: `asyncio`, `json`, `re`, `logging`, `hmac`, `time`, `collections`, dataclasses, typing, and `typing_extensions`. [main.py:1-7](app/main.py#L1), [agent.py:1-6](app/agent.py#L1), [agent.py:33-36](app/agent.py#L33), [Bedrock.py:1-4](app/Bedrock.py#L1)

LangGraph is genuinely invoked, but only as a one-node wrapper around sequential logic. [agent.py:535-539](app/agent.py#L535) No Supabase, Postgres, `asyncpg`, pgvector, ORM, or database connection is imported or opened. `asyncpg`, `boto3`, Anthropic, and several LangChain packages are pinned but unused by application code. [requirements.txt:3-7](requirements.txt#L3), [requirements.txt:30-40](requirements.txt#L30)

External calls are DeepSeek at `https://api.deepseek.com`, an arbitrary configured Bedrock gateway (`/student/me`, `/student/chat`), Gemini through LangChain, and local/network Ollama. [agent.py:220-223](app/agent.py#L220), [Bedrock.py:36-42](app/Bedrock.py#L36), [Bedrock.py:67-71](app/Bedrock.py#L67), [agent.py:263-278](app/agent.py#L263)

## 3. LLM PROVIDERS — DETAILED

| Provider / model | Production status and order | Key/config | Async |
|---|---|---|---|
| DeepSeek `deepseek-chat` | First, but only if `DEEPSEEK_API_KEY` exists; actively called on general-chat LLM path. [agent.py:220-250](app/agent.py#L220) | `DEEPSEEK_API_KEY`. [config.py:12](app/config.py#L12) | Yes: `AsyncOpenAI` and awaited completion. [agent.py:222-237](app/agent.py#L222) |
| ITI “Bedrock” gateway, model ID `deepseek.v3.2` | Second and actively called even when unconfigured; then fails fast. This is an HTTP gateway, not an AWS Bedrock SDK call. [agent.py:255-261](app/agent.py#L255), [Bedrock.py:13](app/Bedrock.py#L13) | `BEDROCK_API_KEY`, `BEDROCK_BASE_URL`. [config.py:9-10](app/config.py#L9) | Yes: HTTPX `AsyncClient`; two 6-second attempts plus 1-second backoff. [Bedrock.py:65-82](app/Bedrock.py#L65) |
| Gemini `gemini-flash-latest` | Third, once for each configured key; active, not dead. [agent.py:203-209](app/agent.py#L203), [agent.py:263-273](app/agent.py#L263) | `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`. [config.py:5-7](app/config.py#L5) | Yes: `ainvoke`; declared client timeout is 10 seconds. [agent.py:265-267](app/agent.py#L265) |
| Ollama configured model, default `llama3.2` | Last fallback; always attempted, including with no local server. [agent.py:275-285](app/agent.py#L275) | No key; `OLLAMA_BASE_URL`, `OLLAMA_MODEL`. [config.py:14-15](app/config.py#L14) | Yes: `ainvoke` under a 10-second `wait_for`. [agent.py:276-278](app/agent.py#L276) |

Actual fallback is DeepSeek → gateway → each Gemini key → Ollama. Documentation claims incompatible or stale orders: README says Gemini → Bedrock → Ollama [README.md:120-130](README.md#L120), while the technical document correctly names DeepSeek first. [architecture_and_technical_summary.md:21-23](doc/architecture_and_technical_summary.md#L21)

## 4. LANGGRAPH — IS IT REAL?

Yes, technically: it creates, compiles, and `ainvoke`s a LangGraph. [agent.py:535-539](app/agent.py#L535), [main.py:147-149](app/main.py#L147) But it is not a multi-step agent workflow: one node contains all routing, mutation, retrieval, and LLM invocation in manual sequential `if` logic.

```text
START -> agent (call_conversational_agent) -> END
```

`FitState` carries conversation messages, product ID, measurements, size chart, intent, selected/available categories, caller-supplied catalog, and `structured_response`. [agent.py:21-30](app/agent.py#L21) `retailer_id` is not state and `selected_category` is state but is never read. [main.py:85-89](app/main.py#L85), [agent.py:381-531](app/agent.py#L381)

## 5. RAG — DOES IT EXIST?

- Vector search: **No persistent vector search.** There is in-memory TF-IDF sparse-vector cosine search, recreated for every general-chat request. [retrieval.py:39-60](app/retrieval.py#L39)
- Embedding generation: **No LLM embeddings.** `TfidfVectorizer.fit_transform` generates lexical TF-IDF features at request time. [retrieval.py:44-46](app/retrieval.py#L44)
- Product catalog retrieval: **Yes, but only from `catalog_products` supplied in that request; it neither stores nor queries a catalog.** [main.py:91-94](app/main.py#L91), [agent.py:489](app/agent.py#L489)
- LLM context injection: **Yes.** Formatted names/categories/first 200 description characters are appended to the system instruction. [retrieval.py:63-72](app/retrieval.py#L63), [agent.py:492-496](app/agent.py#L492)

**VERDICT: Partial.** This is valid lightweight retrieval-augmented prompting, not production RAG with embeddings, pgvector, persistence, tenant isolation, catalog freshness, or server-side catalog access.

## 6. SIZE RECOMMENDATION LOGIC

`compute_recommended_size(betas, size_chart_raw)` is rule-based, not AI-based. It parses a JSON chart; requires numeric `waist_cm` per candidate; optionally adds squared chest and hip differences; takes Euclidean distance; selects the first minimum; rejects it if greater than the hardcoded 15 cm threshold; otherwise returns size, rounded `1 - distance/15` confidence, message, available labels, and `is_out_of_range=False`. [agent.py:149-200](app/agent.py#L149)

Inputs are `MeasurementInput` (`height_cm`, `weight_kg`, `chest_cm`, `waist_cm`, `hips_cm`) plus a JSON-string chart. [schemas.py:14-19](app/schemas.py#L14), [agent.py:149](app/agent.py#L149) Height and weight are mandatory API inputs but never contribute to the calculation. [agent.py:170-182](app/agent.py#L170)

Limitations: no garment ease, fit preference, material/category calibration, units validation, chart schema validation, sex/body-shape logic, or size-order tie-breaker; missing waist silently disqualifies rows; it mixes dimensions without normalization; 15 cm is universal and non-configurable; and a high-confidence stated label is returned without checking whether it exists in the product chart. [agent.py:160-193](app/agent.py#L160), [agent.py:418-426](app/agent.py#L418)

## 7. DUPLICATE AND DEAD CODE

- Unused runtime request fields: `retailer_id` is never transferred to state or read; `selected_category` is transferred but never read. [main.py:85-89](app/main.py#L85), [main.py:135-145](app/main.py#L135), [agent.py:381-531](app/agent.py#L381)
- Unused configured setting: `recommend_api_key` / `RECOMMEND_API_KEY`; authentication uses `recommend_service_key` instead. [config.py:19-21](app/config.py#L19), [main.py:72-77](app/main.py#L72)
- Unused function: `check_bedrock_allowed_models()` is never called. [Bedrock.py:36-42](app/Bedrock.py#L36)
- Unused/dead dependency inventory: `anthropic`, `asyncpg`, `boto3`, `botocore`, `langchain-anthropic`, `langchain-aws`, `langchain-openai`, LangGraph checkpoint/prebuilt/SDK, and `ollama` are pinned with no corresponding application import. [requirements.txt:3-7](requirements.txt#L3), [requirements.txt:30-43](requirements.txt#L30)
- In practice, Bedrock is always entered even when absent and can only raise configuration error; that call is avoidable dead work in that configuration. [agent.py:255-261](app/agent.py#L255), [Bedrock.py:50-52](app/Bedrock.py#L50)
- Repeated JSON-fence stripping exists independently in agent and Bedrock. [agent.py:212-213](app/agent.py#L212), [Bedrock.py:45-46](app/Bedrock.py#L45)
- Repeated last-user-message scans occur in two branches. [agent.py:394-398](app/agent.py#L394), [agent.py:484-488](app/agent.py#L484)
- Repeated provider probing/calling logic appears in `call_llm_with_fallback` and `check_all_providers`. [agent.py:216-285](app/agent.py#L216), [agent.py:288-326](app/agent.py#L288)
- `app/__pycache__/main.cpython-313.pyc` is a stale compiled artifact for a different earlier API (`/recommend/items` and `RecommendationQuery`), not current source. It is excluded from containers but should not be in the repository tree. [app/__pycache__/main.cpython-313.pyc](app/__pycache__/main.cpython-313.pyc)

Dead/unused instances counted: **14** (2 fields, 1 setting, 1 function, 8 pinned unused dependency groups, 1 stale artifact); the repeated logic is reported separately.

## 8. WHAT IS MISSING (Gap Analysis)

| Planned capability | Status | Evidence |
|---|---|---|
| RAG | Partial | Request-local lexical TF-IDF exists; durable semantic RAG does not. [retrieval.py:26-60](app/retrieval.py#L26) |
| pgvector integration | Missing | No database/vector code; only unused `asyncpg` dependency. [requirements.txt:6](requirements.txt#L6) |
| Product catalog retrieval | Partial | Caller must send a compact catalog; no service-side catalog access. [main.py:91-94](app/main.py#L91) |
| Embedding generation | Missing (semantic) | Only TF-IDF, no embedding model/API. [retrieval.py:44-46](app/retrieval.py#L44) |
| Real LangGraph graph | Partial | A real but trivial `START -> agent -> END` graph only. [agent.py:535-539](app/agent.py#L535) |

The existing documentation is internally contradictory: README has unresolved Git merge markers at lines 11 and 227/253 and refers to obsolete environment names such as `RECOMMENDATION_SERVICE_KEY` and `CORS_ORIGINS`, while code reads `RECOMMEND_SERVICE_KEY` and `ALLOWED_ORIGINS`. [README.md:11](README.md#L11), [README.md:227-253](README.md#L227), [config.py:17-21](app/config.py#L17)

## 9. CURRENT PROBLEMS

- **Startup-breaking dependency omission:** `retrieval.py` imports `sklearn`, but `requirements.txt` does not pin `scikit-learn`; a clean environment cannot import the service. [retrieval.py:15-16](app/retrieval.py#L15), [requirements.txt:1-78](requirements.txt#L1) Local audit confirmation: `python3 -c 'import sklearn'` raised `ModuleNotFoundError`.
- **Per-request configuration construction:** `get_settings()` returns a new `Settings()` for every auth/LLM call rather than cached settings, repeatedly parsing environment state. [config.py:38-39](app/config.py#L38), [main.py:72](app/main.py#L72), [agent.py:217](app/agent.py#L217)
- **Blocking risk / unbounded work:** scikit-learn fitting and cosine ranking are synchronous inside the async endpoint and scale with the caller-controlled catalog; no product-count or payload limits exist. [retrieval.py:39-60](app/retrieval.py#L39), [main.py:81-94](app/main.py#L81)
- **Timeout gap:** DeepSeek has no explicit application timeout; Gemini uses a constructor timeout but no outer deadline; only gateway/Ollama have explicit enforced boundaries. [agent.py:220-237](app/agent.py#L220), [agent.py:263-278](app/agent.py#L263), [Bedrock.py:65-80](app/Bedrock.py#L65)
- **Health endpoint is expensive and leaks implementation detail:** every unauthenticated `/health` calls all providers and returns exception text. [main.py:112-122](app/main.py#L112), [agent.py:292-324](app/agent.py#L292)
- **Memory/resource issue:** `_request_log` retains an empty deque forever for every unique client-controlled session ID; rate/usage state is per process, unsynchronized across workers, reset on restart, and not globally enforceable. [main.py:31-46](app/main.py#L31), [main.py:49-63](app/main.py#L49)
- **Concurrency/race caveat:** mutating those module-global deques is not coordinated across threads/workers; async interleaving is small but multi-worker limits are inconsistent. [main.py:33-46](app/main.py#L33)
- **Error semantics:** unexpected workflow errors return a normal success-status response with internal exception class in `error_code`, which impairs client retry/monitoring semantics and exposes implementation details. [main.py:167-179](app/main.py#L167)
- **Logging sensitive/provider data:** raw Bedrock responses are logged at INFO. [Bedrock.py:74-76](app/Bedrock.py#L74)
- **Hardcoded operational/business values:** request limits (10/60), anomaly (200/hour), chart cutoff (15), models, gateway paths, retry/backoff, token budget, retrieval top-k/threshold, and description truncation are code constants. [main.py:31-32](app/main.py#L31), [agent.py:45](app/agent.py#L45), [Bedrock.py:13-17](app/Bedrock.py#L13), [retrieval.py:28-29](app/retrieval.py#L28), [retrieval.py:60-69](app/retrieval.py#L60)
- **Missing/ambiguous environment documentation:** README names settings the code does not read and has unresolved conflict markers; `BEDROCK_CHAT_ENDPOINT` is documented but unused. [README.md:147-170](README.md#L147), [config.py:5-27](app/config.py#L5)
- **Security/config issue:** default CORS only permits local origins, appropriate for dev but not deployment; the open health endpoint can trigger paid LLM traffic. [config.py:17](app/config.py#L17), [main.py:112-114](app/main.py#L112)
- **Quality/testing:** endpoint, auth, rate-limit, fallback, Bedrock parsing, health, and failure behavior have no tests; `test_live_scenarios.py` makes real LLM calls despite being a test. [tests/test_live_scenarios.py:24](tests/test_live_scenarios.py#L24), [tests/test_live_scenarios.py:47](tests/test_live_scenarios.py#L47)

## 10. RECOMMENDED CLEANUP PLAN

1. **Fix immediately:** add and pin `scikit-learn`, then build and import-test the Docker image; today the declared image will fail on `app.retrieval`. Keep no code change beyond dependency correction initially. [retrieval.py:15](app/retrieval.py#L15)
2. **Fix security and operations:** protect or make `/health` passive/cached, redact provider errors/raw LLM output, enforce request/catalog/message size limits, and replace local rate limiting with shared backing storage if scaled. [main.py:112-122](app/main.py#L112), [Bedrock.py:74-76](app/Bedrock.py#L74)
3. **Fix reliability:** set outer deadlines for every provider, skip Bedrock when unconfigured, close/reuse clients appropriately, cache settings, return deliberate HTTP error status/classes, and test all fallback paths with mocks. [agent.py:216-285](app/agent.py#L216)
4. **Delete:** `recommend_api_key`, unused request/state fields unless a consumer is implemented, unused `check_bedrock_allowed_models`, stale `.pyc`, unused dependency pins, and conflicting README material. [config.py:19](app/config.py#L19), [Bedrock.py:36](app/Bedrock.py#L36)
5. **Add deliberately:** if product data should be server-owned, implement tenant-authenticated catalog ingestion/access, embedding generation, pgvector schema/index/retrieval, metadata filters, cache/refresh policy, and retrieval evaluation. Do not call the current caller-supplied TF-IDF mechanism complete RAG.
6. **Clarify or simplify LangGraph:** keep it only if imminent nodes (validation, retrieval, provider selection, response normalization) need observable graph transitions; otherwise call the async router directly. The current one-node graph supplies little architectural value. [agent.py:535-539](app/agent.py#L535)
7. **Keep:** deterministic size calculation as a separate pure function, structured output validation, constant-time secret comparison, and the post-LLM category allowlist—with stronger input validation/configuration. [agent.py:149-200](app/agent.py#L149), [main.py:73-77](app/main.py#L73), [agent.py:499-517](app/agent.py#L499)

## 11. FILE-BY-FILE SUMMARY

| File | One-sentence purpose | Actual logic vs boilerplate | Quality (1–5) and required change |
|---|---|---|---|
| `app/main.py` | Defines FastAPI endpoints, auth, CORS, in-memory limits, and response mapping. | ~119 logic / 60 declarations/comments. | **3** — clean happy path, but fix unbounded global state, health exposure, error semantics, unused fields. |
| `app/agent.py` | Implements state, sizing, routing, retrieval integration, LLM fallback, and graph compilation. | ~375 logic / 164 comments/declarations. | **3** — substantial useful behavior but monolithic, hardcoded, and only nominally graph-based. |
| `app/config.py` | Maps environment values into settings. | ~16 logic / 23 boilerplate. | **3** — cache settings; remove obsolete field and reconcile docs. |
| `app/schemas.py` | Defines request-domain enums and Pydantic models. | ~20 logic / 18 schema/comments. | **4** — concise and fit for purpose; constrain/validate inputs further. |
| `app/Bedrock.py` | Calls/parses the configured ITI gateway. | ~58 logic / 41 constants/comments. | **2** — no endpoint configurability, raw output logging, unused model check, and ambiguous “Bedrock” naming. |
| `app/retrieval.py` | Performs caller-supplied-catalog TF-IDF retrieval and prompt formatting. | ~36 logic / 36 docs/types. | **2** — missing declared dependency; synchronous request-time fitting and no persistence/tenancy. |
| `app/__init__.py` | Marks the package. | 0 / 0. | **5** — no change necessary. |
| `app/__pycache__/main.cpython-313.pyc` | Stale compiled bytecode for an older app shape. | N/A binary. | **1** — delete from the source tree; it conflicts with current code history. |
| `tests/test_agent.py` | Unit-tests deterministic size matching. | ~43 test logic / 29 fixtures/comments. | **4** — useful pure-function coverage; add schema/edge/tie/units cases. |
| `tests/test_live_scenarios.py` | Exercises retrieval, deterministic routing, and real-provider conversational paths. | ~62 test logic / 22 fixture/comments. | **2** — live network calls make it nondeterministic; mock providers and separate integration tests. |
| `requirements.txt` | Pins runtime/test packages. | 78 dependency lines / 0 logic. | **1** — add `scikit-learn`; remove or justify unused pins; lock from a clean build. |
| `Dockerfile` | Builds/runs the FastAPI container. | ~8 operative / 18 boilerplate. | **3** — clean baseline but fails due to missing sklearn dependency; consider non-root user and minimal build tooling. |
| `.dockerignore` | Excludes local artifacts from image context. | 0 logic / 10 rules. | **4** — add test/cache/report policy only if desired. |
| `README.md` | Intended service documentation. | ~150 prose/content / ~103 stale/conflicted content. | **1** — resolve merge conflict and rewrite to match code. |
| `doc/architecture_and_technical_summary.md` | Product/architecture narrative. | ~54 prose / 0 executable logic. | **2** — label projections as plans; correct unsupported performance/uptime claims and current security flow. |

Audit execution note: the available host lacked both `sklearn` and `pytest`, so tests could not be executed; the missing `sklearn` finding is directly confirmed by the import failure and independently visible in source/dependency manifests.
