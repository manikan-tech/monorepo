"""
Phase 2, stage 1 (runs in the BACKEND venv — service's own .venv).

Generates the small set of bake inputs used for pants recipe-discovery
isolation testing (self-collision, pose, resolution) — NOT the full 125-point
production grid, which is Phase 3.

Stress body: a large-build male (per the locked plan: "stress-test the
widest-thigh body") wearing a size that gives real ease, since that combo
maximises both inner-thigh proximity (self-collision risk) AND excess fabric
(bunching risk) — the pants analogue of the tee's own "loosest body/size"
stress test.

Run:  .venv/bin/python tools/drape_bake/pilot_grid_pants.py
"""
import os
import sys

import numpy as np
import torch
import trimesh

_SVC = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, _SVC)
from app import main as M          # noqa: E402
from app import garment as G       # noqa: E402

OUT = os.path.join(_SVC, "tools", "drape_bake", "_pilot_inputs")
os.makedirs(OUT, exist_ok=True)

# Stress body: large male build, per the plan's "widest-thigh" stress case.
STRESS = dict(h_cm=180, wt_kg=100, chest=112, waist=104, hips=112)
STRESS_GARMENT_WAIST_CM = 58   # diff = 58*2-104 = +12cm -> real ease/excess fabric

# Hip-abduction angle for the "feet apart" pose test (radians). Small and
# natural -- a relaxed standing stance, not a deliberate wide stance. Rotation
# is about the Z axis (same convention the tee's relaxed-shoulder pose used),
# outward for each hip so the legs spread symmetrically.
POSE_HIP_ABDUCTION_RAD = 0.12  # ~6.9 deg per leg (~14 deg total spread)


def make_pin_weights(verts: np.ndarray) -> np.ndarray:
    """Pin only the waistband edge (top ~6% of the garment's vertical extent),
    mirroring the tee's own "pin only shoulder/collar" minimal-pinning choice
    (phase4_grid.py: pin = clip((t-0.86)/(0.94-0.86), 0, 1) for the tee's top).
    """
    y = verts[:, 1]
    ymin, ymax = y.min(), y.max()
    t = (y - ymin) / max(ymax - ymin, 1e-9)  # 0 at ankle, 1 at waist
    return np.clip((t - 0.94) / (1.00 - 0.94), 0.0, 1.0)


def solve_stress_body(model, rings, hip_abduction_rad: float = 0.0):
    """Solve betas for the stress body once (zero pose, as always), then do a
    separate forward pass with the chosen pose (zero = default stance, or a
    hip-abduction pose for the "feet apart" test)."""
    betas = M.solve_betas(
        model, rings, STRESS["h_cm"], STRESS["wt_kg"], STRESS["chest"],
        STRESS["waist"], STRESS["hips"], num_iters=40,
    )
    body_pose = torch.zeros(1, 69, dtype=torch.float32)
    if hip_abduction_rad != 0.0:
        # SMPL body_pose is 23 joints x 3 (axis-angle), joint 1 = L_Hip (idx 0),
        # joint 2 = R_Hip (idx 1) in the 0-indexed body_pose array (global_orient
        # is separate). Abduct symmetrically about Z.
        body_pose[0, 0:3] = torch.tensor([0.0, 0.0, hip_abduction_rad])   # L_Hip
        body_pose[0, 3:6] = torch.tensor([0.0, 0.0, -hip_abduction_rad])  # R_Hip
    with torch.no_grad():
        out = model(
            betas=betas.to(M.DEVICE),
            global_orient=torch.zeros(1, 3, dtype=torch.float32, device=M.DEVICE),
            body_pose=body_pose.to(M.DEVICE),
            return_verts=True,
        )
    v = out.vertices.detach().cpu().numpy().squeeze().astype(np.float64)
    f = np.asarray(model.faces, dtype=np.int64)
    return v, f


