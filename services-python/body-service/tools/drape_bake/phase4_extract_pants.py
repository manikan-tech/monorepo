"""
Phase 4a -- build the pants delta library from the 125-point production bake.

delta = draped_verts - input_verts  (the physics correction on top of the
kinematic fit). At runtime the draper reproduces the same kinematic fit, then
adds an interpolated delta, so the library only has to carry the correction.

Output mirrors the tee's schema exactly (models/garments/tshirt_physics/
delta_library.npz): delta (5,5,5,V,3) float16, faces, sizes.

Hole handling
-------------
12 of the 125 nodes were caught by the convergence guard and carry no usable
result. They are filled from their converged neighbours in a SINGLE PASS that
reads only converged nodes -- a filled value is never a source for another
fill, so the result is order-independent and contains no cascade. See
docs/known-issues.md for the hole coordinates, chain structure and per-hole
source list.

fill_node() below is character-identical in behaviour to the function used for
the leave-one-out / leave-cluster-out validation that measured the fill cost
(2.40mm isolated / 2.77mm clustered, per-vertex mean). Keeping one
implementation is deliberate: the shipped library must be the thing that was
measured.

Run:  .venv/bin/python tools/drape_bake/phase4_extract_pants.py
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SVC = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import phase4_grid_pants as G  # noqa: E402

N = 5
OUT_DIR = os.path.join(SVC, "models", "garments", "pants_physics")
SIZE_LABELS = np.array(["S", "M", "L", "XL", "XXL"])
NEIGH = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]


def name(s, b, h):
    return f"g{s}{b}{h}"


def load_deltas():
    """-> deltas (5,5,5,V,3) float64, ok (5,5,5) bool, faces"""
    manifest = json.load(open(os.path.join(HERE, "grid125_manifest.json")))
    status = {m["name"]: m.get("convergence_status") for m in manifest}
    faces = None
    deltas = None
    ok = np.zeros((N, N, N), dtype=bool)
    for s in range(N):
        for b in range(N):
            for h in range(N):
                nm = name(s, b, h)
                d = np.load(os.path.join(HERE, f"_pilot_outputs/batch_{nm}.npz"), allow_pickle=True)
                if deltas is None:
                    V = d["draped_verts"].shape[0]
                    deltas = np.zeros((N, N, N, V, 3), dtype=np.float64)
                    faces = d["garment_faces"]
                deltas[s, b, h] = d["draped_verts"].astype(np.float64) - d["input_verts"].astype(np.float64)
                ok[s, b, h] = (status.get(nm) == "converged")
    return deltas, ok, faces


def fill_node(deltas, avail, tgt):
    """Estimate the delta at tgt reading ONLY nodes marked avail (converged).

    Primary: for each axis bracketed by two available neighbours, take their
    mean (the linear estimate trilinear interpolation itself assumes); average
    across all bracketed axes.
    Fallback (no bracketed axis): inverse-distance-squared over every available
    node within Manhattan distance 2.

    Returns (estimate, n_bracketed_axes).
    """
    s, b, h = tgt
    ests, n_bracketed = [], 0
    for ax in range(3):
        lo = [s, b, h]; hi = [s, b, h]
        lo[ax] -= 1; hi[ax] += 1
        if 0 <= lo[ax] and hi[ax] < N and avail[tuple(lo)] and avail[tuple(hi)]:
            ests.append(0.5 * (deltas[tuple(lo)] + deltas[tuple(hi)]))
            n_bracketed += 1
    if ests:
        return np.mean(ests, axis=0), n_bracketed

    num = np.zeros_like(deltas[0, 0, 0]); den = 0.0
    for ds in range(-2, 3):
        for db in range(-2, 3):
            for dh in range(-2, 3):
                if ds == db == dh == 0:
                    continue
                d1 = abs(ds) + abs(db) + abs(dh)
                if d1 > 2:
                    continue
                c = (s + ds, b + db, h + dh)
                if not all(0 <= x < N for x in c) or not avail[c]:
                    continue
                w = 1.0 / (d1 ** 2)
                num += w * deltas[c]; den += w
    if den == 0.0:
        raise RuntimeError(f"no available source within distance 2 of {name(*tgt)}")
    return num / den, 0


def main():
    deltas, ok, faces = load_deltas()
    V = deltas.shape[3]
    holes = [(s, b, h) for s in range(N) for b in range(N) for h in range(N) if not ok[s, b, h]]
    print(f"loaded 125 nodes, V={V}, converged={int(ok.sum())}, holes={len(holes)}")

    # Single pass: every estimate reads the ORIGINAL converged mask, so no
    # filled value can ever become a source. Estimates are staged and written
    # only after all are computed -- belt-and-braces against accidental
    # in-place cascade if this is ever refactored.
    staged = {}
    for c in holes:
        est, nb = fill_node(deltas, ok, c)
        staged[c] = (est, nb)
    for c, (est, nb) in staged.items():
        deltas[c] = est

    print("\nfilled holes (all sources converged, zero cascade):")
    for c in holes:
        nb = staged[c][1]
        how = f"bracketed x{nb}" if nb else "IDW (no bracketed axis)"
        print(f"  {name(*c)}: {how}")

    filled_mask = np.zeros((N, N, N), dtype=bool)
    for c in holes:
        filled_mask[c] = True

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "delta_library.npz")
    np.savez_compressed(
        out,
        delta=deltas.astype(np.float16),
        faces=faces,
        sizes=SIZE_LABELS,
        # provenance -- not read at runtime, but makes the library
        # self-describing about which nodes are real bakes vs neighbour fills
        filled=filled_mask,
        size_axis_cm=np.array(G.SIZE_GARMENT_WAIST_CM, dtype=np.float64),
        height_axis_cm=np.array(G.HEIGHT_CM, dtype=np.float64),
        build_axis=np.array(G.BUILDS, dtype=np.float64),
    )
    mb = os.path.getsize(out) / 1e6
    print(f"\nwrote {out}  ({mb:.1f} MB)")

    # sanity: float16 round-trip must not meaningfully degrade the deltas
    rt = deltas.astype(np.float16).astype(np.float64)
    err = np.linalg.norm(rt - deltas, axis=-1) * 1000
    print(f"float16 round-trip error: mean {err.mean():.4f}mm  max {err.max():.4f}mm")
    mag = np.linalg.norm(deltas, axis=-1) * 1000
    print(f"delta magnitude:          mean {mag.mean():.2f}mm  max {mag.max():.2f}mm")


if __name__ == "__main__":
    main()
