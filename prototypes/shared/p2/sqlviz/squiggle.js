/**
 * ?sql=squiggle "Red Squiggle" (default): an LCD-style live query editor. The question types its own SQL, the SQL
 * fails with a red spellcheck squiggle under a wrong column name, and the repair is shown as a git diff before the
 * result rows and the 9 / 10 to 10 / 10 score land. DOM + CSS only (about 40 nodes); the loop only runs while the
 * section is on screen and only writes a CSS variable or attribute when its derived value changes.
 *
 * The CSS defaults ARE the end state, so the DOM built here already reads as the finished frame (reduced motion
 * stops there); the animated path rewinds it to p = 0 straight away.
 * Facts (9 / 10, 10 / 10, project titles and stacks) come from shared/content.js; the SQL is illustrative.
 */
import { projects } from '../../content.js'

const CSS_HREF = new URL('./squiggle.css', import.meta.url).href

function ensureStyles() {
  if (!document.querySelector('link[data-squiggle-css]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = CSS_HREF
    link.dataset.squiggleCss = ''
    document.head.append(link)
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const ramp = (a, b, p) => clamp((p - a) / (b - a))

// ---- copy -------------------------------------------------------------------------------------------------------
const QUESTION = 'Which projects use DuckDB?'
const agent = projects.find((p) => p.id === 'sql-agent')
const [firstFact, healedFact] = agent.facts // ['Correct, first attempt', '9 / 10'], ['Correct, after self-healing', '10 / 10']
const SCORE_FIRST = Number.parseInt(firstFact[1], 10) // 9
const SCORE_TOTAL = Number.parseInt(healedFact[1].split('/')[1], 10) // 10
const hits = projects.filter((p) => p.stack.includes('DuckDB')) // every project lists DuckDB, so "All of them" is true
const COUNT_TEXT = `${hits.length} rows.${hits.length === projects.length ? ' All of them.' : ''}`

// [class, text] runs per code line; the typed width is derived from the text so it never drifts
const PRE = 'WHERE list_contains('
const POST = [['', ', '], ['s', "'DuckDB'"], ['', ');']]
const LINES = [
  [['k', 'SELECT'], ['', ' title']],
  [['k', 'FROM'], ['', ' projects']],
  [['k', 'WHERE'], ['', ' list_contains('], ['bad', 'tools'], ...POST],
]
const lens = LINES.map((runs) => runs.reduce((n, [, t]) => n + t.length, 0))
const TOTAL = lens[0] + lens[1] + lens[2]
const COL = PRE.length // column of the wrong token
const NEW = 'stack'

const runsHtml = (runs) => runs.map(([c, t]) => (c ? `<span class="sq-${c}">${esc(t)}</span>` : esc(t))).join('')

function build() {
  const root = document.createElement('figure')
  root.className = 'sq'
  root.dataset.theme = 'dark'
  root.setAttribute('role', 'figure')
  root.setAttribute(
    'aria-label',
    `Illustration of a self-healing query. Question: ${QUESTION} The first query failed because the column tools does not exist. ` +
      `The agent diagnosed it, changed tools to stack, and the query returned ${hits.length} rows, ` +
      `${hits.length === projects.length ? 'all of the projects. ' : ''}${firstFact[0]} ${firstFact[1].replace('/', 'of')}, ` +
      `${healedFact[0]} ${healedFact[1].replace('/', 'of')}.`,
  )
  const pips = Array.from({ length: SCORE_TOTAL }, () => '<i class="sq-pip"></i>').join('')
  const rows = hits
    .map((p) => {
      const stack = p.stack.map((s) => (s === 'DuckDB' ? `<b>${esc(s)}</b>` : esc(s))).join(', ')
      return `<li tabindex="0"><span class="sq-rt">${esc(p.title)}</span><span class="sq-rs">${stack}</span></li>`
    })
    .join('')
  root.innerHTML =
    `<div class="sq-box"><div class="sq-glow"></div><div class="sq-panel">` +
    `<span class="sq-tick"></span><span class="sq-tick"></span><span class="sq-tick"></span><span class="sq-tick"></span>` +
    `<header class="sq-head"><span>QUERY.SQL</span><span class="sq-chip">✓ CORRECT</span></header>` +
    `<p class="sq-q">${esc(QUESTION)}</p>` +
    `<div class="sq-code">` +
    `<div class="sq-l sq-l1"><span class="sq-w">${runsHtml(LINES[0])}</span></div>` +
    `<div class="sq-l sq-l2"><span class="sq-w">${runsHtml(LINES[1])}</span></div>` +
    `<div class="sq-hunk" aria-hidden="true">@@ -3 +3 @@</div>` +
    `<div class="sq-l sq-l3"><span class="sq-g">-</span><span class="sq-w">${runsHtml(LINES[2])}</span>` +
    `<svg class="sq-sqg" viewBox="0 0 40 6" preserveAspectRatio="none" aria-hidden="true"><path pathLength="100" d=""/></svg></div>` +
    `<div class="sq-car" aria-hidden="true">^^^^^</div>` +
    `<div class="sq-l sq-l5"><span class="sq-g">+</span><span class="sq-k">WHERE</span> list_contains(<span class="sq-new">${NEW}</span>${runsHtml(POST)}</div>` +
    `<div class="sq-safe">SAFETY CHECK ✓</div>` +
    `</div>` +
    `<div class="sq-diag"><p class="sq-d1"><b>✕ ERROR</b>  <span>Binder Error: column "tools" not found</span></p>` +
    `<p class="sq-d2">help: Candidate: <b>"${NEW}"</b></p></div>` +
    `<ol class="sq-res">${rows}</ol>` +
    `<p class="sq-count">${esc(COUNT_TEXT)}</p>` +
    `<div class="sq-score"><div class="sq-sc-row"><span class="sq-sc-lab">${esc(healedFact[0])}</span><span class="sq-sc-num">${esc(healedFact[1])}</span></div>` +
    `<div class="sq-pips">${pips}</div></div>` +
    `</div></div>` +
    `<figcaption class="sq-cap">Illustration: a query on this page’s own content. Scores are from the project’s test set.</figcaption>`
  // sine path: amplitude 2px, period 4px (quadratic segments mirrored by T)
  let d = 'M0 3Q1 1 2 3'
  for (let x = 4; x <= 40; x += 2) d += `T${x} 3`
  root.querySelector('.sq-sqg path').setAttribute('d', d)
  return root
}

export function mount(el, { runway, theme, reduced, progress }) {
  ensureStyles()
  const root = build()
  root.dataset.theme = theme === 'light' ? 'light' : 'dark'
  el.replaceChildren(root)

  const chip = root.querySelector('.sq-chip')
  const pip = root.querySelector('.sq-pip:last-child')
  const lab = root.querySelector('.sq-sc-lab')
  const num = root.querySelector('.sq-sc-num')

  root.querySelectorAll('.sq-res li').forEach((li) => li.addEventListener('click', () => { li.toggleAttribute('data-open') }))

  // ---- change-only writers ----
  const cache = new Map()
  const v = (name, value) => {
    if (cache.get(name) !== value) { cache.set(name, value); root.style.setProperty(name, String(value)) }
  }
  const attr = (node, name, value) => {
    const key = node.className + name
    if (cache.get(key) !== value) {
      cache.set(key, value)
      value == null ? node.removeAttribute(name) : node.setAttribute(name, value)
    }
  }
  const text = (node, value) => {
    const key = node.className
    if (cache.get(key) !== value) { cache.set(key, value); node.textContent = value }
  }
  const STATUS = {
    ready: '● READY',
    run: '● RUNNING',
    err: '✕ ERROR',
    heal: '↻ SELF-HEALING',
    ok: '✓ CORRECT',
  }

  /** Map progress 0..1 to every beat. The numbers are the scroll story (the whole thing fits the 100vh runway). */
  function render(p) {
    // typing: one step per character, lines in order
    const k = Math.round(ramp(0.04, 0.22, p) * TOTAL)
    v('--n1', Math.min(k, lens[0]))
    v('--n2', clamp(k - lens[0], 0, lens[1]))
    v('--n3', clamp(k - lens[0] - lens[1], 0, lens[2]))
    // status chip
    const st = p < 0.04 ? 'ready' : p < 0.28 ? 'run' : p < 0.46 ? 'err' : p < 0.68 ? 'heal' : 'ok'
    attr(chip, 'data-s', st === 'ok' ? null : st)
    text(chip, STATUS[st])
    // safety check chip: after the first typing, gone while the error is diagnosed, back after the repair
    v('--safe', (p >= 0.22 && p < 0.46) || p >= 0.62 ? 1 : 0)
    // the error beat
    v('--sq', Math.round(ramp(0.28, 0.34, p) * 24) / 24)
    v('--sqo', p >= 0.28 && p < 0.46 ? 1 : 0)
    v('--err', p >= 0.28 && p < 0.46 ? 1 : 0)
    attr(pip, 'data-k', p < 0.28 ? 'o' : p < 0.84 ? 'e' : null)
    v('--d1', p >= 0.34 ? 1 : 0)
    v('--car', p >= 0.38 && p < 0.46 ? 1 : 0)
    v('--d2', p >= 0.42 ? 1 : 0)
    // the heal as a diff
    v('--slide', p >= 0.46 ? 1 : 0)
    v('--minus', p >= 0.46 ? 1 : 0)
    v('--hunk', p >= 0.5 ? 1 : 0)
    v('--plus', p >= 0.52 ? 1 : 0)
    v('--m', Math.round(ramp(0.54, 0.6, p) * NEW.length))
    // the result
    v('--dim', p >= 0.68 ? 0.4 : 1)
    for (let i = 0; i < 4; i++) v(`--r${i + 1}`, p >= 0.7 + i * 0.03 ? 1 : 0)
    v('--cnt', p >= 0.82 ? 1 : 0)
    // the score: 9 / 10 becomes 10 / 10
    const healed = p >= 0.84
    text(lab, healed ? healedFact[0] : firstFact[0])
    const step = p < 0.86 ? 0 : p < 0.88 ? 1 : 2
    v('--flip', step === 1 ? 0.08 : 1)
    text(num, step === 2 ? healedFact[1] : firstFact[1])
  }

  let raf = 0
  let io = null
  const handle = {
    setTheme(t) { root.dataset.theme = t === 'light' ? 'light' : 'dark' },
    dispose() {
      stop()
      io?.disconnect()
      root.remove()
    },
  }

  if (reduced || !progress) return handle // the end state is already in the DOM as text

  const tick = () => {
    render(progress())
    raf = requestAnimationFrame(tick)
  }
  function start() { if (!raf) raf = requestAnimationFrame(tick) }
  function stop() { cancelAnimationFrame(raf); raf = 0 }

  render(0) // rewind the finished frame to the opening one
  const section = runway ?? el
  io = new IntersectionObserver((entries) => {
    for (const e of entries) (e.isIntersecting ? start : stop)()
  })
  io.observe(section)
  return handle
}
