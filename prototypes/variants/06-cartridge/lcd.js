/**
 * The dot-matrix LCD: a 4-shade (0 lightest .. 3 darkest) pixel buffer drawn to a small canvas that
 * CSS scales up with image-rendering: pixelated. All art here is authored as code.
 */
const B8 = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21]

// 3x5 bitmap font: five rows per glyph, each a 3-bit number.
const FONT = {
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227', J: '11152',
  K: '55655', L: '44447', M: '57555', N: '65555', O: '25552', P: '65644', Q: '25563', R: '65655', S: '34216', T: '72222',
  U: '55557', V: '55552', W: '55575', X: '55255', Y: '55222', Z: '71247', 0: '75557', 1: '26227', 2: '61247', 3: '61216',
  4: '55711', 5: '74616', 6: '34757', 7: '71222', 8: '75757', 9: '75716', '.': '00002', ':': '02020', '/': '11244',
  '-': '00700', '+': '02720', '>': '42124', '%': '51245', '!': '22202',
}

const readPalette = () => {
  const style = getComputedStyle(document.documentElement)
  return [0, 1, 2, 3].map((i) => {
    const hex = style.getPropertyValue('--lcd-' + i).trim()
    return [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))
  })
}
let PAL = readPalette()
const repaint = new Set()
// Follows data-theme however it is changed (toggle, OS change, devtools).
new MutationObserver(() => { PAL = readPalette(); repaint.forEach((fn) => fn()) })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
export const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n) }

export class Lcd {
  constructor(canvas, w, h) {
    this.g = canvas.getContext('2d')
    this.size(canvas, w, h)
  }
  size(canvas, w, h) {
    canvas.width = this.w = w
    canvas.height = this.h = h
    this.b = new Uint8Array(w * h)
    this.im = this.g.createImageData(w, h)
  }
  px(x, y, s) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.b[y * this.w + x] = s }
  rect(x, y, w, h, s) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, s) }
  box(x, y, w, h, s) { this.rect(x, y, w, 1, s); this.rect(x, y + h - 1, w, 1, s); this.rect(x, y, 1, h, s); this.rect(x + w - 1, y, 1, h, s) }
  /** Brightness 0..1 through the 8x8 Bayer matrix to one of the four shades. */
  lum(x, y, v) {
    const level = (1 - Math.min(1, Math.max(0, v))) * 3
    this.px(x, y, Math.min(3, Math.floor(level + (B8[(y & 7) * 8 + (x & 7)] + .5) / 64)))
  }
  check(x, y, w, h, a, b) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, (x + i + y + j) & 1 ? a : b) }
  text(x, y, str, s, k = 1) {
    for (const ch of str) {
      const glyph = FONT[ch]
      if (glyph) for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (glyph[r] & (4 >> c)) this.rect(x + c * k, y + r * k, k, k, s)
      x += 4 * k
    }
  }
  sprite(x, y, rows, s) {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') this.px(x + i, y + j, s) })
  }
  blit() {
    const d = this.im.data
    for (let i = 0, j = 0; i < this.b.length; i++, j += 4) {
      const c = PAL[this.b[i]]
      d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255
    }
    this.g.putImageData(this.im, 0, 0)
  }
}

/** Runs draw(frame) at a low fixed rate while `el` is on screen; one still frame (-1) under reduced motion. */
export function loop(el, fps, draw) {
  let frame = reduced ? -1 : 0, visible = false, id = 0, last = 0
  repaint.add(() => draw(frame))
  draw(frame)
  if (reduced) return
  const tick = (t) => {
    id = 0
    if (!visible || document.hidden) return
    if (t - last >= 1000 / fps) { last = t; draw(++frame) }
    id = requestAnimationFrame(tick)
  }
  const wake = () => { if (visible && !id) id = requestAnimationFrame(tick) }
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; wake() }).observe(el)
  document.addEventListener('visibilitychange', wake)
}

const vnoise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  return hash(xi, yi) * (1 - u) * (1 - v) + hash(xi + 1, yi) * u * (1 - v) + hash(xi, yi + 1) * (1 - u) * v + hash(xi + 1, yi + 1) * u * v
}
const fbm = (x, y) => vnoise(x, y) * .55 + vnoise(x * 2.1, y * 2.1) * .3 + vnoise(x * 4.3, y * 4.3) * .15

