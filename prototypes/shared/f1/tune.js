// Tunable settings for the F1 scene: the "currents" (streamlines) and the car livery surfaces.
//
// The scene reads ONE flat object per concern, so a tuner (anim/f1-tune.html) can drive it and the live
// page can later bake the tuned numbers by editing PRESETS below. Nothing here touches three.js.
//
//   currents.<key>   see CURRENT_FIELDS for the meaning, range and unit of each key
//   livery.<key>     see LIVERY_FIELDS
//
// Two presets: 'classic' reproduces the original field exactly (550 x 3 hairlines), 'optimised' uses
// fewer, thicker, tapered ribbons that are cheaper to draw. Each preset has a dark and a light table.

const CLASSIC_COMMON = {
  lines: 550, //        lanes per sheet
  sheets: 3, //         sheets sharing the lanes at staggered phases (total instances = lines * sheets)
  points: 34, //        vertices along one ribbon
  taper: 0, //          0..1 how much the width thins toward both ends
  endFade: 0, //        0..1 share of each half-line where alpha fades out
  widthVar: 0, //       0..1 per-line thickness variety
  alphaVar: 0, //       0..1 per-line opacity variety
  edgeSoft: 0, //       1 = anti-alias the ribbon edge in the shader (for lines wider than ~2px)
  length: 30, //        world units
  cycleRatio: 2, //     cycle length / line length (how far a line travels before it recycles)
  speed: 1.7, //        world units per second
  wheelSync: 1, //      tyre rolling speed as a multiple of the flow speed
  spread: 24, //        half-width of the field
  laneBias: 1, //       >1 packs lanes toward the car, 1 is even
  bend: 0.42, //        how far the lines are pushed sideways around the body
  upstream: 2.76, //    how far ahead of the nose the field starts to react
  wake: 0.31, //        sideways spread behind the car
  turb: 0.15, //        turbulence amount
  wobble: 0.02, //      always-on micro wobble
  bandWidth: 1.2, //    lanes within this distance of the centre use the near-car accent colour
  nearMix: 0.45, //     how much the near colour washes into lines that were deflected
  midMix: 0.92, //      share of lines using the mid colour
  vortex: 1, //         1 keeps the (currently inert) vortex stage in the shader, 0 compiles it out
}

export const PRESETS = {
  classic: {
    dark: {
      ...CLASSIC_COMMON,
      thickness: 2.66, opacity: 0.34, additive: 1,
      colFar: '#cba6c3', colMid: '#886593', colNear: '#e5113c', nearGain: 2.3, colSep: '#e23e64',
      fadeNear: 1e5, fadeFar: 2e5, fadeMin: 1,
    },
    light: {
      ...CLASSIC_COMMON,
      thickness: 1.4, opacity: 0.6, additive: 0,
      colFar: '#566690', colMid: '#3a4f8f', colNear: '#ff3b2a', nearGain: 1, colSep: '#ff4a2a',
      fadeNear: 14, fadeFar: 46, fadeMin: 0.12,
    },
  },
  optimised: {
    dark: {
      ...CLASSIC_COMMON,
      lines: 170, sheets: 2, points: 18, taper: 0.5, endFade: 0.3, edgeSoft: 1, widthVar: 0.55, alphaVar: 0.4,
      laneBias: 1.35, bandWidth: 1.2, vortex: 0,
      thickness: 4.2, opacity: 0.5, additive: 1,
      colFar: '#cba6c3', colMid: '#886593', colNear: '#e5113c', nearGain: 2.3, colSep: '#e23e64',
      fadeNear: 1e5, fadeFar: 2e5, fadeMin: 1,
    },
    light: {
      ...CLASSIC_COMMON,
      lines: 170, sheets: 2, points: 18, taper: 0.5, endFade: 0.3, edgeSoft: 1, widthVar: 0.55, alphaVar: 0.4,
      laneBias: 1.35, bandWidth: 1.2, vortex: 0,
      thickness: 3.6, opacity: 0.8, additive: 0,
      colFar: '#566690', colMid: '#3a4f8f', colNear: '#ff3b2a', nearGain: 1, colSep: '#ff4a2a',
      fadeNear: 14, fadeFar: 46, fadeMin: 0.12,
    },
  },
}

export const DEFAULT_PRESET = 'optimised'

