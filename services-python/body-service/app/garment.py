"""
Manikan Garment Engine — Pipeline 1 / Tier 1  (Structural garment fit)
======================================================================
Replaces the old "vertex-classify-and-paint" shrink-wrap with a **real,
independently-authored garment mesh** (an MGN t-shirt template) that is fitted
to a solved SMPL body via surface binding, then exported as a 2-node
(body + garment) GLB.

Method (A-pose only, no cloth physics):
    1. Load the garment template (MGN `TShirtNoCoat`, canonical SMPL frame).
    2. Bind each garment vertex to the *reference* body (gendered β=0, pose=0):
       nearest body triangle + barycentric coords + signed normal offset.
       Computed once per gender and cached.
    3. Re-project the binding onto the *user's* solved-β body (same topology as
       the reference), preserving the authored offset so the garment keeps its
       looseness and follows the body's shape.
    4. Push out any garment vertex that ends up inside the body (collision guard).
    5. Assemble a 2-node trimesh.Scene (node "body" + node "garment"), colour the
       garment, uniformly scale both to the exact target height, export GLB bytes.

Why bind-to-reference + re-project (not bind-directly-to-user-body):
    The garment was authored around a near-mean body. Binding to a fixed β=0
    reference and re-projecting preserves the authored gap between cloth and skin
    (the loose fit); binding straight to the user body would shrink-wrap the cloth
    onto the skin and lose that. This mirrors MGN/SMPL+D's `retarget` philosophy.

Notes:
    • The MGN template is neutral-model; Manikan uses gendered SMPL. We bind to our
      own gendered β=0 body (a few-cm mismatch, absorbed by the push-out pass).
    • Everything is done in SMPL native scale; the body+garment are height-scaled
      together at the very end so the fit is preserved.
"""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
import torch
import trimesh
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree
from trimesh import graph as trimesh_graph

logger = logging.getLogger("manikan.garment")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# garment.py lives in app/, while models/ sits at the service root (a sibling
# of app/, matching config.py's SERVICE_ROOT = parent.parent) — hence the
# extra .parent versus the source repo's flat backend/ layout.
GARMENT_DIR = Path(__file__).resolve().parent.parent / "models" / "garments" / "tshirt_mgn"

# Gender-specific garment templates. The MGN donor scans carry the wearer's body
# shape (incl. sex characteristics) into the garment mesh, so a female-donor tee
# renders a bust on a male body. We therefore use a male-donor tee for men and a
# female-donor tee for women, keyed on the requested gender.
TEMPLATE_OBJ = {
    "male": "tshirt_male.obj",         # MGN subject 125611520702831 (flat/male chest)
    "female": "tshirt_crew_base.obj",  # MGN subject_058 (fitted/female chest)
}
_DEFAULT_TEMPLATE = "tshirt_crew_base.obj"

PUSHOUT_MARGIN_M: float = 0.004   # keep garment ≥4 mm off the skin during push-out
PUSHOUT_ITERS: int = 3            # collision-resolution iterations

# Size looseness (Phase 3, refined). Base formula/constants inherited from the
# legacy vertex-paint pipeline, now applied to the real garment mesh with two
# additions that avoid a uniform "balloon" inflation: a height taper (peaks
# mid-torso, fades at shoulder/hem) and a downward droop for loose sizes (extra
# fabric hangs rather than only puffing outward).
LOOSENESS_DAMPING: float = 0.6      # real fabric doesn't billow to the full theoretical slack
TOO_SMALL_DIFF_CM: float = -25.0    # reject garments this much smaller than the body
DROOP_FACTOR: float = 1.4           # extra downward sag applied to loosened fabric
# SMPL joints treated as "torso" for expansion weighting: Pelvis, Spine1-3.
# Keeping this to the torso (not shoulders/arms/neck) prevents the collar and
# sleeves from ballooning when a loose size is chosen.
TORSO_JOINT_IDS = [0, 3, 6, 9]

# Hem coverage: how much to extend the hem downward (in metres) per metre of
# extra belly protrusion vs. the reference body, so a much larger belly doesn't
# make the hem visually ride up and stop covering the torso.
HEM_EXTEND_FACTOR: float = 1.8
HEM_BAND_FRACTION: float = 0.35     # fraction of garment height (from hem) affected
# Front is +Z in this pipeline's SMPL export convention (verified empirically:
# belly-button vertex 3501 has greater Z than back vertex 3022 on the β=0 body).
FRONT_SIGN: float = 1.0

# Post-deformation smoothing: softens the raw MGN scan mesh's faceted look
# (and the extra unevenness introduced by size-based expansion) without
# erasing the garment's overall silhouette.
SMOOTH_ITERATIONS: int = 3
SMOOTH_LAMBDA: float = 0.4

