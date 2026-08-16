"""
Phase 1, stage 2 (runs in the BPY venv).

Loads bake_input.npz (Tier-1 fitted garment + collision body + pin weights),
runs a Blender cloth simulation letting the shirt drape/wrinkle under gravity
while the shoulder/collar band stays pinned, and writes the settled garment
vertex positions to bake_output.npz — in the SAME vertex order as the input
(direct mesh construction + evaluated-depsgraph readback, no file re-import,
so correspondence is exact).

Run:  ./bpy_venv/bin/python bake_one.py
"""
import os
import sys
import functools
import numpy as np
import bpy

print = functools.partial(print, flush=True)  # unbuffered progress for bg monitoring

HERE = os.path.dirname(__file__)
# optional CLI args: bake_one.py [input.npz] [output.npz]
IN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "bake_input.npz")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "bake_output.npz")

# --- Cloth/sim parameters: HEAVY STRUCTURED COTTON -------------------------
# Target = broad, smooth, structured folds that hold shape (reference look),
# not flimsy wet-silk micro-wrinkles. Key levers:
#   - high bending_stiffness  -> broad smooth folds (vs many tight chaotic ones)
#   - high structural (tension/compression/shear) -> resists stretch & the
#     armpit-compression bunching; holds the boxy shape
#   - larger collision margin -> hem drops cleanly, doesn't snag/ride up
# Minimal step from the KNOWN-STABLE config (mass .4/tens 30/shear 15/bend 12/
# quality 12 — which converged to ~1mm and looked like a real drape). Only
# bending + shear are raised (broader folds, less diagonal chaos); everything
# else is held at the stable values so the solver stays stable.
# Heavy structured cotton — now safe to push because the starting geometry is
# authored in the relaxed pose (no crushed armpit) + pre-physics smoothed.
N_FRAMES = 60
# Convergence guard (Phase 2 pilot hardening): a bake that's still oscillating
# at frame 60 shouldn't ship into the delta library silently. Checked over the
# last CHECK_WINDOW frames (e.g. 55->60), not just the final frame alone,
# since an oscillating sim can land on a low value by chance at any single
# frame while still not actually settled.
# Threshold picked from real data: every genuinely-converged bake seen so far
# (mass/bending/taper/ramp-width sweeps) settled under 0.25mm by frame 60;
# every non-convergent one seen (the normal-body recipe point, reproduced
# bit-for-bit on re-bake) oscillated in the 2-5mm range. 0.5mm sits cleanly
# between the two with margin on both sides.
CONVERGENCE_THRESHOLD_MM = 0.5
CHECK_WINDOW = 6
EXTEND_FRAMES = 30
RETRY_LIMIT = 1
# Pants stiffness sweep (Phase 2, denim): the tee's own values below were never
# validated for a different fabric/contact profile and are only the DEFAULT
# here so unrelated callers (the tee itself) are unaffected. Each knob is
# independently overridable via env var for one-variable-at-a-time isolation
# testing -- mirrors the existing SELF_COLLISION override below.
CLOTH = dict(
    mass=float(os.environ.get("CLOTH_MASS", "0.70")),
    tension_stiffness=float(os.environ.get("CLOTH_TENSION", "45.0")),
    compression_stiffness=float(os.environ.get("CLOTH_TENSION", "45.0")),
    shear_stiffness=float(os.environ.get("CLOTH_SHEAR", "45.0")),
    bending_stiffness=float(os.environ.get("CLOTH_BENDING", "50.0")),
    quality=int(os.environ.get("CLOTH_QUALITY", "22")),
    pin_stiffness=1.0,
    # Damping was NEVER set explicitly in any Phase 2 round -- every bake so
    # far ran on Blender's bare factory defaults below. Exposed the same way
    # as the stiffness knobs for isolation testing (snug-fit non-convergence
    # investigation); defaults match Blender's own so nothing changes unless
    # explicitly overridden.
    air_damping=float(os.environ.get("CLOTH_AIR_DAMPING", "1.0")),
    tension_damping=float(os.environ.get("CLOTH_TENSION_DAMPING", "5.0")),
    compression_damping=float(os.environ.get("CLOTH_COMPRESSION_DAMPING", "5.0")),
    shear_damping=float(os.environ.get("CLOTH_SHEAR_DAMPING", "5.0")),
    bending_damping=float(os.environ.get("CLOTH_BENDING_DAMPING", "0.5")),
)
# Diagnostic-only: per-vertex (not just mean) displacement logging over the
# final CHECK_WINDOW frames, to localize where an oscillation concentrates
# (crotch / pin-boundary / diffuse). Off by default -- adds negligible cost
# when on, but not needed for ordinary bakes.
LOG_PER_VERTEX = os.environ.get("LOG_PER_VERTEX", "0") == "1"
COLLISION = dict(
    distance_min=0.010,         # 10mm — hem drops cleanly, no snag/curl
    # self-collision is the dominant sim cost at grid scale; allow an env override
    # (SELF_COLLISION=0) to A/B its effect on the drape. Default stays ON.
    self_collision=(os.environ.get("SELF_COLLISION", "1") != "0"),
    self_distance_min=0.008,
    collision_quality=5,
)

