/**
 * Layout and orbit-plane maths for the Harvest "orbit" variants (see .logs/harvest-orbit-design.md, sections 2 and 4.0).
 * No THREE dependency: vectors are plain [x, y, z] arrays, so everything here can be unit-tested in node.
 *
 *   layoutFor(w, h)              screen anchors for the Earth, region, lens, satellite and copy column (CSS px in, fractions out)
 *   cameraModel(tier, aspect)    { persp, tanH, aspect }: camera at the origin looking down -z (persp) or an ortho box (world unit = half viewport height)
 *   rayThrough / unprojectAt     screen (NDC) to world
 *   earthPlacement(...)          Earth centre + radius in world units for a tier
 *   buildOrbitPlane(...)         the one source of truth for the orbit ring, ground track and satellite path
 *   satScale / satBasis          satellite fit-to-span and the "nadir to footprint, wings across the screen" pose
 *
 * Units of the returned layout: x fractions are of the viewport WIDTH, y fractions of the HEIGHT. Radii (`earth.r`, `lensR`) are
 * fractions of the HEIGHT, `span` is a fraction of the WIDTH. `px` holds the same numbers in CSS pixels.
 */
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

/** Everything the CSS of the live page puts on the left: the copy column's right edge in px. */
export function copyRight(w) {
  const pad = clamp(0.04 * w, 17.6, 56)
  return pad + Math.min(480, 0.42 * w)
}

export function layoutFor(w, h) {
  const aspect = w / h
  const m = smooth(0.85, 1.2, aspect)
  const copyR = copyRight(w)
  const k = smooth(1.33, 1.6, aspect)
  // wide (section 2.1)
  const wideEarth = { cx: w - 0.32 * h, cy: lerp(1.13, 1.16, k) * h, r: lerp(0.63, 0.68, k) * h }
  const wide = {
    earth: wideEarth,
    r0: [wideEarth.cx - 0.13 * h, wideEarth.cy - 0.5 * h],
    r1: [wideEarth.cx - 0.07 * h, wideEarth.cy - 0.46 * h],
    lensR: 0.085 * h,
    span0: 0.24 * w,
    span1: 0.25 * w,
  }
  wide.s0 = [Math.max(0.53 * w, copyR + 0.02 * w + wide.span0 / 2), 0.21 * h]
  wide.s1 = [wide.s0[0] + 0.1 * w, wide.s0[1] + 0.07 * h]
  // portrait (section 2.2)
  const port = {
    earth: { cx: 0.8 * w, cy: 0.8 * h, r: 0.78 * w },
    r0: [0.6 * w, 0.5 * h],
    r1: [0.66 * w, 0.53 * h],
    lensR: 0.13 * w,
    span0: 0.5 * w,
    span1: 0.5 * w,
    s0: [0.3 * w, 0.13 * h],
    s1: [0.42 * w, 0.19 * h],
  }
  const mix2 = (a, b) => [lerp(a[0], b[0], m), lerp(a[1], b[1], m)]
  const px = {
    copyR,
    earth: { cx: lerp(port.earth.cx, wide.earth.cx, m), cy: lerp(port.earth.cy, wide.earth.cy, m), r: lerp(port.earth.r, wide.earth.r, m) },
    r0: mix2(port.r0, wide.r0),
    r1: mix2(port.r1, wide.r1),
    lensR: lerp(port.lensR, wide.lensR, m),
    s0: mix2(port.s0, wide.s0),
    s1: mix2(port.s1, wide.s1),
    span0: lerp(port.span0, wide.span0, m),
    span1: lerp(port.span1, wide.span1, m),
    // hard limits for the wing tips (px): left tip x >= xMin, right tip x <= xMax, tip y <= yMax
    xMin: lerp(0.03 * w, copyR + 0.02 * w, m),
    xMax: lerp(0.97 * w, w, m),
    yMax: lerp(0.56, 0.3, m) * h,
  }
  const fx = (p) => [p[0] / w, p[1] / h]
  return {
    aspect, m, w, h, px,
    copyR: copyR / w,
    earth: { cx: px.earth.cx / w, cy: px.earth.cy / h, r: px.earth.r / h },
    region: { p0: fx(px.r0), p1: fx(px.r1) },
    lensR: px.lensR / h,
    sat: { s0: fx(px.s0), s1: fx(px.s1), span: px.span0 / w, span1: px.span1 / w },
  }
}

