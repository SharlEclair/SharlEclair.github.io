import { initScrollSpy, initDisclosure } from '/shared/ui/nav.js'
import { initThemeToggle } from '/shared/ui/theme.js'
import { lazyF1, lazyTransit } from '/shared/lazy.js'

const $ = (s) => document.querySelector(s)
const $$ = (s) => [...document.querySelectorAll(s)]

$$('[data-theme-toggle]').forEach((b) => initThemeToggle(b))

const bar = $('#bar')
const nav = $('#bar-nav')
const menu = $('[data-menu]')
if (bar && nav && menu) initDisclosure(menu, nav)

/* The compact bar arrives once the printed masthead has left the page. */
const mast = $('#mast')
if (bar?.hasAttribute('data-bar') && mast && 'IntersectionObserver' in window) {
  new IntersectionObserver(([e]) => bar.toggleAttribute('data-show', !e.isIntersecting)).observe(mast)
}

initScrollSpy($$('#bar-nav a[href^="#"], #mast-nav a[href^="#"]'))

const f1 = $('[data-stage="f1"]')
if (f1) lazyF1(f1, { runway: f1.closest('.runway'), posterAlt: 'A Formula 1 car seen from above in a dark studio, ember-gold light on the bodywork.' })
const tr = $('[data-stage="transit"]')
if (tr) lazyTransit(tr, { runway: tr.closest('.runway'), posterAlt: 'A search spreading over a dark city street map, a glowing route in red and violet.' })
