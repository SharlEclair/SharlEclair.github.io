/**
 * ?sep=hash-ring  "Consistent hashing": a ring of node ticks, with the section's keys (project ids, or the employers)
 * hashed onto it as dots. Each key is owned by the next node round the ring, and as you scroll the ring unrolls into a
 * straight rule, every key sliding to its arc position, ending as a labelled timeline that names the next section.
 * SVG, a pure function of the slot's scroll progress t (under 100vh). Reduced motion: the finished rule.
 */
import { sections, projects, work } from '../../content.js'
import { clamp, ease, useCss, drive } from './sepkit.js'

const NS = 'http://www.w3.org/2000/svg'
const NEXT = { 1: 'projects', 2: 'experience' }
const NODES = 3
// salts picked so that the keys spread out and read cleanly on the line; the hash itself is a real one (FNV-1a + mix)
const SALT = { 1: 45940, 2: 15750 }
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const KEYS = { 1: () => projects.map((p) => p.id), 2: () => work.map((w) => slug(w.org)) }

function hash01(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const el$ = (tag, cls, attrs = {}) => {
  const n = document.createElementNS(NS, tag)
  if (cls) n.setAttribute('class', cls)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  return n
}
const f = (v) => (Math.round(v * 100) / 100).toString()
const ramp = (t, a, b) => ease((t - a) / (b - a))

export function mount(el, { slot, reduced }) {
  useCss(new URL('./hash-ring.css', import.meta.url).href, 'hash-ring-css')
  const label = sections.find((s) => s.id === NEXT[slot])?.label ?? ''
  const salt = SALT[slot]
  const keys = KEYS[slot]().map((id) => ({ id, h: hash01(`${salt}:${id}`) }))
  const nodes = Array.from({ length: NODES }, (_, i) => ({ h: hash01(`${salt}:node-${i}`) })).sort((a, b) => a.h - b.h)
  nodes.forEach((n, i) => { n.id = `n${i + 1}` })
  for (const k of keys) k.owner = nodes.findIndex((n) => n.h >= k.h)
  const order = keys.map((_, i) => i).sort((a, b) => keys[a].h - keys[b].h) // left to right on the line

  el.classList.add('sep-hashring')
  const svg = el$('svg', 'hr-svg', { 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'none' })
  const ringA = el$('path', 'hr-ring', { pathLength: 1 })
  const ringB = el$('path', 'hr-ring', { pathLength: 1 })
  const minor = el$('path', 'hr-minor')
  const lead = el$('path', 'hr-lead')
  const nodeTicks = el$('path', 'hr-node')
  const stems = el$('path', 'hr-stem')
  const dots = keys.map(() => el$('circle', 'hr-key', { r: 3.2 }))
  const keyText = keys.map((k) => { const t = el$('text', 'hr-lab'); t.textContent = k.id; return t })
  const nodeText = nodes.map((n) => { const t = el$('text', 'hr-lab hr-lab-n'); t.textContent = n.id; return t })
  const next = el$('text', 'hr-next')
  next.innerHTML = `<tspan class="hr-dim">next </tspan><tspan class="hr-hi">${label.toUpperCase()}</tspan>`
  const count = el$('text', 'hr-count')
  svg.append(minor, ringA, ringB, lead, nodeTicks, stems, ...dots, ...keyText, ...nodeText, next, count)
  el.replaceChildren(svg)

  let rowsFor = -1
  let rows = []

  const stop = drive(el, reduced, (t0, W, H) => {
    const t = clamp((t0 - 0.16) / 0.84), u = t // the slot is only fully on screen from t0 = 0.3, so the motion starts a little in
    const small = W <= 640
    const R = small ? Math.min(25, H * 0.21) : Math.min(34, H * 0.22)
    const L = 2 * Math.PI * R
    const padX = clamp(W * 0.07, 18, 72)
    const g = (W - 2 * padX) / L
    const yEnd = Math.round(H * (small ? 0.43 : 0.45)) + 0.5
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)

    const draw = ramp(u, 0.0, 0.2)
    const e = ramp(u, 0.42, 0.9)
    const labIn = ramp(e, 0.82, 1)
    const k = (1 - e) / R
    const m = 1 + (g - 1) * e * e
    const yLine = yEnd + R * (1 - e)

    // arc length s (0 at the bottom of the ring, +/- L/2 at the cut at the top) to a screen point and its outward normal
    const at = (s) => {
      const a = k * s
      let X, Y
      if (k < 1e-4) { X = s; Y = (k * s * s) / 2 } else { X = Math.sin(a) / k; Y = (1 - Math.cos(a)) / k }
      const nx = Math.sin(a), ny = m * Math.cos(a), nl = Math.hypot(nx, ny)
      return [W / 2 + X * m, yLine - Y, nx / nl, ny / nl]
    }
    const sOf = (h) => (h - 0.5) * L
    const poly = (s0, s1, n) => {
      let d = ''
      for (let i = 0; i <= n; i += 1) { const [x, y] = at(s0 + ((s1 - s0) * i) / n); d += `${i ? 'L' : 'M'}${f(x)} ${f(y)}` }
      return d
    }

    // base ring: two halves drawn out from the bottom
    const N = 90
    ringA.setAttribute('d', poly(0, L / 2, N))
    ringB.setAttribute('d', poly(0, -L / 2, N))
    for (const p of [ringA, ringB]) { p.style.strokeDasharray = '1 1'; p.style.strokeDashoffset = f(1 - draw) }

    // minor ticks (a dial that becomes a ruler); every quarter is a major
    const M = small ? 24 : 48
    let md = ''
    for (let j = 0; j <= M; j += 1) {
      const [x, y, nx, ny] = at(-L / 2 + (L * j) / M)
      const len = j % (M / 4) === 0 ? 7 : 3.6
      md += `M${f(x)} ${f(y)}L${f(x - nx * len)} ${f(y - ny * len)}`
    }
    minor.setAttribute('d', md)
    minor.style.opacity = f(draw)

    // keys land from outside the ring, one after another, then reach for their owner node
    const n = keys.length
    const land = keys.map((_, i) => ramp(u, 0.1 + i * 0.05, 0.26 + i * 0.05))
    const reach = keys.map((_, i) => ramp(u, 0.22 + i * 0.05, 0.4 + i * 0.05))
    let ld = ''
    keys.forEach((key, i) => {
      if (reach[i] <= 0) return
      const s0 = sOf(key.h), s1 = sOf(nodes[key.owner].h)
      ld += poly(s0, s0 + (s1 - s0) * reach[i], Math.max(2, Math.ceil((Math.abs(s1 - s0) / L) * 70)))
    })
    lead.setAttribute('d', ld)

    // node ticks lengthen a little once every key they own has reached them
    let nd = ''
    nodes.forEach((node, i) => {
      const owned = keys.map((kk, j) => (kk.owner === i ? reach[j] : null)).filter((v) => v !== null)
      const pulse = owned.length ? Math.min(...owned) : 0
      const [x, y, nx, ny] = at(sOf(node.h))
      const hl = 6 + 3 * pulse
      nd += `M${f(x - nx * hl)} ${f(y - ny * hl)}L${f(x + nx * hl)} ${f(y + ny * hl)}`
      const [lx, ly] = [x + nx * 17, y + ny * 17]
      nodeText[i].setAttribute('x', f(lx)); nodeText[i].setAttribute('y', f(ly + 3))
      nodeText[i].style.opacity = f(labIn)
    })
    nodeTicks.setAttribute('d', nd)
    nodeTicks.style.opacity = f(draw)

    // key dots and their labels, stacked into rows above the rule so they never collide
    if (rowsFor !== W) {
      rowsFor = W; rows = []
      const ends = []
      for (const i of order) {
        const cx = clamp(W / 2 + sOf(keys[i].h) * g, 52, W - 52)
        const half = keys[i].id.length * 3.2 + 6
        let r = 0
        while (ends[r] !== undefined && cx - half < ends[r] + 10) r += 1
        ends[r] = cx + half
        rows[i] = r
      }
    }
    let sd = ''
    keys.forEach((key, i) => {
      const [x, y, nx, ny] = at(sOf(key.h))
      const off = 22 * (1 - land[i])
      dots[i].setAttribute('cx', f(x + nx * off)); dots[i].setAttribute('cy', f(y + ny * off))
      dots[i].style.opacity = f(land[i])
      const rise = 15 + rows[i] * 13
      const lx = clamp(x, 52, W - 52)
      keyText[i].setAttribute('x', f(lx)); keyText[i].setAttribute('y', f(y - ny * rise + 3))
      keyText[i].style.opacity = small ? 0 : f(labIn)
      if (rows[i] > 0 && !small) sd += `M${f(x)} ${f(y - ny * 6)}L${f(x)} ${f(y - ny * (rise - 8))}`
    })
    stems.setAttribute('d', sd)
    stems.style.opacity = f(labIn)

    // captions
    const landed = land.filter((v) => v >= 0.999).length
    next.setAttribute('x', f(padX)); next.setAttribute('y', f(yEnd + (small ? 40 : 48)))
    next.style.opacity = f(labIn)
    count.setAttribute('x', f(W - padX)); count.setAttribute('y', f(yEnd + (small ? 40 : 48)))
    count.textContent = `keys: ${landed}  nodes: ${NODES}`
    count.style.opacity = f(Math.max(draw * 0.6, labIn))
    if (small) next.setAttribute('y', f(yEnd + 40))
  })
  return () => { stop(); svg.remove(); el.classList.remove('sep-hashring') }
}
