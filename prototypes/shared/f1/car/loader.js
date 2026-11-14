import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { config, palette } from '../config.js'
import { FINISHES } from './finishes.js'
import { publishCarCenter } from './ref.js'
import { createStudioEnvironment } from '../look.js'

// NOTE: DRACOLoader is deliberately NOT imported.
//
// 1. It is unnecessary: public/models/f1-car.glb is plain glTF 2.0 exported from
//    Blender (extensionsUsed is empty, confirmed by scripts/inspect-glb.py) --
//    no KHR_draco_mesh_compression.
// 2. It was actively breaking the whole app. Vite 8's `asset-import-meta-url`
//    plugin resolves import.meta.url by shelling out via execFile, and where
//    that is blocked it throws `spawn EPERM` while transforming DRACOLoader.js.
//    That 500'd the module graph, so main.js never executed and the page showed
//    nothing but a black 300x150 canvas -- no background, no car, no airflow.
//
// If you ever swap in a Draco-compressed model, re-add the loader here, serve
// the decoder from /public/draco/, and confirm the dev server can transform
// that module before relying on it.

export function loadCar(scene, onReady) {
  const loader = new GLTFLoader()

  loader.load(
    `${(import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')}${config.car.modelPath}`,
    (gltf) => {
      const car = gltf.scene

      car.traverse((child) => {
        if (!child.isMesh) return
        child.castShadow = false
        child.receiveShadow = false

        // Keep a handle on the GLB's own material. The tint replaces every mesh's
        // material with ONE shared instance, so this is the only remaining
        // reference to the original -- and `keepOriginalMaterials` is what puts it
        // back.
        //
        // There used to be a `child.material.clone()` here, gated on
        // `!config.car.keepOriginalMaterials`. It achieved nothing AND caused the
        // bug: the clone replaced the original, and the shared tint then replaced
        // the clone, so the originals were destroyed before anything could restore
        // them. That made the checkbox a one-way switch -- switching it on at
        // runtime left the tinted material in place with a byte-identical frame,
        // and only the body-colour picker greying out showed anything had happened.
        rememberOriginalMaterial(child)
      })

      applyCarTransform(car)
      scene.add(car)
      onReady(car)
    },
    undefined,
    (err) => {
      console.error('Failed to load F1 model:', err)
    }
  )
}

// ---------------------------------------------------------------------------
// Centring
//
// The exported GLB is not centred on its own origin -- measured bounds put the
// centre at Z +0.978, Y +1.294 in local space (see scripts/inspect-glb.py). So
// "position the car" and "the car's origin" are two different places, and the
// config was silently compensating for the modelling offset.
//
// This measures the model at load and reports the offset in WORLD units (i.e.
// after rotation and scale), so positionX/Y/Z can mean "where the car's centre
// is" instead.
// ---------------------------------------------------------------------------
const _box = new THREE.Box3()
const _centre = new THREE.Vector3()
const _size = new THREE.Vector3()
const _pivot = new THREE.Vector3()

export function measureCar(car) {
  // Rotation and scale must already be applied for the box to be in world units.
  car.updateMatrixWorld(true)
  _box.setFromObject(car)
  _box.getCenter(_centre)
  _box.getSize(_size)
  return {
    centre: _centre.clone(),
    size: _size.clone(),
    min: _box.min.clone(),
    max: _box.max.clone(),
  }
}

