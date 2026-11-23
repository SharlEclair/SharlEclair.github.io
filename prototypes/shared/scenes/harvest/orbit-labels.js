/**
 * DOM labels for the Harvest "orbit" variants: a private copy of makeDom from variants.js (that one is not exported and must not
 * be edited) with its own classes (`ho-labels` / `ho-label`, style id `ho-style`) and a pin variant.
 *
 *   const dom = makeOrbitLabels(host)
 *   dom.add(id, text, kind, anchor, pin)   kind 1 = region/water rule, 2 = satellite rule; anchor 'l' | 'c' | 'r'; pin = square + stem below
 *   dom.put(id, x, y, alpha, anchor?)      CSS px in the host; hidden when alpha <= 0.02
 *   dom.theme(T)  dom.size(w, h, limits)  dom.fade(opacityString)  dom.dispose()
 *
 * `size()` takes the clamp box: labels never go left of `xMin` (wide: the copy column) or below `yMax` (portrait), measured on the
 * label's own box for every anchor.
 */
const LABEL_CSS = `
.ho-labels{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2;font-size:var(--ho-fs,12px)}
.ho-label{position:absolute;left:0;top:0;white-space:nowrap;opacity:0;will-change:transform,opacity;padding:3px 0 3px 7px;border-left:2px solid var(--ho-a1);
  font:600 var(--ho-fs,12px)/1 var(--mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--ho-fg);
  text-shadow:0 0 7px var(--ho-halo),0 0 3px var(--ho-halo),0 1px 1px var(--ho-halo)}
.ho-label[data-k="2"]{border-left-color:var(--ho-a2)}
.ho-label[data-pin="1"]{border-left:0;padding:0 0 0 0}
.ho-label[data-pin="1"]::before{content:"";position:absolute;left:50%;top:100%;width:6px;height:6px;margin-left:-3px;margin-top:14px;
  background:var(--ho-a1);transform:translateY(-3px) rotate(0deg)}
.ho-label[data-pin="1"]::after{content:"";position:absolute;left:50%;top:100%;width:1px;height:14px;margin-left:-.5px;background:var(--ho-a1)}
`

export function makeOrbitLabels(host) {
  if (typeof document === 'undefined' || !host) return null
  if (!document.getElementById('ho-style')) {
    const st = document.createElement('style')
    st.id = 'ho-style'
    st.textContent = LABEL_CSS
    document.head.appendChild(st)
  }
  const root = document.createElement('div')
  root.className = 'ho-labels'
  root.setAttribute('aria-hidden', 'true')
  host.appendChild(root)
  const items = {}
  const AX = { l: '0', c: '-50%', r: '-100%' }
  const FRAC = { l: 0, c: 0.5, r: 1 }
  const lim = { xMin: 0, xMax: Infinity, yMin: 0, yMax: Infinity }
  let measured = false
  const measure = () => {
    for (const it of Object.values(items)) it.wd = it.el.offsetWidth
    measured = true
  }
  return {
    add(id, text, kind = 1, anchor = 'l', pin = false) {
      const el = document.createElement('div')
      el.className = 'ho-label'
      el.dataset.k = String(kind)
      if (pin) el.dataset.pin = '1'
      el.textContent = text
      root.appendChild(el)
      items[id] = { el, an: anchor, ax: AX[anchor], on: false, x: 0, y: 0, a: 0, wd: 0, pin }
      measured = false
    },
    put(id, x, y, a, anchor) {
      const it = items[id]
      if (!it) return
      if (!(a > 0.02)) {
        if (it.on) { it.el.style.opacity = '0'; it.on = false }
        return
      }
      if (!measured) measure()
      if (anchor) { it.an = anchor; it.ax = AX[anchor] }
      const f = FRAC[it.an]
      // clamp the label box (not the anchor point) into the allowed region
      const left = x - it.wd * f
      const cx = Math.max(lim.xMin, Math.min(lim.xMax - it.wd, left)) + it.wd * f
      const cy = Math.max(lim.yMin, Math.min(lim.yMax, y))
      const qa = Math.round(a * 20) / 20, qx = Math.round(cx), qy = Math.round(cy)
      if (it.on && qx === it.x && qy === it.y && qa === it.a) return
      it.x = qx; it.y = qy; it.a = qa; it.on = true
      it.el.style.transform = `translate3d(${qx}px,${qy}px,0) translate(${it.ax},-50%)`
      it.el.style.opacity = String(qa)
    },
    theme(T) {
      root.style.setProperty('--ho-fg', T.labelFg)
      root.style.setProperty('--ho-halo', T.labelHalo)
      root.style.setProperty('--ho-a1', T.labelA1)
      root.style.setProperty('--ho-a2', T.labelA2)
    },
    size(w, h, limits = {}) {
      root.style.setProperty('--ho-fs', w < 700 ? '11px' : '12px')
      lim.xMin = limits.xMin ?? 0
      lim.xMax = limits.xMax ?? w
      lim.yMin = limits.yMin ?? 0
      lim.yMax = limits.yMax ?? h
      measured = false
      for (const it of Object.values(items)) it.on = false // force a re-place after the font changed
    },
    fade(o) { root.style.opacity = o },
    dispose() { root.remove() },
  }
}
