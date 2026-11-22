/**
 * ?sep=defrag  "Defrag": a Windows 95 style disk-defragmenter cluster map on a canvas. Crisp square clusters, one muted
 * colour per project (slot 1) or role (slot 2), start scattered across a faint disk. As you scroll they hop, left to
 * right, into contiguous runs packed to the left, the runs are named, the colours settle into one solid bar, and the bar
 * spreads out into a thin rule that carries the next section's name. Run lengths come from the real data (tools per
 * project, bullet points per role). Pure function of the slot's scroll progress t (under 100vh); the layout is a seeded
 * shuffle, so scrolling back replays the same hops. Reduced motion: just the rule.
 */
import { sections, projects, work } from '../../content.js'
import { clamp, ease, useCss, drive } from './sepkit.js'

const NEXT = { 1: 'projects', 2: 'experience' }
const GROUPS = {
  1: () => projects.map((p) => ({ name: p.title, alt: p.kind, weight: p.stack.length })),
  2: () => work.map((w) => ({ name: w.role, alt: w.org, weight: w.points.length })),
}
const ROWS = 4
const FILL = 0.62 // share of the disk that is "used"
const A_END = 0.55 // scattered -> contiguous runs
const B_END = 0.70 // gaps close, colours settle into one bar
const C_START = 0.68 // bar spreads into the rule

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Resolves any CSS colour (var(), hex) to [r, g, b, a] through a hidden probe element. */
const parse = (s) => {
  const n = s.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0]
  return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1]
}
const mix = (a, b, k) => `rgba(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)},${(a[3] + (b[3] - a[3]) * k).toFixed(3)})`

