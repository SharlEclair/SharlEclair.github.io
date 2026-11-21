import * as THREE from 'three'

import { time } from './time.js'
import { initScroll, updateScroll, refreshScrollSpace, scroll, setProgressSource, setProgressOverride } from './scroll.js'
import { createPost } from './post.js'
import { onViewportChange } from './viewport.js'
import { applyLookToConfig, LOOK } from '../look.js'
import { createRenderer } from './renderer.js'
import { scene, updateScene, applySceneTheme } from '../scene/scene.js'
import { camera, setOrbitTarget, initCamera, updateCamera, rebuildCurves, setLayoutMode, resolveLayout } from '../camera/rig.js'
import { createAirflow, updateAirflow, applyAirflowTheme } from '../airflow/field.js'
import { THEMES, normaliseTheme, readPageTheme } from '../theme.js'
import { setCarStyle, updateCarWheels, tuneLivery, liveryTune, setLiverySource, getLiverySource } from '../car/livery.js'
import { PRESETS, DEFAULT_PRESET, REBUILD_KEYS, LIVERY_DEFAULTS } from '../tune.js'
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
  // --- embedding (all optional; the standalone pages pass none of these) ---
  // Element the canvas should fill. Omit for the original full-window behaviour.
  container = null,
  // `() => number` in 0..1. When set, the host page owns the scroll mapping.
  progress = null,
  // Mount the lil-gui tuning panel. Off when embedded.
  gui = true,
  maxPixelRatio = 1.25,
  msaa = 0,
  // Freeze the flow field's clock (prefers-reduced-motion): scroll still scrubs.
  staticTime = false,
  // 'dark' | 'light'. Defaults to document.documentElement.dataset.theme.
  theme = null,
  // 'auto' | 'right' | 'top' | 'center': which part of the canvas the car and flow are framed in
  // (camera/rig.js). 'auto' is right on landscape, top on portrait.
  layout = 'auto',
  // Currents (streamline) look: a preset name ('optimised' | 'classic'), or { preset, ...overrides of tune.js keys }.
  currents = DEFAULT_PRESET,
} = {}) {
  // The upgraded look is written onto the live config BEFORE anything reads it.
  applyLookToConfig()
  if (progress) setProgressSource(progress)

  let themeName = normaliseTheme(theme ?? readPageTheme())
  let liveryTheme = null // null follows the page theme
  setLayoutMode(layout)

  const renderer = createRenderer(canvas, { sizeTo: container, maxPixelRatio })
  renderer.toneMappingExposure = LOOK.exposure

  const disposeScroll = initScroll()
  const disposeCamera = initCamera()

  // ---- currents settings (tune.js) -------------------------------------------------------------------
  // One flat object drives the field. The tuner writes it through setCurrents(); the live page only picks
  // a preset. Colours, blending and fade go to the material, the rest through config.airflow each frame.
  const currentsOption = typeof currents === 'string' ? { preset: currents } : { preset: DEFAULT_PRESET, ...currents }
  let presetName = PRESETS[currentsOption.preset] ? currentsOption.preset : DEFAULT_PRESET
  const { preset: _p, ...currentsOverrides } = currentsOption
  let cur = { ...PRESETS[presetName][themeName], ...currentsOverrides }
  let curTheme = themeName

  function syncCurrentsConfig() {
    const a = config.airflow
    a.countLines = cur.lines
    a.sheetCount = cur.sheets
    a.lateralSpread = cur.spread
    a.lineLength = cur.length
    a.cycleLength = cur.length * cur.cycleRatio
    a.flowSpeed = cur.speed
    a.influenceSplay = cur.bend
    a.influenceUpstream = cur.upstream
    a.wakeLateral = cur.wake
    a.turbStrength = cur.turb
    a.microOscillation = cur.wobble
    a.bandWidth = cur.bandWidth
    a.violetMix = cur.midMix
    a.opacity = cur.opacity
    a.lineThickness = cur.thickness
    a.additive = Boolean(cur.additive)
    a.taper = cur.taper
    a.endFade = cur.endFade
    a.widthVar = cur.widthVar
    a.alphaVar = cur.alphaVar
    a.nearMix = cur.nearMix
    // Soft edges only matter for ribbons wider than a hairline; the shader ramps over ~1.5 px.
    a.edgeSoft = cur.edgeSoft ? Math.min(1, Math.max(0.2, 1.5 / Math.max(cur.thickness, 0.5))) : 0
  }
  const airflowDef = () => ({
    colors: () => ({
      base: new THREE.Color(cur.colFar),
      violet: new THREE.Color(cur.colMid),
      separation: new THREE.Color(cur.colSep),
      vortex: new THREE.Color(cur.colMid),
      band: new THREE.Color(cur.colNear).multiplyScalar(cur.nearGain),
    }),
    additive: Boolean(cur.additive),
    fade: { near: cur.fadeNear, far: Math.max(cur.fadeFar, cur.fadeNear + 1), min: cur.fadeMin },
  })
  syncCurrentsConfig()

  let airflow = createAirflow(scene, cur)

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
    syncCurrentsConfig()
    airflow = createAirflow(scene, cur)
    applyAirflowTheme(airflow, airflowDef())
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
        envMap = createEnvironment(renderer, themeName)
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

  // No panel when embedded: it would also restore tuning saved in localStorage
  // over the look, which is right for the tuning page and wrong for a portfolio.
  const panel = !gui ? { refresh() {}, destroy() {} } : createPanel({
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

  const post = createPost(renderer, scene, camera, { samples: msaa })
  const syncPostSize = () => post.setSize(renderer.domElement.width, renderer.domElement.height)
  syncPostSize()
  const stopViewportSync = onViewportChange(syncPostSize)

  // The text zone follows the layout: left ~40% on landscape, bottom ~45% on portrait.
  function syncWash() {
    const mode = resolveLayout()
    const strength = THEMES[themeName].grade.wash
    if (mode === 'right') post.setWash('left', 0.42, strength)
    else if (mode === 'top') post.setWash('bottom', 0.45, strength)
    else post.setWash(null, 0.4, 0)
  }
  const stopWashSync = onViewportChange(syncWash)

  // Write a theme (theme.js) onto everything that caches a look: the config the per-frame syncs read,
  // the scene, the field's material, the post chain, the renderer's tone map and the car.
  function applyTheme(name) {
    themeName = normaliseTheme(name)
    setCarStyle(liveryTheme ?? themeName)
    const def = THEMES[themeName]
    renderer.toneMapping = def.toneMapping
    renderer.toneMappingExposure = def.exposure
    Object.assign(config.car, def.car, { environment: true })
    // A theme change reloads that theme's table of the active preset (the tuner re-applies its edits).
    if (curTheme !== themeName) {
      curTheme = themeName
      cur = { ...PRESETS[presetName][themeName] }
      rebuildAirflow()
    } else {
      syncCurrentsConfig()
    }
    applySceneTheme(def)
    applyAirflowTheme(airflow, airflowDef())
    post.setTheme(def, scene.background)
    syncWash()
    // The reflections come from a theme-specific studio, so drop the old one before the car is re-lit.
    if (envMap) {
      envMap.dispose()
      envMap = null
      scene.environment = null
    }
  }
  applyTheme(themeName)
  refreshCar()

  let wheelDist = 0
  let lastFlow = time.flow

  function draw() {
    updateScroll()
    updateCamera()
    updateAirflow(airflow, camera)
    wheelDist += (time.flow - lastFlow) * cur.wheelSync
    lastFlow = time.flow
    updateCarWheels(car, wheelDist)
    updateScene(scroll.progress, camera)
    post.render(time.elapsed, !staticTime)
  }

  const clock = new THREE.Clock()
  let running = true
  // Off-screen pause. The loop is a continuous animation (the flow field moves in
  // time), so unlike a scroll-only scene it cannot skip unchanged frames; what it
  // can do is stop entirely whenever its canvas is not on screen.
  let onScreen = true
  let rafId = 0

  function frame() {
    if (!running || !onScreen) {
      rafId = 0
      return
    }
    rafId = requestAnimationFrame(frame)

    const delta = Math.min(clock.getDelta(), 0.05)
    time.delta = delta
    if (!staticTime) time.elapsed += delta

    draw()
  }

  const watched = container || renderer.domElement
  const visibility = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
        const next = entries[entries.length - 1].isIntersecting
        if (next === onScreen) return
        onScreen = next
        if (onScreen && running && !rafId) {
          clock.getDelta() // discard the paused interval
          frame()
        }
      }, { rootMargin: '10% 0px' })
    : null
  if (visibility) visibility.observe(watched)

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
    post.render(time.elapsed, !staticTime)
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
    if (visibility) visibility.disconnect()
    stopViewportSync()
    stopWashSync()
    setProgressSource(null)
    setProgressOverride(null)
    post.dispose()
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
      draw()
    },
    // Restyle live ('dark' | 'light'), no reload.
    setTheme(name) {
      if (normaliseTheme(name) === themeName) return
      applyTheme(name)
      refreshCar()
      draw()
    },
    getTheme: () => themeName,
    setOrbit: setOrbitTarget,
    setLayout(mode) {
      setLayoutMode(mode)
      syncWash()
      draw()
    },
    post,
    // Force the scroll progress (0..1) and draw; null hands control back.
    setProgress(value) {
      setProgressOverride(value)
      draw()
    },
    getAirflow: () => airflow,
    // ---- tuning API (anim/f1-tune.html drives this; the live page can bake the numbers into tune.js) ----
    getCurrents: () => ({ ...cur }),
    getPreset: () => presetName,
    // Merge tune.js keys into the live currents. Keys that change the buffers rebuild the field.
    setCurrents(partial) {
      const rebuild = Object.keys(partial).some((k) => REBUILD_KEYS.has(k) && partial[k] !== cur[k])
      Object.assign(cur, partial)
      syncCurrentsConfig()
      if (rebuild) rebuildAirflow()
      else applyAirflowTheme(airflow, airflowDef())
      draw()
    },
    // Load a preset ('classic' | 'optimised') for the current theme, then layer optional overrides on it.
    setPreset(name, overrides = {}) {
      if (!PRESETS[name]) return null
      presetName = name
      cur = { ...PRESETS[name][themeName], ...overrides }
      rebuildAirflow()
      draw()
      return { ...cur }
    },
    getLivery: () => ({ ...liveryTune }),
    setLivery(partial) {
      tuneLivery(car, partial)
      draw()
    },
    resetLivery() {
      tuneLivery(car, { ...LIVERY_DEFAULTS })
      draw()
    },
    // 'dark' | 'light' | null: dress the car for a theme other than the page's (null follows the page).
    setLiveryTheme(name) {
      liveryTheme = name ? normaliseTheme(name) : null
      setCarStyle(liveryTheme ?? themeName)
      refreshCar()
      draw()
    },
    getLiveryTheme: () => liveryTheme ?? themeName,
    // 'blue' (default) | 'glb' | 'procedural': where the DARK car's colours come from.
    setLiverySource(name) {
      setLiverySource(name)
      refreshCar()
      draw()
    },
    getLiverySource,
    // Render cost of one frame, read from renderer.info (all passes of the composer, then the scene pass alone).
    measure() {
      const info = renderer.info
      const prev = info.autoReset
      info.autoReset = false
      info.reset()
      draw()
      const frame = { calls: info.render.calls, triangles: info.render.triangles, lines: info.render.lines }
      info.reset()
      renderer.render(scene, camera)
      const scenePass = { calls: info.render.calls, triangles: info.render.triangles }
      info.autoReset = prev
      const g = airflow.mesh.geometry
      const perInstance = g.getAttribute('position').count
      return {
        preset: presetName,
        instances: airflow.instanceCount,
        pointsPerLine: airflow.points,
        vertsPerInstance: perInstance,
        trianglesPerInstance: g.index.count / 3,
        fieldVertices: airflow.instanceCount * perInstance,
        fieldTriangles: airflow.instanceCount * (g.index.count / 3),
        frame,
        scenePass,
        geometries: info.memory.geometries,
        programs: info.programs?.length ?? 0,
      }
    },
    getPresetId: () => currentPresetId,
    getCar: () => car,
    rebuildAirflow,
  }
}
