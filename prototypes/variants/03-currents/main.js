import { createField } from '/variants/03-currents/field.js'
import { initDock } from '/variants/03-currents/dock.js'
import { lazyF1, lazyTransit } from '/shared/lazy.js'

const $ = (s) => document.querySelector(s)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const home = document.body.dataset.page === 'home'
initDock({ spy: home })

const canvas = $('#field')
const sections = [...document.querySelectorAll('[data-field]')].filter((el) => el !== canvas)
const parse = (s) => { const [x, y, r, alpha, speed, color] = s.split(',').map(Number); return { x, y, r, alpha, speed, color } }
const first = parse((home ? sections[0] : canvas).dataset.field)
let state = { ...first, alpha: 0 }

const windows = document.querySelectorAll('.hero, .approach, .experience, .contact, .proj--still, .projects__head, .archive')
createField(canvas, { target: () => state, windows, reduced })
// Fade the field in once, then follow the section under the middle of the viewport.
setTimeout(() => { state = first }, 120)

if (home && !reduced && 'IntersectionObserver' in window) {
  const live = new Set()
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? live.add(e.target) : live.delete(e.target)
    let top = null
    for (const el of sections) if (live.has(el)) top = el // the deepest, last-in-document section wins
    if (top) state = parse(top.dataset.field)
  }, { rootMargin: '-50% 0px -50% 0px' })
  sections.forEach((el) => io.observe(el))
}

const f1 = $('[data-stage="f1"]')
if (f1) lazyF1(f1, { runway: f1.closest('.runway'), posterAlt: 'A Formula 1 car seen from above in a dark studio, ember-gold light on the bodywork.' })
const tr = $('[data-stage="transit"]')
if (tr) lazyTransit(tr, { runway: tr.closest('.runway'), posterAlt: 'A search spreading over a dark city street map, a glowing route in red and violet.' })
