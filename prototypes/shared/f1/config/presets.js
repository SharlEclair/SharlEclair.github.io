import { config } from '../config.js'
// The alternate spec lives in its own JSON file on purpose. It is a hand-tuned
// artefact that arrives as JSON and gets pasted back out as JSON, so keeping it
// verbatim means there is exactly one copy of these numbers in the project --
// no transcription step where a digit can drift, and no re-typing when the spec
// is revised.
import f1Spec from './f1.preset.json' with { type: 'json' }

// Two complete looks for the same scene, switchable at runtime.
//
//   currents  the shipped composition (src/config.js + config.defaults.json)
//   f1        the alternate animation spec, loaded from f1.preset.json above
//
// The alternate is stored as a delta and never as a full snapshot. A full
// snapshot would silently freeze every value that is not mentioned in the new
// spec -- the model path, palette-derived defaults, anything added to config.js
// later -- and then "switching preset" would quietly revert unrelated work.
// Merging means a preset controls exactly the keys it names and nothing else,
// and a key it does not name inherits from the baseline instead of being
// invented.
const F1_PRESET = f1Spec

// Order matters: this is the order the toggle renders in. The page opens on
// DEFAULT_PRESET_ID, which the switcher seeds from its own remembered choice.
export const PRESETS = [
  { id: 'currents', label: 'Currents', spec: null },
  { id: 'f1', label: 'F1 (new)', spec: F1_PRESET },
]

export const DEFAULT_PRESET_ID = 'f1'

// Remembers which preset the switcher was last on, for the next page load.
export const PRESET_STORAGE_KEY = 'f1-presets-page-select-v1'

// ---- Which keys the page must re-derive after a switch ---------------------
//
// A preset change is not just a pile of uniform writes. Some keys cache a value
// somewhere that a plain object assignment cannot reach, and each one has to be
// rebuilt explicitly or the page silently keeps rendering the old look.
//
// The CAR is handled with no key list at all, on purpose: EVERY changed car key
// marks the car for re-application.
//
// There used to be a CAR_KEYS set here naming only the placement keys (scale,
// rotation*, position*), with `carChanged` true only when one of those changed.
// That became wrong the moment the two presets disagreed about anything else. The
// f1 spec differs from the baseline in NINE car keys -- finish, color, roughness,
// metalness, clearcoat, clearcoatRoughness, envMapIntensity, environment and
// centerMode -- and NOT ONE of them was in the set. So switching to f1 reported
// carChanged: false, applyChanges skipped refreshCar(), and the car kept the
// previous finish and pivot while `config` held the new values. The preset page
// only looked right if it BOOTED on f1, because boot applies the spec before the
// scene is built.
//
// A key list is the wrong shape here because refreshCar() re-derives the
// transform AND the material in one call, so every car change wants the same
// response. The cost of being broad is one bounding-box measurement on a switch
// that touches only, say, keepOriginalMaterials.
//
// Keys that change HOW MANY airflow instances exist, or bake a per-instance
// attribute (band membership, violet membership). Those live in the geometry
// buffers and cannot be expressed as a uniform, so the geometry is rebuilt.
const AIRFLOW_STRUCTURAL_KEYS = new Set([
  'countLines', 'sheetCount', 'bandWidth', 'violetMix',
])
//
// Keys that determine how tall the document must be for the endpoint to be
// reachable at all. See the note in core/scroll.js.
const SCROLL_KEYS = new Set(['endVH'])

// Structural comparison of two config values, used to work out which caches a
// switch has invalidated. A key missing on either side counts as different --
// that is what makes an added or removed key show up rather than being ignored.
function sameJson(a, b, depth = 0) {
  if (a === undefined || b === undefined) return a === b
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (depth > 8) return false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if (!sameJson(a[k], b[k], depth + 1)) return false
  }
  return true
}

// Config is plain JSON by construction (numbers, strings, booleans, nested
// objects), so structuredClone is exact and has no prototype surprises. The
// JSON fallback covers older engines where structuredClone is absent.
function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0]
}

