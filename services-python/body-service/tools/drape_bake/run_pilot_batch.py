"""
Phase 2 pilot batch harness (runs in the BACKEND venv -- service's own .venv).

Generates kinematic-fit inputs for a named list of grid points, bakes each
through bake_one.py (BPY venv, subprocess per point), and logs:
  - a results manifest (convergence status + timing per point) -> pilot_manifest.json
  - a failures log for anything that crashes/throws/times out -> pilot_failures.json

Crash policy: log and continue. A single bad point (subprocess crash, timeout,
non-finite blow-up, missing output file) is recorded and the batch moves on --
it never halts on one failure. This is the harness the eventual 125-point run
will reuse unchanged.

Run:  .venv/bin/python tools/drape_bake/run_pilot_batch.py
"""
import json
import os
import subprocess
import sys
import time

import numpy as np
import torch

_SVC = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, _SVC)
from app import main as M          # noqa: E402
from app import garment as G       # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
INPUTS_DIR = os.path.join(HERE, "_pilot_inputs")
OUTPUTS_DIR = os.path.join(HERE, "_pilot_outputs")
os.makedirs(INPUTS_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)

BPY = os.environ.get(
    "BPY_PYTHON",
    "/home/hashim/Documents/Coding/manikan-mvp/Manikan-MVP/backend/tools/drape_bake/bpy_venv/bin/python",
)
BAKE_ONE = os.path.join(HERE, "bake_one.py")
BAKE_TIMEOUT_S = 900  # generous per-point ceiling; a genuine hang should not stall the whole batch

# Cloth-sim recipe, locked (Phase 2 rounds 1-9) + snug-fit non-convergence fix.
# Round 10 finding: the snug-fit non-convergence was fixed by the 12mm final
# push-out margin ALONE (kinematic_fit() below). The damping_high that was
# briefly added is REVERTED to Blender factory defaults -- it was a partial
# workaround found before the margin diagnosis; it fixed the crowded points
# (which the margin fix also handles) but regressed the slim/snug point. With
# the margin fix in, factory damping converges every point tested, so no
# damping override and no regime branching is needed.
#
# Round 11: CLOTH_QUALITY raised 22 -> 60 (global, no conditional branch). The
# 12mm-margin recipe still left ~4 near-boundary snug-diagonal nodes oscillating
# at q22; substeps=60 resolves them. A 25-node q60 pre-test of the whole
# snug-ease diagonal confirmed 24/25 converge at q60, leaving a single isolated
# holdout (g221, avg build / height 169) that resists every lever tried and is
# accepted as one guard-caught, neighbour-fillable delta-library hole. Global
# q60 (not targeted) chosen for simplicity on a one-time unattended bake.
RECIPE_ENV = {
    "SELF_COLLISION": "0",
    "CLOTH_MASS": "1.2",
    "CLOTH_BENDING": "90",
    "CLOTH_TENSION": "70",
    "CLOTH_SHEAR": "70",
    "CLOTH_QUALITY": "60",
}
POSE_HIP_ABDUCTION_RAD = 0.12


def solve_posed_body(model, rings, h_cm, wt_kg, chest, waist, hips, hip_abduction_rad=POSE_HIP_ABDUCTION_RAD):
    betas = M.solve_betas(model, rings, h_cm, wt_kg, chest, waist, hips, num_iters=40)
    body_pose = torch.zeros(1, 69, dtype=torch.float32)
    if hip_abduction_rad != 0.0:
        body_pose[0, 0:3] = torch.tensor([0.0, 0.0, hip_abduction_rad])
        body_pose[0, 3:6] = torch.tensor([0.0, 0.0, -hip_abduction_rad])
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
                   garment_waist_cm, body_waist_cm):
    """Full pre-bake pipeline for one point: bind -> deform -> loosen (TOO_SMALL
    caught and reported, not raised) -> push-out -> smooth -> push-out ->
    curvature clamp. Mirrors pilot_grid_pants.kinematic_fit / dress_pants()."""
    ref_body = G.get_reference_body(model, gender)
    binding = G.bind_garment(template_verts, ref_body, body_f, cache_key)
    fitted = G.deform_garment(binding, body_v, body_f)
    lbs = model.lbs_weights.detach().cpu().numpy()
    too_small = False
    try:
        fitted = G.apply_pants_looseness(
            fitted, binding, body_v, body_f, lbs, garment_waist_cm, body_waist_cm,
        )
    except ValueError as e:
        too_small = True
        print(f"    (apply_pants_looseness raised {e!r} -- TOO_SMALL path, using plain kinematic fit)")
    fitted, n_push = G.resolve_interpenetration(fitted, body_v, body_f, margin=0.006, iters=3)
    fitted = G.smooth_garment(fitted, template_faces)
    # Final push-out margin (Phase 2 snug-fit non-convergence, step 4): raised
    # from 0.006 to 0.012m -- ABOVE bake_one.py's own collision distance_min
    # (0.010m). At 0.006 the pre-fit only guarantees less clearance than the
    # cloth solver's own comfort zone wants, so at snug sizes a large fraction
    # of vertices started the simulation already at-or-inside the solver's
    # margin (confirmed: 34% of vertices, up to 36% in the crotch band, on the
    # stubborn h180_s38_bavg point), forcing it to fight the margin from frame
    # 1 instead of settling.
    fitted, _ = G.resolve_interpenetration(fitted, body_v, body_f, margin=0.012, iters=3)
    fitted = G.clamp_garment_curvature(fitted, template_faces)
    # clamp_garment_curvature() is body-unaware (pure neighbour-average
    # smoothing) and can pull a few vertices back inside the margin it just
    # took care of -- one more light push-out catches that (mirrors the
    # terracing fix's own smooth-then-repush pattern).
    fitted, _ = G.resolve_interpenetration(fitted, body_v, body_f, margin=0.012, iters=3)
    return fitted, n_push, too_small


