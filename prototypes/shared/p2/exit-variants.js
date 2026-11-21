/**
 * ?exit= variants: how the handheld leaves the hero. Every variant starts from the hero's held pose at `hEnd` (the scroll
 * position where the hero's pinned runway ends) and is fully gone by hEnd + 1 viewport height, ending exactly on the
 * parked `hide` pose (off to the right) so whatever key comes next (Harvest, ?sep=swap, contact) interpolates from it.
 *
 *   exitKeys(name, { k, vh, hEnd, front, narrow }) -> pose keys (k = page.js's keyframe maker); [] for unknown names
 *   exitFade(name, { hEnd, vh }, y)               -> 0..1 canvas opacity multiplier at scroll y (1 outside the exit window)
 *
 * Pose axes (see samplePose in shared/gb/scene.js): xf = x in half-widths of the view, y/z world units, rx top-toward-viewer
 * is positive, s = scale (1 fits 80% of the view), cart = cartridge insert (1 seated, 0 lifted out), fill stays 0.
 */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }

export const EXIT_NAMES = ['drop', 'spin', 'dock', 'peek', 'float', 'flip']
/** The parked pose every exit ends on (same as page.js `hide`). */
const HIDE = { xf: 1.9, y: -0.2, z: -1, rx: 0, ry: 0.5, rz: -0.3, s: 0.7, cart: 1, fill: 0 }
/** vh-fractions over which the canvas fades to 0 (ends before the final hide key, which may sweep back in unseen). */
const FADE = { drop: [0.86, 0.97], spin: [0.85, 0.97], dock: [0.55, 0.92], peek: [0.9, 0.98], float: [0.35, 0.92], flip: [0.8, 0.95] }

export function exitFade(name, { hEnd, vh }, y) {
  const f = FADE[name]
  const u = (y - hEnd) / vh
  if (!f || u <= 0 || u > 1) return 1
  return 1 - smooth(f[0], f[1], u)
}

export function exitKeys(name, { k, vh, hEnd, front, narrow }) {
  if (!EXIT_NAMES.includes(name)) return []
  const at = (f, pose) => k(hEnd + f * vh, { fill: 0, cart: 1, ...pose })
  const S0 = { ...front, z: 0.3, rx: -0.12, ry: -0.5, rz: 0.12, cart: 1 }
  const end = at(1, HIDE)
  const halfH = 12 * Math.tan((30 * Math.PI) / 360)

  switch (name) {
    case 'drop': {
      const low = front.y - 3.2
      return [
        at(0, S0),
        at(0.1, { ...S0, y: front.y + 0.3, rx: -0.5, ry: -0.3, rz: 0.05, s: front.s * 1.02 }), // tilts back, a small wind-up
        at(0.36, { ...S0, y: low, z: 0.6, rx: -0.45, ry: -0.2, rz: 0.04, cart: 0.35 }), // falls, cartridge starts to pop
        at(0.46, { ...S0, y: low + 0.9, z: 0.4, rx: -0.3, ry: -0.2, rz: -0.03, cart: 0.1 }), // the bounce
        at(0.58, { ...S0, y: low - 0.2, z: 0.6, rx: -0.4, ry: -0.2, rz: 0.03, cart: 0 }),
        at(0.78, { ...S0, y: front.y - 9, z: 0.8, rx: -0.2, ry: -0.2, rz: 0.1, cart: 0 }),
        end,
      ]
    }
    case 'spin': {
      const T = Math.PI * 2
      const r = (f) => ({ ...S0, ry: -0.5 + T * f })
      const sx = (f) => front.xf + (0.95 - front.xf) * f
      return [
        at(0, S0),
        at(0.2, { ...r(0.25), xf: sx(0.2), y: front.y + 0.15, s: front.s * 0.92, rx: -0.1 }),
        at(0.4, { ...r(0.5), xf: sx(0.45), y: front.y + 0.2, s: front.s * 0.7, rx: -0.08 }),
        at(0.6, { ...r(0.75), xf: sx(0.75), y: front.y + 0.15, s: front.s * 0.45, rx: -0.08 }),
        at(0.8, { ...r(1), xf: 1.0, y: front.y + 0.1, s: front.s * 0.2, rx: -0.05, rz: 0 }),
        at(0.9, { ...r(1), xf: 1.1, y: front.y + 0.1, s: 0.03, rx: 0, rz: 0 }),
        end,
      ]
    }
    case 'dock': {
      // target: the header's top right, beside the nav / menu button
      const dock = narrow
        ? { xf: 0.62, y: halfH - 0.8, s: 0.1 }
        : { xf: 0.9, y: halfH - 0.98, s: 0.13 }
      const tgt = { ...dock, z: 0, rx: -0.02, ry: -0.1, rz: 0, cart: 1 }
      return [
        at(0, S0),
        at(0.2, { ...S0, xf: (front.xf + dock.xf) / 2, y: (front.y + dock.y) / 2 + 0.6, z: 0.1, rx: -0.1, ry: -0.35, rz: 0.06, s: (front.s + dock.s) / 2, cart: 1 }),
        at(0.5, tgt),
        at(0.92, tgt),
        end,
      ]
    }
    case 'peek': {
      // only the console's top-left corner (and the cartridge on top) stays inside the screen edge
      const pk = narrow ? { xf: 1.4, y: front.y + 0.8 } : { xf: 1.3, y: front.y + 0.75 }
      const peek = { ...S0, ...pk, z: 0, rx: -0.15, ry: -0.7, rz: 0.4, s: front.s * 0.95, cart: 0.8 }
      return [
        at(0, S0),
        at(0.28, peek),
        at(0.6, { ...peek, xf: pk.xf - 0.015, y: pk.y + 0.04, rz: 0.37 }), // a small hold, easing in on the edge
        at(0.88, { ...peek, xf: 2.4, y: pk.y + 0.2, rz: 0.5, cart: 1 }),
        end,
      ]
    }
    case 'float': {
      return [
        at(0, S0),
        at(0.45, { ...S0, y: front.y + 2.0, z: -3, rx: -0.2, ry: -0.35, rz: 0.3, s: front.s * 0.85 }),
        at(0.9, { ...S0, y: front.y + 4.2, z: -9, rx: -0.3, ry: -0.2, rz: 0.55, s: front.s * 0.5 }),
        end,
      ]
    }
    case 'flip': {
      return [
        at(0, S0),
        at(0.28, { ...S0, y: front.y + 0.2, z: 0.1, rx: 1.6, ry: -0.3, rz: 0.05 }), // edge-on, screen facing the floor
        at(0.6, { ...S0, y: front.y + 0.25, z: -0.8, rx: 3.0, ry: -0.2, rz: 0.04, s: front.s * 0.85 }), // back to the viewer
        at(0.88, { ...S0, y: front.y + 1.0, z: -2.5, rx: 3.3, ry: -0.1, rz: 0, s: front.s * 0.4 }),
        end,
      ]
    }
    default:
      return []
  }
}
