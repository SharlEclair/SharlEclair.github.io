/**
 * ?sql=loop  "The Loop": the agent as four translucent isometric plates (ASK, SAFETY CHECK, RUN, ANSWER). A small
 * dithered SQL packet falls through them, fails at RUN, is diverted through DIAGNOSE and FIX on a return loop beside
 * the stack, re-enters the safety check, passes RUN and lands on ANSWER. SVG only, scroll scrubbed (p of the pinned
 * runway), cheap: one rAF while on screen, attribute writes only when a value changed.
 *
 * Copy and numbers come from shared/content.js (rows = projects whose stack lists DuckDB, score = the sql-agent fact).
 * The static markup is the END state (complete text); JS then scrubs it from p = 0. Reduced motion keeps the end state.
 */
import { projects } from '../../content.js'

const CSS_HREF = new URL('./loop.css', import.meta.url).href

const agent = projects.find((p) => p.id === 'sql-agent')
const SCORE = agent.facts.find(([k]) => /after self-healing/i.test(k)) // ['Correct, after self-healing', '10 / 10']
const ROWS = projects.filter((p) => p.stack.includes('DuckDB')).length // every project lists DuckDB: 4
const QUESTION = 'Which projects use DuckDB?'
const ERROR_TAG = 'column "tools" not found'
const CAPTION = 'Illustration: a query on this page’s own content. Scores are from the project’s test set.'

const BEATS = [
  { at: 0, id: 'running', title: 'RUNNING', mark: '●', text: 'an AI writes the query, safety checks review it' },
  { at: 0.3, id: 'error', title: 'ERROR', mark: '✕', text: ERROR_TAG },
  { at: 0.36, id: 'heal', title: 'SELF-HEALING', mark: '↻', text: 'diagnoses the error and fixes it itself' },
  { at: 0.72, id: 'ok', title: 'CORRECT', mark: '✓', text: `fixed itself and returned ${ROWS} rows` },
]

const PLATES = [
  { name: 'ASK', sub: 'LLM writes SQL', tip: 'an AI writes the database query' },
  { name: 'SAFETY CHECK', sub: 'before it runs', tip: 'reviews the query before it runs' },
  { name: 'RUN', sub: 'on DuckDB', tip: 'runs the query on DuckDB' },
  { name: 'ANSWER', sub: '', tip: `scored ${SCORE[1]} on a test set` },
]

// Beat times of the pinned runway (p, 0..1). Legs of the packet: [p0, p1] per leg.
const LEG_T = [[0.05, 0.12], [0.12, 0.205], [0.205, 0.3], [0.36, 0.45], [0.45, 0.55], [0.55, 0.62], [0.62, 0.7], [0.72, 0.86]]
const END_TH = Math.PI / 4
const PTS_PER_LEG = 30 // 8 legs x 30 = 240 sampled points

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const mix = (a, b, t) => a + (b - a) * t
const f1 = (n) => Math.round(n * 10) / 10
const fp = (pt) => `${f1(pt[0])},${f1(pt[1])}`
const cw = (str, fs) => Math.ceil(str.length * fs * 0.6)

function ensureStyles(onReady) {
  let link = document.querySelector('link[data-loop-css]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = CSS_HREF
    link.dataset.loopCss = ''
    document.head.append(link)
  }
  if (link.sheet) onReady()
  else {
    link.addEventListener('load', onReady, { once: true })
    link.addEventListener('error', onReady, { once: true })
    setTimeout(onReady, 1500)
  }
}

// ---------------------------------------------------------------------------------------------- layout (viewBox units)
function layoutWide() {
  const cx = 326, a = 172, b = 44
  const cys = [112, 210, 308, 406]
  const fs = { title: 14, sub: 12.5, st: 12.5, tag: 12.5, pill: 12, pk: 12.5, rows: 24, score: 13, big: 28 }
  const tagW = cw(ERROR_TAG, fs.tag) + 22
  return {
    mode: 'wide', W: 860, H: 470, cx, a, b, cys, yTop: 32, fs, th: 7,
    labelX: cx - a - 16, pillW: 100, pillH: 28, px: 668, yd: cys[2] - 22, yf: cys[1] + 22,
    tag: { x: cx + a + 14, y: cys[2] + 16, w: tagW, h: 24 },
    score: { x: cx + a + 26, k: cys[3] - 4, v: cys[3] + 26, anchor: 'start' },
    gap: [14, 28, 42], // label baselines relative to cy: title, sub, status
    dot: 1,
  }
}
function layoutTall() {
  const cx = 176, a = 80, b = 30
  const cys = [86, 172, 258, 344]
  const fs = { title: 9.5, sub: 9, st: 9, tag: 9, pill: 9, pk: 9.5, rows: 16, score: 9.5, big: 14 }
  const tagW = cw(ERROR_TAG, fs.tag) + 14
  return {
    mode: 'tall', W: 358, H: 406, cx, a, b, cys, yTop: 36, fs, th: 5,
    labelX: cx - a - 8, pillW: 76, pillH: 22, px: 312, yd: cys[2] - 20, yf: cys[1] + 20,
    tag: { x: 358 - tagW - 1, y: cys[2] + 24, w: tagW, h: 18 },
    score: { x: 179, k: cys[3] + b + 24, v: cys[3] + b + 24, anchor: 'middle' },
    gap: [-4, 8, 20],
    dot: 0.6,
  }
}

