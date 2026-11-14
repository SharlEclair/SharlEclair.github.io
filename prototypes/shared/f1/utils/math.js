export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

// Deterministic per-index pseudo-random in [0, 1).
export function hash1(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}