/** Tiny helpers shared by the ascii, strands and termbar separators (the twist one is pure CSS). */
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const ease = (v) => { v = clamp(v); return v * v * (3 - 2 * v) }

export function useCss(href, key) {
  if (document.querySelector(`link[data-${key}]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset[key.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = ''
  document.head.append(link)
}

/**
 * Calls fn(t, W, H) with t = the slot's scroll progress (0 as it enters the screen, 1 once its centre is mid-screen, so
 * under 100vh of scroll). Redraws only while the slot is within a viewport of the screen. Reduced motion: t = 1 once.
 */
export function drive(el, reduced, fn) {
  let W = 0, H = 0, raf = 0
  const run = () => {
    raf = 0
    if (!W) return
    let t = 1
    if (!reduced) {
      const r = el.getBoundingClientRect(), vh = innerHeight
      t = clamp((vh - r.top) / (0.5 * vh + 0.5 * r.height))
    }
    fn(t, W, H)
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(run) }
  const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); W = r.width; H = r.height; kick() })
  ro.observe(el)
  document.fonts?.ready.then(() => { W = 0; ro.disconnect(); ro.observe(el) })
  let io
  if (!reduced) {
    io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) addEventListener('scroll', kick, { passive: true })
      else removeEventListener('scroll', kick)
      kick()
    }, { rootMargin: '100% 0px' })
    io.observe(el)
  }
  return () => { ro.disconnect(); io?.disconnect(); removeEventListener('scroll', kick); cancelAnimationFrame(raf) }
}

/** Width of one monospace cell in `host`'s current font. */
export function cellWidth(host, ch = '0') {
  const s = document.createElement('span')
  s.textContent = ch.repeat(20)
  s.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
  host.append(s)
  const w = s.getBoundingClientRect().width / 20
  s.remove()
  return w || 8
}
