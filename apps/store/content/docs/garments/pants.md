# Pants 3D Try-On Pipeline

**This is not a production-proven pipeline the way the tee is — it's an active investigation, and this document is written as one.** Both genders have complete 125-point delta libraries with real bakes behind them, the retailer dashboard is fully wired, and the runtime code path exists end-to-end. But real defects are open and unfixed, real grid holes are filled by interpolation rather than by a real bake, and the runtime physics path ships **off by default**. Where earlier investigation steps turned out to be wrong, or didn't predict what actually happened later, that's kept in here rather than smoothed into a clean narrative — the false starts are most of what there is to learn from this project so far.

:::note
**Reading the `gxxx` / `gfxxx` codes used throughout this document.** Every bake point in the 125-point grid has a short name instead of a full measurement list: `g{size}{build}{height}` for male (e.g. `g221`), `gf{size}{build}{height}` for female (e.g. `gf141`) — three digits, each 0–4, indexing into that axis's 5 real values (garment size, body build, body height — the full axis values are given in "The bake grid" further down). So `g221` means size-index 2, build-index 2, height-index 1 — concretely, a size-50cm garment on an average-build, 169cm-tall male body. There's no meaning hidden in the letters beyond that: `g` = male grid, `gf` = female grid, and the three digits are just coordinates into the same 5×5×5 cube.
:::

## What's done, what's open — right up front

| | Status |
|---|---|
| Template authoring (SMPL-carve, both genders) | Done |
| Kinematic fit (Pipeline 1) | Done, shipped |
| Physics-baked drape grid, male (125 points) | Done — 113 converged, 12 guard-skipped holes, filled by interpolation |
| Physics-baked drape grid, female (125 points) | Done — 111 converged/extended, 14 guard-skipped holes, filled by interpolation |
| Runtime physics-drape path (`physics_drape.py`) | Implemented, both genders — **defaults OFF** (`MANIKAN_PANTS_DRAPE=off`), unlike the tee's physics path which defaults on |
| Retailer dashboard config (garment fields, eligibility gate) | Done, shipped, live |
| Crotch-bridge droop (both genders) | **Confirmed defect, not fixed.** Baked into both delta libraries as-is |
| Tee+pants combined outfit (`also_wear`) | Engine-complete, not requested by store/widget yet — see [Combined Outfits](/docs/garments/combined-outfits) |
| Build-2/build-3 failure concentration (male) | Confirmed pattern, root cause still unknown |
| Live request-latency benchmark | **Does not exist** — no production traffic runs the physics path by default |

## Architecture & pipeline

### Template authoring — no crotch-bridge step needed, by design

`tools/drape_bake/extract_relaxed_pants.py` (Phase 0) carves a pants template directly from the SMPL body per gender, mirroring `extract_relaxed_tee.py`'s technique (mask by dominant SMPL joint → offset along normals → reshape → subdivide → boundary-clean → smooth), retargeted for legs. Per its own docstring:

> "The crotch closes automatically: the SMPL pelvis band connects both legs into a single surface, so no separate bridge step is needed (3 clean openings result: waist + 2 ankle hems)."

Same licensing posture as the tee's own from-scratch template: "100% carved from the SMPL body — zero external garment geometry. A downloaded reference jean was used only for proportion guidance (rise, taper, cut), never for geometry." — no MGN-style exposure here.

### Pipeline 1 — kinematic fit

Reuses the tee's own machinery from `app/garment.py`, with pants-specific entry points: `load_pants_template(gender)`, `apply_pants_looseness(...)` (waist-driven sizing; raises on undersized fits, caught by callers as the `TOO_SMALL` path rather than a hard error), `settle_pants_against_body(...)`, and the shared `bind_garment()` / `resolve_interpenetration()` used by every garment category.

### The bake grid — 5×5×5, waist-keyed

Same structure as the tee's grid: two continuous body-shape axes (build, height) × one discrete garment-size axis, 125 points total, built and run via `tools/drape_bake/phase4_grid_pants.py` / `run_pilot_batch.py`.

- **Size axis** (garment flat waist): `[38, 44, 50, 56, 62]` cm — labels S–XXL.
- **Height axis**: male `[162, 169, 175, 181, 188]` cm, female `[151, 158, 165, 172, 179]` cm.
- **Build axis** (body waist, keys `ease = 2×garment_waist − body_waist`): male builds run body waist `[74, 86, 98, 110, 122]` cm; female `[60, 74, 88, 102, 112]` cm.

