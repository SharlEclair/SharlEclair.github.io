/**
 * Camera rig (docs/04 §2, §3): a `CatmullRomCurve3` through the four config control points, sampled
 * by scroll progress, always looking at the config lookAt target.
 *
 * Determinism: `update()` is a pure function of (config, progress). It allocates nothing per frame -
 * `getPointAt` writes into a pre-allocated Vector3 target - and it never reads the clock.
 */
import * as THREE from 'three';

const POINT_COUNT = 4;

/**
 * @param {typeof import('../config.js').config} config the live singleton
 * @returns {{ camera: THREE.PerspectiveCamera, update: (progress: number) => void,
 *            setAspect: (aspect: number) => void, rebuild: () => void,
 *            curve: THREE.CatmullRomCurve3 }}
 */
export function createCameraRig(config) {
  const camera = new THREE.PerspectiveCamera(
    config.camera.fov,
    1,
    config.camera.near,
    config.camera.far
  );

  // The curve owns its own Vector3 instances: config.cameraPoints may be mutated (GUI/CDP) at any
  // time, and the spline must not alias the objects a harness is mid-write on.
  const controlPoints = config.cameraPoints.map((point) => point.clone());
  const signature = new Array(POINT_COUNT * 3).fill(Number.NaN);
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();
  let curve = new THREE.CatmullRomCurve3(controlPoints);
  let lastFov = config.camera.fov;
  let lastNear = config.camera.near;
  let lastFar = config.camera.far;

  function pointsChanged() {
    if (config.cameraPoints.length !== POINT_COUNT) {
      return true;
    }
    for (let index = 0; index < POINT_COUNT; index += 1) {
      const point = config.cameraPoints[index];
      const base = index * 3;
      if (
        point.x !== signature[base] ||
        point.y !== signature[base + 1] ||
        point.z !== signature[base + 2]
      ) {
        return true;
      }
    }
    return false;
  }

  /** Copy the live control points in and re-spline. Also refreshes the mutation signature. */
  function rebuild() {
    for (let index = 0; index < POINT_COUNT; index += 1) {
      const point = config.cameraPoints[index];
      const base = index * 3;
      controlPoints[index].copy(point);
      signature[base] = point.x;
      signature[base + 1] = point.y;
      signature[base + 2] = point.z;
    }
    // A fresh curve is the only way to invalidate CatmullRomCurve3's cached arc lengths, which
    // `getPointAt` relies on for uniform speed.
    curve = new THREE.CatmullRomCurve3(controlPoints);
  }

  function syncFromConfig() {
    const { fov, near, far } = config.camera;
    if (fov !== lastFov || near !== lastNear || far !== lastFar) {
      camera.fov = fov;
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
      lastFov = fov;
      lastNear = near;
      lastFar = far;
    }
    if (pointsChanged()) {
      rebuild();
    }
  }

  /**
   * Place the camera on the spline and aim it.
   *
   * @param {number} progress 0..1 along the spline
   * @param {THREE.Vector3} [aimOverride] optional aim point; falls back to `config.targetX/Y/Z`.
   *   docs/04 §3 still governs the target - the override exists so the engine can blend the aim
   *   toward the route's own centreline (see `config.guide`), which is what keeps the pulse framed.
   */
  function update(progress, aimOverride) {
    syncFromConfig();
    curve.getPointAt(progress, position);
    camera.position.copy(position);
    if (aimOverride) {
      target.set(aimOverride.x, aimOverride.y, aimOverride.z);
    } else {
      target.set(config.targetX, config.targetY, config.targetZ);
    }
    camera.lookAt(target);
  }

  function setAspect(aspect) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  rebuild(); // seed the signature so the first update() does not re-spline needlessly

  return {
    camera,
    update,
    setAspect,
    rebuild,
    get curve() {
      return curve;
    }
  };
}
