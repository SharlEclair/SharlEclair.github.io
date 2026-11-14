/**
 * Navigation helpers shared by every variant. Behaviour only: the variant owns the markup and look.
 */

/**
 * Scroll-spy: marks the nav link of the section currently in view with aria-current="true" and
 * calls onChange(id). One IntersectionObserver, no scroll listener.
 *
 * @param {Iterable<HTMLAnchorElement>} links anchors whose href is "#section-id"
 * @param {{ onChange?: (id: string) => void, rootMargin?: string }} [options]
 */
export function initScrollSpy(links, { onChange, rootMargin = '-45% 0px -50% 0px' } = {}) {
  const byId = new Map()
  for (const link of links) {
    const id = decodeURIComponent((link.getAttribute('href') || '').split('#')[1] || '')
    const section = id && document.getElementById(id)
    if (!section) continue
    if (!byId.has(id)) byId.set(id, { section, links: [] })
    byId.get(id).links.push(link)
  }
  let active = null
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || entry.target.id === active) continue
      active = entry.target.id
      for (const [id, item] of byId) {
        for (const link of item.links) {
          if (id === active) link.setAttribute('aria-current', 'true')
          else link.removeAttribute('aria-current')
        }
      }
      onChange?.(active)
    }
  }, { rootMargin })
  for (const { section } of byId.values()) observer.observe(section)
  return () => observer.disconnect()
}

/**
 * A disclosure (collapsible menu, drawer, index overlay). Toggles aria-expanded on the button and
 * [hidden] / data-open on the panel, closes on Escape and on outside click, and returns focus to the
 * button. Use it for any collapsible navigation so every variant is keyboard-operable the same way.
 *
 * @param {HTMLButtonElement} button
 * @param {HTMLElement} panel
 * @param {{ closeOnNavigate?: boolean, useHidden?: boolean, onToggle?: (open: boolean) => void }} [options]
 */
export function initDisclosure(button, panel, { closeOnNavigate = true, useHidden = false, onToggle } = {}) {
  const set = (open) => {
    button.setAttribute('aria-expanded', String(open))
    panel.dataset.open = String(open)
    if (useHidden) panel.hidden = !open
    onToggle?.(open)
  }
  const isOpen = () => button.getAttribute('aria-expanded') === 'true'
  button.addEventListener('click', () => set(!isOpen()))
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      set(false)
      button.focus()
    }
  })
  document.addEventListener('click', (event) => {
    if (isOpen() && !panel.contains(event.target) && !button.contains(event.target)) set(false)
  })
  if (closeOnNavigate) {
    panel.addEventListener('click', (event) => {
      if (event.target.closest('a[href]')) set(false)
    })
  }
  set(isOpen())
  return { open: () => set(true), close: () => set(false), isOpen }
}

/**
 * Page scroll progress 0..1 written to a CSS custom property ON THE ELEMENT THAT USES IT (the bar
 * itself), rAF-throttled. Never target <html> or a large container: custom properties inherit, and
 * changing one on an ancestor every frame recalculates style for the whole subtree.
 * Animate with transform: scaleX(var(--page-progress)).
 *
 * @param {HTMLElement} target the progress bar / rail element
 */
export function initPageProgress(target, property = '--page-progress') {
  let queued = false
  const write = () => {
    queued = false
    const max = document.documentElement.scrollHeight - window.innerHeight
    target.style.setProperty(property, max > 0 ? (window.scrollY / max).toFixed(4) : '0')
  }
  const onScroll = () => {
    if (!queued) {
      queued = true
      requestAnimationFrame(write)
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  write()
}