Node names are `g{size}{build}{height}` (male) / `gf{size}{build}{height}` (female), all indices 0–4.

### Runtime interpolation path

`app/physics_drape.py` defines `PantsPhysicsDraper`, gated by `PANTS_DRAPE_MODE = os.environ.get("MANIKAN_PANTS_DRAPE", "off")` — **off unless explicitly enabled**, unlike the tee's `USE_PHYSICS_DRAPE`, which defaults **on** (`os.environ.get("MANIKAN_PHYSICS_DRAPE", "1") != "0"`). No deploy config anywhere in this repo sets `MANIKAN_PANTS_DRAPE` — it's only referenced inside `body-service` source and local test/dev scripts, so as shipped in this repo, a production request falls through to the Tier-1 kinematic path unless something outside version control turns it on.

:::note
**What "off by default" does and doesn't mean here, stated precisely.** This is not a stub. The female pants commit documents real acceptance work against this exact path: holdout bakes validated against the delta library, delta-blend latency measured (0.3–0.4ms, both genders), fallback behaviour tested — and a real live bug was caught and fixed during that work (male's delta library had been silently falling back to Tier-1 for every physics-mode request after a path-naming split, until this testing found it). At the same time, the same commits leave two defects open by explicit choice, not oversight: the crotch-bridge droop and the build-2/3 grid holes, both "tracked with reproducible diagnostics rather than worked around." **Built, tested, real defects still open — but nothing in this repo states that the default-off flag exists *because of* those defects.** That causal link would be a reasonable guess, not a documented decision, so it isn't asserted here as one.
:::

When enabled, `get_pants_draper(model, gender)` and `pants_pose_hip_abduction_rad(gender, height_cm)` dispatch per gender — the latter is the female height-conditional pose fix described below (§ investigation), shared by both the offline bake and the online runtime so they can never drift apart.

### The still-open runtime droop fix

