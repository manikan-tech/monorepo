"""
Visualise the tee-hem / pants-waistband seam BEFORE and AFTER the
garment-vs-garment reconciliation pass, on one representative body.

Cross-section, not a 3D render, on purpose: interpenetration of two cloth
surfaces is INVISIBLE from outside -- the buried surface is simply hidden
behind the one it is inside of. A sagittal cut through the seam shows both
surfaces' true profiles, so "the tee line is inside the pants line" is
directly readable rather than inferred.

Drawn with PIL (already a service dependency) rather than a plotting
library: this is explicit 2D polyline drawing with a controlled
world->pixel transform, no third-party rendering in the loop.

Scale note: the drape pipeline works in SMPL native units and
build_dressed_glb() applies the real-world height scale only at export, so
native units are NOT metres. Everything here is converted to real-world
scale BEFORE measuring, so the millimetre figures are what a shopper would
actually see (measured factor ~1.058 for a 175cm body -- i.e. native-unit
figures understate the real overlap by ~6%).

Axis convention: FRONT = +z, verified empirically rather than assumed --
on the canonical SMPL body the toes reach z=+0.178 while the heels only
reach z=-0.070.

Run: MANIKAN_PANTS_DRAPE=physics .venv/bin/python tools/drape_bake/viz_tee_pants_seam.py
"""
import os
import sys

import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "tools", "drape_bake"))
from app import main as M, physics_drape                  # noqa: E402
from export_female_preview import boundary_loops          # noqa: E402
from test_tee_pants_reconcile import posed_body, reconcile, measure_clipping  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_combo_test")
os.makedirs(OUT_DIR, exist_ok=True)

# "avg" build -- carried the most clipping of the three tested, so it is the
# most informative single representative body.
BODY = dict(h_cm=175, wt_kg=82, chest=102, waist=90, hips=104)

FONT_CANDIDATES = [
    "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf",
    "/usr/share/fonts/liberation-sans-fonts/LiberationSans-Regular.ttf",
]


def font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def section_polylines(verts, faces, plane_origin, plane_normal):
    mesh = trimesh.Trimesh(verts, faces, process=False)
    try:
        sec = mesh.section(plane_origin=plane_origin, plane_normal=plane_normal)
    except Exception:
        return []
    if sec is None:
        return []
    return [sec.vertices[e.points] for e in sec.entities]


def _clip_segment(p, q, zlim, ylim):
    """Liang-Barsky clip of a world-space (z,y) segment to the view window.
    Returns the clipped (p, q) or None. Without this, polylines draw straight
    out of the panel and the figure is unreadable."""
    z0, y0 = p
    dz, dy = q[0] - z0, q[1] - y0
    t0, t1 = 0.0, 1.0
    for pp, qq in ((-dz, z0 - zlim[0]), (dz, zlim[1] - z0),
                   (-dy, y0 - ylim[0]), (dy, ylim[1] - y0)):
        if pp == 0:
            if qq < 0:
                return None
            continue
        r = qq / pp
        if pp < 0:
            if r > t1:
                return None
            t0 = max(t0, r)
        else:
            if r < t0:
                return None
            t1 = min(t1, r)
    return ((z0 + t0 * dz, y0 + t0 * dy), (z0 + t1 * dz, y0 + t1 * dy))


class Panel:
    """World (z_cm, y_cm) -> pixel, equal aspect so a millimetre reads the
    same on both axes and the overlap can't be visually exaggerated."""

    def __init__(self, draw, x0, y0, w, h, zlim, ylim):
        self.d, self.x0, self.y0, self.w, self.h = draw, x0, y0, w, h
        self.zlim, self.ylim = zlim, ylim
        self.s = min(w / (zlim[1] - zlim[0]), h / (ylim[1] - ylim[0]))
        self.cz = 0.5 * (zlim[0] + zlim[1])
        self.cy = 0.5 * (ylim[0] + ylim[1])

    def px(self, z_cm, y_cm):
        return (self.x0 + self.w / 2 + (z_cm - self.cz) * self.s,
                self.y0 + self.h / 2 - (y_cm - self.cy) * self.s)

    def polyline(self, poly3d, color, width):
        pts = [(p[2] * 100, p[1] * 100) for p in poly3d]
        for i in range(len(pts) - 1):
            seg = _clip_segment(pts[i], pts[i + 1], self.zlim, self.ylim)
            if seg is not None:
                self.d.line([self.px(*seg[0]), self.px(*seg[1])], fill=color, width=width)

    def dot(self, z_cm, y_cm, color, r=4):
        if not (self.zlim[0] <= z_cm <= self.zlim[1] and self.ylim[0] <= y_cm <= self.ylim[1]):
            return
        x, y = self.px(z_cm, y_cm)
        self.d.ellipse([x - r, y - r, x + r, y + r], fill=color)

    def hline(self, y_cm, color, width=1, dash=6):
        if not (self.ylim[0] <= y_cm <= self.ylim[1]):
            return
        _, py = self.px(0, y_cm)
        x = self.x0
        while x < self.x0 + self.w:
            self.d.line([(x, py), (min(x + dash, self.x0 + self.w), py)], fill=color, width=width)
            x += dash * 2

    def scalebar(self, cm, label_font, color=(90, 90, 96)):
        """1cm reference so the reader can size the overlap by eye."""
        x, y = self.x0 + 16, self.y0 + self.h - 22
        px_len = cm * self.s
        self.d.line([(x, y), (x + px_len, y)], fill=color, width=3)
        for xx in (x, x + px_len):
            self.d.line([(xx, y - 5), (xx, y + 5)], fill=color, width=3)
        self.d.text((x + px_len + 8, y - 8), f"{cm:g} cm", font=label_font, fill=color)


