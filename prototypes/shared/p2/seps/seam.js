/**
 * ?sep=seam  "Isochrone Seam". The Transit Desert method as a divider: a hex grid floods with travel time from two pins
 * (Melbourne, Mumbai: the two places the work was done); where the floods meet a ragged seam forms; the flood colour
 * then drains and only the seam stays as a line across the page. One canvas 2D, ~5 draw calls per frame.
 *
 * Choreography over 70vh of scroll (band top from 90% to 20% of the viewport), p 0..1:
 *   0 .. .55   flood threshold rises 0 -> max cost; hexes below it fill in 4 isochrone bands
 *   .55 .. .85 band fills fade 1 -> 0 while the seam stroke fades 0 -> 1
 *   .85 .. 1   hold
 */
const CSS_URL = new URL('./seam.css', import.meta.url).href
const CAPTION = 'Where the work was done. Not to scale.'
const BAND_ALPHA = [0.85, 0.5, 0.28, 0.14]
const SQ3 = Math.sqrt(3)

/* ---------- tiny seeded noise ---------- */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function makeFbm(seed) {
  const r = rng(seed)
  const N = 64
  const lat = new Float32Array(N * N)
  for (let i = 0; i < lat.length; i += 1) lat[i] = r()
  const at = (x, y) => lat[((y & (N - 1)) * N) + (x & (N - 1))]
  const sm = (t) => t * t * (3 - 2 * t)
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y)
    const u = sm(x - xi), v = sm(y - yi)
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  return (x, y) => {
    let sum = 0, amp = 0.5, norm = 0
    for (let o = 0; o < 3; o += 1) {
      sum += amp * vnoise(x, y)
      norm += amp
      x *= 2; y *= 2; amp *= 0.5
    }
    return sum / norm
  }
}

/* ---------- binary min-heap on (cost, node) ---------- */
function makeHeap(cap) {
  const keys = new Float64Array(cap)
  const vals = new Int32Array(cap)
  let n = 0
  return {
    get size() { return n },
    push(k, v) {
      let i = n++
      while (i > 0) {
        const p = (i - 1) >> 1
        if (keys[p] <= k) break
        keys[i] = keys[p]; vals[i] = vals[p]; i = p
      }
      keys[i] = k; vals[i] = v
    },
    pop() {
      const top = vals[0], topK = keys[0]
      n -= 1
      if (n > 0) {
        const k = keys[n], v = vals[n]
        let i = 0
        for (;;) {
          let c = i * 2 + 1
          if (c >= n) break
          if (c + 1 < n && keys[c + 1] < keys[c]) c += 1
          if (keys[c] >= k) break
          keys[i] = keys[c]; vals[i] = vals[c]; i = c
        }
        keys[i] = k; vals[i] = v
      }
      this.lastKey = topK
      return top
    },
    lastKey: 0,
  }
}

