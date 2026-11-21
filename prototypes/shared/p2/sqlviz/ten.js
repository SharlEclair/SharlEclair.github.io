/**
 * ?sql=ten "Ten Questions": the 10-question test set drawn literally as LCD gel tiles. They resolve in order, one fails
 * (Q07, placement only), the counter stops at 9 / 10, Q07 lifts, shows the healing loop and flips green, 10 / 10, then
 * the 45 automated tests light up. Pure DOM + CSS (ten.css); this module only maps scroll progress to a few attributes.
 *
 * Scroll beats (p = damped progress of the pinned runway, 100vh of scroll):
 *   0        tiles queued (outlined), TEST SET
 *   .04-.40  one tile per .036: 25% dither, 50% dither, solid, tick (stepped 4x4 Bayer mask); Q07 goes error
 *   .44-.52  Q07 lifts (scale, translateZ), the others dim
 *   .52-.72  three steps light every .065: ERROR, DIAGNOSE, RETRY
 *   .72-.80  flip to the accent face (.72-.76), settle back into the grid (.76-.80)
 *   .80-.86  counter 10 / 10 and the label swaps
 *   .86-.98  45 dots fill by stepped reveal
 * The markup defaults to the END state, so reduced motion (no updates at all) and no-JS-after-mount read as real text.
 * All facts come from content.js; the strings the owner specified are the TEST SET header, the caption and the tick text.
 */
import { projects } from '../../content.js'

const CSS_HREF = new URL('./ten.css', import.meta.url).href

const proj = projects.find((p) => p.id === 'sql-agent')
const fact = (re) => proj.facts.find(([k]) => re.test(k))
const FIRST = fact(/first attempt/i) // ['Correct, first attempt', '9 / 10']
const AFTER = fact(/self-healing/i) // ['Correct, after self-healing', '10 / 10']
const TESTS = fact(/tests/i) // ['Automated tests', '45']
const N = Number(AFTER[1].split('/')[1]) // 10
const N_TESTS = Number(TESTS[1]) // 45
const FAIL = 6 // Q07: which question fails is placement only
const DB = proj.stack.find((s) => /duckdb/i.test(s)) // 'DuckDB'

const T0 = 0.04
const STEP = 0.036
const LIFT_A = 0.44, LIFT_B = 0.52
const LOOP_A = 0.52, LOOP_STEP = 0.065, LOOP_END = 0.72
const FLIP_A = 0.72, FLIP_B = 0.76, SETTLE_B = 0.80
const DOTS_A = 0.86, DOTS_B = 0.98
const STEPS = ['✕ ERROR', '↻ DIAGNOSE', '→ RETRY']

const clamp = (v) => Math.min(1, Math.max(0, v))
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t) }
const q = (v, n) => Math.round(v * n) / n
const pad2 = (i) => String(i + 1).padStart(2, '0')

