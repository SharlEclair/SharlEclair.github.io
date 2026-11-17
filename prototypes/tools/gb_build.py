"""Builds the frosted handheld in 'three coordinates' (x right, y up, z toward viewer). Units match
prototypes/shared/gb/layout.js (keep the two in sync). Run gb_export.py afterwards to rotate into glTF space and export.

Reference: tools/ref/gb-ref-*.jpg. A clear-smoke body 2.5 x 3.2 x 0.5 (0.78:1), black glass on the upper half
holding a 160:144 LCD edge to edge (thin border), a plus D-pad in a round recess, two red caps offset diagonally, a
blue on/off pill, a slotted speaker dish in the big bottom-right corner, USB-C on the bottom edge, stacked layered
edges. The cartridge bay on the top edge is ours.

  exec(open(r'...\\tools\\gb_build.py').read())   then   exec(open(r'...\\tools\\gb_export.py').read())
"""
import bpy, bmesh, math
from mathutils import Matrix

sc = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for d in (bpy.data.meshes, bpy.data.materials):
    for x in list(d):
        d.remove(x)
col = sc.collection
PI = math.pi

# ---------------------------------------------------------------- layout (mirror of shared/gb/layout.js)
W, H, D = 2.5, 3.2, 0.5
FRONT = D / 2
RADII = [0.14, 0.14, 0.45, 0.18]         # tl, tr, br, bl
# The LCD is 160:144 and fills the black glass edge to edge, with a thin dark border
SCREEN = dict(cx=0.0, cy=0.625, h=1.71)
SCREEN['w'] = SCREEN['h'] * 160 / 144
PANEL = dict(x0=-0.99, x1=0.99, y0=-0.27, y1=1.52, r=0.05)
DPAD = dict(x=-0.62, y=-0.8, span=0.74, arm=0.245, ring=0.42)
BTN = dict(a=(0.78, -0.66), b=(0.38, -0.86), r=0.18)
PILL = dict(x=-0.62, y=-1.35, w=0.4, h=0.12)
SPK = dict(x=0.83, y=-1.19, r=0.29)
PORT = dict(x=0.0, w=0.38, h=0.12)
HOLES = [(-1.06, -0.4), (0.06, -0.44), (-1.07, -1.22), (-0.14, -1.06), (0.42, -1.2)]
BAY = dict(w=2.06, d=0.4, h=0.2, z=-0.06, slotW=1.8, slotD=0.24)


def lin(h):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return tuple(c ** 2.2 for c in (r, g, b))


def mat(name, hexcol, rough=0.4, metal=0.0, trans=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*lin(hexcol), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    try:
        b.inputs['Transmission Weight'].default_value = trans
    except KeyError:
        pass
    return m


M = {
    'shell': mat('shell_frost', '#d6dade', 0.45, 0, 0.9),
    'panel': mat('panel_black', '#060607', 0.15),
    'screen': mat('screen_off', '#050707', 0.05),
    'dpad': mat('dpad_black', '#1a1b1e', 0.4),
    'red': mat('btn_red', '#e0402e', 0.4),
    'blue': mat('pill_blue', '#26a9d6', 0.25),
    'dark': mat('speaker_dark', '#1e2024', 0.45),
    'ring': mat('ring_clear', '#c4c8cc', 0.3, 0, 0.7),
}


# ---------------------------------------------------------------- helpers
def rrect(w, h, r, cx=0.0, cy=0.0, seg=10):
    """Rounded rect outline, CCW. Fixed vertex count per corner so offset rings line up for lofting."""
    tl, tr, br, bl = [max(v, 0.004) for v in r]
    pts = []

    def arc(ccx, ccy, rad, a0):
        for i in range(seg + 1):
            a = a0 + (PI / 2) * i / seg
            pts.append((ccx + rad * math.cos(a), ccy + rad * math.sin(a)))
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2
    arc(x1 - br, y0 + br, br, -PI / 2)
    arc(x1 - tr, y1 - tr, tr, 0)
    arc(x0 + tl, y1 - tl, tl, PI / 2)
    arc(x0 + bl, y0 + bl, bl, PI)
    return pts


def loft(bm, ring_fn, prof):
    """prof = [(z, inset)...] back to front; ring_fn(inset) -> outline points. Closed with flat caps."""
    rings = []
    for z, ins in prof:
        rings.append([bm.verts.new((x, y, z)) for x, y in ring_fn(ins)])
    n = len(rings[0])
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    return bm


def prism(bm, pts, z0, z1, bevel=0.0, seg=3):
    n = len(pts)
    b = [bm.verts.new((x, y, z0)) for x, y in pts]
    t = [bm.verts.new((x, y, z1)) for x, y in pts]
    bf = bm.faces.new(list(reversed(b)))
    tf = bm.faces.new(t)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((b[i], b[j], t[j], t[i]))
    if bevel > 0:
        edges = list({e for f in (bf, tf) for e in f.edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, offset_type='OFFSET', segments=seg, profile=0.5, affect='EDGES')
    return bm


def lathe(bm, prof, steps=40, ox=0.0, oy=0.0, oz=0.0):
    verts = [bm.verts.new((r, 0, z)) for r, z in prof]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * PI, steps=steps, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(ox, oy, oz))
    return bm


def merge_into(bm, sub):
    tmp = bpy.data.meshes.new('tmp')
    sub.to_mesh(tmp)
    sub.free()
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)


