import * as THREE from 'three'
import { config } from '../config.js'
import { scroll, setScrollToProgress } from '../core/scroll.js'
import { smoothstep } from '../utils/math.js'
import { buildCurves, applyEasing, applyCarLock } from './trajectory.js'
import { carRef } from '../car/ref.js'
import { viewport, onViewportChange } from '../core/viewport.js'

export const camera = new THREE.PerspectiveCamera(
  config.camera.start.fov,
  viewport.width / viewport.height,
  0.05,
  400
)

let curves = null
const _pos = new THREE.Vector3()
const _tgt = new THREE.Vector3()
const _lookQuat = new THREE.Quaternion()
const _aimQuat = new THREE.Quaternion()
const _euler = new THREE.Euler()
// Borrow three.js's camera aiming maths. This MUST be a Camera, not a plain
// Object3D: Object3D.lookAt aims its +Z axis at the target, while a camera
// renders along -Z. Using an Object3D here aims the camera exactly backwards.
const _aimRig = new THREE.PerspectiveCamera()

const DEG = THREE.MathUtils.degToRad

// Where the page puts its text: over the LEFT ~40% of the stage on desktop and the BOTTOM ~45% on a
// phone. The framing is rendered into the free area instead, by shrinking the camera's virtual frame
// to `scale` of the canvas and parking its centre at (cx, cy), as fractions of the canvas. That is
// setViewOffset with a frame smaller than the window, so the car keeps its proportions, sits in the
// clear area, and the field still runs edge to edge behind the text.
//
//   right   desktop: focus centred in the right 60% (x 0.40..1.00)
//   top     phone / portrait: focus centred in the top 55% (y 0..0.55)
//   center  no offset (the standalone page, or a page without overlaid text)
const LAYOUTS = {
  // scale0 at the top view, scale1 at the chase view (the car is wide there, so a narrow phone needs
  // more room); the two are blended across the move.
  right: { scale0: 0.88, scale1: 0.88, cx: 0.7, cy: 0.5 },
  top: { scale0: 0.8, scale1: 0.46, cx: 0.5, cy: 0.275 },
  center: null,
}
let layoutMode = 'auto'

export function resolveLayout() {
  if (layoutMode !== 'auto') return layoutMode
  return viewport.width / viewport.height < 0.9 ? 'top' : 'right'
}

// Sets the view window for the current layout and progress. Callers update the projection matrix.
function syncView() {
  const W = viewport.width
  const H = viewport.height
  camera.aspect = W / H
  const L = LAYOUTS[resolveLayout()]
  if (!L) {
    camera.clearViewOffset()
    camera.userData.viewScale = 1
    return
  }
  const scale = THREE.MathUtils.lerp(L.scale0, L.scale1, smoothstep(0.15, 1, scroll.progress))
  const fullW = W * scale
  const fullH = H * scale
  camera.setViewOffset(fullW, fullH, fullW / 2 - L.cx * W, fullH / 2 - L.cy * H, W, H)
  camera.userData.viewScale = scale
}

function applyLayout() {
  syncView()
  camera.updateProjectionMatrix()
}

// 'auto' | 'right' | 'top' | 'center'
export function setLayoutMode(mode) {
  layoutMode = mode in LAYOUTS || mode === 'auto' ? mode : 'auto'
  applyLayout()
}

export function initCamera() {
  curves = buildCurves()
  updateCamera()
  applyLayout()
  return onViewportChange(applyLayout)
}

export function rebuildCurves() {
  curves = buildCurves()
}

export function updateCamera() {
  if (!curves) return
  const p = scroll.progress

  // Position and aim travel with independent motion profiles, so the body can
  // ease out while the aim holds, or vice versa.
  const posP = applyEasing(config.camera.trajectoryEase, p)
  const tgtP = applyEasing(config.camera.trajectoryTargetEase, p)

  curves.positionCurve.getPoint(posP, _pos)
  curves.targetCurve.getPoint(tgtP, _tgt)

  camera.position.copy(_pos)

  // Car lock. The aim point is pulled toward the car's measured centre, so the
  // camera can hold the car in frame for the whole flight while still travelling
  // the start->end path. `lockW` is the effective weight (0 until the GLB has
  // loaded), and it also drives the rotation decay below.
  const lockW = applyCarLock(_tgt, carRef.center, config.camera.carLock, carRef.ready)

  // 1. Base orientation: aim at the target.
  _aimRig.position.copy(_pos)
  _aimRig.up.set(0, 1, 0)
  _aimRig.lookAt(_tgt)
  _lookQuat.copy(_aimRig.quaternion)

  // 2. Authored start/end orientation, interpolated along the same progress
  //    parameter and composed ON TOP of the aim. At 0/0/0 this is identity, so
  //    the camera lands exactly where the target aims it.
  //
  //    Scaled by (1 - lockW) so full lock is a TRUE look-at. Without this the
  //    authored pitch alone (14.6 -> -54.1 deg) would throw the aim up to ~54 deg
  //    off the car no matter how exactly the aim point was centred on it, which
  //    is the one thing the lock promises. The Dutch tilt below is deliberately
  //    NOT scaled: it is a roll about the view axis and cannot move the aim.
  const order = config.camera.rotationOrder || 'XYZ'
  const sr = config.camera.start.rotation
  const er = config.camera.end.rotation
  const rw = 1 - lockW
  _euler.set(
    DEG(THREE.MathUtils.lerp(sr.x, er.x, p) * rw),
    DEG(THREE.MathUtils.lerp(sr.y, er.y, p) * rw),
    DEG(THREE.MathUtils.lerp(sr.z, er.z, p) * rw),
    order
  )
  _aimQuat.setFromEuler(_euler)
  camera.quaternion.copy(_lookQuat).multiply(_aimQuat)

  camera.fov = THREE.MathUtils.lerp(curves.startFov, curves.endFov, p)
  syncView()
  camera.updateProjectionMatrix()

  // 3. Dutch tilt, ramped in over the tail of the scroll. Applied last so it
  //    rides on top of both the aim and the authored orientation.
  const dutchT = smoothstep(
    config.camera.dutchStart,
    config.camera.dutchEnd,
    p
  )
  camera.rotateZ(DEG(config.camera.dutchAngle) * dutchT)
}

export function snapToStart() {
  setScrollToProgress(0)
  updateCamera()
}

export function snapToEnd() {
  setScrollToProgress(1)
  updateCamera()
}

export function currentCameraState() {
  const dir = new THREE.Vector3()
  camera.getWorldDirection(dir)
  const target = camera.position.clone().add(dir.multiplyScalar(8.0))
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'XYZ')
  return {
    position: {
      x: +camera.position.x.toFixed(4),
      y: +camera.position.y.toFixed(4),
      z: +camera.position.z.toFixed(4),
    },
    target: {
      x: +target.x.toFixed(4),
      y: +target.y.toFixed(4),
      z: +target.z.toFixed(4),
    },
    fov: +camera.fov.toFixed(2),
    // Degrees, matching every other rotation field in the config.
    rotationDeg: {
      x: +THREE.MathUtils.radToDeg(e.x).toFixed(3),
      y: +THREE.MathUtils.radToDeg(e.y).toFixed(3),
      z: +THREE.MathUtils.radToDeg(e.z).toFixed(3),
    },
    dutchDeg: +THREE.MathUtils.radToDeg(camera.rotation.z).toFixed(3),
  }
}
