"""
Measure garment-vs-body ease at several heights down the leg (crotch to
ankle), on a kinematic-fit-only mesh -- answers "is the excess volume even,
or concentrated near the crotch" with numbers instead of a visual guess.
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, HERE)
sys.path.insert(0, f"{HERE}/tools/drape_bake")
from app import main as M, garment as G                    # noqa: E402
import run_pilot_batch as RPB                                 # noqa: E402
from phase1_female_poc import NORMAL_BODY, waist_for_ease     # noqa: E402
from export_female_preview import ring_circumference_on_mesh  # noqa: E402


def measure(template, tag):
    model, rings = M._load_smpl_model("female")
    body_v, body_f = RPB.solve_posed_body(
        model, rings, NORMAL_BODY["h_cm"], NORMAL_BODY["wt_kg"],
        NORMAL_BODY["chest"], NORMAL_BODY["waist"], NORMAL_BODY["hips"],
    )
    garment_waist_cm = waist_for_ease(NORMAL_BODY["waist"], 2.0)
    fitted, n_push, too_small = RPB.kinematic_fit(
        model, "female", body_v, body_f, template["vertices"], template["faces"],
        cache_key=f"ease_dist_{tag}", garment_waist_cm=garment_waist_cm,
        body_waist_cm=NORMAL_BODY["waist"],
    )

    ymin, ymax = body_v[:, 1].min(), body_v[:, 1].max()
    band = (np.abs(body_v[:, 0]) < 0.03) & (body_v[:, 1] > ymin + 0.35 * (ymax - ymin)) & (body_v[:, 1] < ymin + 0.65 * (ymax - ymin))
    crotch_y = float(body_v[band, 1].min())
    ankle_y = float(body_v[:, 1].min()) + 0.05  # rough ankle height, matches carve's own convention roughly

    print(f"\n=== {tag} ===  (crotch_y={crotch_y:.3f})")
    print(f"{'depth below crotch':>20s} {'body circ':>10s} {'garment circ':>13s} {'ease':>8s}")
    for depth_cm in (2, 5, 10, 15, 20, 30, 45):
        y = crotch_y - depth_cm / 100.0
        if y < ankle_y:
            continue
        body_circ = ring_circumference_on_mesh(body_v, body_f, y) * 100
        garment_circ = ring_circumference_on_mesh(fitted, template["faces"], y) * 100
        print(f"{depth_cm:>18d}cm {body_circ:>9.1f}cm {garment_circ:>12.1f}cm {garment_circ-body_circ:>7.1f}cm")

    return fitted, body_v, body_f


if __name__ == "__main__":
    tpl = G.load_pants_template("female")
    measure(tpl, "current (leg_ease=1.00)")
