/**
 * ?sql=switchyard  "Switchyard": the signal stays red until the points are right.
 * A top-down rail yard in signal-box style (right angles, 45 degree chamfers, track ties as hairlines). Several tracks
 * (the tables) converge through junctions (joins); a single pulse runs the route (the query plan), picks up each branch as
 * it merges, and stops at a red signal (the safety check). A dashed preview runs ahead into a dead end, the points slide
 * over, the preview reroutes cleanly, the signal turns green and the pulse runs out to a terminus board: DuckDB.
 *
 * Every frame is a pure function of progress() (the damped 0..1 of the pinned runway), so scrolling back rewinds it.
 * SVG only: rails and previews are revealed with stroke-dashoffset, the pulse is placed along the route polylines,
 * attribute writes are cached. One rAF while the box is on screen. Reduced motion renders the end frame once.
 * Copy comes from shared/content.js (the sql-agent project): the stack, and its summary sentence.
 */
import { projects } from '../../content.js'

const CSS_HREF = new URL('./switchyard.css', import.meta.url).href

const agent = projects.find((p) => p.id === 'sql-agent')
const TERMINUS = agent.stack.find((s) => s === 'DuckDB') || 'DuckDB'
const STACK = agent.stack.join(' · ')
const SENTENCE = agent.summary.match(/an AI writes[^.]*fixes it itself\./)?.[0] || ''
const CAPTION = SENTENCE.charAt(0).toUpperCase() + SENTENCE.slice(1)
const ARIA = `A rail yard seen from above. Tracks converge through junctions and a single pulse of light runs along them, then stops at a red signal marked safety checks. A dashed preview runs ahead into a dead end, the points slide over and the preview reroutes. The signal turns green and the pulse runs out to a single terminus: ${TERMINUS}.`

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const seg = (p, a, b) => clamp((p - a) / (b - a))
const sm = (t) => t * t * (3 - 2 * t)
const mix = (a, b, t) => a + (b - a) * t
const f1 = (n) => Math.round(n * 10) / 10
const f3 = (n) => Math.round(n * 1000) / 1000

function ensureStyles(onReady) {
  let link = document.querySelector('link[data-sy-css]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = CSS_HREF
    link.dataset.syCss = ''
    document.head.append(link)
  }
  if (link.sheet) onReady()
  else {
    link.addEventListener('load', onReady, { once: true })
    link.addEventListener('error', onReady, { once: true })
    setTimeout(onReady, 1500)
  }
}

// ---------------------------------------------------------------------------------------------- layout
// Authored on a flow axis s (the direction of travel) and a cross axis t. Wide: s runs left to right. Tall (phones): s runs
// top to bottom. Chamfers are exactly 45 degrees in both, so a branch at cross distance dt turns in dt before its junction.
function layout(mode) {
  const wide = mode === 'wide'
  const g = wide
    ? { W: 892, H: 336, main: 180, brs: [{ t: 90, j: 250 }, { t: 310, j: 330 }, { t: 20, j: 410 }], sig: 490, F: 580, dead: 722, ch: 80, term: 772, lamp: 7, mast: 36, blade: 30, fs: 9.5, fsBoard: 13, boardW: 78, boardH: 28 }
    : { W: 358, H: 424, main: 172, brs: [{ t: 117, j: 100 }, { t: 252, j: 140 }, { t: 72, j: 182 }], sig: 214, F: 262, dead: 322, ch: 50, term: 350, lamp: 6, mast: 30, blade: 24, fs: 8.8, fsBoard: 11.5, boardW: 84, boardH: 26 }
  const mp = wide ? (s, t) => [s + 30, t + 8] : (s, t) => [t, s + 24]
  const pts = (list) => list.map(([s, t]) => mp(s, t))
  const L = { mode, wide, ...g, mp, wait: g.sig - (wide ? 20 : 16) }
  const m = g.main
  L.branches = g.brs.map((b) => ({ ...b, dt: m - b.t, pts: pts([[0, b.t], [b.j - Math.abs(m - b.t), b.t], [b.j, m]]) }))
  L.branches.sort((a, b) => a.j - b.j)
  L.route = pts([[0, m], [g.F, m], [g.F + g.ch, m + g.ch], [g.term, m + g.ch]])
  L.rMain = pts([[0, m], [g.F, m]])
  L.rDead = pts([[g.dead, m], [g.F, m]]) // reversed: drawn in from the far end
  L.rRight = pts([[g.term, m + g.ch], [g.F + g.ch, m + g.ch], [g.F, m]])
  L.pStem = pts([[g.sig, m], [g.F, m]])
  L.pDead = pts([[g.F, m], [g.dead, m]])
  L.pRight = pts([[g.F, m], [g.F + g.ch, m + g.ch], [g.term, m + g.ch]])
  return L
}

