/**
 * The name starts big in the hero and, as you start scrolling, shrinks and slides up into the header, where it stays.
 * Until then the header's brand is hidden, so the name is never on screen twice.
 *
 * It is a scroll-linked transform (no layout): the hero <h1> is measured against the header brand, then moved and
 * scaled onto it over the first 40% of the viewport of scroll. At the end the h1 hides and the brand shows, in exactly
 * the same place, so the hand-off is invisible. Scrolling back up plays it in reverse.
 *
 * Configure with the URL:
 *   ?brand=morph         (default) the name shrinks and flies into the header
 *   ?brand=fade          the hero name fades out while the header name fades in, no travel
 *   ?brand=static        old behaviour: the name stays in the header the whole time
 *   ?brandstart=0.1      how far you must scroll before it starts, in viewport heights (0 to 1; default 0)
 *   ?brandvh=0.4         scroll distance of the move, in viewport heights (0.1 to 1.5; default 0.4)
 *                        The hero stays pinned for 0.5 vh of scroll; start + distance past that and the name
 *                        scrolls away with the hero before arriving, so keep brandstart + brandvh at or under 0.5.
 *   ?brandease=smooth|linear   easing of the move (default smooth)
 * Reduced motion: no morph, the header shows the name from the start.
 */
import { stableVh } from '/shared/ui/viewport.js'

const clamp = (v) => Math.min(1, Math.max(0, v))
const ease = (t) => t * t * (3 - 2 * t)

/** Bounding box of just the text (the h1 is a full-width block). */
function textRect(el) {
  const r = document.createRange()
  r.selectNodeContents(el)
  return r.getBoundingClientRect()
}

export function initNameMorph({ h1, brand, reduced = false }) {
  if (!h1 || !brand) return
  const q = new URLSearchParams(location.search)
  const mode = q.get('brand') === 'fade' ? 'fade' : 'morph'
  if (reduced || q.get('brand') === 'static') return
  const distVh = Math.min(1.5, Math.max(0.1, Number(q.get('brandvh')) || 0.4))
  const startVh = Math.min(1, Math.max(0, Number(q.get('brandstart')) || 0))
  const easeFn = q.get('brandease') === 'linear' ? (t) => t : ease
  const root = document.documentElement
  root.classList.add('name-morph')
  if (mode === 'fade') root.classList.add('name-fade')
  h1.style.transformOrigin = '0 0'
  h1.style.willChange = 'transform'

  let m = null // { dx, dy, s }
  function measure() {
    const prev = h1.style.transform
    h1.style.transform = 'none'
    const was = root.classList.contains('brand-on')
    root.classList.remove('brand-on') // measure the brand's text box, whatever its opacity
    const a = textRect(h1)
    const b = textRect(brand)
    h1.style.transform = prev
    if (was) root.classList.add('brand-on')
    if (!a.width || !b.width) { m = null; return }
    m = { dx: b.left - a.left, dy: b.top - a.top, s: b.width / a.width }
  }

  let queued = false
  function apply() {
    queued = false
    if (!m) return
    const vh = stableVh()
    const t = clamp((scrollY - vh * startVh) / (vh * distVh))
    const e = easeFn(t)
    const done = t >= 0.995
    if (mode === 'fade') {
      h1.style.opacity = String(1 - e)
      root.style.setProperty('--brand-o', String(e))
    } else {
      h1.style.transform = `translate3d(${m.dx * e}px, ${m.dy * e}px, 0) scale(${1 + (m.s - 1) * e})`
      h1.style.visibility = done ? 'hidden' : ''
    }
    root.classList.toggle('brand-on', done)
  }
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(apply) } }

  const remeasure = () => { measure(); apply() }
  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', remeasure)
  document.fonts?.ready.then(remeasure)
  remeasure()
}