/* ------------------------------------------------------------------ tiny vector kit (arrays) */
export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const vscale = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const vlen = (a) => Math.hypot(a[0], a[1], a[2])
export const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
export const vmix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/* ------------------------------------------------------------------ camera model */
export const FOV3D = 24
export const DEPTH_EARTH = 12 // perspective tier: distance of the Earth centre from the camera
export const DEPTH_SAT = 6 // perspective tier: nominal satellite distance (the real one follows the orbit plane)
export const PUSH = 0.4 // perspective tier: the slow push, world units over p 0..1

export function cameraModel(tier, aspect) {
  const persp = tier === '3d'
  return { persp, aspect, tanH: persp ? Math.tan((FOV3D * Math.PI) / 360) : 1 }
}

/** Screen position (viewport fractions) to NDC (+y up). */
export const toNdc = (fx, fy) => [2 * fx - 1, 1 - 2 * fy]

/** Ray through an NDC point: ortho -> origin on the z = 10 plane, direction -z; persp -> origin 0, unit direction. */
export function rayThrough(cam, nx, ny, camZ = 0) {
  if (!cam.persp) return { O: [nx * cam.aspect, ny, 10], D: [0, 0, -1] }
  return { O: [0, 0, camZ], D: vnorm([nx * cam.tanH * cam.aspect, ny * cam.tanH, -1]) }
}

/** World point on the ray at "depth" d. ortho: z = d. persp: d is the distance along -z (the point sits at z = -d). */
export function unprojectAt(cam, nx, ny, d, camZ = 0) {
  if (!cam.persp) return [nx * cam.aspect, ny, d]
  return [nx * cam.tanH * cam.aspect * d, ny * cam.tanH * d, camZ - d]
}

/** World to NDC. Returns [nx, ny, depth] (persp depth = distance along the view axis). */
export function projectNdc(cam, P, camZ = 0) {
  if (!cam.persp) return [P[0] / cam.aspect, P[1], P[2]]
  const d = camZ - P[2]
  return [P[0] / (d * cam.tanH * cam.aspect), P[1] / (d * cam.tanH), d]
}

/** Screen px position of a world point. */
export function projectPx(cam, P, w, h, camZ = 0) {
  const n = projectNdc(cam, P, camZ)
  return [(n[0] * 0.5 + 0.5) * w, (0.5 - n[1] * 0.5) * h, n[2]]
}

/**
 * Earth centre (world) and radius for a tier from the screen anchor. Ortho: world unit = half viewport height.
 * Perspective: centre at depth DEPTH_EARTH, R = d * sin(atan(rNdc * tanH)) with rNdc = 2 r (r in h units).
 */
export function earthPlacement(cam, lay) {
  const [nx, ny] = toNdc(lay.earth.cx, lay.earth.cy)
  const rNdc = 2 * lay.earth.r
  if (!cam.persp) return { C: [nx * cam.aspect, ny, 0], R: rNdc }
  const C = unprojectAt(cam, nx, ny, DEPTH_EARTH)
  const R = DEPTH_EARTH * Math.sin(Math.atan(rNdc * cam.tanH))
  return { C, R }
}

/** World units per viewport-width fraction at a given depth (ortho: depth ignored). */
export function worldPerWidth(cam, depth) {
  return cam.persp ? 2 * depth * cam.tanH * cam.aspect : 2 * cam.aspect
}

/** Scale that makes a satellite of `spanLocal` local units project to `spanFrac` of the viewport width. */
export function satScale(cam, depth, spanFrac, spanLocal) {
  return (spanFrac * worldPerWidth(cam, depth)) / spanLocal
}