// 4x4 Bayer matrix; a cell is lit when its threshold is below n (4 = 25%, 8 = 50%)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
function bayerMask(n) {
  let d = ''
  BAYER.forEach((v, i) => { if (v < n) d += `M${i % 4} ${Math.floor(i / 4)}h1v1h-1z` })
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 4' shape-rendering='crispEdges'><path d='${d}'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

function ensureStyles() {
  if (document.querySelector('link[data-ten-css]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = CSS_HREF
  link.dataset.tenCss = ''
  document.head.append(link)
}

function h(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

export function mount(el, { runway, reduced, progress } = {}) {
  ensureStyles()

  const root = h('div', 'tq')
  root.setAttribute('role', 'figure')
  root.setAttribute('aria-label', `Ten test questions: ${FIRST[1]} correct on the first attempt, ${AFTER[1]} after self-healing`)
  root.dataset.done = ''
  root.style.setProperty('--tq-m1', bayerMask(4))
  root.style.setProperty('--tq-m2', bayerMask(8))

  const sr = h('p', 'tq-sr',
    `Test set of ${N} questions. ${FIRST[0]}: ${FIRST[1]}. One question fails with an error, the agent diagnoses the error and retries, ` +
    `and it passes. ${AFTER[0]}: ${AFTER[1]}. ${TESTS[0]}: ${TESTS[1]}. Illustration: which question failed is placement only.`)

  const kicker = h('div', 'tq-kicker', 'TEST SET')

  // ---- tiles ----
  const wrap = h('div', 'tq-gridwrap')
  const grid = h('ol', 'tq-grid')
  const tiles = []
  const tipText = []
  for (let i = 0; i < N; i++) {
    const li = h('li', 'tq-tile')
    li.setAttribute('aria-hidden', 'true')
    const inner = h('div', 'tq-in')
    const label = `Q${pad2(i)}`
    const front = h('div', 'tq-f')
    front.append(h('span', 'tq-q', label))
    if (i === FAIL) {
      li.dataset.q7 = ''
      front.append(h('span', 'tq-g w', '✕ ERROR'))
      const back = h('div', 'tq-b')
      back.append(h('span', 'tq-q', label), h('span', 'tq-g', '✓'))
      inner.append(front, back)
      tipText.push(`${label} ✓ after self-healing`)
    } else {
      front.append(h('span', 'tq-g', '✓'))
      inner.append(front)
      tipText.push(`${label} ✓ first attempt`)
    }
    li.append(inner)
    li.dataset.i = i
    grid.append(li)
    tiles.push(li)
  }
  const loop = h('div', 'tq-loop')
  loop.setAttribute('aria-hidden', 'true')
  const stepEls = STEPS.map((s) => h('span', 'tq-step', s))
  loop.append(h('span', 'tq-lh', `Q${pad2(FAIL)}`), ...stepEls)
  const tip = h('div', 'tq-tip')
  wrap.append(grid, loop, tip)

  // ---- counter ----
  const count = h('div', 'tq-count')
  const nEl = h('div', 'tq-n', AFTER[1])
  const lblEl = h('div', 'tq-lbl', AFTER[0])
  count.append(nEl, lblEl)
  const main = h('div', 'tq-main')
  main.append(wrap, count)

  // ---- 45 automated tests ----
  const tests = h('div', 'tq-tests')
  const dotsEl = h('div', 'tq-dots')
  dotsEl.setAttribute('aria-hidden', 'true')
  const dots = Array.from({ length: N_TESTS }, () => dotsEl.appendChild(h('i')))
  const tlabel = h('p')
  tlabel.append(h('b', null, TESTS[1]), ' ', h('span', null, TESTS[0]))
  tests.append(dotsEl, tlabel)

  const foot = h('p', 'tq-foot')
  foot.append(h('span', null, `SQL on ${DB ?? 'DuckDB'}`), h('span', null, 'Illustration: which question failed is placement only.'))

  root.append(sr, kicker, main, tests, foot)
  el.replaceChildren(root)

  // ---- hover readout (works in the end state only: data-done) ----
  let tipTimer = 0
  const showTip = (i) => { clearTimeout(tipTimer); tip.textContent = i == null ? '' : tipText[i] }
  grid.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('.tq-tile')
    if (!t || root.dataset.done === undefined) return
    showTip(Number(t.dataset.i))
    if (e.pointerType === 'touch') tipTimer = setTimeout(() => showTip(null), 2500)
  })
  grid.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') showTip(null) })

  const handle = { setTheme() {}, dispose() {} }
  if (reduced || typeof progress !== 'function') return handle // static end state

  // ---- the scroll story ----
  const q7 = tiles[FAIL]
  const st = new Array(N).fill(-1)
  let lastN = -1, lastHealed = null, lastL = -1, lastF = -1, lastDim = -1, lastLit = -1
  let loopOn = null, lift = null, done = null
  const stepOn = [null, null, null]

  function update(p) {
    let correct = 0
    for (let i = 0; i < N; i++) {
      const t = (p - (T0 + i * STEP)) / STEP
      const s = t < 0 ? 0 : t < 0.25 ? 1 : t < 0.5 ? 2 : t < 0.75 ? 3 : 4
      if (s === 4 && i !== FAIL) correct++
      if (st[i] !== s) { st[i] = s; tiles[i].dataset.s = s }
    }
    const healed = p >= SETTLE_B
    const n = healed ? N : correct
    if (n !== lastN) { lastN = n; nEl.textContent = `${n} / ${N}` }
    if (healed !== lastHealed) { lastHealed = healed; lblEl.textContent = healed ? AFTER[0] : FIRST[0] }

    const L = q(ss(LIFT_A, LIFT_B, p) - ss(FLIP_B, SETTLE_B, p), 400)
    if (L !== lastL) { lastL = L; q7.style.setProperty('--l', L) }
    const F = q(ss(FLIP_A, FLIP_B, p) * 180, 20)
    if (F !== lastF) { lastF = F; q7.style.setProperty('--f', `${F}deg`) }
    const dim = q(1 - 0.68 * L, 50)
    if (dim !== lastDim) { lastDim = dim; grid.style.setProperty('--dim', dim) }

    const li = p >= LIFT_A && p < SETTLE_B
    if (li !== lift) { lift = li; q7.toggleAttribute('data-lift', li) }
    const lo = p >= LOOP_A && p < LOOP_END
    if (lo !== loopOn) { loopOn = lo; root.toggleAttribute('data-loop', lo) }
    for (let k = 0; k < 3; k++) {
      const on = p >= LOOP_A + k * LOOP_STEP
      if (on !== stepOn[k]) { stepOn[k] = on; stepEls[k].toggleAttribute('data-on', on) }
    }

    const lit = Math.min(N_TESTS, Math.floor(clamp((p - DOTS_A) / (DOTS_B - DOTS_A)) * N_TESTS + 1e-6))
    if (lit !== lastLit) {
      const from = Math.max(0, lastLit)
      if (lastLit < 0) dots.forEach((d, i) => d.classList.toggle('off', i >= lit))
      else for (let i = Math.min(from, lit); i < Math.max(from, lit); i++) dots[i].classList.toggle('off', i >= lit)
      lastLit = lit
    }
    const dn = p >= DOTS_B
    if (dn !== done) { done = dn; root.toggleAttribute('data-done', dn); if (!dn) showTip(null) }
  }

  update(progress()) // rewind to the start on mount
  let raf = 0
  let last = NaN
  const tick = () => {
    const p = progress()
    if (p !== last) { last = p; update(p) }
    raf = requestAnimationFrame(tick)
  }
  const io = new IntersectionObserver(([entry]) => {
    cancelAnimationFrame(raf)
    if (entry.isIntersecting) raf = requestAnimationFrame(tick)
  }, { rootMargin: '120px 0px' })
  io.observe(runway ?? el)

  handle.dispose = () => { io.disconnect(); cancelAnimationFrame(raf); clearTimeout(tipTimer); root.remove() }
  return handle
}
