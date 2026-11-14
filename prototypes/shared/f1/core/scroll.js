import { config } from '../config.js'
import { clamp } from '../utils/math.js'
import { time } from './time.js'

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
  if (!el) return
  const h = window.innerHeight * (config.scroll.endVH + 1 + TAIL_VH)
  el.style.height = `${h}px`
}

export function initScroll() {
  const onScroll = () => {
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
