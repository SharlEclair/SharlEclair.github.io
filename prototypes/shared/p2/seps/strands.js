/**
 * ?sep=strands  "Cable": three tagged strands (blue, teal, violet) leave their labels braided, then pull taut into one
 * thin three-colour line. The labels are real skills from content.js and glide into a tidy stack. SVG, redrawn as a pure
 * function of the slot's scroll progress t (under 100vh). Reduced motion draws the taut end state.
 */
import { sections, skills, projects } from '../../content.js'
import { clamp, ease, useCss, drive } from './sepkit.js'

const NS = 'http://www.w3.org/2000/svg'
const NEXT = { 1: 'projects', 2: 'experience' }
const langs = skills[0][1].split(', ')
const TAGS = {
  1: [langs[0], langs[1], projects[0].stack.find((s) => s === 'dbt')],
  2: [skills[0][0], skills[1][0], skills[3][0]],
}
const N = 90

export function mount(el, { slot, reduced }) {
  useCss(new URL('./strands.css', import.meta.url).href, 'strands-css')
  const next = sections.find((s) => s.id === NEXT[slot])?.label ?? ''
  el.classList.add('sep-strands')
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'sd-svg')
  const paths = [0, 1, 2].map((k) => {
    const p = document.createElementNS(NS, 'path')
    p.setAttribute('class', `sd-s sd-s${k + 1}`)
    p.setAttribute('pathLength', '1')
    svg.append(p)
    return p
  })
  const tags = TAGS[slot].map((txt, k) => {
    const d = document.createElement('span')
    d.className = `sd-tag sd-t${k + 1}`
    d.textContent = txt
    return d
  })
  const tail = document.createElement('span')
  tail.className = 'sd-next'
  tail.textContent = next.toLowerCase()
  el.replaceChildren(svg, ...tags, tail)

  const stop = drive(el, reduced, (t, W, H) => {
    const mob = W < 520
    const pad = mob ? 14 : 28
    const tagW = mob ? 78 : 118
    const x0 = pad + tagW, x1 = W - pad - (mob ? 0 : 120)
    const cy = H / 2
    const reach = ease(t / 0.4)
    const tight = ease((t - 0.35) / 0.55)
    const amp = H * 0.3 * (1 - tight)
    const gap = 3 * tight + 22 * (1 - tight) * 0 // final spacing of the bundle in px
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    svg.setAttribute('width', W)
    svg.setAttribute('height', H)
    for (let k = 0; k < 3; k += 1) {
      let d = ''
      for (let i = 0; i <= N; i += 1) {
        const u = i / N
        const env = Math.min(1, u * 5) * Math.min(1, (1 - u) * 5)
        const y = cy + (k - 1) * gap + Math.sin(u * Math.PI * 4.2 + (k * Math.PI * 2) / 3 + t * 5) * amp * env
        d += `${i ? 'L' : 'M'}${(x0 + (x1 - x0) * u).toFixed(1)} ${y.toFixed(1)}`
      }
      paths[k].setAttribute('d', d)
      paths[k].style.strokeDasharray = '1'
      paths[k].style.strokeDashoffset = (1 - reach).toFixed(3)
    }
    // tags glide from where their strand starts to a tidy stack beside the bundle
    tags.forEach((tag, k) => {
      const y0 = cy + (k - 1) * 16 * (1 - tight) + Math.sin((k * Math.PI * 2) / 3 + t * 5) * amp * 0.12
      const y = y0 + (k - 1) * 15 * tight * 1
      tag.style.transform = `translate(${pad}px, ${(y - 7).toFixed(1)}px)`
      tag.style.opacity = ease(t / 0.15 - k * 0.1).toFixed(2)
    })
    tail.style.transform = `translate(${W - pad}px, ${cy - 7}px) translateX(-100%)`
    tail.style.opacity = ease((tight - 0.7) / 0.3).toFixed(2)
  })
  return () => { stop(); svg.remove(); tags.forEach((x) => x.remove()); tail.remove(); el.classList.remove('sep-strands') }
}