// Keys whose change alters the instance buffers or the shader program, so the field is rebuilt.
export const REBUILD_KEYS = new Set([
  'lines', 'sheets', 'points', 'spread', 'laneBias', 'length', 'cycleRatio', 'bandWidth', 'midMix', 'vortex', 'edgeSoft',
])

// Control schema for the tuner. [key, label, min, max, step]
export const CURRENT_FIELDS = [
  ['Lines', [
    ['lines', 'Lanes per sheet', 20, 700, 1],
    ['sheets', 'Sheets', 1, 4, 1],
    ['laneBias', 'Pack toward car', 1, 2.5, 0.01],
    ['spread', 'Field half-width', 8, 40, 0.5],
    ['thickness', 'Thickness (px)', 0.5, 12, 0.05],
    ['taper', 'Taper to ends', 0, 1, 0.01],
    ['endFade', 'Fade at ends', 0, 1, 0.01],
    ['widthVar', 'Thickness variety', 0, 1, 0.01],
    ['alphaVar', 'Opacity variety', 0, 1, 0.01],
    ['points', 'Ribbon points', 4, 48, 1],
    ['length', 'Trail length', 4, 60, 0.5],
    ['cycleRatio', 'Recycle distance (x length)', 1.1, 4, 0.05],
  ]],
  ['Motion', [
    ['speed', 'Speed', 0, 6, 0.05],
    ['wheelSync', 'Wheel spin (x speed)', 0, 3, 0.01],
    ['turb', 'Turbulence', 0, 1, 0.005],
    ['wobble', 'Wobble', 0, 0.3, 0.005],
  ]],
  ['Around the car', [
    ['bend', 'Bend around body', 0, 2.5, 0.01],
    ['upstream', 'Reaction reach (ahead)', 0.5, 8, 0.05],
    ['wake', 'Wake spread', 0, 1.5, 0.01],
    ['bandWidth', 'Near-car lanes', 0, 4, 0.05],
    ['nearMix', 'Near colour into bent lines', 0, 1, 0.01],
    ['midMix', 'Mid colour share', 0, 1, 0.01],
  ]],
  ['Colour and opacity', [
    ['opacity', 'Opacity', 0.02, 1, 0.01],
    ['fadeNear', 'Distance fade starts', 2, 200, 1],
    ['fadeFar', 'Distance fade ends', 3, 300, 1],
    ['fadeMin', 'Distance fade floor', 0, 1, 0.01],
    ['nearGain', 'Near colour glow', 0.5, 4, 0.05],
  ]],
]
export const CURRENT_COLOURS = [
  ['colNear', 'Near car (accent)'],
  ['colSep', 'Deflected wash'],
  ['colMid', 'Far, secondary'],
  ['colFar', 'Far, main'],
]

// ---- livery surfaces -----------------------------------------------------------------------------------------
// Offsets and multipliers layered over the livery's per-theme defaults (car/livery.js), all neutral at rest.
export const LIVERY_DEFAULTS = {
  paintRough: 0, //       added to the paint roughness
  clearcoat: 1, //        paint clearcoat strength
  clearcoatRough: 0, //   added to the clearcoat roughness
  paintEnv: 1, //         multiplier on paint reflections
  carbonRough: 0, //      added to the carbon roughness
  carbonSheen: 1, //      weave sheen strength
  carbonEnv: 1,
  tyreRough: 0,
  tyreEnv: 1,
  glassRough: 0,
}
export const LIVERY_FIELDS = [
  ['paintRough', 'Paint roughness (+)', -0.2, 0.5, 0.005],
  ['clearcoat', 'Paint clearcoat', 0, 1, 0.01],
  ['clearcoatRough', 'Clearcoat roughness (+)', -0.05, 0.5, 0.005],
  ['paintEnv', 'Paint reflections', 0, 3, 0.01],
  ['carbonRough', 'Carbon roughness (+)', -0.2, 0.6, 0.005],
  ['carbonSheen', 'Carbon weave sheen', 0, 2.5, 0.01],
  ['carbonEnv', 'Carbon reflections', 0, 3, 0.01],
  ['tyreRough', 'Tyre roughness (+)', -0.3, 0.2, 0.005],
  ['tyreEnv', 'Tyre reflections', 0, 3, 0.01],
  ['glassRough', 'Glass roughness (+)', -0.1, 0.5, 0.005],
]
