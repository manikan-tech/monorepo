"""
Export the female pants template (Phase 0, kinematic-fit only, no physics)
on the canonical beta=0 SMPL female body as a 2-node GLB, for external
viewing -- and report the template's actual carved measurements (waist/hip
circumference, inseam) for comparison against a size chart.

Reuses build_dressed_glb() unchanged (the exact function dress_pants() calls
in production) rather than writing new export code, and reuses the same
beta=0 kinematic fit as the earlier render attempt.
"""
import os
import sys

import numpy as np
import torch
import trimesh

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, HERE)
sys.path.insert(0, f"{HERE}/tools/drape_bake")
from app import main as M, garment as G   # noqa: E402
import run_pilot_batch as RPB              # noqa: E402

OUT_GLB = f"{HERE}/tools/drape_bake/pants_female_preview.glb"


def ring_circumference_on_mesh(verts, faces, height, axis=1):
    """Perimeter of the mesh's cross-section at a given coordinate along
    `axis` (1 = Y, this codebase's up-axis). Sums every closed loop returned
    by the section in case the plane crosses more than one body part.

    Only used for an INTERIOR cut (hip). Verified stable there by checking
    several nearby heights land within noise of each other -- unlike a
    boundary edge (waistband/hem), an interior slice isn't sensitive to
    exactly where you cut."""
    mesh = trimesh.Trimesh(verts, faces, process=False)
    normal = np.zeros(3); normal[axis] = 1.0
    origin = np.zeros(3); origin[axis] = height
    section = mesh.section(plane_origin=origin, plane_normal=normal)
    if section is None:
        return 0.0
    total = 0.0
    for entity in section.entities:
        pts = section.vertices[entity.points]
        total += np.linalg.norm(np.diff(pts, axis=0), axis=1).sum()
    return total


def boundary_loops(verts, faces):
    """Trace the mesh's open-boundary edges into ordered loops and return
    each as (mean_height, perimeter_length). This is the TRUE waistband/hem
    opening length, and -- unlike a planar cross-section -- is exact
    regardless of whether the boundary is perfectly flat (kinematic-fitted
    waistbands generally aren't, they follow body curvature).

    A planar section 1cm vs 2cm below the same waistband was measured at
    61cm vs 104cm on this exact mesh -- an artifact of cutting height, not a
    real measurement. Tracing the actual boundary edges has no such
    free parameter."""
    from collections import defaultdict
    F = np.asarray(faces, dtype=np.int64)
    edge_count = defaultdict(int)
    for a, b, c in F:
        for u, w in ((a, b), (b, c), (c, a)):
            edge_count[(min(u, w), max(u, w))] += 1
    boundary_edges = [e for e, n in edge_count.items() if n == 1]

    adj = defaultdict(list)
    for a, b in boundary_edges:
        adj[a].append(b); adj[b].append(a)

    seen = set()
    loops = []
    for start in list(adj):
        if start in seen:
            continue
        loop = [start]; seen.add(start); cur = start; prev = None
        while True:
            nxt = None
            for n in adj[cur]:
                if n != prev and n not in seen:
                    nxt = n; break
                if n != prev and n == start and len(loop) > 2:
                    nxt = start; break
            if nxt is None:
                break
            if nxt == start:
                break
            loop.append(nxt); seen.add(nxt); prev, cur = cur, nxt
        if len(loop) >= 4:
            pts = verts[loop + [loop[0]]]
            length = np.linalg.norm(np.diff(pts, axis=0), axis=1).sum()
            loops.append((float(verts[loop, 1].mean()), float(length), len(loop)))
    return sorted(loops, key=lambda t: t[0])  # low (hem) -> high (waist)


def main():
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
    hip_cm_body = float(M._measure_ring_circumference(verts_scaled_t, rings["hip"]) * 100.0)

    body_v = verts_scaled_t.detach().cpu().numpy().astype(np.float64)
    body_f = np.asarray(model.faces, dtype=np.int64)

    tpl = G.load_pants_template("female")
    garment_waist_cm = round(waist_cm / 2.0, 1)
    fitted, n_push, too_small = RPB.kinematic_fit(
        model, "female", body_v, body_f, tpl["vertices"], tpl["faces"],
        cache_key="export_female_preview", garment_waist_cm=garment_waist_cm, body_waist_cm=waist_cm,
    )
    print(f"kinematic fit: too_small={too_small} n_pushed={n_push} "
          f"body_waist={waist_cm:.1f}cm -> chosen garment_waist_cm={garment_waist_cm}")

    # ── Measure the GARMENT mesh itself (not the body) ──────────────────
    gy = fitted[:, 1]

    # Waist/hem: trace the ACTUAL boundary loops (exact, no cut-height
    # sensitivity). There are 3 open boundaries on pants: 1 waistband (top)
    # + 2 leg hems (bottom) -- sorted low-to-high by mean height.
    loops = boundary_loops(fitted, tpl["faces"])
    print(f"\n  boundary loops found: {len(loops)} "
          f"(expect 3: 2 leg hems + 1 waistband)")
    for h, length, n in loops:
        print(f"    height={h:+.3f}  perimeter={length*100:.1f}cm  n_verts={n}")
    waist_loop = loops[-1]              # highest = waistband
    hem_loops = loops[:-1]              # the rest = leg hems
    garment_waist_circ_cm = waist_loop[1] * 100

    # Hip: an INTERIOR cross-section (no boundary to trace), so the planar
    # section is appropriate here -- but verify it's actually stable across
    # nearby heights before trusting it, unlike the waist attempt.
    hip_body_idx = rings["hip"]
    hip_y = float(body_v[hip_body_idx, 1].mean())
    hip_candidates = [ring_circumference_on_mesh(fitted, tpl["faces"], hip_y + dy)
                      for dy in (-0.01, -0.005, 0.0, 0.005, 0.01)]
    print(f"\n  hip cross-section stability check (+/-1cm around hip height): "
          f"{[f'{c*100:.1f}' for c in hip_candidates]}")
    garment_hip_circ_cm = hip_candidates[2] * 100

    # inseam: crotch height down to hem, vertical distance (canonical pose,
    # legs straight/together -- NOT a surface arc-length along the fabric).
    ymin, ymax = body_v[:, 1].min(), body_v[:, 1].max()
    band = (np.abs(body_v[:, 0]) < 0.03) & (body_v[:, 1] > ymin + 0.35 * (ymax - ymin)) & (body_v[:, 1] < ymin + 0.65 * (ymax - ymin))
    crotch_y = float(body_v[band, 1].min())
    inseam_cm = (crotch_y - float(gy.min())) * 100

    print()
    print("=== Female template, AS CARVED (measured on the fitted mesh) ===")
    print(f"  waist circumference : {garment_waist_circ_cm:.1f} cm  (flat/2 chosen = {garment_waist_cm} cm)")
    print(f"  hip circumference   : {garment_hip_circ_cm:.1f} cm   (at body's own hip-ring height)")
    print(f"  inseam (vertical, crotch->hem, straight-leg pose -- NOT a fabric arc-length)"
          f" : {inseam_cm:.1f} cm")
    print()
    print(f"  for reference, body's own measurements at this fit:")
    print(f"    body waist circumference: {waist_cm:.1f} cm")
    print(f"    body hip circumference  : {hip_cm_body:.1f} cm")

    glb_bytes = G.build_dressed_glb(
        body_v, body_f, fitted, tpl["faces"],
        color_hex="#4A6FA5", target_height_m=target_height_m,
    )
    with open(OUT_GLB, "wb") as f:
        f.write(glb_bytes)
    print(f"\nwrote {OUT_GLB} ({len(glb_bytes)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
