# Manikan Try-On Service

FastAPI microservice for OOTDiffusion virtual try-on processing. Uploaded and downloaded
images are kept only in `tmp` during processing and are deleted after the response.

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
   uvicorn main:app --reload --port 8003
   ```

## Configuration

Env vars (read via `python-dotenv` — a local `.env` file works):

| Env var | Default | Purpose |
|---------|---------|---------|
| `HF_TOKEN` | *(unset)* | Hugging Face token for the OOTDiffusion Gradio Space |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins (set explicitly in prod) |
| `TRYON_SERVICE_KEY` | *(unset)* | Shared secret the Store's proxy must send as `X-Manikan-Internal-Key` on `POST /api/vton/2d`. **Required in every non-local deployment** — this service has no other auth of its own, so an unset key means the route is rejected (fails closed), not open. |
| `TRYON_SERVICE_KEY_PREVIOUS` | *(unset)* | Optional second accepted value, for zero-downtime key rotation. |

⚠️ **This service must never be exposed on a public/internet-reachable address.** CORS only constrains browsers; `TRYON_SERVICE_KEY` is what actually stops a direct server-to-server or curl caller from bypassing the Store's API-key/subscription/quota checks entirely. `/health` and `/capabilities` remain open (no key required) for platform health checks.