`tools/drape_bake/crotch_fix_prototype.py` is a real, unfinished prototype: a post-drape correction that reassigns "web" vertices (near the centreline, below the body's true crotch height) to whichever leg is nearer via the body's own LBS weights, then pushes them onto that leg's surface. Deliberately built as a post-drape correction rather than a Phase 0 re-carve — zero re-bake cost, gender-agnostic, template-agnostic. Per the known-issues record, it reduced droop but **oscillated rather than converging to zero bridging edges**, and was never applied anywhere.

The renders below are new — real Cycles renders of real production mesh data (`g222`'s and `gf141`'s own kinematic-fit output, the same convention `known-issues.md`'s own retracted rasterizer finding established as trustworthy), generated specifically to make this defect visible rather than only described in mm. A full-body view doesn't show it — the droop is a few centimetres of fabric at the crotch on a garment that reads as normal-fitting pants from any distance — so these are close crops on the crotch/inner-thigh region, garment rendered semi-transparent so the bridging fabric is visible against the body underneath it:

![Male crotch region, kinematic fit only: a visible strip of darker, doubled fabric bridges the gap between the legs below the true crotch point](/docs/pants/render-male-droop-closeup.jpg)
*Male, grid point `g222`'s kinematic-fit garment (pre-physics — the droop is a template/carve defect, present before any simulation runs). The vertical seam of more-saturated fabric running down the centre of the gap is the bridge itself.*

![Female crotch region, same defect, less visually pronounced from this angle at this body shape](/docs/pants/render-female-droop-closeup.jpg)
*Female, grid point `gf141`'s kinematic-fit garment. The same mechanism is present and measured (see the table above), but reads more subtly here than on the male body — a real difference in visual severity, not a claim that the defect itself differs. Consistent with this project's own established finding elsewhere that severity judged by eye can overstate or understate a mechanism confirmed by direct vertex measurement.*

## The investigation

This is the part that matters most, and it's kept in the order it actually happened, including the parts that didn't work and the one place a survey's predictions turned out to be wrong.

### The 25-point pilot, deliberately not a clean grid

The initial pilot set (`pilot_manifest_round1_original.json`) wasn't a symmetric sample — it was built to hit the cases most likely to break:

- `named_nonconvergent_baseline` — h=175cm, wt=75kg, waist=86cm, garment_waist=44cm (ease +2cm, snug) — a **deliberately-chosen known-difficult point**, not a random pick.
- `too_small_heavy_build` — ease −46cm, the grid's most extreme too-small corner.
- `height_low_midsize_midbuild` (h=162) and `height_high_midsize_midbuild` (h=188) — explicit height extremes.
- An 18-point 2(height: 175/180)×3(size: 38/50/62)×3(build: slim/avg/heavy) factorial, all landing on literal corners of the eventual 125-grid.
- 3 female sanity points, on a pre-Phase-0 scratch template — not the production female template.

25 points total, matching the pilot manifest's length exactly.

### Convergence guard and crash-policy infrastructure

Built specifically because a bad bake silently entering the delta library was judged worse than a bake that's flagged and skipped. In `bake_one.py`: `is_converged()` checks whether the max per-frame movement over the last 6 frames (`CHECK_WINDOW=6`) drops below `CONVERGENCE_THRESHOLD_MM = 0.5`mm. A non-converging point gets one retry with 30 extra frames (`RETRY_LIMIT=1`, `EXTEND_FRAMES=30`) before being marked `failed`. The threshold itself came from direct observation: every genuinely-converged bake seen at that point had settled under 0.25mm by frame 60; every non-convergent one oscillated in the 2–5mm range — 0.5mm sits cleanly between the two.

At the batch level, `run_pilot_batch.py`'s policy is explicit: *"log and continue. A single bad point... is recorded and the batch moves on — it never halts on one failure."* Results are written incrementally, so a long unattended run's partial results survive an external kill. This is the same harness the eventual 125-point production run reused unchanged.

### Fix attempt 1 — damping_high, and the regression that killed it

Round 1 (25 points, original recipe): **10 failures**, all in crowded/negative-ease avg-or-heavier builds. A damping increase ("damping_high") was tried as a fix.

Round 2 re-ran exactly those 10 failed points with the fix applied: **10/10 converged.**

:::warning
**Round 3 regression-checked 12 previously-passing points against the same fix — and one of them broke.** `h175_s38_bslim`, which had converged cleanly in round 1 (0.369mm), came back `failed` at 1.457mm. The fix that rescued the crowded points broke a slim/snug point that didn't need rescuing.
:::

The project's own recipe comment states the resolution plainly:

> "the snug-fit non-convergence was fixed by the 12mm final push-out margin ALONE. The damping_high that was briefly added is REVERTED to Blender factory defaults — it was a partial workaround found before the margin diagnosis; it fixed the crowded points (which the margin fix also handles) but regressed the slim/snug point. With the margin fix in, factory damping converges every point tested, so no damping override and no regime branching is needed."

![Pilot-stage recipe search across four rounds: round 1's 10 failures, round 2's fix, round 3's regression on a previously-clean point, and the final recipe's clean 25/25](/docs/pants/chart-pilot-chronology.png)
*Real counts from `pilot_manifest_round1_original.json` / `round2_failedset_fixed.json` / `round3_regression.json` / `pilot_manifest.json`.*

### Fix attempt 2 — the 12mm push-out margin, and why it worked

The real fix: raising the final pre-bake push-out margin from 0.006m to 0.012m — deliberately placed **above** `bake_one.py`'s own collision `distance_min` of 0.010m. The reasoning, from the code itself:

> "At 0.006 the pre-fit only guarantees less clearance than the cloth solver's own comfort zone wants... confirmed: **34% of vertices, up to 36% in the crotch band**, on the stubborn `h180_s38_bavg` point) forcing it to fight the margin from frame 1 instead of settling."

With the margin fix in and damping back to factory defaults, the full 25-point pilot set was revalidated: **25/25 converged**, worst case `h180_s38_bslim` at 0.209mm — comfortably under the 0.5mm guard threshold.

### Visual QA and why Cycles replaced the rasterizer

A visible "bulge" at the crotch was diagnosed and a fix was written for it — protecting crotch vertices from an over-aggressive relaxation step in `resample_boundary()` (called only by the pants carve, never by tee). After three attempts at locating exactly where the bulge peaked, the third one landed correctly — and the render **still** showed the same bulge. That was the tell.

:::note
Every render up to this point, including this one, was produced by a hand-rolled software rasterizer (flat per-face shading, one directional light) — built early in the project because live Blender/EEVEE rendering was hitting black-screen issues. Direct numeric curvature analysis showed only **2–4mm** of local deviation at the "bulge" — far too small to be the dramatic convex lump the rasterizer was showing. A proper Cycles render of the same bare mesh confirmed it: the crotch is genuinely, correctly concave. No bulge, no defect. The crotch-protection code was reverted. From this point on, anything judged purely through that rasterizer is treated as directionally suggestive, not settled, until re-checked under real shading.
:::

### The danger-zone survey — and where its predictions were wrong

Before the full 125-point bake, the riskiest-looking diagonal of the grid (the cells where garment size matches body build most closely, `g22x`–`g44x`, builds 2–4) was surveyed at the pilot-era recipe: **`g221`, `g332`, `g333`, and `g334` all failed.**

After the quality bump described next fixed three of those four, it would have been easy to assume the danger zone was now understood. It wasn't, and the precise reason matters more than the headline:

:::warning
**The survey wasn't wrong about what it tested — it was structurally blind to most of the grid.** It covered only the 25-point diagonal (25 of 125 cells, the ones where garment size matches body build). Of the 4 cells it actually tested and flagged, **1 held up** (`g221`) and 3 were false alarms cleared by the quality bump — a 25% true-positive rate on its own sample. Separately, **11 of the 12 real production failures came from the other 100 cells**, off-diagonal, that this survey had no visibility into at all: `g020`, `g021`, `g031`, `g034`, `g121`, `g124`, `g133`, `g134`, `g234`, `g433`, `g434`. Going into the full run, the reasonable-at-the-time belief — "the diagonal's fixed except `g221`, which we're accepting" — turned out to say almost nothing about where the real trouble actually was. That's a real lesson about what a diagonal-only sample can and can't buy in confidence, worth remembering before proposing the same shortcut for the next garment category.
:::

### The quality bump — CLOTH_QUALITY 22 → 60

The 12mm-margin recipe still left roughly four near-boundary snug-diagonal nodes oscillating at the original substep count (q22). Raising `CLOTH_QUALITY` to 60 globally (not a targeted branch — chosen for simplicity on a one-time unattended bake) and re-testing the same 25-node snug-ease diagonal: **24/25 converged**, fixing `g332`, `g333`, and `g334`. Only `g221` remained.

:::note
The project's own known-issues record states that substeps behaves **non-monotonically** near this stability boundary — `g334` reported as "passed at q50, failed at q55, passed at q60, all reproducible." I looked for the underlying per-quality-level manifest to confirm this directly and could not find one anywhere in the repo — the only `CLOTH_QUALITY` values that actually appear in any committed script or manifest are 22 (the bake default) and 60 (production). This claim is real in the sense that it's a documented engineering finding from the person who ran it, but I can't independently re-verify the q45/q50/q55 sweep from files in this repo — treat it as documented, not re-derived.
:::

### g221 — the accepted, irreducible holdout

:::warning
Both real levers were applied globally — the 12mm margin fix and the CLOTH_QUALITY 60 bump — and `g221` still fails (3.62mm, one retry, 90 frames run). No further lever was swept against it individually. It's accepted as one guard-caught, neighbour-fillable hole rather than chased further, on the reasoning that a fix scoped to one grid cell needs explicit sign-off, the same bar applied to every other regime-specific fix in this pipeline.
:::

![g221's real final rendered state: dark, tangled geometry at the crotch and an open ankle boundary where the simulation never settled](/docs/pants/render-male-g221-failed.jpg)
*This is what "the guard caught it" actually looks like — `g221`'s own real, final `draped_verts`, never fixed, rendered as-is. Compare against the clean converged drape two sections down.*

### The actual 125-point production bake

`phase4_grid_pants.py`, `CLOTH_QUALITY=60`, the locked recipe above. **125/125 completed with zero crashes. 113 converged, 12 caught by the guard.** Real total wall-clock time, summed from every point's own logged duration: **24,502 seconds = 6.81 hours** (avg 196s/point).

![Male 125-point bake: converged vs guard-skipped per body build — failures concentrate entirely in builds 2 and 3](/docs/pants/chart-male-grid-by-build.png)

The 12 failures are not evenly spread — they land entirely in builds 2 and 3, and the pattern is bimodal, not marginal: build 3 has the *best* median residual of any build (0.098mm, versus 0.216mm for the failure-free build 0) while still carrying 7 of the 12 failures. A node either settles cleanly or blows up; there's no gradual degradation.

Fit severity doesn't predict failure either — the 12 span all three fit bands (9 too-small, 1 snug, 2 loose), and the grid's most extreme too-small corner (ease −46cm) converges cleanly while several much gentler too-small nodes don't.

The per-vertex diagnostic (`LOG_PER_VERTEX=1`) on the 6 nodes it was run against shows the same signature every time: the crotch/upper-thigh band is the epicentre, but the blow-up is genuinely global — 80–100% of all vertices exceed 1mm of end-of-run oscillation, not just the crotch region.

![Per-vertex oscillation by region across the 6 diagnosed holes: crotch is consistently worst, but every region moves](/docs/pants/chart-oscillation-signature.png)

**Failure-rate by fit band**, computed directly from the manifest: of the 125 nodes, 50 sit in the too-small band (ease < 0) and 9 of those failed — **18%**, in the same range as the ballpark estimate going in but not an exact match to it. The loose band (75 nodes) failed at roughly 2.7% (2 of 75). Every one of the 12 failures — spanning both bands — is in build 2 or build 3 and nowhere else, which is the strongest single fact this investigation has and the one still without a root cause.

Re-baking 6 of the 12 failures with the exact same recipe reproduced them byte-identically (`np.array_equal` true on all 4,815 vertices, `0.000e+00` max difference) — confirming a same-recipe re-bake is a proven no-op, not a source of noise to chase.

![g020's real final rendered state: the same crotch-tangle signature as g221, on a too-small rather than snug fit](/docs/pants/render-male-g020-failed.jpg)
*`g020` (size 38, build 2, ease −22cm) — one of the 9 too-small-band holes, real final draped state, never fixed. Same failure signature as `g221` despite a completely different fit band, consistent with the finding above that fit severity doesn't predict which nodes fail.*

![g222's real converged final drape: clean, settled folds, no guard trip](/docs/pants/render-male-converged-final.jpg)
*For contrast: `g222` (size 50, build 2, ease +2cm, right next to `g221` in the grid) — real converged output, 0.19mm final window. Same build as both failures above, same general region of the grid, no defect. This is the "either settles cleanly or blows up" bimodality stated in numbers above, shown as two real renders instead.*

### Female grid — a new failure pattern, partially root-caused

125/125 completed with zero crashes. Post-investigation final state: **105 converged cleanly, 6 converged-after-extend, 14 permanent holes** (down from an original 17 — see below). Real total wall-clock: **26,061 seconds = 7.24 hours** (avg 208.5s/point).

![Female 125-point bake by build: builds 0–2 are perfect (75/75), builds 3–4 alone carry all 22 problem nodes](/docs/pants/chart-female-grid-by-build.png)

The failure concentration is sharper than male's: builds 0–2 are perfect (75/75), while builds 3–4 alone carry all 22 originally-problem nodes — a 44% guard-skip rate in exactly the two heaviest builds. Ease is not the discriminator here either (failures span −36cm to +22cm).

**A pattern male's data doesn't show**: every one of the 22 original problem nodes sits at a low/mid height (151/158/165cm) — zero at 172cm or 179cm, despite identical build/size at every height. A build-4/size-38 body fails at 151cm and 158cm but converges cleanly at 172cm and 179cm.

:::tip
**Root-caused, and partially recovered.** `LOG_PER_VERTEX` re-bakes showed the same crotch/upper-thigh epicentre signature as male's holes. The intuitive hypothesis — short bodies have less vertical slack between the waistband pin and the crotch — was tested directly and **contradicted**: measured pin-to-crotch distance is *larger* at short heights, not smaller (49.0cm at 151cm vs. 37.6cm at 179cm, same build). The actual fix targets inner-thigh clearance instead: widening `POSE_HIP_ABDUCTION_RAD` from the male baseline 6.9° to 8.0° for short-height female nodes. **3 of the 6 worst pivot nodes now converge cleanly at 8.0°** (e.g. `gf331`: 13.17mm failed → 0.11mm converged). Build index alone does not predict which nodes recover — `gf141` is the heaviest build and converged fine, while 3 other nodes at 3 different tested angles never did.
:::

Final hole count after re-extraction: **14, not 17.** The `pose_hip_abduction_deg` field is now wired per grid point into `run_pilot_batch.run_one_point`, standard heights getting 6.9° and short heights getting 8.0°, so the fix lives in config, not session notes.

![gf141's real recovered final drape at 8.0deg pose: clean, settled](/docs/pants/render-female-gf141-recovered.jpg)
*`gf141` — one of the 3 recovered pivot nodes, real final state at the widened pose angle. Converged-after-extend, 0.38mm.*

![gf041's real best-attempt final state at 8.0deg: still marked failed, but visually much less dramatic than g221 or g020's tangled crotch](/docs/pants/render-female-gf041-unresolved.jpg)
*`gf041` — one of the 3 permanently-unresolved nodes, real final state at its best tested angle (0.90mm — technically just over the 0.5mm guard threshold, not a dramatic blow-up). Worth noting plainly: "guard-caught" doesn't always look broken. This one reads as a normal, well-fitting drape and still fails the bar.*

### Leave-one-out / leave-cluster-out — what the fill actually costs

Two independent measurements agree with each other. The known-issues record states the male 12-hole fill costs **2.40mm** (isolated hole) to **2.77mm** (clustered hole) median per-vertex error against real neighbour data, versus **4.32mm** between two arbitrary adjacent *converged* nodes for reference. Separately, I re-ran the repo's own off-grid holdout harness (`phase4_holdouts_pants.py`, using the real bakes already sitting in `_pilot_outputs/` — the script itself has since bit-rotted against a later gender-keyed refactor of `phase4_grid_pants.py`, so I recomputed the same math directly rather than patching tracked code) against real interpolated-vs-baked comparisons:

![Off-grid holdout interpolation accuracy: three clean cells average 2.40mm, the most heavily-filled cell costs 3.48mm, about 1.45x](/docs/pants/chart-interpolation-holdout.png)

Three clean cells (0 filled corners) average **2.40mm** mean-per-vertex error — matching the known-issues figure independently. The single worst cell in the entire grid (4 of 8 corners filled, including three Chain-B holes) comes in at **3.48mm**, about **1.45×** the clean baseline. Filled cells do cost more accuracy, but the degradation is real and bounded, not catastrophic.

### Tee+pants combined outfit — moved to its own page

Whether a shopper can try on a tee and pants together turned out to be a question about how the two pipelines interact, not a property of the pants grid — so the full investigation (real measured clipping, the ragged-hem defect and its fix, the 2× push-out optimisation, and what's shipped vs. still not wired into the app) now lives on its own page: **[Combined Outfits: Tee + Pants](/docs/garments/combined-outfits)**.

## Current state

| Area | Status |
|---|---|
| Kinematic fit, both genders | Validated, shipped |
| Male delta library | 113/125 real bakes, 12 holes filled by interpolation (2.40–2.77mm measured cost) |
| Female delta library | 111/125 real bakes (105 converged + 6 extended), 14 holes filled by interpolation |
| Crotch-bridge droop | **Confirmed, unfixed, shipped as-is in both libraries** (145–191mm male, 178mm female) |
| Runtime physics path | Code-complete, both genders — **off by default in production** |
| Retailer dashboard | Fully wired and live |
| Tee+pants layering | Engine-complete, unused by store/widget — full status on [its own page](/docs/garments/combined-outfits) |
| Build-2/3 concentration (male) | Confirmed, root cause unknown |
| Too-small-band 18% failure rate | Newly quantified while writing this — never surveyed in isolation before the full bake |
| Female height-restriction | Root-caused (pose angle), 3 of 17 holes recovered, 3 accepted as permanent |

## User & retailer guide

**This part is real and shipped**, not aspirational. `apps/store/app/lib/tryon-status.ts` defines `CATEGORY_GARMENT_FIELDS.pants = ["garmentWaistCm", "garmentHipCm", "garmentInseamCm", "garmentRiseCm"]` alongside the tee's own four fields, and both the retailer's `tryon-config` route and the widget's product route read from this single map rather than a hardcoded tee-only list — a category is fully configurable through the same dashboard flow the tee already uses, with the same eligibility gate (a garment colour, plus every variant carrying all four measurements).

What's *not* fully live: a configured, eligible pants product will still be served by the **Tier-1 kinematic fit** at request time, not the physics-baked drape, unless `MANIKAN_PANTS_DRAPE=physics` is set somewhere outside this repo's tracked configuration — nothing in this codebase turns it on by default.

## Benchmarks

**A live request-latency benchmark, the way the tee has one, does not exist for pants** — because the runtime physics path ships off by default, there's no production traffic exercising it to measure. What real timing data does exist:

- **Offline bake cost** (not a runtime figure): male 6.81 hours / 125 points (avg 196s/point), female 7.24 hours / 125 points (avg 208.5s/point).

![Total bake wall-clock time: 6.81h male + 7.24h female, real sums of per-point measured durations](/docs/pants/chart-bake-walltime.png)

- **Combined-outfit request breakdown** (male, from the acceptance-test harness, not isolated pants-only): originally measured at pants drape 3,901ms (52% of a 7,325ms combined request), before a 2× push-out optimisation (skip-unmoved-vertex re-querying + a shared collision mesh — see the table above) brought pants drape down to **2,490ms**, dropping the combined total to **~5,460ms**.
- **Interpolation accuracy**: 2.40mm clean / 3.48mm worst-filled-cell (recomputed directly, above).

## Cost Analysis: AWS Deployment

:::warning
**This section models two different questions, and they should not be read as one number.** The one-time bake cost below is a real, direct calculation from measured compute-seconds — not an estimate. The ongoing operating cost that follows it is a genuine estimate: no live traffic has ever run the physics path (it ships off by default), so there is no measured per-request latency to anchor a serving-cost model the way the tee's cost analysis could. What's used instead is real, measured *stage* timing from the combined-outfit acceptance-test harness, adjusted by one clearly-stated, reasonable assumption (see below) — not invented, but not a direct production measurement either. Both are built on the exact same AWS Fargate assumptions already established for the tee, since pants would run in the same container, not a separate service.
:::

### Service choice: the same AWS Fargate task the tee already runs on, not a new service

Pants doesn't need its own AWS service — it's the same `body-service` FastAPI container, the same CPU-only PyTorch build, deployed once. The tee's own cost model already picked Fargate for reasons that apply identically here: the workload is bursty and CPU-bound rather than latency-critical-at-scale, `torch`'s intra-op parallelism already saturates every core on a single request (confirmed for the tee's own load test — concurrency doesn't add throughput, only more instances do), and the service needs to stay warm between requests to avoid reloading the SMPL model, garment templates, and both delta libraries on every cold start. That last point rules out AWS Lambda specifically: Lambda's per-invocation cold-start model fights a service that wants its models resident in memory, and while pants' own per-request time (computed below) is well under Lambda's 15-minute ceiling, the *architecture* — a long-lived process, not a stateless function — was already chosen for the tee and pants doesn't change that calculus. A permanently-reserved EC2 instance is the other real alternative, and is treated as a comparison point below, the same way the tee's own analysis did.

**Practical caveat worth stating plainly**: every dollar figure below assumes a task that's already running and warm. It does not include the cost of keeping at least one task provisioned around the clock so a shopper never eats a cold start — that's a fixed infrastructure cost the tee's own deployment already carries (or will), and enabling pants on the same task doesn't add to it. The numbers below are the *marginal* compute cost of pants requests on top of that already-running task, which is the actually-relevant question for a feature that isn't live yet.

### One-time bake compute cost

Not a per-request serving cost — this is an offline batch job, not live traffic. Combined male+female wall-clock is 24,502s + 26,061s = 50,563s = **14.05 hours**, on the same Fargate task-hour rate:

| | |
|---|---:|
| Total bake time | 14.05 hours |
| Task-hour cost | $0.19744 |
| **One-time bake compute cost** | **≈ $2.77** |

This never repeats unless the grid is re-baked (e.g. to fix the build-2/3 holes or re-carve the crotch-bridge droop) — it's a one-off cost already paid, not an ongoing line item.

### Ongoing operating cost, if the physics path is turned on

**Assumptions, stated explicitly:**

- **Compute:** the same AWS Fargate 4 vCPU / 8GB task as the tee's own model — one container serves both categories.
- **Rate:** the same $0.04048/vCPU-hr + $0.00444/GB-hr = **$0.19744/task-hour** (US East, on-demand Linux x86) already used for the tee.
- **Per-request compute time — the one place this differs from the tee's model.** The tee's own figure (900.6ms) came from a real, direct HTTP benchmark against a live endpoint. No equivalent exists for pants. What does exist: the combined-outfit acceptance harness's real, measured stage times — `solve_betas` (1,400ms) and the optimised `pants_drape` (2,490ms) — but that harness calls `solve_betas` with `num_iters=150`, while the live endpoint's real default (`OPT_ITERATIONS` in `app/config.py`) is **80**. Scaling `solve_betas` linearly to 80 iterations (a reasonable assumption for an iterative gradient-descent loop with fixed per-iteration cost, not a measurement): 1,400ms × (80/150) ≈ **747ms**. Added to the unaffected `pants_drape` figure: **747 + 2,490 ≈ 3,237ms** per pants-only request. The raw, unadjusted harness sum (3,890ms) is shown in the chart's own numbers below for transparency about where the adjustment starts from.
- **Scaling model:** identical reasoning to the tee's own model — cost as compute-seconds actually consumed, horizontal scaling by request volume rather than added concurrency on one task, since the same single-request-saturates-all-cores constraint applies here too.

![Per-request compute time breakdown: tee's full measured request vs pants' estimated solve_betas+pants_drape sum vs a combined request adding tee_drape and seam reconciliation](/docs/pants/chart-per-request-time-breakdown.png)
*Grey = the one adjusted figure in this model (`solve_betas`, scaled from a 150-iteration harness measurement to the real 80-iteration production default). Every other segment is a real, unadjusted measured stage time.*

| Requests / month | tee only (901ms/req) | pants only (3,237ms/req, estimated) | tee+pants combined (4,807ms/req, estimated) |
|---|---:|---:|---:|
| 1,000 | $0.05 | $0.18 | $0.26 |
| 10,000 | $0.49 | $1.78 | $2.64 |
| 100,000 | $4.94 | $17.75 | $26.36 |
| 1,000,000 | $49.39 | $177.51 | $263.62 |

![Estimated monthly compute cost by request volume, log scale, comparing tee-only, pants-only, and combined-outfit requests on the same Fargate task](/docs/pants/chart-operating-cost-by-volume.png)

A pants-only request costs roughly **3.6× a tee-only request** on the same infrastructure — not because pants is inefficient in some new way, but because `solve_betas` plus `pants_drape` alone already add up to more compute time than the tee's entire measured request. Most of that is the pants kinematic fit's own cost, and per the push-out performance investigation above, 92.6% of that was three `resolve_interpenetration` calls before the 2× optimisation — the same profiling work that produced the numbers this whole model is built on.

For reference, the same permanently-reserved `c7i.xlarge` EC2 instance used in the tee's comparison ($0.1785/hr, ≈$128.52/month always-on) crosses over against Fargate at a much lower request volume for pants than for tee, exactly because each pants request costs more: roughly **724,000 requests/month** for pants-only, versus roughly 2.6 million for tee-only. Below that volume, Fargate's pay-per-use model stays cheaper; above it, a reserved instance would.

## Future roadmap

Grounded in what's actually open right now, not a feature wishlist:

- **Root-cause the build-2/3 concentration.** The strongest unexplained fact in this whole investigation: 12 of 12 male failures land in exactly 2 of 5 builds, both interior builds, with both grid extremes failure-free even at the most extreme too-small case tested. No lever (substeps, damping, mass, stiffness, margin, pose) has been swept against these 12 specifically.
- **Decide what to do with the too-small band's 18% failure rate.** Quantified directly while writing this document — it was never surveyed as its own question before the full 125-point bake happened.
- **Root-cause the crotch-bridge droop within the carve pipeline**, and decide whether `crotch_fix_prototype.py`'s runtime correction (real, prototyped, currently oscillates instead of converging) is worth finishing, or whether the fix belongs in Phase 0 authoring instead.
- **Decide whether to turn on `MANIKAN_PANTS_DRAPE=physics` in production.** Until that happens, none of this document's grid work reaches a real shopper, and there's no way to build a real runtime benchmark or cost model to match the tee's.
- **Wire `also_wear` into the store and widget**, and the human 3D eyeball pass on combined-outfit GLBs still outstanding after it — both open items, plus everything else about combining tee and pants, are tracked on [Combined Outfits: Tee + Pants](/docs/garments/combined-outfits) rather than duplicated here.
