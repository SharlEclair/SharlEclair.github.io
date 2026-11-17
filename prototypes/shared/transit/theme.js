/**
 * Transit Desert palettes. Two looks for the same scene:
 *
 *   light  a printed map: transparent canvas over cream paper, ink hairlines, violet search, vermilion route
 *   dark   a night plot: transparent canvas over near-black, luminous hairlines, violet search, vermilion route
 *
 * Colours are display-space (sRGB) hex strings; the shaders write them straight to the canvas.
 * `add` is how additive the glow layers are (0 = ordinary alpha over, 1 = pure light on black).
 */
export const THEMES = {
  dark: {
    paper: '#08080a',
    ink: '#ebe9e1',
    road: 0.22,
    major: 0.34,
    roofInk: 0.05,
    wallInk: 0.1,
    water: 0.07,
    park: 0.09,
    accent: '#9a7dff',
    accentHot: '#dcd2ff',
    settled: 0.62,
    contour: 0.22,
    haze: 0.4,
    route: '#ff5a30',
    routeHot: '#fff0e4',
    circuit: '#ebe9e1',
    circuitLit: '#f7f2e8',
    circuitAlpha: 0.5,
    label: '#f3f1ea',
    labelSub: 'rgba(243,241,234,.72)',
    add: 0.9,
    haloGain: 1
  },
  light: {
    paper: '#e8e6db',
    ink: '#131312',
    road: 0.3,
    major: 0.5,
    roofInk: 0.05,
    wallInk: 0.12,
    water: 0.07,
    park: 0.1,
    accent: '#4a28e8',
    accentHot: '#6f3dff',
    settled: 0.72,
    contour: 0.26,
    haze: 0.5,
    route: '#ff3512',
    routeHot: '#ff3512',
    circuit: '#131312',
    circuitLit: '#131312',
    circuitAlpha: 0.7,
    label: '#131312',
    labelSub: 'rgba(19,19,18,.72)',
    add: 0,
    haloGain: 0.6
  }
}

export function resolveTheme(value) {
  if (value === 'light' || value === 'dark') return value
  const attr = typeof document !== 'undefined' ? document.documentElement.dataset.theme : ''
  return attr === 'light' ? 'light' : 'dark'
}

/** '#rrggbb' -> [r, g, b] in 0..1 */
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
