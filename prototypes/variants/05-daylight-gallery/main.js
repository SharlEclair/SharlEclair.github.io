import { initThemeToggle } from '/shared/ui/theme.js'
import { initScrollSpy, initDisclosure } from '/shared/ui/nav.js'
import { initRelief } from '/variants/05-daylight-gallery/relief.js'
import { lazyF1, lazyTransit } from '/shared/lazy.js'

const $ = (s, r = document) => r.querySelector(s)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const relight = []

initThemeToggle($('[data-theme-toggle]'), { onChange: () => relight.forEach((fn) => fn()) })

// The floor plan: a disclosure that moves focus to the current room.
const plan = $('#plan')
initDisclosure($('.plan-btn'), plan, {
  onToggle(open) {
    if (open) ($('.room-link[aria-current]', plan) ?? $('.room-link', plan))?.focus({ preventScroll: true })
  },
})
initScrollSpy(document.querySelectorAll('.bar-links a, .room-link'))

const relief = $('#relief')
if (relief) initRelief(relief, { reduced, onTheme: (fn) => relight.push(fn) })

// The paper studies only move while they are on the wall in front of you.
if ('IntersectionObserver' in window) {
  const watcher = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.classList.toggle('is-away', !e.isIntersecting)
  })
  document.querySelectorAll('.work--small').forEach((el) => watcher.observe(el))
}

for (const stage of document.querySelectorAll('[data-stage]')) {
  const runway = stage.closest('.runway')
  if (stage.dataset.stage === 'f1') lazyF1(stage, { runway, posterAlt: 'A Formula 1 car seen from above, drawn inside a field of violet and gold streamlines.' })
  else lazyTransit(stage, { runway, posterAlt: 'A night map of Melbourne streets with one shortest route lit from RMIT to the Albert Park circuit.' })
}
