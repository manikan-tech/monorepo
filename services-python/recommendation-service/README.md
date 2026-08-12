# Recommendation Service

FastAPI microservice powered by LangGraph AI agents for style and size recommendation.

## Getting Started

1. Set up a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the development server:
   ```bash
   uvicorn app.main:app --reload --port 8002
   ```

## Configuration

In addition to the DB/Supabase/LLM settings in [`app/config.py`](app/config.py):

| Env var | Default | Purpose |
|---------|---------|---------|
| `RECOMMENDATION_SERVICE_KEY` | *(unset)* | Shared secret the Store's proxy must send as `X-Manikan-Internal-Key` on `POST /recommend`. **Required in every non-local deployment** — this service has no other auth of its own, so an unset key means the route is rejected (fails closed), not open. |
| `RECOMMENDATION_SERVICE_KEY_PREVIOUS` | *(unset)* | Optional second accepted value, for zero-downtime key rotation. |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins (set explicitly in prod) |

⚠️ **This service must never be exposed on a public/internet-reachable address.** CORS only constrains browsers; `RECOMMENDATION_SERVICE_KEY` is what actually stops a direct server-to-server or curl caller from bypassing the Store's API-key/subscription/quota checks entirely. `/` (health check) remains open (no key required).
