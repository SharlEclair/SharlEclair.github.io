/**
 * orbit-sat.js : the satellite for the Harvest "orbit" variants (WP1 of the orbit spec).
 *
 *   makeOrbitSat(THREE, { tier: '25' | 'mid' | '3d', theme, disposables })
 *     -> { group, span, aperture, setTheme(theme), setPose(pose), dispose() }
 *
 * One parametric part table (PRIMS) drives every tier, so all three show the same spacecraft:
 *   mid / 3d : merged meshes (foil, structure, rim, wing cells, wing edges, dish) + inverted-hull ink.
 *              mid and every light theme use a self-lit toon ShaderMaterial (3-step ramp, key light from
 *              upper left in world space); 3d dark shows the PBR build from orbit-sat-pbr.js (MLI blankets,
 *              glassy cells, own reflection environment). Extra fields: setExposure(v), setSunDir(vec3), envIntensity.
 *   25       : the same parts are software-rendered (flat toon + ink edges) into ONE canvas atlas, then shown
 *              as six flat planes (five layers plus a separate dish sprite) with parallax factors.
 * Everything is generated in code (canvas); no downloads, no text anywhere.
 *
 * Conventions:
 *   local +x flight, +y zenith, -y nadir (instrument face), wings along +/-z. Bus length = 1.
 *   setPose angles are radians. wing = angle between panel normal and the camera direction (0 face on).
 *   The face-on boom angle is computed from the world direction to the camera; it defaults to +z (ortho
 *   cameras) and can be overridden with pose.camDir (world vector from the satellite to the camera,
 *   useful for the perspective tier). Call setPose after the group's own transform has been set.
 *   Positive dishYaw rotates the dish about local +y (right handed); in tier 25 it leans the dish to screen right.
 *   Tier 25 parallax: each layer is offset by (factor - 1) * parallax in group-local units.
 */

import { buildPbrSat } from './orbit-sat-pbr.js'