// ---------------------------------------------------------------------------------------------- geometry helpers
// Plates are authored in PLANE coordinates (a square around the origin) and mapped to the screen by a per-frame matrix
// (yaw theta, tilt k): at theta = 45 degrees this is the isometric diamond. Depth comes from the plates separating.
const planeS = (L) => L.a * Math.SQRT1_2
const isoPt = (L, i, u, v) => [(u - 0.5) * 2 * planeS(L), (v - 0.5) * 2 * planeS(L)]
const mat = (L, th, k, cy, dy = 0) => {
  const c = Math.cos(th), s = Math.sin(th)
  return `matrix(${c.toFixed(4)} ${(k * s).toFixed(4)} ${(-s).toFixed(4)} ${(k * c).toFixed(4)} ${f1(L.cx)} ${f1(cy + dy)})`
}
const sq = (x, y, h) => `M${f1(x - h)},${f1(y - h)}h${f1(2 * h)}v${f1(2 * h)}h${f1(-2 * h)}Z`

function roundPoly(pts, ts) {
  const n = pts.length
  let d = ''
  for (let i = 0; i < n; i += 1) {
    const p = pts[i], pr = pts[(i + n - 1) % n], nx = pts[(i + 1) % n], t = ts[i]
    const A = [p[0] + (pr[0] - p[0]) * t, p[1] + (pr[1] - p[1]) * t]
    const B = [p[0] + (nx[0] - p[0]) * t, p[1] + (nx[1] - p[1]) * t]
    d += `${i ? 'L' : 'M'}${fp(A)}Q${fp(p)} ${fp(B)}`
  }
  return `${d}Z`
}
function platePath(L, i, dy = 0, grow = 0) {
  const s = planeS(L) + grow
  return roundPoly([[-s, -s], [s, -s], [s, s], [-s, s]], [0.13, 0.13, 0.13, 0.13])
}
function rng(seed) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}
const diamond = (x, y, rx, ry) => `M${f1(x - rx)},${f1(y)}L${f1(x)},${f1(y - ry)}L${f1(x + rx)},${f1(y)}L${f1(x)},${f1(y + ry)}Z`

function detailDots(L) {
  const r = rng(7)
  let out = ''
  for (let n = 0; n < 34; n += 1) {
    const u = 0.1 + r() * 0.8, v = 0.1 + r() * 0.8
    const [x, y] = isoPt(L, 0, u, v)
    const rad = (0.8 + r() * r() * 3) * L.dot
    out += `<circle class="${r() < 0.62 ? 'd-dot-w' : 'd-dot-s'}" cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad)}" opacity="${f1(0.5 + r() * 0.5)}"/>`
  }
  return out
}
function detailGrid(L) {
  let lines = '', outline = '', filled = ''
  const n = 6
  for (let k = 1; k < n; k += 1) {
    const t = k / n
    lines += `M${fp(isoPt(L, 1, t, 0))}L${fp(isoPt(L, 1, t, 1))}M${fp(isoPt(L, 1, 0, t))}L${fp(isoPt(L, 1, 1, t))}`
    for (let j = 1; j < n; j += 1) {
      const [x, y] = isoPt(L, 1, t, j / n)
      const d = sq(x, y, 2.3 * L.dot)
      if ((k + j) % 3 === 0) filled += d
      else outline += d
    }
  }
  return `<path class="d-grid" d="${lines}"/><path class="d-mk" d="${outline}"/><path class="d-mk-f" d="${filled}"/>`
}
function detailMesh(L) {
  const r = rng(19)
  const m = 7
  const node = []
  for (let i = 0; i <= m; i += 1) {
    node.push([])
    for (let j = 0; j <= m; j += 1) {
      const u = 0.07 + 0.86 * (i / m) + (r() - 0.5) * 0.03
      const v = 0.07 + 0.86 * (j / m) + (r() - 0.5) * 0.03
      node[i].push(isoPt(L, 2, u, v))
    }
  }
  let edges = '', nodes = ''
  for (let i = 0; i <= m; i += 1) {
    for (let j = 0; j <= m; j += 1) {
      const p = node[i][j]
      if (i < m) edges += `M${fp(p)}L${fp(node[i + 1][j])}`
      if (j < m) edges += `M${fp(p)}L${fp(node[i][j + 1])}`
      if (i < m && j < m && (i + j) % 3 === 0) edges += `M${fp(p)}L${fp(node[i + 1][j + 1])}`
      nodes += sq(p[0], p[1], 1.3 * L.dot)
    }
  }
  L.spikes = [[2, 3, 22], [4, 4, 28], [5, 2, 18]].map(([i, j, h]) => ({ pu: node[i][j][0], pv: node[i][j][1], h: h * L.dot }))
  return `<path class="d-edge" d="${edges}"/><path class="d-node" d="${nodes}"/>`
}