data = np.load(IN, allow_pickle=True)
gv = data["garment_verts"].astype(np.float64)
gf = data["garment_faces"]
bv = data["body_verts"].astype(np.float64)
bf = data["body_faces"]
pin = data["pin_weights"].astype(np.float64)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
# Our meshes are Y-up; Blender gravity defaults to -Z. Point it along -Y so the
# shirt falls DOWN the body, not sideways off it.
scene.gravity = (0.0, -9.81, 0.0)
scene.frame_start = 1
scene.frame_end = N_FRAMES + RETRY_LIMIT * EXTEND_FRAMES  # room to extend without resetting the sim

def make_object(name, verts, faces):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts.tolist(), [], faces.tolist())
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    return obj

# --- Collision body ----------------------------------------------------------
body = make_object("body", bv, bf)
body_mod = body.modifiers.new(name="Collision", type='COLLISION')
body.collision.thickness_outer = 0.005

# --- Cloth garment -----------------------------------------------------------
garment = make_object("garment", gv, gf)

# pin vertex group
vg = garment.vertex_groups.new(name="pin")
for i, w in enumerate(pin):
    if w > 0.0:
        vg.add([i], float(w), 'REPLACE')

cloth_mod = garment.modifiers.new(name="Cloth", type='CLOTH')
s = cloth_mod.settings
s.mass = CLOTH["mass"]
s.tension_stiffness = CLOTH["tension_stiffness"]
s.compression_stiffness = CLOTH["compression_stiffness"]
s.shear_stiffness = CLOTH["shear_stiffness"]
s.bending_stiffness = CLOTH["bending_stiffness"]
s.quality = CLOTH["quality"]
s.vertex_group_mass = "pin"          # this is Blender's "Pin Group"
s.pin_stiffness = CLOTH["pin_stiffness"]

s.air_damping = CLOTH["air_damping"]
s.tension_damping = CLOTH["tension_damping"]
s.compression_damping = CLOTH["compression_damping"]
s.shear_damping = CLOTH["shear_damping"]
s.bending_damping = CLOTH["bending_damping"]

cs = cloth_mod.collision_settings
cs.distance_min = COLLISION["distance_min"]
cs.use_self_collision = COLLISION["self_collision"]
cs.self_distance_min = COLLISION["self_distance_min"]
cs.collision_quality = COLLISION["collision_quality"]

print(f"Simulating {N_FRAMES} frames  (garment {len(gv)} verts, body {len(bv)} verts, "
      f"{int((pin>0.5).sum())} pinned)...")

# --- Run the simulation ------------------------------------------------------
per_vertex_window = []  # rolling buffer of per-vertex displacement (mm), last CHECK_WINDOW frames only

