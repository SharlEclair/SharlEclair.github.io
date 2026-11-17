import * as THREE from 'three'
import { config, palette } from '../config.js'
import { carRef } from '../car/ref.js'

export const scene = new THREE.Scene()
scene.background = new THREE.Color(palette.backgroundTop)

// The car's reflections come from a generated environment map, so these lights
// only shape the dark parts of the body. Without them the car would be lit
// purely by its surroundings and read as chrome rather than a silhouette.
//
// Very soft ambient so the car reads as a dark silhouette but never pure black.
export const hemi = new THREE.HemisphereLight(0x8a6a9a, 0x0c080e, 0.4)
scene.add(hemi)

// Warm window-light from above and to one side: the single key of a chiaroscuro set-up.
export const key = new THREE.DirectionalLight(0xffdcaa, 2.1)
key.position.set(5, 12, 3)
scene.add(key)

// A violet rim from behind, so the dark body separates from the dark room.
export const fill = new THREE.DirectionalLight(0x8e68d8, 1.1)
fill.position.set(-8, 4, -6)
scene.add(fill)

// Ground grid: a visual confirmation that the airflow field's floor is real.
//
// Its height is `config.airflow.groundY`, NOT an independent constant. The
// shader clamps every line to that plane, so a grid at a different height would
// draw a surface where nothing is actually being held -- and the mismatch is
// invisible until you compare the two closely. Read from the config so the two
// cannot drift.
function makeGrid(centre, line) {
  const grid = new THREE.GridHelper(60, 60, centre, line)
  grid.position.y = config.airflow.groundY
  grid.material.opacity = 0.35
  grid.material.transparent = true
  grid.material.depthWrite = false
  return grid
}
let gridHelper = makeGrid(0x4a3a2a, 0x231a27)
scene.add(gridHelper)
let gridStyle = { base: 0.03, reveal: 0.2 }

// Soft radial blob, as a texture: the contact shadow (light theme) and the faint halo (dark theme).
function radialTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.7)')
  g.addColorStop(0.75, 'rgba(255,255,255,0.2)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
const blob = radialTexture()

// Contact shadow: a flat ink blob on the ground under the car (light theme only).
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: blob, color: 0x131312, transparent: true, opacity: 0.34, depthWrite: false, toneMapped: false })
)
shadow.rotation.x = -Math.PI / 2
shadow.renderOrder = -2
shadow.visible = false
scene.add(shadow)

// Halo: a barely-there glow BEHIND the car (dark theme only). A camera-facing sprite pushed back
// along the view ray, depth tested so the car and lines sit in front of it.
const halo = new THREE.Sprite(
  new THREE.SpriteMaterial({ map: blob, color: 0x7c5cc4, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
)
halo.renderOrder = -1
halo.visible = false
scene.add(halo)
const _toCar = new THREE.Vector3()

// Restyle the scene for a theme (theme.js): background, lights, grid, shadow and halo.
export function applySceneTheme(def) {
  scene.background = def.background()
  scene.userData.backgroundSynced = true

  const [sky, ground, hemiI] = def.lights.hemi
  hemi.color.set(sky)
  hemi.groundColor.set(ground)
  hemi.intensity = hemiI
  key.color.set(def.lights.key[0])
  key.intensity = def.lights.key[1]
  fill.color.set(def.lights.fill[0])
  fill.intensity = def.lights.fill[1]

  scene.remove(gridHelper)
  gridHelper.geometry.dispose()
  gridHelper.material.dispose()
  gridHelper = makeGrid(def.grid.center, def.grid.line)
  gridStyle = def.grid
  scene.add(gridHelper)

  shadow.visible = Boolean(def.shadow.visible)
  if (def.shadow.visible) shadow.material.opacity = def.shadow.opacity
  halo.visible = Boolean(def.glow.visible)
  if (def.glow.visible) {
    halo.material.color.set(def.glow.color)
    halo.material.opacity = def.glow.opacity
  }
}

export function updateScene(scrollProgress, camera = null) {
  // Follow the config if the ground has been moved, and fade the grid in as the
  // depth reveal opens the field up into a volume.
  gridHelper.position.y = config.airflow.groundY
  // Opens a little ahead of the field's own depth reveal and finishes with it.
  const a = config.airflow
  const reveal = Math.max(
    0,
    Math.min(1, (scrollProgress - (a.depthStart - 0.1)) / (a.depthEnd - a.depthStart + 0.1))
  )
  gridHelper.material.opacity = gridStyle.base + reveal * gridStyle.reveal

  if (carRef.ready) {
    if (shadow.visible) {
      shadow.position.set(carRef.center.x, config.airflow.groundY + 0.01, carRef.center.z)
      shadow.scale.set(carRef.size.x * 1.7, carRef.size.z * 2.7, 1)
    }
    if (halo.visible && camera) {
      // 3.5 units behind the car along the view ray; sized to the car, a little over.
      _toCar.copy(carRef.center).sub(camera.position)
      const dist = _toCar.length()
      _toCar.divideScalar(dist || 1)
      halo.position.copy(carRef.center).addScaledVector(_toCar, 3.5)
      const worldSize = Math.max(carRef.size.x, carRef.size.z) * 1.9 * ((dist + 3.5) / dist)
      halo.scale.set(worldSize, worldSize, 1)
    }
  }
  // palette.backgroundTop is rewritten by look.js before the first frame.
  if (!scene.userData.backgroundSynced) {
    scene.background.set(palette.backgroundTop)
    scene.userData.backgroundSynced = true
  }
}