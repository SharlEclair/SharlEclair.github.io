/**
 * ?sep=cursor  "Dino Door": the 16 x 16 pixel dino from the console's hidden game (same sprite rows as shared/gb/lcd.js)
 * walks along a dashed divider, two leg frames swapping every 10 px, and reaches a pixel door at the right end. The door
 * leaves open in four hard steps (1-bit, no tweening), the label "Next: Projects" appears and the dino walks in. Pure
 * function of t (slot scroll progress, under 100vh); positions snap to a 2 px grid. Reduced motion: t = 1, door open.
 */
import { sections } from '../../content.js'

const CSS_HREF = new URL('./cursor.css', import.meta.url).href
const NEXT = { 1: 'projects', 2: 'experience' }
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const BODY = [
  '..........#######.', '.........#########', '.........##.######', '.........#########', '.........#########',
  '.........#####....', '#........#####....', '#.......######..#.', '##.....#########..', '###...###########.',
  '.###############..', '..#############...', '...###########....', '....#########.....',
]
const LEGS = [['....###...##.....', '....##.....###...'], ['....##....###....', '....###....##.....']]

function path(rows, y0) {
  let d = ''
  rows.forEach((row, r) => {
    for (const m of row.matchAll(/#+/g)) d += `M${m.index} ${y0 + r}h${m[0].length}v1h-${m[0].length}z`
  })
  return d
}

function ensureStyles() {
  if (document.querySelector('link[data-cu-css]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = CSS_HREF
  link.dataset.cuCss = ''
  document.head.append(link)
}

export function mount(el, { slot, reduced }) {
  ensureStyles()
  const next = sections.find((s) => s.id === NEXT[slot])?.label ?? ''
  el.classList.add('sep-cursor')
  const track = document.createElement('div')
  track.className = 'cu-track'
  track.innerHTML =
    `<div class="cu-lab">Next: <b></b></div><div class="cu-door"><i></i><i></i></div>` +
    `<div class="cu-dino" data-f="0"><svg viewBox="0 0 18 16"><path d="${path(BODY, 0)}"/>` +
    `<path class="f0" d="${path(LEGS[0], 14)}"/><path class="f1" d="${path(LEGS[1], 14)}"/></svg></div>`
  track.querySelector('.cu-lab b').textContent = next
  el.replaceChildren(track)
  const dino = track.querySelector('.cu-dino'), door = track.querySelector('.cu-door')

  let trackW = 0, last = ''
  const apply = (t) => {
    const DINO_W = dino.offsetWidth, DOOR_W = door.offsetWidth
    const tw = clamp((t - 0.04) / 0.64)
    const te = clamp((t - 0.88) / 0.09)
    const open = Math.floor(clamp((t - 0.68) / 0.2) * 4) / 4
    const x1 = Math.max(0, trackW - DOOR_W - DINO_W - 6)
    const x2 = trackW - DOOR_W / 2 - DINO_W / 2
    let x = tw * x1
    if (te > 0) x = x1 + te * (x2 - x1)
    x = Math.round(x / 2) * 2
    const moving = (tw > 0 && tw < 1) || (te > 0 && te < 1)
    const f = moving ? Math.floor(x / 10) % 2 : 0
    const gone = t >= 0.97
    const key = `${x}|${f}|${open}|${gone}`
    if (key === last) return
    last = key
    dino.style.transform = `translateX(${x}px)`
    dino.dataset.f = f
    dino.style.visibility = gone ? 'hidden' : 'visible'
    door.style.setProperty('--o', String(1 - open))
    el.classList.toggle('is-open', open >= 0.5)
  }
  const update = () => {
    trackW = track.getBoundingClientRect().width
    if (reduced) return apply(1)
    const r = el.getBoundingClientRect(), vh = innerHeight
    apply(clamp((vh - r.top) / (0.5 * vh + 0.5 * r.height)))
  }
  update()
  let raf = 0
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update() }) }
  const ro = new ResizeObserver(() => { last = ''; update() }); ro.observe(el)
  let io
  if (!reduced) {
    io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) addEventListener('scroll', onScroll, { passive: true })
      else removeEventListener('scroll', onScroll)
      onScroll()
    }, { rootMargin: '100% 0px' })
    io.observe(el)
  }
  return () => { ro.disconnect(); io?.disconnect(); removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); track.remove(); el.classList.remove('sep-cursor', 'is-open') }
}