// ---------------------------------------------------------------------------------------------- markup
function routeD(L) {
  const { cx, a, cys, px, yd, yf, yTop } = L
  const c3 = [cx, cys[2]], c2 = [cx, cys[1]]
  const B1 = `M${fp(c3)}C${f1(cx + a)},${f1(cys[2])} ${f1(px - 70)},${f1(yd)} ${f1(px)},${f1(yd)}`
  const B2 = `M${f1(px)},${f1(yd)}L${f1(px)},${f1(yf)}`
  const B3 = `M${f1(px)},${f1(yf)}C${f1(px - 70)},${f1(yf)} ${f1(cx + a)},${f1(cys[1])} ${fp(c2)}`
  const line = (i, j) => `M${f1(cx)},${f1(i)}L${f1(cx)},${f1(j)}`
  return {
    legs: [
      line(yTop, cys[0]), line(cys[0], cys[1]), line(cys[1], cys[2]), // first pass: top, ASK, SAFETY, RUN
      B1, B2, B3, // return loop: RUN to DIAGNOSE to FIX to SAFETY
      line(cys[1], cys[2]), line(cys[2], cys[3]), // second pass: SAFETY to RUN, RUN to ANSWER
    ],
    loop: `${B1}${B2.replace('M', 'L')}${B3.replace('M', 'L')}`,
    first: line(yTop + 13, cys[2]), // starts under the question pill so the line never strikes its text
  }
}

function pill(L, which, label, y, tip) {
  const { px, pillW: w, pillH: h, fs } = L
  const x = px - w / 2, yy = y - h / 2
  return `<g class="lp-hit" data-tip="${tip}" data-pill="${which}">
<rect class="lp-pill-under" x="${f1(x)}" y="${f1(yy)}" width="${w}" height="${h}" rx="${h / 2}"/>
<rect class="lp-pill-base" x="${f1(x)}" y="${f1(yy)}" width="${w}" height="${h}" rx="${h / 2}"/>
<rect class="lp-pill-gloss" x="${f1(x + h * 0.4)}" y="${f1(yy + 2)}" width="${f1(w - h * 0.8)}" height="${f1(Math.max(1.6, h * 0.1))}" rx="1"/>
<g data-lit opacity=".5"><rect class="lp-pill-glow" x="${f1(x)}" y="${f1(yy)}" width="${w}" height="${h}" rx="${h / 2}"/><rect class="lp-pill-lit" x="${f1(x)}" y="${f1(yy)}" width="${w}" height="${h}" rx="${h / 2}"/></g>
<text class="lp-pill-txt" x="${px}" y="${f1(y)}" font-size="${fs.pill}" text-anchor="middle" dominant-baseline="central">${label}</text>
<text class="lp-pill-txt lit" data-lit-txt x="${px}" y="${f1(y)}" font-size="${fs.pill}" text-anchor="middle" dominant-baseline="central" opacity=".5">${label}</text>
</g>`
}

