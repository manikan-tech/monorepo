"""
Phase 0 — Pants template authoring.

Carves a pants garment template from the SMPL body (one per gender), reshapes it
into the chosen cut, and saves it as a clean .npz (verts + faces) for the
kinematic fit (Pipeline 1) and, later, the physics bake (Pipeline 2).

Mirrors extract_relaxed_tee.py's technique (mask body region by dominant SMPL
joint -> offset along normals -> reshape -> subdivide -> boundary-clean ->
smooth), retargeted for legs. Runs in the body-service venv (SMPL + numpy +
trimesh; NO Blender needed for the carve).

The crotch closes automatically: the SMPL pelvis band connects both legs into a
single surface, so no separate bridge step is needed (3 clean openings result:
waist + 2 ankle hems).

License note: this template is 100% carved from the SMPL body — zero external
garment geometry. A downloaded reference jean was used only for proportion
guidance (rise, taper, cut), never for geometry.

Run:
    .venv/bin/python tools/drape_bake/extract_relaxed_pants.py
"""
import os
import sys

import numpy as np
import torch
import trimesh
from trimesh import graph as tg

# Import the service's SMPL loader + shared garment helpers.
_SVC = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, _SVC)
from app import main as M          # noqa: E402
from app import garment as G       # noqa: E402

OUT_DIR = os.path.join(_SVC, "models", "garments", "pants")

# SMPL joints that make up the pants region: Pelvis, L/R Hip, L/R Knee, L/R Ankle.
PANTS_JOINT_IDS = [0, 1, 2, 4, 5, 7, 8]

# ── Locked per-gender cuts (chosen with the user, Phase 0) ──
#   female : soft, curvier seat (from the female SMPL body), slim taper
#   male   : fitted straight jean ("cut B") — snug seat/thigh, straight leg that
#            stands a little off the shin, gentle boxy structure
CONFIGS = {
    "female": dict(offset=0.012, taper=0.86, leg_ease=1.00, boxify=0.00,
                   seat_ease=1.00, waist_rise=0.06, smooth=4),
    # taper=0.80/leg_ease=1.00 (Phase 2 taper sweep, fixes the balloon
    # silhouette) + ramp_width=0.18 (Phase 2 round 9: widens the crotch
    # convergence from a sharp cone-like point into a softer, rounder curve --
    # verified via one-variable-at-a-time isolation, held against 0.10/0.25).
    "male":   dict(offset=0.018, taper=0.80, leg_ease=1.00, boxify=0.35,
                   seat_ease=1.00, waist_rise=0.06, smooth=4, ramp_width=0.18),
}


