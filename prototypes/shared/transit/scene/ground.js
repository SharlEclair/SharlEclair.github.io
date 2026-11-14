/**
 * Ground layer (docs/05 s6): the Yarra, Albert Park Lake, the ponds, the parks and the Albert Park
 * circuit, as ONE mesh and therefore ONE draw call.
 *
 * The geometry is NOT in `public/scene.glb`. It ships as the generated module
 * `src/data/ground.js`, built offline by `scripts/bake_ground.py`, which keeps the payload at its three
 * objects and its byte-identical SHA (docs/02 s4) - the same arrangement `src/data/astar-trace.js` uses
 * for the A* trace. The vertices arrive already triangulated in the city's own anchored metre plane, so
 * this module only uploads a `BufferGeometry`: no projection, no clipping, no triangulation, no GIS.
 *
 * Determinism (docs/07 s1): the geometry is built ONCE, at load, before the first render, so frame 1
 * already contains the ground. Per frame `sync` writes uniforms only.
 */
import * as THREE from 'three';
import { ground } from '../data/ground.js';
import { createGroundMaterial } from '../shaders/groundMaterial.js';
import { fadeEase } from './city.js';

/** The one new object this feature adds to the scene. */
export const GROUND_OBJECT_NAME = 'Ground';

/**
 * @param {THREE.Scene} scene
 * @param {typeof import('../config.js').config} config
 * @returns {{ mesh: THREE.Mesh, material: THREE.ShaderMaterial,
 *            fingerprint: { vertices: number, triangles: number, source: object, warnings: string[] },
 *            sync: (next: typeof config, progress: number) => void }}
 */
export function createGround(scene, config) {
  const { position, layer, count } = ground.vertices;
  if (!count) {
    throw new Error(
      'src/data/ground.js has no vertices - re-run `uv run python scripts/bake_ground.py`'
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aLayer', new THREE.Float32BufferAttribute(layer, 1));
  // Explicit, because the arrays are flat triangle soup with no index buffer: the vertex count is the
  // draw range, and a mismatch here would silently draw garbage from the tail of the buffer.
  geometry.setDrawRange(0, count);
  geometry.computeBoundingSphere();

  const shader = createGroundMaterial(config);
  const mesh = new THREE.Mesh(geometry, shader.material);
  mesh.name = GROUND_OBJECT_NAME;
  // Ground never writes depth (docs/05 s6), so it cannot occlude the route or the search layer above it.
  // It DOES read depth, so a hill of buildings still hides the ground behind them.
  mesh.renderOrder = -1;
  scene.add(mesh);

  /**
   * @param {typeof config} next
   * @param {number} progress 0..1 (`u_progress`)
   */
  function sync(next, progress) {
    shader.sync(next);
    // The ground persists into the finale on purpose: the city dissolves to nothing, and what is left
    // is the lake and the circuit the whole flight has been heading for. It therefore fades to its own
    // floor rather than to zero.
    const { opacityNear, opacityFar, fadeStart, fadeEnd } = next.ground;
    const t = fadeEase(progress, fadeStart, fadeEnd);
    shader.setFade(opacityNear + (opacityFar - opacityNear) * t);
  }

  return {
    mesh,
    material: shader.material,
    fingerprint: {
      vertices: count,
      triangles: count / 3,
      source: ground.source,
      warnings: ground.source.warnings ?? []
    },
    sync
  };
}
