/**
 * ?sql=proof  "Proof Mark": newsprint proofreading, the simplest SQL animation.
 * A query clause that names a column that does not exist is circled, struck and corrected in red pen
 * (`tools` becomes `stack`); then the same marks correct the score (9 becomes 10).
 * DOM text plus one SVG overlay. All text is real (<del>/<ins>), so the end state reads correctly without motion.
 * The marks are measured from the rendered text, so they line up at every viewport width.
 * Copy and numbers come from shared/content.js (the sql-agent project); the clause is an illustration.
 * No dashes in copy; no WebGL; the loop only runs while the stage is on screen.
 */
import { projects } from '../../content.js'

const CSS_HREF = new URL('./proof.css', import.meta.url).href
// The page loads Instrument Serif regular only; the corrections are set in its real italic.
const ITALIC_HREF = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap'
const SVG_NS = 'http://www.w3.org/2000/svg'

const agent = projects.find((p) => p.id === 'sql-agent')
const fact = (label) => agent.facts.find(([k]) => k === label)[1]
const [SCORE_BAD] = fact('Correct, first attempt').split(' / ')
const [SCORE_GOOD, SCORE_OF] = fact('Correct, after self-healing').split(' / ')
const LABEL_BAD = 'Correct, first attempt'
const LABEL_GOOD = 'Correct, after self-healing'
const TESTS = agent.facts.find(([k]) => k === 'Automated tests')
const STACK = agent.stack.join(' · ')

// The query is an illustration over this page's own content: each project has a `stack` list, and DuckDB is in it.
const COL_BAD = 'tools'
const COL_GOOD = 'stack'
const NOTE_BAD = 'no such column'
const NOTE_GOOD = 'diagnosed. fixed itself.'
const CAPTION = 'Illustration: a query on this page’s own content. Scores are from the project’s test set.'
const ARIA = `A proofreader's red pen corrects a database query that asked for a column called ${COL_BAD}: it becomes ${COL_GOOD}. The same correction fixes the score from ${SCORE_BAD} out of ${SCORE_OF} to ${SCORE_GOOD} out of ${SCORE_OF}. ${TESTS[1]} ${TESTS[0].toLowerCase()}.`

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const seg = (p, a, b) => clamp01((p - a) / (b - a))
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

