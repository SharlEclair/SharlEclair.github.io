import GUI from 'lil-gui'
import { config } from '../config.js'
import { DEFAULTS } from '../config/defaults.js'
import { layoutScrollSpace } from '../core/scroll.js'
import {
  rebuildCurves,
  snapToStart,
  snapToEnd,
  currentCameraState,
} from '../camera/rig.js'
import { EASING_NAMES } from '../camera/trajectory.js'
import { FINISHES, FINISH_NAMES } from '../car/finishes.js'

const STORAGE_KEY = 'f1-currents-config-v1'
const RESET_FLAG = 'f1-currents-reset-pending'

// Give each controller a range derived from the value it currently holds, so a
// slider can never be pinned against a hard limit no matter how far the numbers
// have been pushed by hand.
//
// Floors are deliberately wide. A slider whose range is only slightly bigger
// than its value is unusable: almost the whole track does nothing and the
// usable part is a few pixels. Position and target get a +/-50 world-unit floor
// (the field is only ~30 units across, so that is already well beyond useful),
// and rotation gets a full +/-360 sweep.
function applyRange(controllers, floor) {
  for (const c of controllers) {
    const v = Number(c.getValue())
    if (!Number.isFinite(v)) continue
    const room = Math.max(Math.abs(v) * 1.5, floor)
    c.min(-room).max(room)
    c.updateDisplay()
  }
}

const applyDynamicRanges = (controllers) => applyRange(controllers, 50)
const applyRotationRanges = (controllers) => applyRange(controllers, 360)

