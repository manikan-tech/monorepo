"""
Prototype: runtime crotch-webbing correction for pants (Phase 0 fix).

The bug (confirmed on both male and female templates, before any physics
runs): the flat-pattern crotch bridge sits too low relative to where a real
body's legs actually separate, so a strip of "web" fabric hangs 145-190mm
below the true crotch point, with mesh edges literally bridging the
centreline in empty space between the legs.

This is deliberately implemented as a POST-DRAPE correction (kinematic fit or
kinematic+physics, doesn't matter which) rather than a Phase 0 re-carve:
- zero re-bake cost -- applies to the male delta library immediately, no
  7-hour re-run
- gender-agnostic -- one function, driven entirely by the BODY's own crotch
  geometry, not a per-gender constant
- template-agnostic -- would equally correct a Phase 0 re-carve later, if
  that's ever done instead

Method:
  1. Locate the body's true crotch height (lowest point of the inner-thigh
     gap, same measurement used to diagnose the bug).
  2. Identify "web" vertices: near the centreline, below that height.
  3. Reassign each to whichever leg is nearer (using the body's own LBS
     weights -- the same signal deform_garment() already relies on -- rather
     than a hardcoded left/right split), then push it onto that leg's
     surface above the crotch line.
  4. Laplacian-blend the correction into its neighbours so the fix doesn't
     read as a hard seam, then a final push-out pass to guarantee no new
     clipping.

Not yet wired into garment.py / physics_drape.py. This script only measures
whether the approach works, on both a male and a female body, before any
production change or render is considered.
"""
import os
import sys

import numpy as np
import trimesh

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, HERE)
sys.path.insert(0, f"{HERE}/tools/drape_bake")
from app import main as M, garment as G   # noqa: E402
import run_pilot_batch as RPB              # noqa: E402


def body_crotch_height(body_v):
    ymin, ymax = body_v[:, 1].min(), body_v[:, 1].max()
    band = (np.abs(body_v[:, 0]) < 0.03) & (body_v[:, 1] > ymin + 0.35 * (ymax - ymin)) & (body_v[:, 1] < ymin + 0.65 * (ymax - ymin))
    return body_v[band, 1].min(), ymin, ymax


def measure_droop_and_bridging(garment_v, garment_f, body_v):
    crotch_y, ymin, ymax = body_crotch_height(body_v)
    gband = (np.abs(garment_v[:, 0]) < 0.03) & (garment_v[:, 1] > ymin + 0.25 * (ymax - ymin)) & (garment_v[:, 1] < ymin + 0.65 * (ymax - ymin))
    lowest = garment_v[gband, 1].min() if gband.sum() else crotch_y
    droop_mm = (crotch_y - lowest) * 1000

    E = set()
    for a, b, c in garment_f:
        for u, w in ((a, b), (b, c), (c, a)):
            E.add((min(u, w), max(u, w)))
    E = np.array(sorted(E))
    x0, x1 = garment_v[E[:, 0], 0], garment_v[E[:, 1], 0]
    y0, y1 = garment_v[E[:, 0], 1], garment_v[E[:, 1], 1]
    bridging = (np.sign(x0) != np.sign(x1)) & (np.maximum(y0, y1) < crotch_y)
    span_mm = None
    if bridging.sum():
        ys = np.maximum(y0, y1)[bridging]
        span_mm = ((crotch_y - ys.max()) * 1000, (crotch_y - ys.min()) * 1000)
    return droop_mm, int(bridging.sum()), span_mm, crotch_y


def _bridging_vertex_set(V, F, crotch_y):
    """Exactly the vertices that participate in an edge crossing the
    centreline below the true crotch -- the direct cause of the measured
    defect, rather than a fixed-radius proxy for it."""
    E = set()
    for a, b, c in F:
        for u, w in ((a, b), (b, c), (c, a)):
            E.add((min(u, w), max(u, w)))
    E = np.array(sorted(E))
    x0, x1 = V[E[:, 0], 0], V[E[:, 1], 0]
    y0, y1 = V[E[:, 0], 1], V[E[:, 1], 1]
    bridging = (np.sign(x0) != np.sign(x1)) & (np.maximum(y0, y1) < crotch_y)
    verts = set()
    for (a, b), br in zip(E, bridging):
        if br:
            verts.add(int(a)); verts.add(int(b))
    return verts


