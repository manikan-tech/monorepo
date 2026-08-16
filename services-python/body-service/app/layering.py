"""
Layered outfits: rendering an upper garment (tee) and a lower garment (pants)
on the same body at once.

═══ WHY THERE IS NO COMBINED BAKE ═══════════════════════════════════════════
The instinct is that a tee+pants outfit needs its own physics bake, i.e. every
tee grid point crossed with every pants grid point (125 x 125 = 15,625 bakes).
It does not. Two garments' drapes are physically independent everywhere except
the narrow band where the tee hem overlaps the pants waistband -- the tee does
not care whether pants exist over the chest, and the pants do not care about
the tee over the knee. So the decomposition is 125 + 125 independent bakes
(both of which already exist) plus one cheap geometric reconciliation at the
one place they actually touch. No new bakes, ever, for any future pairing.

The two poses also do not conflict: the tee grid was baked with relaxed
shoulders (`body_pose[45:51]`) and the pants grid with hip abduction
(`body_pose[0:6]`) -- disjoint joint ranges, so one body can carry both and
serve as the correct kinematic input for each garment's own drape.

═══ WHAT ACTUALLY GOES WRONG, AND WHY THE CODE LOOKS LIKE THIS ══════════════
Measured on real physics-drape output (male + female, several builds), a raw
overlay leaves 2.7-21.8mm of tee buried inside the pants. Fixing that is
harder than "push the tee out", and each of the three defensive measures
below exists because the simpler version was tried and visibly failed:

1. LOCAL CROP. Pants are an OPEN mesh (waistband + 2 hems, non-watertight).
   An unrestricted nearest-point search near an opening can match a point
   ~20cm away -- measured: vertices at the waistband matched down by the
   ankle and were "corrected" to there. The reference surface is therefore
   cropped to a height band around the seam first, so a distant match is
   structurally impossible rather than merely unlikely.

2. DILATE-THEN-SMOOTH. A bare per-vertex push (what `resolve_interpenetration`
   does) left adjacent vertices differing by up to 23.7mm -- a visibly torn
   hem -- and INVERTED 22-23 triangles on the female bodies, which render as
   dark slivers. Plain averaging fixes the tearing but lets vertices sink
   back inside. Dilating the depth field (a max-filter over the 1-ring)
   before smoothing, then clamping against the original requirement, gets
   both: smooth AND guaranteed-outside.

3. FLIP REPAIR. Any triangle still inverted after that is relaxed locally.

Note the anchor is the pants mesh's OWN measured waistband boundary, not the
body's anatomical waist landmark -- those differ by ~5cm (the waistband rides
below the anatomical waist), and using the body landmark measures empty air.

Cost is ONE `trimesh.proximity.closest_point` call; everything after it is
numpy over the 1-ring.
"""
from typing import Optional, Tuple

import numpy as np
import trimesh

from . import garment as G

# Which body half each category covers. The seam solver itself is already
# category-agnostic -- it takes any (upper, lower) mesh pair -- so this map is
# the ONLY thing that needs an entry when a category is added.
#
# It is deliberately just a map and not an inferred/geometric guess: getting
# the roles backwards would reconcile the wrong garment against the wrong
# surface and silently produce a plausible-looking wrong result.
#
# Adding a third category needs MORE than an entry here, and pretending
# otherwise would be misleading. It also needs: a 3D template, a baked delta
# library (or acceptance of the Tier-1 fit), and its own validation that the
# overlap band is where this code assumes it is. The current solver anchors
# on the LOWER garment's top boundary loop and lifts the UPPER garment's
# vertices below it -- correct for a hem over a waistband, but an open jacket
# over a tee, or a skirt with a tucked-in shirt, is a different geometric
# problem that this would not solve just by being listed here.
GARMENT_LAYER_ROLES = {
    "tshirt": "upper",
    "pants": "lower",
}


def split_by_role(categories):
    """(upper_category, lower_category) for a layerable pair, else None.

    None whenever the pair cannot be layered -- unknown category, two of the
    same role, or not exactly two -- so callers get one explicit failure
    instead of guessing.
    """
    if len(categories) != 2:
        return None
    roles = {}
    for category in categories:
        role = GARMENT_LAYER_ROLES.get(category)
        if role is None or role in roles:
            return None
        roles[role] = category
    if "upper" not in roles or "lower" not in roles:
        return None
    return roles["upper"], roles["lower"]


