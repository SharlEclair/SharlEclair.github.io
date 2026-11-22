/**
 * ?sep=save-file  "Save file": a retro save screen. The file for the section above fills a pixel progress bar, the floppy
 * icon blinks once, a SAVED stamp lands, then the list scrolls up under a fixed pixel caret so the next file is selected;
 * the window then collapses into a thin rule carrying that file's line. A pure function of the slot's scroll progress
 * (under 100vh). Reduced motion: the rule with the selected file.
 */
import { sections, projects, work, person } from '../../content.js'
import { clamp, ease, useCss, drive } from './sepkit.js'

const ORDER = ['approach', 'projects', 'experience', 'contact']
const places = [...new Set(work.map((w) => w.place))].join(' and ')
const META = {
  projects: [`${projects.length} projects`, ''],
  experience: [`${work.length} roles`, `, ${places}`],
  contact: [person.location, ''],
}
const FLOPPY = '<svg class="sf-ico" viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true">'
  + '<path d="M1 1h12l2 2v12H1z"/><path class="k" d="M4 1h7v5H4z"/><path d="M8 2h2v3H8z"/>'
  + '<path class="k" d="M3 9h10v6H3z"/><path d="M4 11h8v1H4zM4 13h6v1H4z"/></svg>'
const CARET = '<svg class="sf-caret" viewBox="0 0 3 5" width="6" height="10" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h1v5H0zM1 1h1v3H1zM2 2h1v1H2z"/></svg>'

export function mount(el, { slot, reduced }) {
  useCss(new URL('./save-file.css', import.meta.url).href, 'save-file-css')
  const ids = ORDER.slice(slot - 1, slot + 2)
  const label = (id) => sections.find((s) => s.id === id)?.label ?? ''
  const fileNo = (id) => `FILE ${ORDER.indexOf(id) + 1}`

  el.classList.add('sep-sf')
  const rows = ids.map((id, i) => {
    const [meta, more] = META[id] ?? ['', '']
    const right = i === 0
      ? '<span class="sf-bar"><i class="sf-fill"></i></span><span class="sf-stamp">SAVED</span>'
      : `<span class="sf-r">${meta}<span class="sf-pl">${more}</span></span>`
    return `<div class="sf-row"><b class="sf-n">${fileNo(id)}</b><span class="sf-t">${label(id)}</span><i class="sf-lead"></i>${right}</div>`
  })
  el.innerHTML = '<div class="sf-rule"></div><div class="sf-win">'
    + `<div class="sf-head">${FLOPPY}<span class="sf-h">Save data</span><span class="sf-pct">0%</span></div>`
    + `<div class="sf-view"><div class="sf-band"></div><div class="sf-list">${rows.join('')}</div>${CARET}</div></div>`
  const q = (s) => el.querySelector(s)
  const rowEls = [...el.querySelectorAll('.sf-row')]
  const ico = q('.sf-ico'), pct = q('.sf-pct'), stamp = q('.sf-stamp'), rule = q('.sf-rule')
  let lastPct = ''

  const stop = drive(el, reduced, (t) => {
    const u = clamp((t - 0.2) / 0.8)
    const cells = innerWidth <= 640 ? 12 : 20
    const fill = clamp((u - 0.06) / 0.42)
    const n = Math.floor(fill * cells + 1e-6)
    const o = ease((u - 0.7) / 0.16)
    const c = ease((u - 0.86) / 0.14)
    const s = clamp((u - 0.56) / 0.08)
    el.style.setProperty('--cells', cells)
    el.style.setProperty('--n', n)
    el.style.setProperty('--o', o.toFixed(4))
    el.style.setProperty('--c', c.toFixed(4))
    rowEls.forEach((r, i) => r.style.setProperty('--w', clamp(1 - Math.abs(i - o)).toFixed(3)))
    const p = `${Math.round(fill * 100)}%`
    if (p !== lastPct) { pct.textContent = p; lastPct = p }
    ico.style.opacity = u > 0.5 && u < 0.545 ? '0.18' : '1'
    stamp.style.opacity = String(clamp(s * 4) * (1 - clamp(o * 2.5)))
    stamp.style.transform = `translateY(-50%) rotate(-6deg) scale(${(1 + 0.7 * (1 - ease(s))).toFixed(3)})`
    rule.style.transform = `scaleX(${c.toFixed(4)})`
  })
  return () => { stop(); el.replaceChildren(); el.classList.remove('sep-sf') }
}
