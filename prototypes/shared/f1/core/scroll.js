import { config } from '../config.js'
import { clamp } from '../utils/math.js'
import { time } from './time.js'
import { viewport } from './viewport.js'

export const scroll = {
  rawY: 0,
  vh: 0,
  target: 0,
  progress: 0,
}

// Extra scrolling distance past the camera endpoint, in viewport heights.
// Without it the page bottom would land exactly on progress 1 and the camera
// would have no "locked" stretch at the end.
const TAIL_VH = 0.5

// The document must be TALL ENOUGH to actually reach the endpoint.
//
// This used to be a hardcoded `height: 330vh` in index.html, which silently
// capped the animation: with endVH at 2.19 that happened to fit, but raising
// endVH to 3.45 left the page 2351px short, so the camera stalled at progress
// 0.667 and the end framing was unreachable no matter what the panel said.
// Deriving the height from endVH means the endpoint is always reachable and
// always reflects the current setting.
export function layoutScrollSpace() {
  const el = document.querySelector('#scroll-container')
  if (!el || progressSource) return
  const h = window.innerHeight * (config.scroll.endVH + 1 + TAIL_VH)
  el.style.height = `${h}px`
}

// When the scene is embedded in a page, the page owns the scroll maths and hands
// over a `() => number` (0..1). With a source set, window.scrollY is never read
// and the standalone #scroll-container layout is not touched.
let progressSource = null
let progressOverride = null

export function setProgressSource(fn) {
  progressSource = typeof fn === 'function' ? fn : null
}

// Force a progress value (verification, reduced-motion posters). null releases it.
export function setProgressOverride(value) {
  progressOverride = typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : null
  if (progressOverride !== null) {
    scroll.target = progressOverride
    scroll.progress = progressOverride
  }
}

function readSource() {
  if (progressOverride !== null) return progressOverride
  const value = Number(progressSource())
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0
}

export function initScroll() {
  const onScroll = () => {
    if (progressSource || progressOverride !== null) {
      scroll.target = readSource()
      return
    }
    scroll.rawY = window.scrollY
    scroll.vh = scroll.rawY / window.innerHeight
    scroll.target = clamp(scroll.vh / config.scroll.endVH, 0, 1)
  }
  const onResize = () => {
    layoutScrollSpace()
    onScroll()
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  layoutScrollSpace()
  onScroll()

  return () => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
  }
}

// Re-read the scroll position after the document height or endVH has changed.
//
// Relaying out alone is not enough: the cached `target` was derived from the
// OLD endVH, so without this the animation keeps travelling toward a progress
// that no longer matches where the endpoint sits.
export function refreshScrollSpace() {
  layoutScrollSpace()
  scroll.rawY = window.scrollY
  scroll.vh = window.innerHeight ? scroll.rawY / window.innerHeight : 0
  scroll.target = clamp(scroll.vh / config.scroll.endVH, 0, 1)
}

export function updateScroll() {
  // An external source is polled here, once per frame, rather than on the scroll
  // event: the host page may derive it from a smoothed scroll of its own.
  if (progressOverride !== null) {
    scroll.target = progressOverride
    scroll.progress = progressOverride
    return
  }
  if (progressSource) scroll.target = readSource()
  // Frame-rate independent exponential smoothing.
  // Smoothing factor 0.10 -> ~100 ms time constant.
  const k = 1 - Math.exp(-time.delta / config.scroll.smoothing)
  scroll.progress += (scroll.target - scroll.progress) * k
  if (Math.abs(scroll.target - scroll.progress) < 0.0004) {
    scroll.progress = scroll.target
  }
}

export function setScrollToProgress(p) {
  scroll.target = clamp(p, 0, 1)
  scroll.progress = scroll.target
  window.scrollTo(0, window.innerHeight * config.scroll.endVH * scroll.target)
}