/** A fluted column lit from the upper left, shaded per pixel and dithered. */
function column(L, cx, top, bottom, cw, capital) {
  const slab = (y, h, half, v) => {
    for (let j = 0; j < h; j++) for (let x = Math.round(cx - half); x < cx + half; x++) L.lum(x, y + j, v * (1 - .5 * Math.max(0, (x - cx) / half)) * (j ? .8 : 1))
  }
  let y = top
  if (capital) {
    slab(y, 3, cw * .8, .95); y += 3
    for (let j = 0; j < 4; j++) slab(y + j, 1, cw * (.74 - j * .06), .8)
    y += 4
    slab(y, 1, cw * .5, .1); y += 1
  }
  const foot = bottom - 5
  for (; y < foot; y++) {
    const t = (y - top) / (foot - top), half = cw * (.42 + .08 * t)
    // A broken top edge for the stump.
    const chip = capital ? 0 : (hash(Math.round(cx), 3) * 6) | 0
    for (let x = Math.round(cx - half); x < cx + half; x++) {
      if (!capital && y - top < ((x * 7 + chip) % 5)) continue
      const u = (x + .5 - cx) / half, a = Math.asin(Math.max(-1, Math.min(1, u)))
      let v = .1 + .9 * Math.max(0, -u * .55 + Math.cos(a) * .62)
      if (Math.cos(a * 9) < -.25) v *= .4
      L.lum(x, y, v)
    }
  }
  slab(foot, 2, cw * .6, .7)
  slab(foot + 2, 3, cw * .74, .85)
}

/** Hero: a stippled night sky with rim-lit cloud, a classical column and a few twinkling four-point stars. */
export function heroSky(canvas, host) {
  const L = new Lcd(canvas, 8, 8)
  let base, stars, cell
  const build = () => {
    const cw = host.clientWidth, ch = host.clientHeight
    cell = cw >= 900 ? 3 : 2
    const w = Math.ceil(cw / cell), h = Math.ceil(ch / cell)
    L.size(canvas, w, h)
    canvas.style.width = w * cell + 'px'
    canvas.style.height = h * cell + 'px'
    host.style.setProperty('--cell', cell + 'px')
    for (let y = 0; y < h; y++) {
      const yn = y / h
      for (let x = 0; x < w; x++) {
        const d = fbm(x / 46 + 3, y / 24) - (1.07 - yn * .78)
        L.lum(x, y, d > 0 ? (d < .022 ? .97 : d < .05 ? .55 : .03 + d * .3) : Math.max(0, .3 + d * 1.7) + yn * .04)
      }
    }
    for (let i = 0; i < w * h / 520; i++) {
      const x = hash(i, 1) * w, y = hash(i, 2) ** 1.4 * h * .82
      if (L.b[(y | 0) * w + (x | 0)] === 3) L.px(x, y, hash(i, 3) > .65 ? 0 : 1)
    }
    const narrow = w < 300, colW = Math.max(16, Math.min(34, w * .07))
    column(L, w * (narrow ? .8 : .83), h * (narrow ? .56 : .2), h - 3, colW, true)
    column(L, w * (narrow ? .8 : .83) - colW * 2.5, h * (narrow ? .86 : .74), h - 2, colW, false)
    base = L.b.slice()
    stars = [[.07, .7], [.46, .64], [.6, .1], [.69, .46], [.93, .09], [.3, .9], [.2, .07]].map(([fx, fy], i) => ({ x: (fx * w) | 0, y: (fy * h) | 0, p: i * 1.7, r: i % 3 === 0 ? 5 : 3 }))
  }
  const draw = (frame) => {
    L.b.set(base)
    for (const s of stars) {
      const r = Math.max(1, Math.round(s.r * (frame < 0 ? .8 : .55 + .45 * Math.sin(frame * .22 + s.p))))
      for (let k = 1; k <= r; k++) {
        const shade = k > r * .6 ? 1 : 0
        L.px(s.x + k, s.y, shade); L.px(s.x - k, s.y, shade); L.px(s.x, s.y + k, shade); L.px(s.x, s.y - k, shade)
      }
      L.px(s.x, s.y, 0)
      if (r > 2) for (const [i, j] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) L.px(s.x + i, s.y + j, 1)
    }
    L.blit()
  }
  build()
  let lastFrame = 0, timer = 0
  loop(host, 7, (f) => { lastFrame = f; draw(f) })
  new ResizeObserver(() => {
    clearTimeout(timer)
    timer = setTimeout(() => { if (Math.ceil(host.clientWidth / cell) !== L.w || Math.ceil(host.clientHeight / cell) !== L.h) { build(); draw(lastFrame) } }, 150)
  }).observe(host)
}

const BUG = ['#.#...#.#', '.#.###.#.', '..#####..', '#########', '..#####..', '.#.###.#.', '#.#...#.#']

