"""
Pipeline 2 runtime: physics-baked drape via a precomputed delta library.

Offline (Phase 4) we baked a real cloth simulation at every point of a
5x5x5 grid (catalog size x body build x height), for the locked recipe
(q4000 mesh, self-collision OFF, relaxed pose, boxify 0.65, hem-resampled
template) and stored, per grid point, the *delta* between the settled physics
mesh and its cheap kinematic fit. Every mesh shares the template's vertex
ordering, so the deltas are directly interpolable.

At runtime we do NOT simulate. We:
  1. kinematically fit the same clean template to the (relaxed-pose) body,
     using the identical steps the deltas were baked against,
  2. bilinearly interpolate the drape delta from the body's build/height within
     the chosen size's slab (size is a discrete catalog choice, never blended),
  3. add it -> a physics-quality drape in milliseconds.

Validated end-to-end: holdout interpolation error 0.7-2.6 mm mean (80-93% of the
drape signal captured), self-intersection ~0.
"""
import os
import logging
import numpy as np

from . import garment as G

logger = logging.getLogger(__name__)

# physics_drape.py lives in app/, while models/ sits at the service root (a
# sibling of app/) — hence the extra os.path.dirname versus the source repo's
# flat backend/ layout (mirrors garment.py's GARMENT_DIR adjustment).
_ASSET_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "garments", "tshirt_physics")

# Grid axes — MUST match tools/drape_bake/phase4_grid.py exactly.
BUILD_CHEST_CM = [84.0, 92.0, 100.0, 108.0, 116.0]   # build axis, keyed on chest
SIZE_CHEST_CM = [44.0, 50.0, 56.0, 62.0, 68.0]       # S, M, L, XL, XXL (flat chest)
HEIGHT_CM = [162.0, 169.0, 175.0, 181.0, 188.0]      # height axis
SIZE_LABELS = ["S", "M", "L", "XL", "XXL"]
RELAXED_SHOULDER_ANGLE = 0.65                        # matches the baked grid's pose


def _frac_index(nodes, value: float) -> float:
    """Map a measurement to a fractional grid index via piecewise-linear inverse
    interpolation over the (monotonic, possibly non-uniform) node values.
    Clamped to the grid's range so out-of-range bodies use the nearest edge."""
    nodes = np.asarray(nodes, dtype=float)
    value = float(np.clip(value, nodes[0], nodes[-1]))
    for i in range(len(nodes) - 1):
        if value <= nodes[i + 1]:
            return i + (value - nodes[i]) / (nodes[i + 1] - nodes[i])
    return float(len(nodes) - 1)


class PhysicsDraper:
    """Loads the delta library + clean template once; drapes bodies cheaply."""

    def __init__(self, asset_dir: str = _ASSET_DIR):
        tpl = np.load(os.path.join(asset_dir, "template.npz"))
        self.template_verts = tpl["verts"].astype(np.float64)
        self.template_faces = tpl["faces"].astype(np.int64)

        rb = np.load(os.path.join(asset_dir, "ref_body.npz"))
        self.ref_verts = rb["verts"].astype(np.float64)
        self.ref_faces = rb["faces"].astype(np.int64)

        lib = np.load(os.path.join(asset_dir, "delta_library.npz"))
        self.delta = lib["delta"].astype(np.float32)   # (5,5,5,V,3)
        assert self.delta.shape[3] == len(self.template_verts), "delta/template vertex mismatch"

        self.uv = G._compute_planar_uv(self.template_verts)
        # Bind the template to the relaxed reference body ONCE (same binding the
        # grid used); deform re-projects it onto each runtime body in-order.
        self.binding = G.bind_garment(self.template_verts, self.ref_verts, self.ref_faces, "physics")
        logger.info("PhysicsDraper ready: template=%d verts, delta lib %s",
                    len(self.template_verts), tuple(self.delta.shape))

    def grid_coords(self, chest_cm: float, height_cm: float, garment_chest_cm: float):
        """(size_idx discrete, build_frac, height_frac). Size selects an exact
        slab (nearest catalog size) — never interpolated across sizes."""
        size_idx = int(np.argmin([abs(garment_chest_cm - s) for s in SIZE_CHEST_CM]))
        build_frac = _frac_index(BUILD_CHEST_CM, chest_cm)
        height_frac = _frac_index(HEIGHT_CM, height_cm)
        return size_idx, build_frac, height_frac

    def _interp_delta(self, size_idx: int, build_frac: float, height_frac: float) -> np.ndarray:
        """Bilinear over build x height within the selected size slab."""
        i0, k0 = int(np.floor(build_frac)), int(np.floor(height_frac))
        fb, fh = build_frac - i0, height_frac - k0
        acc = np.zeros_like(self.delta[0, 0, 0])
        for di, wb in ((0, 1 - fb), (1, fb)):
            for dk, wh in ((0, 1 - fh), (1, fh)):
                w = wb * wh
                if w:
                    acc += w * self.delta[size_idx, min(i0 + di, 4), min(k0 + dk, 4)]
        return acc

    def drape(self, body_verts: np.ndarray, body_faces: np.ndarray, lbs_weights: np.ndarray,
              chest_cm: float, height_cm: float,
              garment_chest_cm: float, body_chest_cm: float):
        """Return (draped_garment_verts, faces, uv). body_verts MUST be in the
        relaxed pose (whole-avatar-relaxed for the tee category)."""
        # 1) reproduce the EXACT kinematic fit the deltas were baked against
        kin = G.deform_garment(self.binding, body_verts, body_faces)
        if garment_chest_cm is not None and body_chest_cm is not None:
            try:
                kin = G.apply_size_looseness(kin, self.binding, body_verts, body_faces, lbs_weights,
                                             garment_chest_cm, body_chest_cm, self.ref_verts)
            except ValueError:
                pass  # size tighter than body -> plain fit (matches grid)
        kin, _ = G.resolve_interpenetration(kin, body_verts, body_faces, margin=0.006, iters=3)

        # 2) interpolate + apply the physics delta
        size_idx, build_frac, height_frac = self.grid_coords(chest_cm, height_cm, garment_chest_cm)
        draped = kin + self._interp_delta(size_idx, build_frac, height_frac)

        # 3) light cleanup for any interpolation-induced skin poke
        draped, n_push = G.resolve_interpenetration(draped, body_verts, body_faces, margin=0.004, iters=2)
        logger.info("Physics drape: size=%s build_frac=%.2f height_frac=%.2f, %d verts pushed",
                    SIZE_LABELS[size_idx], build_frac, height_frac, n_push)
        return draped, self.template_faces, self.uv


_DRAPER = None

def get_draper() -> PhysicsDraper:
    """Process-wide singleton (loads assets once)."""
    global _DRAPER
    if _DRAPER is None:
        _DRAPER = PhysicsDraper()
    return _DRAPER
