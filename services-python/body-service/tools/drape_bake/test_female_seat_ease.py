"""
Test harness for iterating on female pants seat_ease. Female-only, writes to
a TEST path (never touches the committed models/garments/pants/pants_female.npz
or anything male) until a value is explicitly locked in.

Usage:  .venv/bin/python tools/drape_bake/test_female_seat_ease.py 1.15
"""
import os
import sys

import numpy as np
import torch
import trimesh

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, HERE)
sys.path.insert(0, f"{HERE}/tools/drape_bake")
from app import main as M, garment as G                    # noqa: E402
import run_pilot_batch as RPB                                # noqa: E402
from extract_relaxed_pants import carve_pants, CONFIGS       # noqa: E402
from export_female_preview import boundary_loops, ring_circumference_on_mesh  # noqa: E402

if len(sys.argv) != 2:
    print("usage: test_female_seat_ease.py <seat_ease value>")
    sys.exit(1)
SEAT_EASE = float(sys.argv[1])

TEST_TAG = f"seatease{SEAT_EASE:.2f}".replace(".", "")
TEST_NPZ = f"{HERE}/tools/drape_bake/_test_pants_female_{TEST_TAG}.npz"
TEST_GLB = f"{HERE}/tools/drape_bake/pants_female_{TEST_TAG}_preview.glb"


def main():
    # Everything from the locked female CONFIGS except seat_ease, which we're
    # iterating on. Explicit dict, NOT calling extract_relaxed_pants.main()
    # (that loops both genders and overwrites the committed .npz files).
    base = dict(CONFIGS["female"])
    print(f"seat_ease: {base['seat_ease']} -> {SEAT_EASE}  (everything else unchanged)")
    base["seat_ease"] = SEAT_EASE
    print(f"carving female with: {base}")

    V, F = carve_pants("female", **base)

    # Same mesh-quality check style as extract_relaxed_pants.py's own main().
    mesh = trimesh.Trimesh(V, F, process=False)
    edges = np.sort(mesh.edges_sorted, axis=1)
    _, cnt = np.unique(edges, axis=0, return_counts=True)
    n_boundary = int((cnt == 1).sum())
    n_nonmanifold = int((cnt > 2).sum())
    loops = boundary_loops(V, F)
    print(f"\nmesh check: {len(V)} verts, {len(F)} faces, "
          f"boundary_edges={n_boundary}, non_manifold_edges={n_nonmanifold}, "
          f"boundary_loops={len(loops)} (expect 3)")
    if n_nonmanifold:
        print("  !! NON-MANIFOLD EDGES PRESENT -- stopping before fit/export !!")
        sys.exit(1)
    if len(loops) != 3:
        print(f"  !! expected exactly 3 boundary loops (2 hems + waistband), got {len(loops)} !!")

    np.savez(TEST_NPZ, verts=V.astype(np.float32), faces=F.astype(np.int64))
    print(f"wrote {TEST_NPZ}")

    # ── Same beta=0 kinematic fit + GLB export as the seat_ease=1.00 preview ──
    model, rings = M._load_smpl_model("female")
    betas = torch.zeros(1, 10, dtype=torch.float32)
    with torch.no_grad():
        out = model(
            betas=betas.to(M.DEVICE),
            global_orient=torch.zeros(1, 3, dtype=torch.float32, device=M.DEVICE),
            body_pose=torch.zeros(1, 69, dtype=torch.float32, device=M.DEVICE),
            return_verts=True,
        )
    verts_t = out.vertices.squeeze(0)
    target_height_m = 1.65
    scale = target_height_m / (M._measure_height(verts_t) + 1e-6)
    verts_scaled_t = verts_t * scale
    waist_cm = float(M._measure_ring_circumference(verts_scaled_t, rings["waist"]) * 100.0)
    body_v = verts_scaled_t.detach().cpu().numpy().astype(np.float64)
    body_f = np.asarray(model.faces, dtype=np.int64)

    garment_waist_cm = round(waist_cm / 2.0, 1)
    fitted, n_push, too_small = RPB.kinematic_fit(
        model, "female", body_v, body_f, V, F,
        cache_key=f"test_seat_ease_{TEST_TAG}", garment_waist_cm=garment_waist_cm, body_waist_cm=waist_cm,
    )
    print(f"kinematic fit: too_small={too_small} n_pushed={n_push} garment_waist_cm={garment_waist_cm}")

    hip_y = float(body_v[rings["hip"], 1].mean())
    hip_circ_cm = ring_circumference_on_mesh(fitted, F, hip_y) * 100
    fit_loops = boundary_loops(fitted, F)
    waist_circ_cm = fit_loops[-1][1] * 100
    print(f"fitted: waist_circ={waist_circ_cm:.1f}cm  hip_circ={hip_circ_cm:.1f}cm  "
          f"(body waist={waist_cm:.1f}cm)")

    glb_bytes = G.build_dressed_glb(
        body_v, body_f, fitted, F,
        color_hex="#4A6FA5", target_height_m=target_height_m,
    )
    with open(TEST_GLB, "wb") as f:
        f.write(glb_bytes)
    print(f"\nwrote {TEST_GLB} ({len(glb_bytes)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
