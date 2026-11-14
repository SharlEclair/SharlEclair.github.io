import * as THREE from 'three'
import { config, palette } from '../config.js'

export const scene = new THREE.Scene()
scene.background = new THREE.Color(palette.backgroundTop)

// The car's reflections come from a generated environment map, so these lights
// only shape the dark parts of the body. Without them the car would be lit
// purely by its surroundings and read as chrome rather than a silhouette.
//
// Very soft ambient so the car reads as a dark silhouette but never pure black.
const hemi = new THREE.HemisphereLight(0xcba6c3, 0x1d1720, 0.9)
scene.add(hemi)

const key = new THREE.DirectionalLight(0xffffff, 1.4)
key.position.set(6, 12, 4)
scene.add(key)

const fill = new THREE.DirectionalLight(0x886593, 0.55)
fill.position.set(-8, 4, -6)
scene.add(fill)

// Ground grid: a visual confirmation that the airflow field's floor is real.
//
// Its height is `config.airflow.groundY`, NOT an independent constant. The
// shader clamps every line to that plane, so a grid at a different height would
// draw a surface where nothing is actually being held -- and the mismatch is
// invisible until you compare the two closely. Read from the config so the two
// cannot drift.
const gridHelper = new THREE.GridHelper(60, 60, 0x2a1f2e, 0x231a27)
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
  gridHelper.material.opacity = 0.05 + reveal * 0.30
}