function ensureStyles() {
  const add = (href, key) => {
    if (document.querySelector(`link[data-${key}]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset[key] = ''
    document.head.append(link)
  }
  add(CSS_HREF, 'proofCss')
  add(ITALIC_HREF, 'proofItalic')
}

function h(tag, cls, text, attrs) {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = text
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k])
  return n
}

/** A smooth, slightly wobbly pen loop around a box: ~6% overshoot, the end spirals just outside the start. */
function loopPath(cx, cy, rx, ry, seed) {
  const N = 16
  const start = (205 * Math.PI) / 180
  const sweep = Math.PI * 2 * 1.06
  const pts = []
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const a = start + sweep * u
    const k = 0.975 + 0.06 * u + 0.03 * Math.sin(2 * a + seed) + 0.02 * Math.sin(3 * a + seed * 1.7)
    pts.push([cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)])
  }
  return catmull(pts)
}

function catmull(pts) {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

export function mount(el, { reduced, progress }) {
  ensureStyles()

  // ---------- DOM ----------
  const fig = h('figure', 'pf', null, { role: 'figure', 'aria-label': ARIA })
  const col = h('div', 'pf-col')
  const sheet = h('div', 'pf-sheet')

  const clause = h('p', 'pf-clause')
  const delWord = h('del', null, COL_BAD)
  const insWord = h('ins', null, COL_GOOD)
  const word = h('span', 'pf-word')
  word.append(delWord, insWord)
  clause.append(h('span', 'pf-kw', 'WHERE'), ' list_contains(', word, ", 'DuckDB')")

  const note = h('p', 'pf-note')
  const n1 = h('span', null, NOTE_BAD)
  const n2 = h('span', null, NOTE_GOOD)
  n2.setAttribute('aria-hidden', 'true')
  note.append(n1, n2)

  const score = h('p', 'pf-score')
  const big = h('span', 'pf-big')
  const delBig = h('del', null, SCORE_BAD)
  const insBig = h('ins', null, SCORE_GOOD)
  big.append(delBig, insBig)
  score.append(big, h('span', 'pf-of', ` / ${SCORE_OF}`))

  const label = h('p', 'pf-label')
  const lA = h('del', null, LABEL_BAD)
  const lB = h('ins', null, LABEL_GOOD)
  label.append(lA, lB)

  const end = h('div', 'pf-end')
  const rule = h('span', 'pf-rule')
  const tests = h('p', 'pf-tests')
  tests.append(h('b', null, TESTS[1]), h('span', null, TESTS[0]))
  const stack = h('p', 'pf-stack', STACK)
  end.append(rule, tests, stack)

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'pf-marks')
  svg.setAttribute('aria-hidden', 'true')
  const mk = (cls) => {
    const path = document.createElementNS(SVG_NS, 'path')
    if (cls) path.setAttribute('class', cls)
    svg.append(path)
    return { path, len: 0 }
  }
  const M = {
    ring: mk(), lead: mk(), strike: mk(), caret: mk(),
    bRing: mk(), bStrike: mk(), bCaret: mk(),
  }

  sheet.append(clause, note, score, label, end, svg)
  col.append(sheet, h('figcaption', 'pf-cap', CAPTION))
  fig.append(col)
  el.replaceChildren(fig)

  // ---------- measuring ----------
  const ctx = document.createElement('canvas').getContext('2d')
  let sr = null
  const setFont = (cs) => {
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  }
  /** Ink box of a text element (relative to the sheet), from the rendered glyph metrics. */
  const ink = (node) => {
    const r = node.getBoundingClientRect()
    const cs = getComputedStyle(node)
    setFont(cs)
    const m = ctx.measureText(node.textContent)
    const fs = parseFloat(cs.fontSize)
    const asc = m.fontBoundingBoxAscent ?? fs * 0.9
    const base = r.top + asc
    return {
      l: r.left - sr.left, r: r.right - sr.left,
      t: base - (m.actualBoundingBoxAscent || fs * 0.7) - sr.top,
      b: base + (m.actualBoundingBoxDescent || 0) - sr.top,
      fs,
    }
  }
  /** Put an <ins> so its baseline sits at `baseY` (sheet coordinates). */
  const placeIns = (ins, baseY) => {
    ins.style.setProperty('--dy', '0px')
    const r = ins.getBoundingClientRect()
    const cs = getComputedStyle(ins)
    setFont(cs)
    const m = ctx.measureText('x')
    const fs = parseFloat(cs.fontSize)
    const A = m.fontBoundingBoxAscent ?? fs * 0.9
    const D = m.fontBoundingBoxDescent ?? fs * 0.25
    const b0 = r.top - sr.top + (r.height - (A + D)) / 2 + A
    ins.style.setProperty('--dy', `${(baseY - b0).toFixed(1)}px`)
  }
  const setPath = (m, d, sw) => {
    m.path.setAttribute('d', d)
    m.path.style.strokeWidth = sw
    m.len = m.path.getTotalLength()
    m.path.style.strokeDasharray = `${m.len} ${m.len}`
  }
  /** Strike: a slightly bowed, slightly tilted line through the ink box. */
  const strikePath = (b, over, tilt, bow) => {
    const y = (b.t + b.b) / 2
    const x0 = b.l - over
    const x1 = b.r + over
    return `M${x0.toFixed(1)} ${(y + tilt).toFixed(1)}Q${((x0 + x1) / 2).toFixed(1)} ${(y + bow).toFixed(1)} ${x1.toFixed(1)} ${(y - tilt).toFixed(1)}`
  }
  const caretPath = (cx, tipY, s) =>
    `M${(cx - s).toFixed(1)} ${(tipY + s * 1.05).toFixed(1)}L${cx.toFixed(1)} ${tipY.toFixed(1)}L${(cx + s * 1.1).toFixed(1)} ${(tipY + s * 1.05).toFixed(1)}`

  let laidOut = false
  function layout() {
    sr = sheet.getBoundingClientRect()
    if (!sr.width) return
    svg.setAttribute('width', sr.width)
    svg.setAttribute('height', sr.height)

    // the faulty word
    const w = ink(delWord)
    const wcx = (w.l + w.r) / 2
    const wcy = (w.t + w.b) / 2
    const wrx = ((w.r - w.l) / 2) * 1.2 + w.fs * 0.16
    const wry = ((w.b - w.t) / 2) * 1.85 + w.fs * 0.22
    const sw = 2
    setPath(M.ring, loopPath(wcx, wcy, wrx, wry, 0.6), sw)
    const wTop = wcy - wry * 1.06
    const cs = Math.max(5, w.fs * 0.34)
    setPath(M.caret, caretPath(wcx, wTop - cs * 1.9, cs), sw)
    setPath(M.strike, strikePath(w, w.fs * 0.35, w.fs * 0.1, -w.fs * 0.06), sw)
    placeIns(insWord, wTop - cs * 1.9 - Math.max(3, w.fs * 0.2))

    // margin note, below and to the right of the ring
    const clauseBox = clause.getBoundingClientRect()
    const noteW = note.offsetWidth
    const noteH = note.offsetHeight
    const noteTop = Math.max(wcy + wry, clauseBox.bottom - sr.top) + noteH * 0.12
    const noteLeft = Math.min(wcx + wrx * 0.9 + w.fs * 0.9, sr.width - noteW)
    note.style.left = `${noteLeft.toFixed(1)}px`
    note.style.top = `${noteTop.toFixed(1)}px`
    const a = (50 * Math.PI) / 180
    const p0 = [wcx + wrx * 0.99 * Math.cos(a), wcy + wry * 0.99 * Math.sin(a)]
    const p1 = [noteLeft - 7, noteTop + noteH * 0.52]
    setPath(M.lead, `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)}Q${(p0[0] + (p1[0] - p0[0]) * 0.15).toFixed(1)} ${p1[1].toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`, sw)

    // the same marks at the scale of the score
    const g = ink(delBig)
    const gcx = (g.l + g.r) / 2
    const gcy = (g.t + g.b) / 2
    const grx = ((g.r - g.l) / 2) * 1.6 + g.fs * 0.03
    const gry = ((g.b - g.t) / 2) * 1.27 + g.fs * 0.02
    const gsw = Math.min(3.6, Math.max(2, g.fs * 0.024))
    setPath(M.bRing, loopPath(gcx, gcy, grx, gry, 2.1), gsw)
    const gTop = gcy - gry * 1.06
    const gcs = Math.max(7, g.fs * 0.075)
    setPath(M.bCaret, caretPath(gcx, gTop - gcs * 1.9, gcs), gsw)
    setPath(M.bStrike, strikePath(g, g.fs * 0.12, g.fs * 0.045, -g.fs * 0.03), gsw)
    placeIns(insBig, gTop - gcs * 1.9 - Math.max(4, g.fs * 0.045))
    laidOut = true
  }

  // ---------- the story ----------
  let lastP = -1
  const draw = (m, t) => {
    if (t <= 0.001) {
      m.path.style.opacity = 0
      return
    }
    m.path.style.opacity = 1
    m.path.style.strokeDashoffset = (m.len * (1 - t)).toFixed(1)
  }
  const reveal = (ins, t) => {
    ins.style.clipPath = `inset(-25% ${(((1 - t) * 120) - 10).toFixed(1)}% -25% -10%)`
  }
  const swap = (a, b, t) => {
    a.style.opacity = 1 - t
    a.style.visibility = t >= 0.999 ? 'hidden' : 'visible'
    b.style.opacity = t
    b.style.visibility = t <= 0.001 ? 'hidden' : 'visible'
  }

  function apply(p) {
    if (!laidOut) return
    // the word: circle, margin note, strike, caret, correction
    draw(M.ring, ease(seg(p, 0.2, 0.3)))
    draw(M.lead, ease(seg(p, 0.28, 0.34)))
    const noteIn = ease(seg(p, 0.3, 0.36))
    const noteSwap = ease(seg(p, 0.5, 0.54))
    n1.style.opacity = noteIn * (1 - noteSwap)
    n1.style.visibility = n1.style.opacity === '0' ? 'hidden' : 'visible'
    n2.style.opacity = noteSwap
    n2.style.visibility = noteSwap === 0 ? 'hidden' : 'visible'
    const strike = ease(seg(p, 0.34, 0.4))
    draw(M.strike, strike)
    draw(M.caret, ease(seg(p, 0.4, 0.43)))
    reveal(insWord, ease(seg(p, 0.43, 0.5)))
    delWord.style.opacity = 1 - 0.5 * strike

    // the score: same marks, larger
    draw(M.bRing, ease(seg(p, 0.56, 0.63)))
    const bStrike = ease(seg(p, 0.63, 0.68))
    draw(M.bStrike, bStrike)
    draw(M.bCaret, ease(seg(p, 0.68, 0.7)))
    reveal(insBig, ease(seg(p, 0.7, 0.77)))
    delBig.style.opacity = 1 - 0.5 * bStrike
    swap(lA, lB, ease(seg(p, 0.76, 0.8)))

    // the end: 45 automated tests, then the stack line
    const e1 = ease(seg(p, 0.82, 0.89))
    const e2 = ease(seg(p, 0.88, 0.95))
    rule.style.transform = `scaleX(${e1.toFixed(3)})`
    tests.style.opacity = e1
    tests.style.transform = `translateY(${((1 - e1) * 6).toFixed(1)}px)`
    stack.style.opacity = e2
    stack.style.transform = `translateY(${((1 - e2) * 6).toFixed(1)}px)`
  }

  function relayout() {
    layout()
    lastP = -1
    if (reduced) apply(1)
  }

  // ---------- run ----------
  const ro = new ResizeObserver(relayout)
  ro.observe(sheet)
  document.fonts?.ready.then(relayout)
  document.fonts?.addEventListener?.('loadingdone', relayout)
  relayout()

  let raf = 0
  let onScreen = false
  const frame = () => {
    raf = 0
    if (!onScreen) return
    const p = progress()
    if (Math.abs(p - lastP) > 0.0004) {
      lastP = p
      apply(p)
    }
    raf = requestAnimationFrame(frame)
  }
  let io = null
  if (reduced) {
    apply(1)
  } else {
    apply(progress())
    io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen && !raf) raf = requestAnimationFrame(frame)
    })
    io.observe(el)
  }

  return {
    // colours are CSS tokens (html[data-theme]), so only geometry needs a refresh
    setTheme() {
      relayout()
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      onScreen = false
      io?.disconnect()
      ro.disconnect()
      document.fonts?.removeEventListener?.('loadingdone', relayout)
      el.replaceChildren()
    },
  }
}
