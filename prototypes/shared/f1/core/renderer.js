import * as THREE from 'three'
import { setViewport } from './viewport.js'
import { glParams } from '/shared/gl/params.js'

// The renderer is created on demand rather than at module scope.
//
// Module scope was safe while the app had exactly one page: the canvas from
// index.html was always there and always the only one. It stops being safe the
// moment a second entry point exists, because a module-scope
// `document.querySelector('#webgl')` runs on whatever HTML happens to be
// loaded, and a duplicate id hands the same element to two renderers -- the
// second getContext() call returns null and the page dies with no useful error.
//
// Deferring to a call makes each entry point own its own canvas explicitly.
export function createRenderer(canvas, { sizeTo = null, maxPixelRatio = 1.5 } = {}) {
  const el = canvas || document.querySelector('#webgl')
  if (!el) throw new Error('[F1 x Currents] no canvas available to render into')

  const isFxaa = glParams.aa === 'fxaa'
  const renderer = new THREE.WebGLRenderer({
    canvas: el,
    antialias: isFxaa ? false : (glParams.aa ?? true),
    alpha: false,
    powerPreference: 'high-performance',
  })

  // Sized to `sizeTo` when embedded in a page section, to the window otherwise.
  // The pixel ratio is capped: the bloom chain's cost scales with pixels, and
  // past ~1.5 the thin additive lines gain nothing visible.
  const resize = () => {
    const width = sizeTo ? sizeTo.clientWidth : window.innerWidth
    const height = sizeTo ? sizeTo.clientHeight : window.innerHeight
    const cap = glParams.dpr ?? maxPixelRatio
    const scale = typeof glParams.quality === 'number' ? glParams.quality : 1
    const ratio = Math.min(window.devicePixelRatio || 1, cap) * scale
    renderer.setPixelRatio(ratio)
    renderer.setSize(Math.max(1, width), Math.max(1, height), !sizeTo)
    setViewport(width, height, ratio)
  }

  resize()
  renderer.outputColorSpace = THREE.SRGBColorSpace

  // Neutral tone mapping.
  //
  // The car's finishes are metallic, so they show the environment map, which
  // contains light sources far above 1.0. Under three.js's default
  // NoToneMapping everything past white CLIPS, and highlights on a glossy dark
  // car become flat white patches -- measured at 255 on both the obsidian and
  // glossy presets before this was set.
  //
  // NEUTRAL rather than ACES, deliberately. ACES is the better filmic curve but
  // it desaturates saturated colour, and this composition is built on one: the
  // focal red band. Neutral (Khronos PBR Neutral) rolls the highlights off while
  // leaving hue and saturation close to untouched, which is what a bright
  // additive line field needs.
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0

  window.addEventListener('resize', resize)
  const observer = sizeTo && typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
  if (observer) observer.observe(sizeTo)

  renderer.disposeAll = () => {
    if (observer) observer.disconnect()
    window.removeEventListener('resize', resize)
    renderer.dispose()
  }

  return renderer
}