const SPAN = 5.54
const PUSH = 0.022 // inverted hull push (units). Spec 0.012; raised so the ink survives at true size.
const L_DIR = [-0.5, 0.7, 0.5]
const TILE_U = 1.0
const TILE_V = 0.5
const GIMBAL = [-0.3, 0.735, 0]
const DISH_FOCAL_Y = 0.18

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const rad = (d) => (d * Math.PI) / 180

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hexRgb(h) {
  let s = h.replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  const n = parseInt(s, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgbHex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')
function mixHex(a, b, t) {
  const A = hexRgb(a)
  const B = hexRgb(b)
  return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t)
}
const rgba = (hex, a) => {
  const c = hexRgb(hex)
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`
}
const isDark = (th) => th.additive !== false

/** Colour keys used by the parts table, resolved per theme. */
function paletteFor(th) {
  const dark = isDark(th)
  return {
    foil: th.foil,
    foilDark: th.foilDark,
    satDark: th.satDark,
    radiator: dark ? mixHex(th.satDark, '#ffffff', 0.3) : mixHex(th.satDark, th.bg, 0.45),
    band: dark ? mixHex(th.satDark, '#000000', 0.4) : mixHex(th.satDark, th.ink, 0.5),
    black: dark ? '#05060a' : th.ink,
    thread: th.thread,
    dish: dark ? '#d9dee9' : mixHex(th.bg, '#ffffff', 0.55),
    dishIn: dark ? '#a9b2c6' : mixHex(th.bg, th.ink, 0.1),
    strut: dark ? '#8d97ad' : th.ink,
    metal: dark ? '#7b859b' : th.satDark,
    cellFrame: th.cellFrame,
    ink: th.ink,
    paper: th.bg,
  }
}

/* ------------------------------------------------------------------ canvases */

function mkCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Gold foil (dark) or ink cross-hatch on paper (light) into `cv`; grey roughness into `rv`. Returns mean luminance (0..1). */
function paintFoil(cv, rv, th) {
  const dark = isDark(th)
  const W = cv.width
  const H = cv.height
  const c = cv.getContext('2d')
  const r = rv.getContext('2d')
  const rnd = mulberry32(1337)
  const wrap = (x, y, rr, fn) => {
    for (const ox of [-W, 0, W]) {
      if (ox < 0 && x - rr >= 0) continue
      if (ox > 0 && x + rr <= W) continue
      for (const oy of [-H, 0, H]) {
        if (oy < 0 && y - rr >= 0) continue
        if (oy > 0 && y + rr <= H) continue
        fn(x + ox, y + oy)
      }
    }
  }
  const polys = []
  const N = dark ? 330 : 150
  for (let i = 0; i < N; i++) {
    const k = 5 + Math.floor(rnd() * 3)
    const rr = 7 + rnd() * 24
    const pts = []
    for (let j = 0; j < k; j++) {
      const a = ((j + rnd() * 0.55) / k) * Math.PI * 2
      const q = rr * (0.72 + rnd() * 0.5)
      pts.push([Math.cos(a) * q, Math.sin(a) * q])
    }
    polys.push({ x: rnd() * W, y: rnd() * H, rr: rr * 1.3, pts, j: (rnd() * 2 - 1) * 0.22 })
  }
  const creases = []
  for (let i = 0; i < 44; i++) {
    const seg = 3 + Math.floor(rnd() * 3)
    let a = rnd() * Math.PI
    const pts = [[0, 0]]
    let px = 0
    let py = 0
    for (let s = 0; s < seg; s++) {
      a += (rnd() - 0.5) * 1.1
      const l = 12 + rnd() * 30
      px += Math.cos(a) * l
      py += Math.sin(a) * l
      pts.push([px, py])
    }
    creases.push({ x: rnd() * W, y: rnd() * H, pts, rr: 110 })
  }
  const path = (ctx, ox, oy, pts, close) => {
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(ox + p[0], oy + p[1]) : ctx.moveTo(ox + p[0], oy + p[1])))
    if (close) ctx.closePath()
  }

  r.fillStyle = '#858585'
  r.fillRect(0, 0, W, H)
  if (dark) {
    c.fillStyle = th.foil
    c.fillRect(0, 0, W, H)
    for (const p of polys) {
      const col = p.j > 0 ? mixHex(th.foil, '#fff3cf', p.j * 1.9) : mixHex(th.foil, th.foilDark, -p.j * 2.2)
      const g = Math.round(clamp(0.52 - p.j * 0.8, 0.35, 0.7) * 255)
      wrap(p.x, p.y, p.rr, (x, y) => {
        path(c, x, y, p.pts, true)
        c.fillStyle = rgba(col, 0.55)
        c.fill()
        path(r, x, y, p.pts, true)
        r.fillStyle = `rgba(${g},${g},${g},0.8)`
        r.fill()
      })
    }
    for (const cr of creases) {
      wrap(cr.x, cr.y, cr.rr, (x, y) => {
        path(c, x, y, cr.pts, false)
        c.strokeStyle = rgba(th.foilDark, 0.42)
        c.lineWidth = 1.2
        c.stroke()
        path(c, x + 1.2, y + 1.2, cr.pts, false)
        c.strokeStyle = 'rgba(255,244,208,0.22)'
        c.lineWidth = 1
        c.stroke()
        path(r, x, y, cr.pts, false)
        r.strokeStyle = 'rgba(178,178,178,0.9)'
        r.lineWidth = 2
        r.stroke()
      })
    }
    for (let i = 0; i < 3; i++) {
      const x = Math.round((W * (i + 0.5)) / 3)
      c.fillStyle = rgba(th.foilDark, 0.62)
      c.fillRect(x - 1, 0, 2.5, H)
      c.fillStyle = 'rgba(255,240,200,0.28)'
      c.fillRect(x + 2, 0, 1.5, H)
      r.fillStyle = 'rgb(165,165,165)'
      r.fillRect(x - 2, 0, 5, H)
    }
  } else {
    c.fillStyle = th.bg
    c.fillRect(0, 0, W, H)
    for (const p of polys) {
      wrap(p.x, p.y, p.rr, (x, y) => {
        path(c, x, y, p.pts, true)
        c.fillStyle = rgba(th.ink, 0.045 + Math.abs(p.j) * 0.2)
        c.fill()
      })
    }
    c.strokeStyle = rgba(th.ink, 0.4)
    c.lineWidth = 1.5
    const P = 16
    c.beginPath()
    for (let k = -H; k < W + H; k += P) {
      c.moveTo(k, 0)
      c.lineTo(k + H, H)
    }
    c.stroke()
    for (const cr of creases) {
      wrap(cr.x, cr.y, cr.rr, (x, y) => {
        path(c, x, y, cr.pts, false)
        c.strokeStyle = rgba(th.ink, 0.45)
        c.lineWidth = 1.2
        c.stroke()
      })
    }
    for (let i = 0; i < 3; i++) {
      const x = Math.round((W * (i + 0.5)) / 3)
      c.fillStyle = rgba(th.thread, 0.85)
      c.fillRect(x - 1, 0, 3, H)
    }
  }
  // mean luminance (linear-ish) used by the toon two-tone foil
  const d = c.getImageData(0, 0, W, H).data
  let s = 0
  const step = 4 * 7
  let n = 0
  for (let i = 0; i < d.length; i += step) {
    const lr = Math.pow(d[i] / 255, 2.2)
    const lg = Math.pow(d[i + 1] / 255, 2.2)
    const lb = Math.pow(d[i + 2] / 255, 2.2)
    s += lr * 0.2126 + lg * 0.7152 + lb * 0.0722
    n++
  }
  return s / n
}

/** 6 x 5 solar cell panel (256 x 128). */
function paintCells(cv, th) {
  const W = cv.width
  const H = cv.height
  const c = cv.getContext('2d')
  const rnd = mulberry32(99)
  const fx = 6
  const fy = 4
  c.fillStyle = th.cell
  c.fillRect(0, 0, W, H)
  const cw = (W - fx * 2) / 6
  const ch = (H - fy * 2) / 5
  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < 6; i++) {
      const x = fx + i * cw
      const y = fy + j * ch
      c.fillStyle = rgba(mixHex(th.cell, th.cellGrid, 0.1 + rnd() * 0.12), 0.8)
      c.fillRect(x + 1.5, y + 1.5, cw - 3, ch - 3)
      c.fillStyle = rgba(th.cellGrid, 0.4)
      c.fillRect(x + cw * 0.34, y + 1.5, 1, ch - 3)
      c.fillRect(x + cw * 0.66, y + 1.5, 1, ch - 3)
    }
  }
  c.strokeStyle = th.cellGrid
  c.lineWidth = 3
  c.beginPath()
  for (let i = 1; i < 6; i++) {
    c.moveTo(fx + i * cw, fy)
    c.lineTo(fx + i * cw, H - fy)
  }
  for (let j = 1; j < 5; j++) {
    c.moveTo(fx, fy + j * ch)
    c.lineTo(W - fx, fy + j * ch)
  }
  c.stroke()
  c.strokeStyle = th.cellFrame
  c.lineWidth = fx
  c.strokeRect(fx / 2, fx / 2, W - fx, H - fx)
  c.lineWidth = 3
  c.strokeRect(fx, fy, W - fx * 2, H - fy * 2)
  c.fillStyle = th.cellFrame
  c.fillRect(0, 0, W, fy)
  c.fillRect(0, H - fy, W, fy)
  c.fillRect(0, 0, fx, H)
  c.fillRect(W - fx, 0, fx, H)
}

/** Diagonal sheen band on black (one wide soft band, black edges so ClampToEdge shows no repeats). */
function paintSheen(cv) {
  const W = cv.width
  const H = cv.height
  const c = cv.getContext('2d')
  c.fillStyle = '#000'
  c.fillRect(0, 0, W, H)
  c.save()
  c.transform(1, 0, -0.4, 1, 0.2 * W, 0)
  const g = c.createLinearGradient(W * 0.36, 0, W * 0.64, 0)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.5, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = g
  c.fillRect(-W, 0, W * 3, H)
  c.restore()
}

/* ------------------------------------------------------------------ parts table */

function buildPrims(T) {
  const V = (x, y, z) => new T.Vector3(x, y, z)
  const place = (pos, eul = [0, 0, 0]) =>
    new T.Matrix4().compose(V(...pos), new T.Quaternion().setFromEuler(new T.Euler(...eul)), V(1, 1, 1))
  const axis = (a, b) => {
    const A = V(...a)
    const B = V(...b)
    const d = B.clone().sub(A)
    const len = d.length()
    const q = new T.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize())
    return { m: new T.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, V(1, 1, 1)), len }
  }
  const out = []
  const add = (o) => {
    out.push({ grp: 'body', layer: 'body', mat: 'struct', key: 'satDark', mul: 1, hull: false, ...o })
  }
  const cyl = (a, b, rt, rb, o = {}) => {
    const { m, len } = axis(a, b)
    add({ kind: 'cyl', dims: [rt, rb, len, o.seg || 14, !!o.open], m, ...o })
  }
  const box = (dims, pos, o = {}) => add({ kind: 'box', dims, m: place(pos, o.eul), ...o })

  // bus: foil on the four side faces, plain caps top and bottom
  box([1.0, 0.8, 0.8], [0, 0, 0], { mat: 'foil', key: '#ffffff', faces: [0, 1, 4, 5], uv: 'foil', hull: true })
  box([1.0, 0.8, 0.8], [0, 0, 0], { faces: [2, 3], key: 'satDark' })
  box([0.96, 0.02, 0.76], [0, 0.41, 0], { key: 'radiator', hull: true })
  for (const x of [-0.36, -0.18, 0, 0.18, 0.36]) box([0.014, 0.006, 0.7], [x, 0.423, 0], { key: 'band' })
  box([1.02, 0.08, 0.82], [0, 0.22, 0], { key: 'band', hull: true })
  // imaging instrument on the nadir face, aperture with a thread coloured rim
  box([0.42, 0.18, 0.36], [0.12, -0.49, 0], { key: 'satDark', hull: true })
  box([0.3, 0.003, 0.24], [0.12, -0.5815, 0], { key: 'black' })
  const rimY = -0.583
  for (const s of [-1, 1]) {
    box([0.324, 0.006, 0.012], [0.12, rimY, s * 0.126], { mat: 'rim', key: 'thread' })
    box([0.012, 0.006, 0.24], [0.12 + s * 0.156, rimY, 0], { mat: 'rim', key: 'thread' })
  }
  box([0.02, 0.07, 0.36], [0.34, -0.615, 0], { key: 'satDark' })
  // star trackers on the top front edge, tilted 30 degrees outward
  for (const s of [-1, 1]) {
    const st = [0.37, 0.42, s * 0.27]
    const dir = [Math.sin(rad(30)), Math.cos(rad(30)), 0]
    const en = [st[0] + dir[0] * 0.08, st[1] + dir[1] * 0.08, st[2]]
    cyl(st, en, 0.05, 0.05, { key: 'satDark', seg: 16 })
    cyl(en, [en[0] + dir[0] * 0.005, en[1] + dir[1] * 0.005, en[2]], 0.042, 0.042, { key: 'black', seg: 16 })
    cyl([st[0] - dir[0] * 0.01, st[1] - dir[1] * 0.01, st[2]], st, 0.06, 0.06, { key: 'band', seg: 16 })
  }
  // thrusters on the rear (-x) face corners
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const y = sy * 0.27
      const z = sz * 0.27
      cyl([-0.56, y, z], [-0.5, y, z], 0.012, 0.03, { key: 'satDark', seg: 12 })
      cyl([-0.561, y, z], [-0.557, y, z], 0.022, 0.022, { key: 'black', seg: 12 })
    }
  }
  // mast and gimbal for the high-gain dish
  cyl([-0.3, 0.42, 0], [-0.3, 0.7, 0], 0.02, 0.02, { key: 'metal' })
  cyl([-0.3, 0.7, 0], [GIMBAL[0], GIMBAL[1], 0], 0.038, 0.038, { key: 'satDark', seg: 16 })
  // antenna boom, 35 degrees back and up from the front top corner
  const P0 = [0.5, 0.4, -0.4]
  const d = [-Math.cos(rad(35)), Math.sin(rad(35)), 0]
  const P1 = [P0[0] + d[0] * 1.1, P0[1] + d[1] * 1.1, P0[2]]
  cyl(P0, [P0[0] + d[0] * 0.07, P0[1] + d[1] * 0.07, P0[2]], 0.022, 0.022, { key: 'satDark', layer: 'boomF', seg: 12 })
  cyl(P0, P1, 0.008, 0.008, { key: 'metal', layer: 'boomF', seg: 8 })
  add({ kind: 'sph', dims: [0.02], m: place(P1), key: 'metal', layer: 'boomF' })
  // yoke booms and drive housings, wings
  for (const s of [-1, 1]) {
    const L = s > 0 ? 'boomB' : 'boomF'
    cyl([0, 0, s * 0.4], [0, 0, s * 0.85], 0.025, 0.025, { key: 'metal', layer: L })
    box([0.14, 0.12, 0.1], [0, 0, s * 0.47], { key: 'satDark', layer: L })
    const W = s > 0 ? 'wingB' : 'wingF'
    cyl([0, -0.016, s * 0.85], [0, -0.016, s * 2.77], 0.01, 0.01, { grp: 'wing', layer: W, key: 'satDark', seg: 8 })
    for (let i = 0; i < 3; i++) {
      const z = s * (0.85 + 0.31 + i * 0.65)
      const dims = [0.7, 0.012, 0.62]
      const base = { grp: 'wing', layer: W }
      box(dims, [0, 0, z], { ...base, mat: 'cell', key: '#ffffff', faces: [2], hull: true })
      box(dims, [0, 0, z], { ...base, mat: 'cell', key: '#ffffff', mul: 0.42, faces: [3] })
      box(dims, [0, 0, z], { ...base, key: 'cellFrame', faces: [0, 1, 4, 5] })
    }
  }
  // high-gain dish (axis +y in its own frame, vertex 0.05 above the gimbal), struts and feed horn
  const dm = place([0, 0.05, 0])
  add({ kind: 'dish', part: 'outer', dims: [], m: dm, grp: 'dish', layer: 'dish', mat: 'dish', key: 'dish', hull: true })
  add({ kind: 'dish', part: 'inner', dims: [], m: dm, grp: 'dish', layer: 'dish', mat: 'dish', key: 'dishIn' })
  cyl([0, 0, 0], [0, 0.05, 0], 0.028, 0.028, { grp: 'dish', layer: 'dish', mat: 'dish', key: 'metal', seg: 14 })
  const yFeed = 0.05 + DISH_FOCAL_Y
  for (let i = 0; i < 3; i++) {
    const a = rad(90 + i * 120)
    cyl([Math.cos(a) * 0.26, 0.05 + 0.07, Math.sin(a) * 0.26], [0, yFeed, 0], 0.006, 0.006, {
      grp: 'dish', layer: 'dish', mat: 'dish', key: 'strut', seg: 6,
    })
  }
  cyl([0, yFeed - 0.04, 0], [0, yFeed + 0.012, 0], 0.025, 0.009, { grp: 'dish', layer: 'dish', mat: 'dish', key: 'metal', seg: 14 })
  cyl([0, yFeed - 0.041, 0], [0, yFeed - 0.037, 0], 0.021, 0.021, { grp: 'dish', layer: 'dish', mat: 'dish', key: 'black', seg: 14 })
  return out
}

/** Closed revolved shell. strips: arrays of [r, y, nr, ny]. Winding is auto-oriented from the normals. */
function latheGeo(T, strips, segs) {
  const P = []
  const N = []
  const U = []
  const pt = (s, i, th) => {
    const c = Math.cos(th)
    const sn = Math.sin(th)
    const v = strips[s][i]
    return { p: [v[0] * c, v[1], v[0] * sn], n: [v[2] * c, v[3], v[2] * sn] }
  }
  const tri = (a, b, c) => {
    const e1 = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]]
    const e2 = [c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]]
    const cx = e1[1] * e2[2] - e1[2] * e2[1]
    const cy = e1[2] * e2[0] - e1[0] * e2[2]
    const cz = e1[0] * e2[1] - e1[1] * e2[0]
    if (Math.abs(cx) + Math.abs(cy) + Math.abs(cz) < 1e-12) return
    const nn = [(a.n[0] + b.n[0] + c.n[0]), (a.n[1] + b.n[1] + c.n[1]), (a.n[2] + b.n[2] + c.n[2])]
    const flip = cx * nn[0] + cy * nn[1] + cz * nn[2] < 0
    const order = flip ? [a, c, b] : [a, b, c]
    for (const q of order) {
      P.push(...q.p)
      N.push(...q.n)
      U.push(0, 0)
    }
  }
  for (let s = 0; s < strips.length; s++) {
    for (let i = 0; i < strips[s].length - 1; i++) {
      for (let j = 0; j < segs; j++) {
        const t0 = (j / segs) * Math.PI * 2
        const t1 = ((j + 1) / segs) * Math.PI * 2
        const A = pt(s, i, t0)
        const B = pt(s, i + 1, t0)
        const C = pt(s, i + 1, t1)
        const D = pt(s, i, t1)
        tri(A, B, C)
        tri(A, C, D)
      }
    }
  }
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3))
  g.setAttribute('normal', new T.Float32BufferAttribute(N, 3))
  g.setAttribute('uv', new T.Float32BufferAttribute(U, 2))
  return g
}

/** Per-segment normals along a profile, averaged at joints inside one strip. */
function stripNormals(pts, smooth) {
  const segN = []
  for (let i = 0; i < pts.length - 1; i++) {
    const tr = pts[i + 1][0] - pts[i][0]
    const ty = pts[i + 1][1] - pts[i][1]
    const l = Math.hypot(tr, ty) || 1
    segN.push([ty / l, -tr / l])
  }
  return pts.map((p, i) => {
    const a = i > 0 && smooth !== false ? segN[i - 1] : null
    const b = i < segN.length ? segN[i] : null
    const nr = (a ? a[0] : 0) + (b ? b[0] : 0)
    const ny = (a ? a[1] : 0) + (b ? b[1] : 0)
    const l = Math.hypot(nr, ny) || 1
    return [p[0], p[1], nr / l, ny / l]
  })
}

const DISH_R = 0.26
const DISH_DEPTH = 0.07
const DISH_T = 0.012
function dishProfile() {
  const f = (DISH_R * DISH_R) / (4 * DISH_DEPTH)
  const inner = (r) => (r * r) / (4 * f)
  const outer = []
  const innerP = []
  const n = 8
  for (let i = 0; i <= n; i++) {
    const r = (i / n) * DISH_R
    outer.push([r, inner(r) - DISH_T])
  }
  for (let i = n; i >= 0; i--) {
    const r = (i / n) * DISH_R
    innerP.push([r, inner(r)])
  }
  return { outer, innerP }
}

function dishGeo(T, part, inf) {
  const { outer, innerP } = dishProfile()
  if (inf) {
    // hull: one closed loop, mitre offset outward by inf
    const loop = [...outer, ...innerP]
    const nn = stripNormals(loop, true)
    const pts = nn.map((v, i) => [v[0] + v[2] * inf, v[1] + v[3] * inf, v[2], v[3]])
    pts[0][0] = 0
    pts[pts.length - 1][0] = 0
    return latheGeo(T, [pts], 32).toNonIndexed()
  }
  if (part === 'outer') {
    const rim = [outer[outer.length - 1], innerP[0]]
    return latheGeo(T, [stripNormals(outer), stripNormals(rim)], 32).toNonIndexed()
  }
  return latheGeo(T, [stripNormals(innerP)], 32).toNonIndexed()
}

/** Non-indexed local-space geometry (position, normal, uv) for a part, optionally inflated for the ink hull. */
function primGeo(T, p, inf = 0) {
  let g
  if (p.kind === 'box') {
    const [w, h, d] = p.dims
    g = new T.BoxGeometry(w + 2 * inf, h + 2 * inf, d + 2 * inf)
    if (p.faces && !inf) {
      const idx = g.index.array
      const out = []
      for (const f of p.faces) for (let k = 0; k < 6; k++) out.push(idx[f * 6 + k])
      g.setIndex(out)
    }
    if (p.uv === 'foil' && !inf) {
      const pos = g.attributes.position
      const uv = g.attributes.uv
      for (let i = 0; i < pos.count; i++) {
        const f = Math.floor(i / 4)
        const x = pos.getX(i)
        const y = pos.getY(i)
        const z = pos.getZ(i)
        const o = f * 0.37
        if (f < 2) uv.setXY(i, (z + o) / TILE_U, (y + o) / TILE_V)
        else if (f >= 4) uv.setXY(i, (x + o) / TILE_U, (y + o * 0.5) / TILE_V)
        else uv.setXY(i, (x + o) / TILE_U, (z + o) / TILE_V)
      }
    }
    g = g.toNonIndexed()
  } else if (p.kind === 'cyl') {
    const [rt, rb, h, seg, open] = p.dims
    g = new T.CylinderGeometry(rt + inf, rb + inf, h + 2 * inf, seg, 1, open).toNonIndexed()
  } else if (p.kind === 'sph') {
    g = new T.SphereGeometry(p.dims[0] + inf, 14, 10).toNonIndexed()
  } else {
    g = dishGeo(T, p.part, inf)
  }
  return g
}

/** Merge parts into one geometry with a per-vertex colour attribute (recoloured per theme via userData.segs). */
function mergePrims(T, list, opt = {}) {
  const pos = []
  const nrm = []
  const uv = []
  const uv1 = []
  const segs = []
  let count = 0
  const v = new T.Vector3()
  for (const p of list) {
    const g = primGeo(T, p, opt.inflate || 0)
    g.applyMatrix4(p.m)
    const pa = g.attributes.position
    const na = g.attributes.normal
    const ua = g.attributes.uv
    const n = pa.count
    for (let i = 0; i < n; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i))
      nrm.push(na.getX(i), na.getY(i), na.getZ(i))
      uv.push(ua.getX(i), ua.getY(i))
      if (opt.uv1) {
        v.set(pa.getX(i), pa.getY(i), pa.getZ(i))
        uv1.push((Math.abs(v.z) - 0.85) / 1.92, v.x / 0.7 + 0.5)
      } else uv1.push(0, 0)
    }
    segs.push({ start: count, count: n, key: p.key, mul: p.mul ?? 1 })
    count += n
    g.dispose()
  }
  const geo = new T.BufferGeometry()
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
  if (!opt.hull) {
    geo.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3))
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
    geo.setAttribute('uv1', new T.Float32BufferAttribute(uv1, 2))
    geo.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(count * 3), 3))
    geo.userData.segs = segs
  }
  return geo
}

function recolor(T, geo, pal) {
  const col = geo.attributes.color
  const c = new T.Color()
  for (const s of geo.userData.segs) {
    c.set(pal[s.key] ?? s.key)
    for (let i = s.start; i < s.start + s.count; i++) col.setXYZ(i, c.r * s.mul, c.g * s.mul, c.b * s.mul)
  }
  col.needsUpdate = true
}

/* ------------------------------------------------------------------ solid tiers (mid, 3d) */

const TOON_VERT = /* glsl */ `
attribute vec2 uv1;
varying vec3 vN;
varying vec2 vUv;
varying vec2 vUv1;
varying vec3 vCol;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  vUv1 = uv1;
  vCol = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const TOON_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uUseMap;
uniform float uCell;
uniform float uFoil;
uniform float uFoilLum;
uniform float uMode;
uniform vec3 uL;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform vec3 uSheenCol;
uniform vec2 uSheen;
uniform float uBright;
uniform float uPx;
varying vec3 vN;
varying vec2 vUv;
varying vec2 vUv1;
varying vec3 vCol;
void main() {
  vec3 n = normalize(vN);
  float nl = dot(n, normalize(uL));
  float w = 0.025;
  float sMid = smoothstep(0.02 - w, 0.02 + w, nl);
  float sLit = smoothstep(0.5 - w, 0.5 + w, nl);
  vec3 col = vCol;
  if (uUseMap > 0.5) col *= texture2D(uMap, vUv).rgb;
  vec3 outc;
  if (uMode < 0.5) {
    if (uFoil > 0.5) {
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float q = smoothstep(uFoilLum - 0.012, uFoilLum + 0.012, l);
      col *= mix(0.84, 1.14, q);
    }
    if (uCell > 0.5) {
      col *= uBright;
      float dd = vUv1.x + (vUv1.y - 0.5) * 0.4 - uSheen.x;
      col += uSheenCol * (exp(-dd * dd / 0.012) * uSheen.y);
    }
    float ramp = 0.35 + 0.35 * sMid + 0.30 * sLit;
    outc = col * ramp + vec3(0.006, 0.012, 0.03) * (1.0 - sMid);
  } else {
    if (uCell > 0.5) col = mix(col, uPaper, (1.0 - uBright) * 0.55);
    float t = fract((gl_FragCoord.x + gl_FragCoord.y) / uPx);
    float d = min(t, 1.0 - t);
    float fw = fwidth((gl_FragCoord.x + gl_FragCoord.y) / uPx);
    float line = 1.0 - smoothstep(0.17 - fw, 0.17 + fw, d);
    float inkAmt = (1.0 - sMid) * (0.1 + 0.62 * line) + sMid * (1.0 - sLit) * 0.09;
    outc = mix(col, uInk, inkAmt);
  }
  gl_FragColor = vec4(outc, 1.0);
  #include <colorspace_fragment>
}`

function makeSolid(ctx) {
  const { T, tier, prims, own, group, getTheme } = ctx
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const std = tier === '3d'

  // textures
  const foilCv = mkCanvas(512, 256)
  const roughCv = mkCanvas(512, 256)
  const cellCv = mkCanvas(256, 128)
  const sheenCv = mkCanvas(256, 64)
  paintSheen(sheenCv)
  const mkTex = (cv, srgb, repeat) => {
    const t = new T.CanvasTexture(cv)
    t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace
    t.anisotropy = 8
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping
    own.push(t)
    return t
  }
  const foilTex = mkTex(foilCv, true, true)
  const roughTex = mkTex(roughCv, false, true)
  const cellTex = mkTex(cellCv, true, false)
  const sheenTex = mkTex(sheenCv, true, false)
  sheenTex.channel = 1
  // geometry
  const byGrp = (g) => prims.filter((p) => p.grp === g)
  const mats = (list, m) => list.filter((p) => (Array.isArray(m) ? m.includes(p.mat) : p.mat === m))
  const body = byGrp('body')
  const wing = byGrp('wing')
  const dish = byGrp('dish')
  const geos = {
    foil: mergePrims(T, mats(body, 'foil')),
    struct: mergePrims(T, mats(body, 'struct')),
    rim: mergePrims(T, mats(body, 'rim')),
    cell: mergePrims(T, mats(wing, 'cell'), { uv1: true }),
    edge: mergePrims(T, mats(wing, 'struct'), { uv1: true }),
    dish: mergePrims(T, dish),
  }
  const hullGeos = {
    body: mergePrims(T, body.filter((p) => p.hull), { hull: true, inflate: PUSH }),
    wing: mergePrims(T, wing.filter((p) => p.hull), { hull: true, inflate: PUSH }),
    dish: mergePrims(T, dish.filter((p) => p.hull), { hull: true, inflate: PUSH }),
  }
  // the hull builder inflates by the same call for every part; dish hull uses the closed loop
  Object.values(geos).forEach((g) => own.push(g))
  Object.values(hullGeos).forEach((g) => own.push(g))

  // materials: shared toon uniforms
  const common = {
    uL: { value: new T.Vector3(...L_DIR).normalize() },
    uInk: { value: new T.Color() },
    uPaper: { value: new T.Color() },
    uMode: { value: 0 },
    uPx: { value: 3.4 * dpr },
    uSheenCol: { value: new T.Color() },
    uSheen: { value: new T.Vector2(0, 0) },
    uBright: { value: 1 },
    uFoilLum: { value: 0.4 },
  }
  const toon = (extra) => {
    const m = new T.ShaderMaterial({
      vertexShader: TOON_VERT,
      fragmentShader: TOON_FRAG,
      vertexColors: true,
      uniforms: { uMap: { value: null }, uUseMap: { value: 0 }, uCell: { value: 0 }, uFoil: { value: 0 }, ...common },
    })
    if (extra.map) {
      m.uniforms.uMap.value = extra.map
      m.uniforms.uUseMap.value = 1
    }
    if (extra.cell) m.uniforms.uCell.value = 1
    if (extra.foil) m.uniforms.uFoil.value = 1
    own.push(m)
    return m
  }
  const toonSet = {
    foil: toon({ map: foilTex, foil: true }),
    struct: toon({}),
    cell: toon({ map: cellTex, cell: true }),
    edge: toon({}),
    dish: toon({}),
    rim: new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  }
  own.push(toonSet.rim)
  const hullMat = new T.MeshBasicMaterial({ color: 0x000000, side: T.BackSide, toneMapped: false })
  own.push(hullMat)

  // scene graph
  const bodyG = new T.Group()
  group.add(bodyG)
  const wingPivot = new T.Group()
  bodyG.add(wingPivot)
  const dishYaw = new T.Group()
  dishYaw.position.set(...GIMBAL)
  bodyG.add(dishYaw)
  const dishPitch = new T.Group()
  dishYaw.add(dishPitch)
  const aperture = new T.Object3D()
  aperture.position.set(0.12, -0.586, 0)
  bodyG.add(aperture)

  const meshes = []
  const mk = (kind, geo, parent) => {
    const m = new T.Mesh(geo, toonSet[kind])
    m.frustumCulled = false
    parent.add(m)
    meshes.push({ m, kind })
    return m
  }
  mk('foil', geos.foil, bodyG)
  mk('struct', geos.struct, bodyG)
  mk('rim', geos.rim, bodyG)
  mk('cell', geos.cell, wingPivot)
  mk('edge', geos.edge, wingPivot)
  mk('dish', geos.dish, dishPitch)
  const hulls = [
    new T.Mesh(hullGeos.body, hullMat),
    new T.Mesh(hullGeos.wing, hullMat),
    new T.Mesh(hullGeos.dish, hullMat),
  ]
  bodyG.add(hulls[0])
  wingPivot.add(hulls[1])
  dishPitch.add(hulls[2])
  hulls.forEach((h) => (h.frustumCulled = false))

  const _m = new T.Matrix4()
  const _v = new T.Vector3()
  let a0 = 0
  const state = { wingBright: 1 }

  const api = {
    setTheme(th) {
      const dark = isDark(th)
      const pal = paletteFor(th)
      const lum = paintFoil(foilCv, roughCv, th)
      paintCells(cellCv, th)
      foilTex.needsUpdate = true
      roughTex.needsUpdate = true
      cellTex.needsUpdate = true
      for (const k of ['struct', 'edge', 'cell', 'dish']) recolor(T, geos[k], pal)
      recolor(T, geos.foil, pal)
      recolor(T, geos.rim, pal)
      common.uInk.value.set(th.ink)
      common.uPaper.value.set(th.bg)
      common.uMode.value = dark ? 0 : 1
      common.uFoilLum.value = lum
      common.uSheenCol.value.set(dark ? '#9fb4ff' : '#ffffff').multiplyScalar(dark ? 0.55 : 0)
      toonSet.rim.color.set(th.thread)
      hullMat.color.set(dark ? '#000000' : th.ink)
      // tier 3d on the dark theme shows the PBR build (orbit-sat-pbr.js) instead of the toon meshes
      const useStd = std && dark
      if (useStd && !state.pbr) state.pbr = buildPbrSat(T, { bodyG, wingPivot, dishPitch }, own)
      if (state.pbr) {
        state.pbr.setTheme(th)
        state.pbr.setVisible(useStd)
      }
      for (const { m, kind } of meshes) {
        m.material = toonSet[kind]
        m.visible = !useStd
      }
      hulls.forEach((h) => (h.visible = !useStd))
      state.dark = dark
      state.useStd = useStd
      api.setPose(state.pose || {})
    },
    setPose(pose = {}) {
      state.pose = pose
      const { yaw = 0, pitch = 0, roll = 0, wing: w = 0, dishYaw: dy = 0, dishPitch: dp = rad(30), camDir } = pose
      bodyG.rotation.set(roll, yaw, pitch, 'YZX')
      bodyG.updateMatrix()
      bodyG.updateWorldMatrix(true, false)
      _m.copy(bodyG.matrixWorld).invert()
      if (camDir) _v.copy(camDir)
      else _v.set(0, 0, 1)
      _v.transformDirection(_m)
      if (Math.hypot(_v.x, _v.y) > 1e-4) a0 = Math.atan2(-_v.x, _v.y)
      wingPivot.rotation.z = a0 + w
      dishYaw.rotation.y = dy
      dishPitch.rotation.z = dp - Math.PI / 2
      const cw = Math.cos(w)
      const bright = 0.4 + 0.6 * Math.max(0, cw)
      // sheen travels along the wing as it passes 30 degrees, fades away from there
      const deg = (w * 180) / Math.PI
      const t = clamp((45 - deg) / 30, 0, 1)
      const amp = Math.exp(-(((deg - 30) / 15) ** 2))
      common.uBright.value = bright
      common.uSheen.value.set(t, state.dark ? amp : 0)
      state.pbr?.onPose({ cw, amp, t })
    },
    dispose() {},
  }
  return { api, aperture, pbrApi: () => state.pbr || null }
}

/* ------------------------------------------------------------------ tier 25 : atlas print */

const PARALLAX = { wingB: 0.92, boomB: 0.96, body: 1.0, dish: 1.02, boomF: 1.04, wingF: 1.08 }
const LAYER_Z = { wingB: 0, boomB: 0.02, body: 0.04, dish: 0.05, boomF: 0.06, wingF: 0.08 }
const LAYER_ORDER = ['wingB', 'boomB', 'body', 'dish', 'boomF', 'wingF']
const ATLAS_W = 2048
const ATLAS_H = 1024
const SS = 2

function makeProjection(T) {
  const phi = rad(27)
  const eps = rad(21)
  const r = new T.Vector3(-Math.sin(phi), 0, -Math.cos(phi))
  const c = new T.Vector3(Math.cos(eps) * Math.cos(phi), Math.sin(eps), -Math.cos(eps) * Math.sin(phi))
  const u = new T.Vector3().crossVectors(c, r)
  const zx = r.z
  const zy = u.z
  const alpha = Math.PI - Math.atan2(zy, zx)
  const k = 1 / Math.hypot(zx, zy)
  const ca = Math.cos(alpha)
  const sa = Math.sin(alpha)
  const ex = r.clone().multiplyScalar(ca).addScaledVector(u, -sa).multiplyScalar(k)
  const ey = r.clone().multiplyScalar(sa).addScaledVector(u, ca).multiplyScalar(k)
  // light direction in the leveled, unscaled basis
  const exn = ex.clone().normalize()
  const eyn = ey.clone().normalize()
  const Ln = exn.multiplyScalar(L_DIR[0]).addScaledVector(eyn, L_DIR[1]).addScaledVector(c, L_DIR[2]).normalize()
  return { c, ex, ey, L: Ln, a0: Math.atan2(-c.x, c.y) }
}

/** Software z-buffer render of one layer: flat toon shading + ink edges, supersampled. Returns RGBA bytes. */
function rasterLayer(items, o) {
  const { W, H, x0, y1, sc, proj, st } = o
  const N = W * H
  const zb = new Float32Array(N).fill(-1e9)
  const fids = new Int32Array(N).fill(-1)
  const img = new Uint8ClampedArray(N * 4)
  const L = proj.L
  const ex = proj.ex
  const ey = proj.ey
  const c = proj.c
  const RAMP = [0.62, 0.85, 1.0]
  const dark = st.dark
  const ink = st.ink
  const hatchP = 0.05 * sc
  const faceN = [] // per face id: nx, ny, nz
  const facePrim = []
  let primId = 0
  for (const it of items) {
    const p = it.p
    const n = it.pos.length / 3
    const X = new Float32Array(n)
    const Y = new Float32Array(n)
    const Z = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const px = it.pos[i * 3]
      const py = it.pos[i * 3 + 1]
      const pz = it.pos[i * 3 + 2]
      X[i] = (px * ex.x + py * ex.y + pz * ex.z - x0) * sc
      Y[i] = (y1 - (px * ey.x + py * ey.y + pz * ey.z)) * sc
      Z[i] = px * c.x + py * c.y + pz * c.z
    }
    const isFoil = p.mat === 'foil'
    const isCell = p.mat === 'cell'
    const textured = isFoil || isCell
    const tex = isFoil ? st.foil : st.cell
    const keyHex = p.key.startsWith('#') ? p.key : st.pal[p.key]
    const base = hexRgb(keyHex)
    const mul = p.mul ?? 1
    const flat = p.kind === 'box'
    const nrm = it.nrm
    const uv = it.uv
    primId++
    for (let t = 0; t < n; t += 3) {
      const k = t / 3
      let myFid
      if (flat) {
        if ((k & 1) === 0) {
          faceN.push([nrm[t * 3], nrm[t * 3 + 1], nrm[t * 3 + 2]])
          facePrim.push(primId)
        }
        myFid = faceN.length - 1
      } else {
        if (k === 0) {
          faceN.push([0, 0, 1])
          facePrim.push(primId)
        }
        myFid = faceN.length - 1
      }
      const ax = X[t], ay = Y[t], bx = X[t + 1], by = Y[t + 1], cx = X[t + 2], cy = Y[t + 2]
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
      if (Math.abs(area) < 1e-6) continue
      const inv = 1 / area
      const minx = Math.max(0, Math.floor(Math.min(ax, bx, cx)))
      const maxx = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)))
      const miny = Math.max(0, Math.floor(Math.min(ay, by, cy)))
      const maxy = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)))
      const a0 = (by - cy) * inv, b0 = (cx - bx) * inv, c0 = (bx * cy - cx * by) * inv
      const a1 = (cy - ay) * inv, b1 = (ax - cx) * inv, c1 = (cx * ay - ax * cy) * inv
      const z0 = Z[t], z1 = Z[t + 1], z2 = Z[t + 2]
      // constant colour and level for flat triangles
      let fr = 0, fg = 0, fb = 0, fLvl = 2
      if (flat) {
        const nl = nrm[t * 3] * L.x + nrm[t * 3 + 1] * L.y + nrm[t * 3 + 2] * L.z
        fLvl = nl < 0.02 ? 0 : nl < 0.5 ? 1 : 2
        if (!textured) {
          let r = base[0] * mul, g = base[1] * mul, b = base[2] * mul
          if (dark) {
            const f = RAMP[fLvl]
            r *= f; g *= f; b *= f
            if (fLvl === 0) { r += 2; g += 4; b += 10 }
          } else {
            const ia = fLvl === 1 ? 0.09 : 0
            r += (ink[0] - r) * ia; g += (ink[1] - g) * ia; b += (ink[2] - b) * ia
          }
          fr = r; fg = g; fb = b
        }
      }
      const u0 = uv[t * 2], u1 = uv[(t + 1) * 2], u2 = uv[(t + 2) * 2]
      const v0 = uv[t * 2 + 1], v1 = uv[(t + 1) * 2 + 1], v2 = uv[(t + 2) * 2 + 1]
      for (let y = miny; y <= maxy; y++) {
        let w0 = a0 * (minx + 0.5) + b0 * (y + 0.5) + c0
        let w1 = a1 * (minx + 0.5) + b1 * (y + 0.5) + c1
        for (let x = minx; x <= maxx; x++, w0 += a0, w1 += a1) {
          const w2 = 1 - w0 - w1
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue
          const z = z2 + w0 * (z0 - z2) + w1 * (z1 - z2)
          const idx = y * W + x
          if (z <= zb[idx]) continue
          zb[idx] = z
          fids[idx] = myFid
          let r, g, b
          let lvl = fLvl
          if (flat && !textured) {
            r = fr; g = fg; b = fb
            if (!dark && lvl === 0) {
              const ia = (x + y) % hatchP < hatchP * 0.36 ? 0.7 : 0.1
              r = base[0] * mul; g = base[1] * mul; b = base[2] * mul
              r += (ink[0] - r) * ia; g += (ink[1] - g) * ia; b += (ink[2] - b) * ia
            }
          } else {
            if (!flat) {
              const nx = nrm[t * 3] * w0 + nrm[(t + 1) * 3] * w1 + nrm[(t + 2) * 3] * w2
              const ny = nrm[t * 3 + 1] * w0 + nrm[(t + 1) * 3 + 1] * w1 + nrm[(t + 2) * 3 + 1] * w2
              const nz = nrm[t * 3 + 2] * w0 + nrm[(t + 1) * 3 + 2] * w1 + nrm[(t + 2) * 3 + 2] * w2
              const il = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1)
              const nl = (nx * L.x + ny * L.y + nz * L.z) * il
              lvl = nl < 0.02 ? 0 : nl < 0.5 ? 1 : 2
            }
            r = base[0]; g = base[1]; b = base[2]
            if (textured) {
              const u = w0 * u0 + w1 * u1 + w2 * u2
              const v = w0 * v0 + w1 * v1 + w2 * v2
              let xi = Math.floor(u * tex.w)
              let yi = Math.floor((1 - v) * tex.h)
              if (isFoil) {
                xi = ((xi % tex.w) + tex.w) % tex.w
                yi = ((yi % tex.h) + tex.h) % tex.h
              } else {
                xi = xi < 0 ? 0 : xi >= tex.w ? tex.w - 1 : xi
                yi = yi < 0 ? 0 : yi >= tex.h ? tex.h - 1 : yi
              }
              const ti = (yi * tex.w + xi) * 4
              r = tex.d[ti]; g = tex.d[ti + 1]; b = tex.d[ti + 2]
            }
            r *= mul; g *= mul; b *= mul
            if (dark) {
              if (isFoil) {
                const l = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255
                const f = l > st.foilMean ? 1.12 : 0.86
                r *= f; g *= f; b *= f
              }
              const f = RAMP[lvl]
              r *= f; g *= f; b *= f
              if (lvl === 0) { r += 2; g += 4; b += 10 }
            } else {
              const ia = lvl === 0 ? ((x + y) % hatchP < hatchP * 0.36 ? 0.7 : 0.1) : lvl === 1 ? 0.09 : 0
              r += (ink[0] - r) * ia; g += (ink[1] - g) * ia; b += (ink[2] - b) * ia
            }
          }
          const q = idx * 4
          img[q] = r
          img[q + 1] = g
          img[q + 2] = b
          img[q + 3] = 255
        }
      }
    }
  }
  // ink edges: part boundaries and silhouettes (strong), creases (weak); dilated in linear time
  const R1 = Math.max(1, Math.round(0.0095 * sc))
  const R2 = Math.max(1, Math.round(0.0042 * sc))
  const strong = new Uint8Array(N)
  const weak = new Uint8Array(N)
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x
      const f0 = fids[i]
      for (let s = 0; s < 2; s++) {
        const j = s ? i + W : i + 1
        const f1 = fids[j]
        if (f0 === f1) continue
        if (f0 < 0 || f1 < 0 || facePrim[f0] !== facePrim[f1]) {
          strong[f0 >= 0 && (f1 < 0 || zb[i] > zb[j]) ? i : j] = 1
        } else {
          const A = faceN[f0]
          const B = faceN[f1]
          if (A[0] * B[0] + A[1] * B[1] + A[2] * B[2] < 0.55) weak[i] = 1
        }
      }
    }
  }
  const dil = (m, R) => {
    const t = new Uint8Array(N)
    const pre = new Int32Array(Math.max(W, H) + 1)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) pre[x + 1] = pre[x] + m[y * W + x]
      for (let x = 0; x < W; x++) t[y * W + x] = pre[Math.min(W, x + R + 1)] - pre[Math.max(0, x - R)] > 0 ? 1 : 0
    }
    const out = new Uint8Array(N)
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) pre[y + 1] = pre[y] + t[y * W + x]
      for (let y = 0; y < H; y++) out[y * W + x] = pre[Math.min(H, y + R + 1)] - pre[Math.max(0, y - R)] > 0 ? 1 : 0
    }
    return out
  }
  const ds = dil(strong, R1)
  const dw = dil(weak, R2)
  for (let i = 0; i < N; i++) {
    if (ds[i] || dw[i]) {
      const q = i * 4
      img[q] = ink[0]
      img[q + 1] = ink[1]
      img[q + 2] = ink[2]
      img[q + 3] = 255
    }
  }
  return img
}

const ATLAS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const ATLAS_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec4 uRect;
uniform float uFlip;
uniform float uBright;
uniform vec2 uSheen;
uniform vec3 uSheenCol;
uniform vec3 uPaper;
uniform float uMode;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.003) discard;
  vec3 s = t.rgb / t.a;
  vec3 lin = pow(s, vec3(2.2));
  if (uMode < 0.5) {
    lin *= uBright;
    float f = (vUv.x - uRect.x) / (uRect.z - uRect.x);
    float along = uFlip > 0.0 ? 1.0 - f : f;
    float dd = along + (vUv.y - uRect.y) / (uRect.w - uRect.y) * 0.25 - uSheen.x;
    lin += uSheenCol * (exp(-dd * dd / 0.012) * uSheen.y);
  } else {
    lin = mix(lin, pow(uPaper, vec3(1.0)), (1.0 - uBright) * 0.5);
  }
  gl_FragColor = vec4(lin, t.a);
  #include <colorspace_fragment>
}`

function makePrint(ctx) {
  const { T, prims, own, group, getTheme } = ctx
  const proj = makeProjection(T)
  const V = new T.Vector3()
  const world = {}
  // world matrices per group for the drawing pose
  const Mwing = new T.Matrix4().makeRotationZ(proj.a0)
  const aDish = proj.ey.clone().normalize().multiplyScalar(Math.cos(rad(38))).addScaledVector(proj.c, Math.sin(rad(38))).normalize()
  const gim = new T.Vector3(...GIMBAL)
  const Mdish = new T.Matrix4().compose(gim, new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), aDish), new T.Vector3(1, 1, 1))
  world.body = new T.Matrix4()
  world.wing = Mwing
  world.dish = Mdish

  // layer geometry in drawing space
  const layers = {}
  for (const name of LAYER_ORDER) layers[name] = []
  for (const p of prims) {
    const g = primGeo(T, p)
    g.applyMatrix4(world[p.grp].clone().multiply(p.m))
    layers[p.layer].push({
      p,
      pos: Float32Array.from(g.attributes.position.array),
      nrm: Float32Array.from(g.attributes.normal.array),
      uv: Float32Array.from(g.attributes.uv.array),
    })
    g.dispose()
  }
  // bounds in unit space
  const bounds = {}
  const ex = proj.ex
  const ey = proj.ey
  for (const name of LAYER_ORDER) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
    for (const it of layers[name]) {
      for (let i = 0; i < it.pos.length; i += 3) {
        V.set(it.pos[i], it.pos[i + 1], it.pos[i + 2])
        const sx = V.dot(ex)
        const sy = V.dot(ey)
        a = Math.min(a, sx); c = Math.max(c, sx); b = Math.min(b, sy); d = Math.max(d, sy)
      }
    }
    bounds[name] = { x0: a, y0: b, x1: c, y1: d }
  }
  const gp = V.set(...GIMBAL).clone()
  const gimXY = [gp.dot(ex), gp.dot(ey)]
  // pack
  let S = 180
  let place = null
  for (; S >= 100; S -= 10) {
    const pad = Math.ceil(0.013 * S) + 6
    const items = LAYER_ORDER.map((name) => {
      const b = bounds[name]
      return { name, w: Math.ceil((b.x1 - b.x0) * S) + pad * 2, h: Math.ceil((b.y1 - b.y0) * S) + pad * 2, pad }
    }).sort((p, q) => q.h - p.h)
    let x = 0, y = 0, rowH = 0
    const res = {}
    let ok = true
    for (const it of items) {
      if (x + it.w > ATLAS_W) { x = 0; y += rowH + 4; rowH = 0 }
      if (y + it.h > ATLAS_H) { ok = false; break }
      res[it.name] = { x, y, w: it.w, h: it.h, pad: it.pad }
      x += it.w + 4
      rowH = Math.max(rowH, it.h)
    }
    if (ok) { place = res; break }
  }
  const SC = S

  const atlas = mkCanvas(ATLAS_W, ATLAS_H)
  const actx = atlas.getContext('2d')
  const tex = new T.CanvasTexture(atlas)
  tex.colorSpace = T.NoColorSpace
  tex.premultiplyAlpha = true
  tex.generateMipmaps = true
  tex.minFilter = T.LinearMipmapLinearFilter
  tex.anisotropy = 8
  own.push(tex)

  const foilCv = mkCanvas(512, 256)
  const roughCv = mkCanvas(512, 256)
  const cellCv = mkCanvas(256, 128)

  const img = (cv) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height)
    return { w: cv.width, h: cv.height, d: d.data }
  }

  function paintAtlas(th) {
    const pal = paletteFor(th)
    const foilMeanL = paintFoil(foilCv, roughCv, th)
    void foilMeanL
    paintCells(cellCv, th)
    const st = {
      dark: isDark(th),
      pal,
      ink: hexRgb(th.ink),
      paper: hexRgb(th.bg),
      foil: img(foilCv),
      cell: img(cellCv),
      foilMean: 0.5,
    }
    // mean sRGB luma of the foil for the two-tone split
    let s = 0
    let n = 0
    for (let i = 0; i < st.foil.d.length; i += 28) { s += (st.foil.d[i] * 0.2126 + st.foil.d[i + 1] * 0.7152 + st.foil.d[i + 2] * 0.0722) / 255; n++ }
    st.foilMean = s / n
    actx.clearRect(0, 0, ATLAS_W, ATLAS_H)
    actx.imageSmoothingEnabled = true
    actx.imageSmoothingQuality = 'high'
    for (const name of LAYER_ORDER) {
      const pl = place[name]
      const b = bounds[name]
      const sc = SC * SS
      const Wq = pl.w * SS
      const Hq = pl.h * SS
      const bytes = rasterLayer(layers[name], {
        W: Wq, H: Hq, x0: b.x0 - pl.pad / SC, y1: b.y1 + pl.pad / SC, sc, proj, st,
      })
      const tmp = mkCanvas(Wq, Hq)
      tmp.getContext('2d').putImageData(new ImageData(bytes, Wq, Hq), 0, 0)
      actx.drawImage(tmp, 0, 0, Wq, Hq, pl.x, pl.y, pl.w, pl.h)
    }
    tex.needsUpdate = true
    return st
  }

  // planes
  const inner = new T.Group()
  group.add(inner)
  const common = {
    uBright: { value: 1 },
    uSheen: { value: new T.Vector2(0, 0) },
    uSheenCol: { value: new T.Color(0x9fb4ff).multiplyScalar(0.5) },
    uPaper: { value: new T.Color() },
    uMode: { value: 0 },
  }
  const layerObj = {}
  LAYER_ORDER.forEach((name, li) => {
    const b = bounds[name]
    const pl = place[name]
    const pad = pl.pad / SC
    const ox = name === 'dish' ? gimXY[0] : 0
    const oy = name === 'dish' ? gimXY[1] : 0
    const x0 = b.x0 - pad - ox
    const x1 = b.x1 + pad - ox
    const y0 = b.y0 - pad - oy
    const y1 = b.y1 + pad - oy
    const u0 = pl.x / ATLAS_W
    const u1 = (pl.x + pl.w) / ATLAS_W
    const v1 = 1 - pl.y / ATLAS_H
    const v0 = 1 - (pl.y + pl.h) / ATLAS_H
    const geo = new T.BufferGeometry()
    geo.setAttribute('position', new T.Float32BufferAttribute([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], 3))
    geo.setAttribute('uv', new T.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v1], 2))
    geo.setIndex([0, 1, 2, 0, 2, 3])
    own.push(geo)
    const mat = new T.ShaderMaterial({
      vertexShader: ATLAS_VERT,
      fragmentShader: ATLAS_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMap: { value: tex },
        uRect: { value: new T.Vector4(u0, v0, u1, v1) },
        uFlip: { value: name === 'wingB' ? 1 : 0 },
        ...common,
      },
    })
    if (!name.startsWith('wing')) mat.uniforms = { ...mat.uniforms, uBright: { value: 1 }, uSheen: { value: new T.Vector2(0, 0) } }
    own.push(mat)
    const mesh = new T.Mesh(geo, mat)
    mesh.frustumCulled = false
    mesh.renderOrder = 10 + li
    const holder = new T.Group()
    holder.position.set(ox, oy, LAYER_Z[name])
    holder.add(mesh)
    inner.add(holder)
    layerObj[name] = { holder, mesh, base: [ox, oy] }
  })
  const aperture = new T.Object3D()
  const ap = V.set(0.12, -0.586, 0).clone()
  aperture.position.set(ap.dot(ex), ap.dot(ey), 0.04)
  inner.add(aperture)

  const api = {
    setTheme(th) {
      paintAtlas(th)
      const dark = isDark(th)
      common.uMode.value = dark ? 0 : 1
      common.uPaper.value.set(th.bg)
      common.uSheenCol.value.set('#9fb4ff').multiplyScalar(dark ? 0.5 : 0)
      state.dark = dark
      api.setPose(state.pose || {})
    },
    setPose(pose = {}) {
      state.pose = pose
      const { roll = 0, wing: w = 0, dishYaw: dy = 0, parallax } = pose
      const cw = Math.cos(w)
      const sy = Math.max(0.06, cw)
      layerObj.wingB.holder.scale.y = sy
      layerObj.wingF.holder.scale.y = sy
      inner.rotation.z = roll
      layerObj.dish.holder.rotation.z = -dy
      const deg = (w * 180) / Math.PI
      const t = clamp((45 - deg) / 30, 0, 1)
      const amp = Math.exp(-(((deg - 30) / 15) ** 2))
      common.uBright.value = 0.4 + 0.6 * Math.max(0, cw)
      common.uSheen.value.set(t, state.dark ? amp : 0)
      const px = parallax?.x || 0
      const py = parallax?.y || 0
      for (const name of LAYER_ORDER) {
        const lo = layerObj[name]
        const f = PARALLAX[name] - 1
        lo.holder.position.x = lo.base[0] + f * px
        lo.holder.position.y = lo.base[1] + f * py
      }
    },
    dispose() {},
  }
  const state = { dark: true }
  return { api, aperture }
}

