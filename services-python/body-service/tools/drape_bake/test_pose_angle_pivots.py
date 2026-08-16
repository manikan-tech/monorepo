"""
Test whether a wider hip-abduction pose angle recovers the 6 h158 pivot
nodes (the true chain-breaking targets -- see conversation record: 0 true
triple-height-chains exist; the 6 rows where h151+h158 are BOTH holes are
gf041/gf141/gf231/gf331/gf341/gf441).

One variable only: POSE_HIP_ABDUCTION_RAD 6.9deg (0.12 rad, current) -> 8.0deg.
Everything else (recipe, template, garment_waist, body measurements) held
identical to the real grid bake. Writes to TEST-only paths, never touches
the committed grid125_female_manifest.json or _pilot_outputs/batch_gf*.npz.

Run:  .venv/bin/python tools/drape_bake/test_pose_angle_pivots.py
"""
import math
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SVC = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, SVC)
sys.path.insert(0, HERE)
from app import main as M, garment as G          # noqa: E402
import run_pilot_batch as RPB                     # noqa: E402
from phase4_grid_pants import BUILDS, HEIGHT_CM, SIZE_GARMENT_WAIST_CM  # noqa: E402

TEST_ANGLE_DEG = 8.0
TEST_ANGLE_RAD = math.radians(TEST_ANGLE_DEG)

B = BUILDS["female"]
H = HEIGHT_CM["female"]
S = SIZE_GARMENT_WAIST_CM

# (name, size_idx, build_idx) -- height is always h1 (158cm), the pivot
PIVOTS = [
    ("gf041", 0, 4), ("gf141", 1, 4), ("gf231", 2, 3),
    ("gf331", 3, 3), ("gf341", 3, 4), ("gf441", 4, 4),
]

TEST_INPUTS = os.path.join(HERE, "_test_pose_inputs")
TEST_OUTPUTS = os.path.join(HERE, "_test_pose_outputs")
os.makedirs(TEST_INPUTS, exist_ok=True)
os.makedirs(TEST_OUTPUTS, exist_ok=True)

BPY = os.environ.get(
    "BPY_PYTHON",
    "/home/hashim/Documents/Coding/manikan-mvp/Manikan-MVP/backend/tools/drape_bake/bpy_venv/bin/python",
)
BAKE_ONE = os.path.join(HERE, "bake_one.py")


def main():
    model, rings = M._load_smpl_model("female")
    template = G.load_pants_template("female")

    print(f"Testing POSE_HIP_ABDUCTION_RAD = {TEST_ANGLE_DEG}deg ({TEST_ANGLE_RAD:.4f} rad) "
          f"on the 6 h158 pivot nodes (baseline was 6.9deg / 0.12 rad)\n")

    for name, si, bi in PIVOTS:
        wt, chest, waist, hips = B[bi]
        h = H[1]  # 158cm, always the pivot height
        gw = S[si]
        print(f"=== {name}: size={gw} build={(wt,chest,waist,hips)} height={h} ===")

        body_v, body_f = RPB.solve_posed_body(
            model, rings, h, wt, chest, waist, hips, hip_abduction_rad=TEST_ANGLE_RAD,
        )
        fitted, n_push, too_small = RPB.kinematic_fit(
            model, "female", body_v, body_f, template["vertices"], template["faces"],
            cache_key=f"test_pose_angle_{name}", garment_waist_cm=gw, body_waist_cm=waist,
        )
        pin = RPB.make_pin_weights(fitted)
        in_path = os.path.join(TEST_INPUTS, f"batch_{name}.npz")
        out_path = os.path.join(TEST_OUTPUTS, f"batch_{name}.npz")
        np.savez(
            in_path,
            garment_verts=fitted.astype(np.float32), garment_faces=template["faces"],
            body_verts=body_v.astype(np.float32), body_faces=body_f,
            pin_weights=pin.astype(np.float32),
        )

        env = dict(os.environ)
        env.update(RPB.RECIPE_ENV)
        proc = subprocess.run([BPY, BAKE_ONE, in_path, out_path], env=env,
                               capture_output=True, text=True, timeout=900)
        if proc.returncode != 0:
            print(f"  BAKE ERROR: {proc.stderr[-1500:]}")
            continue
        out = np.load(out_path, allow_pickle=True)
        print(f"  -> {str(out['convergence_status'])}  final_window_max_mm={float(out['final_window_max_mm']):.4f}  "
              f"frames_run={int(out['frames_run'])} retries_used={int(out['retries_used'])}\n")


if __name__ == "__main__":
    main()
