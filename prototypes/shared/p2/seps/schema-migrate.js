/**
 * ?sep=schema-migrate  "Migration": the table above (approach.v1) runs a scripted schema migration as you scroll. A
 * column renames, one is added, a type tag flips (TEXT to PROJECT[]), and the table settles as projects.v2; the
 * ALTER TABLE line types in step with each change. The grid is DOM cells on exact monospace columns, every transform
 * computed per frame from the slot's scroll progress t (under 100vh). In the end the header and type rows collapse into
 * one hairline that carries the new table name. Reduced motion: the final rule. Phones keep two columns.
 */
import { sections } from '../../content.js'
import { clamp, ease, useCss, drive, cellWidth } from './sepkit.js'

const NEXT = { 1: 'projects', 2: 'experience' }
const PREV = { 1: 'approach', 2: 'projects' }
const START = 0.08, END = 0.8, SETTLE = 0.82

/** Columns reference ops by id: nOp renames, tOp flips the type tag, addOp adds the column. `wide` = hidden on phones. */
const PLAN = {
  1: {
    ops: (t) => [
      { id: 'rn', cmd: `ALTER TABLE ${t} RENAME step TO title;` },
      { id: 'add', cmd: `ALTER TABLE ${t} ADD year INT;`, wide: true },
      { id: 'ty', cmd: `ALTER TABLE ${t} ALTER tool TYPE PROJECT[];` },
    ],
    cols: [
      { n0: 'step', n1: 'title', t0: 'TEXT', t1: 'TEXT', nOp: 'rn' },
      { n0: 'tool', n1: 'tool', t0: 'TEXT', t1: 'PROJECT[]', tOp: 'ty' },
      { n0: 'why', n1: 'why', t0: 'TEXT', t1: 'TEXT', wide: true },
      { n0: 'year', n1: 'year', t0: 'INT', t1: 'INT', addOp: 'add', wide: true },
    ],
  },
  2: {
    ops: (t) => [
      { id: 'rn', cmd: `ALTER TABLE ${t} RENAME title TO role;` },
      { id: 'add', cmd: `ALTER TABLE ${t} ADD org TEXT;`, wide: true },
      { id: 'ty', cmd: `ALTER TABLE ${t} ALTER tool TYPE ROLE[];` },
    ],
    cols: [
      { n0: 'title', n1: 'role', t0: 'TEXT', t1: 'TEXT', nOp: 'rn' },
      { n0: 'tool', n1: 'tool', t0: 'PROJECT[]', t1: 'ROLE[]', tOp: 'ty' },
      { n0: 'why', n1: 'why', t0: 'TEXT', t1: 'TEXT', wide: true },
      { n0: 'year', n1: 'year', t0: 'INT', t1: 'INT', wide: true },
      { n0: 'org', n1: 'org', t0: 'TEXT', t1: 'TEXT', addOp: 'add', wide: true },
    ],
  },
}

const div = (cls) => { const e = document.createElement('div'); e.className = cls; return e }
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** Overwrites a with b left to right; the character being written is marked while 0 < c < 1. */
function morph(a, b, c) {
  const len = Math.max(a.length, b.length)
  const n = Math.round(c * len)
  if (c <= 0 || a === b) return esc(a === b ? b : a)
  if (c >= 1) return esc(b)
  const s = b.slice(0, n) + a.slice(n)
  const at = Math.max(0, n - 1)
  return `${esc(s.slice(0, at))}<mark>${esc(s[at] ?? ' ')}</mark>${esc(s.slice(at + 1))}`
}

