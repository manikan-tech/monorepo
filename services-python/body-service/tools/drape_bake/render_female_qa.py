"""
Cycles QA render: female pants template (Phase 0), kinematic fit only, on the
canonical beta=0 SMPL female body. Front + 3/4 views.

Two-step tool -- SMPL/torch live in this service's own .venv, bpy needs its
own separate Python interpreter, so the two can't run in one process:
  1. .venv/bin/python tools/drape_bake/prep_female_qa_render.py
     (writes _qa_female_beta0.npz -- local-only, gitignored, regenerate
     whenever you need it; not committed since it's cheap to rebuild)
  2. BPY_PYTHON tools/drape_bake/render_female_qa.py
     (reads that npz, writes the QA renders to _qa_renders/ next to this
     script -- also gitignored)

Mesh convention: Y-up (matches bake_one.py's own gravity-axis comment).
"""
import math
import os

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
IN_NPZ = os.path.join(HERE, "_qa_female_beta0.npz")
OUT_DIR = os.path.join(HERE, "_qa_renders")
os.makedirs(OUT_DIR, exist_ok=True)

d = np.load(IN_NPZ, allow_pickle=True)
bv, bf = d["body_verts"].astype(np.float64), d["body_faces"]
gv, gf = d["garment_verts"].astype(np.float64), d["garment_faces"]


def yup_to_zup(v):
    """(x,y,z)_Yup -> (x,-z,y)_Zup -- a proper +90 deg rotation about X, so
    handedness/winding is preserved (no face-normal flip needed). Verified:
    Y-up "up" (0,1,0) maps to (0,0,1) = world +Z.

    Blender's own camera/constraint/lighting defaults all assume a Z-up
    world; fighting that with a custom up-axis (as the first version of this
    script tried) produced a rolled/sideways camera at non-zero angles. This
    converts once at import instead, so everything downstream is standard
    Blender behaviour."""
    out = v.copy()
    out[:, 1] = -v[:, 2]
    out[:, 2] = v[:, 1]
    return out


bv = yup_to_zup(bv)
gv = yup_to_zup(gv)

# ── Clean scene ──────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 128
scene.cycles.use_denoising = True
scene.render.resolution_x = 1000
scene.render.resolution_y = 1500
scene.render.image_settings.file_format = 'PNG'


def make_object(name, verts, faces, smooth=True):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts.tolist(), [], faces.tolist())
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    if smooth:
        for p in mesh.polygons:
            p.use_smooth = True
    return obj


def make_material(name, rgb, roughness=0.6):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


body_obj = make_object("body", bv, bf)
body_obj.data.materials.append(make_material("skin", (0.85, 0.68, 0.58), roughness=0.5))

garment_obj = make_object("garment", gv, gf)
garment_obj.data.materials.append(make_material("fabric", (0.29, 0.43, 0.74), roughness=0.75))

# ── Lighting: simple 3-point, no HDRI dependency ────────────────────────
def add_light(name, loc, energy, size=2.0):
    bpy.ops.object.light_add(type='AREA', location=loc)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.size = size
    return light

center = ((bv[:, 0].min() + bv[:, 0].max()) / 2, (bv[:, 1].min() + bv[:, 1].max()) / 2, (bv[:, 2].min() + bv[:, 2].max()) / 2)
add_light("key", (center[0] + 1.5, center[1] + 1.0, center[2] + 2.0), 400)
add_light("fill", (center[0] - 1.5, center[1] + 0.5, center[2] + 1.5), 150)
add_light("rim", (center[0], center[1] + 1.5, center[2] - 2.0), 200)

world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.93, 0.93, 0.93, 1.0)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.6

# ── Cameras: front (0 deg) and 3/4 (45 deg), full body head-to-foot ─────
# Now in standard Blender Z-up space: Z is height, X/Y is the ground plane.
zmin, zmax = bv[:, 2].min(), bv[:, 2].max()
xmin, xmax = bv[:, 0].min(), bv[:, 0].max()   # includes T-pose outstretched arms
body_height = zmax - zmin
body_width = xmax - xmin
cam_target = (center[0], center[1], zmin + body_height * 0.5)

LENS_MM = 50
SENSOR_MM = 36
half_fov = math.atan((SENSOR_MM / 2) / LENS_MM)
aspect = scene.render.resolution_y / scene.render.resolution_x
vert_half_fov = math.atan(math.tan(half_fov) * aspect)
horiz_half_fov = half_fov

# T-pose arms make body_width comparable to or larger than body_height at
# certain angles -- fit whichever dimension is more binding, not just height.
dist_for_height = (body_height * 1.20 / 2) / math.tan(vert_half_fov)
dist_for_width = (body_width * 1.20 / 2) / math.tan(horiz_half_fov)
cam_dist = max(dist_for_height, dist_for_width)


import mathutils  # noqa: E402


def add_camera(name, angle_deg):
    rad = math.radians(angle_deg)
    # SMPL's canonical facing direction puts the front of the body toward -Y
    # in this scene (confirmed empirically: +Y showed the back of the head
    # and shoulder blades) -- negate so angle=0 is a true front view.
    x = cam_target[0] + cam_dist * math.sin(rad)
    y = cam_target[1] - cam_dist * math.cos(rad)
    eye = mathutils.Vector((x, y, cam_target[2]))
    target = mathutils.Vector(cam_target)

    bpy.ops.object.camera_add(location=eye)
    cam = bpy.context.object
    cam.name = name
    cam.data.lens = LENS_MM
    cam.data.sensor_width = SENSOR_MM

    # Manual look-at, set directly on the object's world matrix -- a
    # TRACK_TO constraint was tried first and, verified via the evaluated
    # depsgraph, silently failed to apply in this headless bpy invocation
    # (forward stayed camera-default (0,0,-1) regardless of the target).
    # This bypasses the constraint system entirely, so there's nothing left
    # to silently not-apply; verified directly against a known eye/target
    # pair before use here.
    z_axis = (eye - target).normalized()
    world_up = mathutils.Vector((0, 0, 1))
    x_axis = world_up.cross(z_axis).normalized()
    y_axis = z_axis.cross(x_axis).normalized()
    rot = mathutils.Matrix((x_axis, y_axis, z_axis)).transposed().to_3x3()
    cam.matrix_world = mathutils.Matrix.Translation(eye) @ rot.to_4x4()
    return cam


for name, angle in [("front", 0), ("three_quarter", 40)]:
    cam = add_camera(f"cam_{name}", angle)
    scene.camera = cam
    scene.render.filepath = os.path.join(OUT_DIR, f"female_qa_{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"rendered {scene.render.filepath}")

print("DONE")
