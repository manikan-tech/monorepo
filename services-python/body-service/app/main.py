"""
Manikan SMPL Engine — v2  (Differentiable Optimisation)
========================================================
Generates static 3D human avatars (A-pose, .glb) from body measurements
using a **differentiable optimisation loop** that solves for SMPL β
parameters by minimising the error between user-provided measurements
and *actual vertex-ring measurements* on the generated mesh.

Architecture (v2):
    1. FastAPI receives body measurements (height, weight, chest, waist, hips).
    2. At startup, vertex "measurement rings" are pre-computed on the mean
       SMPL body using landmark indices from the SMPL-Anthropometry project.
    3. An Adam optimiser iteratively adjusts 10 β parameters so that the
       circumferences measured on the SMPL mesh converge to the targets.
    4. The final mesh is uniformly scaled to the exact target height and
       exported to binary .glb via trimesh.

References:
    • DavidBoja/SMPL-Anthropometry  (landmark & measurement definitions)
    • SMPL: A Skinned Multi-Person Linear Model (Loper et al. 2015)
"""

from __future__ import annotations

import asyncio
import logging
import math
from contextlib import asynccontextmanager
from enum import Enum
from typing import Dict, List, Optional

import numpy as np
import torch
import trimesh
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import garment  # Pipeline 1 / Tier 1 garment engine (real garment mesh)
from . import physics_drape  # Pipeline 2 physics-baked drape (delta library)
from . import layering  # layered outfits (tee + pants on one body)
from .config import (
    CORS_ORIGINS,
    DEVICE,
    MODEL_DIR,
    NUM_BETAS,
    OPT_BETA_CLAMP,
    OPT_BETA_CLAMP_01,
    OPT_BETA_INIT,
    OPT_EARLY_STOP_LOSS,
    OPT_ITERATIONS,
    OPT_LR,
    OPT_SHAPE_PRIOR,
    PORT,
    RING_X_MAX,
    RING_Y_BAND,
    USE_GARMENT_V2,
    USE_PHYSICS_DRAPE,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s"
)
logger = logging.getLogger("manikan")


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------
class Sex(str, Enum):
    male = "male"
    female = "female"


class MeasurementsPayload(BaseModel):
    """Input body measurements in metric units."""

    sex: Sex
    height_cm: float = Field(
        ..., gt=100, lt=250, description="Standing height in centimetres"
    )
    weight_kg: float = Field(
        ..., gt=30, lt=250, description="Body mass in kilograms"
    )
    chest_cm: float = Field(
        ..., gt=50, lt=200, description="Chest circumference in centimetres"
    )
    waist_cm: float = Field(
        ..., gt=40, lt=200, description="Waist circumference in centimetres"
    )
    hips_cm: float = Field(
        ..., gt=50, lt=200, description="Hip circumference in centimetres"
    )


# ═══════════════════════════════════════════════════════════════════════════
#  SMPL LANDMARK INDICES  (from DavidBoja/SMPL-Anthropometry)
# ═══════════════════════════════════════════════════════════════════════════
# These are vertex indices on the 6890-vertex SMPL mesh that correspond to
# anatomical landmarks used by the SMPL-Anthropometry project for
# defining measurement planes.

SMPL_LANDMARKS = {
    "HEAD_TOP":           412,
    "LEFT_HEEL":          3458,
    "RIGHT_HEEL":         6858,
    # ── Circumference landmarks ──────────────────────────────────────────
    "LEFT_NIPPLE":        3042,   # chest circumference plane
    "RIGHT_NIPPLE":       6489,
    "BELLY_BUTTON":       3501,   # waist circumference plane
    "BACK_BELLY_BUTTON":  3022,
    "PUBIC_BONE":         3145,   # hip circumference plane
}


# ═══════════════════════════════════════════════════════════════════════════
#  VERTEX RING EXTRACTION  (pre-computed once per gender at startup)
# ═══════════════════════════════════════════════════════════════════════════
# A "vertex ring" is an ordered list of vertex indices that form a closed
# loop around the torso at a given Y-height.  Summing adjacent-vertex
# Euclidean distances around this ring gives a differentiable circumference.

_ring_cache: Dict[str, Dict[str, List[int]]] = {}


def _extract_vertex_ring(
    verts: np.ndarray,
    target_y: float,
    y_band: float = RING_Y_BAND,
    x_max: float = RING_X_MAX,
    min_verts: int = 12,
) -> List[int]:
    """
    Extract an ordered ring of vertex indices at a horizontal cross-section.

    Algorithm:
        1. Select vertices with Y ∈ [target_y − band, target_y + band]
        2. Exclude vertices with |X| > x_max  (filters arms in A-pose)
        3. Project selected vertices to the XZ plane
        4. Compute the 2D convex hull — this gives ONLY the outermost
           perimeter vertices, eliminating interior vertices that would
           cause a criss-cross path and inflate the circumference
        5. Return the hull-ordered index list (closed ring)

    The ring is computed on the *mean shape* (β=0) mesh.  Because SMPL
    topology is fixed, the same vertex indices form a valid ring for any β.
    """
    from scipy.spatial import ConvexHull

    y_coords = verts[:, 1]
    x_coords = verts[:, 0]

    mask = (np.abs(y_coords - target_y) < y_band) & (np.abs(x_coords) < x_max)
    indices = np.where(mask)[0]

    # Widen band if too few vertices captured
    while len(indices) < min_verts and y_band < 0.06:
        y_band *= 1.5
        mask = (np.abs(y_coords - target_y) < y_band) & (
            np.abs(x_coords) < x_max
        )
        indices = np.where(mask)[0]

    if len(indices) < 4:
        logger.warning(
            "Ring extraction: only %d vertices at Y=%.4f (band=%.4f, x_max=%.3f)",
            len(indices), target_y, y_band, x_max,
        )
        # Fallback: sort by angle
        selected = verts[indices]
        cx, cz = selected[:, 0].mean(), selected[:, 2].mean()
        angles = np.arctan2(selected[:, 2] - cz, selected[:, 0] - cx)
        return indices[np.argsort(angles)].tolist()

    # Project to XZ plane and compute convex hull
    selected_xz = verts[indices][:, [0, 2]]  # (N, 2) — X and Z coords
    hull = ConvexHull(selected_xz)
    hull_order = hull.vertices  # indices into 'selected_xz' in CCW order

    return indices[hull_order].tolist()


def _precompute_rings(model) -> Dict[str, List[int]]:
    """
    Run a β=0 forward pass and extract vertex rings for chest, waist, hip.

    The Y-height of each ring is determined by the SMPL-Anthropometry
    landmark positions:
        • Chest  → average Y of LEFT_NIPPLE and RIGHT_NIPPLE
        • Waist  → average Y of BELLY_BUTTON and BACK_BELLY_BUTTON
        • Hip    → Y of PUBIC_BONE
    """

    with torch.no_grad():
        output = model(
            betas=torch.zeros(1, NUM_BETAS, dtype=torch.float32, device=DEVICE),
            global_orient=torch.zeros(1, 3, dtype=torch.float32, device=DEVICE),
            body_pose=torch.zeros(1, 69, dtype=torch.float32, device=DEVICE),
            return_verts=True,
        )
    verts = output.vertices.squeeze(0).cpu().numpy()  # (6890, 3)

    # Landmark Y-coordinates on the mean shape
    chest_y = (
        verts[SMPL_LANDMARKS["LEFT_NIPPLE"], 1]
        + verts[SMPL_LANDMARKS["RIGHT_NIPPLE"], 1]
    ) / 2.0

    waist_y = (
        verts[SMPL_LANDMARKS["BELLY_BUTTON"], 1]
        + verts[SMPL_LANDMARKS["BACK_BELLY_BUTTON"], 1]
    ) / 2.0

    hip_y = verts[SMPL_LANDMARKS["PUBIC_BONE"], 1]

    rings = {
        "chest": _extract_vertex_ring(verts, chest_y),
        "waist": _extract_vertex_ring(verts, waist_y),
        "hip":   _extract_vertex_ring(verts, hip_y, x_max=0.30),  # hips are wider
    }

    for name, ring in rings.items():
        logger.info(
            "  Ring %-6s: %3d vertices at Y ≈ %.4f",
            name, len(ring),
            {"chest": chest_y, "waist": waist_y, "hip": hip_y}[name],
        )

    return rings