# Seam welding at template load time. The raw MGN donor mesh's sleeves and
# torso are separate mesh islands that only *touch* at the armhole (no shared
# vertex indices) -- fine for a static render, but Laplacian smoothing moves
# each island's vertices independently, tearing the seam open into a visible
# "cut". Welding vertices that are already ~coincident makes the mesh one
# connected surface so smoothing (and vertex normals generally) are seamless.
SEAM_WELD_TOL_M: float = 0.001      # 1mm: enough to close the real seam gap,
                                     # tight enough not to fuse unrelated geometry
MIN_COMPONENT_FACES: int = 50       # drop any leftover scan-debris fragments

# ---------------------------------------------------------------------------
# Caches (module-level; populated lazily like main._smpl_models)
# ---------------------------------------------------------------------------
_template_cache: Dict[str, dict] = {}          # gender -> template dict
_ref_body_cache: Dict[str, np.ndarray] = {}   # gender -> β=0 body verts (native scale)
_binding_cache: Dict[str, dict] = {}          # gender -> binding dict


# ── Flat-lay garment texturing (segmentation + albedo recolour) ─────────────
# Product photos are flat-lay, front-facing, solid-colour shirts on a roughly
# uniform backdrop, and the catalogue gives us the authoritative fabric hex.
# We exploit both: segment the shirt robustly, then bake an albedo that trusts
# the known colour and keeps only the photo's fold/weave *shading*.
TEXTURE_CROP_MARGINS = (0.07, 0.07, 0.93, 0.92)  # last-resort fixed crop (unused unless re-enabled)
BG_FRAME_FRACTION = 0.03         # width of the border frame sampled for the backdrop colour
BG_SPREAD_MULT = 6.0             # background-likeness tolerance = this * backdrop scatter
CONTENT_DETECT_MIN_BG_DIST = 18.0  # floor on that tolerance (px colour distance)
SEG_CLEAN_ITERS = 2              # morphological close/open passes on the mask
SEG_MIN_FABRIC_FRAC = 0.05       # implausibly little foreground -> bail to flat fill
SEG_MAX_FABRIC_FRAC = 0.985      # (near-)whole frame is foreground -> no backdrop found -> bail

# Detail-preserving recolour: anchor the garment's BASE colour to the catalogue
# hex, letting the photo only modulate shading around it. Clamps stop shadows
# from crushing to black or highlights from blowing out the true hue.
SHADE_MIN = 0.60                 # darkest a fold may go, relative to base colour
SHADE_MAX = 1.28                 # brightest a highlight may go
SHADE_DENOISE_SIGMA = 1.2        # light blur of the shading map (kills JPEG grain/noise)

# Planar-UV safety inset: pull the UV a hair inside [0,1] so the extreme
# silhouette edges never sample the very texel border.
UV_INSET = 0.015


def _segment_fabric(image: Image.Image, fabric_hex: str):
    """
    Segment the garment from a flat-lay product photo, robustly even when fabric
    and backdrop are close in tone -- dark navy on charcoal, black on black --
    the exact cases the old per-pixel nearest-colour classifier failed on,
    leaking backdrop onto the sleeves.

    Two cues, combined:
      1. Backdrop model  -- median colour of a thin border frame + its scatter.
      2. Fabric prior    -- the catalogue hex.
    A pixel counts as background only if it is backdrop-like AND closer to the
    backdrop than to the fabric AND reachable from the image border through
    other backdrop-like pixels (a magic-wand flood fill from the frame). That
    connectivity requirement is what rescues dark-on-dark: a shirt's interior
    may resemble the backdrop in isolation, but it is walled off from the border
    by fabric, so it stays foreground. Everything not background is fabric; the
    largest filled blob is kept.

    Returns a bool mask (True = fabric), or None when segmentation is not
    trustworthy -- the caller then uses a flat colour fill, never a bleed.
    """
    arr = np.asarray(image.convert("RGB"), dtype=np.float64)
    h, w = arr.shape[:2]

    frame = max(2, int(round(min(h, w) * BG_FRAME_FRACTION)))
    border = np.concatenate([
        arr[:frame].reshape(-1, 3), arr[-frame:].reshape(-1, 3),
        arr[:, :frame].reshape(-1, 3), arr[:, -frame:].reshape(-1, 3),
    ])
    bg = np.median(border, axis=0)
    bg_spread = float(np.median(np.linalg.norm(border - bg, axis=1))) + 1e-6

    dist_bg = np.linalg.norm(arr - bg, axis=2)
    tol = max(CONTENT_DETECT_MIN_BG_DIST, bg_spread * BG_SPREAD_MULT)
    bg_like = dist_bg < tol
    if fabric_hex:
        fabric_rgb = np.array(_hex_to_rgb(fabric_hex), dtype=np.float64)
        dist_fabric = np.linalg.norm(arr - fabric_rgb, axis=2)
        bg_like &= dist_bg <= dist_fabric

    # Keep only backdrop-like components that actually touch the border frame.
    labeled, n = ndimage.label(bg_like)
    if n == 0:
        return None
    border_labels = np.unique(np.concatenate([
        labeled[0], labeled[-1], labeled[:, 0], labeled[:, -1],
    ]))
    border_labels = border_labels[border_labels != 0]
    if border_labels.size == 0:
        return None
    background = np.isin(labeled, border_labels)

    fabric = ~background
    if SEG_CLEAN_ITERS > 0:
        fabric = ndimage.binary_closing(fabric, iterations=SEG_CLEAN_ITERS)
        fabric = ndimage.binary_opening(fabric, iterations=SEG_CLEAN_ITERS)
    lab_f, nf = ndimage.label(fabric)
    if nf == 0:
        return None
    sizes = ndimage.sum(fabric, lab_f, index=range(1, nf + 1))
    fabric = lab_f == (int(np.argmax(sizes)) + 1)
    fabric = ndimage.binary_fill_holes(fabric)

    frac = float(fabric.mean())
    if frac < SEG_MIN_FABRIC_FRAC or frac > SEG_MAX_FABRIC_FRAC:
        return None
    return fabric


