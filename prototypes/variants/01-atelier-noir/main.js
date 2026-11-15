import { initScrollSpy, initDisclosure } from '/shared/ui/nav.js'
import { initThemeToggle } from '/shared/ui/theme.js'
import { lazyF1, lazyTransit } from '/shared/lazy.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

$$('[data-theme-toggle]').forEach((b) => initThemeToggle(b))

/* Index: collapse to a rail on desktop, sheet on mobile, scroll-spy everywhere. */
const index = $('#index')
if (index) {
  const fab = $('[data-index-open]')
  initDisclosure(fab, index)
  const collapse = $('[data-index-collapse]')
  const root = document.documentElement
  const sync = () => {
    const rail = root.dataset.index === 'rail'
    collapse?.setAttribute('aria-pressed', String(rail))
    collapse?.setAttribute('aria-label', rail ? 'Expand the index' : 'Collapse index to a rail')
  }
  collapse?.addEventListener('click', () => {
    const next = root.dataset.index === 'rail' ? 'open' : 'rail'
    root.dataset.index = next
    try { localStorage.setItem('an-index', next) } catch { /* the choice lasts for the page */ }
    sync()
  })
  sync()
  const num = $('[data-current-num]')
  initScrollSpy($$('.index__list a'), { onChange: (id) => { const a = $(`.index__list a[href="#${id}"]`); if (num && a) num.textContent = a.dataset.num } })
}

/* Hero: the hands close the gap as the pinned hero scrolls. Writes one variable on one small element. */
const hero = $('#top')
const hands = $('.hands')
if (hero && hands) {
  if (reduced) hands.style.setProperty('--p', '.9')
  else {
    let queued = false
    let live = true
    const write = () => {
      queued = false
      const r = hero.getBoundingClientRect()
      const raw = -r.top / Math.max(1, r.height - innerHeight)
      hands.style.setProperty('--p', Math.min(1, Math.max(0, raw / 0.8)).toFixed(3))
    }
    const onScroll = () => { if (live && !queued) { queued = true; requestAnimationFrame(write) } }
    new IntersectionObserver(([e]) => { live = e.isIntersecting; if (live) onScroll() }).observe(hero)
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    hands.style.setProperty('--p', '0')
  }
}

/* The two WebGL scenes, loaded when their runway is near. */
const f1 = $('[data-stage="f1"]')
if (f1) lazyF1(f1, { runway: f1.closest('.runway'), posterAlt: 'A Formula 1 car seen from above in a dark studio, ember-gold light on the bodywork.' })
const tr = $('[data-stage="transit"]')
if (tr) lazyTransit(tr, { runway: tr.closest('.runway'), posterAlt: 'A search spreading over a dark city street map, a glowing route in red and violet.' })

/* Contact console: the D-pad moves a selection through real links; A opens, B copies, START scrolls up. */
const lcd = $('[data-lcd-list]')
if (lcd) {
  const links = $$('a', lcd)
  const hud = $('[data-hud]')
  let sel = 0
  const say = (t) => { hud.textContent = t }
  const set = (i) => { sel = (i + links.length) % links.length; links.forEach((a, j) => a.classList.toggle('is-sel', j === sel)); say('') }
  links.forEach((a, j) => a.addEventListener('focus', () => set(j)))
  $$('[data-pad]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.pad
    if (k === 'up') set(sel - 1)
    else if (k === 'down') set(sel + 1)
    else if (k === 'start') scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
    else if (k === 'b') {
      const mail = links[0].getAttribute('href').replace('mailto:', '')
      navigator.clipboard?.writeText(mail).then(() => say('Copied ' + mail), () => say('Copy blocked, select the text'))
    } else if (k === 'a') {
      const href = links[sel].getAttribute('href')
      if (href.startsWith('#')) say('This link is not set yet')
      else if (href.startsWith('mailto:')) location.href = href
      else open(href, '_blank', 'noopener')
    }
  }))
}

/* One authored reveal per block, no stagger chains. */
const reveal = $$('.copy, .approach__body, .job, .console, .contact__mail')
if (!reduced && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { rootMargin: '0px 0px -8% 0px' })
  reveal.forEach((el) => { if (!el.closest('.pin')) { el.dataset.reveal = ''; io.observe(el) } })
}
