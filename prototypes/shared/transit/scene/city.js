/**
 * City payload (docs/02 §4, docs/01 §3): load the single GLB, swap the loader's default PBR
 * materials for the palette's self-illuminating ones, and hand back the three merged objects.
 *
 * The GLB ships no materials, so GLTFLoader would assign its `MeshStandardMaterial` default; that
 * material class is banned by docs/05 §2, so every one of the three objects gets an explicit
 * material before anything is rendered:
 *
 *   Buildings  MeshBasicMaterial          docs/03 §2 - transparent, opacity driven by progress
 *   Roads      ShaderMaterial             docs/05 §3 - two baked strips, one additive draw call
 *   APath      ShaderMaterial             docs/03 §3/§4 - the arc-length pulse, additive, no depth write
 *
 * Draw calls: each object is one merged geometry with one material -> three draw calls total, and
 * both strips of each network are shaded by that same single material (HANDOFF.md §7 D1).
 *
 * `sync()` is the per-frame config pump. It re-reads the singleton every frame but mutates nothing
 * unless a value actually changed, so a GUI drag applies live while a steady frame allocates zero
 * objects (docs/08 Step 3 determinism checklist).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createPulseMaterial } from '../shaders/pulseMaterial.js';
import { createBuildingsMaterial } from '../shaders/buildingsMaterial.js';
import { createRoadsMaterial } from './roads-material.js';

/** docs/02 §4 - exactly these three objects, by these exact names. */
export const CITY_OBJECT_NAMES = ['Buildings', 'Roads', 'APath'];

export const CITY_ASSET_URL = `${import.meta.env?.BASE_URL ?? '/'}scene.glb`;

/**
 * docs/03 §2 fade: hold `opacityNear` until `fadeStart`, ease to `opacityFar` by `fadeEnd`.
 * Implemented with the same cubic the shader side uses, so there is one smoothstep vocabulary.
 *
 * @param {number} progress 0..1
 * @param {number} start u at which the fade begins
 * @param {number} end u at which the fade completes
 * @returns {number} 0..1 eased position inside the fade window
 */
export function fadeEase(progress, start, end) {
  const span = end - start;
  // A zero-width window would divide by zero and hand a NaN to the material opacity.
  if (!(Math.abs(span) > 1e-6)) {
    return progress >= end ? 1 : 0;
  }
  const t = Math.min(1, Math.max(0, (progress - start) / span));
  return t * t * (3 - 2 * t);
}

/**
 * Load `public/scene.glb` and add its three objects to the scene.
 *
 * @param {THREE.Scene} scene
 * @param {typeof import('../config.js').config} config
 * @returns {Promise<{ objects: Record<string, THREE.Mesh>, materials: Record<string, THREE.Material>,
 *                     shaders: { apath: ReturnType<typeof createPulseMaterial>,
 *                                roads: ReturnType<typeof createRoadsMaterial> },
 *                     sync: (next: typeof config, progress: number) => void }>}
 */
