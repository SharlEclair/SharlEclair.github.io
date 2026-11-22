/**
 * ?sep=lsm-compact  "Compaction": log segments fall into a grid like a falling-block game, each segment tinted by the
 * project (slot 1) or role (slot 2, tagged with its years) it came from. Rows fill, then full rows compact: a single
 * inverted frame, the seams close and the row squashes away while the stack settles. The last surviving row merges,
 * thins into a hairline rule, and opens a gap for a caption naming the next section.
 *
 * One canvas. A deterministic layout (seeded), and a pure function of the slot's scroll progress t (under 100vh):
 * scrolling backwards replays it. Draws only when the frame changes; DPR capped at 2; 8 columns on mobile.
 * Reduced motion: the rule and caption only.
 */
import { sections, projects, work, education } from '../../content.js'
import { clamp, ease, useCss, drive } from './sepkit.js'

const NEXT = { 1: 'projects', 2: 'experience' }
// Cool, restrained tints. Dark runs lighter and softer, light runs deeper.
const TINTS = {
  dark: ['#3fb88a', '#38a8bb', '#5f85d6', '#8b82cf'],
  light: ['#1b8c63', '#16809a', '#3a62bd', '#6c5cba'],
}
// Slot 2 roles: the two jobs and the degree, each with the years its dates mention (all from content.js).
const years = (s) => [...new Set(String(s).match(/\d{4}/g) ?? [])]
const ROLES = [
  { years: years(work[0].dates), tint: 0 },
  { years: years(work[1].dates), tint: 2 },
  { years: years(education[0].dates), tint: 1 },
]
// Timeline (fractions of t)
const FALL_START = 0.02, ROW_GAP = 0.075, JITTER = 0.05, FALL_DUR = 0.12
const CLEAR_START = 0.56, CLEAR_GAP = 0.07, FLASH = 0.014, SQUASH = 0.05
const CLEAR_ORDER = { 5: [1, 3, 0, 2], 4: [1, 2, 0] }

const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const parse = (c) => {
  c = String(c).trim()
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  }
  m = /rgba?\(([^)]+)\)/.exec(c)
  if (m) return m[1].split(/[ ,/]+/).slice(0, 3).map(Number)
  return [128, 128, 128]
}
const mix = (a, b, p) => a.map((v, i) => Math.round(v + (b[i] - v) * p))
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const lerp = (a, b, p) => a + (b - a) * p

function build(slot, cols, n, minW, maxW) {
  const r = rng(slot * 7919 + cols * 31 + n)
  const kinds = slot === 1 ? projects.map((_, i) => ({ tint: i, years: [] })) : ROLES
  const rows = []
  for (let ri = 0; ri < n; ri += 1) {
    const base = FALL_START + ri * ROW_GAP
    const row = { pieces: [], land: 0 }
    let c = 0, prev = -1
    while (c < cols) {
      let w = minW + Math.floor(r() * (maxW - minW + 1))
      if (cols - c - w < minW) w = cols - c
      let k = Math.floor(r() * kinds.length)
      if (k === prev) k = (k + 1) % kinds.length
      prev = k
      const yrs = kinds[k].years
      const s = base + r() * JITTER, d = FALL_DUR + ri * 0.006
      row.pieces.push({ c, w, tint: kinds[k].tint, s, d, label: slot === 2 && w >= 3 ? yrs[Math.floor(r() * yrs.length)] : '' })
      row.land = Math.max(row.land, s + d)
      c += w
    }
    rows.push(row)
  }
  const order = CLEAR_ORDER[n]
  const clearAt = new Array(n).fill(Infinity)
  order.forEach((row, k) => { clearAt[row] = CLEAR_START + k * CLEAR_GAP })
  const clearEnd = CLEAR_START + (order.length - 1) * CLEAR_GAP + FLASH + SQUASH
  return { rows, clearAt, clearEnd, order }
}