function buildSvg(L, id) {
  const { cx, a, b, cys, fs, th } = L
  const R = routeD(L)
  const stop = (o, c, op) => `<stop offset="${o}" style="stop-color:${c};stop-opacity:${op}"/>`
  const defs = `<defs>
<linearGradient id="${id}g1" x1="0" y1="0" x2="1" y2="1">${stop(0, 'var(--lp-a)', 0.26)}${stop(1, 'var(--lp-b)', 0.08)}</linearGradient>
<linearGradient id="${id}g2" x1="0" y1="0" x2="1" y2="1">${stop(0, 'var(--lp-hot)', 0.24)}${stop(1, 'var(--lp-a)', 0.08)}</linearGradient>
<linearGradient id="${id}g3" x1="0" y1="0" x2="1" y2="1">${stop(0, 'var(--lp-c)', 0.14)}${stop(1, 'var(--lp-a)', 0.1)}</linearGradient>
<linearGradient id="${id}g4" x1="0" y1="0" x2="1" y2="1">${stop(0, 'var(--lp-b)', 0.16)}${stop(1, 'var(--lp-a)', 0.07)}</linearGradient>
<linearGradient id="${id}rb" x1="0" y1="0" x2="1" y2="0.3">${stop(0, 'var(--lp-g1)', 1)}${stop(0.38, 'var(--lp-g2)', 1)}${stop(0.7, 'var(--lp-g3)', 1)}${stop(1, 'var(--lp-g4)', 1)}</linearGradient>
<linearGradient id="lp-pill-fill" x1="0" y1="0" x2="0" y2="1">${stop(0, 'var(--on-stage)', 0.16)}${stop(1, 'var(--on-stage)', 0.04)}</linearGradient>
<linearGradient id="lp-pk-fill" x1="0" y1="0" x2="1" y2="1">${stop(0, 'var(--lp-pk1)', 1)}${stop(1, 'var(--lp-pk2)', 1)}</linearGradient>
<pattern id="${id}dp" width="4" height="4" patternUnits="userSpaceOnUse"><rect class="dp-r" width="2" height="2"/><rect class="dp-r" x="2" y="2" width="2" height="2"/></pattern>
<radialGradient id="${id}rg">${stop(0, '#fff', 1)}${stop(0.55, '#fff', 0.55)}${stop(1, '#000', 1)}</radialGradient>
<mask id="${id}mk" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="0" y="0" width="1" height="1"><rect width="1" height="1" fill="url(#${id}rg)"/></mask>
${R.legs.map((d, i) => `<path id="${id}leg${i}" d="${d}"/>`).join('')}
</defs>`

  const dets = [detailDots(L), detailGrid(L), detailMesh(L), '']
  const plates = [3, 2, 1, 0] // paint order: bottom plate first, top plate last
    .map((i) => {
      const d = platePath(L, i)
      const extra =
        i === 2
          ? `<path class="lp-errfill" data-err d="${d}" opacity="0"/><path class="lp-okfill" data-ok d="${d}"/>`
          : i === 3
            ? `<path data-fill4 d="${platePath(L, 3)}" fill="url(#${id}rb)" opacity="1"/><g data-glow opacity="1"><path class="lp-glow" d="${platePath(L, 3, 0, 5)}" stroke-width="9" opacity=".12"/><path class="lp-glow" d="${platePath(L, 3, 0, 2)}" stroke-width="4" opacity=".28"/></g>`
            : ''
      const rowsTxt =
        i === 3
          ? `<text class="rows" data-rows x="${cx}" y="${cys[3] + 1}" font-size="${fs.big}" text-anchor="middle" dominant-baseline="central" style="fill:#fff;stroke:rgba(0,0,0,.35);stroke-width:3;paint-order:stroke">${ROWS} rows</text>`
          : ''
      const kk = L.b / L.a
      const spikes =
        i === 2
          ? L.spikes.map((sp, j) => `<g data-spike="${j}" transform="translate(${f1(cx + (sp.pu - sp.pv) * Math.SQRT1_2)} ${f1(cys[2] + kk * (sp.pu + sp.pv) * Math.SQRT1_2)})"><path class="d-spike" d="M0,0L0,${-sp.h}"/><path class="d-tip" d="${diamond(0, -sp.h, 2.6 * L.dot, 1.5 * L.dot)}"/></g>`).join('')
          : ''
      return `<g class="lp-hit" data-plate="${i}" data-tip="${PLATES[i].tip}">
<path class="lp-slab" data-slab="${i}" transform="${mat(L, END_TH, kk, cys[i], th)}" d="${d}"/>
<g data-pl="${i}" transform="${mat(L, END_TH, kk, cys[i])}">
<path class="lp-plate" d="${d}" fill="url(#${id}g${i + 1})"/>
${dets[i]}${extra}
<g data-halo="${i}" opacity="0"><path class="lp-halo lp-halo-soft" d="${d}"/><path class="lp-halo" d="${d}"/></g>
</g>${spikes}
${rowsTxt}
</g>`
    })
    .join('')

  const labels = PLATES.map((P, i) => {
    const y = cys[i]
    const sub = P.sub ? `<text class="lp-s" x="${L.labelX}" y="${y + L.gap[1]}" font-size="${fs.sub}" text-anchor="end">${P.sub}</text>` : ''
    const st = i === 1 ? '✓ PASSED' : i === 2 ? '✓ OK' : ''
    return `<g data-label="${i}"><text class="lp-t" x="${L.labelX}" y="${y + L.gap[0]}" font-size="${fs.title}" text-anchor="end">${P.name}</text>${sub}<text class="lp-st${i === 2 ? ' ok' : ''}" data-st="${i}" x="${L.labelX}" y="${y + L.gap[2]}" font-size="${fs.st}" text-anchor="end">${st}</text></g>`
  }).join('')

  const qW = cw(QUESTION, fs.pk) + 26, qH = L.mode === 'wide' ? 26 : 22
  const ghost = `<g data-ghost opacity=".9"><rect class="q-ghost-rect" x="${f1(cx - qW / 2)}" y="${f1(L.yTop - qH / 2)}" width="${qW}" height="${qH}" rx="${qH / 2}"/><text class="q-ghost-txt" x="${cx}" y="${L.yTop}" font-size="${fs.pk}" text-anchor="middle" dominant-baseline="central">${QUESTION}</text></g>`

  const t = L.tag
  const tag = `<g data-tag><rect class="tag-rect" x="${f1(t.x)}" y="${f1(t.y)}" width="${t.w}" height="${t.h}" rx="${t.h / 2}"/><text class="tag-txt" x="${f1(t.x + t.w / 2)}" y="${f1(t.y + t.h / 2)}" font-size="${fs.tag}" text-anchor="middle" dominant-baseline="central">${ERROR_TAG}</text></g>`

  const sc = L.score
  const score =
    L.mode === 'wide'
      ? `<g data-score><text class="score-k" x="${sc.x}" y="${sc.k}" font-size="${fs.score}">${SCORE[0]}</text><text class="score-v" x="${sc.x}" y="${sc.v}" font-size="${fs.big}">${SCORE[1]}</text></g>`
      : `<g data-score><text x="${sc.x}" y="${sc.k}" font-size="${fs.score}" text-anchor="middle"><tspan class="score-k">${SCORE[0]}  </tspan><tspan class="score-v" font-size="${fs.score + 3}">${SCORE[1]}</tspan></text></g>`

  const pkH = L.mode === 'wide' ? 26 : 22
  const packet = `<g class="lp-pk" data-pk data-err="0">
<ellipse data-pk-halo cx="0" cy="0" rx="40" ry="22" fill="url(#${id}dp)" mask="url(#${id}mk)"/>
<rect class="pk-body" data-pk-body x="-28" y="${-pkH / 2}" width="56" height="${pkH}" rx="${pkH / 2}"/>
<rect class="pk-gloss" data-pk-gloss x="-20" y="${-pkH / 2 + 2}" width="40" height="${f1(pkH * 0.26)}" rx="${f1(pkH * 0.13)}"/>
<text class="pk-text" data-pk-text x="0" y="0.5" font-size="${fs.pk}" text-anchor="middle" dominant-baseline="central">SQL</text>
</g>`

  const guide = [
    `<path class="r-guide" d="M${cx},${L.yTop + 13}L${cx},${cys[0]}"/>`,
    `<path class="r-guide" d="M${cx},${cys[0]}L${cx},${cys[1]}"/>`,
    `<path class="r-guide" d="M${cx},${cys[1]}L${cx},${cys[2]}"/>`,
    `<path class="r-guide dashed" data-g4 d="M${cx},${cys[2]}L${cx},${cys[3]}"/>`,
  ].join('')

  const routes = `<g data-guides>${guide}</g>
<path class="r-loop" data-loopbase d="${R.loop}" opacity=".9"/>
<path class="r-trail" data-trail d="${R.first}${R.loop.replace('M', 'M')} M${cx},${cys[1]}L${cx},${cys[3]}" opacity=".8"/>
<path class="r-lit first" data-lit="A" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0" d="${R.first}"/>
<path class="r-lit fix" data-lit="B" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0" d="${R.loop}"/>
<path class="r-lit fix" data-lit="C" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0" d="M${cx},${cys[1]}L${cx},${cys[2]}"/>
<path class="r-lit fix" data-lit="D" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0" d="M${cx},${cys[2]}L${cx},${cys[3]}"/>`

  const title = 'The self-healing loop'
  const desc = `A query packet falls through four plates: ask, safety check, run and answer. At run it fails with ${ERROR_TAG}. It is diverted through a diagnose step and a fix step, passes the safety check and run on the second attempt, and reaches the answer: ${ROWS} rows. ${SCORE[0]}: ${SCORE[1]}.`
  return `<svg class="lp-svg" viewBox="0 0 ${L.W} ${L.H}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="${id}t ${id}d" focusable="false">
<title id="${id}t">${title}</title><desc id="${id}d">${desc}</desc>
${defs}${plates}${routes}${labels}${ghost}${tag}${score}
<g data-pills>${pill(L, 'diag', 'DIAGNOSE', L.yd, 'diagnoses the error')}${pill(L, 'fix', 'FIX', L.yf, 'fixes it itself')}</g>
${packet}
</svg>`
}

