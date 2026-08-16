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
import math
import os
import time
import logging
from typing import Optional

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
        # one collision mesh for both push-outs in this request (bit-identical)
        body_mesh = G.body_proximity_mesh(body_verts, body_faces)
        kin, _ = G.resolve_interpenetration(kin, body_verts, body_faces, margin=0.006, iters=3,
                                            body_mesh=body_mesh)

        # 2) interpolate + apply the physics delta
        size_idx, build_frac, height_frac = self.grid_coords(chest_cm, height_cm, garment_chest_cm)
        draped = kin + self._interp_delta(size_idx, build_frac, height_frac)

        # 3) light cleanup for any interpolation-induced skin poke
        draped, n_push = G.resolve_interpenetration(draped, body_verts, body_faces, margin=0.004,
                                                    iters=2, body_mesh=body_mesh)
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


# ─────────────────────────────────────────────────────────────────────────────
# PANTS
# ─────────────────────────────────────────────────────────────────────────────
# Pants are WAIST-keyed, not chest-keyed, and their pre-bake kinematic fit is a
# materially longer sequence than the tee's. Both differences are load-bearing:
# reproducing the tee's shorter fit under pants deltas was measured at 5.14mm
# mean / 13.22mm max error across 96.3% of vertices (see
# tools/drape_bake/phase4_correspondence_pants.py), i.e. larger than the
# interpolation error the library exists to deliver.

def _pants_asset_dir(gender: str) -> str:
    return os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "models", "garments", f"pants_physics_{gender}")


# Grid axes — per-gender, MUST match tools/drape_bake/phase4_grid_pants.py (male)
# / phase4_grid_pants_female.py (female) exactly. Size labels/list shared since
# the catalog uses one flat-waist size scale across genders; build/height are
# gender-specific body distributions (see phase4_grid_pants_female.py for the
# female axis derivation — verified against solve_betas convergence, not
# carried over from male's beta values).
PANTS_SIZE_WAIST_CM = [38.0, 44.0, 50.0, 56.0, 62.0]    # garment flat waist
PANTS_SIZE_LABELS = ["S", "M", "L", "XL", "XXL"]

PANTS_BUILD_WAIST_CM = {
    "male":   [74.0, 86.0, 98.0, 110.0, 122.0],
    "female": [60.0, 74.0, 88.0, 102.0, 112.0],
}
PANTS_HEIGHT_CM = {
    "male":   [162.0, 169.0, 175.0, 181.0, 188.0],
    "female": [151.0, 158.0, 165.0, 172.0, 179.0],
}

# Pose (hip-abduction angle, degrees -> radians). Canonical source of truth
# for BOTH the offline bake grid (tools/drape_bake/phase4_grid_pants.py
# imports pants_pose_hip_abduction_rad from here) and the runtime -- they
# must never drift apart, since the runtime's kinematic-fit re-poses the
# body before adding the interpolated delta, and that re-pose has to match
# whatever pose the delta was actually baked against.
#
# male: single angle everywhere (6.9deg), matches the grid.
#
# female: height-conditional. Diagnosed via LOG_PER_VERTEX on the female
# grid's failed nodes (crotch/inner-thigh oscillation on short bodies);
# widening to 8.0deg converges short-height bodies, confirmed build-index-
# independent (a build-4 node converged fine at 8.0deg while two other
# build-4 nodes did not -- see docs/known-issues.md "female grid" section
# for the full investigation). 168.5cm is the midpoint between the grid's
# 165cm (short, 8.0deg) and 172cm (standard, 6.9deg) nodes -- the natural
# continuous threshold for a runtime body that isn't sitting exactly on a
# grid node.
MALE_PANTS_POSE_DEG = 6.9
FEMALE_PANTS_POSE_SHORT_DEG = 8.0
FEMALE_PANTS_POSE_STANDARD_DEG = 6.9
FEMALE_PANTS_POSE_HEIGHT_THRESHOLD_CM = 168.5


def pants_pose_hip_abduction_rad(gender: str, height_cm: float) -> float:
    """The single source of truth for which hip-abduction angle to pose a
    pants body at -- offline bake and online runtime both call this, keyed
    on the body's actual height in cm (not a grid index), so it works for
    both a grid node's exact height and an arbitrary shopper's height."""
    deg = MALE_PANTS_POSE_DEG
    if gender == "female":
        deg = (FEMALE_PANTS_POSE_SHORT_DEG if height_cm < FEMALE_PANTS_POSE_HEIGHT_THRESHOLD_CM
               else FEMALE_PANTS_POSE_STANDARD_DEG)
    return math.radians(deg)

# Feature flag. "physics" enables the drape; anything else (or a missing/broken
# library, or a body outside the grid) falls back to the Tier-1 kinematic fit.
PANTS_DRAPE_MODE = os.environ.get("MANIKAN_PANTS_DRAPE", "off")


