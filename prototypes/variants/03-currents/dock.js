/**
 * Floating bottom dock, shared by index.html and projects.html: sliding marker (transform only),
 * theme toggle, number keys 1-5, and the hide-while-covering-copy rule for pinned runways.
 */
import { initThemeToggle } from '/shared/ui/theme.js'
import { initScrollSpy } from '/shared/ui/nav.js'

export function initDock({ spy = true, onTheme, onScroll } = {}) {
  const dock = document.querySelector('.dock')
  const links = [...dock.querySelectorAll('.dock-links a')]
  const marker = dock.querySelector('.dock-marker')

  const place = (link) => {
    if (!link) return
    marker.style.transform = `translateX(${link.offsetLeft}px) scaleX(${link.offsetWidth / 100})`
    marker.style.opacity = '1'
  }
  const current = () => links.find((a) => a.hasAttribute('aria-current'))
  if (spy) initScrollSpy(links, { onChange: () => place(current()) })
  place(current())
  window.addEventListener('resize', () => place(current()))
  document.fonts?.ready.then(() => place(current()))

  initThemeToggle(dock.querySelector('[data-theme-toggle]'), { onChange: onTheme })

  // 1-5 jump to the five sections (on the archive page they lead back to the home page).
  addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input,textarea,select,[contenteditable]')) return
    const link = links[Number(event.key) - 1]
    if (!link) return
    const id = link.getAttribute('href').split('#')[1]
    const section = id && document.getElementById(id)
    if (!section) { location.href = link.href; return }
    section.scrollIntoView()
    section.focus({ preventScroll: true })
  })

  // Hide on scroll down only while a pinned runway is on screen AND the dock would sit on its copy.
  const live = new Set()
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? live.add(e.target) : live.delete(e.target)
    if (!live.size) dock.classList.remove('is-away')
  })
  document.querySelectorAll('.runway').forEach((el) => io.observe(el))
  const covers = () => {
    const w = dock.offsetWidth, h = dock.offsetHeight
    const left = (innerWidth - w) / 2, top = innerHeight - h - 28
    for (const runway of live) {
      const r = runway.querySelector('[data-copy]')?.getBoundingClientRect()
      if (r && r.right > left && r.left < left + w && r.bottom > top && r.top < innerHeight) return true
    }
    return false
  }
  let lastY = scrollY
  addEventListener('scroll', () => {
    const y = scrollY, dy = y - lastY
    onScroll?.(y)
    if (Math.abs(dy) < 6) return
    lastY = y
    if (dy < 0) dock.classList.remove('is-away')
    else if (live.size && !dock.classList.contains('is-away') && !dock.contains(document.activeElement) && covers()) dock.classList.add('is-away')
  }, { passive: true })
  dock.addEventListener('focusin', () => dock.classList.remove('is-away'))
}
