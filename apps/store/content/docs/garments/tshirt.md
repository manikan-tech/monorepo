# T-Shirt 3D Try-On Pipeline

How a flat product photo and five body measurements become a physically-draped, millimetre-validated 3D garment — and what it costs to run. Scope: Pipeline 1 (kinematic) + Pipeline 2 (physics-baked drape), male, tee category. Pants is a separate track, at an earlier stage of maturity, documented on its own.

## What this system does

A shopper enters five numbers — height, weight, chest, waist, hips — and, in under a second, receives a 3D avatar of their own body shape. Choose a t-shirt and a size, and that avatar wears it: not a recoloured silhouette, but a separately-authored garment mesh with its own cut, its own drape, and (for the shipped configuration) real cloth-physics folds baked in advance and blended on at runtime. The output is a two-node glTF file — body and garment as distinct meshes — that a browser can rotate and inspect before anyone commits to a size.

The business case is the standard one for 3D try-on in apparel e-commerce: online shoppers cannot touch the fabric or see it move on their own body, and that uncertainty is a large share of why apparel has some of the highest return rates in e-commerce. A garment that visibly, correctly drapes on a body shaped like the shopper's own is a direct answer to "will this actually fit and look right on me." This document does not estimate a return-rate reduction figure — no A/B data exists yet for that claim, and it's left unmeasured rather than guessed at.

Two pipelines exist, at different levels of realism and cost:

- **Pipeline 1** — a real, independently-shaped garment mesh bound to the body surface and deformed with it — correct fit, coverage, and silhouette per body shape and size, but the fold pattern is inherited from the template, not simulated.
- **Pipeline 2** — the same garment, but its drape (folds, sag, bridging across the chest) comes from a real Blender cloth simulation, baked offline across a grid of body shapes and interpolated at request time.

### Where the garment mesh comes from

The two pipelines do not currently share the same answer to this, and it matters commercially, not just technically.

:::warning
**Pipeline 1 still uses a licensed, non-commercial-only donor scan today.** `app/garment.py`'s `GARMENT_DIR` constant points at `models/garments/tshirt_mgn/`, the code's own error message expects "the MGN t-shirt staged" there, and the dataset's `NOTICE.md` (license text) plus a `.gitignore` excluding the actual mesh files are both still present in the repository. The Multi-Garment Network dataset this template is drawn from is licensed for non-commercial research use only. This is a live, currently-true licensing exposure on the kinematic pipeline, not a resolved problem.
:::

:::tip
**Pipeline 2's tee template appears to be independently carved, with no such exposure** — but the one script that would prove it, `extract_relaxed_tee.py`, was never committed to this repository (confirmed via a full search of git history, not just the current tree). What supports the carved-not-scanned reading: Pipeline 2 loads its own separate template (`models/garments/tshirt_physics/template.npz`) that `app/physics_drape.py` never sources from `tshirt_mgn`; nothing in the entire offline bake toolchain (`tools/drape_bake/*.py`) references the MGN donor anywhere; and the sibling script for pants, `extract_relaxed_pants.py`, explicitly documents its technique as "100% carved from the SMPL body — zero external garment geometry" and states it "mirrors `extract_relaxed_tee.py`'s technique." The inference is well-supported but not a citation to a file that exists.
:::

The honest framing: the from-scratch, SMPL-carved approach is the direction this system is moving toward, and appears to have already reached it for the physics pipeline specifically — genuinely zero external license exposure, by design, if the carve is what it appears to be. It has not yet fully displaced the licensed donor on the kinematic pipeline, which is what a female request or a physics-drape failure currently falls back to.

### Current production status

| Configuration | Status |
|---|---|
| Male, Pipeline 2 (physics drape) | Shipped, default path, gated by `MANIKAN_PHYSICS_DRAPE` |
| Male, Pipeline 1 (kinematic) | Shipped — fallback if physics drape fails or is disabled |
| Female, tee | Pipeline 1 (kinematic) only — physics pass not yet authored |
| Legacy vertex-paint (v1) | Retained behind `MANIKAN_DRESSED_ENGINE=v1` as an instant rollback path |
| Tee + pants, worn together | Engine-complete (`app/layering.py`), not yet requested by the store/widget — see [Combined Outfits](/docs/garments/combined-outfits) |

