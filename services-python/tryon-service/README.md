# Manikan Virtual Try-On Service

The Manikan Virtual Try-On (VTON) service is a FastAPI worker that turns a shopper photograph and an approved catalogue image into a generated try-on result. It delegates image synthesis to FASHN.ai Try-On Max, so the platform can offer high-fidelity fashion visualization without operating GPU inference infrastructure.

It is an internal component of the Manikan request path. Retailer and shopper-facing applications should use the Store application's VTON routes rather than call this service directly.

## Documentation

The complete architecture, security assessment, operational workflow, cost model, benchmark protocol, and enterprise roadmap are in [the VTON technical report](../../docs/vton-service.md).

## Service contract

| Route | Purpose | Response |
| --- | --- | --- |
| `GET /health` | Liveness and FASHN API-key readiness | JSON status document |
| `GET /capabilities` | Supported categories and input limits | JSON capabilities document |
| `POST /api/vton/2d` | Generate one virtual try-on image | PNG file or structured HTTP error |

`POST /api/vton/2d` accepts multipart form fields `human_image`, `garment_image_url`, and `category`. The worker validates and normalizes inputs, sends the human image as a base64 data URI and the product image URL to FASHN.ai, polls the prediction status, downloads the generated image, and streams it back as a `FileResponse`.

## Runtime configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `FASHN_API_KEY` | Yes | Bearer credential for the FASHN.ai Developer API |

The surrounding Store application also requires `VTON_SERVICE_URL`, `VTON_2D_SERVICE_KEY`, `TRYON_SERVICE_KEY`, and `VTON_ALLOWED_IMAGE_HOSTS` for its protected gateway. See the Store `.env.example` for those values.

## Local operation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export FASHN_API_KEY="your-key"
uvicorn main:app --reload --port 8003
```

The health endpoint performs no network request. `client_initialized: true` only confirms that `FASHN_API_KEY` is non-empty; it does not prove that the credential is valid or that FASHN.ai is reachable.

## Input policy

| Input | Acceptance rule |
| --- | --- |
| Human image | Image MIME type, at least `400 × 600` pixels, maximum `5 MiB` at the Store gateway |
| Product image | HTTP(S) image, at least `300 × 300` pixels; the Store gateway restricts it to configured HTTPS hosts |
| Product category | `blouse`, `shirt`, `jacket`, `pants`, `skirt`, or `dress` |

Temporary input and result files use UUID names under `tmp/` and are removed after the response is delivered or after a handled failure.

## Production note

The FastAPI worker currently has permissive CORS and does not itself validate the internal header injected by the Store gateway. Deploy it only on a private network and place it behind an authenticated service boundary. The full report records this as a required production hardening item.
