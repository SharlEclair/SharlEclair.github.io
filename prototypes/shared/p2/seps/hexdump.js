/**
 * ?sep=hexdump  "Dump": a small LCD window shows an xxd-style hex dump (offset gutter, hex bytes, ASCII gutter). The
 * bytes resolve one by one from dim '..' while the gutter spells the next section's name with its real byte values.
 * At the end the window collapses into a single thin rule carrying the name. Every span sits on an exact monospace
 * cell (cellWidth); positions and states are a pure function of the slot's scroll progress t (under 100vh).
 * Reduced motion: the final rule.
 */
import { sections } from '../../content.js'
import { clamp, ease, useCss, drive, cellWidth } from './sepkit.js'

const NEXT = { 1: 'projects', 2: 'experience' }
const ROWS = 3
const SPREAD = 2          // the caption's letters are tracked out to this many cells each
const FILL = [0.05, 0.36] // pad bytes resolve (scattered) inside this window of t
const NAME = [0.38, 0.74] // name bytes resolve in order inside this window
const HOLD = 0.045        // how long a byte stays highlighted as it resolves
const SETTLE = 0.82

const div = (cls) => { const e = document.createElement('div'); e.className = cls; return e }
const cell = (cls, text) => { const e = document.createElement('span'); e.className = cls; e.textContent = text; return e }
const hex = (n, w) => n.toString(16).padStart(w, '0')

