"""
Configuration for the Manikan Body Service.

Deployment settings (paths, port, CORS) are environment-overridable so the
service behaves correctly in local dev, Docker, and Railway. The SMPL
optimisation hyper-parameters are tuned constants — change them with care.
"""

from __future__ import annotations

import os
from pathlib import Path

import torch

# ─── Paths ──────────────────────────────────────────────────────────────
# Service root = the body-service/ directory (parent of app/).
SERVICE_ROOT = Path(__file__).resolve().parent.parent

# smplx loads <MODEL_DIR>/smpl/SMPL_{MALE,FEMALE}.pkl
MODEL_DIR = Path(os.environ.get("BODY_MODEL_DIR", str(SERVICE_ROOT / "models")))

# ─── Server ─────────────────────────────────────────────────────────────
PORT: int = int(os.environ.get("PORT", "8001"))

# Body generation is CPU- and memory-intensive. Phase 1 intentionally queues
# requests inside this single process instead of running them concurrently.
MAX_CONCURRENT_GENERATIONS: int = max(
    1, int(os.environ.get("MAX_CONCURRENT_GENERATIONS", "1"))
)

# Comma-separated allowed origins. Default "*" for local dev; set an explicit
# list (e.g. the Store service origin) in production.
CORS_ORIGINS: list[str] = [
    o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()
]

# Shared secret the Store's server-side proxy must present on every billable
# request. CORS/origin checks only constrain browsers -- this is what stops a
# server-to-server caller (or anyone who finds this URL) from reaching this
# service directly and bypassing the Store's API-key/subscription/quota gate.
# Unset in local dev is allowed (verify_internal_key fails closed instead);
# every non-local deployment must set it.
BODY_SERVICE_KEY: str | None = os.environ.get("BODY_SERVICE_KEY") or None
# Lets the Store rotate BODY_SERVICE_KEY with zero downtime: deploy the new
# value as BODY_SERVICE_KEY there while the old value still validates here
# via BODY_SERVICE_KEY_PREVIOUS, then retire the old value once rolled out.
BODY_SERVICE_KEY_PREVIOUS: str | None = (
    os.environ.get("BODY_SERVICE_KEY_PREVIOUS") or None
)

# ─── SMPL / Torch ───────────────────────────────────────────────────────
DEVICE = torch.device("cpu")
NUM_BETAS: int = 10

# ─── Garment engine ─────────────────────────────────────────────────────
# Dressed-avatar engine: "v2" = Pipeline 1 real garment mesh; "v1" = legacy
# vertex-paint fallback. Overridable via the MANIKAN_DRESSED_ENGINE env var.
USE_GARMENT_V2: bool = os.environ.get("MANIKAN_DRESSED_ENGINE", "v2").lower() != "v1"

# Pipeline 2: physics-baked drape via the precomputed delta library (relaxed
# pose, tee category). Male-only for now (female needs its own tuning pass +
# grid). Falls back to the kinematic v2 fit if disabled or if it errors, so
# avatar generation never breaks. Toggle with MANIKAN_PHYSICS_DRAPE=0.
USE_PHYSICS_DRAPE: bool = os.environ.get("MANIKAN_PHYSICS_DRAPE", "1") != "0"

# ─── Optimisation hyper-parameters (tuned for SMPL on CPU) ──────────────
OPT_ITERATIONS: int = int(os.environ.get("OPT_ITERATIONS", "80"))
OPT_LR: float = float(os.environ.get("OPT_LR", "0.05"))
OPT_EARLY_STOP_LOSS: float = 5.0  # stop when total loss < this
OPT_SHAPE_PRIOR: float = 0.05  # L2 shape prior — keeps body "athletic" unless forced
OPT_BETA_CLAMP: float = 4.0  # general clamp for β₂…β₉
OPT_BETA_CLAMP_01: float = 5.0  # looser clamp for β₀, β₁ (mass & height PCA)
OPT_BETA_INIT: float = 0.1  # small positive init — nudge optimizer off saddle point
RING_Y_BAND: float = 0.012  # ±1.2 cm Y-band (tighter = fewer vertices = cleaner ring)
RING_X_MAX: float = 0.25  # exclude arm/leg vertices beyond this |X|
