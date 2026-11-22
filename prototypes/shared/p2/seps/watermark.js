/**
 * ?sep=watermark  "Watermark": event-time stream processing in one band. Events drop onto a time axis (out of order),
 * a watermark line sweeps across and each window closes behind it; the stragglers that drift in from the right after
 * their window closed grey out as late. Slot 1 frames the projects as windows, slot 2 the roles. At the end everything
 * presses down onto the axis, and one aggregate "emit" chip drops into the divider and names the next section.
 * SVG, a pure function of the slot's scroll progress t (under 100vh). Reduced motion: the pressed rule with its chip.
 */
import { sections, projects, work } from '../../content.js'
import { clamp, ease, useCss, drive } from './sepkit.js'

const NS = 'http://www.w3.org/2000/svg'
const NEXT = { 1: 'projects', 2: 'experience' }
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const WINDOWS = {
  1: () => projects.map((p) => ({ id: p.id })),
  // oldest first, so the timeline reads left to right
  2: () => [...work].reverse().map((w) => ({ id: slug(w.org), sub: w.dates })),
}
const CFG = {
  1: { dots: [5, 3], late: [0, 2, 3] },
  2: { dots: [8, 5], late: [0, 1, 1] },
}
const LANES = [0.3, 0.54, 0.78]

const el$ = (tag, cls, attrs = {}) => {
  const n = document.createElementNS(NS, tag)
  if (cls) n.setAttribute('class', cls)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  return n
}
const f = (v) => (Math.round(v * 100) / 100).toString()
const lerp = (a, b, v) => a + (b - a) * v
const ramp = (t, a, b) => ease((t - a) / (b - a))
const back = (x) => { x = clamp(x); const c1 = 1.1, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2 }
const mix = (a, b, k) => `color-mix(in srgb, var(${a}) ${f(clamp(k) * 100)}%, var(${b}))`

