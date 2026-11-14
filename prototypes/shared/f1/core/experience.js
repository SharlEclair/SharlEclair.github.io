import * as THREE from 'three'

import { time } from './time.js'
import { initScroll, updateScroll, refreshScrollSpace, scroll } from './scroll.js'
import { createRenderer } from './renderer.js'
import { scene, updateScene } from '../scene/scene.js'
import { camera, initCamera, updateCamera, rebuildCurves } from '../camera/rig.js'
import { createAirflow, updateAirflow } from '../airflow/field.js'
import { loadCar, applyCarTransform, applyCarMaterial, applyFinish, createEnvironment } from '../car/loader.js'
import { createPanel } from '../ui/panel.js'
import {
  applyPresetToConfig,
  classifyPresetChanges,
  snapshotConfig,
  getPreset,
} from '../config/presets.js'
import { DEFAULTS } from '../config/defaults.js'
import { config } from '../config.js'

// Combine two change reports into one, so a rebuild can be driven by the union
// of "what the preset spec changed" and "what the caller's edits changed".
function mergeChanges(a, b) {
  return {
    carKeys: [...a.carKeys, ...b.carKeys],
    airflowKeys: [...a.airflowKeys, ...b.airflowKeys],
    scrollKeys: [...a.scrollKeys, ...b.scrollKeys],
    scalarKeys: [...a.scalarKeys, ...b.scalarKeys],
    carChanged: a.carChanged || b.carChanged,
    needsAirflowRebuild: a.needsAirflowRebuild || b.needsAirflowRebuild,
    needsScrollLayout: a.needsScrollLayout || b.needsScrollLayout,
    needsCameraRebuild: a.needsCameraRebuild || b.needsCameraRebuild,
  }
}