function poly(points) {
  const segs = []
  let len = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i], b = points[i + 1]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    segs.push({ a, b, at: len, l })
    len += l
  }
  const d = `M${points.map((q) => `${f1(q[0])},${f1(q[1])}`).join('L')}`
  const at = (dist) => {
    const x = clamp(dist, 0, len)
    let s = segs[segs.length - 1]
    for (const c of segs) if (x <= c.at + c.l) { s = c; break }
    const t = s.l ? (x - s.at) / s.l : 0
    return [mix(s.a[0], s.b[0], t), mix(s.a[1], s.b[1], t)]
  }
  return { d, len, at }
}

// ---------------------------------------------------------------------------------------------- markup
function buildSvg(L, id, G) {
  const { mp, main: m, sig, F, dead, ch, term, lamp } = L
  const P = (s, t) => mp(s, t)
  const sideSign = -1 // the signal stands on the low side of the cross axis
  const hc = m + sideSign * (L.mast + lamp + 3)
  const [mastBx, mastBy] = P(sig, m + sideSign * 2)
  const [mastTx, mastTy] = P(sig, hc - sideSign * (lamp + 2))
  const [hx, hy] = P(sig, hc)
  const lab = L.wide ? { x: hx, y: hy - lamp - 16, a: 'middle', b: 'auto' } : { x: hx - lamp - 12, y: hy, a: 'end', b: 'central' }
  const [fx, fy] = P(F, m)
  const [startX, startY] = P(0, m)
  const plain = L.wide ? { x: startX + 6, y: startY + 20, a: 'start' } : { x: startX + 12, y: startY - 4, a: 'start' }

  // buffer stops (a short bar across the track with chamfered feet)
  const buf = (s, t) => {
    const h = 9
    const a = P(s, t - h), b = P(s, t + h), c = P(s - 5, t - h), d = P(s - 5, t + h)
    return `M${f1(c[0])},${f1(c[1])}L${f1(a[0])},${f1(a[1])}L${f1(b[0])},${f1(b[1])}L${f1(d[0])},${f1(d[1])}`
  }
  const bufDead = buf(dead + 4, m)
  const bufTerm = buf(term + 4, m + ch)

  // platform strip alongside the last stretch of the terminus track
  const p0 = P(term - 96, m + ch + 9), p1 = P(term - 6, m + ch + 15)
  const bx0 = Math.min(p0[0], p1[0]), bx1 = Math.max(p0[0], p1[0]), by0 = Math.min(p0[1], p1[1]), by1 = Math.max(p0[1], p1[1])

  // the board at the end of the line
  const bw = L.boardW, bh = L.boardH
  const [bcx, bcy] = L.wide ? P(term + 12 + bw / 2, m + ch) : P(term + 14 + bh / 2, m + ch)
  const bX = bcx - bw / 2
  const bY = bcy - bh / 2

  const pg = (name, op) => `<stop offset="0" style="stop-color:var(--${name});stop-opacity:${op}"/><stop offset="1" style="stop-color:var(--${name});stop-opacity:0"/>`
  const defs = `<defs>
<radialGradient id="${id}gl">${pg('sy-lit', 0.55)}</radialGradient>
<radialGradient id="${id}gr">${pg('sy-red', 0.6)}</radialGradient>
<radialGradient id="${id}gg">${pg('sy-lit', 0.6)}</radialGradient>
<mask id="${id}mt" maskUnits="userSpaceOnUse" x="0" y="0" width="${L.W}" height="${L.H}">${G.rails.map((r, i) => `<path data-mk="${i}" d="${r.p.d}" class="sy-mk"/>`).join('')}</mask>
<mask id="${id}mp" maskUnits="userSpaceOnUse" x="0" y="0" width="${L.W}" height="${L.H}">${G.prevs.map((r, i) => `<path data-pm="${i}" d="${r.p.d}" class="sy-mk"/>`).join('')}</mask>
</defs>`

  const ties = `<g mask="url(#${id}mt)">${G.rails.map((r) => `<path class="sy-tie" d="${r.p.d}"/>`).join('')}</g>`
  const rails = G.rails.map((r, i) => `<path class="sy-rail" data-rail="${i}" d="${r.p.d}"/>`).join('')
  const lits = G.lits.map((r, i) => `<path class="sy-halo" data-halo="${i}" d="${r.p.d}"/><path class="sy-lit" data-lit="${i}" d="${r.p.d}"/>`).join('')
  const prevs = `<g mask="url(#${id}mp)" data-prevs>${G.prevs.map((r, i) => `<path class="sy-prev-halo" data-pvh="${i}" d="${r.p.d}"/><path class="sy-prev" data-prev="${i}" d="${r.p.d}"/>`).join('')}</g>`

  const blade = `<line class="sy-blade" data-blade x1="${f1(fx)}" y1="${f1(fy)}" x2="${f1(fx)}" y2="${f1(fy)}"/>`
  const [mxx, mxy] = P(F - 6, m - 15)
  const [mxx2, mxy2] = P(F - 6, m - 2)
  const machine = `<path class="sy-stem" d="M${f1(mxx)},${f1(mxy)}L${f1(mxx2)},${f1(mxy2)}"/><rect class="sy-mach" x="${f1(mxx - 3)}" y="${f1(mxy - 3)}" width="6" height="6"/><rect class="sy-mach-lit" data-mach x="${f1(mxx - 3)}" y="${f1(mxy - 3)}" width="6" height="6"/>`

  const signal = `<g data-signal>
<path class="sy-mast" d="M${f1(mastBx)},${f1(mastBy)}L${f1(mastTx)},${f1(mastTy)}"/>
<g class="sy-breath" data-breath><circle data-gred cx="${f1(hx)}" cy="${f1(hy)}" r="${lamp * 4}" fill="url(#${id}gr)"/></g>
<circle data-ggreen cx="${f1(hx)}" cy="${f1(hy)}" r="${lamp * 4}" fill="url(#${id}gg)"/>
<circle class="sy-head" cx="${f1(hx)}" cy="${f1(hy)}" r="${lamp + 2.4}"/>
<circle class="sy-lamp-red" data-lred cx="${f1(hx)}" cy="${f1(hy)}" r="${lamp}"/>
<circle class="sy-lamp-green" data-lgreen cx="${f1(hx)}" cy="${f1(hy)}" r="${lamp}"/>
<text class="sy-engr" x="${f1(lab.x)}" y="${f1(lab.y)}" text-anchor="${lab.a}" dominant-baseline="${lab.b}" font-size="${L.fs}">SAFETY CHECKS</text>
</g>`

  const board = `<g data-board>
<rect class="sy-board" x="${f1(bX)}" y="${f1(bY)}" width="${bw}" height="${bh}"/>
<rect class="sy-board-in" x="${f1(bX + 3)}" y="${f1(bY + 3)}" width="${bw - 6}" height="${bh - 6}"/>
<text class="sy-board-txt" x="${f1(bcx)}" y="${f1(bcy + 0.5)}" text-anchor="middle" dominant-baseline="central" font-size="${L.fsBoard}">${TERMINUS}</text>
</g>`

  const rings = G.junctions.map((_, i) => `<circle class="sy-ring" data-ring="${i}" r="3" opacity="0"/>`).join('')
  const bpulses = G.junctions.map((_, i) => `<g data-bp="${i}" opacity="0"><circle r="9" fill="url(#${id}gl)"/><circle class="sy-core" r="1.9"/></g>`).join('')
  const pulse = `<g data-pulse opacity="0"><circle data-pglow r="18" fill="url(#${id}gl)"/><g class="sy-throb"><circle class="sy-core" data-pcore r="2.8"/></g></g>`

  return `<svg class="sy-svg" viewBox="0 0 ${L.W} ${L.H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${ARIA}" focusable="false">
${defs}
<g data-yard>${ties}${rails}</g>
<path class="sy-platform" data-plat d="M${f1(bx0)},${f1(by0)}H${f1(bx1)}V${f1(by1)}H${f1(bx0)}Z"/>
<path class="sy-buf" data-buf d="${bufDead}${bufTerm}"/>
<path class="sy-buf hot" data-bufhot d="${bufDead}"/>
${prevs}
${lits}
${blade}${machine}
${signal}
<text class="sy-engr plain" data-plain x="${f1(plain.x)}" y="${f1(plain.y)}" text-anchor="${plain.a}" font-size="${L.fs}">plain English</text>
${board}
${rings}${bpulses}
<circle class="sy-head-dot" data-phead r="2.2" opacity="0"/>
${pulse}
</svg>`
}