def finish(name, bm, loc=(0, 0, 0), material=None, angle=35):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    col.objects.link(ob)
    if material:
        ob.data.materials.append(material)
    smooth(ob, angle)
    return ob


def smooth(ob, angle=35):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))


def cutter(pts, z0, z1):
    bm = bmesh.new()
    prism(bm, pts, z0, z1)
    me = bpy.data.meshes.new('cut')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('cut', me)
    col.objects.link(ob)
    return ob


def circle(r, cx=0.0, cy=0.0, n=48):
    return [(cx + r * math.cos(2 * PI * i / n), cy + r * math.sin(2 * PI * i / n)) for i in range(n)]


def boolean(target, cutters):
    for c in cutters:
        m = target.modifiers.new('cut', 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.solver = 'EXACT'
        m.object = c
        bpy.context.view_layer.objects.active = target
        bpy.ops.object.modifier_apply(modifier=m.name)
        bpy.data.objects.remove(c, do_unlink=True)


# ---------------------------------------------------------------- body: back shell + slightly inset front plate
# Side profile from the back to the front face: soft back bevel, a fine parting groove, a ledge where the front plate
# steps in, then the front bevel. Each line catches the fresnel and reads as the stacked layered edge in the photos.
def ring(ins):
    return rrect(W - 2 * ins, H - 2 * ins, [max(r - ins, 0.02) for r in RADII])


B0 = -D / 2
prof = [
    (B0, 0.06), (B0 + 0.012, 0.03), (B0 + 0.035, 0.008), (B0 + 0.06, 0.0),
    (-0.075, 0.0), (-0.068, 0.012), (-0.056, 0.012), (-0.049, 0.0),      # parting groove
    (0.035, 0.0), (0.042, 0.016), (0.05, 0.022),                          # ledge: front plate steps in
    (FRONT - 0.07, 0.022), (FRONT - 0.03, 0.03), (FRONT - 0.012, 0.05), (FRONT - 0.003, 0.068), (FRONT, 0.082),
]
bm = loft(bmesh.new(), ring, prof)
body = finish('body', bm, material=M['shell'], angle=30)

# Recesses cut into the front: D-pad dish, button wells, pill socket, speaker dish, standoff pits, USB-C opening.
cuts = [
    cutter(circle(DPAD['ring'], DPAD['x'], DPAD['y'], 72), FRONT - 0.022, FRONT + 0.1),
    cutter(circle(BTN['r'] + 0.045, *BTN['a']), FRONT - 0.03, FRONT + 0.1),
    cutter(circle(BTN['r'] + 0.045, *BTN['b']), FRONT - 0.03, FRONT + 0.1),
    cutter(rrect(PILL['w'] + 0.08, PILL['h'] + 0.08, [(PILL['h'] + 0.08) / 2 - 0.001] * 4, PILL['x'], PILL['y']), FRONT - 0.03, FRONT + 0.1),
    cutter(circle(SPK['r'], SPK['x'], SPK['y'], 72), FRONT - 0.045, FRONT + 0.1),
]
for (hx, hy) in HOLES:
    cuts.append(cutter(circle(0.034, hx, hy, 20), FRONT - 0.05, FRONT + 0.1))
# USB-C: a stadium hole in the bottom face (extruded along y)
usb = cutter(rrect(PORT['w'], PORT['h'], [PORT['h'] / 2 - 0.001] * 4, PORT['x'], 0.0), -0.3, 0.3)
usb.data.transform(Matrix.Rotation(PI / 2, 4, 'X'))
usb.data.transform(Matrix.Translation((0, -H / 2, -0.03)))
cuts.append(usb)
boolean(body, cuts)
smooth(body, 30)

# ---------------------------------------------------------------- black glass panel + LCD plane
bm = bmesh.new()
prism(bm, rrect(PANEL['x1'] - PANEL['x0'], PANEL['y1'] - PANEL['y0'], [PANEL['r']] * 4, 0, (PANEL['y0'] + PANEL['y1']) / 2),
      FRONT - 0.012, FRONT + 0.003, bevel=0.004, seg=2)
bezel = finish('bezel', bm, material=M['panel'])
# Window under the LCD: the glass is a frame, so its glossy highlights can never land on top of the lit LCD
win = cutter(rrect(SCREEN['w'] - 0.01, SCREEN['h'] - 0.01, [0.004] * 4, SCREEN['cx'], SCREEN['cy']), FRONT - 0.05, FRONT + 0.05)
boolean(bezel, [win])
smooth(bezel, 35)

sw, sh, scx, scy = SCREEN['w'], SCREEN['h'], SCREEN['cx'], SCREEN['cy']
bm = bmesh.new()
vs = [bm.verts.new((scx + sx * sw / 2, scy + sy * sh / 2, FRONT + 0.008)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
f = bm.faces.new(vs)
uv = bm.loops.layers.uv.new('UVMap')
for loop, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
    loop[uv].uv = (u, v)
screen = finish('screen', bm, material=M['screen'])


# ---------------------------------------------------------------- D-pad: chunky plus with chamfered arm ends + centre dimple
def cross(span, arm, c=0.03):
    s, a = span / 2, arm / 2
    return [(-a, s - c), (-a + c, s), (a - c, s), (a, s - c), (a, a), (s - c, a), (s, a - c), (s, -a + c), (s - c, -a), (a, -a),
            (a, -s + c), (a - c, -s), (-a + c, -s), (-a, -s + c), (-a, -a), (-s + c, -a), (-s, -a + c), (-s, a - c), (-s + c, a), (-a, a)][::-1]


bm = bmesh.new()
prism(bm, cross(DPAD['span'], DPAD['arm']), -0.04, 0.085, bevel=0.02, seg=3)
dpad = finish('dpad', bm, loc=(DPAD['x'], DPAD['y'], FRONT - 0.022), material=M['dpad'])
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.11, location=(DPAD['x'], DPAD['y'], FRONT - 0.022 + 0.085 + 0.1 - 0.018), segments=32, ring_count=16)
boolean(dpad, [bpy.context.active_object])
smooth(dpad, 35)


# ---------------------------------------------------------------- A / B: short cylinders, softly rounded top edge
def button(name, x, y):
    r, h = BTN['r'], 0.11
    prof = [(0, -0.03), (r, -0.03), (r, h - 0.03), (r - 0.008, h - 0.012), (r - 0.025, h - 0.002), (r * 0.6, h + 0.004), (0, h + 0.006)]
    bm = lathe(bmesh.new(), prof, 48)
    return finish(name, bm, loc=(x, y, FRONT - 0.03), material=M['red'], angle=50)


btn_a = button('btn_a', *BTN['a'])
btn_b = button('btn_b', *BTN['b'])

# ---------------------------------------------------------------- wells: thin clear collars inside the button / pill sockets
bm = bmesh.new()
for (x, y) in (BTN['a'], BTN['b']):
    r1, r2 = BTN['r'] + 0.008, BTN['r'] + 0.04
    sub = lathe(bmesh.new(), [(r1, FRONT - 0.03), (r2, FRONT - 0.03), (r2, FRONT - 0.012), (r2 - 0.01, FRONT - 0.004), (r1 + 0.008, FRONT - 0.004), (r1, FRONT - 0.012), (r1, FRONT - 0.03)], 48, x, y)
    merge_into(bm, sub)
wells = finish('wells', bm, material=M['ring'], angle=50)

# ---------------------------------------------------------------- on/off pill (blue, glossy)
bm = bmesh.new()
prism(bm, rrect(PILL['w'], PILL['h'], [PILL['h'] / 2 - 0.001] * 4), 0, 0.075, bevel=0.03, seg=4)
start = finish('start', bm, loc=(PILL['x'], PILL['y'], FRONT - 0.03), material=M['blue'], angle=50)

# ---------------------------------------------------------------- USB-C receptacle (seen in the bottom edge)
bm = bmesh.new()
prism(bm, rrect(PORT['w'] - 0.03, PORT['h'] - 0.03, [(PORT['h'] - 0.03) / 2 - 0.001] * 4), 0, 0.14)
sub = bmesh.new()
prism(sub, rrect(PORT['w'] - 0.14, 0.03, [0.01] * 4), 0.13, 0.16)  # tongue
merge_into(bm, sub)
bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(PI / 2, 3, 'X'))
port = finish('port', bm, loc=(PORT['x'], -H / 2 + 0.16, -0.03), material=M['dark'])

# ---------------------------------------------------------------- speaker: dark dish + six slanted rounded slots
bm = lathe(bmesh.new(), [(0, 0), (SPK['r'] - 0.006, 0), (SPK['r'] - 0.006, 0.006), (0, 0.006)], 64)
n = 6
ang = -PI * 0.21                       # slots run top-left to bottom-right
pitch = SPK['r'] * 0.26
for i in range(n):
    off = (i - (n - 1) / 2) * pitch
    half = math.sqrt(max((SPK['r'] - 0.075) ** 2 - off ** 2, 0.01))
    sub = bmesh.new()
    prism(sub, rrect(2 * half, 0.026, [0.012] * 4), 0.006, 0.026, bevel=0.007, seg=2)
    bmesh.ops.rotate(sub, verts=sub.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(ang, 3, 'Z'))
    bmesh.ops.translate(sub, verts=sub.verts, vec=(-off * math.sin(ang), off * math.cos(ang), 0))
    merge_into(bm, sub)
speaker = finish('speaker', bm, loc=(SPK['x'], SPK['y'], FRONT - 0.045), material=M['dark'], angle=40)

# ---------------------------------------------------------------- standoffs: dark rings at the bottom of the pits
bm = bmesh.new()
for (x, y) in HOLES:
    sub = lathe(bmesh.new(), [(0.012, 0), (0.033, 0), (0.033, 0.012), (0.012, 0.012), (0.012, 0)], 20, x, y, FRONT - 0.05)
    merge_into(bm, sub)
screws = finish('screws', bm, material=M['dark'])

# ---------------------------------------------------------------- cartridge bay (frosted collar on the top edge)
bw, bd, bh, bzc, sl_w, sl_d = BAY['w'], BAY['d'], BAY['h'], BAY['z'], BAY['slotW'], BAY['slotD']
bm = bmesh.new()
wall = (bw - sl_w) / 2
fd = (bd - sl_d) / 2
for (cx, cy, w, d) in ((-(sl_w / 2 + wall / 2), 0, wall, bd), ((sl_w / 2 + wall / 2), 0, wall, bd),
                       (0, (sl_d / 2 + fd / 2), sl_w, fd), (0, -(sl_d / 2 + fd / 2), sl_w, fd)):
    sub = bmesh.new()
    prism(sub, rrect(w, d, [0.02] * 4, cx, cy), 0, bh, bevel=0.012, seg=2)
    merge_into(bm, sub)
bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(PI / 2, 3, 'X'))
bmesh.ops.translate(bm, verts=bm.verts, vec=(0, bh, 0))
bay = finish('bay', bm, loc=(0, H / 2 - 0.02, bzc), material=M['shell'])

print([(o.name, len(o.data.polygons)) for o in col.objects])