# Tuned by sweep across a heavy male and two female bodies. Counter-intuitive
# but measured: RAISING the margin or the smoothing count makes results worse
# -- a larger displacement means steeper gradients, and flipped faces return.
SEAM_MARGIN_M = 0.004
SEAM_CROP_PAD_M = 0.10
SEAM_DILATE = 3
SEAM_SMOOTH = 6
SEAM_FLIP_ITERS = 8


def _edges(faces: np.ndarray) -> np.ndarray:
    e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]], axis=0)
    return np.unique(np.sort(e, axis=1), axis=0)


def _adjacency(faces: np.ndarray, n_verts: int):
    e = _edges(faces)
    src = np.concatenate([e[:, 0], e[:, 1]])
    dst = np.concatenate([e[:, 1], e[:, 0]])
    deg = np.zeros(n_verts)
    np.add.at(deg, src, 1.0)
    deg[deg == 0] = 1.0
    return src, dst, deg


def _face_normals(v: np.ndarray, f: np.ndarray) -> np.ndarray:
    n = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    return n / np.maximum(np.linalg.norm(n, axis=1), 1e-12)[:, None]


def waistband_height(lower_verts: np.ndarray, lower_faces: np.ndarray) -> Optional[float]:
    """Mean height of the garment's highest open boundary loop (the waistband).

    Traced from the actual open-boundary edges rather than a planar section:
    a section's answer swings wildly with cut height near an opening (measured
    61cm vs 104cm 1cm apart on the same mesh), whereas the boundary itself is
    exact. Returns None if the mesh has no open boundary.
    """
    e = np.concatenate([lower_faces[:, [0, 1]], lower_faces[:, [1, 2]], lower_faces[:, [2, 0]]], axis=0)
    e = np.sort(e, axis=1)
    uniq, counts = np.unique(e, axis=0, return_counts=True)
    boundary = uniq[counts == 1]
    if len(boundary) == 0:
        return None

    from collections import defaultdict
    adj = defaultdict(list)
    for a, b in boundary:
        adj[a].append(b)
        adj[b].append(a)

    seen, best = set(), None
    for start in list(adj):
        if start in seen:
            continue
        loop, cur, prev = [start], start, None
        seen.add(start)
        while True:
            nxt = None
            for cand in adj[cur]:
                if cand != prev and cand not in seen:
                    nxt = cand
                    break
            if nxt is None:
                break
            loop.append(nxt)
            seen.add(nxt)
            prev, cur = cur, nxt
        if len(loop) >= 4:
            h = float(lower_verts[loop, 1].mean())
            if best is None or h > best:
                best = h
    return best