def run_to_frame(start_f, end_f, prev, per_frame_mm):
    """Advance the (already-running) sim from start_f to end_f inclusive,
    appending each frame's mean vertex movement (mm) to per_frame_mm."""
    for f in range(start_f, end_f + 1):
        scene.frame_set(f)
        deps = bpy.context.evaluated_depsgraph_get()
        me = garment.evaluated_get(deps).to_mesh()
        cur = np.array([list(v.co) for v in me.vertices], dtype=np.float64)
        if prev is not None:
            per_vertex = np.linalg.norm(cur - prev, axis=1) * 1000  # mm, per vertex
            movement = float(per_vertex.mean())
            per_frame_mm.append(movement)
            if LOG_PER_VERTEX:
                per_vertex_window.append(per_vertex)
                if len(per_vertex_window) > CHECK_WINDOW:
                    per_vertex_window.pop(0)
            if f % 5 == 0 or f == end_f:
                print(f"  frame {f:2d}: mean movement vs prev = {movement:.3f} mm")
        prev = cur
    return prev


def is_converged(per_frame_mm):
    if len(per_frame_mm) < CHECK_WINDOW:
        return False
    return max(per_frame_mm[-CHECK_WINDOW:]) < CONVERGENCE_THRESHOLD_MM


per_frame_mm = []
prev = run_to_frame(1, N_FRAMES, None, per_frame_mm)

convergence_status = "converged"
retries_used = 0
if not is_converged(per_frame_mm):
    print(f"  NOT CONVERGED at frame {N_FRAMES} (max of last {CHECK_WINDOW} frames = "
          f"{max(per_frame_mm[-CHECK_WINDOW:]):.3f}mm >= {CONVERGENCE_THRESHOLD_MM}mm threshold)")
    for attempt in range(RETRY_LIMIT):
        retries_used += 1
        extend_start = N_FRAMES + attempt * EXTEND_FRAMES + 1
        extend_end = N_FRAMES + (attempt + 1) * EXTEND_FRAMES
        print(f"  auto-extending: frames {extend_start}-{extend_end}")
        prev = run_to_frame(extend_start, extend_end, prev, per_frame_mm)
        if is_converged(per_frame_mm):
            convergence_status = "converged-after-extend"
            print(f"  CONVERGED after extending to frame {extend_end}")
            break
    else:
        convergence_status = "failed"
        print(f"  FAILED_CONVERGENCE after {retries_used} retry(ies) -- "
              f"max of last {CHECK_WINDOW} frames = {max(per_frame_mm[-CHECK_WINDOW:]):.3f}mm")

draped = prev

# --- Sanity + save -----------------------------------------------------------
if not np.isfinite(draped).all():
    raise RuntimeError("Simulation produced non-finite vertices (blow-up).")
bbox = draped.max(0) - draped.min(0)
print(f"draped bbox (m): {np.round(bbox,3)}  (input bbox: {np.round(gv.max(0)-gv.min(0),3)})")
print(f"CONVERGENCE_STATUS: {convergence_status}  "
      f"(frames_run={len(per_frame_mm)+1}, retries_used={retries_used}, "
      f"final_window_max_mm={max(per_frame_mm[-CHECK_WINDOW:]):.3f})")

save_kwargs = dict(
    draped_verts=draped.astype(np.float32),
    garment_faces=gf, input_verts=gv.astype(np.float32),
    converged=(convergence_status != "failed"),
    convergence_status=convergence_status,
    frames_run=len(per_frame_mm) + 1,
    retries_used=retries_used,
    final_window_max_mm=max(per_frame_mm[-CHECK_WINDOW:]),
)
if LOG_PER_VERTEX and per_vertex_window:
    # per-vertex MAX displacement (mm) over the final CHECK_WINDOW frames --
    # localizes an oscillation (crotch / pin-boundary / diffuse) rather than
    # only reporting the garment-wide mean.
    per_vertex_max = np.max(np.stack(per_vertex_window, axis=0), axis=0)
    save_kwargs["per_vertex_max_mm"] = per_vertex_max.astype(np.float32)
    top = np.argsort(-per_vertex_max)[:15]
    print("  top-15 most-oscillating vertices (idx: max mm over last window):")
    for i in top:
        print(f"    v{i}: {per_vertex_max[i]:.2f}mm  pos={gv[i]}  pinned={pin[i]>0.5}")

np.savez(OUT, **save_kwargs)
print(f"Wrote {OUT}")
