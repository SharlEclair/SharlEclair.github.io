/** System bar behaviour shared by index.html and projects.html. */
import { initThemeToggle } from '/shared/ui/theme.js'
import { initScrollSpy, initDisclosure } from '/shared/ui/nav.js'
import { sections } from '/shared/content.js'

export const $ = (selector, root = document) => root.querySelector(selector)
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]

export function initBar() {
  initThemeToggle($('[data-theme-toggle]'))
  const menu = $('#menu')
  initDisclosure($('.bar-start'), menu)

  const now = $('[data-now]')
  initScrollSpy($$('a[href*="#"]', menu), {
    onChange: (id) => { now.textContent = sections.find((s) => s.id === id)?.label ?? '' },
  })

  // Number keys 1-5 jump to the sections. Ignored while typing or with a modifier held.
  addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return
    if (event.target.closest?.('input, textarea, select, [contenteditable]')) return
    const section = /^[1-5]$/.test(event.key) && sections[event.key - 1]
    if (!section) return
    const el = document.getElementById(section.id)
    if (!el) { location.href = './#' + section.id; return }
    el.scrollIntoView()
    el.focus({ preventScroll: true })
    history.replaceState(null, '', '#' + section.id)
  })
}
