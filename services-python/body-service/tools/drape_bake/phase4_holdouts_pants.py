"""
Phase 4b -- interpolation-accuracy holdouts for the pants delta library.

Each holdout is an OFF-grid body at the centre of a grid cell. We bake it for
real, then predict the same point by trilinear interpolation from the delta
library, and compare. Error is reported in delta space, which equals the error
in final vertex position: the runtime reproduces the kinematic fit exactly and
only the delta is interpolated.

The holdout set is deliberately split:

  chainB_worst -- centre of the cell with the MOST filled corners in the whole
                  grid (size 1-2, build 2-3, height 3-4: 4 of 8 corners are
                  neighbour-filled, including g133/g134/g234 from Chain B).
                  This is the empirical gate on whether hole-filling degrades
                  real interpolation. Reported SEPARATELY, never averaged into
                  the clean numbers.

  clean_*      -- centres of fully-clean cells (0 filled corners) sampled from
                  three different regions of the grid. These establish the
                  baseline interpolation error the gate is judged against.

Build is keyed on body waist, matching the grid's own waist-keyed axis.

Run:  .venv/bin/python tools/drape_bake/phase4_holdouts_pants.py
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SVC = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import phase4_grid_pants as G   # noqa: E402
import run_pilot_batch as RPB   # noqa: E402

LIB = os.path.join(SVC, "models", "garments", "pants_physics", "delta_library.npz")
BUILD_WAISTS = [b[2] for b in G.BUILDS]           # [74, 86, 98, 110, 122]


def mid_build(i, j):
    """linear midpoint of two BUILD nodes -> (wt, chest, waist, hips)"""
    a, b = G.BUILDS[i], G.BUILDS[j]
    return tuple((x + y) / 2.0 for x, y in zip(a, b))


HOLDOUTS = [
    # name, size-cell, build-cell, height-cell
    ("chainB_worst", (1, 2), (2, 3), (3, 4)),
    ("clean_slim_short", (0, 1), (0, 1), (0, 1)),
    ("clean_slim_large", (3, 4), (0, 1), (0, 1)),
    ("clean_heavy_mid", (1, 2), (3, 4), (1, 2)),
]


def frac(val, axis):
    """fractional index of val along a monotonic axis"""
    for i in range(len(axis) - 1):
        if axis[i] <= val <= axis[i + 1]:
            return i + (val - axis[i]) / (axis[i + 1] - axis[i])
    raise ValueError(f"{val} outside {axis}")


def trilinear(delta, sf, bf, hf):
    s0, b0, h0 = int(np.floor(sf)), int(np.floor(bf)), int(np.floor(hf))
    s0 = min(s0, delta.shape[0] - 2); b0 = min(b0, delta.shape[1] - 2); h0 = min(h0, delta.shape[2] - 2)
    ts, tb, th = sf - s0, bf - b0, hf - h0
    out = np.zeros_like(delta[0, 0, 0], dtype=np.float64)
    for ds in (0, 1):
        for db in (0, 1):
            for dh in (0, 1):
                w = ((ts if ds else 1 - ts) * (tb if db else 1 - tb) * (th if dh else 1 - th))
                if w:
                    out += w * delta[s0 + ds, b0 + db, h0 + dh].astype(np.float64)
    return out


def build_points():
    pts = []
    for nm, (s0, s1), (b0, b1), (h0, h1) in HOLDOUTS:
        gw = (G.SIZE_GARMENT_WAIST_CM[s0] + G.SIZE_GARMENT_WAIST_CM[s1]) / 2.0
        wt, chest, waist, hips = mid_build(b0, b1)
        h = (G.HEIGHT_CM[h0] + G.HEIGHT_CM[h1]) / 2.0
        pts.append({
            "name": nm, "gender": "male",
            "h_cm": h, "wt_kg": wt, "chest": chest, "waist": waist, "hips": hips,
            "garment_waist_cm": gw,
        })
    return pts


def main():
    pts = build_points()
    print("holdout points (cell centres):")
    for p in pts:
        print(f"  {p['name']:18s} gw={p['garment_waist_cm']:.1f}  waist={p['waist']:.1f}  h={p['h_cm']:.1f}")

    if "--interp-only" not in sys.argv:
        RPB.run_points(pts,
                       os.path.join(HERE, "holdout_manifest.json"),
                       os.path.join(HERE, "holdout_failures.json"),
                       incremental=True)

    lib = np.load(LIB, allow_pickle=True)
    delta = lib["delta"]
    man = {m["name"]: m for m in json.load(open(os.path.join(HERE, "holdout_manifest.json")))}

    print("\n" + "=" * 74)
    print("INTERPOLATION ACCURACY (per-vertex error, interpolated vs real bake)")
    print("=" * 74)
    rows = []
    for p in pts:
        nm = p["name"]
        rec = man.get(nm)
        if rec is None:
            print(f"  {nm}: NO BAKE RESULT (harness failure) -- cannot evaluate")
            continue
        if rec.get("convergence_status") != "converged":
            print(f"  {nm}: reference bake DID NOT CONVERGE "
                  f"({rec.get('final_window_max_mm'):.2f}mm) -- not usable as ground truth")
            rows.append((nm, None, None, rec.get("final_window_max_mm")))
            continue
        out = np.load(os.path.join(HERE, f"_pilot_outputs/batch_{nm}.npz"), allow_pickle=True)
        real = out["draped_verts"].astype(np.float64) - out["input_verts"].astype(np.float64)
        pred = trilinear(delta,
                         frac(p["garment_waist_cm"], G.SIZE_GARMENT_WAIST_CM),
                         frac(p["waist"], BUILD_WAISTS),
                         frac(p["h_cm"], G.HEIGHT_CM))
        e = np.linalg.norm(pred - real, axis=1) * 1000
        rows.append((nm, float(e.mean()), float(e.max()), None))

    print(f"\n{'holdout':20s} {'mean err':>10s} {'max err':>10s} {'p95':>9s}")
    for p in pts:
        nm = p["name"]
        r = [x for x in rows if x[0] == nm]
        if not r:
            continue
        nm_, mean_e, max_e, osc = r[0]
        if mean_e is None:
            print(f"{nm:20s} {'--':>10s} {'--':>10s} {'--':>9s}   (reference bake failed, {osc:.2f}mm)")
            continue
        rec = man[nm]
        out = np.load(os.path.join(HERE, f"_pilot_outputs/batch_{nm}.npz"), allow_pickle=True)
        real = out["draped_verts"].astype(np.float64) - out["input_verts"].astype(np.float64)
        pred = trilinear(delta,
                         frac(p["garment_waist_cm"], G.SIZE_GARMENT_WAIST_CM),
                         frac(p["waist"], BUILD_WAISTS),
                         frac(p["h_cm"], G.HEIGHT_CM))
        e = np.linalg.norm(pred - real, axis=1) * 1000
        print(f"{nm:20s} {mean_e:9.2f}mm {max_e:9.2f}mm {np.percentile(e,95):8.2f}mm")

    clean = [r for r in rows if r[0].startswith("clean_") and r[1] is not None]
    gate = [r for r in rows if r[0] == "chainB_worst" and r[1] is not None]
    print("\n" + "-" * 74)
    if clean:
        cm = [r[1] for r in clean]
        print(f"clean-region holdouts : n={len(clean)}  mean-err range {min(cm):.2f}-{max(cm):.2f}mm  "
              f"(mean of means {np.mean(cm):.2f}mm)")
    if gate:
        print(f"chainB_worst (4/8 corners filled) : {gate[0][1]:.2f}mm mean-err   <-- REPORTED SEPARATELY")
        if clean:
            print(f"  ratio vs clean mean-of-means: {gate[0][1]/np.mean(cm):.2f}x")
    print("-" * 74)


if __name__ == "__main__":
    main()
