"""
Kinematic-fit-only (no physics) export for female_normal, to separate
template/carve-stage bagginess from stiffness/mass-stage bagginess -- same
diagnostic role the pre-bake renders played throughout male Phase 2.
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, HERE)
sys.path.insert(0, f"{HERE}/tools/drape_bake")
from app import garment as G                # noqa: E402
import run_pilot_batch as RPB               # noqa: E402
from phase1_female_poc import NORMAL_BODY, waist_for_ease  # noqa: E402

from app import main as M                   # noqa: E402

model, rings = M._load_smpl_model("female")
body_v, body_f = RPB.solve_posed_body(
    model, rings, NORMAL_BODY["h_cm"], NORMAL_BODY["wt_kg"],
    NORMAL_BODY["chest"], NORMAL_BODY["waist"], NORMAL_BODY["hips"],
)
tpl = G.load_pants_template("female")
garment_waist_cm = waist_for_ease(NORMAL_BODY["waist"], 2.0)

fitted, n_push, too_small = RPB.kinematic_fit(
    model, "female", body_v, body_f, tpl["vertices"], tpl["faces"],
    cache_key="normal_kinematic_only", garment_waist_cm=garment_waist_cm,
    body_waist_cm=NORMAL_BODY["waist"],
)
print(f"kinematic fit (NO physics): too_small={too_small} n_pushed={n_push} "
      f"garment_waist_cm={garment_waist_cm}")

# same leg-tube circumference measurement as the earlier template check, so
# this is a real number to compare against, not just a picture
from export_female_preview import ring_circumference_on_mesh, boundary_loops  # noqa: E402

ymin, ymax = body_v[:, 1].min(), body_v[:, 1].max()
band = (np.abs(body_v[:, 0]) < 0.03) & (body_v[:, 1] > ymin + 0.35 * (ymax - ymin)) & (body_v[:, 1] < ymin + 0.65 * (ymax - ymin))
crotch_y = float(body_v[band, 1].min())
thigh_y = crotch_y - 0.10   # 10cm below crotch, mid-upper-thigh
thigh_circ_cm = ring_circumference_on_mesh(fitted, tpl["faces"], thigh_y) * 100
loops = boundary_loops(fitted, tpl["faces"])
waist_circ_cm = loops[-1][1] * 100
print(f"kinematic-only: waist_circ={waist_circ_cm:.1f}cm  thigh_circ(10cm below crotch)={thigh_circ_cm:.1f}cm")

glb = G.build_dressed_glb(body_v, body_f, fitted, tpl["faces"], color_hex="#4A6FA5", target_height_m=1.65)
path = f"{HERE}/tools/drape_bake/female_normal_kinematic_only_preview.glb"
with open(path, "wb") as f:
    f.write(glb)
print(f"wrote {path} ({len(glb)/1024:.0f} KB)")