def _recolor_to_fabric(
    arr: np.ndarray, fabric_mask: np.ndarray, fabric_rgb: np.ndarray
) -> np.ndarray:
    """
    Bake an albedo that trusts the catalogue hex: keep the photo's fold/weave
    *shading* but re-anchor the garment's base colour to `fabric_rgb`. This
    fixes two artefacts of texturing straight from the raw photo:

      * darkness / colour-cast -- studio lighting and shadow make the raw photo
        read darker and off-hue. Here the *median* fabric pixel maps exactly to
        the catalogue colour; shading only modulates (bounded) around it.
      * backdrop bleed -- every non-fabric pixel is set to the flat fabric
        colour, so even if the planar UV samples a hair past the silhouette
        (sleeve tips, narrow torso vs. sleeve span) it can only ever pull
        fabric colour, never black.
    """
    lum = arr @ np.array([0.299, 0.587, 0.114])
    if SHADE_DENOISE_SIGMA > 0:
        lum = ndimage.gaussian_filter(lum, sigma=SHADE_DENOISE_SIGMA)
    ref = float(np.median(lum[fabric_mask])) if fabric_mask.any() else float(lum.mean())
    ref = max(ref, 1e-3)
    shade = np.clip(lum / ref, SHADE_MIN, SHADE_MAX)
    out = fabric_rgb[None, None, :] * shade[..., None]
    out[~fabric_mask] = fabric_rgb  # flat fabric colour outside the garment
    return np.clip(out, 0.0, 255.0).astype(np.uint8)


def prepare_texture_image(
    image: Image.Image, fabric_hex: Optional[str] = None
) -> Optional[Image.Image]:
    """
    Turn a flat-lay product photo into a garment albedo texture: segment the
    shirt, recolour it to the catalogue hex with the photo's shading preserved,
    and crop to the garment.

    Returns None when there's no `fabric_hex` or the shirt can't be segmented
    confidently -- the caller then uses the flat vertex-colour fill
    (build_dressed_glb), which is always correct-colour and never bleeds. This
    deliberately drops the old fixed-margin crop fallback, whose leftover
    background margin was the source of the "sleeve goes black" artefact.
    """
    if not fabric_hex:
        return None
    image = image.convert("RGB")
    arr = np.asarray(image, dtype=np.float64)
    mask = _segment_fabric(image, fabric_hex)
    if mask is None:
        logger.info("Texture: segmentation not confident -> flat colour fill")
        return None

    fabric_rgb = np.array(_hex_to_rgb(fabric_hex), dtype=np.float64)
    recolored = _recolor_to_fabric(arr, mask, fabric_rgb)

    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    l, t, r, b = int(cols.min()), int(rows.min()), int(cols.max()) + 1, int(rows.max()) + 1
    logger.info(
        "Texture prepared: fabric=%.0f%% of frame, crop=%dx%d, base=%s",
        mask.mean() * 100.0, r - l, b - t, fabric_hex,
    )
    return Image.fromarray(recolored).crop((l, t, r, b))


