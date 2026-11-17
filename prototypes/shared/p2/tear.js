/**
 * Torn-paper separators that tear as you scroll.
 *
 *   <div class="tear" data-seed="7" data-label="Next: the work"></div>
 *
 * Each separator is a strip of paper in two halves. As it crosses the viewport a crack runs along the strip from left
 * to right and the halves pull apart, each with a pale fibre edge, until a dark gap shows the label. Scrolling back
 * closes it again. The crack travels in scroll distance well inside one viewport. With reduced motion it stays half open.
 */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const ease = (t) => t * t * (3 - 2 * t)
const N = 56

function rng(seed) {
  let a = seed
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** A jagged line of N+1 y values in percent: a slow wander plus small bites. */
function jag(r, base, wander, bite, phase) {
  const out = []
  for (let i = 0; i <= N; i += 1) {
    const x = i / N
    out.push(base + Math.sin(x * 9 + phase) * wander + Math.sin(x * 23 + phase * 2) * wander * 0.4 + (r() - 0.5) * bite)
  }
  return out
}

function poly(points) {
  return `polygon(${points.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(',')})`
}

function build(el) {
  const seed = Number(el.dataset.seed || 1)
  const r = rng(seed * 97 + 13)
  const top = jag(r, 9, 3.2, 6, seed)
  const bot = jag(r, 91, 3.2, 6, seed * 2)
  const mid = jag(r, 50, 5.5, 8, seed * 3)
  // fibres: a little ragged offset along the torn edges so the paper looks like it has thickness there
  const fibre = mid.map(() => 0.6 + r() * 1.6)
  const mk = (cls) => { const i = document.createElement('i'); i.className = cls; el.appendChild(i); return i }
  const gap = document.createElement('b')
  gap.className = 'tear-gap'
  el.appendChild(gap)
  if (el.dataset.label) {
    const s = document.createElement('span')
    s.textContent = el.dataset.label
    el.appendChild(s)
  }
  const upFib = mk('tear-fib')
  const up = mk('tear-sheet')
  const loFib = mk('tear-fib')
  const lo = mk('tear-sheet')
  el.classList.add('is-built')
  return { top, bot, mid, fibre, up, upFib, lo, loFib, gap, label: el.querySelector('span'), last: -1 }
}

function paint(t, s) {
  // the crack front runs left to right and opens with a soft shoulder behind it
  const front = t * 1.35 - 0.1
  const G = 15 // max half-gap in percent of the strip height
  const up = []
  const upF = []
  const lo = []
  const loF = []
  for (let i = 0; i <= N; i += 1) {
    const x = i / N
    const g = ease(clamp((front - x) / 0.3)) * G * (0.8 + 0.4 * ((i * 7) % 5) / 4)
    up.push([x * 100, s.mid[i] - g])
    upF.push([x * 100, s.mid[i] - g + s.fibre[i] * ease(clamp(g / 3))])
    lo.push([x * 100, s.mid[i] + g])
    loF.push([x * 100, s.mid[i] + g - s.fibre[i] * ease(clamp(g / 3))])
  }
  const topPts = s.top.map((y, i) => [(i / N) * 100, y])
  const botPts = s.bot.map((y, i) => [(i / N) * 100, y])
  const upper = [...topPts, ...up.slice().reverse()].reverse()
  const lower = [...lo, ...botPts.slice().reverse()]
  s.up.style.clipPath = poly(upper)
  s.upFib.style.clipPath = poly([...topPts, ...upF.slice().reverse()].reverse())
  s.lo.style.clipPath = poly(lower)
  s.loFib.style.clipPath = poly([...loF, ...botPts.slice().reverse()])
  // gap shows the dark void between the halves
  s.gap.style.clipPath = poly([...up, ...lo.slice().reverse()])
  if (s.label) s.label.style.opacity = String(ease(clamp((t - 0.55) / 0.3)))
  const sway = (t - 0.5) * 0.9
  s.up.style.transform = s.upFib.style.transform = `translateY(${(-t * 1.2).toFixed(2)}px) rotate(${(-sway * 0.35).toFixed(3)}deg)`
  s.lo.style.transform = s.loFib.style.transform = `translateY(${(t * 1.2).toFixed(2)}px) rotate(${(sway * 0.35).toFixed(3)}deg)`
}

export function initTears(selector = '.tear') {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const items = [...document.querySelectorAll(selector)].map((el) => ({ el, s: build(el), visible: false }))
  if (!items.length) return
  if (reduced) { for (const it of items) paint(0.62, it.s); return }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) { const it = items.find((x) => x.el === e.target); if (it) it.visible = e.isIntersecting }
    tick()
  }, { rootMargin: '10% 0px' })
  for (const it of items) { io.observe(it.el); paint(0, it.s) }

  let queued = false
  function tick() {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      const vh = innerHeight
      for (const it of items) {
        if (!it.visible) continue
        const rect = it.el.getBoundingClientRect()
        // 0 when the strip's centre is at 88% of the viewport height, 1 when it is at 38%: half a screen of scroll
        const c = rect.top + rect.height / 2
        const t = clamp((vh * 0.88 - c) / (vh * 0.5))
        if (Math.abs(t - it.s.last) > 0.002) { it.s.last = t; paint(t, it.s) }
      }
    })
  }
  addEventListener('scroll', tick, { passive: true })
  addEventListener('resize', tick)
  tick()
}
