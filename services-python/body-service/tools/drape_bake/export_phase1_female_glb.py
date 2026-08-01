"""Export the two real Phase 1 female bake results (post-physics, not just
kinematic fit) as GLBs for visual review."""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, HERE)
from app import garment as G  # noqa: E402

for name in ("female_stress", "female_normal"):
    out = np.load(f"{HERE}/tools/drape_bake/_pilot_outputs/batch_{name}.npz", allow_pickle=True)
    inp = np.load(f"{HERE}/tools/drape_bake/_pilot_inputs/batch_{name}.npz", allow_pickle=True)
    gv, gf = out["draped_verts"].astype(np.float64), out["garment_faces"]
    bv, bf = inp["body_verts"].astype(np.float64), inp["body_faces"]

    glb = G.build_dressed_glb(bv, bf, gv, gf, color_hex="#4A6FA5", target_height_m=1.65)
    path = f"{HERE}/tools/drape_bake/phase1_{name}_preview.glb"
    with open(path, "wb") as f:
        f.write(glb)
    print(f"wrote {path} ({len(glb)/1024:.0f} KB)  final_window_max_mm={float(out['final_window_max_mm']):.3f}")
