/**
 * ?sep=swap, "Cartridge Swap". Slot 1 (How I work -> Projects): the handheld flies back in, ejects the PORTFOLIO
 * cartridge, takes one labelled PROJECTS (4 IN 1), lists the four projects on its LCD and dives into its own screen.
 * Slot 2 is a slim spacer.
 *
 * The motion is a pure function of scroll position. Let S = scrollY where the slot's top meets the viewport top, v = one
 * stable viewport height. Everything runs S - 0.2v .. S + 0.55v (75v of scroll):
 *
 *   S-0.20  console enters from the right        S+0.20  new cartridge seated, LCD card starts listing projects
 *   S+0.00  centred                              S+0.30  card complete, the dive starts (fill 0 -> 1)
 *   S+0.10  cartridge ejected, label swapped     S+0.45  LCD fills the view; S+0.45..0.55 the canvas fades out
 *
 * page.js (only when html[data-sep="swap"]) asks this module for the pose keys (swapKeys), and on every scroll tick calls
 * swapTick(gbs, scrollY, vh) which sets the cartridge label and LCD card from scrollY and returns the canvas opacity.
 * The reduced-motion / no-WebGL end state is the static line in the slot (see swap.css).
 */
import { projects } from '/shared/content.js'

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const COUNT = projects.length
const LABEL = { title: 'PROJECTS', subtitle: `${COUNT} IN 1` }
let slot = null

export function mount(el, { slot: n, reduced }) {
  if (!document.querySelector('link[data-swap-css]')) {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('./swap.css', import.meta.url).href })
    link.dataset.swapCss = ''
    document.head.appendChild(link)
  }
  if (n !== 1) { el.classList.add('swap-spacer'); return }
  slot = el
  el.classList.add('swap')
  if (reduced) el.classList.add('swap--static')
  el.innerHTML = `<p class="swap-cap">Swapping cartridges.</p><p class="swap-static">Cartridge: Projects. ${COUNT} in 1.</p>`
}

/** Document y where slot 1's top meets the viewport top, or null when the band is collapsed (reduced motion, no WebGL). */
function bandTop(vh) {
  const el = slot ?? document.querySelector('.sep[data-slot="1"]')
  if (!el || el.offsetHeight < vh * 0.9) return null
  return el.getBoundingClientRect().top + scrollY
}

/** Pose keys for the page track. `k(px, pose)` is page.js's keyframe maker; `hide` its parked pose. */
export function swapKeys({ k, hide, vh, narrow }) {
  const S = bandTop(vh)
  if (S == null) return []
  const at = (f) => S + f * vh
  const C = narrow
    ? { xf: 0, y: -1.1, z: 0, rx: -0.05, ry: -0.1, rz: 0, s: 0.62, cart: 1, fill: 0 }
    : { xf: 0, y: -0.35, z: 0, rx: -0.05, ry: -0.1, rz: 0, s: 0.85, cart: 1, fill: 0 }
  // The dive pose: flat on to the camera and centred so the LCD covers the view (see `fill` in gb/scene.js)
  const D = { xf: 0, y: 0, z: 0.4, rx: 0, ry: 0, rz: 0, s: 1.05, cart: 1, fill: 1 }
  // cart: 0 hovers well above the bay, which at this scale is already off the top of the view. (cartridge.js travels
  // DOWN for cart < 0, so the unclamped "throw it up" value does not exist; 0 is the highest it goes.)
  return [
    k(at(-0.2), { ...hide, xf: 1.9, y: C.y + 0.05, z: 0, rx: -0.05, ry: -0.35, rz: 0.08, s: C.s * 0.94, cart: 1 }),
    k(at(0), C),
    k(at(0.1), { ...C, cart: 0 }),
    k(at(0.2), C),
    k(at(0.3), C),
    k(at(0.45), D),
    k(at(0.55), D),
    k(at(0.56), hide),
  ]
}

let shown = null
let base = null
let cardOn = false

/** One scroll tick: label, LCD card, canvas opacity (1 -> 0 over S+0.45v .. S+0.55v). */
export function swapTick(gbs, y, vh) {
  const S = bandTop(vh)
  if (S == null) return 1
  const at = (f) => S + f * vh
  // cartridge label, derived from scrollY alone
  base ??= { title: gbs.cart.state.info.title, subtitle: gbs.cart.state.info.subtitle }
  const want = y > at(0.1) ? 'projects' : 'base'
  if (want !== shown) { shown = want; gbs.cart.setCartridge(want === 'projects' ? LABEL : base) }
  // LCD card: ground-only while the cartridge is out, header + a row per quarter once the new one is seated
  const live = y > at(-0.25) && y < at(0.6)
  if (live) {
    const q = clamp((y - at(0.2)) / (0.1 * vh))
    const n = projects.filter((_, i) => q > i / COUNT).length
    gbs.lcd.setCard({
      head: 'PROJECTS', tag: `${COUNT} IN 1`, rows: projects.map((p) => p.title), n,
      splash: y < at(0.1) ? ['ASHWIN', 'PILLAI'] : null,
      dissolve: smooth(at(0.36), at(0.45), y),
      to: getComputedStyle(document.documentElement).getPropertyValue('--stage').trim(),
    })
    cardOn = true
  } else if (cardOn) { gbs.lcd.setCard(null); cardOn = false }
  return 1 - smooth(at(0.45), at(0.55), y)
}