def main():
    model, rings = M._load_smpl_model("male")
    tee_draper = physics_drape.get_draper()
    pants_draper = physics_drape.get_pants_draper(model, "male")
    lbs = model.lbs_weights.detach().cpu().numpy()

    betas = M.solve_betas(model, rings, BODY["h_cm"], BODY["wt_kg"],
                          BODY["chest"], BODY["waist"], BODY["hips"], num_iters=80)
    body_v, body_f = posed_body(model, betas, physics_drape.RELAXED_SHOULDER_ANGLE,
                                 physics_drape.pants_pose_hip_abduction_rad("male", 175.0))
    tee_v, tee_f, _ = tee_draper.drape(body_v, body_f, lbs,
                                        chest_cm=BODY["chest"], height_cm=BODY["h_cm"],
                                        garment_chest_cm=BODY["chest"] / 2.0 + 3.0,
                                        body_chest_cm=BODY["chest"])
    pants_v, pants_f, _, _ = pants_draper.drape(body_v, body_f, lbs,
                                                 body_waist_cm=BODY["waist"], height_cm=BODY["h_cm"],
                                                 garment_waist_cm=BODY["waist"] / 2.0 + 2.0)

    scale = (BODY["h_cm"] / 100.0) / (body_v[:, 1].max() - body_v[:, 1].min())
    body_v, tee_v, pants_v = body_v * scale, tee_v * scale, pants_v * scale
    print(f"native->real scale: {scale:.4f}  (1 native unit = {1/scale:.3f} m)")

    waistband_y = boundary_loops(pants_v, pants_f)[-1][0]
    n_checked, n_before, pen_before = measure_clipping(tee_v, tee_f, pants_v, pants_f, waistband_y)
    print(f"BEFORE: {n_before}/{n_checked} tee verts inside pants, max {pen_before:.1f}mm (real-world)")

    tee_fixed, _ = reconcile(tee_v, tee_f, pants_v, pants_f, waistband_y, crop_pad_m=0.10)
    _, n_after, pen_after = measure_clipping(tee_fixed, tee_f, pants_v, pants_f, waistband_y)
    moved = np.linalg.norm(tee_fixed - tee_v, axis=1) * 1000
    touched = int((moved > 1e-9).sum())
    print(f"AFTER:  {n_after}/{n_checked} clipping, max {pen_after:.1f}mm | "
          f"corrections mean {moved[moved > 1e-9].mean():.1f}mm max {moved.max():.1f}mm on {touched} verts")

    # cut plane through the densest clipping, not an arbitrary x
    pants_mesh = trimesh.Trimesh(pants_v, pants_f, process=False)
    below_idx = np.where(tee_v[:, 1] < waistband_y)[0]
    closest, dist, tri_id = trimesh.proximity.closest_point(pants_mesh, tee_v[below_idx])
    signed = np.einsum("nk,nk->n", tee_v[below_idx] - closest, pants_mesh.face_normals[tri_id])
    clip_idx = below_idx[(signed < 0) & (dist < 0.08)]
    cut_x = float(np.median(tee_v[clip_idx, 0])) if len(clip_idx) else 0.0
    print(f"cut plane x={cut_x*100:.1f}cm (median of {len(clip_idx)} clipping verts)")
    # FRONT = +z (verified: canonical SMPL toes reach +0.178, heels -0.070)
    n_front = int((tee_v[clip_idx, 2] > 0).sum())
    print(f"clipping distribution: {n_front} front (+z) / {len(clip_idx) - n_front} back (-z)")

    origin, normal = np.array([cut_x, 0.0, 0.0]), np.array([1.0, 0.0, 0.0])
    polys = {
        "body": section_polylines(body_v, body_f, origin, normal),
        "pants": section_polylines(pants_v, pants_f, origin, normal),
        "tee_before": section_polylines(tee_v, tee_f, origin, normal),
        "tee_after": section_polylines(tee_fixed, tee_f, origin, normal),
    }

    # Zoom onto the ACTUAL clipping region near the cut plane -- an 8-9mm
    # overlap is invisible at whole-torso framing, so the window is derived
    # from the offending vertices themselves rather than guessed.
    near = clip_idx[np.abs(tee_v[clip_idx, 0] - cut_x) < 0.015]
    if len(near) == 0:
        near = clip_idx
    zc = tee_v[near, 2] * 100
    yc = tee_v[near, 1] * 100
    pad = 3.0
    zlim = (zc.min() - pad, zc.max() + pad)
    ylim = (yc.min() - pad, yc.max() + pad)
    # keep the window square-ish so equal aspect doesn't waste the panel
    span = max(zlim[1] - zlim[0], ylim[1] - ylim[0])
    zmid, ymid = 0.5 * (zlim[0] + zlim[1]), 0.5 * (ylim[0] + ylim[1])
    zlim = (zmid - span / 2, zmid + span / 2)
    ylim = (ymid - span / 2, ymid + span / 2)
    y_c = waistband_y * 100
    print(f"zoom window: z {zlim[0]:.1f}..{zlim[1]:.1f}cm, y {ylim[0]:.1f}..{ylim[1]:.1f}cm "
          f"({len(near)} clipping verts within 1.5cm of the cut plane)")

    W, H = 1500, 820
    PW, PH = 690, 620
    img = Image.new("RGB", (W, H), (252, 252, 250))
    d = ImageDraw.Draw(img)
    f_title, f_sub, f_small = font(21), font(15), font(13)

    d.text((28, 20), "Tee hem / pants waistband seam — sagittal cross-section", font=f_title, fill=(25, 25, 30))
    d.text((28, 50), f"male {BODY['h_cm']}cm, chest {BODY['chest']}, waist {BODY['waist']}   ·   "
                     f"cut at x={cut_x*100:.1f}cm   ·   equal aspect, 1mm reads the same on both axes",
           font=f_small, fill=(110, 110, 118))

    C_BODY, C_PANTS = (188, 188, 192), (48, 52, 64)
    C_BAD, C_GOOD, C_GHOST = (214, 40, 42), (34, 150, 70), (214, 40, 42)

    for i, (tag, title, tee_col) in enumerate([
        ("tee_before", f"BEFORE — raw layering:  {n_before} tee vertices buried inside the pants, up to {pen_before:.1f}mm", C_BAD),
        ("tee_after",  f"AFTER — reconciled:  {n_after} clipping, corrections ≤{moved.max():.1f}mm", C_GOOD),
    ]):
        px0, py0 = 40 + i * (PW + 40), 118
        d.rectangle([px0, py0, px0 + PW, py0 + PH], fill=(255, 255, 255), outline=(222, 222, 226))
        p = Panel(d, px0, py0, PW, PH, zlim, ylim)
        p.hline(y_c, (205, 205, 212), 1)
        for poly in polys["body"]:
            p.polyline(poly, C_BODY, 2)
        for poly in polys["pants"]:
            p.polyline(poly, C_PANTS, 6)
        if tag == "tee_after":
            for poly in polys["tee_before"]:
                p.polyline(poly, (247, 190, 190), 3)
        for poly in polys[tag]:
            p.polyline(poly, tee_col, 6)
        # mark the offending vertices themselves
        src = tee_v if tag == "tee_before" else tee_fixed
        for vi in near:
            p.dot(src[vi, 2] * 100, src[vi, 1] * 100, tee_col, r=4)
        p.scalebar(1.0, f_small)

        d.text((px0 + 12, py0 - 30), title, font=f_sub, fill=(30, 30, 36))
        d.text((px0 + 12, py0 + PH + 8), "back  ←                                                    →  front",
               font=f_small, fill=(120, 120, 128))
        lx, ly = px0 + PW - 215, py0 + 14
        for col, lab, wdt in ((C_BODY, "body", 2), (C_PANTS, "pants", 6), (tee_col, "t-shirt", 6)):
            d.line([(lx, ly + 7), (lx + 26, ly + 7)], fill=col, width=wdt)
            d.text((lx + 34, ly), lab, font=f_small, fill=(60, 60, 66))
            ly += 22
        if tag == "tee_after":
            d.line([(lx, ly + 7), (lx + 26, ly + 7)], fill=(247, 190, 190), width=3)
            d.text((lx + 34, ly), "t-shirt (before)", font=f_small, fill=(60, 60, 66))
        if ylim[0] <= y_c <= ylim[1]:
            d.text((px0 + 14, p.px(0, y_c)[1] - 19), "pants waistband rim", font=f_small, fill=(150, 150, 158))

    out_png = os.path.join(OUT_DIR, "seam_before_after.png")
    img.save(out_png)
    print("wrote", out_png)

    for tag, tv in (("before", tee_v), ("after", tee_fixed)):
        scene = trimesh.Scene()
        scene.add_geometry(trimesh.Trimesh(body_v, body_f, process=False), node_name="body", geom_name="body")
        scene.add_geometry(trimesh.Trimesh(tv, tee_f, vertex_colors=np.tile([70, 130, 180, 255], (len(tv), 1)),
                                            process=False), node_name="tee", geom_name="tee")
        scene.add_geometry(trimesh.Trimesh(pants_v, pants_f, vertex_colors=np.tile([55, 58, 68, 255], (len(pants_v), 1)),
                                            process=False), node_name="pants", geom_name="pants")
        pth = os.path.join(OUT_DIR, f"seam_{tag}.glb")
        with open(pth, "wb") as fh:
            fh.write(scene.export(file_type="glb"))
        print("wrote", pth)


if __name__ == "__main__":
    main()
