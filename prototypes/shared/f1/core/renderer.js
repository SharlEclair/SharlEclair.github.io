import * as THREE from 'three'

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
export function createRenderer(canvas) {
  const el = canvas || document.querySelector('#webgl')
  if (!el) throw new Error('[F1 x Currents] no canvas available to render into')

  const renderer = new THREE.WebGLRenderer({
    canvas: el,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })

  const resize = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
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

  renderer.disposeAll = () => {
    window.removeEventListener('resize', resize)
    renderer.dispose()
  }

  return renderer
}