export function mount(el, { slot, reduced }) {
  useCss(new URL('./hexdump.css', import.meta.url).href, 'hexdump-css')
  const label = sections.find((s) => s.id === NEXT[slot])?.label.toUpperCase()
  if (!label) return
  const L = label.length
  const mq = matchMedia('(max-width: 640px)')

  el.classList.add('sep-hexdump')
  const stage = div('hx-stage')
  el.replaceChildren(stage)

  let st = null, cw = 0, lastW = 0
  document.fonts?.ready.then(() => { cw = 0 })

  function build(mobile, W) {
    stage.replaceChildren()
    const padPx = parseFloat(getComputedStyle(el).paddingLeft) || 0
    const fs = parseFloat(getComputedStyle(stage).fontSize)
    const lh = fs * (mobile ? 1.75 : 1.8)
    // 16 bytes per row (hexdump -C layout) when it fits, else 8; phones also lose the ruler row
    const wide = !mobile && (W - 2 * padPx) >= 86 * cw
    const cols = wide ? 16 : 8
    const ruler = wide
    const OFFW = 6, HX0 = OFFW + 3
    const hexX = (j) => HX0 + j * 3 + (cols === 16 && j >= 8 ? 1 : 0)
    const GX = HX0 + cols * 3 + (cols === 16 ? 1 : 0) + 1
    const total = GX + cols + 2
    const nameAt = cols === 16 ? cols + Math.floor((cols - L) / 2) : cols
    const rows = ROWS + (ruler ? 1 : 0)
    const padX = 1.5 * cw, padY = 0.75 * lh
    const panelW = total * cw + 2 * padX, panelH = rows * lh + 2 * padY
    const H = el.getBoundingClientRect().height
    const left = (W - panelW) / 2 + padX, top = (H - panelH) / 2 + padY

    const panel = div('hx-panel')
    panel.style.cssText = `left:${(W - panelW) / 2}px;top:${(H - panelH) / 2}px;width:${panelW}px;height:${panelH}px`
    const gut = div('hx-gut')
    gut.style.width = `${padX + (OFFW + 1) * cw - 0.5}px`
    panel.append(gut)
    const rl = div('hx-rule'), rl2 = div('hx-rule')
    const rx = padPx, rw = W - 2 * padPx
    for (const r of [rl, rl2]) r.style.cssText = `left:${rx}px;width:${rw}px`
    const cap = div('hx-cap')
    const capW = L * SPREAD * cw + 2.2 * cw * SPREAD
    cap.style.cssText = `left:${(W - capW) / 2}px;width:${capW}px;height:${lh}px`
    stage.append(panel, rl, rl2, cap)

    // pad bytes resolve scattered (deterministic shuffle), name bytes resolve in order
    const N = ROWS * cols
    const pads = []
    for (let k = 0; k < N; k += 1) if (k < nameAt || k >= nameAt + L) pads.push(k)
    let seed = 7 + L
    const order = pads.map((k, i) => [k, (seed = (seed * 1103515245 + 12345) & 0x7fffffff) + i * 1e-3]).sort((a, b) => a[1] - b[1]).map((a) => a[0])
    const when = new Array(N)
    order.forEach((k, i) => { when[k] = FILL[0] + (FILL[1] - FILL[0]) * (i / order.length) })
    const items = []
    const put = (e, x, y, extra = {}) => { stage.append(e); const it = { e, x, y, ...extra }; items.push(it); return it }

    const toCenter = (i) => (W - L * SPREAD * cw) / 2 + i * SPREAD * cw + ((SPREAD - 1) * cw) / 2
    const cyRow = H / 2 - lh / 2
    const yOf = (r) => top + (r + (ruler ? 1 : 0)) * lh

    if (ruler) {
      put(cell('hx-rul hx-ofs', 'OFFSET'), left, top, { fade: 1 })
      for (let j = 0; j < cols; j += 1) put(cell('hx-rul', hex(j, 2)), left + hexX(j) * cw, top, { fade: 1 })
      put(cell('hx-rul', 'DECODED TEXT'), left + (GX + 1) * cw, top, { fade: 1 })
    }
    const bytes = []
    for (let r = 0; r < ROWS; r += 1) {
      const y = yOf(r)
      put(cell('hx-off', `0x${hex(r * cols, 4)}`), left, y, { fade: 1 })
      put(cell('hx-bar', '|'), left + GX * cw, y, { fade: 1 })
      put(cell('hx-bar', '|'), left + (GX + cols + 1) * cw, y, { fade: 1 })
      for (let j = 0; j < cols; j += 1) {
        const k = r * cols + j
        const ni = k - nameAt
        const isName = ni >= 0 && ni < L
        const value = isName ? label.charCodeAt(ni) : 0
        const he = cell(`hx-b${isName ? ' hx-n' : ''}`, '..')
        const ae = cell(`hx-a${isName ? ' hx-n' : ''}`, '.')
        const r0 = isName ? NAME[0] + (NAME[1] - NAME[0]) * (ni / L) : when[k]
        const ax = left + (GX + 1 + j) * cw
        put(he, left + hexX(j) * cw, y, { fade: 1 })
        const ait = put(ae, ax, y, isName ? { fade: 0, tx: toCenter(ni), ty: cyRow } : { fade: 1 })
        bytes.push({ he, ae, ait, r0, value, isName, s: -1 })
      }
    }
    const cellX = left + GX * cw
    st = {
      mobile, cols, items, bytes, panel, rl, rl2, cap, lh, H,
      yTop: (H - panelH) / 2, yBot: (H + panelH) / 2, scale0: panelW / rw, cellX,
    }
  }

  const stop = drive(el, reduced, (t, W, H) => {
    const mobile = mq.matches
    if (!cw || W !== lastW || !st || st.mobile !== mobile || st.H !== H) {
      cw = cellWidth(stage); lastW = W
      build(mobile, W)
    }
    const p = ease((t - SETTLE) / (1 - SETTLE))
    const intro = ease(t / 0.05)
    const mid = H / 2

    // resolve states (0 dim '..', 1 being read, 2 settled), written only when they change
    for (const b of st.bytes) {
      const s = t < b.r0 ? 0 : t < b.r0 + HOLD ? 1 : 2
      if (s === b.s) continue
      b.s = s
      b.he.dataset.s = b.ae.dataset.s = String(s)
      b.he.textContent = s ? hex(b.value, 2) : '..'
      b.ae.textContent = s && b.value >= 32 && b.value < 127 ? String.fromCharCode(b.value) : '.'
    }

    // position every cell; the name's gutter letters travel to the centre, everything else fades
    for (const it of st.items) {
      let x = it.x, y = it.y
      if (it.tx !== undefined) { x += (it.tx - it.x) * p; y += (it.ty - it.y) * p }
      else y += (mid - st.lh / 2 - it.y) * p * 0.6
      it.e.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`
      it.e.style.opacity = it.tx !== undefined ? String(intro) : String((intro * clamp(1 - p * 2.6)).toFixed(3))
    }
    // window: tint fades, the two hairlines converge on the middle and stretch to the page margins
    st.panel.style.opacity = String((intro * clamp(1 - p * 2.2)).toFixed(3))
    const sx = st.scale0 + (1 - st.scale0) * p
    st.rl.style.transform = `translateY(${(st.yTop + (mid - st.yTop) * p).toFixed(2)}px) scaleX(${sx.toFixed(4)})`
    st.rl2.style.transform = `translateY(${(st.yBot + (mid - st.yBot) * p).toFixed(2)}px) scaleX(${sx.toFixed(4)})`
    st.rl.style.opacity = String(intro)
    st.rl2.style.opacity = String((intro * (1 - p)).toFixed(3))
    st.cap.style.transform = `translateY(${(mid - st.lh / 2).toFixed(2)}px)`
    st.cap.style.opacity = String(clamp(p * 1.6).toFixed(3))
  })

  return () => { stop(); el.replaceChildren(); el.classList.remove('sep-hexdump') }
}