/** SQL agent: the run fails, the bug is squashed, the query is re-run and the benchmark fills. */
export function sqlScene(canvas) {
  const L = new Lcd(canvas, 160, 120)
  const steps = ['ASK IN ENGLISH', 'WRITE QUERY', 'SAFETY CHECK']
  loop(canvas, 9, (frame) => {
    const F = frame < 0 ? 86 : frame % 100
    L.b.fill(0)
    L.rect(0, 0, 160, 11, 3)
    L.text(4, 3, 'SQL AGENT', 0)
    L.text(120, 3, 'READ-ONLY', 1)
    const row = (i, label, ticked) => {
      const y = 18 + i * 14
      L.box(6, y - 1, 7, 7, 3)
      if (ticked) L.rect(8, y + 1, 3, 3, 3)
      L.text(18, y, label, 3)
    }
    steps.forEach((label, i) => row(i, label, F >= (i + 1) * 8))
    const fixed = F >= 72
    row(3, F < 24 ? 'RUN' : F < 46 ? (F % 4 < 2 ? 'RUN   ERROR!' : 'RUN') : F < 58 ? 'DIAGNOSE + FIX' : fixed ? 'RUN OK' : 'RE-RUN', fixed)
    if (F >= 58 && !fixed) L.check(48, 60, Math.round((F - 58) / 14 * 100), 5, 3, 0)
    if (F >= 24 && F < 46) L.sprite(Math.round(150 - Math.min(16, F - 24) * 3.2), 58 + (F < 40 ? F & 1 : 0), BUG, 3)
    if (F >= 40 && F < 52) {
      const hy = F < 46 ? 12 + (F - 40) * 7.4 : 56 - (F - 46) * 5
      L.rect(96, hy, 15, 9, 3); L.rect(102, hy - 12, 3, 12, 2); L.rect(98, hy + 2, 11, 1, 1)
    }
    if (F >= 46 && F < 58) { L.rect(96, 64, 15, 2, 3); L.px(93, 62, 3); L.px(113, 61, 3); L.px(91, 65, 2); L.px(115, 64, 2) }
    L.rect(0, 80, 160, 1, 3)
    L.text(6, 87, 'BENCHMARK', 3)
    L.text(124, 87, '45 TESTS', 2)
    L.text(6, 98, fixed ? '10/10' : '9/10', 3, 3)
    for (let i = 0; i < 10; i++) {
      const x = 76 + i * 8
      if (i < 9 || fixed) L.rect(x, 98, 6, 15, i === 9 && F < 78 && F & 1 ? 2 : 3)
      else { L.box(x, 98, 6, 15, 3); if (F >= 58) L.check(x + 1, 99, 4, 13, 2, 0) }
    }
    L.blit()
  })
}

const SAT = ['##.###.##', '#########', '##.###.##', '....#....']

/** Harvest Surprise: a satellite pass reads a reservoir whose level a gauge trace follows. */
export function reservoirScene(canvas) {
  const L = new Lcd(canvas, 160, 120)
  const level = (t) => .5 + .36 * Math.sin(t * .5) + .06 * Math.sin(t * 1.3)
  loop(canvas, 9, (frame) => {
    const f = frame < 0 ? 31 : frame, t = f / 9, lv = level(t), wy = Math.round(72 - lv * 30)
    L.b.fill(0)
    L.rect(0, 0, 160, 11, 3)
    L.text(4, 3, 'RESERVOIR', 0)
    L.text(116, 3, 'SENTINEL-2', 1)
    for (let x = 0; x < 114; x++) {
      const gy = x < 40 ? 30 + x * 1.05 : x < 96 ? 72 : 68
      for (let y = 12; y < 79; y++) {
        if (y >= gy) L.lum(x, y, .22 + .1 * hash(x >> 2, y >> 2))
        else if (x < 96 && y >= wy) L.px(x, y, y === wy ? 3 : (y - wy) % 4 === 2 && ((x + f) >> 2) & 1 ? 2 : (x + y) & 1 ? 1 : 0)
      }
    }
    L.rect(96, 30, 7, 49, 3)
    L.rect(94, 28, 11, 3, 3)
    const sx = Math.round((t * 13) % 190) - 20
    L.sprite(sx, 15, SAT, 3)
    if (sx > 34 && sx < 88) for (let y = 20; y < wy; y += 2) L.px(sx + 4, y, 3)
    L.box(124, 15, 12, 62, 3)
    const fh = Math.round(lv * 58)
    L.check(126, 75 - fh, 8, fh, 3, 1)
    for (let i = 0; i < 6; i++) L.rect(138, 18 + i * 11, i % 2 ? 3 : 6, 1, 3)
    L.rect(118, 75 - fh, 5, 1, 3); L.px(121, 74 - fh, 3); L.px(121, 76 - fh, 3)
    L.rect(0, 80, 160, 1, 3)
    L.text(4, 87, 'GAUGE', 3)
    L.text(4, 104, 'SATELLITE', 3)
    for (let i = 0; i < 112; i++) {
      const tt = t - (111 - i) * .11, g = level(tt), s = g + .12 * (hash(Math.floor(tt * 4), 5) - .5)
      L.px(44 + i, 96 - g * 12, 3)
      if (i % 3 === 0) L.rect(44 + i, 113 - s * 12, 2, 2, 3)
    }
    L.blit()
  })
}