// ---------------------------------------------------------------------------------------------- mount
export function mount(el, { theme, reduced = false, progress } = {}) {
  const id = `lp${Math.random().toString(36).slice(2, 7)}`
  const root = document.createElement('div')
  root.className = 'lp'
  root.setAttribute('role', 'figure')
  root.setAttribute('aria-label', `Self-healing loop: a question becomes a query that passes a safety check, fails at run, diagnoses and fixes itself, then answers with ${ROWS} rows. ${SCORE[0]}: ${SCORE[1]}.`)
  root.dataset.lpTheme = theme || ''
  root.style.visibility = 'hidden'
  root.innerHTML = `<div class="lp-chip" data-chip data-s="ok"><span>✓</span><span>CORRECT</span></div><p class="lp-beat" data-beat></p><p class="lp-cap">${CAPTION}</p><div class="lp-tip" data-tipbox role="presentation"></div>`
  el.replaceChildren(root)
  const chip = root.querySelector('[data-chip]')
  const beat = root.querySelector('[data-beat]')
  const tip = root.querySelector('[data-tipbox]')
  beat.textContent = BEATS[3].text
  ensureStyles(() => { root.style.visibility = '' })

  let L = null
  let svg = null
  let R = null // refs
  let legs = [] // [{ pts, len, p0, p1 }]
  let lastP = -1
  let beatIdx = 3
  let on = false
  let raf = 0
  const q = (s) => svg.querySelector(s)
  const qa = (s) => [...svg.querySelectorAll(s)]

  function sampleLegs() {
    legs = LEG_T.map(([p0, p1], i) => {
      const path = svg.getElementById(`${id}leg${i}`)
      const pts = []
      let len = 0
      try {
        len = path.getTotalLength()
        for (let k = 0; k < PTS_PER_LEG; k += 1) {
          const q = path.getPointAtLength((len * k) / (PTS_PER_LEG - 1))
          pts.push([q.x, q.y])
        }
      } catch {
        pts.push([L.cx, L.cys[0]], [L.cx, L.cys[1]])
        len = Math.abs(L.cys[1] - L.cys[0])
      }
      return { pts, len, p0, p1 }
    })
  }

  function build() {
    const mode = decide()
    if (L && L.mode === mode && svg) return
    L = mode === 'tall' ? layoutTall() : layoutWide()
    const tpl = document.createElement('template')
    tpl.innerHTML = buildSvg(L, id)
    svg?.remove()
    svg = tpl.content.firstElementChild
    root.insertBefore(svg, root.querySelector('.lp-cap'))
    root.dataset.mode = L.mode
    R = {
      pk: q('[data-pk]'), pkBody: q('[data-pk-body]'), pkGloss: q('[data-pk-gloss]'), pkText: q('[data-pk-text]'), pkHalo: q('[data-pk-halo]'),
      ghost: q('[data-ghost]'), tag: q('[data-tag]'), score: q('[data-score]'), rows: q('[data-rows]'), g4: q('.r-guide[data-g4]'),
      loopBase: q('[data-loopbase]'), trail: q('[data-trail]'), glow: q('[data-glow]'), plate4: q('[data-fill4]'),
      err: q('path[data-err]'), ok: q('[data-ok]'),
      litA: q('[data-lit="A"]'), litB: q('[data-lit="B"]'), litC: q('[data-lit="C"]'), litD: q('[data-lit="D"]'),
      halo: [0, 1, 2, 3].map((i) => q(`[data-halo="${i}"]`)),
      st: [1, 2].map((i) => q(`[data-st="${i}"]`)),
      pl: [0, 1, 2, 3].map((i) => q(`[data-pl="${i}"]`)), slab: [0, 1, 2, 3].map((i) => q(`[data-slab="${i}"]`)),
      spikes: qa('[data-spike]'), labels: [0, 1, 2, 3].map((i) => q(`[data-label="${i}"]`)),
      guides: q('[data-guides]'), pills: q('[data-pills]'),
      pillDiag: q('[data-pill="diag"]'), pillFix: q('[data-pill="fix"]'),
      pk0Key: '',
    }
    for (const g of qa('[data-pill]')) { g._lit = g.querySelector('[data-lit]'); g._txt = g.querySelector('[data-lit-txt]') }
    sampleLegs()
    lastP = -1
    bindTips()
  }

  function decide() {
    const w = root.clientWidth, h = root.clientHeight
    return w > 0 && (w < 560 || h > w * 0.95) ? 'tall' : 'wide'
  }

  // ------------------------------------------------------------------------------------------ tooltip
  let tipTimer = 0
  function showTip(text, ev) {
    const r = root.getBoundingClientRect()
    tip.textContent = text
    const x = clamp(ev.clientX - r.left + 14, 0, Math.max(0, r.width - tip.offsetWidth - 4))
    tip.style.left = `${x}px`
    tip.style.top = `${clamp(ev.clientY - r.top - 34, 0, r.height - 24)}px`
    tip.classList.add('on')
  }
  function hideTip() { tip.classList.remove('on') }
  function bindTips() {
    for (const g of qa('.lp-hit')) {
      g.addEventListener('pointerenter', (e) => showTip(g.dataset.tip, e))
      g.addEventListener('pointermove', (e) => showTip(g.dataset.tip, e))
      g.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') hideTip() })
      g.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return
        showTip(g.dataset.tip, e)
        clearTimeout(tipTimer)
        tipTimer = setTimeout(hideTip, 2200)
      })
    }
  }

  // ------------------------------------------------------------------------------------------ render
  const put = (node, k, v) => {
    const c = (node._c ||= {})
    if (c[k] === v) return
    c[k] = v
    if (k === 'text') node.textContent = v
    else node.setAttribute(k, v)
  }
  const op = (node, v) => put(node, 'opacity', String(Math.round(clamp(v) * 100) / 100))

  function legPoint(i, u) {
    const { pts } = legs[i]
    const f = clamp(u) * (pts.length - 1)
    const i0 = Math.min(pts.length - 2, Math.floor(f))
    const t = f - i0
    const a = pts[i0], b = pts[i0 + 1] || a
    return [mix(a[0], b[0], t), mix(a[1], b[1], t)]
  }

  function setPacketLabel(key) {
    if (R.pk0Key === key) return
    R.pk0Key = key
    const text = key === 'q' ? QUESTION : key === 'tools' ? 'tools?' : key === 'stack' ? 'stack' : 'SQL'
    const fs = L.fs.pk
    const h = L.mode === 'wide' ? 26 : 22
    const w = Math.max(54 * (fs / 12.5), cw(text, fs) + 26)
    put(R.pkText, 'text', text)
    put(R.pkBody, 'x', f1(-w / 2)); put(R.pkBody, 'width', f1(w))
    put(R.pkGloss, 'x', f1(-w / 2 + h * 0.4)); put(R.pkGloss, 'width', f1(w - h * 0.8))
    put(R.pkHalo, 'rx', f1(w / 2 + 12)); put(R.pkHalo, 'ry', f1(h / 2 + 9))
  }

  // The loop story keeps its original 0..1 timing; the runway timing maps onto it (error ~0.55, loop 0.62 to 0.8, answer 0.85 to 0.95).
  const KNOTS = [[0.45, 0.05], [0.55, 0.3], [0.62, 0.36], [0.8, 0.62], [0.85, 0.7], [0.95, 0.86], [1, 1]]
  function remap(P) {
    if (P <= KNOTS[0][0]) return 0
    for (let i = 1; i < KNOTS.length; i += 1) {
      if (P <= KNOTS[i][0]) { const [a0, b0] = KNOTS[i - 1], [a1, b1] = KNOTS[i]; return mix(b0, b1, (P - a0) / (a1 - a0)) }
    }
    return 1
  }
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 }
  const DEG = Math.PI / 180

  /** Place the four plates: one tight slab, turning, then exploding apart with a little per-layer yaw (parallax). */
  function placePlates(P) {
    const e = smooth(0.12, 0.3, P)
    const turn = smooth(0, 0.3, P)
    const th0 = mix(14, 45, turn) * DEG + ptr.x * 5 * DEG
    const k = (L.b / L.a) * mix(1.5, 1, turn) + ptr.y * 0.03
    const mid = (L.cys[0] + L.cys[3]) / 2
    const gap0 = L.th + 2
    for (let i = 0; i < 4; i += 1) {
      const cy = mix(mid + (i - 1.5) * gap0, L.cys[i], e)
      const th = th0 + (i - 1.5) * 6 * DEG * Math.sin(Math.PI * e)
      put(R.pl[i], 'transform', mat(L, th, k, cy))
      put(R.slab[i], 'transform', mat(L, th, k, cy, L.th))
      if (i === 2) {
        const c = Math.cos(th), s = Math.sin(th)
        R.spikes.forEach((g, j) => { const sp = L.spikes[j]; put(g, 'transform', `translate(${f1(L.cx + sp.pu * c - sp.pv * s)} ${f1(cy + k * (sp.pu * s + sp.pv * c))})`) })
      }
    }
  }

  function render(P) {
    placePlates(P)
    const late = smooth(0.38, 0.45, P)
    for (let i = 0; i < 4; i += 1) op(R.labels[i], smooth(0.3 + 0.012 * i, 0.34 + 0.012 * i, P))
    op(R.guides, late); op(R.pills, late)
    const chipO = String(Math.round(late * 100) / 100)
    if (chip._o !== chipO) { chip._o = chipO; chip.style.opacity = chipO; beat.style.opacity = chipO }
    const p = remap(P)
    const U = legs.map((l) => smooth(l.p0, l.p1, p))
    let li = 0
    for (let i = 0; i < legs.length; i += 1) if (p >= legs[i].p0) li = i
    const [x0, y0] = legPoint(li, U[li])
    const gone = smooth(0.84, 0.88, p)
    const shake = p > 0.3 && p < 0.345 && !reduced ? Math.sin((p - 0.3) * 900) * 3 * (1 - smooth(0.32, 0.345, p)) : 0
    put(R.pk, 'transform', `translate(${f1(x0 + shake)} ${f1(y0)}) scale(${f1(1 - 0.4 * gone)})`)
    op(R.pk, (1 - gone) * late)

    const key = p < 0.115 ? 'q' : p < 0.43 ? 'sql' : p < 0.53 ? 'tools' : p < 0.62 ? 'stack' : 'sql'
    setPacketLabel(key)
    put(R.pk, 'data-err', p >= 0.3 && p < 0.37 ? '1' : '0')
    op(R.ghost, smooth(0.06, 0.12, p) * 0.9 * late)

    // plate proximity halos
    const visible = (1 - gone) * late
    const side = 1 - smooth(L.a * 0.8, L.a * 1.15, Math.abs(x0 - L.cx))
    for (let i = 0; i < 4; i += 1) {
      const near = (1 - smooth(0, L.b + 22, Math.abs(y0 - L.cys[i]))) * side * visible
      const hush = i === 2 ? 1 - smooth(0.3, 0.32, p) * (1 - smooth(0.66, 0.69, p)) : 1 // the RUN plate keeps its error colour
      op(R.halo[i], (i === 3 ? near * 0.7 : near * 0.85) * hush)
    }

    // statuses
    const a1 = smooth(0.2, 0.22, p), a2 = smooth(0.6, 0.63, p)
    const base = a1 * (1 - 0.65 * smooth(0.38, 0.46, p))
    const passed = base + (1 - base) * a2
    op(R.st[0], passed)
    const err = smooth(0.3, 0.32, p) * (1 - smooth(0.66, 0.69, p))
    const ok = smooth(0.66, 0.7, p)
    op(R.err, err * (1 - 0.3 * smooth(0.33, 0.4, p)))
    op(R.ok, ok)
    const runKey = ok > 0.5 ? 'ok' : err > 0.02 ? 'err' : 'none'
    if (R.st[1]._k !== runKey) {
      R.st[1]._k = runKey
      put(R.st[1], 'text', runKey === 'ok' ? '✓ OK' : runKey === 'err' ? '✕ ERROR' : '')
      R.st[1].setAttribute('class', `lp-st ${runKey === 'err' ? 'err' : runKey === 'ok' ? 'ok' : ''}`)
      R.st[1]._c.opacity = null
    }
    op(R.st[1], runKey === 'ok' ? ok : runKey === 'err' ? err : 0)

    // routes
    const lenA = legs[0].len + legs[1].len + legs[2].len
    const uA = (U[0] * legs[0].len + U[1] * legs[1].len + U[2] * legs[2].len) / lenA
    const lenB = legs[3].len + legs[4].len + legs[5].len
    const uB = (U[3] * legs[3].len + U[4] * legs[4].len + U[5] * legs[5].len) / lenB
    put(R.litA, 'stroke-dashoffset', f1((1 - uA) * 1000) / 1000)
    put(R.litB, 'stroke-dashoffset', f1((1 - uB) * 1000) / 1000)
    put(R.litC, 'stroke-dashoffset', f1((1 - U[6]) * 1000) / 1000)
    put(R.litD, 'stroke-dashoffset', f1((1 - U[7]) * 1000) / 1000)
    op(R.litB, uB > 0 ? 1 : 0); op(R.litC, U[6] > 0 ? 1 : 0); op(R.litD, U[7] > 0 ? 1 : 0)
    op(R.loopBase, mix(0.3, 0.85, smooth(0.33, 0.4, p)) * late)
    put(R.g4, 'class', p >= 0.3 ? 'r-guide dashed' : 'r-guide')
    op(R.trail, smooth(0.86, 1, p) * 0.8)

    // pills
    const dLit = smooth(0.43, 0.47, p), fLit = smooth(0.53, 0.57, p)
    for (const [g, v] of [[R.pillDiag, dLit], [R.pillFix, fLit]]) {
      const keep = p > 0.62 ? Math.max(0.5, v * (1 - smooth(0.62, 0.7, p) * 0.5)) : v
      op(g._lit, keep); op(g._txt, keep)
    }

    // answer
    const lit4 = smooth(0.72, 0.86, p)
    op(R.plate4, 0.16 + 0.84 * lit4)
    op(R.glow, lit4)
    op(R.rows, smooth(0.76, 0.82, p))
    op(R.score, smooth(0.82, 0.88, p))
    op(R.tag, smooth(0.3, 0.33, p) * (1 - 0.25 * smooth(0.64, 0.7, p)))

    // chip + beat
    let bi = 0
    for (let i = 0; i < BEATS.length; i += 1) if (p >= BEATS[i].at) bi = i
    if (bi !== beatIdx) {
      beatIdx = bi
      const B = BEATS[bi]
      chip.dataset.s = B.id
      chip.replaceChildren(Object.assign(document.createElement('span'), { textContent: B.mark }), Object.assign(document.createElement('span'), { textContent: B.title }))
      beat.textContent = B.text
    }
  }

  // ------------------------------------------------------------------------------------------ lifecycle
  function tick() {
    raf = 0
    if (!on) return
    const p = progress ? progress() : 1
    let moved = false
    for (const k of ['x', 'y']) {
      const d = ptr['t' + k] - ptr[k]
      if (Math.abs(d) > 0.002) { ptr[k] += d * 0.12; moved = true } else if (d) ptr[k] = ptr['t' + k]
    }
    if (moved || Math.abs(p - lastP) > 1e-4) { lastP = p; render(p) }
    raf = requestAnimationFrame(tick)
  }
  function setOn(v) {
    if (on === v) return
    on = v
    if (on && !raf && !reduced) raf = requestAnimationFrame(tick)
  }

  build()
  render(reduced ? 1 : 0)

  let io = null
  let ro = null
  if (!reduced) {
    io = new IntersectionObserver((entries) => { for (const e of entries) setOn(e.isIntersecting) }, { rootMargin: '10% 0px' })
    io.observe(root)
  }
  if (!reduced) {
    root.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return
      const r = root.getBoundingClientRect()
      ptr.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1)
      ptr.ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1)
    })
    root.addEventListener('pointerleave', () => { ptr.tx = 0; ptr.ty = 0 })
  }
  ro = new ResizeObserver(() => {
    const before = L?.mode
    build()
    if (L.mode !== before) { beatIdx = -1; lastP = -1; render(reduced ? 1 : progress ? progress() : 0) }
  })
  ro.observe(root)

  return {
    setTheme(t) { root.dataset.lpTheme = t || '' }, // colours are page tokens (html[data-theme]), nothing cached to re-read
    dispose() {
      on = false
      cancelAnimationFrame(raf)
      io?.disconnect()
      ro?.disconnect()
      clearTimeout(tipTimer)
      root.remove()
    },
  }
}
