import * as THREE from 'three'
import { config, palette } from '../config.js'

export const scene = new THREE.Scene()
scene.background = new THREE.Color(palette.backgroundTop)

// The car's reflections come from a generated environment map, so these lights
// only shape the dark parts of the body. Without them the car would be lit
// purely by its surroundings and read as chrome rather than a silhouette.
//
// Very soft ambient so the car reads as a dark silhouette but never pure black.
const hemi = new THREE.HemisphereLight(0x8a6a9a, 0x0c080e, 0.4)
scene.add(hemi)

// Warm window-light from above and to one side: the single key of a chiaroscuro set-up.
const key = new THREE.DirectionalLight(0xffdcaa, 2.1)
key.position.set(5, 12, 3)
scene.add(key)

// A violet rim from behind, so the dark body separates from the dark room.
const fill = new THREE.DirectionalLight(0x8e68d8, 1.1)
fill.position.set(-8, 4, -6)
scene.add(fill)

// Ground grid: a visual confirmation that the airflow field's floor is real.
//
// Its height is `config.airflow.groundY`, NOT an independent constant. The
// shader clamps every line to that plane, so a grid at a different height would
// draw a surface where nothing is actually being held -- and the mismatch is
// invisible until you compare the two closely. Read from the config so the two
// cannot drift.
const gridHelper = new THREE.GridHelper(60, 60, 0x4a3a2a, 0x231a27)
gridHelper.position.y = config.airflow.groundY
gridHelper.material.opacity = 0.35
gridHelper.material.transparent = true
gridHelper.material.depthWrite = false
scene.add(gridHelper)

export function updateScene(scrollProgress) {
  // Follow the config if the ground has been moved, and fade the grid in as the
  // depth reveal opens the field up into a volume.
  gridHelper.position.y = config.airflow.groundY
  const reveal = Math.max(
    0,
    Math.min(1, (scrollProgress - 0.3) / 0.3)
  )
  gridHelper.material.opacity = 0.03 + reveal * 0.2
  // palette.backgroundTop is rewritten by look.js before the first frame.
  if (!scene.userData.backgroundSynced) {
    scene.background.set(palette.backgroundTop)
    scene.userData.backgroundSynced = true
  }
}