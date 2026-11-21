/**
 * ?sep=ascii  "Flow field": a character-cell wave (real monospace text, no canvas) swells, then flattens and settles
 * left to right into a single rule that carries the next section's name. Motion is a pure function of the slot's scroll
 * progress t (under 100vh of scroll). Reduced motion renders the settled line.
 */
import { sections } from '../../content.js'
import { clamp, ease, useCss, drive, cellWidth } from './sepkit.js'

const NEXT = { 1: 'projects', 2: 'experience' }
const RAMP = ' .:-=+*#'
const ROWS = 7

export function mount(el, { slot, reduced }) {
  useCss(new URL('./ascii.css', import.meta.url).href, 'ascii-css')
  const label = sections.find((s) => s.id === NEXT[slot])?.label.toLowerCase() ?? ''
  el.classList.add('sep-ascii')
  const pre = document.createElement('pre')
  pre.className = 'as-pre'
  el.replaceChildren(pre)
  let cw = 0, lastW = 0

  const stop = drive(el, reduced, (t, W) => {
    if (!cw || W !== lastW) { cw = cellWidth(pre); lastW = W }
    const cols = Math.max(12, Math.floor(W / cw))
    pre.style.paddingLeft = `${Math.max(0, (W - cols * cw) / 2)}px`
    const c = (ROWS - 1) / 2
    const swell = ease(t / 0.22)
    const tight = ease((t - 0.42) / 0.5)
    const amp = (ROWS * 0.36) * swell * (1 - tight)
    const phase = t * 10
    const sigma = 0.9 * (1 - tight) + 0.08
    const text = ` ${label} `
    const lab0 = Math.floor((cols - text.length) / 2)
    const showLab = tight > 0.85
    const out = []
    for (let r = 0; r < ROWS; r += 1) {
      let s = ''
      for (let x = 0; x < cols; x += 1) {
        if (r === c && tight >= 0.55 + 0.4 * (x / cols)) { s += '─'; continue }
        const h = amp * (Math.sin(x * 0.17 + phase) + 0.5 * Math.sin(x * 0.07 - phase * 0.6)) / 1.5
        const d = r - c - h
        const v = Math.exp((-d * d) / sigma)
        s += v < 0.12 ? ' ' : RAMP[Math.min(RAMP.length - 1, Math.floor(v * (RAMP.length - 0.01)))]
      }
      if (r === c) {
        const a = s.slice(0, lab0), b = s.slice(lab0 + text.length)
        s = showLab ? `<i>${a}</i><b>${text}</b><i>${b}</i>` : `<i>${s}</i>`
      }
      out.push(s)
    }
    pre.style.setProperty('--lp', ease((tight - 0.85) / 0.15).toFixed(2))
    pre.innerHTML = out.join('\n')
  })
  return () => { stop(); pre.remove(); el.classList.remove('sep-ascii') }
}