def make_pin_weights(verts):
    y = verts[:, 1]
    ymin, ymax = y.min(), y.max()
    t = (y - ymin) / max(ymax - ymin, 1e-9)
    return np.clip((t - 0.94) / (1.00 - 0.94), 0.0, 1.0)


def run_one_point(point):
    """point: dict with name, gender, h_cm, wt_kg, chest, waist, hips,
    garment_waist_cm, height_label (for logging only). Returns a result dict."""
    name = point["name"]
    result = {"name": name, "point": {k: v for k, v in point.items() if k != "name"}}
    t0 = time.time()
    try:
        model, rings = M._load_smpl_model(point["gender"])
        if point.get("template_path"):
            tpl_npz = np.load(point["template_path"], allow_pickle=True)
            template = {"vertices": tpl_npz["verts"].astype(np.float64), "faces": tpl_npz["faces"]}
        else:
            template = G.load_pants_template(point["gender"])
        body_v, body_f = solve_posed_body(
            model, rings, point["h_cm"], point["wt_kg"], point["chest"], point["waist"], point["hips"],
        )
        cache_key = f"pilot_batch_{point['gender']}" + ("_" + point["name"].split("_")[0]
                                                          if point.get("template_path") else "")
        fitted, n_push, too_small = kinematic_fit(
            model, point["gender"], body_v, body_f, template["vertices"], template["faces"],
            cache_key=cache_key, garment_waist_cm=point["garment_waist_cm"],
            body_waist_cm=point["waist"],
        )
        result["too_small_path"] = too_small
        result["n_pushed_kinematic"] = int(n_push)

        pin = make_pin_weights(fitted)
        in_path = os.path.join(INPUTS_DIR, f"batch_{name}.npz")
        out_path = os.path.join(OUTPUTS_DIR, f"batch_{name}.npz")
        np.savez(
            in_path,
            garment_verts=fitted.astype(np.float32), garment_faces=template["faces"],
            body_verts=body_v.astype(np.float32), body_faces=body_f,
            pin_weights=pin.astype(np.float32),
        )
    except Exception as e:
        result["stage"] = "kinematic_fit"
        result["error"] = repr(e)
        result["wall_time_s"] = time.time() - t0
        return "failure", result

    env = dict(os.environ)
    env.update(RECIPE_ENV)
    try:
        proc = subprocess.run(
            [BPY, BAKE_ONE, in_path, out_path],
            env=env, capture_output=True, text=True, timeout=BAKE_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        result["stage"] = "bake"
        result["error"] = f"TIMEOUT after {BAKE_TIMEOUT_S}s"
        result["wall_time_s"] = time.time() - t0
        return "failure", result

    result["wall_time_s"] = round(time.time() - t0, 1)
    if proc.returncode != 0:
        result["stage"] = "bake"
        result["error"] = f"exit_code={proc.returncode}\n--- stderr tail ---\n{proc.stderr[-2000:]}"
        return "failure", result

    if not os.path.exists(out_path):
        result["stage"] = "bake"
        result["error"] = "bake_one.py exited 0 but produced no output file"
        return "failure", result

    out = np.load(out_path, allow_pickle=True)
    result["converged"] = bool(out["converged"]) if "converged" in out.files else None
    result["convergence_status"] = str(out["convergence_status"]) if "convergence_status" in out.files else None
    result["frames_run"] = int(out["frames_run"]) if "frames_run" in out.files else None
    result["retries_used"] = int(out["retries_used"]) if "retries_used" in out.files else None
    result["final_window_max_mm"] = float(out["final_window_max_mm"]) if "final_window_max_mm" in out.files else None
    return "success", result


def run_points(points, manifest_path, failures_path, incremental=True):
    """Run a list of point dicts through the full validated pipeline
    (kinematic_fit -> bake_one.py with convergence guard -> result), writing a
    manifest of successes and a failures log. Crash policy is log-and-continue:
    no single point can halt the batch. Shared by the pilot CLI and
    phase4_grid_pants.py so the grid run cannot drift from the validated recipe.

    incremental=True re-writes both JSON files after every point, so a long
    unattended run's partial results survive an external kill (power/OOM).
    """
    manifest, failures = [], []
    for i, point in enumerate(points):
        print(f"\n=== [{i+1}/{len(points)}] {point['name']} ===")
        try:
            status, result = run_one_point(point)
        except Exception as e:  # belt-and-braces: never let one point kill the batch
            status, result = "failure", {"name": point["name"], "stage": "harness", "error": repr(e)}
        if status == "success":
            manifest.append(result)
            print(f"  -> {result['convergence_status']}  ({result['wall_time_s']}s)")
        else:
            failures.append(result)
            print(f"  -> FAILURE at stage={result.get('stage')}: {result.get('error')}")
        if incremental:
            with open(manifest_path, "w") as f:
                json.dump(manifest, f, indent=2)
            with open(failures_path, "w") as f:
                json.dump(failures, f, indent=2)

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    with open(failures_path, "w") as f:
        json.dump(failures, f, indent=2)
    print(f"\n=== DONE: {len(manifest)} succeeded, {len(failures)} failed ===")
    print(f"manifest -> {manifest_path}")
    print(f"failures -> {failures_path}")
    return manifest, failures


def main():
    points = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else []
    if not points:
        print("Usage: run_pilot_batch.py <points.json>")
        return
    run_points(points,
               os.path.join(HERE, "pilot_manifest.json"),
               os.path.join(HERE, "pilot_failures.json"))


if __name__ == "__main__":
    main()
