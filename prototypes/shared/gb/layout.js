/**
 * Shared layout constants for the gameboy, in gameboy-local units (origin = body centre, +x right, +y up, +z toward
 * the viewer). Mirrors tools/gb_build.py (keep the two in sync). The body is 2.5 x 3.2 x 0.5 (0.78:1), after the
 * clear-smoke handheld in tools/ref, with the LCD (160:144) filling its black glass edge to edge.
 */
const SCREEN_H_UNITS = 1.71

export const L = {
  W: 2.5,
  H: 3.2,
  D: 0.5,
  front: 0.25, // z of the flat front face
  // Corner radii: top-left, top-right, bottom-right (the big one), bottom-left
  radii: [0.14, 0.14, 0.45, 0.18],
  // The black glass; the lit LCD (`screen`, 160:144) fills it with a thin dark border
  bezel: { x0: -0.99, x1: 0.99, y0: -0.27, y1: 1.52, r: 0.05 },
  screen: { cx: 0, cy: 0.625, w: (SCREEN_H_UNITS * 160) / 144, h: SCREEN_H_UNITS },
  dpad: { x: -0.62, y: -0.8, span: 0.74, arm: 0.245, ring: 0.42 },
  buttons: {
    a: { x: 0.78, y: -0.66 },
    b: { x: 0.38, y: -0.86 },
    r: 0.18,
    top: 0.086, // cap top above the front face
  },
  start: { x: -0.62, y: -1.35, w: 0.4, h: 0.12, rot: 0 }, // the blue on/off pill
  speaker: { x: 0.83, y: -1.19, r: 0.29 },
  port: { x: 0, w: 0.38 },
  holes: [{ x: -1.06, y: -0.4 }, { x: 0.06, y: -0.44 }, { x: -1.07, y: -1.22 }, { x: -0.14, y: -1.06 }, { x: 0.42, y: -1.2 }],
  // Cartridge bay: a frosted collar on the top edge
  bay: { w: 2.06, d: 0.4, h: 0.2, z: -0.06, slotW: 1.8, slotD: 0.24 },
  cart: { w: 1.74, h: 1.34, t: 0.2, z: -0.06, out: 0.74 }, // out = how far the seated cart's top sits above the body top
  // The board stays below the seated cart (cart bottom ~y 1.0)
  pcb: { w: 2.2, h: 1.9, y: -0.55, z: -0.04 },
}

/** Extents of the seated console (body + cart) used for the fit maths: top, bottom, width. */
L.extent = { top: L.H / 2 + L.cart.out, bottom: -L.H / 2, w: L.W }

export const SCREEN_W = 160
export const SCREEN_H = 144
