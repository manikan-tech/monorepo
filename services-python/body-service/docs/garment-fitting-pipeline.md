# Garment Fitting Pipeline: From Painted Skin to a Real Garment Mesh

This document explains the garment try-on system added on top of the SMPL avatar
engine described in [`technical-overview.md`](technical-overview.md). It covers
why the original approach was replaced, how the new pipeline works end to end,
every deliberate design decision, and the concrete bugs that were found and
fixed along the way.

## The problem with the original approach

The first version of the dressed avatar worked by **classifying and recolouring
the body's own vertices**: SMPL's linear-blend-skinning weights were used to
guess which body vertices belonged to the torso/arms, those vertices were
nudged outward along their normals, and painted with the garment's colour.

This is a reasonable trick for a quick vertex-paint effect, but it has a hard
ceiling: the "garment" has no shape of its own. It is always, by construction,
the body wearing a slightly-offset skin. Sleeves are exactly as wide as the
arm underneath them, hems don't have their own silhouette, and there is no way
to represent a garment cut (boxy vs. fitted, oversized vs. slim) independent of
the body shape. The visual result reads as a "rigid shield" rather than
clothing.

## The approach: a real, independently-authored garment mesh

The replacement (`backend/garment.py`) is built around a genuinely separate
garment mesh that is **bound** to the body surface rather than carved out of
it. The core idea, borrowed from the SMPL+D / garment-registration literature:

1. **Bind** each garment vertex to the nearest point on a reference body
   (nearest triangle + barycentric coordinates + signed distance along the
   surface normal). This is computed once, against a fixed β=0 reference body,
   and cached.
2. **Deform**: re-project that binding onto the *user's* solved body. The
   garment vertex's tangential position (which triangle, where within it)
   tracks the new body's actual shape, while the recorded normal offset is
   re-applied, preserving the garment's authored looseness instead of
   shrink-wrapping it onto the skin.
3. **Push-out**: any garment vertex that ends up inside the body after
   deformation is pushed back out to a minimum clearance, guaranteeing zero
   interpenetration regardless of body shape.
4. **Export** a two-node glTF scene (`body` + `garment` as separate mesh
   nodes, not merged), coloured or textured, scaled to the target height.

This means the garment now has its own vertex count, its own topology, its own
silhouette — it is a real mesh sitting on the body, not a recoloured patch of
the body itself.

### Where the garment mesh comes from

There is no in-house 3D garment asset pipeline yet, so the base template is
sourced from the **Multi-Garment Network (MGN) "Digital Wardrobe" dataset**
(Bhatnagar et al., ICCV 2019) — a set of real garments 3D-scanned and
registered to the SMPL body topology. Two donor scans are used as templates,
one per gender (see *Gender-specific templates* below).

**License note:** the MGN dataset is distributed for **non-commercial research
use only**. The actual mesh/scan files are intentionally **excluded from this
repository** via `.gitignore` inside `backend/models/garments/tshirt_mgn/` —
only a `NOTICE.md` (provenance/license text) and `template_meta.json`
(non-sensitive metadata) are tracked. Before any commercial use, these donor
meshes must be replaced with an independently authored or properly licensed
garment asset. See `backend/models/garments/tshirt_mgn/NOTICE.md` for the
full license text and exact source.

## Gender-specific templates

