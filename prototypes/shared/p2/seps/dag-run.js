/**
 * ?sep=dag-run  "DAG run": a small Airflow-style graph. Slot 1: the approach steps feed one task node per project
 * (ids from content.js); slot 2: the work history (roles and degree) as a chain. As you scroll each node goes queued
 * (hollow, dashed, an open circle), running (a solid outline, a ring icon and a pulsing outline) then success (filled,
 * with a check that draws on), and every edge inks in with stroke-dashoffset once its upstream task is done. The sink
 * node stretches into the divider and its caption reads "<section>: success".
 *
 * SVG, a pure function of the slot's scroll progress t (under 100vh); even the pulse is driven by t, not by time.
 * State is told by shape as well as colour. Mobile drops a step and uses a narrower graph. Reduced motion: the rule.
 */
import { sections, projects, work, education } from '../../content.js'
import { clamp, ease, useCss, drive } from './sepkit.js'

const NS = 'http://www.w3.org/2000/svg'
const NEXT = { 1: 'projects', 2: 'experience' }
const mk = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag)
  for (const k in attrs) n.setAttribute(k, attrs[k])
  parent?.append(n)
  return n
}
const lerp = (a, b, p) => a + (b - a) * p
const fract = (v) => v - Math.floor(v)

/** The graph for a slot: nodes (with column, size and timing) and edges. Every label comes from content.js. */
function layout(slot, mobile) {
  const fs = mobile ? 9 : 10.5, cw = fs * 0.6, sub = mobile ? 0 : 8 * 0.6
  const vbW = mobile ? 360 : 960, vbH = mobile ? 150 : 160
  const lead = mobile ? 20 : 26, tail = mobile ? 8 : 12, gap = mobile ? 30 : 64, rowGap = mobile ? 34 : 36
  const node = (id, label, line2, dur, extra = {}) => ({
    id, label, line2, dur,
    w: Math.ceil(lead + Math.max(label.length * cw, (line2?.length ?? 0) * sub) + tail),
    h: line2 ? 32 : 24, ...extra,
  })
  const edges = []
  let cols
  if (slot === 1) {
    const step = node('find-friction', 'find-friction', '', mobile ? 0.15 : 0.13, { start: 0.04 })
    const steps = mobile ? [step] : [step, node('rewrite', 'rewrite', '', 0.11)]
    const ps = projects.map((p, i) => node(p.id, p.id, '', (mobile ? 0.16 : 0.12) + (mobile ? 0.06 : 0.04) * i))
    const w = Math.max(...ps.map((p) => p.w)); ps.forEach((p) => { p.w = w })
    const sink = node('sink', 'projects', '', mobile ? 0.07 : 0.06)
    cols = [...steps.map((s) => [s]), ps, [sink]]
    for (let i = 0; i < cols.length - 1; i += 1) for (const a of cols[i]) for (const b of cols[i + 1]) edges.push({ from: a, to: b })
  } else {
    const roles = [work[1], education[0], work[0]] // in date order
    const chain = roles.map((r, i) => node(`r${i}`, mobile ? r.org.split(' ')[0] : r.org, mobile ? '' : r.dates, [0.16, 0.15, 0.17][i], i === 0 ? { start: 0.04 } : {}))
    const sink = node('sink', 'experience', '', 0.065)
    cols = [...chain.map((c) => [c]), [sink]]
    for (let i = 0; i < cols.length - 1; i += 1) edges.push({ from: cols[i][0], to: cols[i + 1][0] })
  }
  // x by column, centred in the view box; y by row within the column
  const total = cols.reduce((s, c) => s + c[0].w, 0) + gap * (cols.length - 1)
  let x = (vbW - total) / 2
  cols.forEach((col, ci) => {
    const w = Math.max(...col.map((n) => n.w))
    col.forEach((n, i) => {
      n.x = x; n.col = ci; n.w = w
      n.y = vbH / 2 + (slot === 1 ? (i - (col.length - 1) / 2) * rowGap : (ci < cols.length - 1 ? (ci - 1) * (mobile ? 22 : 40) : 0))
    })
    x += w + gap
  })
  // schedule: a node runs once its incoming edges are inked; its outgoing edges ink as it succeeds
  const stag = 0.012, inkDur = 0.065
  for (const n of cols.flat()) {
    const inc = edges.filter((e) => e.to === n)
    n.r0 = inc.length ? Math.max(...inc.map((e) => e.ink[1])) : n.start
    n.r1 = n.r0 + n.dur
    edges.filter((e) => e.from === n).forEach((e, k) => { e.ink = [n.r1 + k * stag, n.r1 + k * stag + inkDur] })
  }
  const sink = cols.flat().at(-1)
  return { fs, cw, vbW, vbH, lead, nodes: cols.flat(), edges, sink, sa: sink.r1 + 0.03 }
}

