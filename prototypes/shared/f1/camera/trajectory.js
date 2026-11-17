import * as THREE from 'three'
import { config } from '../config.js'

// Motion profiles for the trajectory. These reshape how scroll progress maps
// onto distance travelled, which changes the *feel* of the flight far more than
// the path geometry does.
//
//   linear   constant speed
//   sine     gentle ease in and out at both ends
//   cubic    stronger ease, heavier settle
//   quintic  very strong ease, almost a hold at each end
//   expo     very slow start, then a rush
//   outSine  quick start, gentle landing: the move shows from the first scroll tick
//
// Every one of these stays within 0..1. An overshooting curve (easeOutBack and
// friends) is NOT usable here: CatmullRomCurve3.getPoint cannot extrapolate --
// a t above 1 walks the control-point index off the end of the array and
// throws. Overshoot is therefore out of scope for this control set.
const EASINGS = {
  linear: (t) => t,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t) => Math.sin((Math.PI * t) / 2),
  cubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  quintic: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  expo: (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
}

export const EASING_NAMES = Object.keys(EASINGS)

export function applyEasing(name, t) {
  const fn = EASINGS[name] || EASINGS.linear
  // Clamped to 0..1 on purpose: getPoint() cannot accept values outside the
  // curve's own domain. The clamp is a safety net, not the effect -- all the
  // profiles above are already bounded.
  return THREE.MathUtils.clamp(fn(Number.isFinite(t) ? t : 0), 0, 1)
}

// Pull the aim point from the authored target curve toward the car's centre.
//
// This is the whole of the camera lock. At 0 the aim is exactly the sampled
// target-curve point (the behaviour before the lock existed); at 1 it is exactly
// `carCentre`, because Vector3.lerp with alpha 1 assigns rather than blends.
// Values between are a proportional lock, which reads as the camera tracking the
// car loosely rather than snapping to it.
//
// Returns the EFFECTIVE weight, not the configured one. It is 0 while the car is
// not loaded, and the caller scales the authored rotation layer by the same
// number -- which is the point of returning it: "how locked" and "how much
// authored framing is left" can never disagree, including in the not-loaded case
// where both must fall back together.
//
// Pure and exported for the same reason applyEasing is: the Node suite can
// exercise the blend without a DOM, a camera or a GPU.
export function applyCarLock(target, carCentre, lock, carReady) {
  const w = carReady ? THREE.MathUtils.clamp(Number(lock) || 0, 0, 1) : 0
  if (w > 0) target.lerp(carCentre, w)
  return w
}

export function buildCurves() {
  const c = config.camera
  const s = c.start
  const e = c.end

  const startPos = new THREE.Vector3(s.position.x, s.position.y, s.position.z)
  const endPos = new THREE.Vector3(e.position.x, e.position.y, e.position.z)
  const startTgt = new THREE.Vector3(s.target.x, s.target.y, s.target.z)
  const endTgt = new THREE.Vector3(e.target.x, e.target.y, e.target.z)

  const positionCurve = makeArcedCurve(
    startPos, endPos,
    c.trajectoryShape, c.trajectoryLift, c.trajectoryArcPos, c.trajectoryOrbit
  )
  const targetCurve = makeArcedCurve(
    startTgt, endTgt,
    c.trajectoryTargetShape, 0, c.trajectoryTargetArcPos, 0
  )

  positionCurve.arcLengthDivisions = c.trajectoryArcDivisions
  targetCurve.arcLengthDivisions = c.trajectoryArcDivisions

  return {
    positionCurve,
    targetCurve,
    startFov: s.fov,
    endFov: e.fov,
  }
}

// Build the flight path: start -> control point -> end.
//
// The control point is placed at start + (unit side * shape + unit up * lift)
// * dist * 0.35, and the whole bow is then swung around the travel axis by
// `orbit`. Because the bow has a fixed unit basis rather than a magnitude tied
// to `shape`, orbit works on its own: with shape and lift both 0 the bow is
// still a full-length vector pointing "up", so orbiting it sweeps the path
// through a circle around the travel axis.
//
// (An earlier version orbited `shape`'s own offset, which meant orbit did
// nothing at all whenever shape was 0 -- exactly the case it was most wanted.)
//
//   shape   sideways bow (positive = to one side of the travel direction)
//   lift    vertical bow (positive = the path rises mid-flight)
//   arcPos  where along the path that control point sits (0.5 = symmetric)
//   orbit   rotation of the bow around the start->end axis, in degrees
function makeArcedCurve(a, b, shape, lift, arcPos, orbitDeg) {
  const dir = b.clone().sub(a)
  const dist = dir.length()

  // A degenerate path has no meaningful basis; fall back to a plain two-point
  // curve rather than producing NaNs.
  if (dist < 1e-6) {
    return new THREE.CatmullRomCurve3([a.clone(), b.clone()], false, 'catmullrom', 0.5)
  }

  const forward = dir.clone().normalize()
  // "Up" is world up, made orthogonal to the travel direction so the basis is
  // well defined even when travelling straight up or down.
  const up = new THREE.Vector3(0, 1, 0)
  if (Math.abs(forward.dot(up)) > 0.999) up.set(1, 0, 0)
  const side = new THREE.Vector3().crossVectors(forward, up).normalize()
  const trueUp = new THREE.Vector3().crossVectors(side, forward).normalize()

  // The bow's direction, in the plane perpendicular to travel.
  const bow = new THREE.Vector3()
    .addScaledVector(side, shape)
    .addScaledVector(trueUp, lift)

  // Give the bow a magnitude. Normally it comes from shape and lift, but when
  // both are zero there is no direction and the bow collapses -- which would
  // leave `orbit` with nothing to swing, exactly the case where someone reaches
  // for it. One unit of bow in that situation makes orbit self-sufficient.
  //
  // With orbit at 0 this changes nothing at all, because a zero bow stays zero.
  if (bow.lengthSq() < 1e-12 && orbitDeg) bow.copy(trueUp)
  bow.multiplyScalar(dist * 0.35)

  // Swing the bow around the travel axis. A zero bow stays zero, which is the
  // one case where orbit has nothing to act on.
  if (orbitDeg) bow.applyAxisAngle(forward, THREE.MathUtils.degToRad(orbitDeg))

  const ctrl = a.clone().lerp(b, THREE.MathUtils.clamp(arcPos, 0.001, 0.999))
  ctrl.add(bow)

  return new THREE.CatmullRomCurve3([a.clone(), ctrl, b.clone()], false, 'catmullrom', 0.5)
}