/* ------------------------------------------------------------------ entry */

export function makeOrbitSat(THREE, { tier = 'mid', theme, disposables } = {}) {
  const T = THREE
  const own = []
  const group = new T.Group()
  group.name = 'orbit-sat-' + tier
  const ctx = { T, tier, own, group, prims: buildPrims(T), getTheme: () => theme }
  const built = tier === '25' ? makePrint(ctx) : makeSolid(ctx)
  let disposed = false
  let pbrExposure = 1
  let pbrSun = null
  const sat = {
    group,
    span: SPAN,
    aperture: built.aperture,
    setTheme(th) {
      theme = th
      built.api.setTheme(th)
      const pb = built.pbrApi?.()
      if (pb) {
        pb.setExposure(pbrExposure)
        if (pbrSun) pb.setSunDir(pbrSun)
      }
    },
    setPose(pose) {
      built.api.setPose(pose)
    },
    /** Additive (tier 3d dark): scales PBR reflections. 1 = authored. No-op on other tiers / themes. */
    setExposure(v) {
      pbrExposure = v
      built.pbrApi?.()?.setExposure(v)
    },
    /** Additive (tier 3d dark): world direction from the satellite to the sun, rotates the baked sun in the reflection map. */
    setSunDir(v) {
      pbrSun = v
      built.pbrApi?.()?.setSunDir(v)
    },
    get envIntensity() {
      return pbrExposure
    },
    set envIntensity(v) {
      sat.setExposure(v)
    },
    dispose() {
      if (disposed) return
      disposed = true
      group.removeFromParent()
      group.clear()
      for (const o of own) o.dispose?.()
      own.length = 0
    },
  }
  sat.setTheme(theme)
  sat.setPose({})
  disposables?.push?.({ dispose: () => sat.dispose() })
  return sat
}