export function applyCarTransform(car) {
  if (!car) return
  const c = config.car

  car.scale.setScalar(c.scale)
  // config stores rotations in degrees (see the note in config.js); three.js
  // wants radians.
  car.rotation.set(
    THREE.MathUtils.degToRad(c.rotationX),
    THREE.MathUtils.degToRad(c.rotationY),
    THREE.MathUtils.degToRad(c.rotationZ)
  )

  // Zero the offset first, so the measurement below is of the model as exported
  // rather than of wherever it was left last time.
  car.position.set(0, 0, 0)
  car.updateMatrixWorld(true)

  if (!c.autoCenter) {
    // Place the model's own origin, exactly as the config always did.
    car.position.set(c.positionX, c.positionY, c.positionZ)
    car.updateMatrixWorld(true)
    // Both exits publish, not just the auto-centred one: the camera's lock reads
    // this, and a stale centre would aim at where the car used to be.
    publishCarCenter(measureCar(car).centre)
    return
  }

  // With the car at the origin, the bounding-box centre IS the offset between
  // the model's origin and its geometric centre. Cancel it, then move the whole
  // thing by the requested position.
  const m = measureCar(car)
  const halfHeight = m.size.y * 0.5

  if (c.centerMode === 'ground') {
    // X/Z pivot at the geometric centre, Y pivot at the model's lowest point, so
    // positionY reads as ride height above the ground plane rather than to the
    // body's centre.
    _pivot.set(m.centre.x, m.min.y, m.centre.z)
    void halfHeight
  } else {
    _pivot.copy(m.centre)
  }

  car.position.set(
    c.positionX - _pivot.x,
    c.positionY - _pivot.y,
    c.positionZ - _pivot.z
  )
  car.updateMatrixWorld(true)
  // Measured AFTER the offset is applied, so this is the true world centre for
  // whichever pivot mode is live -- 'ground' lifts it half a body above
  // positionY, 'bbox' puts it exactly on positionY. Reading the box back is what
  // keeps the camera's aim correct in both without a second set of numbers.
  publishCarCenter(measureCar(car).centre)
}

// ---------------------------------------------------------------------------
// Surface finish
// ---------------------------------------------------------------------------

// Fine-tune sliders that a finish write touches, in the order they appear in the
// panel. Kept as a list so applyFinish and the panel cannot drift.
const FINISH_FIELDS = [
  'roughness',
  'metalness',
  'clearcoat',
  'clearcoatRoughness',
  'envMapIntensity',
]

// Copy a named finish's values into the config's editable sliders.
// Returns the finish that was applied, or null if the name is unknown.
export function applyFinish(name) {
  const finish = FINISHES[name]
  if (!finish) return null
  for (const key of FINISH_FIELDS) {
    if (key in finish) config.car[key] = finish[key]
  }
  config.car.finish = name
  return finish
}

// Build the material every part shares, from the current config values.
//
// MeshPhysicalMaterial (not MeshStandardMaterial) because clearcoat is the whole
// point of the obsidian and glossy finishes, and clearcoat only exists on the
// physical material. It is a superset of the standard shader, so a finish with
// clearcoat 0 costs nothing visually.
let sharedMaterial = null

// mesh -> the material the GLB shipped with, captured at load.
//
// A WeakMap so a car that gets dropped does not keep its materials alive, and
// keyed by MESH rather than by car because the restore walks meshes anyway.
const originalMaterials = new WeakMap()

export function rememberOriginalMaterial(mesh) {
  if (mesh.material && !originalMaterials.has(mesh)) {
    originalMaterials.set(mesh, mesh.material)
  }
}

// material -> the reflections settings that material had before the keep-original
// path borrowed it, so handing it back can undo the borrow exactly.
//
// A plain Map, not a WeakMap: the entries are removed by releasing them, and the
// key set is the model's own handful of materials.
const borrowedEnv = new Map()

