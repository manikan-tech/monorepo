"""
Test harness for female leg_ease, mirroring test_female_seat_ease.py.
Female-only, writes to TEST paths, never touches the committed
pants_female.npz or anything male. Kinematic-fit-only by default -- no
physics bake until the template itself is confirmed to look right.

Usage:  .venv/bin/python tools/drape_bake/test_female_leg_ease.py 0.88
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, HERE)
sys.path.insert(0, f"{HERE}/tools/drape_bake")
from app import main as M, garment as G                       # noqa: E402
import run_pilot_batch as RPB                                  # noqa: E402
from extract_relaxed_pants import carve_pants, CONFIGS          # noqa: E402
from export_female_preview import boundary_loops, ring_circumference_on_mesh  # noqa: E402
from phase1_female_poc import NORMAL_BODY, waist_for_ease       # noqa: E402

if len(sys.argv) != 2:
    print("usage: test_female_leg_ease.py <leg_ease value>")
    sys.exit(1)
LEG_EASE = float(sys.argv[1])
TAG = f"legease{LEG_EASE:.2f}".replace(".", "")


def main():
    base = dict(CONFIGS["female"])   # current locked female config: seat_ease=1.15, taper=0.86, ramp_width=default(0.10)
    print(f"leg_ease: {base['leg_ease']} -> {LEG_EASE}  (seat_ease={base['seat_ease']}, "
          f"taper={base['taper']}, ramp_width=default unchanged)")
    base["leg_ease"] = LEG_EASE

    V, F = carve_pants("female", **base)
    mesh_verts, mesh_faces = V, F
    import trimesh
    mesh = trimesh.Trimesh(V, F, process=False)
    edges = np.sort(mesh.edges_sorted, axis=1)
    _, cnt = np.unique(edges, axis=0, return_counts=True)
    n_nonmanifold = int((cnt > 2).sum())
    loops = boundary_loops(V, F)
    print(f"mesh check: {len(V)} verts, {len(F)} faces, non_manifold_edges={n_nonmanifold}, "
          f"boundary_loops={len(loops)} (expect 3)")
    if n_nonmanifold:
        print("  !! NON-MANIFOLD -- stopping !!"); sys.exit(1)

    model, rings = M._load_smpl_model("female")
    body_v, body_f = RPB.solve_posed_body(
        model, rings, NORMAL_BODY["h_cm"], NORMAL_BODY["wt_kg"],
        NORMAL_BODY["chest"], NORMAL_BODY["waist"], NORMAL_BODY["hips"],
    )
    garment_waist_cm = waist_for_ease(NORMAL_BODY["waist"], 2.0)
    fitted, n_push, too_small = RPB.kinematic_fit(
        model, "female", body_v, body_f, V, F,
        cache_key=f"test_leg_ease_{TAG}", garment_waist_cm=garment_waist_cm,
        body_waist_cm=NORMAL_BODY["waist"],
    )
    print(f"kinematic fit (NO physics): too_small={too_small} n_pushed={n_push} garment_waist_cm={garment_waist_cm}")

    ymin, ymax = body_v[:, 1].min(), body_v[:, 1].max()
    band = (np.abs(body_v[:, 0]) < 0.03) & (body_v[:, 1] > ymin + 0.35 * (ymax - ymin)) & (body_v[:, 1] < ymin + 0.65 * (ymax - ymin))
    crotch_y = float(body_v[band, 1].min())
    print(f"\n{'depth below crotch':>20s} {'body circ':>10s} {'garment circ':>13s} {'ease':>8s}")
    for depth_cm in (2, 5, 10, 15, 20, 30):
        y = crotch_y - depth_cm / 100.0
        body_circ = ring_circumference_on_mesh(body_v, body_f, y) * 100
        garment_circ = ring_circumference_on_mesh(fitted, F, y) * 100
        print(f"{depth_cm:>18d}cm {body_circ:>9.1f}cm {garment_circ:>12.1f}cm {garment_circ-body_circ:>7.1f}cm")

    glb = G.build_dressed_glb(body_v, body_f, fitted, F, color_hex="#4A6FA5", target_height_m=1.65)
    path = f"{HERE}/tools/drape_bake/female_normal_{TAG}_kinematic_preview.glb"
    with open(path, "wb") as f:
        f.write(glb)
    print(f"\nwrote {path} ({len(glb)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
