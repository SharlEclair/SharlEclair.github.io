import { stableVh } from '/shared/ui/viewport.js'
/**
 * Torn-page separators: the page itself rips open as you scroll and an old newspaper shows through the gap.
 *
 *   <div class="tear" data-seed="7" data-variant="a" data-label="Next: the work"></div>
 *
 * Variants (per separator with data-variant, or for the whole page with ?tear=a|b|c, which wins):
 *   a  broadsheet front page: masthead, headline, justified columns, a halftone photo
 *   b  classifieds: small ads and a word search whose circled letters spell a hidden word
 *   c  sports page: chequered strip, a lap-times table, a halftone car
 *
 * The two halves are filled with the page background so they read as the sections above and below. Their torn edges
 * come from multi-octave value noise sampled once per size; each frame only works out how far each point has opened
 * and rewrites a handful of clip-path polygons (no filters, no layout). A crack front runs left to right over a
 * quarter of a viewport of scroll, and the newspaper drifts a little slower than the page. Scrolling back closes it.
 * With reduced motion the tear stays half open. Looks live in tear.css; page.css only sizes the band.
 */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const ease = (t) => t * t * (3 - 2 * t)
const CSS_HREF = new URL('./tear.css', import.meta.url).href
const VARIANTS = ['a', 'b', 'c']

