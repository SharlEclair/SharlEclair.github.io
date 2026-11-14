/**
 * Landmark layer (docs/05 §7): real Melbourne landmarks as hero masses, ONE mesh and ONE draw call.
 *
 * Geometry comes from the generated module `src/data/landmarks.js` (built offline by
 * `scripts/bake_landmarks.py`), never from `public/scene.glb`, so the payload keeps its three objects and
 * its byte-identical SHA (docs/02 §4). Vertices arrive triangulated in the city's own anchored metre
 * plane, so this module only uploads a `BufferGeometry` - including the `aKind` layer flag that
 * separates the real footprint masses (0.0) from the one procedural landmark, the Arts Centre spire
 * (1.0), exactly as the ground's baked `aLayer` separates water, park and circuit (docs/05 §6.2).
 *
 * The spire's axis and its base/tip heights are BAKE OUTPUTS read from the module's `source` block,
 * not constants written here: the runtime does no projection of its own (docs/02 §1), and a spire
 * that drifted off its podium would be a geometry bug, not a tuning choice.
 *
 * Determinism (docs/07 §1): built once at load, before the first render; per frame `sync` writes
 * uniforms only.
 */
import * as THREE from 'three';
import { landmarks } from '../data/landmarks.js';
import { createLandmarkMaterial } from '../shaders/landmarkMaterial.js';
import { fadeEase } from './city.js';

export const LANDMARK_OBJECT_NAME = 'Landmarks';

/**
 * @param {THREE.Scene} scene
 * @param {typeof import('../config.js').config} config
 * @returns {{ mesh: THREE.Mesh, material: THREE.ShaderMaterial,
 *            fingerprint: { vertices: number, triangles: number, landmarks: object[], warnings: string[],
 *                           spire: object | null },
 *            sync: (next: typeof config, progress: number) => void }}
 */
export function createLandmarks(scene, config) {
  const { position, count, kind } = landmarks.vertices;
  if (!count) {
    throw new Error('src/data/landmarks.js has no vertices - re-run `uv run python scripts/bake_landmarks.py`');
  }
  if (!kind || kind.length !== count) {
    throw new Error('src/data/landmarks.js has no per-vertex kind flag - re-run `uv run python scripts/bake_landmarks.py`');
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  geometry.setDrawRange(0, count);
  geometry.computeBoundingSphere();

  const shader = createLandmarkMaterial(config);
  const spire = landmarks.source.spire ?? null;
  if (spire) {
    shader.setSpireAxis(spire.axisWorldXZ[0], spire.axisWorldXZ[1]);
    shader.setSpireSpan(spire.baseY, spire.tipY);
  }

  const mesh = new THREE.Mesh(geometry, shader.material);
  mesh.name = LANDMARK_OBJECT_NAME;
  // Drawn after the city and the ground, before the route: a hero mass occludes what is behind it, and
  // the route must still ride over everything.
  mesh.renderOrder = 0.5;
  scene.add(mesh);

  /**
   * @param {typeof config} next
   * @param {number} progress 0..1 (`u_progress`)
   */
  function sync(next, progress) {
    shader.sync(next);
    // The spire's light show runs on `u_progress` and nothing else (docs/03 §1).
    shader.setProgress(progress);
    const { opacityNear, opacityFar, fadeStart, fadeEnd } = next.landmarks;
    const t = fadeEase(progress, fadeStart, fadeEnd);
    shader.setFade(opacityNear + (opacityFar - opacityNear) * t);
  }

  return {
    mesh,
    material: shader.material,
    fingerprint: {
      vertices: count,
      triangles: count / 3,
      landmarks: landmarks.source.landmarks,
      warnings: landmarks.source.warnings ?? [],
      spire
    },
    sync
  };
}
