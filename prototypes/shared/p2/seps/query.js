/**
 * ?sep=query  "Self-Healing Query": the SQL agent's loop in five mono lines (query with a typo, error, self-diagnosis,
 * fixed query, result). Pure CSS scroll-driven: every line animates over `entry 50% cover 50%` of the band (50vh of
 * scroll). Keyframes are generated here because percentages cannot use var() and typing needs one step per character.
 * Counts come from content.js so the copy stays true.
 */
import { projects, work } from '../../content.js'

const CSS_HREF = new URL('./query.css', import.meta.url).href

// [typed?, start%, end%] per line; instant lines use start only
const TIMING = [
  { typed: true, a: 0, b: 25 },
  { at: 30 },
  { at: 42 },
  { typed: true, a: 50, b: 78 },
  { at: 88 },
]

const places = [...new Set(work.map((w) => w.place))]

function copy(slot) {
  if (slot === 1) {
    const n = projects.length
    return [
      [['p', '> '], ['t', 'SELECT title FROM '], ['x', 'projcts'], ['t', ';']],
      [['m', '  '], ['m', 'ERROR  '], ['m', 'no table "projcts"']],
      [['m', '  '], ['a', 'HEAL   '], ['t', 'did you mean projects?']],
      [['p', '> '], ['t', 'SELECT title FROM projects;']],
      [['t', `  ${n} rows`]],
    ]
  }
  return [
    [['p', '> '], ['t', 'SELECT role, place '], ['x', 'FORM'], ['t', ' work;']],
    [['m', '  '], ['m', 'ERROR  '], ['m', 'syntax error at "FORM"']],
    [['m', '  '], ['a', 'HEAL   '], ['t', 'FORM is not FROM. retrying']],
    [['p', '> '], ['t', 'SELECT role, place FROM work;']],
    [['t', `  ${work.length} rows: ${places.join(', ')}`]],
  ]
}

function ensureStyles() {
  if (!document.querySelector('link[data-query-css]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = CSS_HREF
    link.dataset.queryCss = ''
    document.head.append(link)
  }
}

let keyframesFor = new Set()
function ensureKeyframes(lines) {
  const css = []
  lines.forEach((chars, i) => {
    const t = TIMING[i]
    const name = `q-l${i + 1}-${chars}`
    if (keyframesFor.has(name)) return
    keyframesFor.add(name)
    if (t.typed) {
      css.push(
        `@keyframes ${name}{` +
          `0%{clip-path:inset(0 100% 0 0);animation-timing-function:steps(1,end)}` +
          `${t.a}%{clip-path:inset(0 100% 0 0);animation-timing-function:steps(${chars},end)}` +
          `${t.b}%,100%{clip-path:inset(0 0 0 0)}}`,
      )
    } else {
      css.push(
        `@keyframes ${name}{0%{opacity:0;animation-timing-function:steps(1,end)}` +
          `${t.at}%,100%{opacity:1}}`,
      )
    }
  })
  if (i4caret) css.push(i4caret)
  if (!css.length) return
  const style = document.createElement('style')
  style.dataset.queryKf = ''
  style.textContent = css.join('\n')
  document.head.append(style)
}
// caret appears once line 4 is fully typed (78%)
const i4caret = '@keyframes q-caret-on{0%{opacity:0;animation-timing-function:steps(1,end)}78%,100%{opacity:1}}'

export function mount(el, { slot }) {
  ensureStyles()
  const rows = copy(slot)
  const counts = rows.map((parts) => parts.reduce((n, [, s]) => n + s.length, 0))
  const names = counts.map((c, i) => `q-l${i + 1}-${c}`)
  ensureKeyframes(counts)

  const band = document.createElement('div')
  band.className = 'q-band'
  rows.forEach((parts, i) => {
    const line = document.createElement('span')
    line.className = `ql ql${i + 1}`
    line.style.setProperty('--q-anim', names[i])
    const text = document.createElement('span')
    text.className = 'qt'
    for (const [kind, s] of parts) {
      const part = document.createElement('span')
      part.className = `q-${kind}`
      part.textContent = s
      text.append(part)
    }
    line.append(text)
    band.append(line)
  })
  el.replaceChildren(band)
  return () => band.remove()
}
