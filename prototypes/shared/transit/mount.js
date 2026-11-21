/**
 * Embed Transit Desert in any page.
 *
 *   import { mountTransit } from '/shared/transit/mount.js'
 *
 *   const transit = await mountTransit(stageElement, {
 *     runway: tallSectionElement,   // EITHER: scroll through this element maps to 0..1
 *     progress: () => myProgress,   // OR: you own the maths and return 0..1 each frame
 *     theme: 'light',               // 'dark' | 'light'; default reads document.documentElement.dataset.theme
 *   })
 *   transit.setTheme('dark')        // restyles live, no reload
 *
 * The animation is one viewport of scroll: progress 0..1 should be mapped to exactly 100vh. With
 * `runway`, 0 is when the runway's top reaches the top of the viewport and 1 when its bottom reaches
 * the bottom (so a 200vh runway plays over one viewport of scrolling).
 *
 * `stageElement` is the box the canvas fills (normally a `position: sticky; height: 100vh` child of
 * the runway). The canvas is transparent, so the page shows through (cream paper or near-black).
 * The key action is framed in the right 60% of the stage on desktop and the top 55% on narrow
 * screens; the left 40% / bottom 45% is left open for text. Pass `layout: 'desktop' | 'phone'` to force.
 *
 * Returns `{ engine, setProgress(v | null), setTheme(t), destroy() }`.
 * One instance per page (it installs the `window.__TEST_SET_PROGRESS` hook).
 */
import { startEngine } from './engine.js'
import { stableVh } from '/shared/ui/viewport.js'
import { THEMES, resolveTheme, resolveRoads } from './theme.js'

const LABEL_CSS = `
.transit-label{position:absolute;left:0;top:0;pointer-events:none;opacity:0;will-change:transform,opacity;
  font:600 11.5px/1 ui-monospace,"SFMono-Regular","Cascadia Mono",Menlo,Consolas,monospace;
  letter-spacing:.22em;text-transform:uppercase;color:var(--tl-ink,#f3f1ea);white-space:nowrap;
  transition:opacity .3s cubic-bezier(.16,1,.3,1)}
.transit-label>span{display:block;transform:translate(-50%,-50%);padding:.4em .2em;
  text-shadow:0 0 .5em var(--tl-halo,#08080a),0 0 .15em var(--tl-halo,#08080a),0 0 1.1em var(--tl-halo,#08080a)}
.transit-label--rmit{font-weight:500;font-size:10px;letter-spacing:.2em;color:var(--tl-sub,rgba(243,241,234,.7))}
.transit-label--rmit>span{transform:translate(-50%,-190%)}
.transit-label--circuit>span::before{content:"";display:block;width:1px;height:14px;margin:0 auto .5em;background:var(--tl-ink,#f3f1ea);opacity:.7}
.transit-label--circuit>span{transform:translate(-50%,-100%)}
@media (max-width:760px){.transit-label{font-size:10px;letter-spacing:.18em}.transit-label--rmit{font-size:8.5px}}
.transit-hud{position:absolute;left:0;top:0;pointer-events:none;display:grid;grid-template-columns:auto auto;gap:.5em 1.4em;
  padding-top:.8em;border-top:1px solid rgba(255,178,61,.55);min-width:15em;
  font:500 9.5px/1 ui-monospace,"SFMono-Regular","Cascadia Mono",Menlo,Consolas,monospace;
  letter-spacing:.2em;text-transform:uppercase;color:rgba(243,241,234,.78);white-space:nowrap}
.transit-hud>b{font-weight:600;color:#ffb23d;grid-column:1/-1;letter-spacing:.26em}
.transit-hud>i{font-style:normal;color:rgba(48,205,245,.85)}
.transit-hud>span{text-align:right;font-variant-numeric:tabular-nums}
@media (max-width:760px){.transit-hud{font-size:8.5px;min-width:13em}}
`

function ensureLabelStyles() {
  if (document.getElementById('transit-label-css')) return
  const style = document.createElement('style')
  style.id = 'transit-label-css'
  style.textContent = LABEL_CSS
  document.head.appendChild(style)
}

function makeLabel(stage, className, text) {
  const el = document.createElement('div')
  el.className = `transit-label ${className}`
  el.setAttribute('aria-hidden', 'true')
  const inner = document.createElement('span')
  inner.textContent = text
  el.appendChild(inner)
  stage.appendChild(el)
  return el
}

// Small readout for ?roads=iso. Everything in it is counted from the recorded search (see engine.js).
function makeHud(stage) {
  const el = document.createElement('div')
  el.className = 'transit-hud'
  el.setAttribute('aria-hidden', 'true')
  el.style.display = 'none' // the engine shows and places it once the scene is up
  el.innerHTML =
    '<b>A* SEARCH</b><i>NODES</i><span data-k="nodes">000 / 491</span><i>ROUTE</i><span data-k="route">0.00 KM</span>'
  stage.appendChild(el)
  return el
}

/**
 * @param {HTMLElement} stage element the canvas should fill
 * @param {object} [options]
 * @param {HTMLElement} [options.runway] tall element whose scroll range maps to 0..1 (defaults to the stage's parent)
 * @param {() => number} [options.progress] external 0..1 source; overrides `runway`
 * @param {'dark'|'light'} [options.theme] defaults to document.documentElement.dataset.theme
 * @param {boolean|string} [options.label=true] show the circuit label; pass a string to change its text
 * @param {boolean|string} [options.rmit=true] show the small start label
 * @param {'default'|'glow'|'iso'} [options.roads] street look (dark theme only); defaults to `?roads=` in the URL
 * @param {'auto'|'desktop'|'phone'} [options.layout='auto']
 * @param {number} [options.maxPixelRatio=1.5]
 */
export async function mountTransit(stage, options = {}) {
  const {
    runway = stage.parentElement,
    progress = null,
    theme = null,
    label = true,
    rmit = true,
    layout = 'auto',
    roads = null,
    maxPixelRatio = 1.5
  } = options
  const roadsLook = resolveRoads(roads)

  if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative'
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'display:block;width:100%;height:100%'
  canvas.setAttribute('aria-hidden', 'true')
  stage.appendChild(canvas)

  ensureLabelStyles()
  const labels = {
    circuit: label ? makeLabel(stage, 'transit-label--circuit', typeof label === 'string' ? label : 'Albert Park Circuit') : null,
    rmit: rmit ? makeLabel(stage, 'transit-label--rmit', typeof rmit === 'string' ? rmit : 'RMIT') : null,
    hud: roadsLook === 'iso' ? makeHud(stage) : null
  }

  // 0 when the runway's top reaches the top of the viewport, 1 when its bottom reaches the bottom.
  const fromRunway = () => {
    const rect = runway.getBoundingClientRect()
    const range = rect.height - stableVh()
    return range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 0
  }

  let engine
  try {
    engine = await startEngine({
      canvas,
      stage,
      progressSource: progress ?? fromRunway,
      maxPixelRatio,
      labels,
      theme: resolveTheme(theme),
      roads: roadsLook,
      layout
    })
  } catch (error) {
    window.__APP_ERROR = String(error && error.message ? error.message : error)
    canvas.remove()
    labels.circuit?.remove()
    labels.rmit?.remove()
    labels.hud?.remove()
    throw error
  }

  return {
    engine,
    themes: THEMES,
    setProgress: (value) => engine.setProgress(value),
    setTheme: (value) => engine.setTheme(value),
    destroy() {
      engine.destroy()
      canvas.remove()
      labels.circuit?.remove()
      labels.rmit?.remove()
      labels.hud?.remove()
    }
  }
}