/* ---------- grid + cost field (rebuilt on resize only) ---------- */
function build(W, H, mobile, seed) {
  const R = mobile ? 10 : Math.max(12, W / 110)
  const w = SQ3 * R, rowH = 1.5 * R
  const cols = Math.ceil(W / w) + 2
  const rows = Math.ceil(H / rowH) + 2
  const n = cols * rows
  const cx = new Float32Array(n), cy = new Float32Array(n)
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c
      cx[i] = (c - 0.5) * w + (r & 1 ? w / 2 : 0)
      cy[i] = (r - 0.5) * rowH
    }
  }
  const nbr = (i, out) => {
    const r = (i / cols) | 0, c = i - r * cols
    const odd = r & 1
    let k = 0
    const add = (cc, rr) => { if (cc >= 0 && cc < cols && rr >= 0 && rr < rows) out[k++] = rr * cols + cc }
    add(c - 1, r); add(c + 1, r)
    add(odd ? c : c - 1, r - 1); add(odd ? c + 1 : c, r - 1)
    add(odd ? c : c - 1, r + 1); add(odd ? c + 1 : c, r + 1)
    return k
  }

  const rnd = rng(seed * 7919 + 13)
  const fbm = makeFbm(seed * 31 + 5)
  const scale = 1 / (Math.max(W, 600) / 5) // blobs about a fifth of the band width
  const slow = new Uint8Array(n)
  const wt = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    const s = fbm(cx[i] * scale + seed * 3.7, cy[i] * scale * 1.4 + seed * 1.3) > 0.55
    slow[i] = s ? 1 : 0
    wt[i] = (1 + 0.8 * rnd()) * (s ? 4 : 1) // cost to enter this hex
  }

  const nearest = (px, py) => {
    let best = 0, bd = Infinity
    for (let i = 0; i < n; i += 1) {
      const d = (cx[i] - px) ** 2 + (cy[i] - py) ** 2
      if (d < bd) { bd = d; best = i }
    }
    return best
  }
  const px = mobile ? [0.2, 0.8] : [0.18, 0.82]
  const py = mobile ? [0.7, 0.3] : [0.62, 0.38]
  const src = [nearest(px[0] * W, py[0] * H), nearest(px[1] * W, py[1] * H)]

  const cost = new Float32Array(n).fill(Infinity)
  const owner = new Int8Array(n).fill(-1)
  const heap = makeHeap(n * 7)
  const t0 = performance.now()
  src.forEach((s, k) => { cost[s] = 0; owner[s] = k; heap.push(0, s) })
  const tmp = new Int32Array(6)
  while (heap.size) {
    const u = heap.pop()
    const cu = heap.lastKey
    if (cu > cost[u]) continue
    const k = nbr(u, tmp)
    for (let j = 0; j < k; j += 1) {
      const v = tmp[j]
      const nc = cu + wt[v]
      if (nc < cost[v]) { cost[v] = nc; owner[v] = owner[u]; heap.push(nc, v) }
    }
  }
  const dijkstraMs = performance.now() - t0

  let maxCost = 0
  for (let i = 0; i < n; i += 1) if (cost[i] > maxCost) maxCost = cost[i]

  // draw order: ascending cost, so each band is a contiguous run
  const order = Uint32Array.from({ length: n }, (_, i) => i).sort((a, b) => cost[a] - cost[b])
  // equal-area isochrone bands: quartiles of the sorted cost, so each band is a contiguous run
  const bandStart = [0, (n * 0.25) | 0, (n * 0.5) | 0, (n * 0.75) | 0, n]

  // seam: the shared hex edge between neighbours owned by different sources
  const seg = []
  for (let i = 0; i < n; i += 1) {
    const k = nbr(i, tmp)
    for (let j = 0; j < k; j += 1) {
      const v = tmp[j]
      if (v > i && owner[v] !== owner[i]) {
        const mx = (cx[i] + cx[v]) / 2, my = (cy[i] + cy[v]) / 2
        let dx = cx[v] - cx[i], dy = cy[v] - cy[i]
        const len = Math.hypot(dx, dy)
        dx /= len; dy /= len
        const h = R / SQ3 // half the edge length of a hex of radius R
        seg.push(mx - dy * h, my + dx * h, mx + dy * h, my - dx * h)
      }
    }
  }

  // hex vertex offsets (pointy-top), slightly shrunk so the grid reads
  const rr = R * 0.9
  const vx = new Float32Array(6), vy = new Float32Array(6)
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 180) * (60 * i - 30)
    vx[i] = rr * Math.cos(a); vy[i] = rr * Math.sin(a)
  }
  const sortedCost = Float32Array.from(order, (i) => cost[i])
  return { n, cx, cy, order, sortedCost, reach: sortedCost[Math.min(n - 1, (n * 0.97) | 0)], bandStart, maxCost, seg: Float32Array.from(seg), vx, vy, dijkstraMs, px, py, slowShare: slow.reduce((a, b) => a + b, 0) / n }
}

