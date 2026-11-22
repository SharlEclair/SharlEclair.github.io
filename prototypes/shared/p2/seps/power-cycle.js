/**
 * ?sep=power-cycle  "Power cycle": a small LCD holds the last line of the section above (the first sentence of "How I
 * work", or of the last featured project). Scrolling squeezes the picture into a bright line, then a dot, like a handheld
 * switching off; the dot goes dark, comes back as a phosphor line and cools into a thin rule that names the next section.
 * Pure CSS scroll-driven: one registered property, --pc, runs 0 to 1 (under 100vh of scroll). Browsers without scroll
 * timelines and reduced-motion users get the end state (the rule and its caption).
 */
import { sections, howIWork, projects } from '../../content.js'
import { useCss } from './sepkit.js'

const NEXT = { 1: 'projects', 2: 'experience' }
const firstSentence = (s) => s.match(/^.*?[.?!](?=\s|$)/)?.[0] ?? s

export function mount(el, { slot }) {
  useCss(new URL('./power-cycle.css', import.meta.url).href, 'power-cycle-css')
  const label = (id) => sections.find((s) => s.id === id)?.label ?? ''
  const last = projects[projects.length - 1]
  const tag = slot === 1 ? howIWork.title : last.title
  const line = firstSentence(slot === 1 ? howIWork.paragraphs[0] : last.summary)

  el.classList.add('sep-pc')
  const part = (cls, text) => {
    const n = document.createElement('div')
    n.className = cls
    if (text != null) n.textContent = text
    return n
  }
  const screen = part('pc-screen')
  const lcd = part('pc-lcd')
  lcd.append(part('pc-tag', tag), part('pc-line', line))
  screen.append(lcd)
  const rule = part('pc-rule')
  const caption = part('pc-label')
  const led = document.createElement('i')
  led.className = 'pc-led'
  caption.append(led, label(NEXT[slot]))
  el.replaceChildren(screen, part('pc-beam'), rule, caption)
  return () => { el.replaceChildren(); el.classList.remove('sep-pc') }
}
