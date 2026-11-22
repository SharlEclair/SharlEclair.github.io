/**
 * ?sep=columnar-pivot  "Row store to column store" (a nod to Parquet). A small table of real records shows in the band,
 * one record per row (slot 1: project, year, stack; slot 2: role, org, dates). As you scroll, every cell tumbles in 3D
 * to its transposed position: the records become columns, each column's values stored together with its header leading
 * the run. Then the cells flatten onto one thin rule that carries the next section's name. Under 640px the 3D turn is
 * dropped for a flat slide and the last field is left out.
 *
 * Pure CSS scroll-driven, in the style of twist: one registered property, --p, runs 0 to 1 over `entry 0% cover 50%`
 * (under 100vh of scroll) and every cell derives its own eased progress from it with calc(). Browsers without scroll
 * timelines and reduced-motion users get the end state, the rule. This module only builds the cells and their
 * start and end positions as custom properties.
 */
import { sections, projects, work } from '../../content.js'
import { useCss } from './sepkit.js'

const NEXT = { 1: 'projects', 2: 'experience' }
const DATA = {
  1: {
    fields: ['project', 'year', 'stack'],
    rows: () => projects.map((p) => [p.title, p.year, `${p.stack[0]} +${p.stack.length - 1}`]),
    desk: { show: [0, 1, 2], rowW: [0.4, 0.14, 0.46], hw: 0.13 },
    mob: { show: [0, 1], rowW: [0.66, 0.34], hw: 0.17 },
  },
  2: {
    fields: ['role', 'org', 'dates'],
    rows: () => work.map((w) => [w.role, w.org, w.dates]),
    desk: { show: [0, 1, 2], rowW: [0.36, 0.3, 0.34], hw: 0.13 },
    mob: { show: [0, 2], rowW: [0.56, 0.44], hw: 0.17 },
  },
}

/** Start (row store) and end (column store) boxes for one layout, as fractions of the stage width and row indexes. */
function geometry(cfg, n) {
  const k = cfg.show.length
  const R = Math.max(n + 1, k)
  const rowX = cfg.rowW.map((_, j) => cfg.rowW.slice(0, j).reduce((a, b) => a + b, 0))
  const vw = (1 - cfg.hw) / n
  const top0 = (R - (n + 1)) / 2, top1 = (R - k) / 2
  const box = (f, rec) => {
    const j = cfg.show.indexOf(f)
    if (j < 0) return { x0: 0, w0: 0, r0: 0, x1: 0, w1: 0, r1: 0 }
    return rec < 0
      ? { x0: rowX[j], w0: cfg.rowW[j], r0: top0, x1: 0, w1: cfg.hw, r1: top1 + j }
      : { x0: rowX[j], w0: cfg.rowW[j], r0: top0 + 1 + rec, x1: cfg.hw + rec * vw, w1: vw, r1: top1 + j }
  }
  return { R, cr: (R - 1) / 2, box }
}

const vars = (prefix, b) => `--${prefix}x0:${b.x0.toFixed(4)};--${prefix}w0:${b.w0.toFixed(4)};--${prefix}r0:${b.r0};--${prefix}x1:${b.x1.toFixed(4)};--${prefix}w1:${b.w1.toFixed(4)};--${prefix}r1:${b.r1}`

export function mount(el, { slot }) {
  useCss(new URL('./columnar-pivot.css', import.meta.url).href, 'columnar-pivot-css')
  const next = sections.find((s) => s.id === NEXT[slot])?.label ?? ''
  const spec = DATA[slot]
  const rows = spec.rows()
  const n = rows.length
  const desk = geometry(spec.desk, n), mob = geometry(spec.mob, n)
  el.classList.add('sep-colpiv')
  el.style.cssText = `--dR:${desk.R};--dcr:${desk.cr};--mR:${mob.R};--mcr:${mob.cr}`

  const stage = document.createElement('div')
  stage.className = 'cp-stage'
  const add = (f, rec, text) => {
    const c = document.createElement('i')
    c.className = `cp-c f${f}${rec < 0 ? ' h' : ''}${spec.mob.show.includes(f) ? '' : ' nm'}`
    const d = Math.max(0, rec) * 0.035 + f * 0.015 + (rec < 0 ? 0 : 0.01)
    c.style.cssText = `--d:${d.toFixed(3)};${vars('d', desk.box(f, rec))};${vars('m', mob.box(f, rec))}`
    const t = document.createElement('span')
    t.textContent = text
    c.append(t)
    stage.append(c)
  }
  spec.fields.forEach((name, f) => add(f, -1, name))
  rows.forEach((row, i) => row.forEach((text, f) => add(f, i, text)))

  const label = document.createElement('span')
  label.className = 'cp-label'
  label.textContent = next
  el.replaceChildren(stage, label)
  return () => { stage.remove(); label.remove(); el.classList.remove('sep-colpiv'); el.style.cssText = '' }
}
