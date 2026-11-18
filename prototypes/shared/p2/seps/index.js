/**
 * Section separators. gen-p2.mjs emits `<div class="sep" data-slot="1|2">` between sections; this picks a variant and
 * lets it build inside each slot.
 *
 *   ?sep=query   (default) a SQL query mistypes, diagnoses itself and reruns: the self-healing agent, in four lines
 *   ?sep=ghost   two timing markers race: the real 389.9 s vs 34.2 s coursebook build
 *   ?sep=seam    a hex grid floods from two pins (Melbourne, Mumbai); where the floods meet becomes the divider
 *   ?sep=swap    the console swaps its cartridge (slot 1) and dives into the project list
 *   ?sep=zoom    the next heading resolves through 1-bit dithered "zoom levels"
 *   ?sep=tear    the old torn newspaper
 *
 * A variant module (shared/p2/seps/<name>.js) exports:
 *   mount(el, { slot, reduced }) -> void | () => void   build inside `el` (the slot); may return a cleanup
 * and brings its own CSS (a <link> to ./<name>.css added by mount, or inline). Rules for all variants: the slot is
 * aria-hidden and holds nothing focusable; motion is a pure function of scroll position; any scroll animation fits
 * within 100vh of scroll; prefers-reduced-motion and no-JS get a static end state.
 */
const LOADERS = {
  query: () => import('./query.js'),
  ghost: () => import('./ghost.js'),
  seam: () => import('./seam.js'),
  swap: () => import('./swap.js'),
  zoom: () => import('./zoom.js'),
  tear: () => import('./tear-sep.js'),
}
export const DEFAULT_SEP = 'query'
export const sepNames = Object.keys(LOADERS)

export async function initSeps() {
  const els = [...document.querySelectorAll('.sep')]
  if (!els.length) return
  const asked = new URLSearchParams(location.search).get('sep')
  const name = Object.hasOwn(LOADERS, asked) ? asked : DEFAULT_SEP
  document.documentElement.dataset.sep = name
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  try {
    const mod = await LOADERS[name]()
    for (const el of els) mod.mount(el, { slot: Number(el.dataset.slot), reduced })
  } catch (error) {
    console.warn(`separator variant "${name}" failed to load`, error)
  }
}
