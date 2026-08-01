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

Run:  .venv/bin/python tools/drape_bake/phase4_grid_pants.py [--gender=male|female] [--dry-run]
      (--dry-run prints the 125-point list + a couple of sanity checks, bakes nothing)
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_SVC = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, _SVC)
import run_pilot_batch as RPB   # noqa: E402  (shared, validated pipeline)
from app import physics_drape   # noqa: E402  (canonical pose lookup)

# ── Grid axes ───────────────────────────────────────────────────────────────
# SIZE: garment flat waist (half-circumference). 38->62cm flat = 76->124cm round.
# Shared across genders -- the catalog uses one flat-waist size scale.
SIZE_GARMENT_WAIST_CM = [38.0, 44.0, 50.0, 56.0, 62.0]

# BUILD: 5 body shapes keyed on waist, per gender. Each node carries the full
# measurement set solve_betas needs. (wt_kg, chest, waist, hips)
#
# male: nodes 0/2/4 are exactly the pilot's slim/avg/heavy bodies; 1/3 are the
# linear midpoints (node 1 == the "normal" named_nonconvergent body).
#
# female: nodes 1/2 are Phase 1's real, already-baked stress/normal bodies
# (waist 74/88cm exactly). Nodes 0/3 are linear extrapolations from those two
# points. Node 4 was originally a further linear extrapolation
# (104/110/116/124) but that missed its own target by ~15cm even at 150
# solve_betas iterations -- beta saturated at the +-5 clamp, meaning that
# combination sits outside the female shape space's reach. Node 4 below is
# pulled back to a target verified (at num_iters=150) to converge within
# ~2-4cm with beta comfortably clear of the clamp (see conversation record,
# female Phase 3 axis check).
BUILDS = {
    "male": [
        (58,  86,  74,  88),    # 0 slim   (pilot 'bslim')
        (75,  98,  86,  100),   # 1 slim-avg (pilot 'normal'/named_nonconvergent)
        (92,  110, 98,  112),   # 2 avg    (pilot 'bavg')
        (108, 122, 110, 124),   # 3 avg-heavy
        (125, 134, 122, 136),   # 4 heavy  (pilot 'bheavy')
    ],
    "female": [
        (52, 86,  60,  92),     # 0 slim   (linear extrapolation)
        (65, 92,  74,  100),    # 1 slim-avg (REAL, Phase1 'normal', already baked)
        (78, 98,  88,  108),    # 2 avg    (REAL, Phase1 'stress', already baked)
        (91, 104, 102, 116),    # 3 avg-heavy (linear extrapolation)
        (98, 108, 112, 120),    # 4 heavy  (pulled back off the beta clamp edge)
    ],
}

# HEIGHT: per gender. male matches the tee grid's height nodes. female is
# centred on Phase 1's tested height (165cm, node 2) with the same ~7cm
# cadence.
HEIGHT_CM = {
    "male":   [162.0, 169.0, 175.0, 181.0, 188.0],
    "female": [151.0, 158.0, 165.0, 172.0, 179.0],
}

# POSE: hip-abduction angle. Canonical lookup now lives in
# app/physics_drape.py (pants_pose_hip_abduction_rad) so the offline bake and
# the online runtime can never drift apart -- the runtime re-poses a body
# before adding an interpolated delta, so it MUST reproduce whatever angle
# that delta was actually baked against. Diagnosed via LOG_PER_VERTEX on the
# failed grid nodes: the oscillation epicentre is the crotch/inner-thigh
# region on every failure checked. A single uniform angle (male's 6.9deg)
# leaves several short-height female nodes non-convergent; widening to
# 8.0deg converges MOST of them -- including build 4 (heaviest): gf141
# (size_idx=1, build_idx=4, height_idx=1) converged cleanly at 8.0deg, so
# build index alone is NOT the discriminator, despite build 4 also
# containing 3 of the unresolved nodes.
#
# Three SPECIFIC (size,build,height) combinations tested and re-tested at
# 6.9/7.5/8.0deg all failed to converge at every angle tried:
#   gf041 (size_idx=0, build_idx=4, height_idx=1)
#   gf341 (size_idx=3, build_idx=4, height_idx=1)
#   gf441 (size_idx=4, build_idx=4, height_idx=1)
# gf041/gf341 share a root cause distinct from a pose problem (both land on
# an UNADJUSTED garment -- one via the TOO_SMALL guard, one via a genuine
# zero-magnitude looseness diff -- confirmed by their bake inputs being
# byte-identical); gf441 got a real adjustment but still falls ~0.1mm short
# of the threshold at its best angle (8.0deg, 0.60mm). No angle resolves
# them; they are accepted as permanent holes, filled from neighbours.
#
# Exact (size_idx, build_idx, height_idx) combinations with no working angle
# at any height/build-conditional value. Recorded value is still 8.0deg (the
# best result found, not a fabricated "working" number) so provenance
# reflects what was actually tried.
FEMALE_POSE_UNRESOLVED_NODES = {(0, 4, 1), (3, 4, 1), (4, 4, 1)}


