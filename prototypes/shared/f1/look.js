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
  vignette: 0.55,
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
}

// The room the lacquer reflects. Five emissive cards in the dark: nothing else
// exists, so every highlight on the car is one of these and can be placed.
export function createStudioEnvironment(renderer) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x040306)
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
  card('#FFE4B8', 7.0, 12, 2.0, 0, 9, 1.5) //  long warm strip overhead: the window
  card('#F2B25C', 4.0, 3, 6, 9, 3, -3) //       gold side key
  card('#8E68D8', 5.0, 4, 7, -9, 2.5, 4) //     violet rim
  card('#E5113C', 3.0, 9, 0.8, 0, -4, -6) //    red underglow, the focal band reflected
  card('#FFFFFF', 14.0, 0.9, 0.9, 3.5, 7, 8) // one small hot source for sharp glints

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
