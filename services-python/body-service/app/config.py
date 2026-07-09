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

# Comma-separated allowed origins. Default "*" for local dev; set an explicit
# list (e.g. the Store service origin) in production.
CORS_ORIGINS: list[str] = [
    o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()
]

# ─── SMPL / Torch ───────────────────────────────────────────────────────
DEVICE = torch.device("cpu")
NUM_BETAS: int = 10

# ─── Optimisation hyper-parameters (tuned for SMPL on CPU) ──────────────
OPT_ITERATIONS: int = int(os.environ.get("OPT_ITERATIONS", "80"))
OPT_LR: float = float(os.environ.get("OPT_LR", "0.05"))
OPT_EARLY_STOP_LOSS: float = 5.0    # stop when total loss < this
OPT_SHAPE_PRIOR: float = 0.05       # L2 shape prior — keeps body "athletic" unless forced
OPT_BETA_CLAMP: float = 4.0         # general clamp for β₂…β₉
OPT_BETA_CLAMP_01: float = 5.0      # looser clamp for β₀, β₁ (mass & height PCA)
OPT_BETA_INIT: float = 0.1          # small positive init — nudge optimizer off saddle point
RING_Y_BAND: float = 0.012          # ±1.2 cm Y-band (tighter = fewer vertices = cleaner ring)
RING_X_MAX: float = 0.25            # exclude arm/leg vertices beyond this |X|