## Architecture

Both pipelines sit behind one FastAPI service (`app/main.py`), gated by an HMAC-compared internal service key (`verify_internal_key`) — the same shared-secret pattern used by every other internal service in this platform. The service runs **CPU-only by design**: `DEVICE = torch.device("cpu")` in `app/config.py`, and `requirements.txt` pins the CPU build of PyTorch explicitly ("keeps the Docker image / Railway deploy small — no CUDA libraries"). The benchmarks and cost model below both depend on this fact.

### Pipeline 1 — the kinematic fitting engine

Implemented in `app/garment.py`:

| Stage | Function | What it does |
|---|---|---|
| Load | `load_garment_template()` | Loads the gender-specific donor mesh; welds it into one connected surface (`_weld_and_clean_mesh`) — the raw scan ships as five disconnected islands that only coincide in space at the shoulder seam. |
| Bind | `bind_garment(verts, ref_body, faces, key)` | Nearest-triangle + barycentric coordinates + signed normal offset, computed once against a fixed β=0 reference body, cached. |
| Deform | `deform_garment(binding, body_verts, faces)` | Re-projects the binding onto the user's solved body: tangential position tracks the new shape, the recorded normal offset re-applies — preserves authored looseness instead of shrink-wrapping. |
| Size | `apply_size_looseness(...)` | Chest-measurement delta drives outward expansion, weighted by SMPL skinning weights, height-tapered, with a proportional hem extension for larger bellies. Raises HTTP 400 `TOO_SMALL` on sizes too small. |
| Smooth | `smooth_garment(verts, faces)` | Laplacian smoothing that pins the topological boundary loops (neckline, hem, cuffs) back to their pre-smoothing positions — an unpinned boundary shrinks and warps asymmetrically under naive smoothing. |
| Push-out | `resolve_interpenetration(verts, body_verts, faces, body_mesh)` | Any garment vertex left inside the body after deformation is snapped back out to a minimum clearance. Independent per-vertex, no neighbour averaging — see the known-issue below for the concave-region consequence. |
| Export | `build_dressed_glb(...)` | Two-node glTF (`body` + `garment` as separate mesh nodes), coloured or textured, scaled to target height. |

This is a **kinematic** method, not a simulation: it solves fit, coverage and silhouette correctly per body and size, but the fold pattern is inherited from the donor scan and does not locally react to the wearer's own curvature.

### Pipeline 2 — the physics-baked drape

The short version: *run a real Blender cloth simulation offline, once, at every point of a body-shape grid; store only the cheap-to-apply difference between the simulated drape and the plain kinematic fit; blend those differences at runtime in milliseconds. No simulation ever runs on a live request.*

**Why baked-and-interpolated beats live simulation:** a real cloth solve takes tens of seconds per body (~49s per bake with the locked recipe — see below) — unacceptable inside a request a shopper is waiting on. But drape changes smoothly as the body changes, and the drape is a small correction on top of an already-good kinematic fit (mean delta 11.6mm across the grid).

**The bake grid.** Two continuous body-shape axes (build, height — 5 levels each) times one discrete axis (catalog size S–XXL, never interpolated — nobody orders a half-size): a **5×5×5 = 125-point grid**. Each point bakes independently with the locked recipe; the full run was 125/125 with zero failures, ~2 hours, one-time, offline. The delta library stores each point's `physics_result − kinematic_fit` as float16, sharing the template's vertex ordering — library size 2.7MB total.

**Runtime path**, in `app/physics_drape.py`, wired via `_dressed_glb_physics()` in `app/main.py`:

1. Solve body shape (SMPL β) from measurements — `solve_betas()`.
2. Pose the body in the **relaxed pose** (shoulders lowered ~37° from A-pose) — the whole avatar renders relaxed for this category, because the baked deltas assume it.
3. Reproduce the exact kinematic fit the deltas were baked against.
4. Map to grid coordinates — size selects an exact slab; build and height become fractional indices.
5. Bilinearly interpolate the delta within that slab and add it.
6. A light interpenetration pass cleans any interpolation-induced skin poke.
7. Assemble the 2-node GLB, textured with the product photo if one resolves.