def kinematic_fit(model, gender, body_v, body_f, template_verts, template_faces, cache_key,
                   garment_waist_cm=None, body_waist_cm=None):
    """The exact pre-bake kinematic pipeline: bind -> deform -> size-loosen ->
    push-out (clean starting mesh for the sim, matching the tee's own
    phase4_grid.py which also push-out's the bake INPUT, not just the final
    render -- Blender's own collision solver is more stable starting clean).

    `cache_key` MUST be unique per distinct template topology -- bind_garment()
    caches per key on the (valid, production) assumption that topology is fixed
    per gender; a resolution bracket deliberately varies topology within the
    same gender, so each variant needs its own key or later calls silently
    reuse an earlier binding (verified: without this, all 3 resolution
    variants returned the SAME mid-resolution fit).
    """
    gw = STRESS_GARMENT_WAIST_CM if garment_waist_cm is None else garment_waist_cm
    bw = STRESS["waist"] if body_waist_cm is None else body_waist_cm
    ref_body = G.get_reference_body(model, gender)
    binding = G.bind_garment(template_verts, ref_body, body_f, cache_key)
    fitted = G.deform_garment(binding, body_v, body_f)
    lbs = model.lbs_weights.detach().cpu().numpy()
    try:
        fitted = G.apply_pants_looseness(
            fitted, binding, body_v, body_f, lbs, gw, bw,
        )
    except ValueError:
        pass
    fitted, n_push = G.resolve_interpenetration(fitted, body_v, body_f, margin=0.006, iters=3)
    # Matches the production dress_pants() fix: push-out stair-steps the
    # concave crotch region (Phase 2 finding), so smooth once more and mop up
    # the few verts that reintroduces inside the body.
    fitted = G.smooth_garment(fitted, template_faces)
    # Final margin raised 0.006->0.012m, above bake_one.py's own 0.010m
    # collision distance_min (Phase 2 snug-fit non-convergence, step 4).
    fitted, _ = G.resolve_interpenetration(fitted, body_v, body_f, margin=0.012, iters=3)
    # Curvature clamp runs LAST (matches dress_pants()): applying it right
    # after deform_garment() gets partly undone by push-out's hard
    # stay-outside-the-body constraint wherever the body itself protrudes.
    fitted = G.clamp_garment_curvature(fitted, template_faces)
    fitted, _ = G.resolve_interpenetration(fitted, body_v, body_f, margin=0.012, iters=3)
    return fitted, n_push


def save_bake_input(name, garment_v, garment_f, body_v, body_f):
    pin = make_pin_weights(garment_v)
    path = os.path.join(OUT, f"bake_input_{name}.npz")
    np.savez(
        path,
        garment_verts=garment_v.astype(np.float32), garment_faces=garment_f,
        body_verts=body_v.astype(np.float32), body_faces=body_f,
        pin_weights=pin.astype(np.float32),
    )
    print(f"  {name}: garment={len(garment_v)}v pinned={int((pin > 0.5).sum())} -> {path}")
    return path


def main():
    model, rings = M._load_smpl_model("male")
    template = G.load_pants_template("male")

    # ── Test A inputs: self-collision on/off (default pose, current/mid resolution) ──
    print("=== Test A: self-collision on/off (stress body, default pose) ===")
    body_v, body_f = solve_stress_body(model, rings, hip_abduction_rad=0.0)
    fitted, n_push = kinematic_fit(model, "male", body_v, body_f, template["vertices"], template["faces"], "pilot_pants_male_mid")
    print(f"  kinematic fit: {n_push} verts pushed off body")
    save_bake_input("selfcol_default_pose", fitted, template["faces"], body_v, body_f)

    # ── Test B inputs: pose (default vs hip-abducted "feet apart") ──
    print("=== Test B: pose (feet together vs feet apart), same stress body ===")
    body_v_apart, body_f_apart = solve_stress_body(model, rings, hip_abduction_rad=POSE_HIP_ABDUCTION_RAD)
    fitted_apart, n_push_apart = kinematic_fit(
        model, "male", body_v_apart, body_f_apart, template["vertices"], template["faces"],
        "pilot_pants_male_mid",  # same template/topology as Test A -- only the body pose differs
    )
    print(f"  kinematic fit (feet apart): {n_push_apart} verts pushed off body")
    save_bake_input("pose_feet_apart", fitted_apart, template["faces"], body_v_apart, body_f_apart)
    # (the "feet together" bake input is the same as Test A's -- reused, not duplicated)

    # ── Test C inputs: resolution bracket (coarse / mid=current / fine) ──
    # Holds SHAPE constant (same production template) and only varies polycount
    # -- decimate down for coarse, subdivide up for fine, mid is the template
    # as-is. This isolates resolution cleanly, unlike re-deriving the carve at
    # different subdivision counts (which would also subtly vary shape, since
    # boundary-resample/smooth behave slightly differently at each density).
    print("=== Test C: resolution bracket (shape held constant) ===")
    mid_v, mid_f = template["vertices"], template["faces"]
    mid_mesh = trimesh.Trimesh(mid_v, mid_f, process=False)
    coarse_mesh = mid_mesh.simplify_quadric_decimation(face_count=len(mid_f) // 4)
    fine_v, fine_f = trimesh.remesh.subdivide_loop(mid_v, mid_f, iterations=1)

    for (v, f), tag in [
        ((coarse_mesh.vertices, coarse_mesh.faces), "coarse"),
        ((mid_v, mid_f), "mid"),
        ((fine_v, fine_f), "fine"),
    ]:
        fitted_r, n_push_r = kinematic_fit(model, "male", body_v, body_f, v, f, f"pilot_pants_male_{tag}")
        print(f"  {tag}: template {len(v)}v/{len(f)}f -> fitted {n_push_r} pushed")
        save_bake_input(f"res_{tag}", fitted_r, f, body_v, body_f)

    print("DONE")


if __name__ == "__main__":
    main()
