/**
 * ?sep=plates  "Stacked Plates": a thin stack of translucent plates in isometric CSS 3D (rotateX / rotateZ). One plate
 * per real item of the next section (slot 1: the four projects, slot 2: where I worked and studied). As you scroll they
 * slide apart so the labels read, then settle back into a tight stack with the top plate lit. Pure function of t (slot
 * scroll progress, under 100vh): JS only writes --p and --s = sin(pi t); the geometry is calc() in plates.css. No
 * filters, no per-frame layout. Reduced motion: t = 1, the settled stack.
 */
import { projects, work, education, sections } from '../../content.js'

const CSS_HREF = new URL('./plates.css', import.meta.url).href
const NEXT = { 1: 'projects', 2: 'experience' }
const HUES = ['#a56bff', '#3d6bff', '#2fe0c8', '#6fa8ff']
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))

const labels = (slot) =>
  slot === 1 ? projects.map((p) => p.title) : [...work.map((w) => w.org), ...education.map((e) => e.org)]

function ensureStyles() {
  if (document.querySelector('link[data-pl-css]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = CSS_HREF
  link.dataset.plCss = ''
  document.head.append(link)
}

export function mount(el, { slot, reduced }) {
  ensureStyles()
  const items = labels(slot)
  const next = sections.find((s) => s.id === NEXT[slot])?.label ?? ''
  el.classList.add('sep-plates')
  const stage = document.createElement('div')
  stage.className = 'pl-stage'
  const glow = document.createElement('div')
  glow.className = 'pl-glow'
  const stack = document.createElement('div')
  stack.className = 'pl-stack'
  stack.style.setProperty('--n', items.length)
  items.forEach((text, i) => {
    const plate = document.createElement('div')
    plate.className = 'pl-plate' + (i === items.length - 1 ? ' is-top' : '')
    plate.style.setProperty('--i', i)
    plate.style.setProperty('--dir', i % 2 ? -1 : 1)
    plate.style.setProperty('--hue', HUES[i % HUES.length])
    const label = document.createElement('span')
    label.textContent = text
    plate.append(label)
    stack.append(plate)
  })
  const cap = document.createElement('div')
  cap.className = 'pl-cap'
  cap.innerHTML = 'Next: <b></b>'
  cap.lastChild.textContent = next
  stage.append(glow, stack)
  el.replaceChildren(stage, cap)

  let last = -1
  const apply = (t) => {
    if (Math.abs(t - last) < 0.002) return
    last = t
    el.style.setProperty('--p', t.toFixed(4))
    el.style.setProperty('--s', Math.sin(Math.PI * t).toFixed(4))
  }
  const update = () => {
    if (reduced) return apply(1)
    const r = el.getBoundingClientRect(), vh = innerHeight
    apply(clamp((vh - r.top) / (0.5 * vh + 0.5 * r.height)))
  }
  update()
  let raf = 0
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update() }) }
  let io
  if (!reduced) {
    io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) addEventListener('scroll', onScroll, { passive: true })
      else removeEventListener('scroll', onScroll)
      onScroll()
    }, { rootMargin: '100% 0px' })
    io.observe(el)
  }
  return () => { io?.disconnect(); removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); stage.remove(); cap.remove(); el.classList.remove('sep-plates') }
}
