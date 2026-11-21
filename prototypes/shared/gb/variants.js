/**
 * URL-selectable look variants for the handheld, read here so no page has to pass anything through. Unknown or missing
 * values fall back to the default look, which is exactly the pre-variant rendering.
 *
 *   ?glow=floor | floor-pulse | floor-drain | grid | grid-pulse | grid-drain | off
 *                                light behind the console: default (flat sprite that follows the console) | blue-teal
 *                                floor light that STAYS where the console rests (fades out as it leaves; -pulse breathes,
 *                                -drain contracts to a thin line) | the same as an LED pixel grid | none
 *   ?pill=gel                    the blue on/off pill as a glossy gel gradient (default: flat)
 *   ?btn=gel                     the A / B caps as red-orange gel (opt-in only; default: flat)
 *   ?dpad=gel | glass | rubber   the D-pad: dark gel with a teal rim light | smoked glass with glowing arrows | matte soft-touch
 *   ?lcdfx=off | soft | strong   the LCD sitting inside the glass: dimmer, glass sheen, vignette, pixel grid (default strong)
 *   Defaults: glow=floor-pulse, dpad=glass, lcdfx=strong (use glow=default, dpad=flat, lcdfx=soft for the old ones).
 */
const q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)
const pick = (key, allowed, dflt = allowed[0]) => (allowed.includes(q.get(key)) ? q.get(key) : dflt)

export const GLOW_MODES = ['default', 'floor', 'floor-pulse', 'floor-drain', 'grid', 'grid-pulse', 'grid-drain', 'off']
export const PILL_MODES = ['flat', 'gel']
export const BTN_MODES = ['flat', 'gel']
export const DPAD_MODES = ['flat', 'gel', 'glass', 'rubber']
export const LCDFX_MODES = ['soft', 'off', 'strong']

export const VARIANTS = {
  glow: pick('glow', GLOW_MODES, 'floor'), // ?glow=default restores the old following sprite
  pill: pick('pill', PILL_MODES, 'gel'), // ?pill=flat restores the flat pill
  btn: pick('btn', BTN_MODES),
  dpad: pick('dpad', DPAD_MODES, 'glass'), // ?dpad=flat restores the original
  lcdfx: pick('lcdfx', LCDFX_MODES, 'strong'),
}