/* ------------------------------------------------------------------ orbit plane (section 4.0)
 * The spec derives N = cross(Smid - C, G - C) with the satellite at a fixed depth. In the portrait layout the satellite, the
 * Earth centre and the region are almost collinear on screen, which makes that plane nearly edge-on to the view (|N.D| ~ 0.14,
 * the "fall back" case of the spec). So the plane is built the other way round: it still contains C and G (the ground track
 * always crosses California) and the camera ray through the satellite anchors still lands on it (the ring always passes through
 * the satellite), but its tilt about the axis C -> G is chosen directly so the ring reads as an ellipse with minor/major = tilt.
 */
export function buildOrbitPlane({ cam, C, R, G, ndcS0, ndcS1, depthHint, tilt = 0.55, camZ = 0 }) {
  const g = vnorm(vsub(G, C))
  const rayMid = rayThrough(cam, (ndcS0[0] + ndcS1[0]) / 2, (ndcS0[1] + ndcS1[1]) / 2, camZ)
  const view = vscale(rayMid.D, -1) // towards the camera
  // most face-on plane that still contains g
  let nFace = vsub(view, vscale(g, vdot(view, g)))
  if (vlen(nFace) < 1e-4) nFace = [0, 0, 1]
  nFace = vnorm(nFace)
  const rhoMax = Math.abs(vdot(nFace, view))
  const rho = Math.min(tilt, rhoMax * 0.92)
  const beta = Math.acos(clamp(rho / Math.max(rhoMax, 1e-4), -1, 1))
  const nPerp = vnorm(vcross(g, nFace))
  let best = null
  for (const sgn of [1, -1]) {
    const N = vnorm(vadd(vscale(nFace, Math.cos(beta)), vscale(nPerp, sgn * Math.sin(beta))))
    const hit = (nd) => {
      const r = rayThrough(cam, nd[0], nd[1], camZ)
      const den = vdot(r.D, N)
      if (Math.abs(den) < 1e-5) return null
      const t = vdot(vsub(C, r.O), N) / den
      return vadd(r.O, vscale(r.D, t))
    }
    const mid = hit([(ndcS0[0] + ndcS1[0]) / 2, (ndcS0[1] + ndcS1[1]) / 2])
    if (!mid) continue
    // the satellite must sit in front of the Earth: prefer the candidate nearer to the camera
    const toCam = cam.persp ? vlen(vsub(mid, [0, 0, camZ])) : -mid[2]
    const score = cam.persp ? -toCam : mid[2]
    if (!best || score > best.score) best = { N, mid, hit, score }
  }
  const { N, mid, hit } = best
  const rOrb = vlen(vsub(mid, C))
  const e1 = vnorm(vsub(mid, C))
  let e2 = vcross(N, e1)
  const ang = (P) => {
    const d = vsub(P, C)
    return Math.atan2(vdot(d, e2), vdot(d, e1))
  }
  let th0 = ang(hit(ndcS0)), th1 = ang(hit(ndcS1))
  if (th1 < th0) { e2 = vscale(e2, -1); th0 = -th0; th1 = -th1 } // the satellite always travels towards +th
  const at = (th) => vadd(C, vadd(vscale(e1, rOrb * Math.cos(th)), vscale(e2, rOrb * Math.sin(th))))
  return { N, e1, e2, C, R, rOrb, th0, th1, at, rho, depth: depthHint }
}

/** Satellite angle along the orbit for story progress p. */
export const satPath = (p) => smooth(0, 1, p) * 0.85 + p * 0.15

/** Angle of a world direction (from C) in the plane basis, plus its out-of-plane component. */
export function planeAngle(plane, P) {
  const d = vsub(P, plane.C)
  return Math.atan2(vdot(d, plane.e2), vdot(d, plane.e1))
}

/**
 * Satellite pose (section 3.1): local -y (nadir) points at the footprint F, local +z (wings) as screen-horizontal as possible.
 * Returns the three basis vectors [x, y, z] (columns of the rotation).
 */
export function satBasis(S, F, right) {
  const y = vnorm(vsub(S, F))
  let z = vsub(right, vscale(y, vdot(right, y)))
  z = vnorm(z)
  const x = vcross(y, z)
  return [x, y, z]
}