// Boot the whole scene.
//
// This exists because the scene is now reachable from two entry points, and the
// frame loop is the part that must not be duplicated: two copies of it would
// drift apart, and the second one to be written would be the one nobody
// remembers to update. Each entry point supplies its own canvas, its own panel
// storage key and its own preset list; everything below the boot line is shared.
export function createExperience({
  canvas = null,
  storageKey,
  presets = null,
  initialPresetId = null,
  onAfterReset = null,
  // Optional: take over persistence entirely. See the note in ui/panel.js.
  onPersist = null,
  onResetVault = null,
} = {}) {
  const renderer = createRenderer(canvas)

  const disposeScroll = initScroll()
  const disposeCamera = initCamera()

  let airflow = createAirflow(scene)

  // The airflow field is rebuilt whenever a change alters the instance buffers
  // (line count, sheet count, focal band width). Those cannot be expressed as
  // uniforms because they change how many lines exist, so the geometry has to
  // be regenerated -- hence a mutable binding plus an explicit rebuild function.
  function rebuildAirflow() {
    if (airflow) {
      scene.remove(airflow.mesh)
      airflow.mesh.geometry.dispose()
      airflow.mesh.material.dispose()
    }
    airflow = createAirflow(scene)
    return airflow
  }

  let car = null

  // The environment the car's metal reflects. Without one, every metallic
  // surface has nothing to sample and renders pure black -- see car/loader.js.
  // Built here rather than in the loader because it needs the renderer, and
  // because it belongs to the scene, not to the model file.
  //
  // Built LAZILY and released again, rather than once at boot.
  //
  // This used to be `const envMap = config.car.environment ? createEnvironment(renderer) : null`,
  // read a single time. That made the panel's "reflections (env map)" checkbox a
  // no-op: its onChange calls refreshCar(), which closed over that const, so
  // switching the box ON re-applied the ABSENCE of an environment. Measured: the
  // rendered frame was byte-identical before and after the click (mean |delta|
  // 0.00000) while config.car.environment flipped to true. Nothing could build an
  // environment after boot, so the only way to get reflections was to edit the
  // config and reload.
  //
  // Building it here means the checkbox, a preset switch and a reset all take
  // effect on the next frame, and switching reflections off releases the
  // PMREM-generated texture instead of leaking it for the life of the page.
  let envMap = null

  function syncEnvMap() {
    if (config.car.environment) {
      if (!envMap) {
        envMap = createEnvironment(renderer)
        scene.environment = envMap
      }
    } else if (envMap) {
      envMap.dispose()
      envMap = null
      // Cleared as well as the material, because three.js falls back to
      // scene.environment whenever material.envMap is null -- leaving it set
      // would keep the car reflective with the box switched off.
      scene.environment = null
    }
    return envMap
  }

  loadCar(scene, (loadedCar) => {
    car = loadedCar
    // The GLB arrives asynchronously. If a preset was applied while it was in
    // flight, the transform it set was applied to `null` and would be lost, so
    // the current config is re-applied on arrival. Idempotent, so this is safe
    // in the ordinary case too.
    applyCarTransform(car)
    applyCarMaterial(car, syncEnvMap())
  })

  // Re-centre, restyle and re-tint the car off the live config. The panel calls
  // this for every car slider, for the finish buttons, for the reflections
  // checkbox, and for any preset switch that touches the car.
  function refreshCar() {
    applyCarTransform(car)
    applyCarMaterial(car, syncEnvMap())
  }

  // Declared before the panel: the panel's reset hook closes over it and would
  // otherwise read it while it is still in the temporal dead zone.
  let currentPresetId = initialPresetId || (presets?.[0]?.id ?? null)

  const panel = createPanel({
    rebuildAirflow,
    refreshCar,
    applyFinish,
    storageKey,
    // With presets in play, "reset" restores the preset currently in use rather
    // than the file defaults -- otherwise the button would knock the user off
    // the look they are tuning.
    onReset: presets ? () => applyPreset(currentPresetId) : null,
    // Runs after the panel has refreshed itself, for cleanup the panel knows
    // nothing about.
    onAfterReset,
    // Persistence is the caller's when there are presets to tell apart; the
    // panel's single-key store cannot represent "this edit belongs to look B".
    onPersist,
    onResetVault,
  })

  const clock = new THREE.Clock()
  let running = true

  function frame() {
    if (!running) return
    requestAnimationFrame(frame)

    const delta = Math.min(clock.getDelta(), 0.05)
    time.delta = delta
    time.elapsed += delta

    updateScroll()
    updateCamera()
    updateAirflow(airflow, camera)
    updateScene(scroll.progress)
    renderer.render(scene, camera)
  }

  // Re-derive everything that caches a value off `config`, given the diff a
  // preset apply measured. Order matters: the scroll relayout can move the page,
  // so it happens before the camera is re-read against the new curves.
  function applyChanges(changes) {
    if (!changes) return
    if (changes.needsAirflowRebuild) rebuildAirflow()
    // Colour, opacity and every other airflow uniform are re-synced from config
    // on the next frame by updateAirflow, so nothing else is needed here.
    // refreshCar covers the transform AND the material, because a preset can
    // change either -- the finish sliders are part of the car block.
    if (changes.carChanged) refreshCar()
    if (changes.needsCameraRebuild) rebuildCurves()
    if (changes.needsScrollLayout) refreshScrollSpace()

    panel.refresh()
    updateCamera()
    renderer.render(scene, camera)
  }

  // Switch the live scene to a preset.
  //
  // `edit` runs after the preset spec is written but BEFORE anything is rebuilt,
  // which is the whole point of the split: a caller restoring saved values can
  // layer them on and have the rebuild account for them, instead of the edits
  // landing after the scene was re-derived and never reaching it.
  function applyPreset(id, { edit = null } = {}) {
    const known = getPreset(id)
    if (!known || (presets && !presets.some((p) => p.id === known.id))) {
      console.warn(`[F1 x Currents] unknown preset "${id}"`)
      return null
    }

    const before = snapshotConfig()
    const result = applyPresetToConfig(id, DEFAULTS, before)
    currentPresetId = known.id

    if (edit) edit(result)

    // The diff was measured before `edit`, so anything the edits changed would
    // be missed. Re-measure against the live config and merge the two reports.
    applyChanges(edit ? mergeChanges(result, classifyPresetChanges(before, snapshotConfig())) : result)

    return result
  }

  function destroy() {
    running = false
    disposeScroll()
    disposeCamera()
    panel.destroy()
    scene.remove(airflow.mesh)
    airflow.mesh.geometry.dispose()
    airflow.mesh.material.dispose()
    // The PMREM texture is not owned by the renderer's disposeAll(), so it is
    // released explicitly -- otherwise a page that destroys and re-creates an
    // experience (the verification harnesses do) leaves one behind each time.
    if (envMap) {
      envMap.dispose()
      envMap = null
      scene.environment = null
    }
    renderer.disposeAll()
  }

  // Stop and start the frame loop.
  //
  // Used by the browser verification harness. It needs to render the SAME scene
  // twice, changing exactly one config value in between, and compare the two
  // frames pixel for pixel -- which is only meaningful if `u_time` is not
  // advancing underneath it. An animating flow field would differ between any
  // two renders for reasons that have nothing to do with the value under test.
  function stop() {
    running = false
  }

  function start() {
    if (running) return
    running = true
    clock.getDelta() // discard the paused interval, or time leaps forward
    frame()
  }

  frame()

  return {
    renderer,
    panel,
    scene,
    camera,
    applyPreset,
    destroy,
    stop,
    start,
    // Composites one frame immediately, without waiting for the next rAF.
    renderNow() {
      updateScroll()
      updateCamera()
      updateAirflow(airflow, camera)
      updateScene(scroll.progress)
      renderer.render(scene, camera)
    },
    getAirflow: () => airflow,
    getPresetId: () => currentPresetId,
    getCar: () => car,
    rebuildAirflow,
  }
}
