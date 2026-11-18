/** The old torn newspaper, kept as ?sep=tear. Slot 1 uses variant a, slot 2 variant c (as before). */
import { initTears } from '/shared/p2/tear.js'

export function mount(el, { slot }) {
  el.classList.add('tear')
  el.dataset.seed = slot === 1 ? '7' : '19'
  el.dataset.variant = slot === 1 ? 'a' : 'c'
  el.dataset.label = slot === 1 ? 'Next: the work' : 'Where it was done'
  el.id ||= `tear-slot-${slot}`
  initTears(`#${el.id}`)
}