export function mount(el, { slot, reduced }) {
  useCss(new URL('./schema-migrate.css', import.meta.url).href, 'schema-migrate-css')
  const plan = PLAN[slot]
  const fromT = `${PREV[slot]}.v${slot}`
  const toT = `${NEXT[slot]}.v${slot + 1}`
  const nextLabel = sections.find((s) => s.id === NEXT[slot])?.label
  if (!plan || !nextLabel) return

  el.classList.add('sep-schema')
  const block = div('sm-block')
  const cmd = div('sm-cmd')
  const title = div('sm-title')
  const tspan = document.createElement('span')
  title.append(tspan)
  const rt = div('sm-rule'), rb = div('sm-rule'), grid = div('sm-grid')
  block.append(cmd, title, rt, grid, rb)
  el.replaceChildren(block)
  const mq = matchMedia('(max-width: 640px)')

  let st = null, cw = 0, lastW = 0, lastH = 0, lastCmd = null, lastTitle = null
  document.fonts?.ready.then(() => { cw = 0 })

  function build(mobile, W) {
    const ops = plan.ops(PREV[slot]).filter((o) => !(mobile && o.wide))
    ops.push({ id: 'tb', cmd: `ALTER TABLE ${PREV[slot]} RENAME TO ${toT};` })
    const cols = plan.cols.filter((c) => !(mobile && c.wide)).map((c) => {
      const e = div('sm-col'), nm = document.createElement('span'), ty = document.createElement('span')
      nm.className = 'nm'; ty.className = 'ty'
      e.append(nm, ty)
      return { ...c, e, nm, ty, ln: null, lt: null }
    })
    grid.replaceChildren(...cols.map((c) => c.e))
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0
    const avail = W - 2 * pad
    const maxCols = cols.length
    const cc = clamp(Math.floor(avail / (maxCols * cw)), 12, 26)
    const mid = (n) => n.offsetTop + n.offsetHeight / 2
    const top = block.offsetTop
    st = {
      mobile, ops, cols, cc, pad,
      cy: { cmd: top + mid(cmd), title: top + mid(title), rt: top + mid(rt), grid: top + mid(grid), rb: top + mid(rb) },
    }
    lastCmd = lastTitle = null
  }

  const stop = drive(el, reduced, (t, W, H) => {
    const mobile = mq.matches
    if (!cw || W !== lastW || H !== lastH || !st || st.mobile !== mobile) {
      cw = cellWidth(block); lastW = W; lastH = H
      build(mobile, W)
    }
    const { ops, cols, cc, pad, cy } = st
    const n = ops.length, len = (END - START) / n
    const idx = Object.fromEntries(ops.map((o, i) => [o.id, i]))
    const pr = ops.map((_, i) => {
      const s = START + i * len, u = (t - s) / len
      const done = s + len * 0.95
      const hot = t < s + len * 0.45 ? 0 : t < done ? 1 : clamp(1 - (t - done) / 0.1)
      return { u, c: ease((u - 0.45) / 0.5), hot }
    })
    const p = ease((t - SETTLE) / (1 - SETTLE))
    const intro = ease(t / 0.06)
    const mid = H / 2

    // the ALTER TABLE line: erase the previous statement, type the next, hold it while the change plays
    let text = ''
    if (t >= START - 0.01) {
      const i = clamp(Math.floor((t - START) / len), 0, n - 1)
      const u = pr[i].u
      if (t > END) text = ops[n - 1].cmd
      else if (u < 0.08 && i > 0) { const prev = ops[i - 1].cmd; text = prev.slice(0, Math.round(prev.length * (1 - u / 0.08))) }
      else text = ops[i].cmd.slice(0, Math.round(ops[i].cmd.length * clamp((u - 0.08) / 0.42)))
    }
    const html = `${esc(text)}<i class="sm-cur"></i>`
    if (html !== lastCmd) { cmd.innerHTML = `<b>&gt;</b> ${html}`; lastCmd = html }
    cmd.style.opacity = String(intro * clamp(1 - p * 2.4))
    cmd.style.transform = `translateY(${((mid - cy.cmd) * p).toFixed(2)}px)`

    // table name: renamed by the last statement, then it slides onto the rule as the caption
    const tb = pr[idx.tb]
    const th = morph(fromT, toT, tb.c)
    if (th !== lastTitle) { tspan.innerHTML = th; lastTitle = th }
    const dx = (W - toT.length * cw) / 2 - pad
    title.style.transform = `translate(${(dx * p).toFixed(2)}px,${((mid - cy.title) * p).toFixed(2)}px)`
    title.style.setProperty('--hot', String(tb.hot.toFixed(3)))
    title.style.opacity = String(intro)

    // rules: draw in from the left, then converge on the middle into one hairline
    const draw = ease(t / 0.08)
    rt.style.transform = `translateY(${((mid - cy.rt) * p).toFixed(2)}px) scaleX(${draw})`
    rb.style.transform = `translateY(${((mid - cy.rb) * p).toFixed(2)}px) scaleX(${draw})`
    rb.style.opacity = String((1 - p).toFixed(3))

    // columns
    let x = 0
    for (const c of cols) {
      const addI = c.addOp ? idx[c.addOp] : -1
      const w = addI >= 0 ? clamp(pr[addI].c * 1.15) : 1
      const nI = c.nOp ? idx[c.nOp] : -1, tI = c.tOp ? idx[c.tOp] : -1
      const ln = morph(c.n0, c.n1, nI >= 0 ? pr[nI].c : 0)
      const lt = morph(c.t0, c.t1, tI >= 0 ? pr[tI].c : 0)
      if (ln !== c.ln) { c.nm.innerHTML = ln; c.ln = ln }
      if (lt !== c.lt) { c.ty.innerHTML = lt; c.lt = lt }
      const hot = Math.max(nI >= 0 ? pr[nI].hot : 0, tI >= 0 ? pr[tI].hot : 0, addI >= 0 ? pr[addI].hot : 0)
      c.e.style.setProperty('--hot', hot.toFixed(3))
      c.e.style.setProperty('--add', addI >= 0 ? Math.max(hot, 0.35 * w).toFixed(3) : '0')
      c.e.style.width = `${(w * cc * cw).toFixed(2)}px`
      c.e.style.transform = `translateX(${x.toFixed(2)}px)`
      c.e.style.visibility = w < 0.02 ? 'hidden' : 'visible'
      x += w * cc * cw
    }
    grid.style.opacity = String(intro * clamp(1 - p * 2.4))
    grid.style.transform = `translateY(${((mid - cy.grid) * p).toFixed(2)}px)`
  })

  return () => { stop(); el.replaceChildren(); el.classList.remove('sep-schema') }
}
