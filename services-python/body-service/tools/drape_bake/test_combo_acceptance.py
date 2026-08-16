"""
Combination-mode acceptance checks:

  1. Heavy stress body (belly wider than hips -- waistband sits differently
     against the tee hem than on an average build).
  2. Latency of the seam-reconciliation pass on top of the existing endpoint.
  3. Female combination (female tee + female pants).

IMPORTANT asymmetry, verified in code rather than assumed: **tee physics is
male-only**. `main.py` gates it on `sex == "male"`, `physics_drape.get_draper()`
takes no gender argument, and there is a single non-gendered
`models/garments/tshirt_physics/` asset dir. Pants physics is gendered (both
libraries exist). So a "female combo" is female-Tier-1-tee + female-physics-
pants, NOT two physics drapes. This script fits each garment through whichever
path production would actually use and reports which one fired, instead of
pretending both are physics everywhere.

Each garment fit below replicates the corresponding production function's
step order exactly (garment.dress() for the tee, garment.dress_pants() for
the pants) but returns vertices instead of a GLB, so the reconciliation can
be measured on them.

Run: MANIKAN_PANTS_DRAPE=physics .venv/bin/python tools/drape_bake/test_combo_acceptance.py
"""
import os
import sys
import time

import numpy as np
import torch
import trimesh

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "tools", "drape_bake"))
from app import main as M, garment as G, physics_drape          # noqa: E402
from export_female_preview import boundary_loops                # noqa: E402
from test_tee_pants_reconcile import posed_body, reconcile, measure_clipping  # noqa: E402


def tee_fit(model, gender, body_v, body_f, lbs, garment_chest_cm, body_chest_cm,
            chest_cm, height_cm):
    """Physics if this gender has a tee library (male only today), else the
    Tier-1 kinematic fit -- mirrors garment.dress() step for step."""
    if gender == "male":
        d = physics_drape.get_draper()
        v, f, _ = d.drape(body_v, body_f, lbs, chest_cm=chest_cm, height_cm=height_cm,
                          garment_chest_cm=garment_chest_cm, body_chest_cm=body_chest_cm)
        return v, f, "physics"

    template = G.load_garment_template(gender)
    ref_body = G.get_reference_body(model, gender)
    binding = G.bind_garment(template["vertices"], ref_body, body_f, gender)
    g = G.deform_garment(binding, body_v, body_f)
    try:
        g = G.apply_size_looseness(g, binding, body_v, body_f, lbs,
                                   garment_chest_cm, body_chest_cm, ref_body)
    except ValueError:
        pass
    g = G.smooth_garment(g, template["faces"])
    g, _ = G.resolve_interpenetration(g, body_v, body_f)
    return g, template["faces"], "tier1"


def pants_fit(model, gender, body_v, body_f, lbs, garment_waist_cm, body_waist_cm, height_cm):
    """Physics if the draper accepts this body, else Tier-1 -- mirrors
    garment.dress_pants() step for step (including its double push-out +
    curvature clamp tail, which is load-bearing for the crotch region)."""
    draper = physics_drape.get_pants_draper(model, gender)
    if draper is not None:
        res = draper.drape(body_v, body_f, lbs, body_waist_cm=body_waist_cm,
                           height_cm=height_cm, garment_waist_cm=garment_waist_cm)
        if res is not None:
            v, f, _uv, _info = res
            return v, f, "physics"

    template = G.load_pants_template(gender)
    ref_body = G.get_reference_body(model, gender)
    binding = G.bind_garment(template["vertices"], ref_body, body_f, f"pants_{gender}")
    g = G.deform_garment(binding, body_v, body_f)
    try:
        g = G.apply_pants_looseness(g, binding, body_v, body_f, lbs,
                                    garment_waist_cm, body_waist_cm)
    except ValueError:
        pass
    g = G.smooth_garment(g, template["faces"])
    g, _ = G.resolve_interpenetration(g, body_v, body_f, margin=0.006, iters=3)
    g = G.smooth_garment(g, template["faces"])
    g, _ = G.resolve_interpenetration(g, body_v, body_f, margin=0.012, iters=3)
    g = G.clamp_garment_curvature(g, template["faces"])
    g, _ = G.resolve_interpenetration(g, body_v, body_f, margin=0.012, iters=3)
    return g, template["faces"], "tier1"