def _compute_planar_uv(vertices: np.ndarray, inset: float = UV_INSET) -> np.ndarray:
    """
    Front-planar-projection UV: u from X (left-right), v from Y (hem-shoulder),
    each normalized to the garment's own bounding box. The product photos are
    flat-lay, front-facing, roughly-symmetric shirt shots, so a simple bbox
    projection aligns collar-to-top/hem-to-bottom/sleeve-to-sleeve reasonably
    without needing a true UV unwrap. Applied uniformly (front and back), which
    is fine for these solid-color garments -- there's no back photo to lose.

    `inset` pulls the UV a hair inside [0,1] so the extreme silhouette edges
    don't sample the very texel border (belt-and-braces with the recoloured
    texture, whose off-garment texels are already valid fabric colour).

    v is stored inverted (1 - normalized_y): glTF's UV convention has V=0 at
    the *top* of the image, so this makes the mesh's shoulder (max Y) sample
    the photo's collar (near the image top) and the hem (min Y) sample the
    photo's hem (near the image bottom), matching standard glTF viewers
    (including the frontend's Three.js renderer) with no special-casing.
    """
    xmin, xmax = vertices[:, 0].min(), vertices[:, 0].max()
    ymin, ymax = vertices[:, 1].min(), vertices[:, 1].max()
    u = (vertices[:, 0] - xmin) / max(xmax - xmin, 1e-9)
    v = (vertices[:, 1] - ymin) / max(ymax - ymin, 1e-9)
    if inset:
        u = inset + u * (1.0 - 2.0 * inset)
        v = inset + v * (1.0 - 2.0 * inset)
    return np.stack([u, 1.0 - v], axis=1)


