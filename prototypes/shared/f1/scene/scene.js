import * as THREE from 'three'
import { config, palette } from '../config.js'
import { carRef } from '../car/ref.js'
import { time } from '../core/time.js'

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
export const key = new THREE.DirectionalLight(0xe4eaff, 2.4)
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


// Track surface under the car: asphalt grain plus a faint lane line and edge line, in a tinted
// alpha texture that scrolls along -X at the airflow's speed, so the road reads as moving under the
// car in step with the streamlines and the wheels.
const TRACK_LEN = 96
const TRACK_WID = 16
const TRACK_TILE = 16
function trackTextures() {
  const N = 1024
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')
  g.clearRect(0, 0, N, N)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = `rgba(255,255,255,${(0.05 + rnd() * 0.22).toFixed(3)})`
    const r = 0.6 + rnd() * 1.6
    g.fillRect(rnd() * N, rnd() * N, r, r)
  }
  // Edge line (solid) and lane line (dashed), running along the tile's x axis.
  g.fillStyle = 'rgba(255,255,255,0.32)'
  g.fillRect(0, N * 0.14, N, 9)
  for (let x = 0; x < N; x += N / 4) g.fillRect(x, N * 0.62, N / 8, 7)
  // Kerb: broken blocks along the far edge.
  for (let x = 0; x < N; x += N / 16) g.fillRect(x, N * 0.9, N / 32, 18)
  const map = new THREE.CanvasTexture(c)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(TRACK_LEN / TRACK_TILE, 1)
  map.anisotropy = 4

  const a = document.createElement('canvas')
  a.width = 256
  a.height = 64
  const ag = a.getContext('2d')
  const grad = ag.createLinearGradient(0, 0, 256, 0)
  grad.addColorStop(0, '#000'); grad.addColorStop(0.22, '#fff'); grad.addColorStop(0.78, '#fff'); grad.addColorStop(1, '#000')
  ag.fillStyle = grad
  ag.fillRect(0, 0, 256, 64)
  const vg = ag.createLinearGradient(0, 0, 0, 64)
  vg.addColorStop(0, 'rgba(0,0,0,1)'); vg.addColorStop(0.3, 'rgba(0,0,0,0)'); vg.addColorStop(0.7, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,1)')
  ag.fillStyle = vg
  ag.fillRect(0, 0, 256, 64)
  const alpha = new THREE.CanvasTexture(a)
  return { map, alpha }
}
const trackTex = trackTextures()
const track = new THREE.Mesh(
  new THREE.PlaneGeometry(TRACK_LEN, TRACK_WID),
  new THREE.MeshBasicMaterial({
    map: trackTex.map, alphaMap: trackTex.alpha, transparent: true, depthWrite: false,
    color: 0x9a8fb0, opacity: 0.35, toneMapped: false,
  })
)
track.rotation.x = -Math.PI / 2
track.renderOrder = -3
scene.add(track)

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

// Paper (light theme only): a big white sheet under the car with a radial falloff, so the ground reads
// as the white track of the reference near the car and melts into the page's cream toward the edges
// (the stage background has to stay the page colour or the stage would show a seam).
const paper = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: blob, color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false })
)
paper.rotation.x = -Math.PI / 2
paper.renderOrder = -4
paper.scale.set(120, 80, 1)
paper.visible = false
scene.add(paper)

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

  paper.visible = Boolean(def.paper?.visible)
  if (def.paper?.visible) paper.material.opacity = def.paper.opacity
  shadow.visible = Boolean(def.shadow.visible)
  if (def.shadow.visible) shadow.material.opacity = def.shadow.opacity
  track.material.color.set(def.track.color)
  track.material.opacity = def.track.opacity
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
  track.position.y = config.airflow.groundY + 0.003
  trackTex.map.offset.x = time.flow / TRACK_TILE
  // Opens a little ahead of the field's own depth reveal and finishes with it.
  const a = config.airflow
  const reveal = Math.max(
    0,
    Math.min(1, (scrollProgress - (a.depthStart - 0.1)) / (a.depthEnd - a.depthStart + 0.1))
  )
  gridHelper.material.opacity = gridStyle.base + reveal * gridStyle.reveal

  if (carRef.ready) {
    if (paper.visible) paper.position.set(carRef.center.x, config.airflow.groundY - 0.004, carRef.center.z)
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