// Merge only the keys the preset actually names. `undefined` leaves are skipped
// so an omitted key inherits instead of blanking the target.
export function deepAssignNamed(target, source) {
  if (!source) return
  for (const k of Object.keys(source)) {
    const v = source[k]
    if (v === undefined) continue
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      target[k] !== null &&
      typeof target[k] === 'object' &&
      !Array.isArray(target[k])
    ) {
      deepAssignNamed(target[k], v)
    } else if (k in target) {
      target[k] = v
    }
  }
}

// Which keys changed between two config states, and therefore which caches are
// now stale. Kept pure and exported so it can be exercised directly, rather than
// only through a full preset apply where the answer depends on which values the
// two specs happen to share today.
//
// `needsCameraRebuild` is unconditional rather than diffed: the position curve,
// the target curve and both endpoints feed the same three rebuilt objects, and
// the check costs less than the class of bug it prevents -- a preset that moves
// only the aim point leaving the camera flying the previous arc.
export function classifyPresetChanges(before, after) {
  // Tolerant of a partial snapshot: a group missing from either side means
  // "nothing known changed there", not a crash. The only caller in the app
  // always passes a full snapshot, but this function is exported for tests and
  // diagnostic use, and a TypeError from a comparison helper is a bad failure
  // mode for something whose whole job is reporting differences.
  const changed = (group) => {
    const a = after?.[group]
    const b = before?.[group]
    if (!a || !b) return []
    return Object.keys(a).filter((k) => !sameJson(a[k], b[k]))
  }

  // Every changed car key, unfiltered -- see the note above on why there is no
  // CAR_KEYS list any more.
  const carKeys = changed('car')
  const airflowKeys = changed('airflow')
  const scrollKeys = changed('scroll')
  // Anything outside the three groups above -- camera.* and scroll.smoothing are
  // the ones that matter -- only needs the panel's numbers refreshed.
  const scalarKeys = changed('camera').concat(
    changed('scroll').filter((k) => !SCROLL_KEYS.has(k)),
  )

  return {
    carKeys,
    airflowKeys,
    scrollKeys,
    scalarKeys,
    carChanged: carKeys.length > 0,
    // The airflow field is re-synced from config every frame, so a plain value
    // change needs nothing. Only a change in instance COUNT or per-instance
    // attributes forces a geometry rebuild.
    needsAirflowRebuild: airflowKeys.some((k) => AIRFLOW_STRUCTURAL_KEYS.has(k)),
    needsScrollLayout: scrollKeys.some((k) => SCROLL_KEYS.has(k)),
    needsCameraRebuild: true,
  }
}

// Take a snapshot of the groups a preset can touch, in the shape
// classifyPresetChanges expects.
export function snapshotConfig() {
  return {
    car: clone(config.car),
    airflow: clone(config.airflow),
    scroll: clone(config.scroll),
    camera: clone(config.camera),
  }
}

// Write a preset into the live `config` singleton and report what the caller has
// to rebuild. It does NOT rebuild anything itself: that is applyPresetChanges'
// job. Splitting the two is what lets a caller layer its own edits on top (see
// mergePresetEdits) and then rebuild ONCE against the true before/after -- if the
// apply also rebuilt, the edits that landed afterwards would never be applied to
// the scene or shown in the panel.
export function applyPresetToConfig(id, baseline, before = snapshotConfig()) {
  const preset = getPreset(id)

  // Merge, do not assign: `config` is a live singleton whose nested objects are
  // referenced by every lil-gui controller, so it is rewritten in place.
  //
  // The baseline is re-applied FIRST, every time. Layering preset specs
  // directly on top of whatever the previous preset left behind would make any
  // key the presets do not all name sticky -- switch back to "currents" after a
  // preset that set trajectoryLift and the lift would survive the switch even
  // though the currents spec never asks for it.
  deepAssignNamed(config, baseline)
  if (preset.spec) deepAssignNamed(config, preset.spec)

  return {
    id: preset.id,
    label: preset.label,
    ...classifyPresetChanges(before, snapshotConfig()),
  }
}
