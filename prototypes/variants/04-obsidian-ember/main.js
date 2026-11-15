import { initThemeToggle } from '/shared/ui/theme.js'
import { initScrollSpy } from '/shared/ui/nav.js'
import { lazyF1, lazyTransit } from '/shared/lazy.js'

const $ = (s) => document.querySelector(s)

initThemeToggle($('[data-theme-toggle]'))

// Telemetry readout: current section, scroll position and a Melbourne clock. Text nodes only, no layout reads.
const sec = $('[data-sec]')
const scroll = $('[data-scroll]')
const clock = $('[data-clock]')
if (sec) {
  const codes = { top: '01', approach: '02', projects: '03', experience: '04', contact: '05' }
  initScrollSpy(document.querySelectorAll('.rail ol a'), { onChange: (id) => { sec.textContent = `SEC ${codes[id] ?? '01'} / 05` } })
  let queued = false
  const write = () => {
    queued = false
    const max = document.documentElement.scrollHeight - innerHeight
    scroll.textContent = `SCROLL ${String(Math.round((scrollY / Math.max(1, max)) * 100)).padStart(3, '0')}%`
  }
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(write) } }, { passive: true })
  const time = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const tick = () => { clock.textContent = `MELBOURNE ${time.format(new Date())}` }
  tick()
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(tick, 1000)
} else {
  initScrollSpy(document.querySelectorAll('.rail ol a'))
}

const f1 = $('[data-stage="f1"]')
if (f1) lazyF1(f1, { runway: f1.closest('.runway'), posterAlt: 'A Formula 1 car seen from above in a dark studio, ember-gold light on the bodywork.' })
const tr = $('[data-stage="transit"]')
if (tr) lazyTransit(tr, { runway: tr.closest('.runway'), posterAlt: 'A search spreading over a dark city street map, a glowing route in red and violet.' })
