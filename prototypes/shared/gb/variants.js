/**
 * URL-selectable look variants for the handheld, read here so no page has to pass anything through. Unknown or missing
 * values fall back to the default look, which is exactly the pre-variant rendering.
 *
 *   ?glow=floor | floor-pulse | floor-drain | scroll | grid | grid-pulse | grid-drain | off
 *                                light behind the console: default (flat sprite that follows the console) | blue-teal
 *                                floor light that STAYS where the console rests (fades out as it leaves; -pulse breathes,
 *                                -drain contracts to a thin line) | scroll: the same floor light, STATIC (no pulse) and
                                anchored to the page, so it scrolls up with the content while the console leaves instead
                                of staying fixed | the same as an LED pixel grid | none
 *   ?shell=mono                  the console matches the page: dark smoke case, dark LCD and dark cartridge on the dark
 *                                theme; pale frosted case, light LCD and light cartridge on the light theme (default:
 *                                blue frosted case in dark, smoke case in light)
 *   ?shell=swap (default)        dark theme: the blue frosted clear case with a light LCD and light cartridge; light theme:
 *                                dark smoke case, dark LCD and dark cartridge
 *   ?shell=default               the original: blue frosted case, ink LCD and dark cartridge on dark; smoke case on light
 *   ?shell=glass                 the swap look, but the case is real three.js transmission glass (shared/gb/glass.js, tuned
 *                                in anim/gb-tune.html). Heavier: an extra render pass; the adaptive quality steps help.
 *   ?shell=pale                 mono the other way round: pale frosted case, light LCD and light cartridge on the dark
 *                                theme; dark smoke case, dark LCD and dark cartridge on the light theme
 *   ?pill=gel                   the blue on/off pill as a glossy gel gradient (default: flat)
 *   ?btn=gel                     the A / B caps as red-orange gel (opt-in only; default: flat)
 *   ?dpad=gel | glass | rubber   the D-pad: dark gel with a teal rim light | smoked glass with glowing arrows | matte soft-touch
 *   ?lcdfx=off | soft | strong   the LCD sitting inside the glass: dimmer, glass sheen, vignette, pixel grid (default strong)
 *   Defaults: glow=floor, pill=gel, dpad=glass, lcdfx=strong (use glow=default, pill=flat, dpad=flat, lcdfx=soft for the old ones).
 */
const q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)
const pick = (key, allowed, dflt = allowed[0]) => (allowed.includes(q.get(key)) ? q.get(key) : dflt)

export const GLOW_MODES = ['default', 'floor', 'floor-pulse', 'floor-drain', 'scroll', 'grid', 'grid-pulse', 'grid-drain', 'off']
export const SHELL_MODES = ['swap', 'default', 'mono', 'pale', 'glass']
export const PILL_MODES = ['flat', 'gel']
export const BTN_MODES = ['flat', 'gel']
export const DPAD_MODES = ['flat', 'gel', 'glass', 'rubber']
export const LCDFX_MODES = ['soft', 'off', 'strong']

export const VARIANTS = {
  glow: pick('glow', GLOW_MODES, 'floor'), // ?glow=default restores the old following sprite
  shell: pick('shell', SHELL_MODES),
  pill: pick('pill', PILL_MODES, 'gel'), // ?pill=flat restores the flat pill
  btn: pick('btn', BTN_MODES),
  dpad: pick('dpad', DPAD_MODES, 'glass'), // ?dpad=flat restores the original
  lcdfx: pick('lcdfx', LCDFX_MODES, 'strong'),
}
