// Themes for the F1 scene: one table per theme, applied live by core/experience.js.
//
//   dark   the original chiaroscuro look: near-black studio, additive violet field, red band, bloom.
//   light  a printed technical drawing: cream paper, an ink car with vermilion wings, normal-blended
//          ink hairlines for the field, a soft contact shadow, no bloom.
//
// Everything that differs between the two lives here so the engine has no `if (light)` scattered
// through it. Colours that the dark look already owns (palette, LOOK) are read at apply time rather
// than copied, so the dark look cannot drift from the baseline.
import * as THREE from 'three'
import { palette } from './config.js'
import { LOOK } from './look.js'

export const PAGE_BACKGROUND = {
  dark: '#08080a',
  light: '#e8e6db',
}

// The renderer's NEUTRAL tone map crushes near-black: for the darkest colours it returns about
// 6.25 * c * c, so a scene background of #08080a would come out as #000000. This returns the linear
// scene colour whose TONE-MAPPED output is the requested sRGB hex, so the stage meets the page
// background exactly. Valid below the curve's 0.08 knee, which any near-black background is.
export function neutralCompensated(hex) {
  const target = new THREE.Color(hex) // linear working space
  const t = [target.r, target.g, target.b]
  const m = t.indexOf(Math.min(...t))
  const cm = 0.4 * Math.sqrt(t[m])
  const offset = cm - 6.25 * cm * cm
  const c = t.map((v) => v + offset)
  c[m] = cm
  return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace)
}

export function normaliseTheme(value) {
  return value === 'light' ? 'light' : 'dark'
}

export function readPageTheme() {
  return normaliseTheme(typeof document !== 'undefined' ? document.documentElement.dataset.theme : 'dark')
}

export const THEMES = {
  dark: {
    background: () => neutralCompensated(PAGE_BACKGROUND.dark),
    toneMapping: THREE.NeutralToneMapping,
    exposure: LOOK.exposure,
    bloom: { enabled: true },
    grade: { vignette: 0.12, aberration: LOOK.aberration, grain: LOOK.grain, edgeFade: 0, wash: 0 },
    glow: { visible: true, color: '#7c5cc4', opacity: 0.09 },
    shadow: { visible: false },
    paper: { visible: false },
    track: { color: '#a79cc4', opacity: 0.3 },
    lights: {
      hemi: [0x8a6a9a, 0x0c080e, 0.4],
      key: [0xffdcaa, 2.1],
      fill: [0x8e68d8, 1.1],
    },
    grid: { center: 0x4a3a2a, line: 0x231a27, base: 0.03, reveal: 0.2, normal: false },
    env: 'dark',
    airflow: {
      colors: () => ({
        base: new THREE.Color(palette.laminar),
        violet: new THREE.Color(palette.violet),
        separation: new THREE.Color(palette.separation),
        vortex: new THREE.Color(palette.vortex).multiplyScalar(LOOK.vortexGain),
        band: new THREE.Color(palette.band).multiplyScalar(LOOK.bandGain),
      }),
      additive: true,
      opacity: 0.34,
      lineThickness: 2.66,
      fade: { near: 1e5, far: 2e5, min: 1 },
    },
    car: {
      finish: 'obsidian',
      color: '#0A090E',
      roughness: 0.2,
      metalness: 0.88,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.3,
      accent: null,
    },
  },

  light: {
    background: () => new THREE.Color(PAGE_BACKGROUND.light),
    toneMapping: THREE.NoToneMapping,
    exposure: 1,
    bloom: { enabled: false },
    // wash: paper tint over the page's text zone, so ink type stays readable over the hairlines.
    grade: { vignette: 0, aberration: 0, grain: 0, edgeFade: 0, wash: 0.5 },
    glow: { visible: false },
    shadow: { visible: true, opacity: 0.4 },
    paper: { visible: true, opacity: 0.75 },
    track: { color: '#2b3347', opacity: 0.4 },
    lights: {
      hemi: [0xffffff, 0xcfc8b6, 0.7],
      key: [0xffffff, 1.2],
      fill: [0xdfe4ff, 0.35],
    },
    grid: { center: 0x131312, line: 0x131312, base: 0.05, reveal: 0.1, normal: true },
    env: 'light',
    airflow: {
      colors: () => ({
        base: new THREE.Color('#566690'),
        violet: new THREE.Color('#3a4f8f'),
        separation: new THREE.Color('#ff4a2a'),
        vortex: new THREE.Color('#2c3a63'),
        band: new THREE.Color('#ff3b2a'),
      }),
      additive: false,
      opacity: 0.6,
      lineThickness: 1.4,
      fade: { near: 14, far: 46, min: 0.12 },
    },
    car: {
      finish: 'obsidian',
      color: '#f4f6f9',
      roughness: 0.24,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.0,
      accent: null,
    },
  },
}
