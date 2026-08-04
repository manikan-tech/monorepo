"""
Tee/pants combo reconciliation: proves out and validates the garment-vs-
garment overlap fix proposed for combined outfits (see docs/known-issues.md
"Tee+pants combined outfit" entry for the full writeup).

Two real findings from the investigation this script formalizes:

1. The overlap band CANNOT be estimated from the body's own "waist ring"
   landmark (off by ~5-8cm from where the pants mesh actually is -- the
   pants waistband sits notably below the body's anatomical waist). It must
   be measured from the pants mesh's own real boundary loop via
   boundary_loops(), the same exact-measurement technique already proven
   for female Phase 0 QA earlier this project.

2. A raw nearest-point-on-mesh search (the same primitive
   resolve_interpenetration already uses for garment-vs-body) is NOT safe to
   reuse as-is against an open, non-watertight garment mesh (pants: 3 open
   boundaries -- waistband + 2 hems). Near an open edge, "nearest point"
   can jump to a topologically unrelated, distant part of the mesh (measured:
   one case jumped 23cm to the ankle region) and its inside/outside sign
   test becomes meaningless there. Fix: crop the reference mesh to faces
   within a local Y-band before the search, so a distant match is
   structurally impossible, not just improbable.

Run:  MANIKAN_PANTS_DRAPE=physics .venv/bin/python tools/drape_bake/test_tee_pants_reconcile.py
"""
import os
import sys

import numpy as np
import torch
import trimesh

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "tools", "drape_bake"))
from app import main as M, garment as G, physics_drape, layering  # noqa: E402
from export_female_preview import boundary_loops          # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_combo_test")
os.makedirs(OUT_DIR, exist_ok=True)

BODIES = [
    ("slim",  dict(h_cm=175, wt_kg=68, chest=92, waist=80, hips=94)),
    ("avg",   dict(h_cm=175, wt_kg=82, chest=102, waist=90, hips=104)),
    ("heavy", dict(h_cm=175, wt_kg=105, chest=116, waist=108, hips=118)),
]


def posed_body(model, betas, relaxed_shoulder_rad, hip_abduction_rad):
    body_pose = torch.zeros(1, 69, dtype=torch.float32, device=M.DEVICE)
    a = hip_abduction_rad
    body_pose[0, 0:3] = torch.tensor([0.0, 0.0, a], device=M.DEVICE)
    body_pose[0, 3:6] = torch.tensor([0.0, 0.0, -a], device=M.DEVICE)
    s = relaxed_shoulder_rad
    body_pose[0, 45:48] = torch.tensor([0.0, 0.0, -s], device=M.DEVICE)
    body_pose[0, 48:51] = torch.tensor([0.0, 0.0, s], device=M.DEVICE)
    with torch.no_grad():
        out = model(betas=betas.to(M.DEVICE),
                    global_orient=torch.zeros(1, 3, dtype=torch.float32, device=M.DEVICE),
                    body_pose=body_pose, return_verts=True)
    v = out.vertices.detach().cpu().numpy().squeeze().astype(np.float64)
    f = np.asarray(model.faces, dtype=np.int64)
    return v, f


def measure_clipping(tee_v, tee_f, pants_v, pants_f, waistband_y, local_radius_m=0.08):
    below = tee_v[:, 1] < waistband_y
    if below.sum() == 0:
        return 0, 0, 0.0
    pants_mesh = trimesh.Trimesh(pants_v, pants_f, process=False)
    idx = np.where(below)[0]
    pts = tee_v[idx]
    closest, dist, tri_id = trimesh.proximity.closest_point(pants_mesh, pts)
    normals = pants_mesh.face_normals[tri_id]
    signed = np.einsum("nk,nk->n", pts - closest, normals)
    real_clip = (signed < 0) & (dist < local_radius_m)
    max_pen = float(-signed[real_clip].min() * 1000) if real_clip.any() else 0.0
    return int(below.sum()), int(real_clip.sum()), max_pen


def _edge_list(faces):
    e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]], axis=0)
    return np.unique(np.sort(e, axis=1), axis=0)


# ─── The reconciliation now LIVES IN PRODUCTION: app/layering.py ───────────
# This module keeps only a thin delegation so the validated tooling and the
# shipped engine can never drift apart. Everything the algorithm does, and
# why each defensive step exists, is documented there.
#
# Verified: app.layering.reconcile_seam() reproduces this tooling's original
# implementation bit-for-bit across both genders and four body builds.

_edge_list = layering._edges


def smooth_displacement(disp, faces, iterations, lamb=0.5):
    """Kept for the diagnostic scripts that measure jaggedness directly."""
    src, dst, deg = layering._adjacency(faces, len(disp))
    out = disp.copy()
    for _ in range(iterations):
        acc = np.zeros_like(out)
        np.add.at(acc, src, out[dst])
        out = (1 - lamb) * out + lamb * (acc / deg[:, None])
    return out