export function mount(el, { slot, reduced }) {
  useCss(new URL('./lsm-compact.css', import.meta.url).href, 'lsm-compact-css')
  const next = (sections.find((s) => s.id === NEXT[slot])?.label ?? '').toUpperCase()
  el.classList.add('sep-lsm')
  const canvas = document.createElement('canvas')
  canvas.className = 'lsm-canvas'
  el.replaceChildren(canvas)
  const ctx = canvas.getContext('2d')

  let theme = '', pal = null, fontFam = 'monospace', fontsReady = false, cw = 0, ch = 0, dpr = 1
  let lastKey = '', lastT = 1, layout = null, layoutKey = ''

  const readTheme = () => {
    const cs = getComputedStyle(document.documentElement)
    theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    pal = {
      fg: parse(cs.getPropertyValue('--fg')), bg: parse(cs.getPropertyValue('--bg')),
      muted: parse(cs.getPropertyValue('--muted')), accent: parse(cs.getPropertyValue('--accent')),
      tints: TINTS[theme].map(parse),
    }
    fontFam = cs.getPropertyValue('--mono').trim() || 'monospace'
  }

  const draw = (t, W, H) => {
    const key = `${W}x${H}|${theme}|${fontsReady}|${Math.round(t * 700)}`
    if (key === lastKey) return
    lastKey = key
    lastT = t
    const d = Math.min(2, devicePixelRatio || 1)
    if (W !== cw || H !== ch || d !== dpr) {
      cw = W; ch = H; dpr = d
      canvas.width = Math.round(W * d); canvas.height = Math.round(H * d)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const { fg, bg, muted, accent, tints } = pal

    const mobile = W <= 640
    const n = mobile ? 4 : 5, cols = mobile ? 8 : 30
    const cell = Math.max(8, Math.min(mobile ? 18 : 14, 2 * Math.floor((H / 2 - 8) / (n - 0.5) / 2)))
    const gridW = cols * cell, gx = Math.round((W - gridW) / 2)
    const yf = Math.round(H / 2 + cell / 2) // floor: the bottom of row 0; the last row ends centred on the band
    const lk = `${slot}:${cols}:${n}`
    if (lk !== layoutKey) { layout = build(slot, cols, n, mobile ? 2 : 3, mobile ? 4 : 7); layoutKey = lk }
    const { rows, clearAt, clearEnd } = layout

    const thinStart = clearEnd + 0.01, thinEnd = 0.97
    const th = clamp((t - thinStart) / (thinEnd - thinStart)), q = ease(th), qh = ease(th / 0.6)
    const mergeS = ease((t - (clearEnd - 0.03)) / 0.04)
    const wellA = 1 - ease(th * 2.2)

    // the well: a faint dotted grid, two posts and a floor
    if (wellA > 0.01) {
      ctx.fillStyle = rgb(fg, 0.1 * wellA)
      for (let r = 0; r <= n; r += 1) for (let c = 0; c <= cols; c += 1) ctx.fillRect(gx + c * cell, yf - r * cell, 1, 1)
      ctx.fillStyle = rgb(fg, 0.2 * wellA)
      ctx.fillRect(gx - 4, yf - n * cell - 6, 1, n * cell + 10)
      ctx.fillRect(gx + gridW + 3, yf - n * cell - 6, 1, n * cell + 10)
      ctx.fillRect(gx - 4, yf + 3, gridW + 8, 1)
    }

    // heights: a cleared row squashes away after its one inverted frame
    const heights = rows.map((_, r) => cell * (1 - ease((t - clearAt[r] - FLASH) / SQUASH)))
    const bottoms = [yf]
    for (let r = 0; r < n; r += 1) bottoms.push(bottoms[r] - Math.round(heights[r]))
    const spawn = Math.ceil(yf / cell) + 1

    const fontPx = Math.max(8, Math.round(cell * 0.62))
    const label = (txt, x, y, w, color) => {
      ctx.font = `700 ${fontPx}px ${fontFam}`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = color
      ctx.fillText(txt, x + w / 2, y + 1)
    }
    const block = (p, y, h, col, flash, gap, a = 1) => {
      const x = gx + p.c * cell, w = p.w * cell - gap, hh = h - 1
      if (hh < 1) return
      ctx.fillStyle = rgb(col, a)
      ctx.fillRect(x, y, w, hh)
      if (hh >= 6) {
        ctx.fillStyle = rgb(flash ? fg : bg, flash ? 0.28 : 0.22)
        for (let i = 1; i < p.w; i += 1) ctx.fillRect(x + i * cell - 1, y + 1, 1, hh - 1)
        ctx.fillStyle = rgb(fg, flash ? 0.1 : 0.2)
        ctx.fillRect(x, y, w, 1)
      }
    }

    const survivor = n - 1, ruleCol = mix(accent, bg, 0.3)
    let landedRows = 0
    for (let r = 0; r < n; r += 1) {
      const row = rows[r], cT = clearAt[r], isSurv = r === survivor
      if (t >= row.land) landedRows += 1
      if (isSurv && th > 0) continue // drawn below as the rule
      if (heights[r] < 1) continue
      const flash = t >= cT && t < cT + FLASH
      const merge = isSurv ? mergeS : ease((t - cT) / 0.03)
      for (const p of row.pieces) {
        if (t < p.s) continue
        const u = (t - p.s) / p.d
        let tint = tints[p.tint]
        if (merge > 0) tint = isSurv ? mix(tint, ruleCol, merge) : mix(tint, muted, 0.72 * merge)
        if (flash) tint = theme === "light" ? mix(tint, bg, 0.7) : mix(tint, fg, 0.6)
        if (u < 1) {
          const g = lerp(spawn, r, u * u), qrow = Math.ceil(g - 1e-6)
          // landing ghost, then the falling piece stepping one whole cell at a time
          ctx.strokeStyle = rgb(tints[p.tint], 0.4)
          ctx.strokeRect(gx + p.c * cell + 0.5, yf - (r + 1) * cell + 0.5, p.w * cell - 2, cell - 2)
          block(p, yf - (qrow + 1) * cell, cell, tint, false, 1)
          if (p.label) label(p.label, gx + p.c * cell, yf - (qrow + 1) * cell + cell / 2, p.w * cell, rgb(bg, 0.85))
        } else {
          const h = Math.round(heights[r]), y = bottoms[r + 1]
          block(p, y, h, tint, flash, merge > 0.5 ? 0 : 1, 1)
          if (p.label && h >= cell - 1 && merge < 0.2) label(p.label, gx + p.c * cell, y + h / 2, p.w * cell, flash ? rgb(bg, 0.9) : rgb(bg, 0.85))
        }
      }
    }

    // the survivor thins into the rule; a gap opens in it for the caption
    let capW = 0
    ctx.font = `500 11px ${fontFam}`
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1.6px'
    const w1 = ctx.measureText('NEXT').width, w2 = ctx.measureText(next).width
    capW = w1 + 9 + w2
    if (th > 0) {
      const rule = Math.max(1, Math.round(1.5 * dpr) / dpr)
      const hh = lerp(cell - 1, rule, qh)
      const x0 = lerp(gx, 0, q), x1 = lerp(gx + gridW, W, q)
      const cy = H / 2, y = Math.round((cy - hh / 2) * dpr) / dpr
      const gap = ease((th - 0.35) / 0.4) * (capW / 2 + 16)
      const grad = ctx.createLinearGradient(0, 0, W, 0)
      const a = lerp(1, 0.7, q)
      grad.addColorStop(0, rgb(ruleCol, 0)); grad.addColorStop(0.12, rgb(ruleCol, a))
      grad.addColorStop(0.88, rgb(ruleCol, a)); grad.addColorStop(1, rgb(ruleCol, 0))
      // gradient only once it spreads past the old grid, so the early frames keep solid pixels
      ctx.fillStyle = q > 0.02 ? grad : rgb(ruleCol, 1)
      if (gap < 0.5) ctx.fillRect(x0, y, x1 - x0, hh)
      else { ctx.fillRect(x0, y, W / 2 - gap - x0, hh); ctx.fillRect(W / 2 + gap, y, x1 - W / 2 - gap, hh) }
      const ca = ease((th - 0.72) / 0.28)
      if (ca > 0.01) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        const tx = W / 2 - capW / 2, ty = Math.round(cy) + 1
        ctx.fillStyle = rgb(muted, ca); ctx.fillText('NEXT', tx, ty)
        ctx.fillStyle = rgb(fg, ca); ctx.fillText(next, tx + w1 + 9, ty)
      }
    }

    // status line under the floor
    const statusA = 1 - ease(th * 3)
    if (statusA > 0.01) {
      const cleared = clearAt.filter((c) => t >= c).length
      const runs = Math.max(0, landedRows - cleared)
      const word = t < CLEAR_START ? 'flush' : 'compact'
      ctx.font = `500 10px ${fontFam}`
      if ('letterSpacing' in ctx) ctx.letterSpacing = '1px'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = rgb(muted, 0.9 * statusA)
      ctx.fillText(`${word}  ${runs} ${runs === 1 ? 'run' : 'runs'}`, W / 2, yf + 17)
    }
  }

  readTheme()
  document.fonts?.ready.then(() => { fontsReady = true })
  const mo = new MutationObserver(() => { readTheme(); lastKey = ''; if (cw) draw(lastT, cw, ch) })
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const stop = drive(el, reduced, draw)
  return () => { stop(); mo.disconnect(); canvas.remove(); el.classList.remove('sep-lsm') }
}
