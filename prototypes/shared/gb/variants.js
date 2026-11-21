/**
 * URL-selectable look variants for the handheld, read here so no page has to pass anything through. Unknown or missing
 * values fall back to the default look, which is exactly the pre-variant rendering.
 *
 *   ?glow=floor | grid | off     light behind the console: default (flat sprite) | blue-teal floor light | the same as an LED
 *                                pixel grid | none
 *   ?pill=gel                    the blue on/off pill as a glossy gel gradient (default: flat)
 *   ?btn=gel                     the A / B caps as red-orange gel (default: flat)
 */
const q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)
const pick = (key, allowed) => (allowed.includes(q.get(key)) ? q.get(key) : allowed[0])

export const GLOW_MODES = ['default', 'floor', 'grid', 'off']
export const PILL_MODES = ['flat', 'gel']
export const BTN_MODES = ['flat', 'gel']

export const VARIANTS = {
  glow: pick('glow', GLOW_MODES),
  pill: pick('pill', PILL_MODES),
  btn: pick('btn', BTN_MODES),
}
