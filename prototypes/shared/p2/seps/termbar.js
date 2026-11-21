/**
 * ?sep=termbar  "Progress": a terminal line opens the next section. A bar of block characters fills with the scroll
 * (counting its way through the real number of projects, or roles), then the cells collapse left to right into a thin
 * rule. Real monospace text, a pure function of the slot's scroll progress t (under 100vh). Reduced motion: the rule.
 */
import { sections, projects, work } from '../../content.js'
import { ease, useCss, drive, cellWidth } from './sepkit.js'

const NEXT = { 1: 'projects', 2: 'experience' }
const UNIT = { 1: ['projects', projects.length], 2: ['roles', work.length] }
const EIGHTHS = ' ▏▎▍▌▋▊▉'

const run = (cls, s) => (s ? `<${cls}>${s}</${cls}>` : '')

export function mount(el, { slot, reduced }) {
  useCss(new URL('./termbar.css', import.meta.url).href, 'termbar-css')
  const label = sections.find((s) => s.id === NEXT[slot])?.label.toLowerCase() ?? ''
  const [unit, total] = UNIT[slot]
  el.classList.add('sep-termbar')
  const pre = document.createElement('pre')
  pre.className = 'tb-pre'
  el.replaceChildren(pre)
  let cw = 0, lastW = 0

  const stop = drive(el, reduced, (t, W) => {
    if (!cw || W !== lastW) {
      cw = cellWidth(pre); lastW = W
      // fallback fonts draw block and rule glyphs at a slightly different width: pad them to exactly one cell
      for (const [k, ch] of [['b', '█'], ['u', '─'], ['em', '·']]) pre.style.setProperty(`--ls-${k}`, `${(cw - cellWidth(pre, ch)).toFixed(3)}px`)
    }
    const total_cols = Math.max(16, Math.floor(W / cw))
    const head = `$ open ${label}`
    const fill = ease(t / 0.55)
    const n = Math.round(fill * total)
    const tail = ` ${n}/${total} ${unit}`
    const prefix = '> '
    const cells = Math.max(8, total_cols - prefix.length - tail.length - 2 * 2)
    const sweep = ease((t - 0.62) / 0.33) * (cells + 6)
    const filled = fill * cells
    let bar = '', mode = '', buf = ''
    const flush = () => { if (buf) bar += run(mode, buf); buf = '' }
    for (let x = 0; x < cells; x += 1) {
      let m, ch
      if (x < sweep) { m = 'u'; ch = '─' }
      else if (x + 1 <= filled) { m = 'b'; ch = '█' }
      else if (x < filled) { m = 'b'; ch = EIGHTHS[Math.round((filled - x) * 7)] || ' ' }
      else { m = 'em'; ch = '·' }
      if (m !== mode) { flush(); mode = m }
      buf += ch
    }
    flush()
    pre.style.paddingLeft = `${Math.max(0, (W - total_cols * cw) / 2)}px`
    pre.innerHTML = `${run('i', head)}\n${run('i', prefix)}${bar}${run('s', tail)}`
  })
  return () => { stop(); pre.remove(); el.classList.remove('sep-termbar') }
}