def _clamp_to_grid(value: float, nodes) -> Optional[float]:
    """Clamp a measurement onto the grid, but only within ONE grid step of an
    edge; further out returns None so the caller falls back to Tier 1.

    A hard in/out test creates a visible cliff: at the grid edge a body gets a
    ~22mm physics correction and 0.1cm outside it gets none, so two near-
    identical shoppers see noticeably different garments. Clamping a small
    excursion applies the edge node's delta (mild extrapolation, the same thing
    the tee's runtime already does); refusing a large one avoids pretending we
    have data for a body far outside the baked range.
    """
    lo, hi = nodes[0], nodes[-1]
    if lo <= value <= hi:
        return value
    if value < lo:
        return lo if (lo - value) <= (nodes[1] - nodes[0]) else None
    return hi if (value - hi) <= (nodes[-1] - nodes[-2]) else None


class PantsPhysicsDraper:
    """Pants delta-library draper. Reproduces run_pilot_batch.kinematic_fit()
    exactly, then adds the interpolated physics delta."""

    def __init__(self, model, gender: str = "male", asset_dir: Optional[str] = None):
        tpl = G.load_pants_template(gender)
        self.template_verts = np.asarray(tpl["vertices"], dtype=np.float64)
        self.template_faces = np.asarray(tpl["faces"], dtype=np.int64)
        self.uv = tpl.get("uv")
        self.gender = gender
        self.build_axis = PANTS_BUILD_WAIST_CM[gender]
        self.height_axis = PANTS_HEIGHT_CM[gender]
        if asset_dir is None:
            asset_dir = _pants_asset_dir(gender)

        lib = np.load(os.path.join(asset_dir, "delta_library.npz"), allow_pickle=True)
        self.delta = lib["delta"].astype(np.float32)          # (5,5,5,V,3)
        # Provenance: which grid nodes are neighbour-fills rather than real
        # bakes. The filled VALUES are already in `delta` (single-pass fill, no
        # cascade) -- this mask exists so a body landing on one is logged
        # explicitly rather than silently, per the runtime requirement.
        self.filled = lib["filled"] if "filled" in lib.files else np.zeros((5, 5, 5), bool)
        if self.delta.shape[3] != len(self.template_verts):
            raise ValueError(
                f"pants delta/template vertex mismatch: {self.delta.shape[3]} vs {len(self.template_verts)}")

        self.ref_verts = G.get_reference_body(model, gender)
        self.binding = None   # bound lazily against the first body's face array
        logger.info("PantsPhysicsDraper ready: template=%d verts, delta lib %s, %d filled nodes",
                    len(self.template_verts), tuple(self.delta.shape), int(self.filled.sum()))

    def grid_coords(self, body_waist_cm: float, height_cm: float, garment_waist_cm: float):
        """(size_idx discrete, build_frac, height_frac). Size selects an exact
        slab -- a shopper picks a catalog size, so it is never interpolated
        across, matching the tee's proven behaviour."""
        size_idx = int(np.argmin([abs(garment_waist_cm - s) for s in PANTS_SIZE_WAIST_CM]))
        return size_idx, _frac_index(self.build_axis, body_waist_cm), \
            _frac_index(self.height_axis, height_cm)

    def _interp_delta(self, size_idx, build_frac, height_frac):
        """Bilinear over build x height within the selected size slab. Also
        returns the list of contributing grid nodes that were neighbour-filled."""
        i0, k0 = int(np.floor(build_frac)), int(np.floor(height_frac))
        fb, fh = build_frac - i0, height_frac - k0
        acc = np.zeros_like(self.delta[0, 0, 0])
        touched_fills = []
        for di, wb in ((0, 1 - fb), (1, fb)):
            for dk, wh in ((0, 1 - fh), (1, fh)):
                w = wb * wh
                if not w:
                    continue
                bi, hi = min(i0 + di, 4), min(k0 + dk, 4)
                acc += w * self.delta[size_idx, bi, hi]
                if self.filled[size_idx, bi, hi]:
                    touched_fills.append(f"g{size_idx}{bi}{hi}(w={w:.2f})")
        return acc, touched_fills

    def kinematic_fit(self, body_verts, body_faces, lbs_weights,
                      garment_waist_cm, body_waist_cm, body_mesh=None):
        """EXACTLY run_pilot_batch.kinematic_fit(). Any divergence here silently
        invalidates every delta in the library -- do not reorder these steps.

        `body_mesh` is a pure performance hint: the same collision mesh (and
        therefore the same AABB tree) reused across all three push-out calls
        instead of rebuilt each time. Output is bit-identical either way."""
        if self.binding is None:
            self.binding = G.bind_garment(
                self.template_verts, self.ref_verts, body_faces, f"pants_physics_{self.gender}")
        if body_mesh is None:
            body_mesh = G.body_proximity_mesh(body_verts, body_faces)
        g = G.deform_garment(self.binding, body_verts, body_faces)
        if garment_waist_cm is not None and body_waist_cm is not None:
            try:
                g = G.apply_pants_looseness(g, self.binding, body_verts, body_faces,
                                            lbs_weights, garment_waist_cm, body_waist_cm)
            except ValueError:
                pass   # TOO_SMALL -> plain fit, matching the grid's own behaviour
        g, _ = G.resolve_interpenetration(g, body_verts, body_faces, margin=0.006, iters=3,
                                          body_mesh=body_mesh)
        g = G.smooth_garment(g, self.template_faces)
        g, _ = G.resolve_interpenetration(g, body_verts, body_faces, margin=0.012, iters=3,
                                          body_mesh=body_mesh)
        g = G.clamp_garment_curvature(g, self.template_faces)
        g, _ = G.resolve_interpenetration(g, body_verts, body_faces, margin=0.012, iters=3,
                                          body_mesh=body_mesh)
        return g

    def drape(self, body_verts, body_faces, lbs_weights,
              body_waist_cm: float, height_cm: float,
              garment_waist_cm: float):
        """Returns (draped_verts, faces, uv, info). body_verts MUST be posed with
        pants_pose_hip_abduction_rad(self.gender, height_cm) -- that is the
        pose the grid was baked in at this body's height (gender/height-
        conditional for female). Returns None if the body falls outside the
        grid, so the caller can fall back to Tier 1."""
        waist_g = _clamp_to_grid(body_waist_cm, self.build_axis)
        height_g = _clamp_to_grid(height_cm, self.height_axis)
        if waist_g is None or height_g is None:
            logger.info("Pants drape declined: body too far outside grid "
                        "(waist=%.1f height=%.1f)", body_waist_cm, height_cm)
            return None
        if (waist_g, height_g) != (body_waist_cm, height_cm):
            logger.info("Pants drape: clamped to grid edge (waist %.1f->%.1f, height %.1f->%.1f)",
                        body_waist_cm, waist_g, height_cm, height_g)

        t0 = time.perf_counter()
        # One collision mesh for every push-out in this request (kinematic fit
        # does 3, the post-blend cleanup below 1) -- saves rebuilding the AABB
        # tree 3 extra times. Bit-identical output.
        body_mesh = G.body_proximity_mesh(body_verts, body_faces)
        kin = self.kinematic_fit(body_verts, body_faces, lbs_weights,
                                 garment_waist_cm, body_waist_cm, body_mesh=body_mesh)
        t_kin = time.perf_counter()

        # Delta lookup uses the CLAMPED body; the kinematic fit above used the
        # real one, so the garment still tracks the actual body and only the
        # physics correction comes from the nearest baked node.
        size_idx, build_frac, height_frac = self.grid_coords(
            waist_g, height_g, garment_waist_cm)
        delta, fills = self._interp_delta(size_idx, build_frac, height_frac)
        draped = kin + delta
        t_blend = time.perf_counter()

        draped, n_push = G.resolve_interpenetration(draped, body_verts, body_faces,
                                                    margin=0.004, iters=2,
                                                    body_mesh=body_mesh)
        info = {
            "size": PANTS_SIZE_LABELS[size_idx],
            "build_frac": round(build_frac, 3),
            "height_frac": round(height_frac, 3),
            "n_pushed": int(n_push),
            "filled_nodes_used": fills,
            "ms_kinematic": round((t_kin - t0) * 1000, 2),
            "ms_delta_blend": round((t_blend - t_kin) * 1000, 2),
            "ms_total": round((time.perf_counter() - t0) * 1000, 2),
        }
        if fills:
            # Explicit, never silent: this body's drape drew on neighbour-filled
            # grid nodes rather than real bakes.
            logger.info("Pants drape used neighbour-filled grid nodes: %s", ", ".join(fills))
        logger.info("Pants drape: size=%s build_frac=%.2f height_frac=%.2f, %d pushed, "
                    "blend=%.2fms total=%.2fms",
                    info["size"], build_frac, height_frac, n_push,
                    info["ms_delta_blend"], info["ms_total"])
        return draped, self.template_faces, self.uv, info


_PANTS_DRAPER = {}

def get_pants_draper(model, gender: str = "male"):
    """Process-wide per-gender singleton. Returns None if the drape is disabled
    by flag or the asset is missing/unloadable -- caller falls back to Tier 1."""
    if PANTS_DRAPE_MODE != "physics":
        return None
    if gender not in _PANTS_DRAPER:
        try:
            _PANTS_DRAPER[gender] = PantsPhysicsDraper(model, gender)
        except Exception as e:
            logger.warning("Pants physics drape unavailable (%s) -- falling back to Tier 1", e)
            _PANTS_DRAPER[gender] = None
    return _PANTS_DRAPER[gender]
