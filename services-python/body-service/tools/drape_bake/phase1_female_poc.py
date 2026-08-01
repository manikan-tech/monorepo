"""
Female Phase 1 POC: real stress-body and normal-body bakes, locked recipe
(unchanged from male: mass=1.2, bending=90, tension/shear=70, SC off, q60,
feet-apart 0.12rad/6.9-deg pose, waistband pin) via the SAME infrastructure
already used for male -- run_pilot_batch.run_points(), not new bake code.

Bodies chosen the same way as male: waist-anchored, ease = 2*garment_waist_cm
- body_waist_cm.
  stress : +12cm ease (deliberately loose -- the hard convergence test)
  normal : +2cm ease (representative, close-fitted)

Run:  .venv/bin/python tools/drape_bake/phase1_female_poc.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_pilot_batch as RPB  # noqa: E402

# Female body, waist-anchored (mirrors the male stress/normal body convention
# used across this project's pilot work). wt_kg/chest/waist/hips.
STRESS_BODY = dict(h_cm=165.0, wt_kg=78, chest=98, waist=88, hips=108)
NORMAL_BODY = dict(h_cm=165.0, wt_kg=65, chest=92, waist=74, hips=100)


def waist_for_ease(body_waist_cm, ease_cm):
    """garment_waist_cm (flat) such that 2*garment_waist_cm - body_waist_cm == ease_cm"""
    return round((ease_cm + body_waist_cm) / 2.0, 1)


POINTS = [
    {
        "name": "female_stress", "gender": "female", **STRESS_BODY,
        "garment_waist_cm": waist_for_ease(STRESS_BODY["waist"], 12.0),
    },
    {
        "name": "female_normal", "gender": "female", **NORMAL_BODY,
        "garment_waist_cm": waist_for_ease(NORMAL_BODY["waist"], 2.0),
    },
]

if __name__ == "__main__":
    for p in POINTS:
        ease = 2 * p["garment_waist_cm"] - p["waist"]
        print(f"{p['name']}: body_waist={p['waist']}cm garment_waist_cm={p['garment_waist_cm']} "
              f"(ease={ease:+.1f}cm)")
    manifest, failures = RPB.run_points(
        POINTS,
        os.path.join(HERE, "phase1_female_manifest.json"),
        os.path.join(HERE, "phase1_female_failures.json"),
        incremental=True,
    )
