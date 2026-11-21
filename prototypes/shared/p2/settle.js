/**
 * ?settle= : after the visitor stops scrolling, drift the page to the end (or the start) of the scroll animation they are in.
 * Each pinned `.runway` is one animation. Off by default.
 *
 *   ?settle=1 | both | forward | back   on (1 = both). forward: finish the animation when you stop late in it.
 *                                       back: rewind to its start when you stop early in it.
 *   ?settlefrom=0.8      forward: start finishing once this far through the runway (0..1)
 *   ?settleback=0.1      back: rewind when no further than this far through the runway (0..1)
 *   ?settlepause=2000    idle time in ms before it starts (300 to 10000)
 *   ?settlespeed=0.3     drift speed in px per ms (0.1 to 2): lower is slower
 *
 * Any wheel, touch, key or pointer input cancels the drift at once. Disabled for prefers-reduced-motion.
 */
import { stableVh } from '/shared/ui/viewport.js'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function initSettle() {
  const q = new URLSearchParams(location.search)
  const raw = q.get('settle')
  if (!raw || /^(0|off|false|no)$/i.test(raw)) return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const mode = ['forward', 'back'].includes(raw) ? raw : 'both'
  const num = (key, dflt, lo, hi) => {
    const n = Number(q.get(key))
    return q.get(key) != null && q.get(key) !== '' && Number.isFinite(n) ? clamp(n, lo, hi) : dflt
  }
  const from = num('settlefrom', 0.8, 0.05, 0.99)
  const back = num('settleback', 0.1, 0.01, 0.95)
  const pause = num('settlepause', 2000, 300, 10000)
  const speed = num('settlespeed', 0.3, 0.1, 2)

  const runways = [...document.querySelectorAll('.runway')]
  if (!runways.length) return

  let timer = 0
  let raf = 0
  let touching = false
  let driving = false

  const stop = () => { cancelAnimationFrame(raf); raf = 0; driving = false }

  /** Scroll target for the current position, or null when none applies. */
  function target() {
    const vh = stableVh()
    for (const el of runways) {
      const rect = el.getBoundingClientRect()
      const range = rect.height - vh
      if (range < vh * 0.3) continue
      const top = rect.top + scrollY
      const p = (scrollY - top) / range
      if (p <= 0 || p >= 1) continue
      if (mode !== 'back' && p >= from) return top + range
      if (mode !== 'forward' && p <= back) return top
    }
    return null
  }

  function drift(to) {
    const y0 = scrollY
    const dist = to - y0
    if (Math.abs(dist) < 2) return
    const dur = clamp(Math.abs(dist) / speed, 500, 4000)
    const t0 = performance.now()
    driving = true
    const step = (now) => {
      const t = clamp((now - t0) / dur, 0, 1)
      scrollTo({ top: y0 + dist * ease(t), behavior: 'instant' })
      if (t < 1 && driving) raf = requestAnimationFrame(step)
      else driving = false
    }
    raf = requestAnimationFrame(step)
  }

  function arm() {
    clearTimeout(timer)
    if (touching) return
    timer = setTimeout(() => {
      if (touching || document.hidden) return
      const to = target()
      if (to != null) drift(to)
    }, pause)
  }

  const cancel = () => { stop(); clearTimeout(timer) }
  addEventListener('wheel', cancel, { passive: true })
  addEventListener('keydown', cancel)
  addEventListener('pointerdown', cancel, { passive: true })
  addEventListener('touchstart', () => { touching = true; cancel() }, { passive: true })
  addEventListener('touchend', () => { touching = false; arm() }, { passive: true })
  addEventListener('touchcancel', () => { touching = false; arm() }, { passive: true })
  addEventListener('scroll', () => { if (!driving) arm() }, { passive: true })
  arm()
}