// Hand the model's own materials back, wearing the CURRENT reflections settings.
//
// The env map and the intensity have to be written to EACH material.
// `scene.environment` alone -- which is all this used to rely on -- does light them
// (three.js falls back to it for any PBR material), but it does not carry the
// intensity: `envMapIntensity` is read from the MATERIAL, so with the originals
// holding their glTF default of 1 the slider moved nothing. Measured before this:
// dragging envMapIntensity 0 -> 3 with the originals on gave a byte-identical
// frame, and the materials all still read envMapIntensity = 1.
//
// Only reflections are borrowed. Colour, roughness and metalness stay the model's
// own, which is the entire point of the switch.
function restoreOriginalMaterials(car, envMap) {
  const intensity = config.car.envMapIntensity
  car.traverse((child) => {
    if (!child.isMesh) return
    const original = originalMaterials.get(child)
    if (!original) return
    if (child.material !== original) child.material = original

    // Several meshes share one material, so record the pristine values once, on
    // the first mesh that reaches it.
    if (!borrowedEnv.has(original)) {
      borrowedEnv.set(original, {
        envMap: original.envMap ?? null,
        envMapIntensity: original.envMapIntensity,
      })
    }
    if (original.envMap !== envMap || original.envMapIntensity !== intensity) {
      original.envMap = envMap
      original.envMapIntensity = intensity
      // Required: adding or removing an env map changes the shader's defines.
      original.needsUpdate = true
    }
  })
}

// Undo every borrow, so a material we have handed back never keeps a reference to
// a texture the reflections switch may be about to dispose.
function releaseOriginalMaterials() {
  for (const [material, saved] of borrowedEnv) {
    material.envMap = saved.envMap
    material.envMapIntensity = saved.envMapIntensity
    material.needsUpdate = true
  }
  borrowedEnv.clear()
}

export function createCarMaterial(envMap = null) {
  const c = config.car
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(c.color),
    roughness: c.roughness,
    metalness: c.metalness,
    clearcoat: c.clearcoat,
    clearcoatRoughness: c.clearcoatRoughness,
    envMapIntensity: c.envMapIntensity,
    envMap,
  })
}

// Push the live config values onto the car's materials.
//
// Every part gets the SAME material instance when they have been consolidated
// (see prepareCarMaterials), so this is one write rather than one per mesh --
// and it means a slider drag updates the whole car at once.
//
// With `keepOriginalMaterials` on it does the opposite and puts each mesh's own
// GLB material back. Declining to tint (the old behaviour) is not the same thing:
// by the time the switch is flipped the tint is already on every mesh, so
// declining leaves it there. Restoring is what makes the control two-way, and the
// config values above are still applied to `sharedMaterial` so that switching the
// switch back off re-applies the look you had tuned rather than the file defaults.
export function applyCarMaterial(car, envMap) {
  if (!car) return
  const c = config.car
  const mat = sharedMaterial || createCarMaterial(envMap)
  sharedMaterial = mat

  mat.color.set(c.color)
  mat.roughness = c.roughness
  mat.metalness = c.metalness
  mat.clearcoat = c.clearcoat
  mat.clearcoatRoughness = c.clearcoatRoughness
  mat.envMapIntensity = c.envMapIntensity
  mat.envMap = envMap
  mat.needsUpdate = true

  if (config.car.keepOriginalMaterials) {
    restoreOriginalMaterials(car, envMap)
    return
  }

  releaseOriginalMaterials()
  car.traverse((child) => {
    if (child.isMesh && child.material !== mat) child.material = mat
  })
}

function findFirstMaterial(car) {
  let found = null
  car.traverse((child) => {
    if (!found && child.isMesh && child.material) found = child.material
  })
  return found
}

// Generate the environment the metal reflects.
//
// A metallic surface shows you its surroundings; with nothing to reflect it
// renders black. RoomEnvironment is a small procedural room built by three.js
// for exactly this, so it needs no downloaded HDR and no network access.
//
// PMREM (prefiltered mipmapped radiance environment map) is what turns that
// scene into something a rough surface can sample at the right blur level --
// without it, roughness would have no visible effect on reflections.
export function createEnvironment(renderer) {
  // The upgraded look replaces the neutral RoomEnvironment with an authored studio
  // (look.js): a dark room with a handful of placed lights, so the lacquer shows
  // deliberate highlights instead of a generic bright interior.
  return createStudioEnvironment(renderer)
}