def run_case(model, rings, gender, label, m, time_it=False):
    lbs = model.lbs_weights.detach().cpu().numpy()
    betas = M.solve_betas(model, rings, m["h_cm"], m["wt_kg"], m["chest"], m["waist"],
                          m["hips"], num_iters=150)

    # Tee physics needs relaxed shoulders; pants physics needs hip abduction.
    # Disjoint joint ranges, so both can be applied to one body. A Tier-1 tee
    # doesn't require any pose, so it is simply fitted on the same body.
    shoulder = physics_drape.RELAXED_SHOULDER_ANGLE if gender == "male" else 0.0
    body_v, body_f = posed_body(model, betas, shoulder,
                                 physics_drape.pants_pose_hip_abduction_rad(gender, m["h_cm"]))

    tee_v, tee_f, tee_path = tee_fit(model, gender, body_v, body_f, lbs,
                                      garment_chest_cm=m["chest"] / 2.0 + 3.0,
                                      body_chest_cm=m["chest"], chest_cm=m["chest"],
                                      height_cm=m["h_cm"])
    pants_v, pants_f, pants_path = pants_fit(model, gender, body_v, body_f, lbs,
                                              garment_waist_cm=m["waist"] / 2.0 + 2.0,
                                              body_waist_cm=m["waist"], height_cm=m["h_cm"])

    scale = (m["h_cm"] / 100.0) / (body_v[:, 1].max() - body_v[:, 1].min())
    body_v, tee_v, pants_v = body_v * scale, tee_v * scale, pants_v * scale

    waistband_y = boundary_loops(pants_v, pants_f)[-1][0]
    n_checked, n_before, pen_before = measure_clipping(tee_v, tee_f, pants_v, pants_f, waistband_y)

    t0 = time.perf_counter()
    tee_fixed, _ = reconcile(tee_v, tee_f, pants_v, pants_f, waistband_y, crop_pad_m=0.10)
    dt_ms = (time.perf_counter() - t0) * 1000

    _, n_after, pen_after = measure_clipping(tee_fixed, tee_f, pants_v, pants_f, waistband_y)
    moved = np.linalg.norm(tee_fixed - tee_v, axis=1) * 1000

    print(f"=== {label} ({gender}) ===")
    print(f"  paths fired: tee={tee_path}  pants={pants_path}")
    print(f"  BEFORE: {n_before}/{n_checked} clipping, max {pen_before:.1f}mm")
    print(f"  AFTER:  {n_after}/{n_checked} clipping, max {pen_after:.1f}mm | "
          f"corrections mean {moved[moved > 1e-9].mean() if (moved > 1e-9).any() else 0:.1f}mm "
          f"max {moved.max():.1f}mm")
    print(f"  reconcile pass: {dt_ms:.1f}ms")

    if time_it:
        times = []
        for _ in range(5):
            t = time.perf_counter()
            reconcile(tee_v, tee_f, pants_v, pants_f, waistband_y,
                      crop_pad_m=0.10)
            times.append((time.perf_counter() - t) * 1000)
        print(f"  reconcile timing over 5 runs: mean {np.mean(times):.1f}ms "
              f"min {np.min(times):.1f}ms max {np.max(times):.1f}ms")

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_combo_test",
                       f"acceptance_{label.replace(' ', '_')}.glb")
    scene = trimesh.Scene()
    scene.add_geometry(trimesh.Trimesh(body_v, body_f, process=False), node_name="body", geom_name="body")
    scene.add_geometry(trimesh.Trimesh(tee_fixed, tee_f,
                                       vertex_colors=np.tile([70, 130, 180, 255], (len(tee_fixed), 1)),
                                       process=False), node_name="tee", geom_name="tee")
    scene.add_geometry(trimesh.Trimesh(pants_v, pants_f,
                                       vertex_colors=np.tile([55, 58, 68, 255], (len(pants_v), 1)),
                                       process=False), node_name="pants", geom_name="pants")
    with open(out, "wb") as fh:
        fh.write(scene.export(file_type="glb"))
    print(f"  wrote {out}\n")
    return n_after, dt_ms


def main():
    male_model, male_rings = M._load_smpl_model("male")

    print("--- 1. heavy stress body (belly wider than hips) ---")
    run_case(male_model, male_rings, "male", "heavy stress",
             dict(h_cm=172, wt_kg=128, chest=128, waist=138, hips=124), time_it=True)

    print("--- 2. latency reference on the average body ---")
    run_case(male_model, male_rings, "male", "avg reference",
             dict(h_cm=175, wt_kg=82, chest=102, waist=90, hips=104), time_it=True)

    print("--- 3. female combination ---")
    female_model, female_rings = M._load_smpl_model("female")
    run_case(female_model, female_rings, "female", "female normal",
             dict(h_cm=165, wt_kg=65, chest=92, waist=74, hips=100), time_it=True)
    run_case(female_model, female_rings, "female", "female stress",
             dict(h_cm=165, wt_kg=78, chest=98, waist=88, hips=108), time_it=True)


if __name__ == "__main__":
    main()
