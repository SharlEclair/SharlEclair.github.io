/**
 * World maths for the SQL scene: no three.js in here. A dark contour ground (a baked height texture), and the ribbon
 * path that the GLSL in shaders.js mirrors (pathZ / pathY must stay in sync with PATH_GLSL).
 */
export const BOX = { x0: -110, z0: -95, w: 220, d: 150 }

/** Where the ribbon hits its fault (world x on the path) and how long the ribbon is. */
export const XF = 2.4
export const HALF_W = 0.75

export const pathZ = (x) => 2.0 * Math.sin(0.4 * x + 0.5) + 0.9 * Math.sin(0.93 * x + 2.1)
export const pathY = (x) => 1.45 + 0.5 * Math.sin(0.55 * x + 1.0)

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
function fbm(x, z, o = 4) {
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

/** Soft rolling relief, domain warped so the contour lines flow in long curves. Roughly -1..1. */
export function relief(x, z) {
  const wx = x + 16 * (fbm(x * 0.022 + 3, z * 0.022 - 5, 3) - 0.5)
  const wz = z + 16 * (fbm(x * 0.022 - 8, z * 0.022 + 2, 3) - 0.5)
  const big = fbm(wx * 0.035 + 1.7, wz * 0.035 + 4.2, 4)
  const fine = fbm(wx * 0.11, wz * 0.11, 2)
  return (big - 0.5) * 2.0 + (fine - 0.5) * 0.28
}

/** Half-float single-channel map of relief() over BOX, for the ground shader. */
export function buildHeightmap(w, toHalf) {
  const h = Math.round(w * (BOX.d / BOX.w))
  const data = new Uint16Array(w * h * 4)
  for (let j = 0; j < h; j += 1) {
    const z = BOX.z0 + ((j + 0.5) / h) * BOX.d
    for (let i = 0; i < w; i += 1) {
      const x = BOX.x0 + ((i + 0.5) / w) * BOX.w
      const o = (j * w + i) * 4
      data[o] = toHalf(relief(x, z))
      data[o + 3] = toHalf(1)
    }
  }
  return { data, w, h }
}
