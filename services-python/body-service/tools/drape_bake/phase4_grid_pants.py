"""
Phase 3 — pants production bake grid (5x5x5 = 125 points).

Generates the full Size x Build x Height grid and bakes every point through the
EXACT validated pilot pipeline. This script defines ONLY the grid coordinates;
all fitting, baking, convergence-guarding and crash-handling is delegated to
run_pilot_batch.run_points / run_one_point, which wraps kinematic_fit (12mm
push-out margin, curvature clamp, etc.) + bake_one.py (self-collision off,
mass/bending/tension/shear locked, factory damping, convergence guard). There is
no reimplementation of the recipe here, so the grid run cannot drift from what
the 25-point pilot validated.

Axes (pants are WAIST-keyed, unlike the tee's chest-keyed grid):
  SIZE   = garment flat waist (cm)   -> the catalog size the shopper picks
  BUILD  = body shape, keyed on waist -> full (wt,chest,waist,hips) per node
  HEIGHT = body height (cm)

Grid nodes were chosen so the two already-tested heights (175, 180-ish) and the
pilot's slim/avg/heavy builds and 38/50/62 sizes all fall ON grid nodes -- the
pilot therefore validated real corners of THIS grid, not a separate sample.

Run:  .venv/bin/python tools/drape_bake/phase4_grid_pants.py [--dry-run]
      (--dry-run prints the 125-point list + a couple of sanity checks, bakes nothing)
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_pilot_batch as RPB   # noqa: E402  (shared, validated pipeline)

# ── Grid axes ───────────────────────────────────────────────────────────────
# SIZE: garment flat waist (half-circumference). 38->62cm flat = 76->124cm round.
SIZE_GARMENT_WAIST_CM = [38.0, 44.0, 50.0, 56.0, 62.0]

# BUILD: 5 body shapes keyed on waist. Each node carries the full measurement
# set solve_betas needs. Nodes 0/2/4 are exactly the pilot's slim/avg/heavy
# bodies; nodes 1/3 are the linear midpoints (node 1 == the "normal"
# named_nonconvergent body). weight follows the same linear ramp.
#            (wt_kg, chest, waist, hips)
BUILDS = [
    (58,  86,  74,  88),    # 0 slim   (pilot 'bslim')
    (75,  98,  86,  100),   # 1 slim-avg (pilot 'normal'/named_nonconvergent)
    (92,  110, 98,  112),   # 2 avg    (pilot 'bavg')
    (108, 122, 110, 124),   # 3 avg-heavy
    (125, 134, 122, 136),   # 4 heavy  (pilot 'bheavy')
]

# HEIGHT: matches the tee grid's height nodes (Phase 0 plan HEIGHT_CM).
HEIGHT_CM = [162.0, 169.0, 175.0, 181.0, 188.0]


def build_grid_points():
    """125 point dicts, named g{size}{build}{height} with 0-4 indices, carrying
    the axis indices so the downstream delta library can be reshaped to
    (5,5,5,V,3) exactly like the tee's."""
    points = []
    for si, gw in enumerate(SIZE_GARMENT_WAIST_CM):
        for bi, (wt, chest, waist, hips) in enumerate(BUILDS):
            for hi, h in enumerate(HEIGHT_CM):
                points.append({
                    "name": f"g{si}{bi}{hi}",
                    "gender": "male",
                    "h_cm": h, "wt_kg": wt, "chest": chest, "waist": waist, "hips": hips,
                    "garment_waist_cm": gw,
                    # axis indices carried for delta-library reshaping (Phase 4)
                    "size_idx": si, "build_idx": bi, "height_idx": hi,
                })
    return points


def main():
    points = build_grid_points()
    assert len(points) == 125, f"expected 125 grid points, got {len(points)}"

    # --only g112,g242,...  : run just a subset (smoke test) through the exact
    # same run_points path as the full grid, writing to separate smoke files.
    only = None
    for a in sys.argv:
        if a.startswith("--only="):
            only = set(a.split("=", 1)[1].split(","))
    if only is not None:
        subset = [p for p in points if p["name"] in only]
        missing = only - {p["name"] for p in subset}
        if missing:
            print(f"WARNING: names not in grid: {sorted(missing)}")
        print(f"SMOKE TEST: running {len(subset)} of 125 points: {sorted(p['name'] for p in subset)}")
        RPB.run_points(
            subset,
            os.path.join(HERE, "grid125_smoke_manifest.json"),
            os.path.join(HERE, "grid125_smoke_failures.json"),
            incremental=True,
        )
        return

    if "--dry-run" in sys.argv:
        print(f"5x5x5 grid = {len(points)} points")
        print(f"  SIZE (garment flat waist cm): {SIZE_GARMENT_WAIST_CM}")
        print(f"  BUILD (wt,chest,waist,hips):  {BUILDS}")
        print(f"  HEIGHT (cm):                  {HEIGHT_CM}")
        # sanity: confirm pilot corners land on grid nodes
        print("\n  pilot corners that fall ON grid nodes (validated in the 25-pt pilot):")
        for nm, si, bi, hi in [("g204 h175_s50_bheavy", 2, 4, 2),
                                ("g002 h175_s38_avg?", 0, 2, 2),
                                ("g212 named_nonconvergent~", 2, 1, 2)]:
            p = points[si * 25 + bi * 5 + hi]
            print(f"    {nm}: {p['name']} -> gw={p['garment_waist_cm']} build={BUILDS[bi]} h={p['h_cm']}")
        print("\n  first 3 and last 3 point names:",
              [p["name"] for p in points[:3]], "...", [p["name"] for p in points[-3:]])
        return

    # Full run: same manifest/failures pattern as the pilot, but its own files
    # so it never clobbers pilot_manifest.json. Incremental writes keep partial
    # results if the overnight run is interrupted.
    RPB.run_points(
        points,
        os.path.join(HERE, "grid125_manifest.json"),
        os.path.join(HERE, "grid125_failures.json"),
        incremental=True,
    )


if __name__ == "__main__":
    main()