def carve_pants(gender, offset, taper, leg_ease, boxify, seat_ease,
                waist_rise, smooth, ramp_width=0.10):
    """Carve + reshape one gender's pants template. Returns (verts, faces)."""
    model, _ = M._load_smpl_model(gender)
    with torch.no_grad():
        out = model(
            betas=torch.zeros(1, 10, dtype=torch.float32),
            global_orient=torch.zeros(1, 3, dtype=torch.float32),
            body_pose=torch.zeros(1, 69, dtype=torch.float32),
            return_verts=True,
        )
    V = out.vertices.squeeze(0).cpu().numpy().astype(np.float64)
    F = np.asarray(model.faces, dtype=np.int64)
    J = out.joints.squeeze(0).cpu().numpy()
    dom = np.argmax(model.lbs_weights.detach().cpu().numpy(), axis=1)

    pelvis_y = J[0, 1]
    ankle_y = min(J[7, 1], J[8, 1])
    hipL, hipR = J[1], J[2]

    # ── Mask the pants region: pants joints, from waistband down to just below
    #    the ankle (a small cuff, feet excluded). ──
    mask = (
        np.isin(dom, PANTS_JOINT_IDS)
        & (V[:, 1] < pelvis_y + waist_rise)
        & (V[:, 1] > ankle_y - 0.02)
    )
    Fs = F[mask[F].all(axis=1)]
    used = np.unique(Fs)
    remap = -np.ones(len(V), np.int64)
    remap[used] = np.arange(len(used))
    Vk = V[used]
    Fk = remap[Fs]

    # keep the single largest connected component (the pelvis links both legs)
    mk = trimesh.Trimesh(Vk, Fk, process=False)
    comps = sorted(
        tg.connected_components(mk.face_adjacency, nodes=np.arange(len(Fk))),
        key=len, reverse=True,
    )
    Fk = Fk[comps[0]]
    u2 = np.unique(Fk)
    r2 = -np.ones(len(Vk), np.int64)
    r2[u2] = np.arange(len(u2))
    Vk = Vk[u2]
    Fk = r2[Fk]

    # outward normal offset (fabric ease off the skin)
    Vk = Vk + trimesh.Trimesh(Vk, Fk, process=False).vertex_normals * offset

    # ── Straighten + taper the legs into a real trouser tube that stands off the
    #    thin lower leg (rather than shrink-wrapping it), optionally boxified. ──
    crotch_y = (hipL[1] + hipR[1]) / 2.0 - 0.02
    legY = crotch_y - ankle_y
    for side in (+1, -1):
        leg = (Vk[:, 1] < crotch_y) & (np.sign(Vk[:, 0]) == side)
        if leg.sum() < 20:
            continue
        t = np.clip((crotch_y - Vk[leg, 1]) / legY, 0, 1)   # 0 crotch .. 1 ankle
        ss = np.linspace(0, 1, 24)
        cxz = []
        for s0 in ss:
            b = np.abs(t - s0) < 0.08
            cxz.append([Vk[leg][b, 0].mean(), Vk[leg][b, 2].mean()]
                       if b.sum() > 2 else [np.nan, np.nan])
        cxz = np.array(cxz)
        for k in (0, 1):
            g = ~np.isnan(cxz[:, k])
            cxz[:, k] = np.interp(ss, ss[g], cxz[g, k])
        cx = np.interp(t, ss, cxz[:, 0])
        cz = np.interp(t, ss, cxz[:, 1])
        dx = Vk[leg, 0] - cx
        dz = Vk[leg, 2] - cz
        r = np.hypot(dx, dz) + 1e-9
        R_thigh = np.median(r[(t > 0.05) & (t < 0.22)]) * leg_ease
        tgt = R_thigh * (1 - (1 - taper) * t)
        w = np.clip(t / ramp_width, 0, 1)                    # keep seat fitted
        nr = np.where(r < tgt, r + (tgt - r) * w, r)
        sc = nr / r
        nx = cx + dx * sc
        nz = cz + dz * sc
        if boxify > 0:
            ddx = nx - cx
            ddz = nz - cz
            rr = np.hypot(ddx, ddz) + 1e-9
            ang = np.arctan2(ddz, ddx)
            se = (np.abs(np.cos(ang)) ** 4 + np.abs(np.sin(ang)) ** 4) ** (-0.25)
            fade = np.clip(t / 0.15, 0, 1)
            rr2 = rr * (1 - boxify * fade) + rr * se * (boxify * fade)
            nx = cx + np.cos(ang) * rr2
            nz = cz + np.sin(ang) * rr2
        idx = np.where(leg)[0]
        Vk[idx, 0] = nx
        Vk[idx, 2] = nz

    if seat_ease > 1.0:
        seat = (Vk[:, 1] >= crotch_y)
        c2 = Vk[seat].mean(0)
        d = Vk[seat] - c2
        d[:, 1] = 0
        Vk[np.where(seat)[0]] += d * (seat_ease - 1.0) * 0.6

    # resolution + cleanup (reuses the tee's own helpers)
    Vk, Fk = trimesh.remesh.subdivide_loop(Vk, Fk, iterations=1)
    Vk = G.resample_boundary(Vk, Fk, smooth_iterations=25, relax_iterations=5)
    Vk = G.smooth_garment(Vk, Fk, iterations=smooth, lamb=0.4)
    return Vk.astype(np.float64), Fk.astype(np.int64)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for gender, cfg in CONFIGS.items():
        V, F = carve_pants(gender, **cfg)
        mk = trimesh.Trimesh(V, F, process=False)
        e = np.sort(mk.edges_sorted, axis=1)
        _, cnt = np.unique(e, axis=0, return_counts=True)
        path = os.path.join(OUT_DIR, f"pants_{gender}.npz")
        np.savez(path, verts=V.astype(np.float32), faces=F.astype(np.int64))
        print(f"{gender}: {len(V)} verts, {len(F)} faces, "
              f"boundary_edges={int((cnt == 1).sum())} -> {path}")


if __name__ == "__main__":
    main()