function rng(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** Fractal 1D value noise on 0..1, roughly in -1..1. `base` is the coarsest number of bumps across the width. */
function fbm(r, octaves, base, gain = 0.5) {
  const layers = []
  let amp = 1
  let norm = 0
  for (let k = 0; k < octaves; k += 1) {
    const f = base * 2 ** k
    const v = Array.from({ length: Math.ceil(f) + 2 }, () => r() * 2 - 1)
    layers.push({ f, a: amp, v })
    norm += amp
    amp *= gain
  }
  return (x) => {
    let s = 0
    for (const { f, a, v } of layers) {
      const p = x * f
      const i = Math.floor(p)
      const u = ease(p - i)
      s += a * (v[i] * (1 - u) + v[i + 1] * u)
    }
    return s / norm
  }
}

/* ---------------------------------------------------------------- newspaper */

const POOL = [
  'Residents of the upper half of the page reported a loud rip late on a weekday, followed by a short silence and then more scrolling. Officials urged calm and confirmed that the content below is expected to arrive on schedule.',
  'A spokesperson for the lower half declined to comment, citing an ongoing investigation and a strong preference for staying attached. Neighbours describe the two halves as quiet, tidy and mostly rectangular.',
  'Experts say paper of this kind tears along the grain about as often as it tears against it, which they called a very useful finding for anyone who has ever tried to open a sandwich in a hurry.',
  'The council has approved a new roundabout that will, according to planners, go round. Work is expected to begin once someone finds the original drawings, last seen under a mug in the staff kitchen.',
  'In other news, a local cat has been named interim manager of the sunny spot by the window. Early reviews are positive, although productivity is said to fall sharply after lunch and does not recover.',
  'Weather: mostly scrolling, with a chance of clicking later in the afternoon. A light breeze of curiosity is expected to move in from the left and carry on steadily to the right.',
  'Letters to the editor were dominated this week by a heated debate over whether the semicolon is simply a comma that went to university. The editor has asked readers to please stop sending punctuation by post.',
  'A routine test of the town alarm was declared a success after everyone ignored it in the usual way. A second test, planned for Thursday, will be ignored with renewed vigour.',
  'Shoppers at the market were surprised to find the price of patience unchanged for another season. Traders blamed demand, which they said remains stubbornly low among people waiting for a page to load.',
  'The library has extended its opening hours for people who intend to read the terms and conditions. Staff report a quiet start and have put the kettle on.',
]

function paras(seed, lead = []) {
  const r = rng(seed * 31 + 5)
  const pool = POOL.slice()
  for (let i = pool.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  return [...lead, ...pool].map((p) => `<p>${p}</p>`).join('')
}

const SEARCH = ['SCROLLQHA', 'PAPERMIZE', 'UTORNWNLB', 'GFDYXQKVL', 'OWJMTSRFC', 'BNAHDEUIY']
const CIRCLED = new Set(['0,7', '1,8', '2,7', '3,8', '4,0']) // reading order spells HELLO

const LAPS = [
  ['The Safety Car', 'Hazard Lights GP', '1:31.402'],
  ['R. Marmalade', 'Toast Racing', '1:31.517'],
  ['K. Tyresmoke', 'Biscuit Works', '1:31.880'],
  ['Office Printer', 'Paper Jam Racing', '1:32.006'],
  ['Monday Morning', 'Snooze Motorsport', '1:32.314'],
  ['A Pigeon', 'Independent', '1:33.090'],
  ['The Wi-Fi', 'Buffering Team', 'no time'],
]

function front(v, seed) {
  if (v === 'b') {
    const ads = [
      ['For sale.', 'One semicolon, lightly used, no longer needed. Collect only.'],
      ['Lost.', 'Train of thought, last seen halfway through a sentence. Answers to "wait, what was I saying".'],
      ['Wanted.', 'A bug that happens every time, not only on Fridays. Will pay in biscuits.'],
      ['Free to good home.', 'Seventeen browser tabs, all very important. Must take all of them.'],
      ['Help wanted.', 'Rubber duck for late shifts. Must be a patient listener. Quacking optional.'],
      ['Found.', 'One missing pixel, slightly to the left. Owner may claim by describing its colour.'],
      ['Personal.', 'Tall dark mode seeks light theme for quiet evenings in. No flashing, please.'],
      ['Services.', 'Cables untangled while you wait. Emotional support included at no extra cost.'],
      ['Notice.', 'The meeting that could have been an email is now an email. Thank you all for coming.'],
      ['Swap.', 'Will trade one strong opinion on tabs for two on spaces. Serious offers only.'],
      ['For hire.', 'Quiet keyboard, gently loved. Most keys still in the original order.'],
    ]
    const grid = SEARCH.map((row, y) => [...row].map((ch, x) => `<i${CIRCLED.has(`${y},${x}`) ? ' class="c"' : ''}>${ch}</i>`).join('')).join('')
    return `<div class="np-page np-b">
<header class="np-bar"><b>Classifieds</b><span>Small ads. Big feelings.</span><span class="np-folio"></span></header>
<div class="np-row">
<div class="np-cols np-ads">${ads.map(([k, t]) => `<p><b>${k}</b> ${t}</p>`).join('')}${paras(seed)}</div>
<aside class="np-puzzle"><h4>Puzzle corner</h4><div class="np-grid">${grid}</div><p>Find TORN, PAPER, INK and SCROLL. The circled letters spell a greeting.</p></aside>
</div></div>`
  }
  if (v === 'c') {
    const rows = LAPS.map(([d, tm, lap], i) => `<tr><td>${i + 1}</td><td>${d}</td><td>${tm}</td><td>${lap}</td></tr>`).join('')
    return `<div class="np-page np-c">
<div class="np-flag"></div>
<header class="np-sport"><b>Sport</b><h3>Pit wall asks driver to go faster. Driver agrees.</h3><span class="np-folio"></span></header>
<div class="np-row">
<table class="np-table"><caption>Qualifying, best laps</caption><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Best</th></tr></thead><tbody>${rows}</tbody></table>
<div class="np-cols">${paras(seed, ['The safety car took pole for the first time in living memory and then politely refused to leave the track. Stewards are reviewing the footage, mostly because it is very relaxing to watch.', 'Strategy meetings ran long into the evening. Insiders say the sandwiches were the real winners of the weekend.'])}</div>
<figure class="np-fig"><span class="np-ht" data-ht="car"></span><figcaption>Pictured: a car, going.</figcaption></figure>
</div></div>`
  }
  return `<div class="np-page np-a">
<header class="np-mast"><span>Late edition<br>Weather: fair, then torn</span><b>The Daily Scroll</b><span class="np-folio"></span></header>
<h3 class="np-head">Local engineer lets it happen</h3>
<p class="np-deck">Page splits cleanly in two. Witnesses describe the rip as "honestly quite satisfying".</p>
<div class="np-row">
<div class="np-cols">${paras(seed)}</div>
<figure class="np-fig"><span class="np-ht" data-ht="plant"></span><figcaption>Pictured: the moment of the tear, as seen by a nearby houseplant.</figcaption></figure>
</div></div>`
}

/** A halftone photo drawn once per kind: dot size follows a soft silhouette, on a 45 degree screen. */
const htCache = new Map()
function halftone(kind) {
  if (htCache.has(kind)) return htCache.get(kind)
  const W = 280
  const H = 200
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const blob = (x, y, cx, cy, rx, ry) => clamp(1.2 - Math.hypot((x - cx) / rx, (y - cy) / ry))
  const field = kind === 'car'
    ? (x, y) => Math.max(
      0.22 + 0.25 * (y / H),
      0.92 * blob(x, y, 140, 112, 118, 24),
      0.8 * blob(x, y, 150, 92, 36, 18),
      0.98 * blob(x, y, 62, 130, 22, 22), 0.98 * blob(x, y, 222, 130, 22, 22),
      0.55 * blob(x, y, 140, 160, 150, 14),
      0.7 * blob(x, y, 250, 98, 14, 26),
    )
    : (x, y) => Math.max(
      0.16 + 0.32 * (x / W) * (y / H),
      0.9 * blob(x, y, 140, 168, 40, 32),
      0.7 * blob(x, y, 108, 98, 22, 56), 0.75 * blob(x, y, 168, 92, 20, 60),
      0.62 * blob(x, y, 82, 120, 40, 16), 0.66 * blob(x, y, 202, 116, 42, 15), 0.55 * blob(x, y, 140, 62, 14, 46),
    )
  const step = 4.2
  const cos = Math.SQRT1_2
  g.fillStyle = '#1b1813'
  g.beginPath()
  for (let u = -W; u < W * 2; u += step) {
    for (let v = -H * 2; v < H * 2; v += step) {
      const x = (u - v) * cos
      const y = (u + v) * cos
      if (x < -3 || y < -3 || x > W + 3 || y > H + 3) continue
      const d = clamp(field(x, y))
      const rad = Math.sqrt(d) * step * 0.6
      if (rad < 0.35) continue
      g.moveTo(x + rad, y)
      g.arc(x, y, rad, 0, Math.PI * 2)
    }
  }
  g.fill()
  const url = c.toDataURL('image/png')
  htCache.set(kind, url)
  return url
}

/* ---------------------------------------------------------------- build and geometry */

function pickVariant(el) {
  const q = new URLSearchParams(location.search).get('tear')
  if (VARIANTS.includes(q)) return q
  return VARIANTS.includes(el.dataset.variant) ? el.dataset.variant : 'a'
}

function build(el) {
  const seed = Number(el.dataset.seed || 1)
  const variant = pickVariant(el)
  el.dataset.v = variant
  el.setAttribute('aria-hidden', 'true') // the newspaper is decoration, keep the jokes away from screen readers
  el.textContent = ''
  const np = document.createElement('div')
  np.className = 'tear-np'
  np.innerHTML = front(variant, seed)
  for (const f of np.querySelectorAll('.np-folio')) f.textContent = el.dataset.label ? `${el.dataset.label}, see below` : 'Continued below'
  for (const h of np.querySelectorAll('[data-ht]')) h.style.backgroundImage = `url(${halftone(h.dataset.ht)})`
  el.appendChild(np)
  const L = {}
  // stacking order is DOM order: shadows on the newsprint, then fibre rims, then the page halves, then their lips
  for (const k of ['shU2', 'shU1', 'shL2', 'shL1', 'fbU', 'rmU', 'fbL', 'rmL', 'pgU', 'pgL', 'lpU', 'lpL']) {
    const i = document.createElement('i')
    i.className = { sh: 'tear-sh', fb: 'tear-fb', rm: 'tear-rim', pg: 'tear-page', lp: 'tear-lip' }[k.slice(0, 2)] + (k.endsWith('2') ? ' s2' : '')
    el.appendChild(i)
    L[k] = i
  }
  el.classList.add('is-built')
  return { el, seed, np, L, last: -1, geo: null }
}

/** Everything that depends on the seed and the size: the crack line, rim widths and fibres, in px. */
function shape(s) {
  const W = s.el.clientWidth
  const H = s.el.clientHeight
  const r = rng(s.seed * 97 + 13)
  const n = Math.round(clamp(W / 4, 100, 400))
  const crack = fbm(r, 7, 3, 0.6)
  const slope = (r() - 0.5) * 0.12
  const side = fbm(r, 3, 2)
  const rimN = fbm(r, 5, 8)
  const split = fbm(r, 3, 1.5)
  const xs = []
  const mid = []
  const rimU = []
  const rimL = []
  const fibU = []
  const fibL = []
  const kU = []
  let bite = 0
  for (let i = 0; i <= n; i += 1) {
    const x = i / n
    xs.push(i === 0 ? -2 : i === n ? W + 2 : x * W)
    if (r() < 0.06) bite = (r() - 0.5) * 9
    bite *= 0.6
    mid.push(H * (0.5 + (x - 0.5) * slope) + crack(x) * H * 0.16 + bite + (r() - 0.5) * 1.4)
    // the white core shows mostly on one half at a time and swaps sides along the edge, as real tears do
    const sd = side(x) * 1.6
    const base = 2.1 + rimN(x) * 1.8
    rimU.push(clamp(base + Math.max(0, sd) * 7, 0.4, 9))
    rimL.push(clamp(base * 0.7 + Math.max(0, -sd) * 7, 0.3, 9))
    const spike = () => (r() < 0.2 ? 1.5 + r() * 6 : 0.3 + r() * 1.6)
    fibU.push(spike())
    fibL.push(spike())
    kU.push(1 + split(x) * 0.25)
  }
  return { W, H, n, xs, mid, rimU, rimL, fibU, fibL, kU }
}

function poly(xs, a, b, step) {
  // a runs left to right; b (array, or a constant y) runs back right to left
  let out = ''
  const n = xs.length - 1
  for (let i = 0; i <= n; i += (i + step > n && i !== n ? n - i : step)) out += `${xs[i].toFixed(1)}px ${a[i].toFixed(1)}px,`
  if (typeof b === 'number') return `polygon(${out}${xs[n] + 2}px ${b}px,-4px ${b}px)`
  for (let i = n; i >= 0; i -= (i - step < 0 && i !== 0 ? i : step)) out += `${xs[i].toFixed(1)}px ${b[i].toFixed(1)}px,`
  return `polygon(${out.slice(0, -1)})`
}

function paint(t, s, gscale = 1, sweep = true) {
  const G = s.geo
  if (!G) return
  const { n, xs, mid, H } = G
  const head = sweep ? -0.05 + t * 1.55 : 2
  const gmax = H * 0.36 * gscale
  const yU = []; const yL = []; const rU = []; const rL = []; const fU = []; const fL = []
  const s1U = []; const s2U = []; const s1L = []; const s2L = []; const lU = []; const lL = []
  let any = false
  for (let i = 0; i <= n; i += 1) {
    const sx = ease(clamp((head - i / n) / 0.45))
    const g = gmax * sx
    const open = clamp(g / 10)
    if (g > 0.3) any = true
    const curl = 1 + 2.4 * sx * (1 - sx) // the edge lifts a little more just behind the crack front
    const gu = g * G.kU[i]
    const gl = g * (2 - G.kU[i])
    const u = mid[i] - gu + 0.8
    const l = mid[i] + gl - 0.8
    yU.push(u); yL.push(l)
    const ru = G.rimU[i] * open * curl
    const rl = G.rimL[i] * open * curl
    rU.push(u + ru); rL.push(l - rl)
    fU.push(u + ru + G.fibU[i] * open); fL.push(l - rl - G.fibL[i] * open)
    s1U.push(u + ru + 3.5 * open); s2U.push(u + ru + 9 * open)
    s1L.push(l - rl - 1.5 * open); s2L.push(l - rl - 4 * open)
    lU.push(u - 6 * open); lL.push(l + 6 * open)
  }
  const L = s.L
  L.pgU.style.clipPath = topPoly(xs, yU, 1)
  L.pgL.style.clipPath = poly(xs, yL, H + 4, 1)
  L.rmU.style.clipPath = topPoly(xs, rU, 1)
  L.rmL.style.clipPath = poly(xs, rL, H + 4, 1)
  L.fbU.style.clipPath = topPoly(xs, fU, 1)
  L.fbL.style.clipPath = poly(xs, fL, H + 4, 1)
  L.shU1.style.clipPath = topPoly(xs, s1U, 2)
  L.shU2.style.clipPath = topPoly(xs, s2U, 3)
  L.shL1.style.clipPath = poly(xs, s1L, H + 4, 2)
  L.shL2.style.clipPath = poly(xs, s2L, H + 4, 3)
  L.lpU.style.clipPath = poly(xs, lU, yU, 2)
  L.lpL.style.clipPath = poly(xs, yL, lL, 2)
  s.el.classList.toggle('is-open', any)
  s.np.style.transform = `translate3d(0,${((1 - t) * H * 0.18).toFixed(1)}px,0)`
}

/** Upper half: the edge left to right, then across the top. */
function topPoly(xs, a, step) {
  const n = xs.length - 1
  let out = ''
  for (let i = 0; i <= n; i += (i + step > n && i !== n ? n - i : step)) out += `${xs[i].toFixed(1)}px ${a[i].toFixed(1)}px,`
  return `polygon(${out}${xs[n] + 2}px -4px,-4px -4px)`
}

function loadCss() {
  return new Promise((done) => {
    const had = document.querySelector('link[data-tear-css]')
    if (had) { if (had.sheet) done(); else had.addEventListener('load', done); return }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = CSS_HREF
    link.dataset.tearCss = ''
    link.onload = link.onerror = () => done()
    document.head.appendChild(link)
  })
}

export async function initTears(selector = '.tear') {
  const els = [...document.querySelectorAll(selector)]
  if (!els.length) return
  await loadCss()
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const items = els.map((el) => ({ s: build(el), visible: false }))
  const progress = (s) => {
    if (reduced) return 0.5
    const rect = s.el.getBoundingClientRect()
    // a quarter of a viewport of scroll: closed with the band's centre at 76% of the viewport, fully open at 51%
    return clamp((stableVh() * 0.76 - (rect.top + rect.height / 2)) / (stableVh() * 0.25))
  }
  const draw = (s, force) => {
    const t = progress(s)
    if (!force && Math.abs(t - s.last) < 0.002) return
    s.last = t
    if (reduced) paint(0.5, s, 0.55, false)
    else paint(t, s)
  }
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) { const it = items.find((x) => x.s.el === e.target); if (it) { it.s.geo = shape(it.s); draw(it.s, true) } }
  })
  for (const it of items) { it.s.geo = shape(it.s); draw(it.s, true); ro.observe(it.s.el) }
  if (reduced) return

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) { const it = items.find((x) => x.s.el === e.target); if (it) it.visible = e.isIntersecting }
    tick()
  }, { rootMargin: '10% 0px' })
  for (const it of items) io.observe(it.s.el)

  let queued = false
  function tick() {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      for (const it of items) if (it.visible) draw(it.s)
    })
  }
  addEventListener('scroll', tick, { passive: true })
  tick()
}
