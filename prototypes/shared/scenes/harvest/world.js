/**
 * Harvest world: pure maths, no three.js. A California-ish heightfield with three carved reservoirs,
 * a canal network that runs down into a rice valley, and a patchwork of paddies.
 * Everything is deterministic (seeded) so screenshots are repeatable.
 */
export const BOX = { x0: -80, z0: -56, w: 160, d: 120 }

const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix = (a, b, t) => a + (b - a) * t

function ih(x, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z)
  const fx = x - ix, fz = z - iz
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz)
  const a = ih(ix, iz), b = ih(ix + 1, iz), c = ih(ix, iz + 1), d = ih(ix + 1, iz + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
function fbm(x, z, o = 5) {
  let s = 0, a = 0.5, f = 1, tot = 0
  for (let i = 0; i < o; i += 1) {
    s += a * vnoise(x * f + i * 17.3, z * f - i * 9.1)
    tot += a
    f *= 2.03
    a *= 0.5
  }
  return s / tot
}
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Three reservoirs with deliberately different outlines (radial lobes). level = mean water height. */
export const LAKES = [
  { c: [-34, -22], rot: 0.35, r: [12.5, 5.0], lobes: [[3, 0.26, 0.4], [5, 0.13, 1.3], [2, 0.16, 2.1]], level: 3.3, phase: 0.0 },
  { c: [3, -27], rot: -0.2, r: [9.2, 7.4], lobes: [[2, 0.34, 0.8], [3, 0.22, 2.2]], level: 3.8, phase: 0.35 },
  { c: [37, -17], rot: -0.55, r: [9.2, 6.0], lobes: [[3, 0.24, 1.1], [4, 0.12, 0.2]], level: 3.1, phase: 0.7 },
]
export const GAUGE_LAKE = 1
export const SEASON_AMP = 0.62

/** Normalised distance to the lake outline: 1 on the nominal shore, < 1 inside. */
export function lakeD(k, x, z) {
  const L = LAKES[k]
  const dx = x - L.c[0], dz = z - L.c[1]
  const cs = Math.cos(L.rot), sn = Math.sin(L.rot)
  const px = (dx * cs + dz * sn) / L.r[0]
  const pz = (-dx * sn + dz * cs) / L.r[1]
  const th = Math.atan2(pz, px)
  let rr = 1
  for (const [kk, a, ph] of L.lobes) rr += a * Math.cos(kk * th + ph)
  return Math.hypot(px, pz) / Math.max(0.35, rr)
}

/** Seasonal water-level offset in -1..1 (a dry spell in the middle). s = seasons elapsed. */
export function seasonal(k, s) {
  const ph = LAKES[k].phase
  const dry = 1 - 0.55 * Math.exp(-(((s - 1.55) / 0.5) ** 2))
  return Math.max(-1, Math.min(1, 0.78 * Math.sin(6.2831853 * (s + ph)) * dry + 0.22 * Math.sin(12.566 * (s + ph) + 1.2) - 0.18 * (1 - dry)))
}
export const lakeLevel = (k, s) => LAKES[k].level + SEASON_AMP * seasonal(k, s)

function hills(x, z) {
  const north = ss(18, -12, z)
  const n = fbm(x * 0.03 + 4, z * 0.03 + 1)
  const rd = 1 - Math.abs(2 * fbm(x * 0.045 - 2, z * 0.045 + 9, 4) - 1)
  let h = north * (1.7 + 6.4 * n + 5.2 * rd * rd)
  h += ss(-32, -56, z) * 11 * (0.6 + 0.8 * fbm(x * 0.05, z * 0.05 + 5, 3))
  h += ss(44, 80, Math.abs(x)) * (1 - ss(34, 56, z)) * (7 + 4 * n)
  // low rolling foothills in the transition zone
  h += (1 - north) * ss(-2, 8, z) * (1 - ss(8, 14, z)) * 1.6 * fbm(x * 0.06, z * 0.06 + 3, 3)
  const flat = ss(6, 13, z) * (1 - ss(52, 72, Math.abs(x)))
  return mix(h, 0.28 + 0.03 * n, flat)
}

export const VALLEY_Y = 0.28

export function heightAt(x, z) {
  let h = hills(x, z)
  for (let k = 0; k < LAKES.length; k += 1) {
    const d = lakeD(k, x, z)
    if (d > 3.3) continue
    const L = LAKES[k].level
    const bank = L + 0.35 + 2.7 * ss(0.9, 2.4, d)
    const hh = mix(h, bank, 1 - ss(2.0, 3.2, d))
    h = hh - 2.5 * (1 - ss(0.25, 1.05, d)) * (1 - ss(1.0, 1.4, d))
  }
  return h
}

/** Half-float RGBA map: R height, G/B/A = lake distance for lakes 0,1,2 (clamped). */
export function buildHeightmap(res, toHalf) {
  const w = res, h = Math.round(res * (BOX.d / BOX.w))
  const data = new Uint16Array(w * h * 4)
  for (let j = 0; j < h; j += 1) {
    const z = BOX.z0 + ((j + 0.5) / h) * BOX.d
    for (let i = 0; i < w; i += 1) {
      const x = BOX.x0 + ((i + 0.5) / w) * BOX.w
      const o = (j * w + i) * 4
      data[o] = toHalf(heightAt(x, z))
      data[o + 1] = toHalf(Math.min(4, lakeD(0, x, z)))
      data[o + 2] = toHalf(Math.min(4, lakeD(1, x, z)))
      data[o + 3] = toHalf(Math.min(4, lakeD(2, x, z)))
    }
  }
  return { data, w, h }
}

/* ------------------------------------------------------------------ canals + paddies */
export const MAIN_Z = 10.4
const CANAL_ENDS = [-24, 3, 27]

/** Canals leave each reservoir, wander downhill, and merge into a main canal; feeders run down the paddy gaps. */
export function buildNetwork() {
  const rnd = rng(7)
  const canals = []
  for (let k = 0; k < LAKES.length; k += 1) {
    const L = LAKES[k]
    let z = L.c[1]
    const x0 = L.c[0]
    while (z < 40 && lakeD(k, x0, z) < 0.9) z += 0.2
    const ex = CANAL_ENDS[k]
    const pts = []
    const n = 46
    const ph = rnd() * 6
    for (let i = 0; i <= n; i += 1) {
      const t = i / n
      const e = t * t * (3 - 2 * t)
      const zz = mix(z, MAIN_Z, t)
      const wob = Math.sin(t * 7 + ph) * 3.2 * Math.sin(t * Math.PI)
      const xx = mix(x0, ex, e) + wob
      pts.push([xx, heightAt(xx, zz) + 0.16, zz])
    }
    let len = 0
    const d = [0]
    for (let i = 1; i < pts.length; i += 1) {
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2])
      d.push(len)
    }
    canals.push({ pts, d, len, endX: pts[pts.length - 1][0] })
  }
  const dMain = (x) => Math.min(...canals.map((c) => c.len + Math.abs(x - c.endX)))
  return { canals, dMain }
}

