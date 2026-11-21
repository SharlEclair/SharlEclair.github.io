/**
 * ?sep=lap  "Timing Tower": one row of an F1 timing screen. Three sectors of eight mini-sector blocks fill as you scroll
 * (yellow while in progress), each locking to its timing colour (S1 green, S2 purple, S3 green) when complete; the row
 * ends on a PB chip (personal best) and "Next: Projects". No numbers on screen, nothing invented: the colours are the
 * convention. Pure function of t (slot scroll progress, under 100vh); JS only toggles classes when a block changes.
 * Reduced motion: t = 1, all sectors locked with the PB chip lit.
 */
import { sections } from '../../content.js'

const CSS_HREF = new URL('./lap.css', import.meta.url).href
const NEXT = { 1: 'projects', 2: 'experience' }
const FINAL = ['var(--green)', 'var(--purple)', 'var(--green)']
const BLOCKS = 8
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))

function ensureStyles() {
  if (document.querySelector('link[data-lp-css]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = CSS_HREF
  link.dataset.lpCss = ''
  document.head.append(link)
}

export function mount(el, { slot, reduced }) {
  ensureStyles()
  const next = sections.find((s) => s.id === NEXT[slot])?.label ?? ''
  el.classList.add('sep-lap')
  const row = document.createElement('div')
  row.className = 'lp-row'
  row.innerHTML = '<span class="lp-tag">Lap</span><div class="lp-secs"></div><div class="lp-end"><span class="lp-pb">PB</span><span class="lp-next">Next: <b></b></span></div>'
  row.querySelector('.lp-next b').textContent = next
  const secs = []
  const wrap = row.querySelector('.lp-secs')
  FINAL.forEach((c, s) => {
    const sec = document.createElement('div')
    sec.className = 'lp-sec'
    sec.style.setProperty('--c', c)
    sec.innerHTML = `<b>S${s + 1}</b><div class="lp-bar">${'<i></i>'.repeat(BLOCKS)}</div>`
    wrap.append(sec)
    secs.push({ sec, blocks: [...sec.querySelectorAll('i')] })
  })
  el.replaceChildren(row)

  let last = -1
  const apply = (t) => {
    // sectors fill over t 0.05 .. 0.8, a third each; PB lights at 0.88
    const n = clamp((t - 0.05) / 0.75) * 3 * BLOCKS
    const key = Math.floor(n) + (t >= 0.88 ? 1000 : 0)
    if (key === last) return
    last = key
    secs.forEach(({ sec, blocks }, s) => {
      const lit = clamp(n - s * BLOCKS, 0, BLOCKS)
      blocks.forEach((b, i) => b.classList.toggle('on', i < Math.floor(lit)))
      sec.classList.toggle('done', Math.floor(lit) >= BLOCKS)
    })
    el.classList.toggle('is-pb', t >= 0.88)
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
  return () => { io?.disconnect(); removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); row.remove(); el.classList.remove('sep-lap', 'is-pb') }
}
