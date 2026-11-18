// The upgraded look, as one layer over the tuned baseline.
//
// The baseline's numbers live in config.js and are mirrored in three JSON files
// that the original project's test suite compares leaf by leaf. Rather than edit
// four files per value, the upgrade is applied here, once, at boot: a set of
// overrides written onto the live config, plus the few things that were never
// config (the studio environment, the HDR gains, the lights).
//
// Direction: chiaroscuro. A near-black lacquered car in a dark room, picked out
// by one warm window-light from above, a gold side key and a violet rim, with
// the red focal band of the line field as the only saturated colour. The line
// field keeps its Currents palette; it is the painting, the car is the sitter.
import * as THREE from 'three'
import { config, palette } from './config.js'

export const LOOK = {
  // HDR gains on the line field's two accent colours. Above 1.0 on purpose: the
  // scene renders into a half-float target and the bloom pass turns these, and
  // only these, into light.
  bandGain: 2.3,
  vortexGain: 1.7,
  // Post-processing.
  bloomStrength: 0.5,
  bloomRadius: 0.72,
  bloomThreshold: 0.86,
  // Barely there: the page blends this stage into its own background, so the corners must not darken.
  vignette: 0.12,
  aberration: 0.0016,
  grain: 0.035,
  exposure: 1.05,
  background: '#150E17',
}

export function applyLookToConfig() {
  palette.backgroundTop = LOOK.background
  palette.backgroundBottom = '#0C080E'

  Object.assign(config.car, {
    environment: true,
    finish: 'obsidian',
    color: '#0A090E',
    roughness: 0.2,
    metalness: 0.88,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.3,
  })

  // Scroll-scrubbed camera: the body eases in and out of the flight while the aim
  // moves on a gentler curve, so the car drifts in frame instead of the camera
  // snapping onto its rail at both ends. Slightly longer smoothing takes the
  // steps out of wheel input without making the scrub feel late.
  Object.assign(config.camera, {
    trajectoryEase: 'sine',
    trajectoryTargetEase: 'sine',
  })
  config.scroll.smoothing = 0.14

  // A touch more separation between the lavender field and the red band.
  config.airflow.opacity = 0.34

  // ---- Timeline: the whole piece plays inside ONE viewport height of scroll ----------------------
  // The page maps progress 0..1 to exactly 100vh (the standalone page does the same through its
  // runway), so there is no room for the original 3.45 vh journey: one short move from the top view
  // to the chase view, a gentle ease at each end instead of long holds.
  config.scroll.endVH = 1
  Object.assign(config.camera, {
    trajectoryOrbit: 64, //  was 102: a smaller swing around the car, still enough to turn the view
    dutchAngle: 6, //        was 15
  })
  config.camera.start.position.y = 21 //  was 28.9: starts nearer, so the car reads in the top view
  config.camera.end.fov = 48 //           was 55
  Object.assign(config.camera.end.position, { x: -6.7, y: 2.5 }) // pulled back so the whole car sits in the right 60%
  Object.assign(config.camera, { trajectoryEase: 'outSine', trajectoryTargetEase: 'outSine' })
  // The 2D -> 3D opening of the field lands mid-move instead of in the last tenth.
  Object.assign(config.airflow, {
    depthStart: 0.3,
    depthEnd: 0.68,
    turbStart: 0.8,
    turbEnd: 0.74,
    vortexStart: 0.1,
  })
}

// The room the lacquer reflects. Five emissive cards in the dark: nothing else
// exists, so every highlight on the car is one of these and can be placed.
export function createStudioEnvironment(renderer, theme = 'dark') {
  const scene = new THREE.Scene()
  const light = theme === 'light'
  scene.background = new THREE.Color(light ? 0xd9d5c6 : 0x040306)
  const card = (hex, gain, w, h, x, y, z) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(gain),
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material)
    mesh.position.set(x, y, z)
    mesh.lookAt(0, 0, 0)
    scene.add(mesh)
  }
  if (light) {
    // A bright paper studio: big white softboxes so the ink body shows soft gradients and a clean
    // sheen, one cool strip for the rim, and a low vermilion bounce so the red picks up on the lacquer.
    card('#FFFFFF', 3.2, 14, 5, 0, 9, 1.5) //    broad overhead softbox
    card('#FFF6E8', 2.2, 4, 7, 9, 3, -3) //      warm side panel
    card('#DDE4FF', 1.8, 4, 7, -9, 2.5, 4) //    cool rim
    card('#D3392B', 0.5, 9, 1.2, 0, -4, -6) //   a faint vermilion bounce from the floor
    card('#FFFFFF', 7.0, 0.9, 0.9, 3.5, 7, 8) //  one hard glint
    return finishEnvironment(renderer, scene)
  }
  card('#FFE4B8', 4.5, 12, 2.0, 0, 9, 1.5) //  long warm strip overhead: the window
  card('#F2B25C', 4.0, 3, 6, 9, 3, -3) //       gold side key
  card('#8E68D8', 5.0, 4, 7, -9, 2.5, 4) //     violet rim
  card('#E5113C', 3.0, 9, 0.8, 0, -4, -6) //    red underglow, the focal band reflected
  card('#FFFFFF', 14.0, 0.9, 0.9, 3.5, 7, 8) // one small hot source for sharp glints
  return finishEnvironment(renderer, scene)
}

function finishEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromScene(scene, 0.03)
  pmrem.dispose()
  scene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose()
      o.material.dispose()
    }
  })
  return target.texture
}
