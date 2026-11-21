/**
 * ?sep=led  "LED Bloom": a dark LED panel. A purple, blue and teal wave sweeps across it from left to right and, as it
 * passes, the cells settle into one dot-matrix caption set in the console's own 5x7 pixel font. Canvas 2D, one rect per
 * cell, redrawn only while the slot is within a viewport of the screen. Pure function of t (slot scroll progress, 0 as it
 * enters, 1 when its centre is mid-screen). Reduced motion draws t = 1 once.
 * Captions are facts from content.js: slot 1 the coursebook build, slot 2 the two places of work.
 */
import { howIWork, work } from '../../content.js'
import { drawText, measureText } from '../../gb/pixfont.js'

const CSS_HREF = new URL('./led.css', import.meta.url).href
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (a, b, v) => { v = clamp((v - a) / (b - a)); return v * v * (3 - 2 * v) }
const mix = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f)
const STOPS = [[165, 107, 255], [61, 107, 255], [47, 224, 200]]
const hue = (x) => (x < 0.5 ? mix(STOPS[0], STOPS[1], x * 2) : mix(STOPS[1], STOPS[2], x * 2 - 1))
const hash = (c, r) => { const s = Math.sin(c * 127.1 + r * 311.7) * 43758.5453; return s - Math.floor(s) }

// "389.9 seconds to 34.2" and the Mumbai to Melbourne move are both stated in content.js; derive, do not retype.
function caption(slot) {
  if (slot === 1) {
    const from = howIWork.paragraphs[0].match(/(\d+\.\d) seconds/)[1]
    const to = howIWork.paragraphs[1].match(/runs in (\d+\.\d) seconds/)[1]
    return `${from} s to ${to} s`
  }
  const places = [...new Set(work.map((w) => w.place))].reverse()
  return places.join(' to ')
}

function ensureStyles() {
  if (document.querySelector('link[data-led-css]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = CSS_HREF
  link.dataset.ledCss = ''
  document.head.append(link)
}

export function mount(el, { slot, reduced }) {
  ensureStyles()
  const text = caption(slot).toUpperCase()
  el.classList.add('sep-led')
  const panel = document.createElement('div')
  panel.className = 'led-panel'
  const canvas = document.createElement('canvas')
  canvas.className = 'led-canvas'
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  panel.append(canvas)
  el.replaceChildren(panel)

  const textCols = (text.length * 6 - 1)
  const mask = document.createElement('canvas')
  let cols = 0, rows = 0, cell = 7, bits = null, W = 0, t = 0

  function layout() {
    W = Math.floor(panel.getBoundingClientRect().width) - 2
    if (W < 40) return false
    cell = clamp(Math.floor(W / (textCols + 16)), 3, 7)
    cols = Math.floor(W / cell)
    rows = Math.max(15, Math.floor((W < 520 ? 104 : 112) / cell)) | 1
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.style.height = rows * cell + 'px'
    canvas.width = Math.round(cols * cell * dpr); canvas.height = Math.round(rows * cell * dpr)
    canvas.style.width = cols * cell + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    mask.width = cols; mask.height = rows
    const m = mask.getContext('2d', { willReadFrequently: true })
    m.clearRect(0, 0, cols, rows)
    drawText(m, text, Math.floor((cols - measureText(text, 1)) / 2), Math.floor((rows - 7) / 2), '#fff', 1)
    const d = m.getImageData(0, 0, cols, rows).data
    bits = new Uint8Array(cols * rows)
    for (let i = 0; i < bits.length; i += 1) bits[i] = d[i * 4 + 3] > 100 ? 1 : 0
    return true
  }

  function draw() {
    if (!bits) return
    ctx.clearRect(0, 0, cols * cell, rows * cell)
    const f = -0.12 + 1.5 * t
    const L = 0.3
    const s = cell * 0.74, o = (cell - s) / 2
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const xn = c / cols
        const d = f - xn - (r / rows) * 0.05
        const on = bits[r * cols + c]
        const h = hash(c, r)
        let b = 0.07, rgb = null, white = 0
        if (d >= 0) {
          if (d < L) {
            b = Math.pow(1 - d / L, 1.5) * (0.3 + 0.7 * h)
            white = smooth(0.06, 0, d)
            if (on) b = Math.max(b, smooth(0.08, L, d) * 0.95)
          } else if (on) {
            b = 0.82 + 0.18 * h
          } else {
            b = 0.07 + 0.1 * h * smooth(L + 0.25, L, d)
          }
          rgb = hue(clamp(xn))
          if (white) rgb = mix(rgb, [255, 255, 255], white)
        }
        const x = c * cell + o, y = r * cell + o
        if (!rgb) { ctx.fillStyle = 'rgba(130,140,190,0.10)'; ctx.fillRect(x + s * 0.25, y + s * 0.25, s * 0.5, s * 0.5); continue }
        if (b > 0.45) {
          ctx.fillStyle = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${(b * 0.16).toFixed(3)})`
          ctx.fillRect(x - cell * 0.5, y - cell * 0.5, s + cell, s + cell)
        }
        ctx.fillStyle = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${clamp(b).toFixed(3)})`
        ctx.fillRect(x, y, s, s)
      }
    }
  }

  const update = () => {
    if (reduced) t = 1
    else {
      const r = el.getBoundingClientRect(), vh = innerHeight
      t = clamp((vh - r.top) / (0.5 * vh + 0.5 * r.height))
    }
    draw()
  }
  const resize = () => { if (layout()) update() }

  let raf = 0
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update() }) }
  const ro = new ResizeObserver(resize); ro.observe(panel)
  let io
  if (!reduced) {
    io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) addEventListener('scroll', onScroll, { passive: true })
      else removeEventListener('scroll', onScroll)
      onScroll()
    }, { rootMargin: '100% 0px' })
    io.observe(el)
  }
  return () => { ro.disconnect(); io?.disconnect(); removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); panel.remove(); el.classList.remove('sep-led') }
}