def reconcile_seam(
    upper_verts: np.ndarray,
    upper_faces: np.ndarray,
    lower_verts: np.ndarray,
    lower_faces: np.ndarray,
    waistband_y: float,
    margin: float = SEAM_MARGIN_M,
    crop_pad_m: float = SEAM_CROP_PAD_M,
    dilate: int = SEAM_DILATE,
    smooth: int = SEAM_SMOOTH,
    flip_iters: int = SEAM_FLIP_ITERS,
) -> Tuple[np.ndarray, dict]:
    """Lift upper-garment vertices that sit below `waistband_y` off the lower
    garment's surface. See the module docstring for why each step is here.

    Returns (corrected_upper_verts, info).
    """
    below = upper_verts[:, 1] < waistband_y
    if not below.any():
        return upper_verts, {"moved": 0, "flipped": 0, "corrected_max_mm": 0.0}
    idx = np.where(below)[0]

    # 1) crop the reference surface to a local height band
    crop_lo = upper_verts[idx, 1].min() - crop_pad_m
    crop_hi = waistband_y + crop_pad_m
    face_y = lower_verts[lower_faces].mean(axis=1)[:, 1]
    cropped = lower_faces[(face_y > crop_lo) & (face_y < crop_hi)]
    if len(cropped) == 0:
        return upper_verts, {"moved": 0, "flipped": 0, "corrected_max_mm": 0.0}
    used = np.unique(cropped)
    remap = -np.ones(len(lower_verts), dtype=np.int64)
    remap[used] = np.arange(len(used))
    ref = trimesh.Trimesh(lower_verts[used], remap[cropped], process=False)

    # the single proximity query
    closest, _dist, tri = trimesh.proximity.closest_point(ref, upper_verts[idx])
    normals = ref.face_normals[tri]
    signed = np.einsum("nk,nk->n", upper_verts[idx] - closest, normals)

    # 2) depth field -> dilate -> smooth -> clamp back to the requirement
    src, dst, deg = _adjacency(upper_faces, len(upper_verts))
    depth = np.zeros(len(upper_verts))
    depth[idx] = np.maximum(0.0, margin - signed)
    required = depth.copy()
    for _ in range(dilate):
        acc = np.zeros_like(depth)
        np.maximum.at(acc, src, depth[dst])
        depth = np.maximum(depth, acc)
    for _ in range(smooth):
        acc = np.zeros_like(depth)
        np.add.at(acc, src, depth[dst])
        depth = 0.5 * depth + 0.5 * (acc / deg)
    depth = np.maximum(depth, required)

    direction = np.zeros((len(upper_verts), 3))
    direction[idx] = normals
    for _ in range(2):
        acc = np.zeros_like(direction)
        np.add.at(acc, src, direction[dst])
        direction = 0.5 * direction + 0.5 * (acc / deg[:, None])
    length = np.linalg.norm(direction, axis=1)
    ok = length > 1e-9
    direction[ok] /= length[ok][:, None]

    out = upper_verts + direction * depth[:, None]

    # 3) repair any inverted triangle (renders as a dark sliver)
    base_n = _face_normals(upper_verts, upper_faces)
    for _ in range(flip_iters):
        flipped = np.einsum("ij,ij->i", base_n, _face_normals(out, upper_faces)) < 0.1
        if not flipped.any():
            break
        vs = np.unique(upper_faces[flipped])
        d = out - upper_verts
        acc = np.zeros_like(d)
        np.add.at(acc, src, d[dst])
        d[vs] = 0.5 * d[vs] + 0.5 * (acc / deg[:, None])[vs]
        out = upper_verts + d

    n_flipped = int((np.einsum("ij,ij->i", base_n, _face_normals(out, upper_faces)) < 0).sum())
    moved = np.linalg.norm(out - upper_verts, axis=1)
    return out, {
        "moved": int((moved > 1e-9).sum()),
        "flipped": n_flipped,
        "corrected_max_mm": round(float(moved.max() * 1000), 2),
    }


def build_layered_glb(
    body_verts: np.ndarray,
    body_faces: np.ndarray,
    layers,
    target_height_m: float,
) -> bytes:
    """Assemble body + N garment nodes into one GLB.

    `layers` is an ordered sequence of dicts:
        {"name", "verts", "faces", "color_hex", "uv" (optional),
         "texture_image" (optional)}

    Mirrors garment.build_dressed_glb()'s conventions (uniform height scale
    applied here, textured when a uv+image pair is supplied, flat vertex
    colour otherwise) but emits one node per garment instead of exactly one.
    """
    h = float(body_verts[:, 1].max() - body_verts[:, 1].min())
    scale = target_height_m / h if h > 0 else 1.0

    scene = trimesh.Scene()
    scene.add_geometry(trimesh.Trimesh(body_verts * scale, body_faces, process=False),
                       node_name="body", geom_name="body")

    for layer in layers:
        gv = layer["verts"] * scale
        gf = layer["faces"]
        tex, uv = layer.get("texture_image"), layer.get("uv")
        if tex is not None and uv is not None:
            material = trimesh.visual.material.PBRMaterial(
                baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.75)
            visual = trimesh.visual.TextureVisuals(uv=uv, material=material)
            mesh = trimesh.Trimesh(gv, gf, visual=visual, process=False)
        else:
            r, g, b = G._hex_to_rgb(layer["color_hex"])
            colors = np.tile(np.array([r, g, b, 255], dtype=np.uint8), (len(gv), 1))
            mesh = trimesh.Trimesh(gv, gf, vertex_colors=colors, process=False)
        scene.add_geometry(mesh, node_name=layer["name"], geom_name=layer["name"])

    return scene.export(file_type="glb")