function rng(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** Dots in window-relative coordinates (fx 0..1 inside the window, lane 0..1 down the band), deterministic per slot. */
function build(slot, small, nWin) {
  const rand = rng(slot * 977 + (small ? 7 : 3))
  const cfg = CFG[slot]
  const per = cfg.dots[small ? 1 : 0]
  const out = []
  for (let w = 0; w < nWin; w += 1) {
    const lanes = []
    for (let j = 0; j < per; j += 1) {
      const u = (j + 0.5 + (rand() - 0.5) * 0.5) / per
      const fx = 0.1 + 0.8 * u
      const lane = LANES[(j + w + Math.floor(rand() * 2)) % 3]
      const x = (w + fx) / nWin
      out.push({ w, fx, lane, late: false, p: Math.max(0.02 + rand() * 0.04, x - (0.03 + rand() * 0.12)) })
      lanes.push(lane)
    }
  }
  cfg.late.forEach((w, i) => {
    if (w >= nWin) return
    const fx = 0.2 + 0.6 * ((i * 0.37 + rand() * 0.4) % 1)
    const lane = LANES[(i + 1) % 3]
    out.push({ w, fx, lane, late: true, p: (w + 1) / nWin + 0.04 + rand() * 0.035 })
  })
  return out
}

export function mount(el, { slot, reduced }) {
  useCss(new URL('./watermark.css', import.meta.url).href, 'watermark-css')
  const label = sections.find((s) => s.id === NEXT[slot])?.label ?? ''
  const wins = WINDOWS[slot]()
  const nWin = wins.length

  el.classList.add('sep-watermark')
  const svg = el$('svg', 'wm-svg', { 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'none' })
  const axis = el$('path', 'wm-axis')
  const edges = el$('path', 'wm-edge')
  const openR = wins.map(() => el$('rect', 'wm-win wm-open', { rx: 2 }))
  const shutR = wins.map(() => el$('rect', 'wm-win wm-shut', { rx: 2 }))
  const winText = wins.map((w) => { const t = el$('text', 'wm-id'); t.textContent = w.id; return t })
  const subText = wins.map((w) => { const t = el$('text', 'wm-sub'); t.textContent = w.sub ?? ''; return t })
  const wmLine = el$('path', 'wm-line')
  const wmText = el$('text', 'wm-flag'); wmText.textContent = 'watermark'
  let data = null, dotKey = ''
  const dotG = el$('g', 'wm-dots')
  let dots = []
  const lateText = el$('text', 'wm-late'); lateText.textContent = 'late'
  const evText = el$('text', 'wm-cap wm-cap-l'); evText.textContent = 'event time →'
  const count = el$('text', 'wm-cap wm-cap-r')
  const chip = el$('g', 'wm-chip')
  const chipBox = el$('rect', 'wm-chip-box', { height: 20, y: -10, rx: 3 })
  const chipText = el$('text', 'wm-chip-text', { y: 3.5 })
  chipText.innerHTML = `<tspan class="wm-dim">emit </tspan><tspan class="wm-hi">${label.toUpperCase()}</tspan>`
  chip.append(chipBox, chipText)
  svg.append(...openR, ...shutR, edges, axis, dotG, wmLine, wmText, ...winText, ...subText, lateText, evText, count, chip)
  el.replaceChildren(svg)

  let chipW = 124, chipFor = 0

  const stop = drive(el, reduced, (t0, W, H) => {
    const t = clamp((t0 - 0.16) / 0.84), u = t // the slot is only fully on screen from t0 = 0.3, so the motion starts a little in
    const small = W <= 640
    const key = `${small}`
    if (key !== dotKey) {
      dotKey = key
      data = build(slot, small, nWin)
      dotG.replaceChildren()
      dots = data.map((d) => {
        const body = el$('rect', 'wm-dot'); const ring = el$('rect', 'wm-ring')
        dotG.append(body, ...(d.late ? [ring] : []))
        return { body, ring: d.late ? ring : null }
      })
    }
    if (chipFor !== W) {
      chipFor = W
      const bb = chipText.getBBox()
      if (bb.width) chipW = bb.width + 26
      chipBox.setAttribute('width', f(chipW)); chipBox.setAttribute('x', f(-chipW / 2))
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)

    const padX = clamp(W * 0.07, 18, 72)
    const x0 = padX, x1 = W - padX, span = x1 - x0, ww = span / nWin
    const yT = Math.round(H * 0.17), yA0 = Math.round(H * 0.64)
    const yA1 = Math.round(H * (small ? 0.4 : 0.42)) + 0.5
    const axisDraw = ramp(t, 0, 0.1)
    const c = ramp(t, 0.74, 0.94)
    const sq = 1 - c
    const yA = lerp(yA0, yA1, c) + 0.5
    const fy = (y) => yA - (yA0 + 0.5 - y) * sq
    const lin = clamp((t - 0.08) / 0.64)
    const q = lerp(lin, ease(lin), 0.4) * 1.15
    const wp = Math.min(q, 1)
    const wx = x0 + wp * span

    // axis, window edges
    axis.setAttribute('d', `M${f(x0)} ${f(yA)}L${f(x0 + span * axisDraw)} ${f(yA)}`)
    let ed = ''
    for (let w = 0; w <= nWin; w += 1) { const x = Math.round(x0 + w * ww) + 0.5; ed += `M${x} ${f(yA - 4)}L${x} ${f(yA + 4)}` }
    edges.setAttribute('d', ed)
    edges.style.opacity = f(axisDraw)

    // windows: dashed while open, solid and tinted once the watermark has passed their end
    let closedN = 0
    const kw = wins.map((_, w) => ramp(q, (w + 1) / nWin, (w + 1) / nWin + 0.05))
    wins.forEach((win, w) => {
      const xs = x0 + w * ww + 2, top = fy(yT), h = Math.max(0, yA - top)
      for (const r of [openR[w], shutR[w]]) {
        r.setAttribute('x', f(xs)); r.setAttribute('y', f(top)); r.setAttribute('width', f(ww - 4)); r.setAttribute('height', f(h))
      }
      openR[w].style.opacity = f(axisDraw * (1 - kw[w]) * sq)
      shutR[w].style.opacity = f(kw[w] * sq)
      if (kw[w] >= 0.999) closedN += 1
      const cx = x0 + (w + 0.5) * ww
      winText[w].setAttribute('x', f(cx)); winText[w].setAttribute('y', f(yA + 16))
      winText[w].style.opacity = small ? 0 : f(ramp(t, 0.04, 0.16))
      winText[w].style.fill = mix('--fg', '--muted', kw[w])
      subText[w].setAttribute('x', f(cx)); subText[w].setAttribute('y', f(yA + 28))
      subText[w].style.opacity = small ? 0 : f(ramp(t, 0.04, 0.16) * (0.4 + 0.6 * kw[w]))
    })

    // events
    const chipHalf = chipW / 2 + 10
    let lateN = 0, firstLate = -1
    data.forEach((d, i) => {
      const xFrac = (d.w + d.fx) / nWin
      let x = x0 + xFrac * span
      if (!small && Math.abs(x - W / 2) < chipHalf) x = W / 2 + (x < W / 2 ? -chipHalf : chipHalf)
      const ly = fy(yT + d.lane * (yA0 - yT))
      const a = ramp(q, d.p, d.p + (d.late ? 0.08 : 0.07))
      let y = ly - 34 * (1 - a) * sq, op = ramp(a, 0, 0.35), fill
      let ringOp = 0
      if (d.late) {
        x += 120 * (1 - a) * sq; y = ly
        const gr = ramp(a, 0.62, 1)
        fill = mix('--muted', '--fg', gr)
        op *= 1 - 0.4 * gr
        ringOp = gr * (1 - c)
        if (a >= 0.999) lateN += 1
        if (firstLate < 0 || d.p < data[firstLate].p) firstLate = i
      } else {
        fill = mix('--accent', '--fg', kw[d.w])
        op *= 0.7 + 0.3 * kw[d.w]
      }
      const r = 3.3
      const w = lerp(2 * r, 1.6, c), h = lerp(2 * r, 7, c)
      const b = dots[i].body
      b.setAttribute('x', f(x - w / 2)); b.setAttribute('y', f(y - h / 2)); b.setAttribute('width', f(w)); b.setAttribute('height', f(h)); b.setAttribute('rx', f(lerp(r, 0, c)))
      b.style.fill = fill; b.style.opacity = f(op)
      if (dots[i].ring) {
        const rg = dots[i].ring
        rg.setAttribute('x', f(x - r - 2.5)); rg.setAttribute('y', f(y - r - 2.5)); rg.setAttribute('width', f(2 * r + 5)); rg.setAttribute('height', f(2 * r + 5)); rg.setAttribute('rx', f(r + 2.5))
        rg.style.opacity = f(ringOp)
        d.px = x; d.py = y; d.pa = a
      }
    })
    const fl = data[firstLate]
    if (fl) {
      lateText.setAttribute('x', f(fl.px)); lateText.setAttribute('y', f(fl.py - 13))
      lateText.style.opacity = f(ramp(fl.pa, 0.7, 1) * (1 - c))
    }

    // watermark sweep
    const wmOp = ramp(q, 0, 0.05) * sq
    wmLine.setAttribute('d', `M${f(Math.round(wx) + 0.5)} ${f(fy(yT) - 8)}L${f(Math.round(wx) + 0.5)} ${f(yA + 7)}`)
    wmLine.style.opacity = f(wmOp)
    wmText.setAttribute('x', f(wx + 6)); wmText.setAttribute('y', f(fy(yT) - 3))
    wmText.style.opacity = small ? 0 : f(wmOp * clamp((x1 - wx) / 110))

    // captions
    const capY = lerp(H - 12, yA1 + (small ? 34 : 40), c)
    evText.setAttribute('x', f(x0)); evText.setAttribute('y', f(capY))
    count.setAttribute('x', f(x1)); count.setAttribute('y', f(capY))
    count.textContent = `windows: ${closedN}  late: ${lateN}`
    evText.style.opacity = f(ramp(t, 0.02, 0.12)); count.style.opacity = f(ramp(t, 0.02, 0.12))

    // the emit chip leaves the last window and drops into the divider
    const dp = clamp((t - 0.66) / 0.28)
    const cx0 = x0 + (nWin - 0.5) * ww
    const cxp = lerp(cx0, W / 2, ease(dp))
    chip.setAttribute('transform', `translate(${f(cxp)} ${f(lerp(-16, yA1, back(dp)))})`)
    chip.style.opacity = f(ramp(dp, 0, 0.2))
  })
  return () => { stop(); svg.remove(); el.classList.remove('sep-watermark') }
}