def pose_hip_abduction_deg(gender, height_idx, build_idx):
    """Thin, index-based wrapper for grid generation over the canonical,
    cm-based physics_drape.pants_pose_hip_abduction_rad -- converts a grid
    axis index to that node's actual height in cm, so the offline bake and
    the runtime read the exact same lookup, never two copies to keep in
    sync. `build_idx` is accepted for call-site compatibility but unused
    (see comment above: build index does not discriminate)."""
    height_cm = HEIGHT_CM[gender][height_idx]
    return math.degrees(physics_drape.pants_pose_hip_abduction_rad(gender, height_cm))


def build_grid_points(gender="male"):
    """125 point dicts, named g{size}{build}{height} with 0-4 indices, carrying
    the axis indices so the downstream delta library can be reshaped to
    (5,5,5,V,3) exactly like the tee's."""
    points = []
    builds = BUILDS[gender]
    height_cm = HEIGHT_CM[gender]
    # male keeps the original unprefixed g{s}{b}{h} names (already the
    # production grid's on-disk identity in _pilot_outputs/); female gets a
    # distinct "gf" prefix so its bake outputs can NEVER collide with -- or
    # silently overwrite -- male's already-baked batch_g###.npz files, which
    # share the exact same {s}{b}{h} index space.
    prefix = "g" if gender == "male" else "gf"
    for si, gw in enumerate(SIZE_GARMENT_WAIST_CM):
        for bi, (wt, chest, waist, hips) in enumerate(builds):
            for hi, h in enumerate(height_cm):
                points.append({
                    "name": f"{prefix}{si}{bi}{hi}",
                    "gender": gender,
                    "h_cm": h, "wt_kg": wt, "chest": chest, "waist": waist, "hips": hips,
                    "garment_waist_cm": gw,
                    # axis indices carried for delta-library reshaping (Phase 4)
                    "size_idx": si, "build_idx": bi, "height_idx": hi,
                    "pose_hip_abduction_deg": pose_hip_abduction_deg(gender, hi, bi),
                    "pose_unresolved": (gender == "female"
                                         and (si, bi, hi) in FEMALE_POSE_UNRESOLVED_NODES),
                })
    return points


def main():
    gender = "male"
    for a in sys.argv:
        if a.startswith("--gender="):
            gender = a.split("=", 1)[1]
    assert gender in ("male", "female"), f"unknown gender {gender!r}"
    # male keeps its original, pre-existing filenames (already the production
    # grid); female gets its own suffixed set so it never touches male's data.
    suffix = "" if gender == "male" else f"_{gender}"

    points = build_grid_points(gender)
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
        print(f"SMOKE TEST ({gender}): running {len(subset)} of 125 points: {sorted(p['name'] for p in subset)}")
        RPB.run_points(
            subset,
            os.path.join(HERE, f"grid125{suffix}_smoke_manifest.json"),
            os.path.join(HERE, f"grid125{suffix}_smoke_failures.json"),
            incremental=True,
        )
        return

    if "--dry-run" in sys.argv:
        print(f"5x5x5 grid ({gender}) = {len(points)} points")
        print(f"  SIZE (garment flat waist cm): {SIZE_GARMENT_WAIST_CM}")
        print(f"  BUILD (wt,chest,waist,hips):  {BUILDS[gender]}")
        print(f"  HEIGHT (cm):                  {HEIGHT_CM[gender]}")
        print("\n  first 3 and last 3 point names:",
              [p["name"] for p in points[:3]], "...", [p["name"] for p in points[-3:]])
        return

    # Full run: same manifest/failures pattern as the pilot, but its own files
    # so it never clobbers pilot_manifest.json (or male's grid, for a female
    # run). Incremental writes keep partial results if the run is interrupted.
    RPB.run_points(
        points,
        os.path.join(HERE, f"grid125{suffix}_manifest.json"),
        os.path.join(HERE, f"grid125{suffix}_failures.json"),
        incremental=True,
    )


if __name__ == "__main__":
    main()