# ═══════════════════════════════════════════════════════════════════════════
#  DIFFERENTIABLE MEASUREMENT FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════
# These operate on torch.Tensors and preserve the autograd graph so that
# gradients flow all the way back to the β parameters.

def _measure_height(vertices: torch.Tensor) -> torch.Tensor:
    """
    Differentiable height = max(Y) − min(Y).

    torch.max / torch.min propagate gradients to the argmax / argmin
    vertex, which is sufficient to drive the height component of β.
    Returns height in metres (SMPL native unit).
    """
    return vertices[:, 1].max() - vertices[:, 1].min()


def _measure_ring_circumference(
    vertices: torch.Tensor,
    ring_indices: List[int],
) -> torch.Tensor:
    """
    Differentiable circumference via the "virtual tape measure" method.

    Given an ordered ring of vertex indices, compute the perimeter:
        C = Σᵢ ‖v[ring[i+1]] − v[ring[i]]‖₂

    The ring wraps around (last vertex connects back to first).
    All operations (indexing, subtraction, norm, sum) are autograd-safe.

    Returns circumference in metres.
    """
    idx = torch.tensor(ring_indices, dtype=torch.long, device=vertices.device)
    ring_verts = vertices[idx]                          # (N, 3)
    ring_verts_next = torch.roll(ring_verts, -1, dims=0)  # shifted by one
    diffs = ring_verts_next - ring_verts                # (N, 3)
    dists = torch.norm(diffs, dim=1)                    # (N,)
    return dists.sum()


# ═══════════════════════════════════════════════════════════════════════════
#  DIFFERENTIABLE OPTIMISATION LOOP
# ═══════════════════════════════════════════════════════════════════════════

def _shape_only_vertices(model, betas: torch.Tensor) -> torch.Tensor:
    """SMPL vertices for a given β **at zero pose**: v_template + shapedirs·β.

    Only valid when global_orient and body_pose are both zero, which is
    exactly the case inside solve_betas (it optimises SHAPE against an
    A-pose; the pose tensors it builds are all-zeros and never change).

    At zero pose the pose blend shapes vanish and every LBS joint rotation is
    the identity, so the full skinning pipeline reduces to the shape term
    alone. Verified against the real `model(...)` forward: max difference
    1.19e-07 m (~0.0001 mm — float32 rounding), while being ~25x cheaper per
    call and cheaper again to differentiate through. Over a 40-iteration
    solve that is ~430ms -> ~120ms.

    Do NOT use this anywhere a non-zero pose is involved -- it would silently
    return the rest-pose body.
    """
    return (model.v_template + torch.einsum("bl,mkl->bmk", betas, model.shapedirs)).squeeze(0)


def solve_betas(
    model,
    rings: Dict[str, List[int]],
    target_height_cm: float,
    target_weight_kg: float,
    target_chest_cm: float,
    target_waist_cm: float,
    target_hips_cm: float,
    num_iters: int = OPT_ITERATIONS,
    lr: float = OPT_LR,
) -> torch.Tensor:
    """
    Physics-Informed β Optimiser  (v4 — unit-correct, stable)
    ══════════════════════════════════════════════════════════

    Key fixes over v3:
      • Convex-hull rings eliminate the 297cm criss-cross bug
      • Direct β₀ anchor for mass (no more fragile BMI-from-circumference)
      • Asymmetric clamping: β₀,β₁ ∈ [-5,5], rest ∈ [-4,4]
      • Height fully decoupled — guaranteed via global scaling

    Returns
    -------
    torch.Tensor — shape (1, 10), detached optimised β values.
    """

    # ── Trainable parameters — warm start at +0.1 ─────────────────────
    betas = torch.full(
        (1, NUM_BETAS), OPT_BETA_INIT,
        dtype=torch.float32, device=DEVICE, requires_grad=True,
    )
    optimizer = torch.optim.Adam([betas], lr=lr)

    # ── Pose is fixed at A-pose (all zeros) for the whole solve ───────
    # Nothing here ever poses the body, which is what makes the shape-only
    # forward below valid; see _shape_only_vertices().

    # ── Target values ─────────────────────────────────────────────────
    target_height_m = target_height_cm / 100.0
    t_ch = target_chest_cm
    t_wa = target_waist_cm
    t_hi = target_hips_cm

    # Direct β₀ anchor from BMI — gives the optimizer a concrete
    # "mass" target without relying on fragile circumference-to-BMI
    # regression.  SMPL β₀ is the first PCA axis ≈ overall body mass.
    target_bmi = target_weight_kg / (target_height_m ** 2)
    target_beta0 = (target_bmi - 22.0) * 0.5

    for i in range(num_iters):
        optimizer.zero_grad()

        # ── Forward pass (shape only — pose is zero, see helper) ──────
        verts = _shape_only_vertices(model, betas)  # (6890, 3)

        # ── GLOBAL SCALING: height is guaranteed, not optimised ───────
        mesh_height = _measure_height(verts)
        scale_factor = target_height_m / (mesh_height + 1e-6)
        verts_scaled = verts * scale_factor

        # ── Measure circumferences (metres → cm) ─────────────────────
        c_chest_cm = _measure_ring_circumference(verts_scaled, rings["chest"]) * 100.0
        c_waist_cm = _measure_ring_circumference(verts_scaled, rings["waist"]) * 100.0
        c_hips_cm  = _measure_ring_circumference(verts_scaled, rings["hip"])   * 100.0

        # ── Circumference losses (cm²) ────────────────────────────────
        loss_chest = (c_chest_cm - t_ch) ** 2
        loss_waist = (c_waist_cm - t_wa) ** 2
        loss_hips  = (c_hips_cm  - t_hi) ** 2

        # ── Direct β₀ mass anchor ─────────────────────────────────────
        # This gives the optimizer a strong, clean gradient for overall
        # body mass instead of the noisy BMI-from-circumference proxy.
        loss_mass = (betas[0, 0] - target_beta0) ** 2

        # ── Shape prior (L2) ──────────────────────────────────────────
        loss_prior = OPT_SHAPE_PRIOR * (betas ** 2).sum()

        # ── Weighted total loss ───────────────────────────────────────
        loss = (
            10.0 * loss_mass         # strongest — anchors body mass
            + 5.0  * loss_waist      # high — defines torso bulk
            + 2.0  * loss_chest      # secondary shape
            + 2.0  * loss_hips       # secondary shape
            + loss_prior             # keeps body realistic
        )

        loss.backward()
        optimizer.step()

        # ── Asymmetric clamping ───────────────────────────────────────
        # β₀ (mass) and β₁ (height) need more range than shape params
        with torch.no_grad():
            betas[0, :2].clamp_(-OPT_BETA_CLAMP_01, OPT_BETA_CLAMP_01)
            betas[0, 2:].clamp_(-OPT_BETA_CLAMP, OPT_BETA_CLAMP)

        # ── Logging ───────────────────────────────────────────────────
        loss_val = loss.item()
        if i % 15 == 0 or i == num_iters - 1:
            logger.info(
                "  iter %3d | loss=%7.2f | chest=%.1fcm  "
                "waist=%.1fcm  hips=%.1fcm  β₀=%.2f(target=%.2f)",
                i, loss_val,
                c_chest_cm.item(), c_waist_cm.item(), c_hips_cm.item(),
                betas[0, 0].item(), target_beta0,
            )

        # ── Early stopping ────────────────────────────────────────────
        if loss_val < OPT_EARLY_STOP_LOSS:
            logger.info("  Early stop at iter %d (loss=%.3f)", i, loss_val)
            break

    final_betas = betas.detach().clone()
    logger.info(
        "  Optimised β = %s",
        np.array2string(
            final_betas.squeeze().cpu().numpy(), precision=3, separator=", "
        ),
    )
    return final_betas


