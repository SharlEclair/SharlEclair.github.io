/**
 * A viewport height that does NOT change when a phone browser's address bar slides away.
 * `window.innerHeight` grows by the bar's height on the first scroll, which used to shift every runway's progress and
 * resize the fixed console canvas (the console visibly jumped). 100svh (the "small" viewport, bar showing) is constant
 * for a given orientation, so scroll maths and canvas sizes are measured against it instead.
 *
 *   import { stableVh } from '/shared/ui/viewport.js'
 *   stableVh()   // px; falls back to innerHeight where svh is unsupported
 */
let probe = null
let cache = 0
let cacheW = 0

export function stableVh() {
  if (typeof document === 'undefined') return 800
  // Re-measure only when the width changes (rotation / real resize), never for the address bar's height-only changes
  if (cache && cacheW === window.innerWidth) return cache
  if (!probe) {
    probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none'
    document.documentElement.appendChild(probe)
  }
  const h = probe.offsetHeight
  cache = h > 0 ? h : window.innerHeight
  cacheW = window.innerWidth
  return cache
}