const rgba = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${(c[3] * a).toFixed(3)})`

function build(slot, mobile) {
  const N = mobile ? 152 : 400
  const cols = N / ROWS
  const used = Math.round((N * FILL) / ROWS) * ROWS // whole columns, so the bar has a clean edge
  const rand = mulberry32(slot * 7919 + (mobile ? 13 : 101))
  const groups = GROUPS[slot]()
  // largest-remainder split of the used clusters across groups, in proportion to their weights
  const total = groups.reduce((a, g) => a + g.weight, 0)
  let given = 0
  for (const g of groups) { g.exact = (g.weight / total) * used; g.n = Math.floor(g.exact); given += g.n }
  for (const g of [...groups].sort((a, b) => (b.exact % 1) - (a.exact % 1))) if (given < used) { g.n += 1; given += 1 }
  let from = 0
  for (const g of groups) { g.from = from; from += g.n }
  // seeded shuffle of all slots; the first `used` are where the used clusters start
  const slots = Array.from({ length: N }, (_, i) => i)
  for (let i = N - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]] }
  const cells = []
  for (let k = 0; k < used; k += 1) {
    const g = groups.findIndex((q) => k < q.from + q.n)
    const start = (k / (used - 1)) * 0.3 + (rand() - 0.5) * 0.05
    cells.push({ k, g, slot: slots[k], s: Math.max(0, start), d: 0.2 + rand() * 0.04 })
  }
  return { N, cols, used, groups, cells }
}

export function mount(el, { slot, reduced }) {
  useCss(new URL('./defrag.css', import.meta.url).href, 'defrag-css')
  const next = sections.find((s) => s.id === NEXT[slot])?.label ?? ''
  el.classList.add('sep-defrag')
  const canvas = document.createElement('canvas')
  canvas.className = 'df-canvas'
  const label = document.createElement('span')
  label.className = 'df-label'
  label.textContent = next
  const probe = document.createElement('span')
  probe.className = 'df-probe'
  el.replaceChildren(canvas, label, probe)
  const ctx = canvas.getContext('2d')
  const mq = matchMedia('(max-width: 640px)')
  let model = null, modelMobile = null
  let colors = null, colorKey = ''
  let last = null

  const resolve = (value) => { probe.style.color = value; return parse(getComputedStyle(probe).color) }
  const palette = (W) => {
    const key = `${document.documentElement.dataset.theme}|${W}`
    if (key === colorKey && colors) return colors
    const ready = getComputedStyle(el).getPropertyValue('--df-1').trim() !== '' // the stylesheet may still be loading
    colorKey = ready ? key : ''
    probe.style.width = 'var(--pad)'
    const pad = parseFloat(getComputedStyle(probe).width) || 16
    colors = {
      pad,
      group: [1, 2, 3, 4].map((i) => resolve(`var(--df-${i})`)),
      free: resolve('var(--df-free)'),
      accent: resolve('var(--accent)'),
      bg: resolve('var(--bg)'),
      muted: resolve('var(--muted)'),
      mono: getComputedStyle(el).getPropertyValue('--mono').trim() || 'monospace',
    }
    // the final rule: the page accent, a touch toned toward the page so it sits like the other separators
    colors.rule = [0, 1, 2].map((i) => colors.accent[i] + (colors.bg[i] - colors.accent[i]) * 0.18).concat(1)
    return colors
  }

  const draw = (t, W, H) => {
    last = [t, W, H]
    const mobile = mq.matches
    if (!model || modelMobile !== mobile) { model = build(slot, mobile); modelMobile = mobile }
    const dpr = window.devicePixelRatio || 1
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr)
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, pw, ph)
    const c = palette(W)
    const px = (v) => Math.round(v * dpr) // CSS px to device px, snapped
    const rect = (l, tp, r, b) => { const x0 = px(l), y0 = px(tp); ctx.fillRect(x0, y0, Math.max(0, px(r) - x0), Math.max(0, px(b) - y0)) }

    const mid = H / 2
    const padL = Math.max(8, c.pad)
    const lineW = Math.max(40, W - 2 * padL)
    const { cols, used, N, groups, cells } = model
    const pitch = Math.max(4, Math.floor(lineW / cols))
    const gridW = pitch * cols, gridH = pitch * ROWS
    const gx = Math.round((W - gridW) / 2), gy = Math.round(mid - gridH / 2)
    const ruleH = 2
    const gB = ease((t - A_END) / (B_END - A_END - 0.05))
    const gap = 1 - gB

    // the end state is one plain rule
    if (t >= 0.999) {
      ctx.fillStyle = rgba(c.rule)
      rect(padL, mid - ruleH / 2, padL + lineW, mid + ruleH / 2)
      label.style.opacity = '1'
      return
    }

    // the faint disk underneath: free clusters, fading once the runs are packed
    const diskA = 1 - gB
    if (diskA > 0.01) {
      ctx.fillStyle = rgba(c.free, diskA)
      for (let i = 0; i < N; i += 1) {
        const x = gx + Math.floor(i / ROWS) * pitch, y = gy + (i % ROWS) * pitch
        rect(x, y, x + pitch - 1, y + pitch - 1)
      }
    }

    // used clusters, one fill style per group
    const shade = groups.map((_, i) => mix(c.group[i % c.group.length], c.rule, gB))
    for (let gi = 0; gi < groups.length; gi += 1) {
      ctx.fillStyle = shade[gi]
      for (const cell of cells) {
        if (cell.g !== gi) continue
        const a = ease((t - cell.s) / cell.d)
        const sx = gx + Math.floor(cell.slot / ROWS) * pitch, sy = gy + (cell.slot % ROWS) * pitch
        const tx = gx + Math.floor(cell.k / ROWS) * pitch, ty = gy + (cell.k % ROWS) * pitch
        let l = sx + (tx - sx) * a
        let tp = sy + (ty - sy) * a - Math.sin(Math.PI * a) * pitch * 1.4
        let r = l + pitch - gap, b = tp + pitch - gap
        const u = ease((t - C_START) / 0.27)
        if (u > 0) {
          const col = Math.floor(cell.k / ROWS), ucols = used / ROWS
          const ll = padL + (col / ucols) * lineW, lr = padL + ((col + 1) / ucols) * lineW
          l += (ll - l) * u; r += (lr - r) * u
          tp += (mid - ruleH / 2 - tp) * u; b += (mid + ruleH / 2 - b) * u
        }
        rect(l, tp, r, b)
      }
    }

    // run names and the status line (desktop shows the names)
    const fillA = clamp(t / A_END)
    ctx.textBaseline = 'alphabetic'
    const fs = 10 * dpr
    ctx.font = `500 ${fs}px ${c.mono}`
    if (!mobile) {
      const la = ease((t - (A_END - 0.03)) / 0.05) * (1 - ease((t - 0.62) / 0.07))
      if (la > 0.02) {
        groups.forEach((g, i) => {
          const x0 = gx + Math.floor(g.from / ROWS) * pitch
          const room = (Math.ceil((g.from + g.n) / ROWS) - Math.floor(g.from / ROWS)) * pitch * dpr - 6 * dpr
          const text = [g.name, g.alt].find((s) => ctx.measureText(s).width <= room)
          if (!text) return
          ctx.fillStyle = rgba(c.group[i % c.group.length], la)
          ctx.fillText(text, px(x0), px(gy - 8))
        })
      }
    }
    const sa = 1 - ease((t - 0.6) / 0.1)
    if (sa > 0.02) {
      ctx.fillStyle = rgba(c.muted, sa)
      const pct = Math.floor(fillA * 100)
      ctx.fillText(pct >= 100 ? 'defragmentation complete' : `defragmenting ${pct}%`, px(gx), px(gy + gridH + 16))
    }
    label.style.opacity = String(clamp((t - 0.9) / 0.08))
  }

  const stop = drive(el, reduced, draw)
  const theme = new MutationObserver(() => { colorKey = ''; if (last) draw(...last) })
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => { stop(); theme.disconnect(); canvas.remove(); label.remove(); probe.remove(); el.classList.remove('sep-defrag') }
}
