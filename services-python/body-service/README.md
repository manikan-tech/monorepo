# Body Service — Manikan SMPL Engine

FastAPI microservice that turns 5 body measurements into a static 3D avatar
(`.glb`). It solves for SMPL shape parameters (β) with a differentiable
optimisation loop, matching real vertex-ring circumferences on the mesh to the
requested measurements, then scales the mesh to the exact target height.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Liveness probe → `{"status":"ok"}` |
| `POST` | `/generate-avatar` | Bare A-pose body mesh → binary `.glb` |
| `POST` | `/generate-dressed-avatar` | Body mesh wearing a garment (t-shirt + pants, via vertex colouring) → binary `.glb` |

**`POST /generate-avatar`**
```json
{ "sex": "male", "height_cm": 178, "weight_kg": 74,
  "chest_cm": 96, "waist_cm": 82, "hips_cm": 98 }
```
Returns `model/gltf-binary` (a `.glb` file).

**`POST /generate-dressed-avatar`** adds garment fields:
```json
{ "sex": "male", "height_cm": 178, "weight_kg": 74,
  "chest_cm": 96, "waist_cm": 82, "hips_cm": 98,
  "tshirt_color_hex": "#1a1a2e",
  "garment_chest_cm": 54, "garment_length_cm": 72,
  "garment_sleeve_cm": 21, "garment_shoulder_cm": 46 }
```

## Prerequisites

- **Python 3.11** (torch/smplx have no wheels for 3.13/3.14 yet).
- **SMPL model files** — licensed, **not committed**. See
  [`models/smpl/README.md`](models/smpl/README.md) for how to obtain, clean,
  and place `SMPL_MALE.pkl` / `SMPL_FEMALE.pkl`.

## Getting Started

```bash
cd services-python/body-service

# 1. Virtual env (must be Python 3.11)
python3.11 -m venv .venv
source .venv/bin/activate

# 2. Install (CPU-only torch — see requirements.txt)
pip install -r requirements.txt

# 3. Run (port 8001; matches the monorepo `npm run start:body` script)
uvicorn app.main:app --reload --port 8001
```

Quick check once running:
```bash
curl -s http://localhost:8001/health
curl -s -X POST http://localhost:8001/generate-avatar \
  -H 'Content-Type: application/json' \
  -d '{"sex":"male","height_cm":178,"weight_kg":74,"chest_cm":96,"waist_cm":82,"hips_cm":98}' \
  --output avatar.glb
```

If the SMPL `.pkl` files are missing, avatar endpoints return **503**.

## Configuration

All settings live in [`app/config.py`](app/config.py) and are env-overridable:

| Env var | Default | Purpose |
|---------|---------|---------|
| `PORT` | `8001` | Server port |
| `BODY_MODEL_DIR` | `<service>/models` | Where `smpl/*.pkl` live |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins (set explicitly in prod) |
| `OPT_ITERATIONS` | `80` | Adam optimisation iterations |
| `OPT_LR` | `0.05` | Optimiser learning rate |

## Docker

```bash
docker build -t manikan-body-service .
# models are NOT baked into the image — mount them at runtime:
docker run -p 8001:8001 -v "$(pwd)/models/smpl:/app/models/smpl" manikan-body-service
```