# ═══════════════════════════════════════════════════════════════════════════
#  SMPL MODEL LOADER
# ═══════════════════════════════════════════════════════════════════════════
# One model per gender, cached in memory.

_smpl_models: Dict[str, object] = {}


def _verify_model_files() -> None:
    """Verify that the cleaned SMPL model .pkl files exist."""
    smpl_dir = MODEL_DIR / "smpl"
    for name in ("SMPL_MALE.pkl", "SMPL_FEMALE.pkl"):
        path = smpl_dir / name
        if path.exists():
            size_mb = path.stat().st_size / 1_048_576
            logger.info("✓  %s  (%.1f MB)", name, size_mb)
        else:
            logger.error(
                "✗  %s not found in %s.  Run:\n"
                "     python tools/clean_smpl_pkl.py\n"
                "   to convert the original SMPL .pkl files.",
                name,
                smpl_dir,
            )


def _load_smpl_model(gender: str):
    """
    Lazily load, cache, and pre-compute measurement rings for the SMPL model.
    """
    import smplx

    if gender in _smpl_models:
        return _smpl_models[gender], _ring_cache[gender]

    logger.info("Loading SMPL model for gender='%s' from %s …", gender, MODEL_DIR)

    model = smplx.create(
        model_path=str(MODEL_DIR),
        model_type="smpl",
        gender=gender,
        num_betas=NUM_BETAS,
        batch_size=1,
    ).to(DEVICE)

    model.eval()
    _smpl_models[gender] = model

    # Pre-compute vertex rings on the mean shape
    logger.info("Pre-computing measurement rings for gender='%s' …", gender)
    rings = _precompute_rings(model)
    _ring_cache[gender] = rings

    logger.info("SMPL model ready for gender='%s'.", gender)
    return model, rings


# ═══════════════════════════════════════════════════════════════════════════
#  MESH GENERATION PIPELINE  (v2 — Optimisation-based)
# ═══════════════════════════════════════════════════════════════════════════

def generate_avatar_mesh(
    sex: str,
    height_cm: float,
    weight_kg: float,
    chest_cm: float,
    waist_cm: float,
    hips_cm: float,
) -> bytes:
    """
    End-to-end pipeline:
        measurements → Adam optimisation → β → SMPL → scale → .glb

    Returns
    -------
    bytes — Binary GLB content.
    """

    # ── Step 1: Load model + pre-computed rings ───────────────────────
    model, rings = _load_smpl_model(sex)

    # ── Step 2: Solve for β via differentiable optimisation ───────────
    logger.info(
        "Optimising β for sex=%s h=%.0fcm w=%.0fkg "
        "chest=%.0fcm waist=%.0fcm hips=%.0fcm …",
        sex, height_cm, weight_kg, chest_cm, waist_cm, hips_cm,
    )
    betas = solve_betas(
        model=model,
        rings=rings,
        target_height_cm=height_cm,
        target_weight_kg=weight_kg,
        target_chest_cm=chest_cm,
        target_waist_cm=waist_cm,
        target_hips_cm=hips_cm,
    )

    # ── Step 3: Final forward pass with optimised β ───────────────────
    with torch.no_grad():
        output = model(
            betas=betas.to(DEVICE),
            global_orient=torch.zeros(1, 3, dtype=torch.float32, device=DEVICE),
            body_pose=torch.zeros(1, 69, dtype=torch.float32, device=DEVICE),
            return_verts=True,
        )

    vertices = output.vertices.detach().cpu().numpy().squeeze()  # (6890, 3)
    faces = model.faces
    if not isinstance(faces, np.ndarray):
        faces = np.array(faces, dtype=np.int64)

    # ── Step 4: Uniform scale to exact target height ──────────────────
    mesh_height_m = vertices[:, 1].max() - vertices[:, 1].min()
    target_height_m = height_cm / 100.0

    if mesh_height_m > 0:
        scale = target_height_m / mesh_height_m
        vertices *= scale
        logger.info(
            "Scaled mesh: %.4f m → %.4f m  (factor %.4f)",
            mesh_height_m, target_height_m, scale,
        )

    # ── Step 5: Export to GLB ─────────────────────────────────────────
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    material = trimesh.visual.material.PBRMaterial(
        baseColorFactor=[180, 160, 140, 255],
        metallicFactor=0.0,
        roughnessFactor=0.7,
    )
    mesh.visual = trimesh.visual.TextureVisuals(material=material)

    glb_bytes: bytes = mesh.export(file_type="glb")
    logger.info("GLB export complete: %d bytes", len(glb_bytes))
    return glb_bytes


