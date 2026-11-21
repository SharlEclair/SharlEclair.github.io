/**
 * ?sep=twist  "Helix": 64 stacked slices form a rope/DNA twist (blue and violet beads on teal rungs, 3D-rotated with CSS)
 * that untwists and flattens into a single thin line carrying the next section's name. Pure CSS scroll-driven: one
 * registered property, --tw, runs 0 to 1 over `entry 0% cover 50%` (under 100vh of scroll). Browsers without scroll
 * timelines and reduced-motion users get the flat end state.
 */
import { sections } from '../../content.js'
import { useCss } from './sepkit.js'

const NEXT = { 1: 'projects', 2: 'experience' }
const COUNT = 64

export function mount(el, { slot }) {
  useCss(new URL('./twist.css', import.meta.url).href, 'twist-css')
  const next = sections.find((s) => s.id === NEXT[slot])?.label ?? ''
  el.classList.add('sep-twist')
  const stage = document.createElement('div')
  stage.className = 'tw-stage'
  for (let i = 0; i < COUNT; i += 1) {
    const s = document.createElement('i')
    const edge = Math.pow(Math.sin((Math.PI * i) / (COUNT - 1)), 0.6)
    s.style.cssText = `--i:${i};--e:${edge.toFixed(3)}`
    stage.append(s)
  }
  const line = document.createElement('div')
  line.className = 'tw-line'
  const label = document.createElement('span')
  label.className = 'tw-label'
  label.textContent = next
  el.replaceChildren(line, stage, label)
  return () => { stage.remove(); line.remove(); label.remove(); el.classList.remove('sep-twist') }
}