The path is currently **male-only**, gated by `USE_PHYSICS_DRAPE`, and any failure — or a female request — falls through to the Pipeline 1 kinematic fit, so avatar generation is never blocked.

### The API surface

`POST /generate-dressed-avatar` (`generate_dressed_avatar_mesh_v2`) accepts the body measurements, a garment colour, per-category size fields, an optional product photo URL, and an optional `also_wear` object for a second, simultaneously-worn garment (tee+pants layering, engine-complete per `app/layering.py`). It dispatches to physics drape first where available, falling back to the kinematic path on any failure — the caller never sees which path served the request.

### File map

- **`app/garment.py`** — Pipeline 1: template load/weld, binding, deformation, size looseness, smoothing, push-out, texture prep, GLB assembly.
- **`app/physics_drape.py`** — Pipeline 2 runtime: delta library load, grid-coordinate mapping, bilinear interpolation, drape.
- **`app/layering.py`** — two-garment-at-once reconciliation (`reconcile_seam`, `waistband_height`, `build_layered_glb`).
- **`app/main.py`** — FastAPI app, request schemas, `generate_dressed_avatar_mesh_v2`, internal-key auth.
- **`models/garments/tshirt_mgn/`** — Pipeline 1's licensed donor template + `NOTICE.md`.
- **`models/garments/tshirt_physics/`** — Pipeline 2's clean template, reference body, delta library, grid manifest.
- **`tools/drape_bake/`** — offline authoring & bake tooling.

## Iteration History &amp; Quality Evolution

How this recipe was actually found: **change exactly one variable, hold everything else fixed, and compare the raw, unprocessed physics** — never judge a fix through a smoothing pass that could be hiding the real result. Every finding below is real, measured evidence, with the original renders still on disk in this repository.

### Baseline: kinematic-only, no drape

![Kinematic-only tee, shrink-wrapped to the body, no independent drape](/docs/tshirt/journey-01-kinematic-only.png)
*Pipeline 1 alone: shrink-wrapped to the body — correct fit, zero independent fold or sag. This is the problem Pipeline 2 exists to solve.*

### The false starts, kept in the record on purpose

The first working physics bakes were numerically stable — no blow-ups, no NaNs — and were rejected on sight anyway:

![Raw physics result, dense chaotic wrinkles](/docs/tshirt/journey-02-raw-crumpled.png)
*First working bakes: dense, chaotic wrinkling — described at the time as "a wet, crumpled plastic bag," not accepted as a starting point.*

![Heavily post-smoothed attempt](/docs/tshirt/journey-03-oversmoothed.png)
*The tempting shortcut — smoothing the crumpling away after the fact. Reported at the time as "dramatic improvement." It wasn't: it hides the cause rather than fixing it, and degrades the fabric's real structure.*

That oversmoothing moment is flagged in the project's own record as more consequential than any single technical fix — it's the point "looks better" stopped being an acceptable bar and "prove what's causing it" became the requirement for everything after.

### Isolation tests

**Is the boundary (hem/neckline) the cause?** A resampled boundary compared, raw, against the original — edges got cleaner, crumpling across the body was **identical**. A useful negative result: it ruled out the boundary and moved attention upstream.

![Original boundary, raw physics](/docs/tshirt/journey-04-boundary-original.png)
*Original boundary, raw physics.*

![Resampled boundary, raw physics](/docs/tshirt/journey-05-boundary-resampled.png)
*Resampled boundary, raw physics — crumpling unchanged.*

**Stiffer cloth parameters, tried directly:** produced solver buckling — an accordion effect, worse than the soft case. Ruled out "just make it stiffer."

![Stiff cloth parameters causing buckling](/docs/tshirt/journey-07-stiff-buckling.png)
*Stiff parameters: buckling, not broader folds.*

### The detour: a nicer-looking external asset

