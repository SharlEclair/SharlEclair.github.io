/* The object in the niche: a 1-bit ordered-dither sphere on a fluted column, lit from the pointer. */
export function initRelief(canvas, { reduced, onTheme }) {
  const W = canvas.width
  const H = canvas.height
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(W, H)
  const px = new Uint32Array(image.data.buffer)
  const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21]
  const CX = 60, SY = 54, R = 30, K = 0.22
  let ink = 0xffffffff
  const light = { x: -0.62, y: -0.5 }
  const target = { x: -0.62, y: -0.5 }
  let on = reduced ? 1 : 0
  let visible = true
  let frame = 0

  // Brightness 0..1 of a short cylinder seen from slightly above, or -1 outside it.
  const drum = (dx, y, top, bottom, r, L, flutes) => {
    const u = dx / r
    if (u <= -1 || u >= 1) return -1
    const s = Math.sqrt(1 - u * u)
    const e = (y - top) / (r * K)
    if (e * e + u * u < 1) return Math.max(0, -L.y * 0.97 + L.z * 0.24) // top face
    if (y < top || y > bottom + r * K * s) return -1
    let a = Math.asin(u)
    if (flutes) a += 0.5 * Math.sin(a * flutes)
    return Math.max(0, Math.sin(a) * L.x + Math.cos(a) * L.z)
  }

  const shade = (x, y, L) => {
    const dx = x - CX
    const dy = y - SY
    const d2 = dx * dx + dy * dy
    if (d2 < R * R) {
      const nx = dx / R, ny = dy / R
      return 0.03 + 0.97 * Math.max(0, nx * L.x + ny * L.y + Math.sqrt(1 - nx * nx - ny * ny) * L.z)
    }
    let b = drum(dx, y, 84, 91, 40, L, 0) // abacus
    if (b >= 0) {
      // the sphere's shadow, thrown away from the light across the top face
      const sx = (dx + L.x * 24) / 25, sy = (y - 84 + L.y * 3) / (25 * K)
      if (y < 84 + 40 * K && sx * sx + sy * sy < 1) b *= 0.12
      return b
    }
    b = drum(dx, y, 91, 138, 29, L, 13) // fluted shaft
    if (b >= 0) return y < 101 ? b * 0.25 : b
    return drum(dx, y, 138, 147, 40, L, 0) // base
  }

  const draw = () => {
    const len = Math.hypot(light.x, light.y, 0.62)
    const L = { x: light.x / len, y: light.y / len, z: 0.62 / len }
    for (let y = 0, i = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1, i += 1) {
        const b = shade(x + 0.5, y + 0.5, L)
        px[i] = b >= 0 && b * on * 64 > BAYER[(y & 7) * 8 + (x & 7)] + 0.5 ? ink : 0
      }
    }
    ctx.putImageData(image, 0, 0)
  }

  const tick = () => {
    frame = 0
    if (on < 1) on = Math.min(1, on + 0.012)
    light.x += (target.x - light.x) * 0.045
    light.y += (target.y - light.y) * 0.045
    draw()
    const settled = on >= 1 && Math.abs(target.x - light.x) + Math.abs(target.y - light.y) < 0.004
    if (visible && !settled) frame = requestAnimationFrame(tick)
  }
  const wake = () => { if (!frame && visible) frame = requestAnimationFrame(tick) }

  const readInk = () => {
    const [r, g, b] = getComputedStyle(canvas).color.match(/[\d.]+/g).map(Number)
    ink = (255 << 24 | b << 16 | g << 8 | r) >>> 0
    draw()
  }
  onTheme(readInk)
  readInk()

  if (!reduced) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) wake()
    }).observe(canvas)
    addEventListener('pointermove', (event) => {
      if (!visible) return
      const box = canvas.getBoundingClientRect()
      target.x = Math.max(-1, Math.min(1, (event.clientX - box.left - box.width / 2) / (innerWidth * 0.4)))
      target.y = Math.max(-1, Math.min(0.35, (event.clientY - box.top - box.height * 0.34) / (innerHeight * 0.5)))
      wake()
    }, { passive: true })
    wake()
  }
}