/** Paddies: aligned columns (their gaps become feeder canals), irregular rows inside each column. */
export function buildPaddies(dMain) {
  const rnd = rng(23)
  const cols = 10
  const xMin = -45, xMax = 45
  let widths = Array.from({ length: cols }, () => 0.75 + rnd() * 0.6)
  const sum = widths.reduce((a, b) => a + b, 0)
  widths = widths.map((w) => (w / sum) * (xMax - xMin))
  const paddies = []
  const feederX = []
  let x = xMin
  const zTop = MAIN_Z + 1.2, zBot = 44
  for (let c = 0; c < cols; c += 1) {
    const w = widths[c]
    const gap = 0.9
    if (c > 0) feederX.push(x)
    const nrows = 4 + Math.floor(rnd() * 3)
    const cuts = [zTop]
    for (let r = 1; r < nrows; r += 1) cuts.push(zTop + ((r + (rnd() - 0.5) * 0.7) / nrows) * (zBot - zTop))
    cuts.push(zBot)
    for (let r = 0; r < nrows; r += 1) {
      const z0 = cuts[r] + (r === 0 ? 0 : 0.25)
      const z1 = cuts[r + 1] - 0.25
      const cx = x + w / 2, cz = (z0 + z1) / 2
      paddies.push({ cx, cz, w: w - gap, d: z1 - z0, dist: dMain(cx) + (cz - MAIN_Z), seed: rnd() })
    }
    x += w
  }
  return { paddies, feederX, zTop, zBot }
}