A free, CC-BY low-poly tee with a cleaner, boxier silhouette looked like a shortcut. It wasn't: its topology was generic uniform triangulation (not deliberate garment edge loops), it had 22 non-manifold edges, QuadriFlow refused to re-mesh it at every resolution tried even after a full manifold repair, and at full resolution the solver deadlocked with self-collision on. Its only real value was its *silhouette* — which was reproduced on the already clean, already sim-friendly in-house template via the boxify step, without inheriting any of its topology problems.

![Salvaged external tee asset with nicer shape but broken topology](/docs/tshirt/journey-06-external-asset.png)
*The salvaged external asset: nicer silhouette, unusable topology. Dropped — but the isolation-testing habit it forced is credited as unlocking everything after it.*

### The decisive finding: self-collision OFF

Conventional intuition says self-collision (fabric colliding with itself) should be on for realism. For this garment, isolation testing proved the opposite: self-collision **was the cause** of the crumpling, not a safeguard against it.

![Self-collision on: accordion corrugation](/docs/tshirt/pipeline2-selfcollision-on.png)
*Self-collision **ON**: accordion corrugation across the torso.*

![Self-collision off: broad smooth folds](/docs/tshirt/pipeline2-selfcollision-off.png)
*Self-collision **OFF**: broad, smooth, structured folds.*

Not accepted on looks alone — two independent guards ruled out "off" merely hiding overlap:

![Layer-stack raster with self-collision on](/docs/tshirt/pipeline2-layers-on.png)
*Layer count, self-collision ON — red = 4+ overlapping layers (bunching).*

![Layer-stack raster with self-collision off](/docs/tshirt/pipeline2-layers-off.png)
*Layer count, self-collision OFF — clean 1–2 layers. Off produced fewer stacked layers, not more.*

A non-adjacent proximity check (any two topologically-distant vertices closer than 5mm) found essentially zero silent self-intersection with self-collision off, tested specifically on the worst-case body (a slim frame in the largest size). With self-collision on, that same worst case failed to converge and the fabric rode up 11cm.

:::tip
**Real measured impact:** disabling self-collision cut bake time **~180s → ~49s per point — a 3.8× speed-up** that is what made the eventual 125-point grid affordable at all.
:::

![Bar chart comparing bake time with self-collision on vs off](/docs/tshirt/chart-selfcollision.png)
*Self-collision off is simultaneously the correctness fix and the cost fix — not a trade-off between them.*

### Counterintuitive resolution finding, and the locked recipe

A resolution bracket (~3,700 / 5,900 / 8,500 vertices) with everything else fixed found the opposite of the intuitive result: **higher resolution made the crumpling worse** — a finer mesh has more freedom to buckle into tight folds. The coarsest resolution tested (~3,730 verts, "q4000") won on quality *and* cost.

| Parameter | Value | Basis |
|---|---|---|
| Mesh resolution | ~3,730 verts (q4000) | Best quality and cost — higher resolution measurably worsened crumpling |
| Self-collision | **OFF** | Removes crumpling; 3.8× faster bake |
| Pose | Relaxed (tee only) | A-pose jams fabric into the armpit before physics starts |
| Boxify strength | 0.65 | Modern structured cut without reading stiff (swept 0.45/0.65/0.85) |
| Hem | Boundary-resampled | Cleans the zigzag left by flat-height region extraction |
| Cloth model | Heavy structured cotton | Broad folds, matches target look |

![Jagged hem before boundary resample](/docs/tshirt/pipeline2-hem-before.png)
*Hem before resample: zigzag from flat-height cut.*

![Clean hem after boundary resample](/docs/tshirt/pipeline2-hem-after.png)
*Hem after `resample_boundary()`: clean line, same vertex count/correspondence.*

### Interpolation accuracy: the load-bearing validation

Does blending the delta from surrounding grid points reproduce a real bake at a body *between* grid points? Held-out bodies at off-grid fractional build/height were baked for real and compared to the interpolated prediction, which was never simulated:

| Holdout | Size slab | Kinematic-only error | Interpolated error | Drape captured |
|---|---|---|---|---|
| f_M | M | 10.0mm | **0.7mm** | 93% |
| f_XL | XL | 12.5mm | **2.6mm** | 80% |
| f_XXL | XXL (largest excess) | 15.3mm | **2.1mm** | 86% |

