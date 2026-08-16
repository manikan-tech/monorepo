"""
Crossed-leg violation check. No such check exists anywhere in this codebase
yet -- this defines it, rather than reusing something that was never built.

Definition: a garment vertex is in violation if it is (a) topologically part
of the leg tube (below the crotch, not the waist/seat region where crossing
the centreline is normal -- the fly seam, the crotch bridge itself), (b)
confidently assigned to one leg by the body's own LBS dominant-joint (the
same signal deform_garment() already uses, and the same left/right split
used in the crotch-fix prototype), and (c) its actual baked position has
crossed to the OTHER side of the centreline -- i.e. left-leg fabric now
sitting in right-leg space or vice versa. That is a real interpenetration/
self-crossing defect, distinct from the known crotch-bridge droop (which is
fabric hanging in the gap between the legs, not one leg's fabric crossing
into the other's).
"""
import os
import sys

import numpy as np
import trimesh

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, HERE)
sys.path.insert(0, f"{HERE}/tools/drape_bake")

LEFT_LEG_JOINTS = {1, 4, 7, 10}
RIGHT_LEG_JOINTS = {2, 5, 8, 11}


def crossed_leg_violations(garment_verts, garment_faces, body_verts, body_faces,
                           lbs_weights, tolerance_m=0.005):
    """Returns (n_violations, detail) where detail lists (vertex_idx, side,
    crossed_by_m) for every violating vertex."""
    body = trimesh.Trimesh(body_verts, body_faces, process=False)
    closest, _dist, tri_id = trimesh.proximity.closest_point(body, garment_verts)
    dominant_joint = np.argmax(lbs_weights, axis=1)
    face_joint = dominant_joint[body_faces][tri_id]      # (N,3) per garment vert
    face_dom = np.array([np.bincount(row).argmax() for row in face_joint])

    ymin, ymax = body_verts[:, 1].min(), body_verts[:, 1].max()
    band = (np.abs(body_verts[:, 0]) < 0.03) & (body_verts[:, 1] > ymin + 0.35 * (ymax - ymin)) & (body_verts[:, 1] < ymin + 0.65 * (ymax - ymin))
    crotch_y = body_verts[band, 1].min()

    in_leg_tube = garment_verts[:, 1] < crotch_y   # below crotch = leg tube, not seat/waist
    is_left = np.isin(face_dom, list(LEFT_LEG_JOINTS)) & in_leg_tube
    is_right = np.isin(face_dom, list(RIGHT_LEG_JOINTS)) & in_leg_tube

    # Verified empirically (not assumed): in this SMPL coordinate system,
    # joint 1 (L_Hip) sits at POSITIVE mean X, joint 2 (R_Hip) at NEGATIVE --
    # the opposite of a naive left=negative-X assumption, which is exactly
    # the bug the first version of this check had (it flagged ~60% of the
    # entire garment as "crossed", which the GLB renders plainly contradict).
    violations = []
    for i in np.where(is_left)[0]:
        if garment_verts[i, 0] < -tolerance_m:   # left(+X)-assigned vertex sitting on the -X side
            violations.append((int(i), "left->right", float(-garment_verts[i, 0])))
    for i in np.where(is_right)[0]:
        if garment_verts[i, 0] > tolerance_m:    # right(-X)-assigned vertex sitting on the +X side
            violations.append((int(i), "right->left", float(garment_verts[i, 0])))

    return len(violations), violations


if __name__ == "__main__":
    import json
    from app import main as M, garment as G
    import run_pilot_batch as RPB

    manifest = json.load(open(f"{HERE}/tools/drape_bake/phase1_female_manifest.json"))
    for m in manifest:
        name = m["name"]
        out = np.load(f"{HERE}/tools/drape_bake/_pilot_outputs/batch_{name}.npz", allow_pickle=True)
        inp = np.load(f"{HERE}/tools/drape_bake/_pilot_inputs/batch_{name}.npz", allow_pickle=True)
        gv, gf = out["draped_verts"].astype(np.float64), out["garment_faces"]
        bv, bf = inp["body_verts"].astype(np.float64), inp["body_faces"]

        model, _ = M._load_smpl_model("female")
        lbs = model.lbs_weights.detach().cpu().numpy()
        n, viol = crossed_leg_violations(gv, gf, bv, bf, lbs)
        print(f"{name}: convergence={m['convergence_status']} "
              f"final_window_max_mm={m['final_window_max_mm']:.3f}  "
              f"crossed_leg_violations={n}")
        if viol:
            worst = sorted(viol, key=lambda v: -v[2])[:5]
            for idx, side, amt in worst:
                print(f"    v{idx}: {side}  crossed by {amt*1000:.1f}mm")
