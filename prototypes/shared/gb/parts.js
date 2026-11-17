/** Geometry builders for the gameboy. Pure functions of THREE; every result is a plain BufferGeometry. */
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const TAU = Math.PI * 2

export function roundedRectShape(THREE, w, h, r = [0.1, 0.1, 0.1, 0.1], cx = 0, cy = 0) {
  const [tl, tr, br, bl] = r.map((v) => Math.max(v, 1e-4))
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  const y0 = cy - h / 2
  const y1 = cy + h / 2
  const s = new THREE.Shape()
  s.moveTo(x0 + bl, y0)
  s.lineTo(x1 - br, y0)
  s.absarc(x1 - br, y0 + br, br, -Math.PI / 2, 0, false)
  s.lineTo(x1, y1 - tr)
  s.absarc(x1 - tr, y1 - tr, tr, 0, Math.PI / 2, false)
  s.lineTo(x0 + tl, y1)
  s.absarc(x0 + tl, y1 - tl, tl, Math.PI / 2, Math.PI, false)
  s.lineTo(x0, y0 + bl)
  s.absarc(x0 + bl, y0 + bl, bl, Math.PI, Math.PI * 1.5, false)
  s.closePath()
  return s
}

export function rectHole(THREE, w, h, r, cx = 0, cy = 0) {
  // Holes wind the other way round.
  const p = roundedRectShape(THREE, w, h, [r, r, r, r], cx, cy)
  return new THREE.Path(p.getPoints(10).reverse())
}

/** Re-map ShapeGeometry UVs to 0..1 over a w x h box centred at (cx, cy). */
export function planarUV(geometry, w, h, cx = 0, cy = 0) {
  const pos = geometry.attributes.position
  const uv = geometry.attributes.uv
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, (pos.getX(i) - cx) / w + 0.5, (pos.getY(i) - cy) / h + 0.5)
  uv.needsUpdate = true
  return geometry
}

export function extrude(THREE, shape, depth, { bevel = 0.02, bevelT = bevel, segments = 3, curve = 20, center = true } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-3, depth),
    bevelEnabled: bevel > 0,
    bevelThickness: bevelT,
    bevelSize: bevel,
    bevelSegments: segments,
    curveSegments: curve,
    steps: 1,
  })
  if (center) g.translate(0, 0, -depth / 2)
  return g
}

export function circleShape(THREE, r, segments = 48) {
  const s = new THREE.Shape()
  s.absarc(0, 0, r, 0, TAU, false)
  s.getPoints(segments)
  return s
}

export function crossShape(THREE, span, arm, chamfer = 0.035) {
  const s = span / 2
  const a = arm / 2
  const c = chamfer
  const pts = [
    [-a, s - c], [-a + c, s], [a - c, s], [a, s - c], [a, a],
    [s - c, a], [s, a - c], [s, -a + c], [s - c, -a], [a, -a],
    [a, -s + c], [a - c, -s], [-a + c, -s], [-a, -s + c], [-a, -a],
    [-s + c, -a], [-s, -a + c], [-s, a - c], [-s + c, a], [-a, a],
  ]
  const shape = new THREE.Shape()
  pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)))
  shape.closePath()
  return shape
}

export function trianglePath(THREE, size, dir = 'up') {
  const s = new THREE.Shape()
  const h = size
  const w = size * 1.15
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [0, h / 2]]
  const rot = { up: 0, left: Math.PI / 2, down: Math.PI, right: -Math.PI / 2 }[dir]
  const cs = Math.cos(rot)
  const sn = Math.sin(rot)
  pts.forEach(([x, y], i) => {
    const px = x * cs - y * sn
    const py = x * sn + y * cs
    if (i) s.lineTo(px, py)
    else s.moveTo(px, py)
  })
  s.closePath()
  return s
}

/** Lathe around the local Z axis (profile: [radius, height-along-z]). */
export function latheZ(THREE, profile, segments = 40) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(r, z))
  const g = new THREE.LatheGeometry(pts, segments)
  g.rotateX(Math.PI / 2)
  return g
}

function colored(THREE, geometry, color) {
  const c = new THREE.Color(color)
  const n = geometry.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i += 1) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geometry
}

export function box(THREE, w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return colored(THREE, g, color)
}

export function cylZ(THREE, r, len, x, y, z, color, seg = 20) {
  const g = new THREE.CylinderGeometry(r, r, len, seg)
  g.rotateX(Math.PI / 2)
  g.translate(x, y, z)
  return colored(THREE, g, color)
}

/** Merge vertex-coloured geometries (all must share attributes: position, normal, uv, color). */
export function mergeColored(list) {
  for (const g of list) if (g.index) { /* keep indexed uniformly */ }
  const unified = list.map((g) => (g.index ? g.toNonIndexed() : g))
  return mergeGeometries(unified, false)
}

export function mergeAll(list) {
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false)
}

/** A QFP chip lying in the XY plane facing +z. Origin at the centre of its underside. */
export function chipGeometry(THREE, w, h, t, nx, ny, bodyColor = '#17181b') {
  const list = [box(THREE, w, h, t, 0, 0, t / 2, bodyColor)]
  list.push(box(THREE, w * 0.18, w * 0.18, 0.004, -w * 0.32, h * 0.32, t + 0.002, '#2b2d31'))
  const pw = 0.014
  const pl = 0.05
  for (let i = 0; i < nx; i += 1) {
    const x = ((i + 0.5) / nx - 0.5) * (w * 0.86)
    list.push(box(THREE, pw, pl, 0.012, x, h / 2 + pl * 0.35, 0.012, '#b9bec6'))
    list.push(box(THREE, pw, pl, 0.012, x, -h / 2 - pl * 0.35, 0.012, '#b9bec6'))
  }
  for (let i = 0; i < ny; i += 1) {
    const y = ((i + 0.5) / ny - 0.5) * (h * 0.86)
    list.push(box(THREE, pl, pw, 0.012, w / 2 + pl * 0.35, y, 0.012, '#b9bec6'))
    list.push(box(THREE, pl, pw, 0.012, -w / 2 - pl * 0.35, y, 0.012, '#b9bec6'))
  }
  return mergeColored(list)
}

/** A flat ribbon (flex cable) swept along a curve, width along local X. */
export function ribbonGeometry(THREE, curve, width, segments = 40) {
  const pos = []
  const uv = []
  const idx = []
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const p = curve.getPoint(t)
    pos.push(p.x - width / 2, p.y, p.z, p.x + width / 2, p.y, p.z)
    uv.push(0, t, 1, t)
    if (i < segments) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
