"""
Phase 4c -- vertex-correspondence / base-mesh integrity check for pants.

A delta library is only valid if the runtime adds its deltas to the SAME base
mesh the deltas were differenced against. Two distinct things must hold:

  (1) INDEXING   -- template vertex count and face array identical between the
                    library and what the runtime loads. A permutation here
                    silently scrambles the garment.
  (2) BASE MESH  -- the runtime's kinematic fit must reproduce, vertex for
                    vertex, the `input_verts` the bake stored. delta was
                    computed as (draped - input_verts); adding it to a
                    different base yields a different garment.

(2) is the check that actually bites: a vertex-count/face match passes trivially
while the base mesh is wrong, which is precisely the failure mode that looks
fine in isolation and only shows as a visually wrong garment on real bodies.

Method: take a real grid node, rebuild its body exactly as the bake did, then
run each candidate runtime path and compare against the stored input_verts
vertex-by-vertex.

Run:  .venv/bin/python tools/drape_bake/phase4_correspondence_pants.py
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SVC = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, SVC)

from app import main as M        # noqa: E402
from app import garment as G     # noqa: E402
import phase4_grid_pants as GRID  # noqa: E402
import run_pilot_batch as RPB     # noqa: E402

LIB = os.path.join(SVC, "models", "garments", "pants_physics", "delta_library.npz")
NODE = "g222"   # mid-grid, converged, unremarkable -- a fair representative


def main():
    si, bi, hi = int(NODE[1]), int(NODE[2]), int(NODE[3])
    pt = [p for p in GRID.build_grid_points() if p["name"] == NODE][0]
    print(f"reference node {NODE}: gw={pt['garment_waist_cm']} "
          f"build={GRID.BUILDS[bi]} h={pt['h_cm']}")

    lib = np.load(LIB, allow_pickle=True)
    baked = np.load(os.path.join(HERE, f"_pilot_outputs/batch_{NODE}.npz"), allow_pickle=True)
    input_verts = baked["input_verts"].astype(np.float64)
    baked_faces = baked["garment_faces"]

    print("\n" + "=" * 72)
    print("CHECK 1 -- INDEXING (vertex count + face array)")
    print("=" * 72)
    tpl = G.load_pants_template("male")
    rt_verts, rt_faces = tpl["vertices"], tpl["faces"]
    print(f"  runtime template verts : {rt_verts.shape}")
    print(f"  library delta verts    : {lib['delta'].shape[3]}")
    print(f"  baked input verts      : {input_verts.shape}")
    counts_ok = (rt_verts.shape[0] == lib["delta"].shape[3] == input_verts.shape[0])
    print(f"  vertex counts agree    : {counts_ok}")
    faces_lib_vs_baked = np.array_equal(lib["faces"], baked_faces)
    faces_rt_vs_lib = np.array_equal(np.asarray(rt_faces), np.asarray(lib["faces"]))
    print(f"  faces  library == baked: {faces_lib_vs_baked}")
    print(f"  faces  runtime == library: {faces_rt_vs_lib}")
    print(f"  --> CHECK 1 {'PASS' if (counts_ok and faces_lib_vs_baked and faces_rt_vs_lib) else 'FAIL'}")

    print("\n" + "=" * 72)
    print("CHECK 2 -- BASE MESH (does the runtime reproduce input_verts?)")
    print("=" * 72)
    model, rings = M._load_smpl_model("male")
    body_v, body_f = RPB.solve_posed_body(
        model, rings, pt["h_cm"], pt["wt_kg"], pt["chest"], pt["waist"], pt["hips"],
    )
    lbs = model.lbs_weights.detach().cpu().numpy()

    # --- candidate A: the bake's own kinematic_fit (the control) -------------
    fitA, _, _ = RPB.kinematic_fit(
        model, "male", body_v, body_f, tpl["vertices"], tpl["faces"],
        cache_key="corr_check_male",
        garment_waist_cm=pt["garment_waist_cm"], body_waist_cm=pt["waist"],
    )

    # --- candidate B: dress_pants()'s exact garment sequence -----------------
    # transcribed from app/garment.py dress_pants(); no GLB build.
    binding = G.bind_garment(tpl["vertices"], G.get_reference_body(model, "male"), body_f, "corr_check_male")
    gB = G.deform_garment(binding, body_v, body_f)
    gB = G.apply_pants_looseness(gB, binding, body_v, body_f, lbs,
                                 pt["garment_waist_cm"], pt["waist"])
    gB = G.smooth_garment(gB, tpl["faces"])
    gB, _ = G.resolve_interpenetration(gB, body_v, body_f)
    gB = G.smooth_garment(gB, tpl["faces"])
    gB, _ = G.resolve_interpenetration(gB, body_v, body_f, margin=0.012)
    gB = G.clamp_garment_curvature(gB, tpl["faces"])
    gB, _ = G.resolve_interpenetration(gB, body_v, body_f, margin=0.012)

    for label, cand in [("A  bake kinematic_fit()", fitA),
                        ("B  dress_pants() sequence", gB)]:
        d = np.linalg.norm(cand - input_verts, axis=1) * 1000
        print(f"\n  {label}")
        print(f"     bit-identical to input_verts : {np.array_equal(cand, input_verts)}")
        print(f"     per-vertex diff  mean {d.mean():8.3f}mm   max {d.max():9.3f}mm")
        print(f"     verts >1mm off   {int((d > 1).sum()):5d}/{len(d)}  ({(d > 1).mean() * 100:.1f}%)")

    print("\n" + "=" * 72)
    print("What this means for Phase 5")
    print("=" * 72)
    dB = np.linalg.norm(gB - input_verts, axis=1) * 1000
    mag = np.linalg.norm(lib["delta"][si, bi, hi].astype(np.float64), axis=1) * 1000
    print(f"  physics delta at this node : mean {mag.mean():.2f}mm  max {mag.max():.2f}mm")
    print(f"  dress_pants() base-mesh err: mean {dB.mean():.2f}mm  max {dB.max():.2f}mm")
    if dB.mean() > 0.5 * mag.mean():
        print("  --> base-mesh error is the same order as the correction being applied.")
        print("      Phase 5 must NOT add these deltas on top of dress_pants()'s")
        print("      output; it needs a draper that reproduces kinematic_fit().")


if __name__ == "__main__":
    main()