export function mount(el, { slot, reduced }) {
  useCss(new URL('./dag-run.css', import.meta.url).href, 'dag-run-css')
  const next = sections.find((s) => s.id === NEXT[slot])?.label.toLowerCase() ?? ''
  el.classList.add('sep-dag')
  const svg = mk('svg', { class: 'dr', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true', focusable: 'false' })
  el.replaceChildren(svg)

  let L = null, mobileNow = null, refs = null

  const build = (mobile) => {
    mobileNow = mobile
    L = layout(slot, mobile)
    svg.replaceChildren()
    svg.setAttribute('viewBox', `0 0 ${L.vbW} ${L.vbH}`)
    svg.classList.toggle('dr-m', mobile)
    const gid = `dr-g-${slot}`
    const defs = mk('defs', {}, svg)
    const grad = mk('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: L.vbW, y2: 0 }, defs)
    const stops = [[0, 0], [0, 1], [1, 1], [1, 0]].map(([o, a]) => mk('stop', { offset: o, 'stop-opacity': a }, grad))
    const edgeLayer = mk('g', { class: 'dr-edges' }, svg)
    const nodeLayer = mk('g', { class: 'dr-nodes' }, svg)
    const e = L.edges.map((ed) => {
      const x1 = ed.from.x + ed.from.w, y1 = ed.from.y, x2 = ed.to.x, y2 = ed.to.y
      const dx = Math.max(12, (x2 - x1) * 0.5)
      const d = `M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`
      const g = mk('g', {}, edgeLayer)
      const track = mk('path', { class: 'dr-track', d }, g)
      const ink = mk('path', { class: 'dr-ink', d, pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 }, g)
      const head = mk('path', { class: 'dr-head', d: `M${x2 - 5} ${y2 - 3.2}L${x2} ${y2}L${x2 - 5} ${y2 + 3.2}` }, g)
      return { ed, g, track, ink, head }
    })
    const n = L.nodes.map((nd) => {
      const g = mk('g', { class: 'dr-node', 'data-state': 'queued' }, nodeLayer)
      const top = nd.y - nd.h / 2
      const pulse = mk('rect', { class: 'dr-pulse', x: nd.x, y: top, width: nd.w, height: nd.h, rx: 6 }, g)
      const box = mk('rect', { class: 'dr-box', x: nd.x, y: top, width: nd.w, height: nd.h, rx: 6 }, g)
      const ico = mk('g', { class: 'dr-ico', transform: `translate(${nd.x + L.lead / 2 + 1} ${nd.y})` }, g)
      mk('circle', { class: 'dr-iq', r: 3.6 }, ico)
      mk('circle', { class: 'dr-ir', r: 4.2 }, ico)
      mk('circle', { class: 'dr-id', r: 1.7 }, ico)
      const check = mk('path', { class: 'dr-ic', d: 'M-3.4 .2L-1.1 2.6L3.6 -2.6', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 }, ico)
      const lab = mk('g', { class: 'dr-lab' }, g)
      const tx = nd.x + L.lead
      const t1 = mk('text', { class: 'dr-l', x: tx, y: nd.line2 ? nd.y - 3.5 : nd.y, dy: nd.line2 ? '.1em' : '.35em' }, lab)
      t1.textContent = nd.label
      if (nd.line2) mk('text', { class: 'dr-s', x: tx, y: nd.y + 8.5, dy: '.1em' }, lab).textContent = nd.line2
      return { nd, g, pulse, box, ico, check, lab }
    })
    // the sink's caption pill: sits on the rule once it has stretched
    const pill = mk('g', { class: 'dr-pill' }, svg)
    const pr = mk('rect', { class: 'dr-pr', height: 22, rx: 2 }, pill)
    const chk = mk('path', { class: 'dr-pc', d: 'M-3.4 .2L-1.1 2.6L3.6 -2.6' }, pill)
    const pt = mk('text', { class: 'dr-pt' }, pill)
    mk('tspan', {}, pt).textContent = next
    mk('tspan', { class: 'dr-pk' }, pt).textContent = ': success'
    const rule = n.at(-1).box
    refs = { gid, grad, stops, e, n, pill, pr, chk, pt, sinkRule: rule }
  }

  const frame = (t, W, H) => {
    const mobile = W <= 640
    if (mobile !== mobileNow) build(mobile)
    const { vbW, vbH, sa } = L
    const s = Math.min(W / vbW, H / vbH) || 1
    const p = clamp((t - sa) / (0.98 - sa)), ep = ease(p), eh = ease(p / 0.7)
    const fade = 1 - ease(p * 2.4)
    const cy = vbH / 2

    for (const r of refs.e) {
      const { ed } = r
      const ep_ = clamp((t - ed.ink[0]) / (ed.ink[1] - ed.ink[0]))
      const app = ease((t - 0.012 * ed.to.col) / 0.07)
      r.g.style.opacity = (app * fade).toFixed(3)
      r.ink.setAttribute('stroke-dashoffset', (1 - ease(ep_)).toFixed(4))
      r.head.style.opacity = clamp((ep_ - 0.85) / 0.15).toFixed(3)
    }

    const sinkRef = refs.n.at(-1)
    for (const r of refs.n) {
      const { nd } = r
      const st = t < nd.r0 ? 'queued' : t < nd.r1 ? 'running' : 'success'
      if (r.g.dataset.state !== st) r.g.dataset.state = st
      const app = ease((t - 0.012 * nd.col) / 0.07)
      const isSink = r === sinkRef
      r.g.style.opacity = (isSink ? app : app * fade).toFixed(3)
      // the pulse: an outline that grows and fades, phase taken from the scroll position
      if (st === 'running') {
        const cyc = Math.max(1, Math.round((nd.r1 - nd.r0) * 16))
        const ph = fract(((t - nd.r0) / (nd.r1 - nd.r0)) * cyc), o = ph * 6
        const top = nd.y - nd.h / 2
        r.pulse.setAttribute('x', nd.x - o); r.pulse.setAttribute('y', top - o)
        r.pulse.setAttribute('width', nd.w + 2 * o); r.pulse.setAttribute('height', nd.h + 2 * o)
        r.pulse.style.opacity = (0.5 * (1 - ph)).toFixed(3)
      } else r.pulse.style.opacity = 0
      r.check.setAttribute('stroke-dashoffset', (1 - ease((t - nd.r1) / 0.035)).toFixed(3))
      if (isSink) {
        // the sink stretches into the divider, then its caption slides onto the middle of the rule
        const x0 = vbW / 2 - W / s / 2, x1 = vbW / 2 + W / s / 2, rh = Math.max(1.5, 1.5 / s)
        const h = lerp(nd.h, rh, eh)
        r.box.setAttribute('x', lerp(nd.x, x0, ep)); r.box.setAttribute('width', lerp(nd.w, x1 - x0, ep))
        r.box.setAttribute('height', h); r.box.setAttribute('y', cy - h / 2); r.box.setAttribute('rx', lerp(6, 0, eh))
        r.box.style.fill = p > 0 ? `url(#${refs.gid})` : ''
        r.box.style.stroke = p > 0 ? 'none' : ''
        r.ico.style.opacity = r.lab.style.opacity = (1 - clamp(p * 3)).toFixed(3)
        refs.grad.setAttribute('x1', x0); refs.grad.setAttribute('x2', x1)
        // the ends of the rule fade out only as it spreads, so the node itself stays solid at first
        refs.stops[1].setAttribute('offset', 0.12 * ep); refs.stops[2].setAttribute('offset', 1 - 0.12 * ep)
        // pill
        const cw = L.cw, label = `${next}: success`
        const tw = label.length * cw, pw = tw + 14 + 28
        const px = lerp(nd.x + nd.w / 2, vbW / 2, ep), left = px - pw / 2
        const pa = ease((p - 0.5) / 0.4)
        refs.pr.setAttribute('x', left); refs.pr.setAttribute('width', pw); refs.pr.setAttribute('y', cy - 11)
        refs.pt.setAttribute('x', left + 28 - 0 + 0); refs.pt.setAttribute('y', cy); refs.pt.setAttribute('dy', '.35em')
        refs.chk.setAttribute('transform', `translate(${left + 14} ${cy})`)
        refs.pill.style.opacity = pa.toFixed(3)
      }
    }
  }

  const stop = drive(el, reduced, frame)
  return () => { stop(); svg.remove(); el.classList.remove('sep-dag') }
}