![Bar chart comparing kinematic-only error to interpolated error](/docs/tshirt/chart-interpolation.png)
*These are the same 0.7–2.6mm figures already validated for this pipeline, not re-derived.*

![XXL holdout, actual real bake](/docs/tshirt/pipeline2-xxl-actual.png)
*XXL holdout — actual bake (real simulation).*

![XXL holdout, interpolated prediction, never simulated](/docs/tshirt/pipeline2-xxl-predicted.png)
*XXL holdout — interpolated prediction, never simulated.*

![Per-vertex error heatmap on the XXL holdout](/docs/tshirt/pipeline2-xxl-heatmap.png)
*Where the residual error lives: the structured upper body is near-perfect; the worst spot is a single clustered fold, ~0.7% of vertices within an 8mm patch — benign fold nonlinearity, not a systematic modelling failure.*

A separate densification test confirmed the interpretation directly rather than by assumption: doubling grid density around a loose holdout cut mean error 2.9→1.8mm and max error 26→14mm — the residual shrinks with sampling, which is why the production grid is 5×5 rather than 3×3.

![Real endpoint output, physics-draped GLB](/docs/tshirt/pipeline2-runtime-output.png)
*A real call to the live endpoint, physics path.*

### A live known issue, stated plainly

:::warning
**Push-out terracing at the armpit — confirmed, live in production, not yet fixed.** `resolve_interpenetration()` snaps each offending vertex independently to its own nearest body point, with zero averaging against neighbours. In a concave region — the armpit is the tee's own analogue of the pants crotch — vertices right at the push/no-push boundary land at visibly different depths than their neighbours, reading as fine ridges. This is a real, live product defect: the first image below is what a customer with this body/size combination sees today.
:::

![Current live output showing pushout terracing](/docs/tshirt/known-issue-terrace-current.png)
*Current live output — visible ridges under the arm.*

![Kinematic-only with an extra smoothing pass, proving the diagnosis](/docs/tshirt/known-issue-terrace-fixed.png)
*Kinematic-only + 1 extra smooth pass (diagnosis proof) — ridge gone.*

![Runtime patch applied on top of the existing baked delta](/docs/tshirt/known-issue-terrace-patch.png)
*Runtime-only patch + existing baked delta — improved (mean shift ~3.5mm), not fully clean.*

Two fix options exist, neither started (see Roadmap): a cheap runtime-only patch that measurably helps but doesn't fully clean the ridge, since the delta library was baked against the old un-fixed baseline; or a full re-bake of the 125-point grid from a corrected kinematic pipeline, which is the clean fix but a real ~2-hour, real-risk change to a shipped asset.

:::note
**A methodological caveat worth carrying forward.** The renders above were produced by a hand-rolled flat-shaded rasterizer later found to *exaggerate* this exact class of concave-region artifact (built early in the project after live Blender/EEVEE rendering hit black-screen issues). Re-checked with a proper smooth-shaded Cycles render on the pants equivalent of this bug: the fix is a real, visible improvement under reliable rendering too — the underlying mechanism holds — but the severity shown above is likely overstated. Anything in this project judged only through that rasterizer should be read as directionally suggestive, not settled.
:::

## User &amp; Retailer Guide

Grounded in the Store application's own retailer API, verified against the live code at `apps/store/app/api/retailer/products/[id]/tryon-config/route.ts` and `apps/store/app/lib/tryon-status.ts`.

### What a retailer supplies

Try-on eligibility (`isProductTryOnEnabled`) requires two things on a product, checked together:

1. A garment colour — `Product.garmentColorHex`, a hex string.
2. Every one of that category's flat garment measurements, on **every** variant (size) of the product. For a tee: `garmentChestCm`, `garmentLengthCm`, `garmentSleeveCm`, `garmentShoulderCm` — the exact field list a category needs lives in one place, `CATEGORY_GARMENT_FIELDS`, so the fitting engine and the dashboard can never quietly disagree about what a category requires.

These are set through `PUT /api/retailer/products/[id]/tryon-config`, a session-authenticated, tenant-isolated dashboard endpoint: it validates the colour format, checks every variant supplies a positive number for every required field, and commits the colour plus all variant updates in one atomic transaction — a product is never left half-configured. A product missing any required field for its category simply reports `isTryOnEnabled: false`.