def _weld_and_clean_mesh(
    vertices: np.ndarray,
    faces: np.ndarray,
    weld_tol: float = SEAM_WELD_TOL_M,
    min_component_faces: int = MIN_COMPONENT_FACES,
):
    """
    Weld vertices within `weld_tol` metres of each other (radius-based union-find,
    not trimesh's default digit-quantized merge -- which can miss near-coincident
    seam pairs that straddle a rounding boundary), then drop any connected
    component smaller than `min_component_faces` (leftover scan debris).

    Returns (vertices, faces) reindexed onto the welded/cleaned vertex set.
    """
    tree = cKDTree(vertices)
    pairs = tree.query_pairs(r=weld_tol)

    parent = list(range(len(vertices)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for a, b in pairs:
        union(a, b)

    root = np.array([find(i) for i in range(len(vertices))])
    _, remap = np.unique(root, return_inverse=True)

    new_v = np.zeros((remap.max() + 1, 3))
    counts = np.zeros(remap.max() + 1)
    np.add.at(new_v, remap, vertices)
    np.add.at(counts, remap, 1)
    new_v /= counts[:, None]

    new_f = remap[faces]
    degenerate = (new_f[:, 0] == new_f[:, 1]) | (new_f[:, 1] == new_f[:, 2]) | (new_f[:, 0] == new_f[:, 2])
    new_f = new_f[~degenerate]

    mesh = trimesh.Trimesh(new_v, new_f, process=False)
    comps = trimesh_graph.connected_components(mesh.face_adjacency, nodes=np.arange(len(new_f)))
    keep_faces = np.concatenate([c for c in comps if len(c) >= min_component_faces])
    new_f = new_f[keep_faces]

    used = np.unique(new_f)
    final_remap = -np.ones(len(new_v), dtype=np.int64)
    final_remap[used] = np.arange(len(used))
    final_v = new_v[used]
    final_f = final_remap[new_f]
    return final_v, final_f


# ═══════════════════════════════════════════════════════════════════════════
#  Template loading
# ═══════════════════════════════════════════════════════════════════════════
def load_garment_template(gender: str = "male") -> dict:
    """Load and cache the gender-specific garment template (vertices, faces, UV)."""
    if gender in _template_cache:
        return _template_cache[gender]

    fname = TEMPLATE_OBJ.get(gender, _DEFAULT_TEMPLATE)
    path = GARMENT_DIR / fname
    if not path.exists():
        raise FileNotFoundError(
            f"Garment template not found at {path}. "
            "Expected the MGN t-shirt staged in models/garments/tshirt_mgn/."
        )

    # skip_materials avoids trimesh needing PIL for the (unused) texture.
    mesh = trimesh.load(path, process=False, skip_materials=True)
    raw_vertices = np.asarray(mesh.vertices, dtype=np.float64)
    raw_faces = np.asarray(mesh.faces, dtype=np.int64)
    n_raw = len(raw_vertices)

    # Weld sleeve/torso seam islands into one connected surface (see
    # SEAM_WELD_TOL_M docstring above) -- required for smooth_garment() to
    # not tear the mesh open at the shoulder. This changes vertex indexing, so
    # UV is recomputed fresh afterward (Phase 4: simple planar projection)
    # rather than trying to remap the original scan's authored UV through it.
    vertices, faces = _weld_and_clean_mesh(raw_vertices, raw_faces)
    uv = _compute_planar_uv(vertices)

    tmpl = {
        "vertices": vertices,  # (Ng, 3)
        "faces": faces,        # (Fg, 3)
        "uv": uv,               # (Ng, 2) planar-projection UV for texturing
    }
    _template_cache[gender] = tmpl
    logger.info(
        "Garment template loaded (%s): %s — %d verts, %d faces "
        "(welded %d seam verts from raw %d)",
        gender, fname, len(vertices), len(faces), n_raw - len(vertices), n_raw,
    )
    return tmpl


# ═══════════════════════════════════════════════════════════════════════════
#  Reference body (gendered β=0, pose=0)
# ═══════════════════════════════════════════════════════════════════════════
def get_reference_body(model, gender: str) -> np.ndarray:
    """
    Return (and cache) the pipeline's own β=0, pose=0 body for `gender`, in SMPL
    native scale. This is the fixed reference the garment binds against.
    """
    if gender in _ref_body_cache:
        return _ref_body_cache[gender]

    num_betas = int(getattr(model, "num_betas", 10))
    with torch.no_grad():
        out = model(
            betas=torch.zeros(1, num_betas, dtype=torch.float32),
            global_orient=torch.zeros(1, 3, dtype=torch.float32),
            body_pose=torch.zeros(1, 69, dtype=torch.float32),
            return_verts=True,
        )
    verts = out.vertices.squeeze(0).cpu().numpy().astype(np.float64)
    _ref_body_cache[gender] = verts
    logger.info("Reference body cached for gender='%s' (%d verts)", gender, len(verts))
    return verts


# ═══════════════════════════════════════════════════════════════════════════
#  Binding helpers
# ═══════════════════════════════════════════════════════════════════════════
def _interp(per_face_vertex_attr: np.ndarray, bary: np.ndarray) -> np.ndarray:
    """Barycentric-interpolate a (N,3,3) per-face-vertex attribute with (N,3) weights."""
    return np.einsum("nj,njk->nk", bary, per_face_vertex_attr)


def _normalize(v: np.ndarray) -> np.ndarray:
    return v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)


def bind_garment(
    garment_verts: np.ndarray,
    body_verts: np.ndarray,
    body_faces: np.ndarray,
    gender: str,
) -> dict:
    """
    Bind each garment vertex to the reference body surface.

    Stores, per garment vertex:
        • tri_id  — index of the nearest body triangle
        • bary    — barycentric coords of the closest point within that triangle
        • offset  — signed distance of the garment vertex along the interpolated
                    body normal (positive = outside the body)

    Cached per gender (topology & reference body are fixed).
    """
    if gender in _binding_cache:
        return _binding_cache[gender]

    body = trimesh.Trimesh(body_verts, body_faces, process=False)
    closest, _dist, tri_id = trimesh.proximity.closest_point(body, garment_verts)

    tri_verts = body_verts[body_faces[tri_id]]                    # (N, 3, 3)
    bary = trimesh.triangles.points_to_barycentric(tri_verts, closest)  # (N, 3)

    vnorm = body.vertex_normals                                   # (V, 3)
    n_ref = _normalize(_interp(vnorm[body_faces[tri_id]], bary))  # (N, 3)
    offset = np.einsum("nk,nk->n", garment_verts - closest, n_ref)  # (N,)

    binding = {"tri_id": tri_id, "bary": bary, "offset": offset}
    _binding_cache[gender] = binding
    logger.info(
        "Garment bound for gender='%s': offset mean=%.1fmm min=%.1fmm max=%.1fmm",
        gender, offset.mean() * 1000, offset.min() * 1000, offset.max() * 1000,
    )
    return binding


def deform_garment(
    binding: dict,
    body_verts: np.ndarray,
    body_faces: np.ndarray,
) -> np.ndarray:
    """
    Re-project the binding onto a new (user) body of the same topology.
    Returns the deformed garment vertices in the body's coordinate space.
    """
    body = trimesh.Trimesh(body_verts, body_faces, process=False)
    tri_id, bary, offset = binding["tri_id"], binding["bary"], binding["offset"]

    tri_verts = body_verts[body_faces[tri_id]]                    # (N, 3, 3)
    surface = _interp(tri_verts, bary)                            # (N, 3)
    n = _normalize(_interp(body.vertex_normals[body_faces[tri_id]], bary))
    return surface + n * offset[:, None]


def _belly_protrusion(verts: np.ndarray, y_center: float, halfband: float = 0.03) -> float:
    """90th-percentile forward (+FRONT_SIGN*Z) extent of `verts` in a horizontal
    band around `y_center`. Used to compare how far a body's belly sticks out."""
    mask = (np.abs(verts[:, 1] - y_center) < halfband) & (np.abs(verts[:, 0]) < 0.20)
    if mask.sum() < 5:
        return 0.0
    return float(np.percentile(FRONT_SIGN * verts[mask, 2], 90))


def _compute_hem_extension(
    garment_verts: np.ndarray,
    body_verts: np.ndarray,
    ref_body_verts: np.ndarray,
    t_norm: np.ndarray,
) -> np.ndarray:
    """
    Per-vertex downward shift (m) so the hem still covers a belly that
    protrudes further than the reference body did at binding time. Concentrated
    near the hem (t_norm~0) and zero above HEM_BAND_FRACTION of the garment's
    height, so the shoulders/collar are untouched.
    """
    hem_y = garment_verts[:, 1].min()
    probe_y = hem_y + 0.05  # sample just above the hem edge itself
    excess_m = max(0.0, _belly_protrusion(body_verts, probe_y)
                        - _belly_protrusion(ref_body_verts, probe_y))
    if excess_m <= 0.0:
        return np.zeros(len(garment_verts))
    extend_m = excess_m * HEM_EXTEND_FACTOR
    weight = np.clip(1.0 - t_norm / HEM_BAND_FRACTION, 0.0, 1.0)
    return extend_m * weight


def apply_size_looseness(
    garment_verts: np.ndarray,
    binding: dict,
    body_verts: np.ndarray,
    body_faces: np.ndarray,
    lbs_weights: np.ndarray,
    garment_chest_cm: float,
    body_chest_cm: float,
    ref_body_verts: np.ndarray,
) -> np.ndarray:
    """
    Differentiate garment sizes (S..XXL) by expanding/contracting the fitted
    garment relative to the torso, proportional to how much bigger (or
    smaller) the chosen size's chest circumference is than the body's.

    diff_cm = garment_chest_cm*2 (flat width -> circumference) - body_chest_cm
    A positive diff loosens the garment; a negative diff tightens it (guarded
    by TOO_SMALL_DIFF_CM). Three refinements avoid the "inflated balloon" look
    of a naive uniform push-out:
        1. Height taper — expansion peaks mid-torso and fades toward the
           shoulder and hem, instead of puffing the whole torso like a cylinder.
        2. Downward droop — loosened fabric sags a little instead of only
           expanding outward, approximating how slack cloth actually hangs.
        3. Hem extension — if the body's belly protrudes further than the
           reference body's did, the hem is pulled down so it keeps covering
           the belly instead of visually riding up.
    """
    diff_cm = (garment_chest_cm * 2.0) - body_chest_cm
    if diff_cm < TOO_SMALL_DIFF_CM:
        raise ValueError("TOO_SMALL")

    body = trimesh.Trimesh(body_verts, body_faces, process=False)
    tri_id, bary = binding["tri_id"], binding["bary"]

    normals = _normalize(_interp(body.vertex_normals[body_faces[tri_id]], bary))
    horizontal = normals.copy()
    horizontal[:, 1] = 0.0
    horizontal = _normalize(horizontal)

    torso_weight_per_bodyvert = lbs_weights[:, TORSO_JOINT_IDS].sum(axis=1)  # (V,)
    torso_attr = torso_weight_per_bodyvert[body_faces[tri_id]]              # (N, 3)
    torso_w = np.einsum("nj,nj->n", bary, torso_attr)                       # (N,)

    # Height taper: t=0 at hem, t=1 at shoulder-top.
    ymin, ymax = garment_verts[:, 1].min(), garment_verts[:, 1].max()
    span = max(ymax - ymin, 1e-6)
    t = np.clip((garment_verts[:, 1] - ymin) / span, 0.0, 1.0)
    height_taper = np.sin(np.pi * t) ** 0.6

    looseness_radius = (diff_cm / (2.0 * math.pi * 100.0)) * LOOSENESS_DAMPING
    expansion = horizontal * looseness_radius * torso_w[:, None] * height_taper[:, None]

    if looseness_radius > 0:
        droop = -looseness_radius * DROOP_FACTOR * torso_w * (1.0 - t)
        expansion[:, 1] += droop

    result = garment_verts + expansion
    hem_shift = _compute_hem_extension(result, body_verts, ref_body_verts, t)
    result[:, 1] -= hem_shift

    logger.info(
        "Size looseness: garment_chest=%.1fcm body_chest=%.1fcm diff=%.1fcm "
        "radius=%.1fmm mean|expansion|=%.1fmm hem_extend_max=%.1fmm",
        garment_chest_cm, body_chest_cm, diff_cm,
        looseness_radius * 1000, np.linalg.norm(expansion, axis=1).mean() * 1000,
        hem_shift.max() * 1000,
    )
    return result


def smooth_garment(
    garment_verts: np.ndarray,
    garment_faces: np.ndarray,
    iterations: int = SMOOTH_ITERATIONS,
    lamb: float = SMOOTH_LAMBDA,
) -> np.ndarray:
    """
    Laplacian-smooth the deformed garment mesh to soften the raw MGN scan's
    faceted look (exaggerated by size-based expansion). Silhouette-preserving
    at these modest iteration/lambda values; any resulting skin clipping is
    corrected by the subsequent push-out pass.

    Boundary-loop vertices (neckline, hem, cuffs) are pinned back to their
    pre-smoothing positions afterward. trimesh's filter_laplacian has no
    boundary awareness -- it pulls every vertex toward its neighbours'
    average, but a boundary vertex only *has* neighbours on one side (there's
    nothing past the fabric edge), so open loops shrink/warp asymmetrically
    over repeated iterations. Left unpinned this visibly deforms the
    neckline opening (seen as a gap/tear near the collar).
    """
    mesh = trimesh.Trimesh(garment_verts.copy(), garment_faces, process=False)
    edges = np.sort(mesh.edges_sorted, axis=1)
    uniq_edges, edge_counts = np.unique(edges, axis=0, return_counts=True)
    boundary_verts = np.unique(uniq_edges[edge_counts == 1])  # edge used by 1 face = open boundary

    pinned_positions = garment_verts[boundary_verts].copy()
    trimesh.smoothing.filter_laplacian(mesh, lamb=lamb, iterations=iterations)
    smoothed = np.asarray(mesh.vertices, dtype=np.float64)
    smoothed[boundary_verts] = pinned_positions
    return smoothed


def resample_boundary(
    garment_verts: np.ndarray,
    garment_faces: np.ndarray,
    smooth_iterations: int = 20,
    relax_iterations: int = 4,
) -> np.ndarray:
    """
    Clean the open boundary loops (hem, neckline, cuffs) of a jagged zigzag left
    by cutting a triangle mesh at a flat threshold (the SMPL region extraction),
    which smooth_garment() CANNOT fix because it pins the boundary by design.

    For each boundary loop: periodically smooth the loop (0.25/0.5/0.25 filter)
    to declaw the high-frequency sawtooth while preserving the loop's genuine
    low-frequency shape, then redistribute its vertices evenly by arc length
    (vertex count unchanged, so topology/correspondence is preserved). Finally a
    few boundary-pinned interior Laplacian passes absorb the boundary moves so
    the fabric near the edge isn't distorted.
    """
    from collections import defaultdict
    V = garment_verts.astype(np.float64).copy()
    F = np.asarray(garment_faces, dtype=np.int64)

    ec = defaultdict(int)
    for f in F:
        for k in range(3):
            ec[tuple(sorted((int(f[k]), int(f[(k + 1) % 3]))))] += 1
    adj = defaultdict(list)
    for (a, b), c in ec.items():
        if c == 1:
            adj[a].append(b); adj[b].append(a)

    seen = set(); loops = []
    for s in list(adj):
        if s in seen:
            continue
        loop = [s]; seen.add(s); cur = s; prev = None
        while True:
            nxt = None
            for n in adj[cur]:
                if n == prev:
                    continue
                if n == s and len(loop) > 2:
                    nxt = s; break
                if n not in seen:
                    nxt = n; break
            if nxt is None or nxt == s:
                break
            loop.append(nxt); seen.add(nxt); prev, cur = cur, nxt
        if len(loop) >= 4:
            loops.append(np.array(loop))

    bset = set()
    for L in loops:
        bset.update(L.tolist())
        P = V[L]
        for _ in range(smooth_iterations):
            P = 0.25 * np.roll(P, 1, 0) + 0.5 * P + 0.25 * np.roll(P, -1, 0)
        seg = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
        cum = np.concatenate([[0], np.cumsum(seg)]); total = cum[-1]
        targets = np.linspace(0, total, len(P), endpoint=False)
        newP = np.empty_like(P)
        for i, t in enumerate(targets):
            j = min(max(np.searchsorted(cum, t) - 1, 0), len(P) - 1)
            f = (t - cum[j]) / max(seg[j], 1e-9)
            newP[i] = P[j] * (1 - f) + P[(j + 1) % len(P)] * f
        V[L] = newP

    vadj = defaultdict(set)
    for f in F:
        for k in range(3):
            vadj[int(f[k])].update((int(f[(k + 1) % 3]), int(f[(k + 2) % 3])))
    interior = [i for i in range(len(V)) if i not in bset]
    for _ in range(relax_iterations):
        nV = V.copy()
        for i in interior:
            nb = list(vadj[i])
            if nb:
                nV[i] = 0.5 * V[nb].mean(0) + 0.5 * V[i]
        V = nV
    return V


def resolve_interpenetration(
    garment_verts: np.ndarray,
    body_verts: np.ndarray,
    body_faces: np.ndarray,
    margin: float = PUSHOUT_MARGIN_M,
    iters: int = PUSHOUT_ITERS,
) -> Tuple[np.ndarray, int]:
    """
    Push any garment vertex that is inside (or within `margin` of) the body back
    out along the local face normal. Returns (garment_verts, n_fixed_last_iter).
    """
    body = trimesh.Trimesh(body_verts, body_faces, process=False)
    face_normals = body.face_normals
    g = garment_verts.copy()
    n_fixed = 0
    for _ in range(iters):
        closest, _dist, tri_id = trimesh.proximity.closest_point(body, g)
        normals = face_normals[tri_id]
        signed = np.einsum("nk,nk->n", g - closest, normals)      # <0 => inside
        inside = signed < margin
        n_fixed = int(inside.sum())
        if n_fixed == 0:
            break
        g[inside] = closest[inside] + normals[inside] * margin
    return g, n_fixed


# ═══════════════════════════════════════════════════════════════════════════
#  Assembly / export
# ═══════════════════════════════════════════════════════════════════════════
def _hex_to_rgb(color_hex: str) -> Tuple[int, int, int]:
    h = color_hex.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def build_dressed_glb(
    body_verts: np.ndarray,
    body_faces: np.ndarray,
    garment_verts: np.ndarray,
    garment_faces: np.ndarray,
    color_hex: str,
    target_height_m: float,
    garment_uv: Optional[np.ndarray] = None,
    texture_image: Optional[Image.Image] = None,
) -> bytes:
    """
    Assemble a 2-node GLB (node "body" + node "garment"), and uniformly scale
    both meshes to the exact target height.

    If `texture_image` (+ `garment_uv`) is provided, the garment is textured
    with it (Phase 4: product photo). Otherwise it falls back to the flat
    `color_hex` vertex-colour fill (Phase 1-3 behaviour), so texture failures
    never break avatar generation.
    """
    h = float(body_verts[:, 1].max() - body_verts[:, 1].min())
    scale = target_height_m / h if h > 0 else 1.0
    bv = body_verts * scale
    gv = garment_verts * scale

    body_mesh = trimesh.Trimesh(bv, body_faces, process=False)

    if texture_image is not None and garment_uv is not None:
        material = trimesh.visual.material.PBRMaterial(
            baseColorTexture=texture_image,
            metallicFactor=0.0,
            roughnessFactor=0.75,
        )
        garment_visual = trimesh.visual.TextureVisuals(uv=garment_uv, material=material)
        garment_mesh = trimesh.Trimesh(gv, garment_faces, visual=garment_visual, process=False)
    else:
        r, g, b = _hex_to_rgb(color_hex)
        vcolors = np.tile(np.array([r, g, b, 255], dtype=np.uint8), (len(gv), 1))
        garment_mesh = trimesh.Trimesh(
            gv, garment_faces, vertex_colors=vcolors, process=False
        )

    scene = trimesh.Scene()
    scene.add_geometry(body_mesh, node_name="body", geom_name="body")
    scene.add_geometry(garment_mesh, node_name="garment", geom_name="garment")

    glb: bytes = scene.export(file_type="glb")
    logger.info(
        "Dressed 2-node GLB built: body=%d verts, garment=%d verts, scale=%.4f, "
        "textured=%s, %d bytes",
        len(bv), len(gv), scale, texture_image is not None, len(glb),
    )
    return glb


# ═══════════════════════════════════════════════════════════════════════════
#  Convenience orchestrator
# ═══════════════════════════════════════════════════════════════════════════
def dress(
    model,
    gender: str,
    user_body_verts: np.ndarray,
    body_faces: np.ndarray,
    color_hex: str,
    target_height_m: float,
    garment_chest_cm: Optional[float] = None,
    body_chest_cm: Optional[float] = None,
    texture_image: Optional[Image.Image] = None,
) -> dict:
    """
    Full Tier-1 garment fit for one already-solved body (native scale, pose=0).

    If both `garment_chest_cm` (the chosen size's flat chest width, e.g. from
    PRODUCT_CATALOG[*]["sizes"][size]["chest_width_cm"]) and `body_chest_cm`
    (the user's own chest measurement) are provided, the garment is expanded
    or contracted to reflect that size choice (Phase 3 size differentiation).
    Raises ValueError("TOO_SMALL") if the chosen size is drastically smaller
    than the body.

    If `texture_image` (a PIL Image, e.g. the product photo) is provided, the
    garment is textured with it (Phase 4) instead of a flat colour fill.

    Returns a dict with the GLB bytes plus diagnostics, so callers can log/inspect
    fit quality:
        { "glb": bytes, "n_pushed": int, "garment_verts": int }
    """
    template = load_garment_template(gender)
    ref_body = get_reference_body(model, gender)

    binding = bind_garment(template["vertices"], ref_body, body_faces, gender)
    garment = deform_garment(binding, user_body_verts, body_faces)

    if garment_chest_cm is not None and body_chest_cm is not None:
        lbs_weights = model.lbs_weights.detach().cpu().numpy()
        garment = apply_size_looseness(
            garment, binding, user_body_verts, body_faces, lbs_weights,
            garment_chest_cm, body_chest_cm, ref_body,
        )

    garment = smooth_garment(garment, template["faces"])
    garment, n_pushed = resolve_interpenetration(garment, user_body_verts, body_faces)

    glb = build_dressed_glb(
        user_body_verts, body_faces, garment, template["faces"],
        color_hex, target_height_m,
        garment_uv=template["uv"], texture_image=texture_image,
    )
    return {"glb": glb, "n_pushed": n_pushed, "garment_verts": len(garment)}