Because the donor scans carry the *scanned person's* body shape into the
garment mesh (a female donor's tee has a bust shape baked into its geometry;
that's not something later processing can undo), a single template can't
serve both sexes convincingly. `garment.py` therefore selects a different
donor mesh depending on the requested gender:

- **Male** → a donor scan with a flat, structured chest.
- **Female** → a donor scan with a fitted silhouette.

Both were chosen by direct visual comparison across multiple donor
candidates on real generated bodies, not by a single metric — several
geometric proxies for "does this read as male/female" were tried and none
reliably matched human perception, so the final choice was made by eye.

## A mesh-quality bug hiding in the source data

The raw MGN garment mesh turned out to be **five disconnected pieces**
(main torso + two sleeves + two small scan-debris fragments) that only
happen to sit at the same position at the shoulder seam — they don't share
vertex indices there. This was invisible for static rendering, but became a
real problem once any per-vertex operation (smoothing, in particular) started
moving each island independently: the seam visibly tore open.

The fix, applied once at template load time
(`_weld_and_clean_mesh` in `garment.py`): a radius-based vertex weld
(union-find over a KD-tree neighbour query, not the coarser digit-quantized
merge that ships with `trimesh`, which misses near-coincident vertices that
straddle a rounding boundary) fuses the mesh into one connected surface, and
any leftover tiny disconnected fragment is dropped. Verified: 5 islands → 1
connected component, boundary edge count drops from 670 to a sane 228 (which
is exactly what four real garment openings — neckline, hem, two cuffs — should
produce).

## Size differentiation

Garment size (S–XXL) changes the *fit*, not just a label. The chosen size's
chest measurement is compared against the wearer's own chest measurement; the
difference drives a physically-motivated outward expansion of the garment:

- Expansion is weighted by **SMPL's own skinning weights** restricted to the
  torso joints, so the chest/belly loosen while the collar and cuffs stay put.
- A **height taper** (peaks mid-torso, fades at the shoulder and hem) avoids
  the garment inflating like a uniform balloon — a real loose shirt drapes
  more in the middle than it does at the seams.
- A small **downward droop** is added proportional to looseness, so extra
  fabric reads as "hanging" rather than only "puffing outward".
- If the body's belly protrudes further than the reference body's did at bind
  time, the **hem is extended downward** proportionally so it keeps covering
  the body instead of visibly riding up on a larger frame.
- Sizes far too small for the body raise a `TOO_SMALL` error (surfaced to the
  API as HTTP 400) rather than producing a degenerate result.

## Smoothing, and a second mesh-topology bug it exposed

The raw scan mesh has a visibly faceted, low-poly look, amplified by the size
expansion above. A Laplacian smoothing pass (`smooth_garment`,
`trimesh.smoothing.filter_laplacian`) softens this.

Naive Laplacian smoothing, however, has no concept of an open mesh boundary:
it pulls every vertex toward its neighbours' average, but a boundary vertex
(the neckline rim, hem, cuffs) only *has* neighbours on one side — there's no
fabric past the edge. That asymmetry made open loops shrink and warp
unevenly across iterations, most visibly as an irregular, gapped neckline.

The fix: `smooth_garment` now identifies the true topological boundary (every
edge that belongs to exactly one triangle) before smoothing, and pins those
vertices back to their pre-smoothing positions afterward. Verified directly:
boundary-loop displacement from smoothing is now exactly 0.0000 mm, while the
interior surface is still fully smoothed (several millimetres of movement,
which is the effect we want).

## The remaining neckline artefact, and why it's a rendering fix, not a mesh fix

Even after the boundary-pinning fix, a small gap remained visible at the
collar in some views. Measuring the collar ring's shape at every pipeline
stage (right after binding, after size adjustment, after smoothing, after the
push-out pass) showed it was **already irregular at the very first stage,
unchanged by anything downstream** — the ring is not a clean circle, varying
between roughly 49 mm and 114 mm in radius from its own centre. Combined with
there being zero missing triangles and zero degenerate triangles anywhere in
the mesh (confirmed directly), this points to a subtle self-fold in the
source scan's collar region: a fully closed surface that folds back on
itself very slightly.

A closed-but-folded surface only becomes a visible problem because the
garment material was rendered single-sided: wherever a thin mesh folds on
itself, the camera can end up looking at a back face, and a single-sided
material simply doesn't draw those, letting the transparent canvas behind the
model show through as a dark gap. The fix was on the frontend, not the mesh:
the garment material is now rendered **double-sided**
(`side: THREE.DoubleSide` in `TryOnViewer.jsx`), which is standard practice
for thin garment geometry for exactly this reason.

## Texture (product photos on the garment)

Flat vertex colour was replaced with the actual product photo wherever
possible.

- **UV mapping**: a simple planar front-projection (`u` from X, `v` from Y,
  each normalised to the garment's own bounding box) is computed once per
  template. This is deliberately not a full UV unwrap — the product photos
  are flat-lay, front-facing, roughly-symmetric shirt shots, so a bounding-box
  projection aligns collar-to-top / hem-to-bottom / sleeve-to-sleeve well
  enough without needing per-garment unwrapping. `v` is stored inverted to
  match glTF's V=0-at-top convention, so any standard viewer (including the
  frontend's Three.js renderer) samples it correctly with no special-casing.
- **Content detection**: product photos have background margin around the
  garment (a mottled/textured backdrop, not a flat colour), so the raw photo
  can't be used directly — its background would bleed onto the mesh wherever
  the UV samples near the image edges. Each product's own catalogue colour
  (already stored per SKU) is used as a colour prior: a pixel is classified as
  garment if it's closer to the known fabric colour than to the photo's own
  border-sampled background colour, with a minimum-distance guard (so a
  lighter patch of background isn't misread as much-paler fabric) and
  morphological cleanup. Only the largest connected foreground region is kept.
  A sanity check (a real garment is never flush against a photo's corner in
  this composition style) detects when a photo's fabric and backdrop are too
  close in colour to separate reliably (e.g. a heather-grey tee on a grey
  backdrop) and falls back to a fixed safe crop instead of guessing wrong.
- **Background inpainting**: because the garment mesh is not a perfect
  rectangle (a T-shape, essentially) while the crop is, some background
  necessarily remains inside any rectangular crop wherever the garment is
  narrower than its own widest point. Rather than chase pixel-perfect
  alignment, every background pixel is replaced with its nearest fabric
  pixel's colour and lightly blurred (fabric pixels themselves stay sharp).
  Any UV sample that lands slightly outside the true silhouette now reads as
  soft, plausible fabric colour instead of raw backdrop.
- **Graceful fallback everywhere**: a missing `product_id`, an unknown
  product, a missing photo file, or a decode error all fall back silently to
  the flat colour fill. Texturing is a visual enhancement; it is never a
  reason avatar generation should fail. Prepared textures are cached per
  product for the life of the server process, since a product's photo never
  changes between requests.

## Idle jiggle (frontend-only polish)

A small amount of idle motion is added purely on the frontend
(`TryOnViewer.jsx`), with **no backend changes and no effect on fit**:
garment vertices near the hem sway gently, weighted by height so the effect
fades to zero at the shoulder/collar (computed from the loaded mesh's own
bounding box at render time — no extra data needed from the backend). Vertex
normals are recomputed every frame after the position update, since lighting
computed against stale rest-pose normals for displaced geometry produces
visibly wrong shading, most noticeably at high-curvature areas like the
collar.

## API changes

`POST /generate-dressed-avatar` gained one new optional field, `product_id`.
When present and resolvable to a catalogue photo, the response is textured;
otherwise behaviour is identical to before. No existing field changed
meaning, and the response is still a binary glTF (`.glb`).

The legacy vertex-paint implementation was kept in place (not deleted) behind
an environment variable, `MANIKAN_DRESSED_ENGINE=v1`, purely as an instant
rollback path.

## What this pipeline does not do (by design)

This is a **kinematic** fitting method, not a cloth simulation. It correctly
solves fit, coverage, and silhouette per body shape and per size, but the
garment's fold/wrinkle *pattern* itself is inherited from the donor scan and
does not locally react to the specific wearer's body curvature — real cloth
folds are a physics outcome, and a kinematic binding cannot produce that.
Getting garments that visibly drape and fold differently per body would
require an actual simulated-cloth step (e.g. a small offline-baked library of
simulated drapes blended at request time), which is a materially larger
undertaking and out of scope for this pass.

## File map

| File | What it contains |
|---|---|
| `backend/garment.py` | The whole Tier-1 fitting pipeline: template loading, seam welding, binding, deformation, size looseness, smoothing, push-out, texture preparation, GLB assembly. |
| `backend/main.py` | `generate_dressed_avatar_mesh_v2` (new pipeline entry point), `_load_product_texture` (cached, fallback-safe photo loading), the `product_id` field on the request payload, and the `MANIKAN_DRESSED_ENGINE` rollback flag. |
| `backend/models/garments/tshirt_mgn/` | Garment template metadata and license notice. The actual mesh/scan files are git-ignored — see the License note above. |
| `frontend/src/components/TryOnViewer.jsx` | Renders the two-node (body + garment) glTF scene: material selection (texture vs. flat colour vs. skin), double-sided garment rendering, and the idle jiggle. |
| `frontend/src/components/ManikanWidget.jsx` | Sends `product_id` alongside the existing measurement/size payload. |

## Requirements added

- `rtree` — spatial index required by `trimesh.proximity` for surface binding.
- `Pillow` — texture image loading/decoding.

Both are declared in `backend/requirements.txt`.