### What a shopper experiences

The storefront's try-on widget collects the shopper's five measurements (or a saved 3D avatar), and calls the Store's own proxy — never body-service directly. The proxy resolves the product's stored garment colour and measurements from Postgres, attaches the internal service key, and forwards to `POST /generate-dressed-avatar`. The response streams back as a GLB the storefront's 3D viewer renders directly. A missing or unresolvable product photo falls back to a flat colour fill — texturing is a visual enhancement, never a reason avatar generation should fail.

## Benchmarks

:::note
**Test conditions, stated in full.** Local development machine, Intel Core i7-8850H (6 physical / 12 logical cores), 30GB RAM. body-service run via `uvicorn`, single worker process, default `run_in_executor` thread offload, CPU-only PyTorch (`torch 2.13.0+cpu`). Requests sent over localhost — network latency is not a factor. Male tee, physics-drape path, identical payload for every request. All figures are from requests actually made against the live, running service, not documentation or estimation.
:::

### Latency

15 sequential requests, single connection, no concurrency:

![Bar chart of latency per sequential request](/docs/tshirt/chart-latency.png)
*Request 1 (832.7ms) landed in line with the rest — the true cold-start cost (a separate first call moments earlier took 3.04s) had already been paid by the process before this sequence started.*

| Metric | Value (n=14, warm) |
|---|---|
| Mean | 900.6ms |
| Median (p50) | 913.5ms |
| p95 | 973.3ms |
| Min / Max | 823.7ms / 973.3ms |
| Std. deviation | 49.4ms |

For comparison, the physics-drape design doc estimates a total of "milliseconds [for the drape step itself], dominated by SMPL fit, ~1.4s total." The measured mean here (900.6ms) is lower than that documented estimate — consistent in order of magnitude, faster on this specific hardware, not a regression.

### Load test: a genuinely important negative result

Concurrency levels 1/2/4/8, 3 requests per concurrent worker, real HTTP requests against the live service:

![Chart showing throughput staying flat while latency rises with concurrency](/docs/tshirt/chart-concurrency.png)
*Throughput does not scale with added concurrency on this service, on this hardware. Zero errors at every level tested.*

| Concurrency | Requests | Wall time | Throughput | Mean latency | Errors |
|---|---|---|---|---|---|
| 1 | 3 | 2.51s | 1.19 req/s | 836.6ms | 0/3 |
| 2 | 6 | 5.17s | 1.16 req/s | 1,680.7ms | 0/6 |
| 4 | 12 | 8.50s | 1.41 req/s | 2,826.5ms | 0/12 |
| 8 | 24 | 21.15s | 1.13 req/s | 6,976.3ms | 0/24 |

:::tip
**Root cause, verified, not assumed.** `torch.get_num_threads()` reports **6** on this machine — PyTorch's own intra-op parallelism already claims all 6 physical cores *within a single request*. Concurrent requests compete for that same fixed pool rather than finding free parallelism, so added concurrency produces contention instead of throughput. Confirmed by checking the actual thread configuration against the actual core count, not inferred from the throughput numbers alone.
:::

The practical consequence, carried into the cost model below: capacity on this service scales by running **more instances**, each handling roughly one request at a time, not by raising concurrency on one instance.

### Accuracy

Reused from the iteration history above, not re-derived: interpolated drape holdout error of **0.7–2.6mm** against a real bake at the exact same body shape.

## Cost Analysis: AWS Deployment

:::warning
**This is a cost model, explicitly, not a production estimate.** Built from measured latency and AWS's published on-demand rates, verified by search rather than recalled from memory. It assumes steady, evenly-distributed request arrival with no idle capacity and no burst concentration — real traffic isn't that smooth, so treat this as a compute-cost floor, not a capacity plan.
:::

**Assumptions, stated explicitly:**