def reconcile(tee_v, tee_f, pants_v, pants_f, waistband_y, crop_pad_m=None,
              margin=None, bare=False, iters=2, **_ignored):
    """Delegates to the production implementation. `bare=True` still runs the
    original unsmoothed push, for before/after comparisons."""
    if bare:
        below = tee_v[:, 1] < waistband_y
        if not below.any():
            return tee_v, 0
        idx = np.where(below)[0]
        pad = layering.SEAM_CROP_PAD_M if crop_pad_m is None else crop_pad_m
        lo, hi = tee_v[idx, 1].min() - pad, waistband_y + pad
        fy = pants_v[pants_f].mean(axis=1)[:, 1]
        cropped = pants_f[(fy > lo) & (fy < hi)]
        used = np.unique(cropped)
        remap = -np.ones(len(pants_v), dtype=np.int64)
        remap[used] = np.arange(len(used))
        fixed, n = G.resolve_interpenetration(
            tee_v[idx], pants_v[used], remap[cropped],
            margin=layering.SEAM_MARGIN_M if margin is None else margin, iters=iters)
        out = tee_v.copy()
        out[idx] = fixed
        return out, n

    kwargs = {}
    if crop_pad_m is not None:
        kwargs["crop_pad_m"] = crop_pad_m
    if margin is not None:
        kwargs["margin"] = margin
    return layering.reconcile_seam(tee_v, tee_f, pants_v, pants_f, waistband_y, **kwargs)


def main():
    model, rings = M._load_smpl_model("male")
    tee_draper = physics_drape.get_draper()
    pants_draper = physics_drape.get_pants_draper(model, "male")
    lbs = model.lbs_weights.detach().cpu().numpy()

    for label, m in BODIES:
        betas = M.solve_betas(model, rings, m["h_cm"], m["wt_kg"], m["chest"], m["waist"], m["hips"], num_iters=80)
        body_v, body_f = posed_body(model, betas, physics_drape.RELAXED_SHOULDER_ANGLE,
                                     physics_drape.pants_pose_hip_abduction_rad("male", 175.0))
        tee_v, tee_f, _ = tee_draper.drape(body_v, body_f, lbs, chest_cm=m["chest"], height_cm=m["h_cm"],
                                            garment_chest_cm=m["chest"] / 2.0 + 3.0, body_chest_cm=m["chest"])
        pants_v, pants_f, _, _ = pants_draper.drape(body_v, body_f, lbs, body_waist_cm=m["waist"],
                                                     height_cm=m["h_cm"], garment_waist_cm=m["waist"] / 2.0 + 2.0)

        # Convert to real-world scale BEFORE measuring. The drape pipeline
        # works in SMPL native units and build_dressed_glb() applies the
        # height scale only at export, so native-unit millimetres understate
        # what a shopper actually sees (~6% for a 175cm body). The push-out
        # margin below is a real-world 3mm for the same reason.
        scale = (m["h_cm"] / 100.0) / (body_v[:, 1].max() - body_v[:, 1].min())
        body_v, tee_v, pants_v = body_v * scale, tee_v * scale, pants_v * scale

        loops = boundary_loops(pants_v, pants_f)
        waistband_y = loops[-1][0]

        n_checked, n_before, pen_before = measure_clipping(tee_v, tee_f, pants_v, pants_f, waistband_y)
        tee_v_fixed, n_fixed = reconcile(tee_v, tee_f, pants_v, pants_f, waistband_y)
        n_checked2, n_after, pen_after = measure_clipping(tee_v_fixed, tee_f, pants_v, pants_f, waistband_y)
        moved = np.linalg.norm(tee_v_fixed - tee_v, axis=1) * 1000

        print(f"=== {label} === waistband_y={waistband_y:.3f}")
        print(f"  BEFORE: {n_before}/{n_checked} clipping, max {pen_before:.1f}mm")
        print(f"  AFTER:  {n_after}/{n_checked2} clipping, max {pen_after:.1f}mm  "
              f"(moved: mean={moved[moved>0].mean() if (moved>0).any() else 0:.2f}mm "
              f"max={moved.max():.2f}mm)")

        # already in real-world scale (applied above) -- do NOT rescale again
        body_mesh = trimesh.Trimesh(body_v, body_f, process=False)
        tee_mesh = trimesh.Trimesh(tee_v_fixed, tee_f,
                                    vertex_colors=np.tile([70, 130, 180, 255], (len(tee_v_fixed), 1)), process=False)
        pants_mesh_out = trimesh.Trimesh(pants_v, pants_f,
                                          vertex_colors=np.tile([60, 60, 65, 255], (len(pants_v), 1)), process=False)
        scene = trimesh.Scene()
        scene.add_geometry(body_mesh, node_name="body", geom_name="body")
        scene.add_geometry(tee_mesh, node_name="tee", geom_name="tee")
        scene.add_geometry(pants_mesh_out, node_name="pants", geom_name="pants")
        out_path = os.path.join(OUT_DIR, f"combo_{label}_reconciled_final.glb")
        with open(out_path, "wb") as fh:
            fh.write(scene.export(file_type="glb"))
        print(f"  wrote {out_path}\n")


if __name__ == "__main__":
    main()
