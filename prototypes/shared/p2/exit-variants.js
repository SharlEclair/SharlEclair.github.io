/**
 * ?exit= variants: takes on the DEFAULT hero exit. The default (no ?exit=) glides the held pose at hEnd (the scroll position
 * where the hero's pinned runway ends) to a slightly turned, smaller, raised pose, then to the parked `hide` pose off to the
 * right at hEnd + 0.5 vh. Each variant here keeps that path and character, begins on exactly the same pose at hEnd (so the
 * approach from the hero hold is unchanged) and changes one thing. All end exactly on `hide` by hEnd + 1 vh at the latest,
 * so whatever key comes next (Harvest, ?sep=swap, contact) interpolates from it. No canvas fade is needed (the console
 * ends off screen, as in the default), so exitFade stays 1 everywhere.
 *
 *   settle  longer, softer glide; the tilt overshoots slightly and settles before leaving
 *   arc     a gentle rise on the way out, sliding slightly past the park point and easing back (small overshoot)
 *   shrink  slow drift that scales down while sliding, the cartridge popping at the very end and seating again
 *   turn    rotates further so the back of the shell shows briefly, then comes round to the park pose
 *   face    keeps the screen facing the viewer longer, then swings away late
 *
 *   exitKeys(name, { k, vh, hEnd, front, narrow }) -> pose keys (k = page.js's keyframe maker); [] for unknown names
 *   exitFade(name, { hEnd, vh }, y)               -> 0..1 canvas opacity multiplier at scroll y (always 1 here)
 *
 * Pose axes (see samplePose in shared/gb/scene.js): xf = x in half-widths of the view, y/z world units, rx top-toward-viewer
 * is positive, s = scale (1 fits 80% of the view), cart = cartridge insert (1 seated, 0 lifted out), fill stays 0.
 */
export const EXIT_NAMES = ['settle', 'arc', 'shrink', 'turn', 'face']
/** The parked pose every exit ends on (same as page.js `hide`). */
const HIDE = { xf: 1.9, y: -0.2, z: -1, rx: 0, ry: 0.5, rz: -0.3, s: 0.7, cart: 1, fill: 0 }

export function exitFade() {
  return 1
}

export function exitKeys(name, { k, vh, hEnd, front }) {
  if (!EXIT_NAMES.includes(name)) return []
  const at = (f, pose) => k(hEnd + f * vh, { fill: 0, cart: 1, ...pose })
  // the default's key at hEnd, so every variant starts identically
  const A = { xf: front.xf + 0.15, y: front.y + 0.5, z: -0.5, rx: -0.2, ry: -0.9, rz: 0.4, s: front.s * 0.7, cart: 1 }
  const end = (f) => at(f, HIDE)

  switch (name) {
    case 'settle':
      return [
        at(0, A),
        at(0.3, { ...A, xf: front.xf + 0.5, y: front.y + 0.6, rx: -0.12, ry: -0.7, rz: 0.12, s: front.s * 0.66 }), // tilt rights itself past level
        at(0.55, { xf: 1.1, y: front.y + 0.35, z: -0.8, rx: -0.04, ry: -0.2, rz: -0.12, s: front.s * 0.62 }), // overshoots, then settles
        at(0.8, { xf: 1.65, y: 0.0, z: -0.95, rx: 0, ry: 0.3, rz: -0.32, s: 0.7 }),
        end(0.9),
      ]
    case 'arc':
      return [
        at(0, A),
        at(0.3, { ...A, xf: front.xf + 0.7, y: front.y + 1.1, z: -0.7, rx: -0.15, ry: -0.6, rz: 0.2 }), // rises on the arc
        at(0.6, { xf: 1.7, y: front.y + 0.6, z: -0.9, rx: -0.05, ry: -0.1, rz: -0.1, s: 0.7 }),
        at(0.8, { ...HIDE, xf: 2.05, y: -0.1, z: -1.05 }), // a touch past the park point
        end(0.9),
      ]
    case 'shrink':
      return [
        at(0, A),
        at(0.35, { ...A, xf: front.xf + 0.6, y: front.y + 0.45, z: -0.7, rx: -0.12, ry: -0.7, rz: 0.3, s: front.s * 0.5 }),
        at(0.7, { xf: 1.5, y: 0.0, z: -0.9, rx: -0.04, ry: -0.2, rz: 0, s: 0.52, cart: 0.9 }),
        at(0.88, { xf: 1.8, y: -0.15, z: -1, rx: 0, ry: 0.3, rz: -0.25, s: 0.62, cart: 0.35 }), // the cartridge pops out
        end(1),
      ]
    case 'turn':
      return [
        at(0, A),
        at(0.25, { ...A, xf: front.xf + 0.45, y: front.y + 0.6, rx: -0.15, ry: -2.1, rz: 0.3 }),
        at(0.45, { xf: 1.0, y: front.y + 0.5, z: -0.7, rx: -0.1, ry: -3.0, rz: 0.15, s: front.s * 0.66 }), // the back of the shell
        at(0.75, { xf: 1.65, y: 0.0, z: -0.95, rx: -0.02, ry: -1.3, rz: -0.2, s: 0.7 }),
        end(0.95),
      ]
    case 'face':
      return [
        at(0, A),
        at(0.2, { ...A, xf: front.xf + 0.35, y: front.y + 0.4, rx: -0.1, ry: -0.3, rz: 0.1, s: front.s * 0.75 }), // turns to face the viewer
        at(0.5, { xf: 0.95, y: front.y + 0.3, z: -0.6, rx: -0.06, ry: -0.2, rz: 0.04, s: front.s * 0.66 }), // screen still toward us
        at(0.8, { xf: 1.6, y: 0.0, z: -0.9, rx: -0.02, ry: 0.1, rz: -0.2, s: 0.7 }),
        end(0.95),
      ]
    default:
      return []
  }
}
