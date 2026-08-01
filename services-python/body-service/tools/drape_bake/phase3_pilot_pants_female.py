"""
Female Phase 3 pilot -- 22 points, same structure as male's real pilot (not
27 -- checked directly against pilot_manifest.json: male's pilot was 22 real
points + 4 named edge cases = ... no: 18 systematic + 4 named = 22 male
points; the file's 25 total included 3 stale, pre-Phase-0 female entries that
don't count). Mirrors that structure exactly for female:

  - 18 systematic: 2 heights x 3 sizes x 3 builds (low/mid/high each axis)
  - 4 named edge cases: baseline, the two explicit stress corners (smallest
    body + largest size, largest body + smallest size), height extremes at
    mid build/size

All point names are "female_"-prefixed so they can never collide with any
male pilot point in _pilot_inputs/_pilot_outputs (male's own pilot reused
some literal height/size/build combinations, e.g. h175 -- prefixing removes
any ambiguity rather than relying on today's values never overlapping).

Run:  .venv/bin/python tools/drape_bake/phase3_pilot_pants_female.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_pilot_batch as RPB              # noqa: E402
from phase4_grid_pants import BUILDS, HEIGHT_CM, SIZE_GARMENT_WAIST_CM  # noqa: E402

GENDER = "female"
B = BUILDS[GENDER]     # [slim, node1(real normal), node2(real stress), node3, heavy]
H = HEIGHT_CM[GENDER]  # [151, 158, 165, 172, 179]
S = SIZE_GARMENT_WAIST_CM  # [38, 44, 50, 56, 62] -- shared axis


def _point(name, h, wt, chest, waist, hips, gw):
    return {"name": f"female_{name}", "gender": GENDER, "h_cm": h,
            "wt_kg": wt, "chest": chest, "waist": waist, "hips": hips,
            "garment_waist_cm": gw}


def build_points():
    points = []

    # ── 18 systematic: heights {node2=165, node3=172} x sizes {38,50,62} x
    # builds {slim=node0, avg=node2(real), heavy=node4} ──────────────────
    height_pair = [(2, H[2]), (3, H[3])]
    size_triplet = [(0, S[0]), (2, S[2]), (4, S[4])]
    build_triplet = [("bslim", 0, B[0]), ("bavg", 2, B[2]), ("bheavy", 4, B[4])]
    for hi, h in height_pair:
        for si, gw in size_triplet:
            for btag, bi, (wt, chest, waist, hips) in build_triplet:
                points.append(_point(f"h{h:.0f}_s{gw:.0f}_{btag}", h, wt, chest, waist, hips, gw))

    # ── 4 named edge cases ───────────────────────────────────────────────
    wt1, chest1, waist1, hips1 = B[1]   # node1: slim-avg (REAL, Phase1 normal build)
    points.append(_point("named_nonconvergent_baseline", H[2], wt1, chest1, waist1, hips1, S[1]))

    # Stress corner A: largest body + smallest size -> maximum negative ease
    # (garment far too small for the body -- highest risk of TOO_SMALL /
    # non-convergence, mirrors male's "too_small_heavy_build").
    wt4, chest4, waist4, hips4 = B[4]   # heavy
    points.append(_point("too_small_heavy_build", H[2], wt4, chest4, waist4, hips4, S[0]))

    # Stress corner B: smallest body + largest size -> maximum positive ease
    # (loosest possible garment -- highest risk of bunching/self-collision).
    # NOT added as its own point: it's already exactly h165_s62_bslim /
    # h172_s62_bslim in the systematic 18 above (build=slim=node0,
    # size=62=node4) -- adding it again would just duplicate a real point
    # and inflate the count past the 22 that matches male's real pilot
    # structure. Flagged explicitly in main()'s printout instead.

    wt2, chest2, waist2, hips2 = B[2]   # avg (REAL, Phase1 stress build)
    points.append(_point("height_low_midsize_midbuild", H[0], wt2, chest2, waist2, hips2, S[2]))
    points.append(_point("height_high_midsize_midbuild", H[4], wt2, chest2, waist2, hips2, S[2]))

    return points


def main():
    points = build_points()
    assert len(points) == 22, f"expected 22 pilot points, got {len(points)}"
    names = [p["name"] for p in points]
    assert len(set(names)) == 22, "duplicate point names"
    print(f"female pilot: {len(points)} points")
    for p in points:
        flag = ""
        if p["name"] in ("female_h165_s62_bslim", "female_h172_s62_bslim"):
            flag = "  <- stress corner: smallest body + largest size"
        elif p["name"] == "female_too_small_heavy_build":
            flag = "  <- stress corner: largest body + smallest size"
        print(f"  {p['name']}: h={p['h_cm']} wt={p['wt_kg']} chest={p['chest']} "
              f"waist={p['waist']} hips={p['hips']} garment_waist={p['garment_waist_cm']}{flag}")

    RPB.run_points(
        points,
        os.path.join(HERE, "pilot_manifest_female.json"),
        os.path.join(HERE, "pilot_failures_female.json"),
        incremental=True,
    )


if __name__ == "__main__":
    main()