- **Compute:** AWS Fargate, a 4 vCPU / 8GB task — sized to match this machine's 6-core assumption; a real deployment should re-benchmark against its actual chosen vCPU count, since torch auto-detects and uses whatever core count the instance reports.
- **Rate:** $0.04048 / vCPU-hour, $0.00444 / GB-hour, US East (N. Virginia), on-demand Linux x86 — verified via search against current published Fargate pricing.
- **Per-request compute time:** 900.6ms — this session's own measured warm mean, not an estimate.
- **Scaling model:** given the load-test finding above, cost is modelled as compute-seconds actually consumed — horizontal scaling by request volume, not added concurrency headroom on one task.

| Component | Rate |
|---|---|
| 4 vCPU × $0.04048/vCPU-hr | $0.16192/hr |
| 8 GB × $0.00444/GB-hr | $0.03552/hr |
| **Task-hour cost** | **$0.19744/hr** |

### Estimated monthly compute cost by request volume

![Bar chart, log scale, of estimated monthly cost across four request-volume scale points](/docs/tshirt/chart-cost.png)
*cost = (requests × 0.9006s ÷ 3600) × $0.19744/task-hr*

| Requests / month | Compute-seconds | Task-hours | Estimated cost |
|---|---|---|---|
| 1,000 | 900.6 | 0.250 | $0.05 |
| 10,000 | 9,006 | 2.502 | $0.49 |
| 100,000 | 90,060 | 25.02 | $4.94 |
| 1,000,000 | 900,600 | 250.2 | $49.39 |

For reference, a permanently-reserved `c7i.xlarge` EC2 instance (4 vCPU, on-demand, us-east-1) runs a flat $0.1785/hr regardless of traffic — roughly $128.52/month always-on ($0.1785 × 24 × 30). Below roughly **2.6 million requests/month** at this measured per-request cost ($128.52 ÷ $0.00004939 per-request cost), the pay-for-what-you-use Fargate model is cheaper than one always-on reserved instance; above that crossover, a reserved instance becomes the better default. At sub-second, cheap-per-request compute like this, that crossover sits far higher than intuition suggests — worth stating precisely rather than rounding loosely, since an earlier pass through this same math put it at ~650k, which the table two lines up already contradicts (1M requests/month costs $49.39 here, nowhere near the $128.52 reserved rate, so 650k was never a real crossover).

## Future Roadmap

Every item below is drawn directly from open, documented work in this repository — not a speculative feature list.

**Near-term:**

- **Fix the push-out terracing defect.** Two scoped options, neither started: a cheap runtime-only smoothing patch (confirmed to help, not fully clean the ridge), or a full re-bake of the 125-point grid from a corrected kinematic baseline. The runtime patch needs validation across a representative spread of grid points before it's a viable candidate, since it changes what every grid point's delta is being added to, not just the worst case it was tested on.
- **Female tee, physics pass.** A sanity bake using the exact locked male recipe drapes cleanly on the torso but bunches at the sleeve cuffs — the sleeve opening was shaped to male shoulder/arm proportions. Needs its own tuning pass and its own 125-point grid.
- **Sleeve refinement.** Across both genders, the sleeve is the template's weakest region visually — the clearest remaining "this is CG" tell and the natural next polish item.
- **Wire tee+pants layering into the store/widget.** The engine already supports it end-to-end (verified over real HTTP: pants+tee returns a 3-node GLB with zero clipping) — nothing currently requests it. Full investigation: [Combined Outfits: Tee + Pants](/docs/garments/combined-outfits).

**Underway, documented separately:** pants is the most active track right now, with its own detailed documentation. In brief: the male 125-point grid shipped with 12 documented interpolation holes (fill cost 2.40–2.77mm); the female grid found and partially root-caused a pose-angle issue specific to short-height bodies; the crotch-bridge droop defect is confirmed and accepted as known. None of this blocks the tee pipeline this document covers.

**Replace the licensed template on Pipeline 1.** Committing an actual, verifiable from-scratch authoring script for the tee — mirroring `extract_relaxed_pants.py`'s already-proven, zero-external-geometry technique — removes the last live license exposure in this pipeline and makes this document's licensing claim fully provable rather than well-evidenced.

**Longer-term, not yet scoped:** further latency optimisation and multi-region deployment are reasonable eventual directions given the benchmarks above, but no specific plan exists in this codebase today.
