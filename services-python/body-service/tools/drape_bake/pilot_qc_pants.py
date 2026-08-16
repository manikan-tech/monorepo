"""
Phase 2 guard checks (BACKEND venv) -- reuses the tee's own validation
methodology (docs/physics-drape-pipeline.md SS3.1), applied to pants bakes:

  1. Non-adjacent proximity check: any two topologically-distant vertices
     closer than 5mm -> silent self-intersection. Function is copied verbatim
     from the source repo's pilot_qc.py (already garment-agnostic: only takes
     verts + faces).
  2. Layer-stack raster: cast a ray per pixel through the garment mesh alone
     and count how many times it crosses the fabric surface. More stacked
     layers = more bunching/accordion folding; fewer = a clean drape. This is
     the guard that ruled out "self-collision off is just hiding overlap" for
     the tee -- same logic applies here.

Run:  .venv/bin/python tools/drape_bake/pilot_qc_pants.py
"""
import os
import sys

import numpy as np
import trimesh
from scipy.spatial import cKDTree
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import shortest_path

HERE = os.path.dirname(os.path.abspath(__file__))
INPUTS = os.path.join(HERE, "_pilot_inputs")


def overlap(Vv, F, thr=0.005):
    """Non-adjacent proximity check -- verbatim from the source repo's
    pilot_qc.py. Counts vertex pairs closer than `thr` that are >3 mesh-edge
    hops apart (i.e. NOT naturally-adjacent fabric, which is always close)."""
    n = len(Vv)
    e = np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    A = csr_matrix((np.ones(2 * len(e)), (np.concatenate([e[:, 0], e[:, 1]]),
                    np.concatenate([e[:, 1], e[:, 0]]))), shape=(n, n))
    pairs = cKDTree(Vv).query_pairs(thr, output_type="ndarray")
    if len(pairs) == 0:
        return 0
    u = np.unique(pairs)
    d = shortest_path(A, method="D", unweighted=True, indices=u)
    idx = {v: i for i, v in enumerate(u)}
    return int(sum(d[idx[i], j] > 3 for i, j in pairs))


def layer_stack_raster(verts, faces, deg=18, res=140):
    """Ray-cast a grid of parallel rays (camera-space, looking down +Z after
    rotating the mesh by `deg` around Y) through the garment mesh ALONE and
    count ray/triangle crossings per ray. A clean single-layer drape crosses
    each ray ~2x (front + back face); bunched/accordioned fabric crosses it
    4x, 6x, ... Returns the crossing-count histogram and the max seen."""
    a = np.radians(deg)
    c, s = np.cos(a), np.sin(a)
    R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    v = verts @ R.T
    mesh = trimesh.Trimesh(v, faces, process=False)

    lo, hi = v[:, :2].min(0), v[:, :2].max(0)
    xs = np.linspace(lo[0], hi[0], res)
    ys = np.linspace(lo[1], hi[1], res)
    gx, gy = np.meshgrid(xs, ys)
    n_rays = gx.size
    origins = np.column_stack([gx.ravel(), gy.ravel(), np.full(n_rays, v[:, 2].min() - 1.0)])
    directions = np.tile(np.array([0.0, 0.0, 1.0]), (n_rays, 1))

    intersector = mesh.ray
    locations, ray_idx, _ = intersector.intersects_location(origins, directions, multiple_hits=True)
    if len(ray_idx) == 0:
        return np.array([0]), 0

    # De-duplicate hits per ray: a ray grazing a shared triangle edge is
    # reported twice (once per triangle sharing that edge) by trimesh's
    # non-embree intersector. Merge crossings within 0.5mm of each other
    # along the ray -- far smaller than any real fabric-layer gap, so this
    # only removes numerical duplicates, not genuine stacked layers.
    z = locations[:, 2]
    order = np.argsort(ray_idx, kind="stable")
    ray_idx, z = ray_idx[order], z[order]
    counts = np.zeros(n_rays, dtype=np.int64)
    start = 0
    for i in range(1, len(ray_idx) + 1):
        if i == len(ray_idx) or ray_idx[i] != ray_idx[start]:
            zz = np.sort(z[start:i])
            n_distinct = 1 + int(np.sum(np.diff(zz) > 0.0005))
            counts[ray_idx[start]] = n_distinct
            start = i
    hit_counts = counts[counts > 0]
    return hit_counts, int(hit_counts.max()) if len(hit_counts) else 0


def report(tag, path):
    d = np.load(path, allow_pickle=True)
    v = d["draped_verts"].astype(np.float64)
    f = d["garment_faces"] if "garment_faces" in d.files else None
    if f is None:
        # bake_one.py output doesn't carry faces back -- pull from the matching input
        in_path = path.replace("bake_output_", "bake_input_")
        f = np.load(in_path, allow_pickle=True)["garment_faces"]
    ov = overlap(v, f.astype(np.int64))
    hits, max_layers = layer_stack_raster(v, f)
    dense = int((hits >= 4).sum())
    print(f"\n[{tag}]")
    print(f"  non-adjacent proximity (<5mm, >3 hops apart): {ov} pairs")
    print(f"  layer-stack raster: max layers={max_layers}, rays hitting >=4 layers={dense}/{len(hits)} "
          f"({100*dense/max(len(hits),1):.1f}%)")
    return ov, max_layers, dense, len(hits)


if __name__ == "__main__":
    targets = sys.argv[1:] or ["selfcol_off", "selfcol_on"]
    for tag in targets:
        path = os.path.join(INPUTS, f"bake_output_{tag}.npz")
        if not os.path.exists(path):
            print(f"[{tag}] SKIP -- {path} not found")
            continue
        report(tag, path)