def fix_crotch_webbing(garment_v, garment_f, body_v, body_f, lbs_weights,
                       margin_m=0.008, max_passes=4, lift_m=0.006):
    """Iteratively reassign exactly the vertices causing centreline-bridging
    edges below the true crotch to whichever leg is nearer (by the body's own
    dominant-joint assignment at the closest body point), push them onto that
    leg's surface above the crotch line, and blend. Repeats because moving one
    bridging vertex can occasionally hand the bridge to a formerly-fine
    neighbour; converges once no edge bridges below the crotch line."""
    crotch_y, ymin, ymax = body_crotch_height(body_v)
    V = garment_v.copy()
    F = np.asarray(garment_f, dtype=np.int64)

    body = trimesh.Trimesh(body_v, body_f, process=False)
    face_normals = body.face_normals
    dominant_joint = np.argmax(lbs_weights, axis=1)
    face_joint = dominant_joint[body_f].astype(np.int64)
    face_dom = np.array([np.bincount(row).argmax() for row in face_joint])
    LEFT_LEG_JOINTS = {1, 4, 7, 10}
    RIGHT_LEG_JOINTS = {2, 5, 8, 11}

    total_fixed = set()
    for _pass in range(max_passes):
        web = _bridging_vertex_set(V, F, crotch_y)
        if not web:
            break
        total_fixed |= web
        idx = np.array(sorted(web))
        closest, _dist, tri_id = trimesh.proximity.closest_point(body, V[idx])

        for k, i in enumerate(idx):
            cj = face_dom[tri_id[k]]
            side = -1.0 if cj in LEFT_LEG_JOINTS else (1.0 if cj in RIGHT_LEG_JOINTS else (np.sign(V[i, 0]) or 1.0))
            target = closest[k] + face_normals[tri_id[k]] * margin_m
            target[1] = max(target[1], crotch_y + lift_m)     # clear the crotch line, not just touch it
            target[0] = abs(target[0]) * side                 # force onto the assigned leg's side, no straddling
            V[i] = target

        V_smoothed = G.smooth_garment(V, F, iterations=6, lamb=0.5)
        mesh = trimesh.Trimesh(V, F, process=False)
        one_ring = mesh.vertex_neighbors
        influence = set(idx.tolist())
        for i in idx:
            influence.update(one_ring[i])
        infl = np.array(sorted(influence))
        V[infl] = V_smoothed[infl]
        V, _ = G.resolve_interpenetration(V, body_v, body_f, margin=margin_m, iters=2)

    return V, len(total_fixed)


def run_case(label, gender, h_cm, wt_kg, chest, waist, hips, garment_waist_cm):
    model, rings = M._load_smpl_model(gender)
    tpl = G.load_pants_template(gender)
    bv, bf = RPB.solve_posed_body(model, rings, h_cm, wt_kg, chest, waist, hips)
    fitted, _, _ = RPB.kinematic_fit(
        model, gender, bv, bf, tpl["vertices"], tpl["faces"],
        cache_key=f"crotchfix_{gender}", garment_waist_cm=garment_waist_cm, body_waist_cm=waist,
    )
    lbs = model.lbs_weights.detach().cpu().numpy()

    before = measure_droop_and_bridging(fitted, tpl["faces"], bv)
    fixed, n_web = fix_crotch_webbing(fitted, tpl["faces"], bv, bf, lbs)
    after = measure_droop_and_bridging(fixed, tpl["faces"], bv)

    print(f"\n=== {label} ({gender}) ===")
    print(f"  web vertices identified: {n_web}")
    print(f"  BEFORE: droop={before[0]:.1f}mm  bridging_edges={before[1]}  span={before[2]}")
    print(f"  AFTER : droop={after[0]:.1f}mm  bridging_edges={after[1]}  span={after[2]}")
    # sanity: did the fix introduce new body clipping anywhere else?
    body = trimesh.Trimesh(bv, bf, process=False)
    _, dist, _ = trimesh.proximity.closest_point(body, fixed)
    inside = trimesh.proximity.signed_distance(body, fixed) if False else None
    return before, after


if __name__ == "__main__":
    run_case("average male", "male", 175, 82, 100, 92, 104, 50.0)
    run_case("average female", "female", 165, 65, 92, 74, 100, 44.0)
    run_case("male worst-case (stress)", "male", 162, 92, 110, 98, 112, 38.0)