// `rebuildAirflow` regenerates the instanced geometry; it is only needed when a
// change alters the *count* of instances or per-instance attributes (density,
// sheet count, focal band width), which cannot be done by uniform alone.
// `refreshCar` re-derives the car's transform AND material from the live config.
// It replaced a `getCar` getter: every car control needs both, so the panel no
// longer reaches for the object at all and the caller owns the sequencing.
// `applyFinish` copies a named surface finish into the editable sliders.
// `storageKey` is per page: several entry points share this panel, and without
// it each one would load and overwrite the others' saved state.
// `storageKey` is per page: several entry points share this panel, and without
// it each one would load and overwrite the others' saved state.
// `onReset` optionally replaces what "Reset Defaults" restores.
// `onAfterReset` runs once the reset has finished, for side effects the panel
// itself knows nothing about (dropping a per-preset vault, for instance).
// `onPersist` optionally takes over saving. The panel's built-in persistence
// writes one key for the whole config, which is wrong for a page with several
// presets -- and worse than useless during a reset, where clearing the vault and
// then re-saving the same state one tick later means a reload resurrects exactly
// the values that were just discarded. Handing persistence to the caller lets it
// decide what "saved" means.
// `onResetVault` optionally supplies { snapshot(), clearIfUnchanged(before) } so
// a caller-owned store can be cleared as the very last step of a reset.
export function createPanel({
  rebuildAirflow,
  refreshCar,
  applyFinish,
  storageKey = STORAGE_KEY,
  onReset = null,
  onAfterReset = null,
  onPersist = null,
  onResetVault = null,
}) {
  loadPersisted(storageKey)

  // Where a save goes. Either the caller owns it, or it goes to the panel's own
  // key. Never both -- two writers for one piece of state is the bug this shape
  // exists to avoid.
  const save = onPersist || ((value) => persist(storageKey, value))

  const needsRebuild = () => { if (rebuildAirflow) rebuildAirflow() }

  const gui = new GUI({
    title: 'F1 × Currents',
    width: 320,
  })
  gui.domElement.style.zIndex = '9999'

  // ---------- Camera Start ----------
  const fs = gui.addFolder('Camera Start')
  const sPos = fs.addFolder('Position (world units)')
  const sPosC = [
    sPos.add(config.camera.start.position, 'x', -60, 60, 0.01).onChange(rebuildCurves),
    sPos.add(config.camera.start.position, 'y', -30, 90, 0.01).onChange(rebuildCurves),
    sPos.add(config.camera.start.position, 'z', -60, 60, 0.01).onChange(rebuildCurves),
  ]
  applyDynamicRanges(sPosC)
  const sTgt = fs.addFolder('Target (aim point)')
  const sTgtC = [
    sTgt.add(config.camera.start.target, 'x', -50, 50, 0.01).onChange(rebuildCurves),
    sTgt.add(config.camera.start.target, 'y', -20, 20, 0.01).onChange(rebuildCurves),
    sTgt.add(config.camera.start.target, 'z', -50, 50, 0.01).onChange(rebuildCurves),
  ]
  applyDynamicRanges(sTgtC)
  // Orientation layered on top of the aim. Degrees, like every other rotation.
  const sRot = fs.addFolder('Rotation (deg)')
  const sRotC = [
    sRot.add(config.camera.start.rotation, 'x', -180, 180, 0.1).name('pitch X').onChange(rebuildCurves),
    sRot.add(config.camera.start.rotation, 'y', -180, 180, 0.1).name('yaw Y').onChange(rebuildCurves),
    sRot.add(config.camera.start.rotation, 'z', -180, 180, 0.1).name('roll Z').onChange(rebuildCurves),
  ]
  applyRotationRanges(sRotC)
  fs.add(config.camera.start, 'fov', 5, 120, 0.1).onChange(rebuildCurves)

  // ---------- Camera End ----------
  const fe = gui.addFolder('Camera End')
  const ePos = fe.addFolder('Position (world units)')
  const ePosC = [
    ePos.add(config.camera.end.position, 'x', -60, 60, 0.01).onChange(rebuildCurves),
    ePos.add(config.camera.end.position, 'y', -30, 90, 0.01).onChange(rebuildCurves),
    ePos.add(config.camera.end.position, 'z', -60, 60, 0.01).onChange(rebuildCurves),
  ]
  applyDynamicRanges(ePosC)
  const eTgt = fe.addFolder('Target (aim point)')
  const eTgtC = [
    eTgt.add(config.camera.end.target, 'x', -50, 50, 0.01).onChange(rebuildCurves),
    eTgt.add(config.camera.end.target, 'y', -20, 20, 0.01).onChange(rebuildCurves),
    eTgt.add(config.camera.end.target, 'z', -50, 50, 0.01).onChange(rebuildCurves),
  ]
  applyDynamicRanges(eTgtC)
  const eRot = fe.addFolder('Rotation (deg)')
  const eRotC = [
    eRot.add(config.camera.end.rotation, 'x', -180, 180, 0.1).name('pitch X').onChange(rebuildCurves),
    eRot.add(config.camera.end.rotation, 'y', -180, 180, 0.1).name('yaw Y').onChange(rebuildCurves),
    eRot.add(config.camera.end.rotation, 'z', -180, 180, 0.1).name('roll Z').onChange(rebuildCurves),
  ]
  applyRotationRanges(eRotC)
  fe.add(config.camera.end, 'fov', 5, 120, 0.1).onChange(rebuildCurves)

  // ---------- Camera Trajectory ----------
  const ft = gui.addFolder('Camera Trajectory')

  // Car lock. Blends the aim point off the authored target curve and onto the
  // car's measured centre, so the car can be held in frame for the whole flight
  // while the camera still travels start -> end. At 1 the authored rotation layer
  // is scaled out too, which is what makes it a true look-at -- see config.js.
  //
  // No onChange: updateCamera() re-reads this every frame, and a preset switch
  // goes through the caller's rebuild + panel.refresh() path.
  const flock = ft.addFolder('Car lock (track the car)')
  flock.add(config.camera, 'carLock', 0, 1, 0.01).name('camera lock (0-1)')

  // Path geometry. Each term moves the path's control point independently, so
  // the flight can bow sideways and vertically, bend early or late, and swing
  // around the subject.
  const fpath = ft.addFolder('Path shape (position)')
  fpath.add(config.camera, 'trajectoryShape', -2, 2, 0.005).name('sideways bow').onChange(rebuildCurves)
  fpath.add(config.camera, 'trajectoryLift', -2, 2, 0.005).name('vertical bow').onChange(rebuildCurves)
  fpath.add(config.camera, 'trajectoryArcPos', 0.05, 0.95, 0.005).name('bow peak at').onChange(rebuildCurves)
  fpath.add(config.camera, 'trajectoryOrbit', -360, 360, 0.5).name('orbit around axis (deg)').onChange(rebuildCurves)

  // The aim point flies its own arc, so the camera can sweep across the car
  // while the body takes a different line.
  const faim = ft.addFolder('Path shape (aim / target)')
  faim.add(config.camera, 'trajectoryTargetShape', -2, 2, 0.005).name('aim sideways bow').onChange(rebuildCurves)
  faim.add(config.camera, 'trajectoryTargetArcPos', 0.05, 0.95, 0.005).name('aim bow peak at').onChange(rebuildCurves)

  // Motion profile: how scroll maps onto distance travelled. The strongest
  // controls here for how the move *feels*.
  const fmotion = ft.addFolder('Motion profile')
  fmotion.add(config.camera, 'trajectoryEase', EASING_NAMES).name('position easing')
  fmotion.add(config.camera, 'trajectoryTargetEase', EASING_NAMES).name('aim easing')
  fmotion.add(config.camera, 'trajectoryArcDivisions', 20, 800, 10).name('arc resolution').onChange(rebuildCurves)

  const ftilt = ft.addFolder('Dutch tilt')
  ftilt.add(config.camera, 'dutchAngle', -180, 180, 0.1).name('tilt (deg)')
  ftilt.add(config.camera, 'dutchStart', 0, 1, 0.005).name('ramp starts at')
  ftilt.add(config.camera, 'dutchEnd', 0, 1, 0.005).name('ramp full at')

  const fscroll = ft.addFolder('Scroll')
  fscroll.add(config.camera, 'rotationOrder', ['XYZ', 'YXZ', 'ZXY', 'XZY', 'YZX', 'ZYX'])
    .name('rotation order').onChange(rebuildCurves)
  // Changing the endpoint changes how much scroll room the document needs, so
  // it must be relaid out or the new endpoint becomes unreachable.
  fscroll.add(config.scroll, 'endVH', 0.5, 12, 0.01).name('endpoint (vh)')
    .onChange(layoutScrollSpace)
  ft.add(config.scroll, 'smoothing', 0.01, 1, 0.005)

  // ---------- Car ----------
  const fc = gui.addFolder('Car')

  // Placement. `autoCenter` is what makes the position sliders mean what they
  // look like they mean -- the exported GLB is off-centre by ~0.98 units in Z
  // and ~1.29 in Y, so without it these three values are compensating for a
  // modelling offset rather than placing the car. See config.js.
  const fplace = fc.addFolder('Placement')
  fplace.add(config.car, 'autoCenter').name('auto-centre model').onChange(refreshCar)
  fplace.add(config.car, 'centerMode', ['bbox', 'ground']).name('pivot').onChange(refreshCar)
  fplace.add(config.car, 'scale', 0.05, 3, 0.005).onChange(refreshCar)
  fplace.add(config.car, 'positionX', -20, 20, 0.01).name('position X').onChange(refreshCar)
  fplace.add(config.car, 'positionY', -10, 10, 0.01).name('position Y').onChange(refreshCar)
  fplace.add(config.car, 'positionZ', -20, 20, 0.01).name('position Z').onChange(refreshCar)
  fplace.add(config.car, 'rotationX', -360, 360, 0.01).name('rotation X (deg)').onChange(refreshCar)
  fplace.add(config.car, 'rotationY', -360, 360, 0.01).name('rotation Y (deg)').onChange(refreshCar)
  fplace.add(config.car, 'rotationZ', -360, 360, 0.01).name('rotation Z (deg)').onChange(refreshCar)

  // ---- Finish ------------------------------------------------------------
  // Three looks, then every dial behind them. Picking a finish writes its
  // numbers into the sliders below (see car/finishes.js), so you can take
  // Obsidian and then push roughness around by hand -- the buttons are a
  // starting point, not a mode you are locked into.
  const ffinish = fc.addFolder('Finish')

  // Every control that only exists to shape the TINT. `environment` and the
  // keep-original switch itself are deliberately not in here: reflections are a
  // scene-level effect that still applies to the model's own materials, and the
  // switch has to stay live or it could never be turned off again.
  const tintCtrls = []

  for (const key of FINISH_NAMES) {
    const label = `apply ${FINISHES[key].label.toLowerCase()}`
    // lil-gui reads a controller's property off its target object, so this
    // works because nothing reads `finishActions` back -- the click is the whole
    // interface. A function-valued property renders as a button.
    tintCtrls.push(ffinish.add({
      [label]: () => {
        applyFinish(key)
        // Repaint after writing, so the sliders show what was just applied.
        for (const c of allControllers(gui)) c.updateDisplay()
        refreshCar()
      },
    }, label))
  }

  // Tint-only: nothing here reaches the car while the originals win.
  for (const [key, min, max, step] of [
    ['roughness', 0, 1, 0.005],
    ['metalness', 0, 1, 0.005],
    ['clearcoat', 0, 1, 0.005],
    ['clearcoatRoughness', 0, 1, 0.005],
  ]) {
    tintCtrls.push(ffinish.add(config.car, key, min, max, step).onChange(refreshCar))
  }

  const colorCtrl = ffinish.addColor(config.car, 'color').name('body colour').onChange(refreshCar)
  tintCtrls.push(colorCtrl)

  // NOT tint-only, and deliberately outside the disabled group: the reflections
  // settings are written to the model's own materials too (see car/loader.js), so
  // this scales them while the originals win. Disabling it here was what made the
  // slider look broken rather than absent.
  ffinish.add(config.car, 'envMapIntensity', 0, 3, 0.01).onChange(refreshCar)
  ffinish.add(config.car, 'environment').name('reflections (env map)').onChange(refreshCar)
  // Not pushed into tintCtrls: this is the switch that has to stay live, or the
  // originals could never be handed back to the tint.
  ffinish.add(config.car, 'keepOriginalMaterials')
    .name('keep original part colours')
    .onChange(() => {
      syncMaterialControls()
      refreshCar()
    })

  // Nothing above can reach the car while the model's own per-part colours win --
  // the tint is not applied at all -- so all of it is disabled rather than left
  // looking live. The body colour picker was the only one greyed out before, which
  // left six finish buttons and sliders that moved and changed nothing.
  function syncMaterialControls() {
    const keep = config.car.keepOriginalMaterials
    for (const c of tintCtrls) {
      if (keep) c.disable()
      else c.enable()
    }
  }
  syncMaterialControls()

  // ---------- Airflow ----------
  const fa = gui.addFolder('Airflow')

  // Density. These change the instance buffers themselves, so they rebuild the
  // geometry rather than just setting a uniform.
  const fd = fa.addFolder('Density (Currents)')
  fd.add(config.airflow, 'countLines', 40, 1400, 10).name('lines / sheet').onChange(needsRebuild)
  fd.add(config.airflow, 'sheetCount', 1, 6, 1).name('sheets').onChange(needsRebuild)
  fd.add(config.airflow, 'sheetSpread', 0, 8, 0.01).name('sheet separation')
  fd.add(config.airflow, 'sheetPhaseJitter', 0, 1, 0.01).name('sheet phase jitter')
  fd.add(config.airflow, 'bandWidth', 0, 4, 0.05).name('band width').onChange(needsRebuild)
  fd.add(config.airflow, 'violetMix', 0, 1, 0.01).name('violet mix').onChange(needsRebuild)

  const fl = fa.addFolder('Lines')
  fl.add(config.airflow, 'flowSpeed', 0, 20, 0.01).name('flow speed')
  // flowSpeed and cycleLength are coupled: travel per cycle is
  // flowSpeed * cycleLength, and shrinking that makes lines jump at the recycle
  // seam. They sit together here so the pair is visible.
  fl.add(config.airflow, 'cycleLength', 20, 160, 1).name('cycle length')
  fl.add(config.airflow, 'timeSeed', 0, 60, 0.5).name('pre-roll (s)')
  fl.add(config.airflow, 'lineThickness', 0.2, 12, 0.01).name('thickness (px)')
  fl.add(config.airflow, 'opacity', 0, 1, 0.01)
  fl.add(config.airflow, 'microOscillation', 0, 0.5, 0.005).name('micro oscillation')
  // These two define the ribbon geometry, so they rebuild.
  fl.add(config.airflow, 'lateralSpread', 1, 40, 0.05).name('field half-width').onChange(needsRebuild)
  fl.add(config.airflow, 'lineLength', 10, 80, 0.5).name('line length').onChange(needsRebuild)

  const fs2 = fa.addFolder('Splay (Currents look)')
  fs2.add(config.airflow, 'influenceSplay', 0, 8, 0.01).name('sideways push')
  fs2.add(config.airflow, 'influenceLateral', 0, 12, 0.01).name('depth splay')
  fs2.add(config.airflow, 'influenceUpstream', 0, 8, 0.01).name('upstream reach')
  fs2.add(config.airflow, 'influenceWake', 0, 8, 0.01).name('wake reach')
  fs2.add(config.airflow, 'influenceBackFactor', 0, 1, 0.01).name('wake strength')

  // The influence ellipsoid. All six components are read by the vertex shader
  // (see the car-relative note in airflow/field.js), so every slider here has a
  // visible effect.
  const fbox = fa.addFolder('Car influence volume')
  fbox.add(config.airflow.carCenter, 'x', -8, 8, 0.01).name('center X (streamwise)')
  fbox.add(config.airflow.carCenter, 'y', -8, 8, 0.01).name('center Y (height)')
  fbox.add(config.airflow.carCenter, 'z', -8, 8, 0.01).name('center Z (lateral)')
  fbox.add(config.airflow.carHalf, 'x', 0.05, 8, 0.01).name('half-length X')
  fbox.add(config.airflow.carHalf, 'y', 0.05, 6, 0.01).name('half-height Y')
  fbox.add(config.airflow.carHalf, 'z', 0.05, 6, 0.01).name('half-width Z')

  const fwake = fa.addFolder('Wake (behind car)')
  fwake.add(config.airflow, 'wakeStartOffset', 0, 4, 0.01).name('starts behind rear')
  fwake.add(config.airflow, 'wakeLength', 0.5, 20, 0.1).name('length')
  fwake.add(config.airflow, 'wakeLateral', 0, 3, 0.01).name('sideways spread')
  fwake.add(config.airflow, 'wakeLateralGain', 0, 3, 0.01).name('spread gain over splay')
  fwake.add(config.airflow, 'wakeLiftTarget', -2, 3, 0.01).name('settle height')
  fwake.add(config.airflow, 'wakeLift', 0, 2, 0.01).name('settle strength')

  const fground = fa.addFolder('Ground')
  fground.add(config.airflow, 'groundY', -5, 5, 0.01).name('ground height')
  fground.add(config.airflow, 'groundClamp', 0, 1, 0.01).name('hold lines above')
  fground.add(config.airflow, 'groundSoftness', 0, 3, 0.01).name('compression band')

  const fd2 = fa.addFolder('Depth reveal (2D -> 3D)')
  // The headline control: how far the lines fan apart vertically once revealed.
  // 0 keeps the field perfectly flat; higher values open it into a volume.
  fd2.add(config.airflow, 'verticalSpread', 0, 20, 0.01).name('3D vertical spread')
  // NOTE: sheetSpread used to be here AND under Density, so two sliders drove one
  // value and disagreed on screen. It lives under Density now.
  fd2.add(config.airflow, 'depthStart', 0, 1, 0.005).name('reveal starts at')
  fd2.add(config.airflow, 'depthEnd', 0, 1, 0.005).name('reveal full at')
  fd2.add(config.airflow, 'depthSharpness', 0.5, 4, 0.05).name('reveal sharpness')

  const ft2 = fa.addFolder('Turbulence')
  ft2.add(config.airflow, 'turbStart', 0, 1, 0.005).name('ramp starts at')
  ft2.add(config.airflow, 'turbEnd', 0, 1, 0.005).name('ramp full at')
  ft2.add(config.airflow, 'turbStrength', 0, 3, 0.05).name('strength')
  ft2.add(config.airflow, 'turbVertical', 0, 2, 0.01).name('vertical share')
  ft2.add(config.airflow, 'turbLateral', 0, 2, 0.01).name('lateral share')
  ft2.add(config.airflow, 'turbLocalise', 0, 1, 0.01).name('confine to disturbed flow')
  ft2.add(config.airflow, 'turbWakeMix', 0, 1, 0.01).name('wake counts as disturbed')
  const ftf = ft2.addFolder('Noise shape')
  ftf.add(config.airflow, 'turbFreqX', 0.1, 10, 0.05).name('wave frequency X')
  ftf.add(config.airflow, 'turbFreqX2', 0.1, 10, 0.05).name('wave frequency X2')
  ftf.add(config.airflow, 'turbFreqZ', 0.1, 10, 0.05).name('wave frequency Z')
  ftf.add(config.airflow, 'turbFreqZ2', 0.1, 10, 0.05).name('wave frequency Z2')
  ftf.add(config.airflow, 'turbSpeed', 0, 8, 0.01).name('pattern speed')
  ftf.add(config.airflow, 'turbPhaseSpread', 0, 3, 0.01).name('per-line phase spread')

  const fv = fa.addFolder('Vortex')
  fv.add(config.airflow, 'vortexStart', 0, 1, 0.005).name('vortex start')
  fv.add(config.airflow, 'vortexEnd', 0, 1, 0.005).name('vortex end')
  fv.add(config.airflow, 'vortexSpin', 0, 5, 0.01).name('vortex spin')
  fv.add(config.airflow, 'vortexTwist', 0, 5, 0.01).name('vortex twist')
  fv.add(config.airflow, 'vortexCoreY', -5, 10, 0.01).name('vortex core Y')
  fv.add(config.airflow, 'vortexCoreZ', 0, 10, 0.01).name('vortex core Z')
  fv.add(config.airflow, 'vortexRadiusGain', 0, 0.3, 0.001).name('spiral widening')

  // ---------- Actions ----------
  //
  // The reset is injectable. On a page with several presets, "reset" means
  // "restore the look I am currently on" -- restoring the file defaults instead
  // would quietly drop the user off the preset they were tuning, which is the
  // opposite of what the button promises. `onReset` owns the config rewrite and
  // the scene rebuild; the panel owns the label, the storage flush and the
  // slider refresh that must follow either way.
  const resetFunction = onReset || (() => {
    deepAssign(config, DEFAULTS)
    rebuildCurves()
    refreshCar()
    syncMaterialControls()
  })

  const actions = {
    snapStart: () => snapToStart(),
    snapEnd: () => snapToEnd(),
    copyCamera: () => copyJson(currentCameraState(), 'Current camera state'),
    copyAll: () => copyJson(config, 'Full config'),
    save: () => save(config),
    reset: () => {
      // Rewrite in place as well as clearing storage. Relying on
      // removeItem + location.reload() alone is fragile: `config` is a live
      // singleton that has already been mutated, so if anything repopulates
      // the key (a second tab, browser session restore, a stale HMR module)
      // the reset silently does nothing. Mutating the object the renderer
      // actually reads makes the reset take effect on the current frame.
      //
      // The vault is CLEARED LAST, and only if it still holds the values that
      // were just discarded. Clearing it first looks tidier and is wrong: the
      // refresh below fires the panel's change handler, which saves -- so the
      // newly restored state would be written straight back into a vault that
      // was supposed to be empty, and a reload would restore the discarded edit
      // through it. Capturing the pre-reset contents and comparing gives a
      // precise "did anything re-save?" test instead of guesswork.
      const vaultBefore = onResetVault ? onResetVault.snapshot() : null
      resetFunction()

      // Re-derive everything that caches a value off `config`. The airflow
      // rebuild is safe here even when nothing structural changed: the sliders
      // that need it are not the ones that reach this path, but the ones that
      // are dirty when reset is pressed may well be.
      rebuildAirflow()

      for (const c of allControllers(gui)) c.updateDisplay()

      onAfterReset?.()

      // When the caller owns persistence, it also owns what happens to its store
      // on reset -- and it must be the LAST word, because its save is
      // fire-and-forget (debounced) and the panel cannot know when it lands. A
      // save the panel issues here would therefore arrive after the caller's
      // clear and silently refill the store it had just emptied.
      if (onPersist) {
        onResetVault?.clearIfUnchanged(vaultBefore)
      } else {
        localStorage.removeItem(storageKey)
        localStorage.removeItem(RESET_FLAG)
        save(config)
      }

      console.log(`[F1 x Currents] Config reset (${
        onReset ? 'active preset' : 'defaults from src/config.js'
      })`)
    },
  }

  const ff = gui.addFolder('Actions')
  ff.add(actions, 'snapStart').name('Snap Camera to Start')
  ff.add(actions, 'snapEnd').name('Snap Camera to End')
  ff.add(actions, 'copyCamera').name('Copy Current Camera (JSON)')
  ff.add(actions, 'copyAll').name('Copy Full Config (JSON)')
  ff.add(actions, 'save').name('Save to localStorage')
  ff.add(actions, 'reset').name('Reset Defaults')

  // Auto-persist on panel changes.
  gui.onChange(() => save(config))

  // A thin facade rather than the raw GUI: callers need two behaviours lil-gui
  // does not have (re-read every control after the config is rewritten behind
  // the panel's back, and tear the panel down on demand), and `gui` stays
  // reachable for anything that wants the original object.
  return {
    gui,
    // A preset switch rewrites `config` behind the panel's back. Every
    // controller holds a reference to a nested object inside `config` (which is
    // why the preset merge mutates in place), but the DOM still shows the old
    // numbers until each one re-reads its target.
    refresh() {
      for (const c of allControllers(gui)) c.updateDisplay()
    },
    destroy() {
      gui.destroy()
    },
  }
}