# ═══════════════════════════════════════════════════════════════════════════
#  FASTAPI APPLICATION
# ═══════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Verify model files and signal readiness."""
    _verify_model_files()
    logger.info("Manikan SMPL Engine v2 (Optimisation) is ready.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="Manikan SMPL Engine",
    description=(
        "Generates static 3D human avatars (.glb) from standard body "
        "measurements using differentiable optimisation of SMPL β parameters."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# ── CORS — allow the frontend dev server to reach the API ────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    """Liveness probe."""
    return {"status": "ok"}


@app.post(
    "/generate-avatar",
    summary="Generate a 3D avatar from body measurements",
    response_class=Response,
    responses={
        200: {
            "content": {"model/gltf-binary": {}},
            "description": "Binary GLB file containing the generated 3D avatar mesh.",
        }
    },
)
async def generate_avatar(payload: MeasurementsPayload):
    """
    Accepts body measurements and returns a static A-pose 3D avatar as a
    binary `.glb` file.

    Internally runs ~150 iterations of Adam optimisation to solve for the
    10 SMPL shape parameters (β) that best match the provided
    measurements on the mesh surface.
    """
    loop = asyncio.get_event_loop()
    try:
        glb_bytes = await loop.run_in_executor(
            None,
            lambda: generate_avatar_mesh(
                sex=payload.sex.value,
                height_cm=payload.height_cm,
                weight_kg=payload.weight_kg,
                chest_cm=payload.chest_cm,
                waist_cm=payload.waist_cm,
                hips_cm=payload.hips_cm,
            ),
        )
    except FileNotFoundError as exc:
        logger.exception("SMPL model file not found")
        raise HTTPException(
            status_code=503,
            detail=(
                "SMPL model files are not available.  Ensure the .pkl files "
                "are placed in models/smpl/ and have been cleaned of chumpy "
                "objects.  See README for instructions."
            ),
        ) from exc
    except ValueError as exc:
        if str(exc) == "TOO_SMALL":
            raise HTTPException(status_code=400, detail="TOO_SMALL") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Avatar generation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return Response(
        content=glb_bytes,
        media_type="model/gltf-binary",
        headers={
            "Content-Disposition": f'attachment; filename="manikan_{payload.sex.value}.glb"',
        },
    )


# ═══════════════════════════════════════════════════════════════════════════
#  DRESSED AVATAR — body mesh wearing a garment (t-shirt + pants)
# ═══════════════════════════════════════════════════════════════════════════

# ---------------------------------------------------------------------------
# Dressed Avatar Payload
# ---------------------------------------------------------------------------
class GarmentLayerPayload(BaseModel):
    """A second garment worn simultaneously with the primary one.

    Carries only what identifies and sizes a garment -- the body measurements
    stay on the parent payload, because both layers are worn by the SAME body.
    """
    category: str = Field(..., description="'tshirt' or 'pants' -- must differ "
                                            "from the primary category")
    color_hex: str = Field(..., description="Hex colour for this garment")
    garment_chest_cm: Optional[float] = Field(None, description="tshirt sizing")
    garment_waist_cm: Optional[float] = Field(None, description="pants sizing")
    product_id: Optional[str] = Field(None)
    product_image_url: Optional[str] = Field(None)


class DressedAvatarPayload(BaseModel):
    """Generate a body mesh wearing a t-shirt."""
    sex: Sex
    height_cm: float = Field(..., gt=100, lt=250)
    weight_kg: float = Field(..., gt=30, lt=250)
    chest_cm: float = Field(..., gt=50, lt=200)
    waist_cm: float = Field(..., gt=40, lt=200)
    hips_cm: float = Field(..., gt=50, lt=200)
    tshirt_color_hex: str = Field(
        ..., description="Hex colour for the t-shirt, e.g. '#1a1a2e' — also the "
                          "authoritative base colour when texturing from a photo"
    )
    category: str = Field(
        "tshirt", description="Garment category: 'tshirt' (default) or 'pants'. "
                              "Defaults to tshirt so every existing caller is "
                              "unaffected."
    )
    # Tee-category measurements. Optional so a pants request need not send them;
    # the tshirt path still requires garment_chest_cm to size correctly.
    garment_chest_cm: Optional[float] = Field(None)
    garment_length_cm: Optional[float] = Field(None)
    garment_sleeve_cm: Optional[float] = Field(None)
    garment_shoulder_cm: Optional[float] = Field(None)
    # Pants-category measurements (flat/half measurements, matching the store's
    # ProductVariant columns). garment_waist_cm drives sizing; the rest are
    # accepted for API completeness and not yet consumed.
    garment_waist_cm: Optional[float] = Field(None)
    garment_hip_cm: Optional[float] = Field(None)
    garment_inseam_cm: Optional[float] = Field(None)
    garment_rise_cm: Optional[float] = Field(None)
    product_id: Optional[str] = Field(
        None, description="Catalog product id (diagnostics / cache label only)"
    )
    product_image_url: Optional[str] = Field(
        None, description="Absolute URL of the product's flat-lay photo. When "
                          "present and loadable, the garment is textured with it "
                          "(recoloured to tshirt_color_hex, shading preserved); "
                          "otherwise it falls back to a flat colour fill."
    )
    also_wear: Optional["GarmentLayerPayload"] = Field(
        None,
        description="OPTIONAL second garment, worn at the same time as the "
                    "primary one (e.g. request pants while already wearing a "
                    "tee). Must be a different category. Omit it and the "
                    "response is exactly as before -- this adds a layered "
                    "outfit without changing any existing caller's behaviour.",
    )


# ═══════════════════════════════════════════════════════════════════════════
#  SMPL BODY-PART SEGMENTATION  —  T-Shirt Region Identification
# ═══════════════════════════════════════════════════════════════════════════
# SMPL has 24 joints that define body parts.  Each vertex is assigned to
# a body part via the LBS (Linear Blend Skinning) weights.  We use the
# dominant joint per vertex to classify it.
#
# T-shirt covers:
#   Joint  0 = Pelvis (upper part)
#   Joint  1 = L_Hip   → exclude (legs)
#   Joint  2 = R_Hip   → exclude (legs)
#   Joint  3 = Spine1
#   Joint  6 = Spine2
#   Joint  9 = Spine3
#   Joint 12 = Neck (lower part)
#   Joint 13 = L_Collar
#   Joint 14 = R_Collar
#   Joint 16 = L_Shoulder
#   Joint 17 = R_Shoulder
#   Joint 18 = L_Elbow  → include upper arm only (check Y)
#   Joint 19 = R_Elbow  → include upper arm only (check Y)
#
# We'll use a dynamic Y-threshold to cut off below the garment length.

TSHIRT_JOINT_IDS = {0, 3, 6, 9, 13, 14, 16, 17, 18, 19}


# ---------------------------------------------------------------------------
# Dressed Avatar Generation Pipeline
# ---------------------------------------------------------------------------

def generate_dressed_avatar_mesh(
    sex: str,
    height_cm: float,
    weight_kg: float,
    chest_cm: float,
    waist_cm: float,
    hips_cm: float,
    tshirt_color_hex: str,
    garment_chest_cm: float,
    garment_length_cm: float,
    garment_sleeve_cm: float,
    garment_shoulder_cm: float,
    **_ignored,  # absorbs v2-only fields (e.g. product_id) when USE_GARMENT_V2=false
) -> bytes:
    """
    Generate a body mesh with a t-shirt applied via per-vertex colouring.

    The t-shirt region gets the specified colour with fabric-like material,
    while exposed skin retains the natural skin colour.
    Vertices in the t-shirt region are offset slightly outward along their
    normals to simulate fabric thickness (~2mm).
    """

    # Step 1: Load cached SMPL model
    model, rings = _load_smpl_model(sex)

    # Step 2: Optimise betas (fewer iterations for speed — dressed avatar)
    logger.info("Generating dressed avatar (tshirt_color=%s)…", tshirt_color_hex)
    betas = solve_betas(
        model=model, rings=rings,
        target_height_cm=height_cm, target_weight_kg=weight_kg,
        target_chest_cm=chest_cm, target_waist_cm=waist_cm,
        target_hips_cm=hips_cm,
        num_iters=40,
    )

    # Step 3: Final forward pass
    with torch.no_grad():
        output = model(
            betas=betas.to(DEVICE),
            global_orient=torch.zeros(1, 3, dtype=torch.float32, device=DEVICE),
            body_pose=torch.zeros(1, 69, dtype=torch.float32, device=DEVICE),
            return_verts=True,
        )

    vertices = output.vertices.detach().cpu().numpy().squeeze()  # (6890, 3)
    faces = model.faces
    if not isinstance(faces, np.ndarray):
        faces = np.array(faces, dtype=np.int64)

    # Step 4: Scale to target height
    mesh_height_m = vertices[:, 1].max() - vertices[:, 1].min()
    target_height_m = height_cm / 100.0
    if mesh_height_m > 0:
        scale = target_height_m / mesh_height_m
        vertices *= scale

    # Step 5: Compute dynamic t-shirt mask & realistic fit offset
    weights = model.lbs_weights.detach().cpu().numpy()
    dominant_joint = np.argmax(weights, axis=1)
    tshirt_mask = np.isin(dominant_joint, list(TSHIRT_JOINT_IDS))

    # Find the top of the garment (shoulder/collar highest point)
    shoulder_verts = np.isin(dominant_joint, [13, 14, 16, 17])
    garment_top_y = np.max(vertices[shoulder_verts, 1])

    # Dynamic Hem: exactly `garment_length_cm` below the shoulder, adjusted by 0.70 for body contour draping
    hem_y = garment_top_y - (garment_length_cm / 100.0) * 0.70
    below_hem = vertices[:, 1] < hem_y
    tshirt_mask = tshirt_mask & ~below_hem

    # Dynamic Sleeves: Robust 3D distance from shoulder joint
    if np.any(dominant_joint == 16) and np.any(dominant_joint == 17):
        l_shoulder = vertices[dominant_joint == 16].mean(axis=0)
        r_shoulder = vertices[dominant_joint == 17].mean(axis=0)
        
        l_arm_mask = np.isin(dominant_joint, [16, 18])
        r_arm_mask = np.isin(dominant_joint, [17, 19])
        
        dist_l = np.linalg.norm(vertices - l_shoulder, axis=1)
        dist_r = np.linalg.norm(vertices - r_shoulder, axis=1)
        
        # 0.85 factor accounts for fabric wrapping around the bicep
        sleeve_m = (garment_sleeve_cm / 100.0) * 0.85
        arm_too_long = (l_arm_mask & (dist_l > sleeve_m)) | (r_arm_mask & (dist_r > sleeve_m))
        tshirt_mask = tshirt_mask & ~arm_too_long

    # Physically Realistic Fit Offset
    temp_mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    normals = temp_mesh.vertex_normals
    
    horizontal_normals = normals.copy()
    horizontal_normals[:, 1] = 0
    norm = np.linalg.norm(horizontal_normals, axis=1, keepdims=True)
    norm[norm == 0] = 1
    horizontal_normals = horizontal_normals / norm

    diff_cm = (garment_chest_cm * 2) - chest_cm
    base_thickness = 0.005 * scale  # 5mm thickness so it looks like a real garment

    if diff_cm < -25:
        raise ValueError("TOO_SMALL")

    if diff_cm > 0:
        # Smoothly expand torso based on LBS weights (prevents swollen arms/neck)
        torso_weights = weights[:, [0, 3, 6, 9]].sum(axis=1)
        looseness_radius = (diff_cm / (2 * math.pi * 100.0)) * 0.6  # dampened expansion
        expansion = horizontal_normals * looseness_radius * torso_weights[:, None]
        vertices[tshirt_mask] += expansion[tshirt_mask]

    # Apply base thickness to all fabric
    vertices[tshirt_mask] += normals[tshirt_mask] * base_thickness

    # Step 6: Build per-vertex colours
    # Parse t-shirt colour hex
    hex_clean = tshirt_color_hex.lstrip('#')
    tr = int(hex_clean[0:2], 16)
    tg = int(hex_clean[2:4], 16)
    tb = int(hex_clean[4:6], 16)

    # Skin colour
    skin_r, skin_g, skin_b = 200, 168, 142  # warm skin tone

    # Create per-vertex RGBA
    vertex_colors = np.zeros((len(vertices), 4), dtype=np.uint8)
    vertex_colors[:, 0] = skin_r
    vertex_colors[:, 1] = skin_g
    vertex_colors[:, 2] = skin_b
    vertex_colors[:, 3] = 255

    # Apply t-shirt colour
    vertex_colors[tshirt_mask, 0] = tr
    vertex_colors[tshirt_mask, 1] = tg
    vertex_colors[tshirt_mask, 2] = tb

    # Apply black pants
    pants_joints = [0, 1, 2, 4, 5, 7, 8]  # Pelvis + Legs + Ankles (excluding feet 10, 11)
    pants_mask = np.isin(dominant_joint, pants_joints) & ~tshirt_mask
    vertices[pants_mask] += normals[pants_mask] * (0.002 * scale)  # 2mm thickness
    
    vertex_colors[pants_mask, 0] = 20  # Very dark grey/black
    vertex_colors[pants_mask, 1] = 20
    vertex_colors[pants_mask, 2] = 20

    # Step 7: Export to GLB with vertex colours
    mesh = trimesh.Trimesh(
        vertices=vertices,
        faces=faces,
        vertex_colors=vertex_colors,
        process=False,
    )

    glb_bytes: bytes = mesh.export(file_type="glb")
    logger.info("Dressed GLB export complete: %d bytes", len(glb_bytes))
    return glb_bytes


# ═══════════════════════════════════════════════════════════════════════════
#  DRESSED AVATAR — v2  (Pipeline 1 / Tier 1: real separate garment mesh)
# ═══════════════════════════════════════════════════════════════════════════

# A product's photo never changes between requests, and preparing it (fetch +
# segment + albedo recolour) isn't free -- cache the prepared texture keyed on
# (image_url, fabric_hex) rather than redoing it on every try-on request. Bounded
# so a large/rotating catalog can't grow it without limit.
_texture_cache: Dict[tuple, object] = {}
_TEXTURE_CACHE_MISS = object()  # sentinel: distinguishes "not cached" from "cached as None"
_TEXTURE_CACHE_MAX = 256
_TEXTURE_FETCH_TIMEOUT = 8.0  # seconds; texturing is best-effort, never blocks the render
_TEXTURE_MAX_BYTES = 20 * 1024 * 1024  # cap download size (defensive)


def _fetch_image_bytes(url: str) -> bytes:
    """GET an image over http(s) with a timeout and a size cap. Scheme-checked
    to keep this from being turned into an arbitrary-URL fetcher."""
    import urllib.request
    from urllib.parse import urlparse

    if urlparse(url).scheme not in ("http", "https"):
        raise ValueError(f"unsupported image URL scheme: {url!r}")
    req = urllib.request.Request(url, headers={"User-Agent": "manikan-body-service"})
    with urllib.request.urlopen(req, timeout=_TEXTURE_FETCH_TIMEOUT) as resp:
        return resp.read(_TEXTURE_MAX_BYTES + 1)


def _load_product_texture(image_url: Optional[str], fabric_hex: Optional[str]):
    """
    Best-effort load of a product's flat-lay photo, prepared into a garment
    albedo texture (segmented + recoloured to `fabric_hex` with shading kept —
    see garment.prepare_texture_image).

    Returns a cropped PIL Image on success, or None on *any* failure (no URL,
    fetch/decode error, unconfident segmentation) — texturing is a visual
    enhancement, never a reason to fail avatar generation, so failures fall
    back cleanly to the flat colour fill. Cached (including negative results)
    per (image_url, fabric_hex).

    NOTE: body-service has no DB/catalog access; the caller (the Store's
    /api/tryon proxy) resolves the product's imageUrl from Postgres and passes
    it in as an absolute URL. Relative catalog paths are made absolute Store-
    side before they reach here.
    """
    if not image_url:
        return None
    key = (image_url, fabric_hex)
    cached = _texture_cache.get(key, _TEXTURE_CACHE_MISS)
    if cached is not _TEXTURE_CACHE_MISS:
        return cached

    result = None
    try:
        data = _fetch_image_bytes(image_url)
        if len(data) > _TEXTURE_MAX_BYTES:
            raise ValueError("image exceeds size cap")
        import io
        raw = Image.open(io.BytesIO(data)).convert("RGB")
        result = garment.prepare_texture_image(raw, fabric_hex=fabric_hex)
    except Exception:
        logger.exception("Texture skipped: failed to load %s", image_url)
        result = None

    if len(_texture_cache) >= _TEXTURE_CACHE_MAX:
        _texture_cache.clear()  # simple bound; textures re-prepare lazily
    _texture_cache[key] = result
    return result


def _dressed_glb_physics(
    model,
    betas: torch.Tensor,
    height_cm: float,
    chest_cm: float,
    garment_chest_cm: Optional[float],
    color_hex: str,
    texture_image,
) -> bytes:
    """
    Pipeline 2 runtime path: pose the body in the RELAXED pose (whole avatar
    goes relaxed for the tee category), fetch a physics-quality drape from the
    baked delta library (interpolated over build/height within the chosen size
    slab), and assemble the 2-node GLB. No simulation happens here — the drape
    is a cheap kinematic fit + a precomputed delta (see physics_drape.py).
    """
    draper = physics_drape.get_draper()

    # relaxed-pose body: lower both shoulders (SMPL body_pose joints 16/17)
    body_pose = torch.zeros(1, 69, dtype=torch.float32, device=DEVICE)
    a = physics_drape.RELAXED_SHOULDER_ANGLE
    body_pose[0, 45:48] = torch.tensor([0.0, 0.0, -a], device=DEVICE)
    body_pose[0, 48:51] = torch.tensor([0.0, 0.0, a], device=DEVICE)
    with torch.no_grad():
        output = model(
            betas=betas.to(DEVICE),
            global_orient=torch.zeros(1, 3, dtype=torch.float32, device=DEVICE),
            body_pose=body_pose,
            return_verts=True,
        )
    body_verts = output.vertices.detach().cpu().numpy().squeeze().astype(np.float64)
    faces = np.asarray(model.faces, dtype=np.int64)
    lbs_weights = model.lbs_weights.detach().cpu().numpy()

    # if no size was chosen, default to a fitted size (flat chest ~= body/2)
    gchest = garment_chest_cm if garment_chest_cm is not None else chest_cm / 2.0

    draped, garment_faces, garment_uv = draper.drape(
        body_verts, faces, lbs_weights,
        chest_cm=chest_cm, height_cm=height_cm,
        garment_chest_cm=gchest, body_chest_cm=chest_cm,
    )

    glb = garment.build_dressed_glb(
        body_verts, faces, draped, garment_faces,
        color_hex, height_cm / 100.0,
        garment_uv=garment_uv, texture_image=texture_image,
    )
    logger.info("Dressed avatar v2 (physics drape): garment=%d verts, %d bytes",
                len(draped), len(glb))
    return glb


def _dressed_glb_physics_pants(
    model,
    gender: str,
    betas: torch.Tensor,
    height_cm: float,
    waist_cm: float,
    garment_waist_cm: Optional[float],
    color_hex: str,
    texture_image,
):
    """
    Pipeline 2 runtime path for PANTS, either gender. Poses the body with hip
    abduction (the feet-apart stance the pants grid was baked in -- NOT the
    tee's relaxed shoulders), then adds the interpolated delta on top of a
    kinematic fit that reproduces the bake's own pre-fit exactly.

    The abduction angle is gender/height-conditional for female
    (physics_drape.pants_pose_hip_abduction_rad) -- the female grid was baked
    with a wider angle for short-height bodies (see docs/known-issues.md), so
    reproducing the WRONG angle here would silently desync the kinematic
    input from the delta it's being added to, even though nothing would
    error or look obviously broken.

    Returns None when the drape is unavailable (flag off, missing library, or
    body outside the grid) so the caller falls through to dress_pants().
    """
    draper = physics_drape.get_pants_draper(model, gender)
    if draper is None:
        return None

    body_pose = torch.zeros(1, 69, dtype=torch.float32, device=DEVICE)
    a = physics_drape.pants_pose_hip_abduction_rad(gender, height_cm)
    body_pose[0, 0:3] = torch.tensor([0.0, 0.0, a], device=DEVICE)    # L_Hip
    body_pose[0, 3:6] = torch.tensor([0.0, 0.0, -a], device=DEVICE)   # R_Hip
    with torch.no_grad():
        output = model(
            betas=betas.to(DEVICE),
            global_orient=torch.zeros(1, 3, dtype=torch.float32, device=DEVICE),
            body_pose=body_pose,
            return_verts=True,
        )
    body_verts = output.vertices.detach().cpu().numpy().squeeze().astype(np.float64)
    faces = np.asarray(model.faces, dtype=np.int64)
    lbs_weights = model.lbs_weights.detach().cpu().numpy()

    # no size chosen -> assume a fitted size (flat waist ~= body waist / 2)
    gwaist = garment_waist_cm if garment_waist_cm is not None else waist_cm / 2.0

    result = draper.drape(
        body_verts, faces, lbs_weights,
        body_waist_cm=waist_cm, height_cm=height_cm, garment_waist_cm=gwaist,
    )
    if result is None:
        return None            # outside the grid -> Tier 1
    draped, garment_faces, garment_uv, info = result

    glb = garment.build_dressed_glb(
        body_verts, faces, draped, garment_faces,
        color_hex, height_cm / 100.0,
        garment_uv=garment_uv, texture_image=texture_image,
    )
    logger.info("Pants physics drape served: %s", info)
    return glb


def _fit_one_layer(model, sex, category, body_verts, body_faces, lbs_weights,
                   chest_cm, waist_cm, height_cm,
                   garment_chest_cm, garment_waist_cm, body_mesh):
    """Fit ONE garment onto an already-posed body, physics if available for
    that (category, gender) and Tier-1 otherwise.

    Split out of the single-garment paths so a layered outfit reuses the exact
    same fitting code rather than a parallel copy that could drift from it.
    Returns (verts, faces, uv).
    """
    if category == "pants":
        draper = physics_drape.get_pants_draper(model, sex)
        if draper is not None:
            res = draper.drape(body_verts, body_faces, lbs_weights,
                               body_waist_cm=waist_cm, height_cm=height_cm,
                               garment_waist_cm=garment_waist_cm if garment_waist_cm
                               else waist_cm / 2.0)
            if res is not None:
                v, f, uv, _info = res
                return v, f, uv
        tpl = garment.load_pants_template(sex)
        ref = garment.get_reference_body(model, sex)
        binding = garment.bind_garment(tpl["vertices"], ref, body_faces, f"pants_{sex}")
        g = garment.deform_garment(binding, body_verts, body_faces)
        if garment_waist_cm is not None:
            try:
                g = garment.apply_pants_looseness(g, binding, body_verts, body_faces,
                                                  lbs_weights, garment_waist_cm, waist_cm)
            except ValueError:
                pass
        g = garment.smooth_garment(g, tpl["faces"])
        # Shared with dress_pants() so pants worn alone and pants worn under a
        # tee cannot diverge -- they previously did (6mm vs the 4mm default on
        # the first push-out).
        g, _ = garment.settle_pants_against_body(g, tpl["faces"], body_verts, body_faces)
        return g, tpl["faces"], tpl["uv"]

    # ── tshirt ──
    if USE_PHYSICS_DRAPE and sex == "male":
        try:
            d = physics_drape.get_draper()
            v, f, uv = d.drape(body_verts, body_faces, lbs_weights,
                               chest_cm=chest_cm, height_cm=height_cm,
                               garment_chest_cm=garment_chest_cm if garment_chest_cm
                               else chest_cm / 2.0,
                               body_chest_cm=chest_cm)
            return v, f, uv
        except Exception:
            logger.exception("Layered tee physics drape failed; using Tier-1")
    tpl = garment.load_garment_template(sex)
    ref = garment.get_reference_body(model, sex)
    binding = garment.bind_garment(tpl["vertices"], ref, body_faces, sex)
    g = garment.deform_garment(binding, body_verts, body_faces)
    if garment_chest_cm is not None:
        try:
            g = garment.apply_size_looseness(g, binding, body_verts, body_faces,
                                             lbs_weights, garment_chest_cm, chest_cm, ref)
        except ValueError:
            pass
    g = garment.smooth_garment(g, tpl["faces"])
    g, _ = garment.resolve_interpenetration(g, body_verts, body_faces, body_mesh=body_mesh)
    return g, tpl["faces"], tpl["uv"]


def generate_layered_avatar_mesh(
    sex: str,
    height_cm: float,
    weight_kg: float,
    chest_cm: float,
    waist_cm: float,
    hips_cm: float,
    upper: dict,
    lower: dict,
) -> bytes:
    """Render an upper (tee) AND a lower (pants) garment on one body.

    No combined physics bake exists or is needed -- each garment uses its own
    already-baked delta library independently, and only the tee-hem /
    pants-waistband overlap is reconciled afterwards (see app/layering.py for
    why that decomposition is correct and what goes wrong without it).

    The body carries BOTH grids' poses at once: the tee grid's relaxed
    shoulders and the pants grid's hip abduction write to disjoint SMPL joint
    ranges, so neither garment's kinematic input is compromised by the other.
    """
    model, rings = _load_smpl_model(sex)
    betas = solve_betas(
        model=model, rings=rings,
        target_height_cm=height_cm, target_weight_kg=weight_kg,
        target_chest_cm=chest_cm, target_waist_cm=waist_cm,
        target_hips_cm=hips_cm, num_iters=40,
    )

    body_pose = torch.zeros(1, 69, dtype=torch.float32, device=DEVICE)
    a = physics_drape.pants_pose_hip_abduction_rad(sex, height_cm)
    body_pose[0, 0:3] = torch.tensor([0.0, 0.0, a], device=DEVICE)      # L_Hip
    body_pose[0, 3:6] = torch.tensor([0.0, 0.0, -a], device=DEVICE)     # R_Hip
    if USE_PHYSICS_DRAPE and sex == "male":
        s = physics_drape.RELAXED_SHOULDER_ANGLE
        body_pose[0, 45:48] = torch.tensor([0.0, 0.0, -s], device=DEVICE)   # L_Shoulder
        body_pose[0, 48:51] = torch.tensor([0.0, 0.0, s], device=DEVICE)    # R_Shoulder
    with torch.no_grad():
        out = model(betas=betas.to(DEVICE),
                    global_orient=torch.zeros(1, 3, dtype=torch.float32, device=DEVICE),
                    body_pose=body_pose, return_verts=True)
    body_verts = out.vertices.detach().cpu().numpy().squeeze().astype(np.float64)
    body_faces = np.asarray(model.faces, dtype=np.int64)
    lbs_weights = model.lbs_weights.detach().cpu().numpy()
    # one collision mesh shared by every push-out in both garments' fits
    body_mesh = garment.body_proximity_mesh(body_verts, body_faces)

    fitted = {}
    for role, spec in (("upper", upper), ("lower", lower)):
        v, f, uv = _fit_one_layer(
            model, sex, spec["category"], body_verts, body_faces, lbs_weights,
            chest_cm, waist_cm, height_cm,
            spec.get("garment_chest_cm"), spec.get("garment_waist_cm"), body_mesh,
        )
        fitted[role] = {"verts": v, "faces": f, "uv": uv, "spec": spec}

    # ── reconcile the one place the two garments actually meet ──
    lo = fitted["lower"]
    waistband_y = layering.waistband_height(lo["verts"], lo["faces"])
    if waistband_y is not None:
        up = fitted["upper"]
        up["verts"], info = layering.reconcile_seam(
            up["verts"], up["faces"], lo["verts"], lo["faces"], waistband_y)
        logger.info("Layered outfit seam reconciled: %s", info)
    else:
        logger.warning("Lower garment has no open boundary; skipping seam reconciliation")

    layers = []
    for role in ("lower", "upper"):      # lower first so the tee draws over it
        item = fitted[role]
        spec = item["spec"]
        tex = _load_product_texture(spec.get("product_image_url"), spec["color_hex"])
        layers.append({
            "name": spec["category"],
            "verts": item["verts"], "faces": item["faces"],
            "color_hex": spec["color_hex"],
            "uv": item["uv"] if tex is not None else None,
            "texture_image": tex,
        })
    glb = layering.build_layered_glb(body_verts, body_faces, layers, height_cm / 100.0)
    logger.info("Layered avatar served: %s over %s, %d bytes",
                upper["category"], lower["category"], len(glb))
    return glb


def generate_dressed_avatar_mesh_v2(
    sex: str,
    height_cm: float,
    weight_kg: float,
    chest_cm: float,
    waist_cm: float,
    hips_cm: float,
    tshirt_color_hex: str,
    garment_chest_cm: Optional[float] = None,
    garment_length_cm: Optional[float] = None,
    garment_sleeve_cm: Optional[float] = None,
    garment_shoulder_cm: Optional[float] = None,
    product_id: Optional[str] = None,
    product_image_url: Optional[str] = None,
    category: str = "tshirt",
    garment_waist_cm: Optional[float] = None,
    garment_hip_cm: Optional[float] = None,
    garment_inseam_cm: Optional[float] = None,
    garment_rise_cm: Optional[float] = None,
) -> bytes:
    """
    Fit a real, independently-authored garment mesh (MGN t-shirt template) onto
    the solved SMPL body via surface binding, and export a 2-node (body +
    garment) GLB. See app/garment.py for the fitting method.

    garment_chest_cm drives Phase-3 size differentiation (loosens/tightens the
    fitted garment relative to the body's own chest measurement). The other
    garment_* fields (length/sleeve/shoulder) are accepted for API
    compatibility but not yet consumed. If product_image_url resolves to a
    loadable photo, the garment is textured with it (recoloured to
    tshirt_color_hex, shading preserved); otherwise it falls back to a flat
    tshirt_color_hex fill.
    """
    texture_image = _load_product_texture(product_image_url, tshirt_color_hex)
    # Step 1: solve the body shape (same optimiser as the plain avatar)
    model, rings = _load_smpl_model(sex)
    betas = solve_betas(
        model=model,
        rings=rings,
        target_height_cm=height_cm,
        target_weight_kg=weight_kg,
        target_chest_cm=chest_cm,
        target_waist_cm=waist_cm,
        target_hips_cm=hips_cm,
        num_iters=40,
    )

    # ── PANTS category ──────────────────────────────────────────────────────
    # Physics drape first (both genders, behind MANIKAN_PANTS_DRAPE); any
    # decline or failure falls through to the Tier-1 kinematic dress_pants().
    # Female uses its own delta library (models/garments/pants_physics_female/)
    # and its own height-conditional pose -- get_pants_draper(model, sex) and
    # pants_pose_hip_abduction_rad(sex, height_cm) both dispatch on gender
    # internally, so this call site itself needs no per-gender branching.
    if category == "pants":
        if sex in ("male", "female"):
            try:
                glb = _dressed_glb_physics_pants(
                    model, sex, betas, height_cm, waist_cm,
                    garment_waist_cm, tshirt_color_hex, texture_image,
                )
                if glb is not None:
                    return glb
                logger.info("Pants physics drape declined; using Tier-1 dress_pants()")
            except Exception:
                logger.exception("Pants physics drape failed; falling back to dress_pants()")

        with torch.no_grad():
            output = model(
                betas=betas.to(DEVICE),
                global_orient=torch.zeros(1, 3, dtype=torch.float32, device=DEVICE),
                body_pose=torch.zeros(1, 69, dtype=torch.float32, device=DEVICE),
                return_verts=True,
            )
        body_verts = output.vertices.detach().cpu().numpy().squeeze().astype(np.float64)
        faces = np.asarray(model.faces, dtype=np.int64)
        return garment.dress_pants(
            model=model,
            gender=sex,
            user_body_verts=body_verts,
            body_faces=faces,
            color_hex=tshirt_color_hex,
            target_height_m=height_cm / 100.0,
            garment_waist_cm=garment_waist_cm,
            body_waist_cm=waist_cm,
            texture_image=texture_image,
        )["glb"]

    # ── TSHIRT category (default) ───────────────────────────────────────────
    # Pipeline 2: physics-baked drape (relaxed pose + delta library). Male-only
    # for now; any failure falls through to the kinematic fit below so avatar
    # generation is never blocked.
    if USE_PHYSICS_DRAPE and sex == "male":
        try:
            return _dressed_glb_physics(
                model, betas, height_cm, chest_cm,
                garment_chest_cm, tshirt_color_hex, texture_image,
            )
        except Exception:
            logger.exception("Physics drape failed; falling back to kinematic dress()")

    # Step 2: body vertices at SMPL native scale (pose = 0; height applied later)
    with torch.no_grad():
        output = model(
            betas=betas.to(DEVICE),
            global_orient=torch.zeros(1, 3, dtype=torch.float32, device=DEVICE),
            body_pose=torch.zeros(1, 69, dtype=torch.float32, device=DEVICE),
            return_verts=True,
        )
    body_verts = output.vertices.detach().cpu().numpy().squeeze().astype(np.float64)
    faces = model.faces
    faces = np.asarray(faces, dtype=np.int64)

    # Step 3: bind + fit the garment, assemble the 2-node GLB (height applied here)
    result = garment.dress(
        model=model,
        gender=sex,
        user_body_verts=body_verts,
        body_faces=faces,
        color_hex=tshirt_color_hex,
        target_height_m=height_cm / 100.0,
        garment_chest_cm=garment_chest_cm,
        body_chest_cm=chest_cm,
        texture_image=texture_image,
    )
    logger.info(
        "Dressed avatar v2: garment=%d verts, %d pushed off body, %d bytes",
        result["garment_verts"], result["n_pushed"], len(result["glb"]),
    )
    return result["glb"]


@app.post(
    "/generate-dressed-avatar",
    summary="Generate a 3D avatar wearing a t-shirt",
    response_class=Response,
    responses={
        200: {
            "content": {"model/gltf-binary": {}},
            "description": "Binary GLB file with the body mesh wearing a t-shirt.",
        }
    },
)
async def generate_dressed_avatar(payload: DressedAvatarPayload):
    """
    Generate a body mesh with a t-shirt applied via vertex colouring.
    The t-shirt region is determined by SMPL body-part segmentation.
    Runs in a thread pool to avoid blocking the async event loop.
    """
    loop = asyncio.get_event_loop()

    # ── Layered outfit (optional `also_wear`) ──
    # Only on the v2 engine, and only for two DIFFERENT categories; anything
    # else falls through to the normal single-garment path untouched.
    if USE_GARMENT_V2 and payload.also_wear is not None:
        second = payload.also_wear
        if second.category == payload.category:
            raise HTTPException(
                status_code=400,
                detail=f"also_wear.category must differ from category "
                       f"(both were '{payload.category}')",
            )
        specs = {
            payload.category: {
                "category": payload.category,
                "color_hex": payload.tshirt_color_hex,
                "garment_chest_cm": payload.garment_chest_cm,
                "garment_waist_cm": payload.garment_waist_cm,
                "product_image_url": payload.product_image_url,
            },
            second.category: {
                "category": second.category,
                "color_hex": second.color_hex,
                "garment_chest_cm": second.garment_chest_cm,
                "garment_waist_cm": second.garment_waist_cm,
                "product_image_url": second.product_image_url,
            },
        }
        roles = layering.split_by_role(list(specs.keys()))
        if roles is None:
            raise HTTPException(
                status_code=400,
                detail="A layered outfit needs one upper-body and one "
                       f"lower-body garment; got {sorted(specs.keys())}.",
            )
        upper_cat, lower_cat = roles
        try:
            glb_bytes = await loop.run_in_executor(
                None,
                lambda: generate_layered_avatar_mesh(
                    sex=payload.sex.value,
                    height_cm=payload.height_cm,
                    weight_kg=payload.weight_kg,
                    chest_cm=payload.chest_cm,
                    waist_cm=payload.waist_cm,
                    hips_cm=payload.hips_cm,
                    upper=specs[upper_cat],
                    lower=specs[lower_cat],
                ),
            )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=503, detail=str(exc))
        return Response(
            content=glb_bytes,
            media_type="model/gltf-binary",
            headers={"Content-Disposition": 'inline; filename="layered-avatar.glb"'},
        )

    engine_fn = (
        generate_dressed_avatar_mesh_v2 if USE_GARMENT_V2
        else generate_dressed_avatar_mesh
    )
    try:
        glb_bytes = await loop.run_in_executor(
            None,
            lambda: engine_fn(
                sex=payload.sex.value,
                height_cm=payload.height_cm,
                weight_kg=payload.weight_kg,
                chest_cm=payload.chest_cm,
                waist_cm=payload.waist_cm,
                hips_cm=payload.hips_cm,
                tshirt_color_hex=payload.tshirt_color_hex,
                garment_chest_cm=payload.garment_chest_cm,
                garment_length_cm=payload.garment_length_cm,
                garment_sleeve_cm=payload.garment_sleeve_cm,
                garment_shoulder_cm=payload.garment_shoulder_cm,
                product_id=payload.product_id,
                product_image_url=payload.product_image_url,
                # category + pants measurements only exist on the v2 engine;
                # v1 predates categories and would reject them.
                **({
                    "category": payload.category,
                    "garment_waist_cm": payload.garment_waist_cm,
                    "garment_hip_cm": payload.garment_hip_cm,
                    "garment_inseam_cm": payload.garment_inseam_cm,
                    "garment_rise_cm": payload.garment_rise_cm,
                } if USE_GARMENT_V2 else {}),
            ),
        )
    except FileNotFoundError as exc:
        logger.exception("SMPL model file not found")
        raise HTTPException(status_code=503, detail="SMPL model files not available.") from exc
    except ValueError as exc:
        if str(exc) == "TOO_SMALL":
            raise HTTPException(status_code=400, detail="TOO_SMALL") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Dressed avatar generation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return Response(
        content=glb_bytes,
        media_type="model/gltf-binary",
        headers={
            "Content-Disposition": f'attachment; filename="manikan_dressed_{payload.sex.value}.glb"',
        },
    )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=PORT,
        reload=True,
        log_level="info",
    )
