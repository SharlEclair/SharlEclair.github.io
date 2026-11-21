/**
 * ?sep=ribbon  "Braid": blue, teal and violet ribbons enter from both sides, braid toward the centre and settle into one
 * thin gradient line through a glass pill that names the next section. Canvas 2D, redrawn only while the slot is within a
 * viewport of the screen. Motion is a pure function of t, the slot's scroll progress (0 as it enters, 1 once its centre
 * is mid-screen: under 100vh of scroll). Reduced motion draws t = 1 once.
 */
import { sections } from '../../content.js'

const CSS_HREF = new URL('./ribbon.css', import.meta.url).href
const NEXT = { 1: 'projects', 2: 'experience' }
const DARK = ['#3d6bff', '#2fe0c8', '#a56bff']
const LIGHT = ['#2646e0', '#0b9a8a', '#7a38e0']

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const ease = (v) => { v = clamp(v); return v * v * (3 - 2 * v) }

function ensureStyles() {
  if (document.querySelector('link[data-rb-css]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = CSS_HREF
  link.dataset.rbCss = ''
  document.head.append(link)
}

export function mount(el, { slot, reduced }) {
  ensureStyles()
  const next = sections.find((s) => s.id === NEXT[slot])?.label ?? ''
  el.classList.add('sep-ribbon')
  const canvas = document.createElement('canvas')
  canvas.className = 'rb-canvas'
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const pill = document.createElement('div')
  pill.className = 'rb-pill'
  pill.innerHTML = '<i>Next</i><span></span>'
  pill.lastChild.textContent = next
  el.replaceChildren(canvas, pill)

  let W = 0, H = 0, t = 0
  const light = () => document.documentElement.dataset.theme === 'light'

  function draw() {
    if (!W) return
    const cols = light() ? LIGHT : DARK
    ctx.clearRect(0, 0, W, H)
    const cy = H / 2
    const reach = ease(t / 0.5)
    const tight = ease((t - 0.35) / 0.6)
    const amp = H * 0.34 * (1 - tight)
    const spread = H * 0.38 * (1 - tight)
    const wMax = W < 520 ? 9 : 13
    const width = wMax + (1.6 - wMax) * ease((t - 0.4) / 0.55)
    const N = 56
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalCompositeOperation = light() ? 'source-over' : 'lighter'
    pill.style.setProperty('--pp', ease((t - 0.45) / 0.3).toFixed(3))
    const fade = 1 - ease((t - 0.8) / 0.2) * 0.85
    for (let k = 0; k < 3; k += 1) {
      for (const side of [-1, 1]) {
        ctx.beginPath()
        let any = false
        for (let i = 0; i <= N; i += 1) {
          const u = 1 - (i / N) * reach // 1 at the page edge, 1 - reach at the visible tip
          const x = W / 2 + side * u * (W / 2 + 24)
          const env = Math.pow(u, 0.85)
          const braid = Math.sin(u * Math.PI * 2.6 + (k * Math.PI * 2) / 3 + t * 2.2) * amp * env
          const fan = (k - 1) * spread * Math.pow(u, 1.4)
          const y = cy + side * (braid + fan) * 0.9
          if (!any) { ctx.moveTo(x, y); any = true } else ctx.lineTo(x, y)
        }
        if (reach <= 0.001) continue
        ctx.strokeStyle = cols[k]
        ctx.globalAlpha = (light() ? 0.14 : 0.1) * fade
        ctx.lineWidth = width * 2.4
        ctx.stroke()
        ctx.globalAlpha = (light() ? 0.85 : 0.5) * fade
        ctx.lineWidth = width
        ctx.stroke()
      }
    }
    // the settled line: one thin gradient across the page
    const lineA = ease((t - 0.75) / 0.25)
    if (lineA > 0) {
      const g = ctx.createLinearGradient(0, 0, W, 0)
      g.addColorStop(0, cols[0]); g.addColorStop(0.5, cols[1]); g.addColorStop(1, cols[2])
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = lineA
      ctx.strokeStyle = g
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  function resize() {
    const r = el.getBoundingClientRect()
    const dpr = Math.min(devicePixelRatio || 1, 2)
    W = r.width; H = r.height
    canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    update()
  }
  const update = () => {
    if (reduced) t = 1
    else {
      const r = el.getBoundingClientRect(), vh = innerHeight
      t = clamp((vh - r.top) / (0.5 * vh + 0.5 * r.height))
    }
    draw()
  }

  let raf = 0
  const tick = () => { raf = 0; update() }
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick) }
  const ro = new ResizeObserver(resize); ro.observe(el)
  const mo = new MutationObserver(draw); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  let io
  if (!reduced) {
    io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { addEventListener('scroll', onScroll, { passive: true }); onScroll() }
      else { removeEventListener('scroll', onScroll); onScroll() }
    }, { rootMargin: '100% 0px' })
    io.observe(el)
  }
  return () => { ro.disconnect(); mo.disconnect(); io?.disconnect(); removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); canvas.remove(); pill.remove(); el.classList.remove('sep-ribbon') }
}