// ---------------------------------------------------------------------------------------------- mount
export function mount(el, { theme, reduced = false, progress } = {}) {
  const id = `sy${Math.random().toString(36).slice(2, 7)}`
  const root = document.createElement('div')
  root.className = 'sy'
  root.setAttribute('role', 'figure')
  root.dataset.syTheme = theme || ''
  root.style.visibility = 'hidden'
  const cap = document.createElement('p')
  cap.className = 'sy-cap'
  cap.textContent = CAPTION
  const stack = document.createElement('span')
  stack.className = 'sy-stack'
  stack.textContent = STACK
  cap.append(stack)
  root.append(cap)
  el.replaceChildren(root)
  ensureStyles(() => { root.style.visibility = '' })

  let L = null, G = null, svg = null, R = null
  let on = false, raf = 0, lastP = -1

  function decide() {
    const w = root.clientWidth, h = root.clientHeight
    return w > 0 && (w < 560 || h > w * 0.95) ? 'tall' : 'wide'
  }

  // geometry shared by markup and per-frame placement
  function geometry() {
    const rails = [
      { p: poly(L.rMain), at: [0, 0.1] }, // 0 main, from the left edge
      ...L.branches.map((b, i) => ({ p: poly(b.pts), at: [[0.01, 0.09], [0.02, 0.1], [0.03, 0.11]][i] })), // 1..3 branches
      { p: poly(L.rDead), at: [0.08, 0.18] }, // 4 dead end, from its far end
      { p: poly(L.rRight), at: [0.1, 0.2] }, // 5 the real route out, from the terminus
    ]
    const route = poly(L.route)
    const lits = [route, ...L.branches.map((b) => poly(b.pts))].map((p) => ({ p }))
    const prevs = [{ p: poly(L.pStem) }, { p: poly(L.pDead) }, { p: poly(L.pRight) }]
    // the pulse's schedule: p of arrival at each junction, from the same easing the pulse uses
    const ease = (u) => sm(u)
    const invert = (v) => { let a = 0, b = 1; for (let i = 0; i < 24; i += 1) { const c = (a + b) / 2; if (ease(c) < v) a = c; else b = c } return (a + b) / 2 }
    const junctions = L.branches.map((b) => ({ s: b.j, pj: 0.08 + 0.22 * invert(b.j / L.wait) }))
    return { rails, lits, prevs, route, junctions, ease }
  }

  function build() {
    const mode = decide()
    if (L && L.mode === mode && svg) return
    L = layout(mode)
    G = geometry()
    const tpl = document.createElement('template')
    tpl.innerHTML = buildSvg(L, id, G)
    svg?.remove()
    svg = tpl.content.firstElementChild
    root.insertBefore(svg, cap)
    root.dataset.mode = mode
    const q = (s) => svg.querySelector(s)
    const qa = (s) => [...svg.querySelectorAll(s)]
    R = {
      rail: qa('[data-rail]'), mk: qa('[data-mk]'), halo: qa('[data-halo]'), lit: qa('[data-lit]'),
      prev: qa('[data-prev]'), pvh: qa('[data-pvh]'), pm: qa('[data-pm]'), prevs: q('[data-prevs]'),
      blade: q('[data-blade]'), mach: q('[data-mach]'), signal: q('[data-signal]'), breath: q('[data-breath]'),
      gred: q('[data-gred]'), ggreen: q('[data-ggreen]'), lred: q('[data-lred]'), lgreen: q('[data-lgreen]'),
      plain: q('[data-plain]'), board: q('[data-board]'), plat: q('[data-plat]'), buf: q('[data-buf]'), bufhot: q('[data-bufhot]'),
      ring: qa('[data-ring]'), bp: qa('[data-bp]'), head: q('[data-phead]'), pulse: q('[data-pulse]'), pglow: q('[data-pglow]'), pcore: q('[data-pcore]'),
    }
    lastP = -1
  }

  // ------------------------------------------------------------------------------------------ render
  const put = (node, k, v) => {
    const c = (node._c ||= {})
    if (c[k] === v) return
    c[k] = v
    node.setAttribute(k, v)
  }
  const op = (node, v) => put(node, 'opacity', String(Math.round(clamp(v) * 100) / 100))
  const draw = (node, len, u) => {
    put(node, 'stroke-dasharray', `${f1(len)} ${f1(len)}`)
    put(node, 'stroke-dashoffset', String(f3(len * (1 - clamp(u)))))
  }
  const at = (node, [x, y]) => put(node, 'transform', `translate(${f1(x)} ${f1(y)})`)

  function render(P) {
    const { rails, lits, prevs, route, junctions } = G
    const m = L.main

    // tracks draw in from the edges
    rails.forEach((r, i) => {
      const u = sm(seg(P, r.at[0], r.at[1]))
      draw(R.rail[i], r.p.len, u)
      draw(R.mk[i], r.p.len, u)
    })
    const bufO = sm(seg(P, 0.16, 0.22))
    op(R.buf, bufO); op(R.plat, bufO)
    op(R.plain, sm(seg(P, 0, 0.06)) * (1 - 0.55 * sm(seg(P, 0.2, 0.3))))

    // the pulse along the route: sets off, slows to the red signal, waits, runs out once the signal is green
    const wait = L.wait
    const out = sm(seg(P, 0.8, 0.95))
    const dist = P < 0.3 ? wait * G.ease(seg(P, 0.08, 0.3)) : wait + (route.len - wait) * out
    const pPos = route.at(dist)
    at(R.pulse, pPos)
    const merged = junctions.reduce((n, j) => n + sm(seg(P, j.pj, j.pj + 0.03)), 0)
    op(R.pulse, sm(seg(P, 0.05, 0.1)))
    put(R.pcore, 'r', String(f1(2.6 + 0.55 * merged)))
    put(R.pglow, 'r', String(f1(15 + 4 * merged)))

    // branches: each lights toward its junction, arriving with the pulse
    junctions.forEach((j, i) => {
      const bl = lits[i + 1].p
      const u = seg(P, j.pj - 0.075, j.pj)
      draw(R.lit[i + 1], bl.len, u)
      draw(R.halo[i + 1], bl.len, u)
      at(R.bp[i], bl.at(bl.len * u))
      op(R.bp[i], P >= j.pj - 0.075 && P < j.pj ? sm(seg(P, j.pj - 0.075, j.pj - 0.06)) : 0)
      const rg = seg(P, j.pj, j.pj + 0.05)
      const [jx, jy] = bl.at(bl.len)
      put(R.ring[i], 'cx', String(f1(jx))); put(R.ring[i], 'cy', String(f1(jy)))
      put(R.ring[i], 'r', String(f1(3 + 10 * rg)))
      op(R.ring[i], P >= j.pj && rg < 1 ? (1 - rg) * 0.75 : 0)
    })
    draw(R.lit[0], route.len, dist / route.len)
    draw(R.halo[0], route.len, dist / route.len)

    // the preview ahead: stem to the points, into the dead end, retract, then the right way
    const uStem = sm(seg(P, 0.33, 0.39))
    const uDead = sm(seg(P, 0.39, 0.47)) * (1 - sm(seg(P, 0.52, 0.58)))
    const uRight = sm(seg(P, 0.62, 0.74))
    ;[uStem, uDead, uRight].forEach((u, i) => { draw(R.pm[i], prevs[i].p.len, u) })
    op(R.prevs, 1)
    const fade = 1 - sm(seg(P, 0.82, 0.93))
    op(R.prev[0], fade); op(R.prev[2], fade); op(R.prev[1], 1)
    op(R.pvh[0], fade); op(R.pvh[2], fade); op(R.pvh[1], 1)
    // the head of whichever preview is moving
    let head = null, headO = 0
    if (P >= 0.62 && P < 0.8) { head = prevs[2].p.at(prevs[2].p.len * uRight); headO = 1 - sm(seg(P, 0.74, 0.8)) }
    else if (P >= 0.5 && uDead > 0) { head = prevs[1].p.at(prevs[1].p.len * uDead); headO = 0.8 }
    else if (P >= 0.39 && P < 0.5) { head = prevs[1].p.at(prevs[1].p.len * uDead); headO = 1 }
    else if (P >= 0.33 && P < 0.39) { head = prevs[0].p.at(prevs[0].p.len * uStem); headO = 1 }
    if (head) at(R.head, head)
    op(R.head, head ? headO * 0.9 : 0)
    const hot = sm(seg(P, 0.45, 0.5)) * (1 - sm(seg(P, 0.52, 0.58)))
    op(R.bufhot, hot)

    // the points slide over
    const th = (Math.PI / 4) * sm(seg(P, 0.54, 0.66))
    const [fx, fy] = L.mp(L.F, m)
    const tip = L.mp(L.F + Math.cos(th) * L.blade, m + Math.sin(th) * L.blade)
    put(R.blade, 'x2', String(f1(tip[0]))); put(R.blade, 'y2', String(f1(tip[1])))
    op(R.mach, sm(seg(P, 0.64, 0.7)))

    // the signal: red until the points are right
    const sig = sm(seg(P, 0.07, 0.16))
    const green = sm(seg(P, 0.76, 0.8))
    op(R.signal, sig)
    op(R.lred, 1 - green); op(R.lgreen, green)
    op(R.gred, 1 - green); op(R.ggreen, green * 0.9)
    const waiting = !reduced && P >= 0.3 && P < 0.78 ? '1' : '0'
    if (R.breath._w !== waiting) { R.breath._w = waiting; R.breath.dataset.wait = waiting; root.toggleAttribute('data-waiting', waiting === '1') }

    // the terminus board
    op(R.board, sm(seg(P, 0.92, 0.99)))
  }

  // ------------------------------------------------------------------------------------------ lifecycle
  function tick() {
    raf = 0
    if (!on) return
    const p = progress ? progress() : 1
    if (Math.abs(p - lastP) > 1e-4) { lastP = p; render(p) }
    raf = requestAnimationFrame(tick)
  }
  function setOn(v) {
    if (on === v) return
    on = v
    if (on && !raf && !reduced) raf = requestAnimationFrame(tick)
  }

  build()
  render(reduced ? 1 : progress ? progress() : 0)

  let io = null
  if (!reduced) {
    io = new IntersectionObserver((entries) => { for (const e of entries) setOn(e.isIntersecting) }, { rootMargin: '10% 0px' })
    io.observe(root)
  }
  const ro = new ResizeObserver(() => {
    const before = L?.mode
    build()
    if (L.mode !== before) render(reduced ? 1 : progress ? progress() : 0)
  })
  ro.observe(root)

  return {
    setTheme(t) { root.dataset.syTheme = t || '' }, // colours are page tokens (html[data-theme]); nothing is cached
    dispose() {
      on = false
      cancelAnimationFrame(raf)
      io?.disconnect()
      ro.disconnect()
      root.remove()
    },
  }
}