export async function createCity(scene, config) {
  const gltf = await new GLTFLoader().loadAsync(CITY_ASSET_URL);

  const objects = {};
  for (const name of CITY_OBJECT_NAMES) {
    const object = gltf.scene.getObjectByName(name);
    if (!object) {
      throw new Error(`scene.glb is missing the "${name}" object (docs/02 §4)`);
    }
    if (!object.isMesh) {
      throw new Error(`scene.glb "${name}" is ${object.type}, expected a Mesh`);
    }
    objects[name] = object;
  }

  // One material per network: the two strips of each network are shaded by the strip selector the
  // ETL baked in, never by a second primitive (docs/01 §3).
  //
  // Two sanctioned Buildings looks (docs/05 §5). They are two materials for the SAME object, so
  // switching between them is a material swap and never a second draw call:
  //   'void'  - the original flat `MeshBasicMaterial` fill (docs/03 §2 as originally written)
  //   'night' - the dark city: near-black masses with emissive windows (src/shaders/buildingsMaterial.js)
  // Both keep `transparent: true` and `depthWrite: true`, which is the occlusion the search layer's
  // `depthTest: false` was written against (docs/03 §5; HANDOFF trap G32).
  const buildingsVoid = new THREE.MeshBasicMaterial({
    color: config.buildings.color,
    transparent: true,
    opacity: config.buildings.opacityNear
  });
  const buildingsNight = createBuildingsMaterial(config);
  const buildingLooks = { void: buildingsVoid, night: buildingsNight.material };
  const roadsShader = createRoadsMaterial(config);
  const apathShader = createPulseMaterial(config);

  const materials = {
    Buildings: buildingLooks[config.buildings.look] ?? buildingsNight.material,
    Roads: roadsShader.material,
    APath: apathShader.material
  };

  for (const name of CITY_OBJECT_NAMES) {
    const object = objects[name];
    const previous = object.material;
    object.material = materials[name];
    // GLTFLoader's default material is a banned MeshStandardMaterial; drop it so it cannot leak
    // into a later audit of the scene graph.
    if (previous && previous !== materials[name] && typeof previous.dispose === 'function') {
      previous.dispose();
    }
    scene.add(object);
  }

  // Draw order, not priority: the street network shades the ground plane and the route rides above
  // it. Both are additive and `APath` writes no depth, so Three's transparent sort (which puts all
  // three objects at the same distance-from-origin) is the only thing deciding this today.
  objects.Roads.renderOrder = 0;
  objects.APath.renderOrder = 1;

  // Last-applied config values, compared before any mutation.
  const applied = {
    look: config.buildings.look,
    buildingsColor: '',
    opacityNear: Number.NaN,
    opacityFar: Number.NaN,
    fadeStart: Number.NaN,
    fadeEnd: Number.NaN
  };

  /**
   * Per-frame config pump: buildings fade + all three materials.
   *
   * @param {typeof config} next
   * @param {number} progress 0..1 (`u_progress`)
   * @param {{ reveal: number, pulse: number }|null} [routeState] the search replay's route state
   *        (docs/11 §4.3): where the reconstruction front is and whether the answer exists yet.
   */
  function sync(next, progress, routeState = null) {
    // docs/05 §5: the look is a live switch. It swaps which material the one Buildings mesh carries,
    // so `__MATERIALS.Buildings` and the object must move together or an audit would read one and
    // render the other.
    if (applied.look !== next.buildings.look) {
      applied.look = next.buildings.look;
      const material = buildingLooks[applied.look] ?? buildingsNight.material;
      objects.Buildings.material = material;
      materials.Buildings = material;
    }

    if (applied.buildingsColor !== next.buildings.color) {
      buildingsVoid.color.set(next.buildings.color);
      applied.buildingsColor = next.buildings.color;
    }
    if (applied.opacityNear !== next.buildings.opacityNear) {
      applied.opacityNear = next.buildings.opacityNear;
    }
    if (applied.opacityFar !== next.buildings.opacityFar) {
      applied.opacityFar = next.buildings.opacityFar;
    }
    if (applied.fadeStart !== next.buildings.fadeStart) {
      applied.fadeStart = next.buildings.fadeStart;
    }
    if (applied.fadeEnd !== next.buildings.fadeEnd) {
      applied.fadeEnd = next.buildings.fadeEnd;
    }

    // docs/03 §2: opacity interpolates 0.8 -> 0.0 across the fade window and never rises again,
    // because the eased position is clamped at both ends.
    const { opacityNear, opacityFar, fadeStart, fadeEnd } = next.buildings;
    const t = fadeEase(progress, fadeStart, fadeEnd);
    const opacity = opacityNear + (opacityFar - opacityNear) * t;

    if (applied.look === 'void') {
      buildingsVoid.opacity = opacity;
    } else {
      buildingsNight.sync(next);
      // `setOpacity` also mirrors the value onto `material.opacity`. A ShaderMaterial has no such
      // property of its own, and the fade is a documented observable that `artifacts/step2` and
      // `artifacts/step3` read back off the material - so the look must not be able to hide it.
      buildingsNight.setOpacity(opacity);
    }

    roadsShader.sync(next);
    apathShader.sync(next, progress);
    if (routeState) {
      apathShader.setRouteState(routeState.reveal, routeState.pulse, routeState.flash ?? 0);
    }
  }

  return {
    objects,
    materials,
    shaders: { apath: apathShader, roads: roadsShader, buildings: buildingsNight },
    sync
  };
}
