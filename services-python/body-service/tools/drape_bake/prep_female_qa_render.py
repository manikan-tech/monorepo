"""
Phase 0 visual QA prep: β=0 (canonical) female body, pants_female.npz
kinematically fitted onto it -- NO physics, NO baking. This checks the
Phase 0 carve parameters (taper/leg_ease/boxify) themselves, which is what a
kinematic-only fit directly reflects; physics is a separate, later question.

Writes an npz the bpy-side render script consumes (body verts/faces, garment
verts/faces) -- kept as two steps because SMPL/torch live in this venv and
bpy needs its own separate Python interpreter.
"""
import os
import sys

import numpy as np
import torch

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
HERE = os.path.dirname(os.path.dirname(TOOLS_DIR))
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS_DIR)
from app import main as M, garment as G   # noqa: E402
import run_pilot_batch as RPB              # noqa: E402

OUT = os.path.join(TOOLS_DIR, "_qa_female_beta0.npz")


def main():
    model, rings = M._load_smpl_model("female")

    # beta=0, pose=0: the canonical SMPL body, matching the same reference
    # convention used elsewhere in this codebase (clamp_garment_curvature's
    # own "bare, canonical beta=0/pose=0 SMPL body" check).
    betas = torch.zeros(1, 10, dtype=torch.float32)
    global_orient = torch.zeros(1, 3, dtype=torch.float32)
    body_pose = torch.zeros(1, 69, dtype=torch.float32)
    with torch.no_grad():
        out = model(
            betas=betas.to(M.DEVICE),
            global_orient=global_orient.to(M.DEVICE),
            body_pose=body_pose.to(M.DEVICE),
            return_verts=True,
        )
    verts_t = out.vertices.squeeze(0)  # torch (6890,3), native SMPL scale

    # Scale to a real, representative height so ring measurements mean
    # something (same technique as solve_betas: height first, then measure).
    target_height_m = 1.65
    mesh_height = M._measure_height(verts_t)
    scale = target_height_m / (mesh_height + 1e-6)
    verts_scaled_t = verts_t * scale
    waist_cm = float(M._measure_ring_circumference(verts_scaled_t, rings["waist"]) * 100.0)
    print(f"beta=0 female body @ {target_height_m*100:.0f}cm: waist={waist_cm:.1f}cm")

    body_v = verts_scaled_t.detach().cpu().numpy().astype(np.float64)
    body_f = np.asarray(model.faces, dtype=np.int64)

    tpl = G.load_pants_template("female")
    # No hip-abduction pose here -- this is a Phase 0 silhouette check, not a
    # bake-pose check; the plain canonical pose is what shows raw taper/boxify.
    garment_waist_cm = round(waist_cm / 2.0, 1)

    fitted, n_push, too_small = RPB.kinematic_fit(
        model, "female", body_v, body_f, tpl["vertices"], tpl["faces"],
        cache_key="qa_female_beta0", garment_waist_cm=garment_waist_cm, body_waist_cm=waist_cm or 70.0,
    )
    print(f"kinematic fit: too_small={too_small} n_pushed={n_push} garment_waist_cm={garment_waist_cm}")

    np.savez(
        OUT,
        body_verts=body_v.astype(np.float32), body_faces=body_f,
        garment_verts=fitted.astype(np.float32), garment_faces=tpl["faces"],
    )
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