/* ---------- mount ---------- */
export function mount(el, { slot, reduced }) {
  if (!document.querySelector('link[data-seam-css]')) {
    const l = document.createElement('link')
    l.rel = 'stylesheet'; l.href = CSS_URL; l.dataset.seamCss = ''
    document.head.appendChild(l)
  }
  el.classList.add('sep-seam')
  el.textContent = ''

  const canvas = document.createElement('canvas')
  canvas.className = 'seam-canvas'
  const ctx = canvas.getContext('2d')
  const mkPin = (label, right) => {
    const pin = document.createElement('div')
    pin.className = 'seam-pin' + (right ? ' is-right' : '')
    pin.innerHTML = '<i></i><span></span>'
    pin.lastChild.textContent = label
    return pin
  }
  const pins = [mkPin('Melbourne', false), mkPin('Mumbai', true)]
  const cap = document.createElement('div')
  cap.className = 'seam-cap'
  cap.textContent = CAPTION
  el.append(canvas, ...pins, cap)

  const tokens = { accent: '#39ff88' }
  const readTokens = () => {
    const cs = getComputedStyle(document.documentElement)
    tokens.accent = cs.getPropertyValue('--accent').trim() || tokens.accent
  }
  readTokens()

  let g = null, W = 0, H = 0, dpr = 1, lastP = -1, visible = false, raf = 0

  const progress = () => {
    const vh = innerHeight
    const top = el.getBoundingClientRect().top
    return Math.min(1, Math.max(0, (0.9 * vh - top) / (0.7 * vh)))
  }

  function draw(p) {
    if (!g) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const flood = Math.min(1, p / 0.55)
    const fade = p <= 0.55 ? 1 : Math.max(0, 1 - (p - 0.55) / 0.3)
    const seamA = p <= 0.55 ? 0 : Math.min(1, (p - 0.55) / 0.3)
    const thr = flood >= 1 ? Infinity : flood * g.reach
    ctx.fillStyle = tokens.accent
    if (fade > 0 && flood > 0) {
      const { order, cx, cy, vx, vy, bandStart, n } = g
      // hexes below the threshold: order is ascending in cost, so find the cut by binary search
      let lo = 0, hi = n
      while (lo < hi) { const m = (lo + hi) >> 1; if (g.sortedCost[m] <= thr) lo = m + 1; else hi = m }
      for (let b = 0; b < 4; b += 1) {
        const s = bandStart[b], e = Math.min(bandStart[b + 1], lo)
        if (e <= s) continue
        ctx.globalAlpha = BAND_ALPHA[b] * fade
        ctx.beginPath()
        for (let k = s; k < e; k += 1) {
          const i = order[k], x = cx[i], y = cy[i]
          ctx.moveTo(x + vx[0], y + vy[0])
          for (let v = 1; v < 6; v += 1) ctx.lineTo(x + vx[v], y + vy[v])
          ctx.closePath()
        }
        ctx.fill()
      }
    }
    if (seamA > 0) {
      ctx.globalAlpha = seamA
      ctx.strokeStyle = tokens.accent
      ctx.lineWidth = 1.25
      ctx.lineCap = 'round'
      ctx.beginPath()
      const s = g.seg
      for (let k = 0; k < s.length; k += 4) { ctx.moveTo(s[k], s[k + 1]); ctx.lineTo(s[k + 2], s[k + 3]) }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  function layout() {
    const r = el.getBoundingClientRect()
    const w = Math.round(r.width), h = Math.round(r.height)
    if (w < 8 || h < 8) return
    const mobile = w <= 640
    if (w === W && h === H && g) return
    W = w; H = h
    dpr = Math.min(2, devicePixelRatio || 1)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    g = build(W, H, mobile, slot * 101 + 17)
    pins.forEach((pin, k) => { pin.style.left = `${g.px[k] * 100}%`; pin.style.top = `${g.py[k] * 100}%` })
    el.dataset.seamMs = g.dijkstraMs.toFixed(2)
    lastP = -1
    tick(true)
  }

  function tick(force) {
    raf = 0
    const p = reduced ? 1 : progress()
    if (force || Math.abs(p - lastP) > 0.002 || ((p === 0 || p === 1) && p !== lastP)) {
      lastP = p
      draw(p)
    }
    if (visible && !reduced) raf = requestAnimationFrame(() => tick(false))
  }

  const ro = new ResizeObserver(() => layout())
  ro.observe(el)
  let io = null
  if (!reduced) {
    io = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting
      if (visible && !raf) raf = requestAnimationFrame(() => tick(false))
    }, { rootMargin: '10% 0px' })
    io.observe(el)
  }
  const mo = new MutationObserver(() => { readTokens(); lastP = -1; tick(true) })
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  layout()

  return () => {
    ro.disconnect(); io?.disconnect(); mo.disconnect()
    if (raf) cancelAnimationFrame(raf)
  }
}
