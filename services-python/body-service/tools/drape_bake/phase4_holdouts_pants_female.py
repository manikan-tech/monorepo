"""
Phase 4b -- interpolation-accuracy holdouts for the FEMALE pants delta
library. Mirrors phase4_holdouts_pants.py's method (real bake vs. trilinear
prediction from the delta library, same-space comparison) but written fresh
because the male script hardcodes G.BUILDS as a flat list (now a per-gender
dict) and a non-gendered library path -- reusing it as-is would silently
break or read the wrong file.

Each holdout is an OFF-grid body at the centre of a grid cell (garment size
is NOT interpolated -- it's a discrete catalog choice, so holdouts use a
build+height midpoint at a FIXED real size). We bake it for real, then
predict the same point by bilinear interpolation (build x height) from the
delta library, and compare in delta space (equals final-vertex-position
error, since the runtime reproduces the kinematic fit exactly).

Uses each holdout's own correct pose angle via
phase4_grid_pants.pose_hip_abduction_deg() -- NOT the runtime's current
single PANTS_POSE_HIP_ABDUCTION_RAD constant, which is still male's 6.9deg
and has not yet been updated for female's height-conditional recipe (a
Phase 5 runtime item, not addressed here).

Run:  .venv/bin/python tools/drape_bake/phase4_holdouts_pants_female.py
"""
import math
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SVC = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, SVC)
from app import main as M, garment as G          # noqa: E402
import run_pilot_batch as RPB                     # noqa: E402
from phase4_grid_pants import (                    # noqa: E402
    BUILDS, HEIGHT_CM, SIZE_GARMENT_WAIST_CM, pose_hip_abduction_deg,
)

LIB_PATH = os.path.join(SVC, "models", "garments", "pants_physics_female", "delta_library.npz")
BPY = os.environ.get(
    "BPY_PYTHON",
    "/home/hashim/Documents/Coding/manikan-mvp/Manikan-MVP/backend/tools/drape_bake/bpy_venv/bin/python",
)
BAKE_ONE = os.path.join(HERE, "bake_one.py")

B = BUILDS["female"]
H = HEIGHT_CM["female"]
S = SIZE_GARMENT_WAIST_CM

HOLDOUTS = [
    # name, size_idx (fixed, discrete), build cell (i,j), height cell (k,l)
    # mid_range uses height cell (3,4) = 172/179, both standard-height (6.9deg)
    # -- (2,3) was tried first and correctly rejected by the pose-boundary
    # assertion below: 165cm uses 8.0deg, 172cm uses 6.9deg, so that cell
    # straddles the boundary and has no single valid prediction angle.
    ("mid_range", 2, (1, 2), (3, 4)),            # size=50, build mid(1,2), height mid(172,179)
    ("short_height_region", 2, (1, 2), (0, 1)),  # size=50, build mid(1,2), height mid(151,158) -- pose-fix region
    # second short-height sample: different size (62 vs 50) and build cell
    # (0,1 vs 1,2), height cell (1,2)=158/165 -- well inside the short-height
    # region, not touching the 165->172 pose-boundary edge. Checks whether
    # the first short-height holdout's elevated error (2.18x mid-range) was
    # representative or specific to that one (size,build) combination.
    ("short_height_region2", 4, (0, 1), (1, 2)),  # size=62, build mid(0,1), height mid(158,165)
]


def mid(a, b):
    return tuple((x + y) / 2.0 for x, y in zip(a, b))


def bilinear_delta(lib, size_idx, bi, bj, hk, hl):
    d = lib["delta"].astype(np.float64)
    return 0.25 * (d[size_idx, bi, hk] + d[size_idx, bi, hl] + d[size_idx, bj, hk] + d[size_idx, bj, hl])


def main():
    lib = np.load(LIB_PATH, allow_pickle=True)
    model, rings = M._load_smpl_model("female")
    template = G.load_pants_template("female")

    only = None
    for a in sys.argv:
        if a.startswith("--only="):
            only = set(a.split("=", 1)[1].split(","))
    holdouts = [h for h in HOLDOUTS if only is None or h[0] in only]

    for name, si, (bi, bj), (hk, hl) in holdouts:
        wt, chest, waist, hips = mid(B[bi], B[bj])
        h = (H[hk] + H[hl]) / 2.0
        gw = S[si]
        # pose: both corner heights fall in the same standard/short-height
        # bracket for every holdout used here, so a single angle applies
        angle_deg = pose_hip_abduction_deg("female", hk, bi)  # hk==hl bracket-consistent by construction below
        assert pose_hip_abduction_deg("female", hl, bi) == angle_deg, "holdout spans a pose-angle boundary"
        angle_rad = math.radians(angle_deg)

        print(f"=== {name}: size={gw} build=({wt:.1f},{chest:.1f},{waist:.1f},{hips:.1f}) "
              f"height={h:.1f} pose={angle_deg}deg ===")

        body_v, body_f = RPB.solve_posed_body(model, rings, h, wt, chest, waist, hips,
                                               hip_abduction_rad=angle_rad)
        fitted, n_push, too_small = RPB.kinematic_fit(
            model, "female", body_v, body_f, template["vertices"], template["faces"],
            cache_key=f"holdout_female_{name}", garment_waist_cm=gw, body_waist_cm=waist,
        )
        pin = RPB.make_pin_weights(fitted)
        in_path = os.path.join(HERE, "_pilot_inputs", f"batch_holdout_female_{name}.npz")
        out_path = os.path.join(HERE, "_pilot_outputs", f"batch_holdout_female_{name}.npz")
        np.savez(in_path, garment_verts=fitted.astype(np.float32), garment_faces=template["faces"],
                 body_verts=body_v.astype(np.float32), body_faces=body_f, pin_weights=pin.astype(np.float32))

        env = dict(os.environ); env.update(RPB.RECIPE_ENV)
        proc = subprocess.run([BPY, BAKE_ONE, in_path, out_path], env=env,
                               capture_output=True, text=True, timeout=900)
        if proc.returncode != 0:
            print(f"  BAKE ERROR: {proc.stderr[-1500:]}"); continue
        out = np.load(out_path, allow_pickle=True)
        real_delta = out["draped_verts"].astype(np.float64) - out["input_verts"].astype(np.float64)
        print(f"  real bake: {str(out['convergence_status'])}  final_window_max_mm={float(out['final_window_max_mm']):.4f}")

        pred_delta = bilinear_delta(lib, si, bi, bj, hk, hl)
        err_mm = np.linalg.norm(pred_delta - real_delta, axis=-1) * 1000
        real_mag_mm = np.linalg.norm(real_delta, axis=-1) * 1000
        captured = 1.0 - (err_mm.mean() / max(real_mag_mm.mean(), 1e-9))
        print(f"  holdout error: mean={err_mm.mean():.3f}mm  max={err_mm.max():.3f}mm  "
              f"(real delta magnitude mean={real_mag_mm.mean():.3f}mm)  "
              f"drape signal captured ~{captured*100:.0f}%\n")


if __name__ == "__main__":
    main()
