import * as THREE from 'three'

// The car's measured world-space centre, shared with the camera.
//
// Why a module of its own rather than a field on the car object: the camera needs
// the centre on every frame, the car object only exists after an async GLB load,
// and `rig.js` must not import `experience.js` (which imports it back). A tiny
// store with no dependencies of its own breaks that knot -- `car/loader.js` is
// the only writer, `camera/rig.js` the only reader.
//
// The measurement itself stays in loader.js because it needs `measureCar`, and
// having this module import it would make loader -> ref -> loader a cycle.
//
// `ready` is false until the model has been loaded AND placed. The camera treats
// an unready ref as "no lock", so the aim falls back to the authored target curve
// instead of pointing at the world origin while the GLB is still in flight, and a
// model that fails to load leaves the camera exactly as it was.
//
// The centre is republished on every transform change (load, panel edit, preset
// switch) rather than only once, which is what lets the aim follow positionX/Y/Z
// and the `pivot` mode without a second copy of those numbers.
export const carRef = {
  center: new THREE.Vector3(),
  // World-space bounding box extents, for the contact shadow and the glow.
  size: new THREE.Vector3(1, 1, 1),
  minY: 0,
  ready: false,
}

// Accepts the object measureCar() returns ({ centre, size, min }).
export function publishCarCenter(measured) {
  carRef.center.copy(measured.centre)
  carRef.size.copy(measured.size)
  carRef.minY = measured.min.y
  carRef.ready = true
}