// Clipboard writes reject when the document isn't focused or permission is
// withheld, and an unhandled rejection is invisible in the UI -- the button
// just appears to do nothing. Always echo the payload to the console so there
// is a recoverable path.
function copyJson(value, label) {
  const json = JSON.stringify(value, null, 2)
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(json).catch((err) => {
      console.warn(`[F1 x Currents] Clipboard blocked (${err?.name || err}). Copy from here:\n` + json)
    })
  }
  console.log(`[F1 x Currents] ${label}:\n` + json)
}

function persist(storageKey, value) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value))
  } catch (_) { /* ignore */ }
}

function loadPersisted(storageKey) {
  try {
    // A reset that happened before a reload wins over anything still stored.
    if (localStorage.getItem(RESET_FLAG)) {
      localStorage.removeItem(RESET_FLAG)
      localStorage.removeItem(storageKey)
      return
    }
    const raw = localStorage.getItem(storageKey)
    if (!raw) return
    const saved = JSON.parse(raw)
    deepAssign(config, saved)
  } catch (_) { /* ignore */ }
}

// Every controller in the tree, so a reset can refresh the displayed values.
// lil-gui stores children in `controllers` / `folders` rather than exposing a
// flat list, so this walks it.
function allControllers(folder) {
  const found = [...folder.controllers]
  for (const child of folder.folders) found.push(...allControllers(child))
  return found
}

function deepAssign(target, source) {
  for (const k of Object.keys(source)) {
    if (
      target[k] &&
      typeof target[k] === 'object' &&
      typeof source[k] === 'object' &&
      !Array.isArray(source[k])
    ) {
      deepAssign(target[k], source[k])
    } else if (k in target) {
      target[k] = source[k]
    }
  }
}