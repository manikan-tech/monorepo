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
| `POST` | `/generate-dressed-avatar` | Body mesh wearing a **real fitted garment mesh** (Pipeline 1) with a **physics-baked drape** for male bodies (Pipeline 2) → 2-node (`body` + `garment`) binary `.glb` |

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
Optional `product_image_url` (absolute URL of the product's flat-lay photo)
textures the garment with it (recoloured to `tshirt_color_hex`, shading
preserved); on any failure it falls back to a flat colour fill. Engine toggles:
`MANIKAN_DRESSED_ENGINE=v1` (legacy vertex-paint garment), `MANIKAN_PHYSICS_DRAPE=0`
(kinematic fit only).

## Documentation

The garment/try-on engine is documented in [`docs/`](docs/):

| Doc | What it covers |
|-----|----------------|
| [`technical-overview.md`](docs/technical-overview.md) | The core SMPL β-optimisation engine (virtual tape measure, Adam sculptor, height decoupling) |
| [`garment-fitting-pipeline.md`](docs/garment-fitting-pipeline.md) | **Pipeline 1** — real MGN garment mesh fitted via surface binding (Tier 1 + 1.5) |
| [`physics-drape-pipeline.md`](docs/physics-drape-pipeline.md) | **Pipeline 2** — physics-baked drape from a precomputed delta library (male, tee) |
| [`development-journey.md`](docs/development-journey.md) | The narrative history behind both pipelines — the bugs, dead ends, and what actually worked |

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
