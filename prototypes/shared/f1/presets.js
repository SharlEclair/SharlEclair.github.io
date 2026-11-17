import { createExperience } from './core/experience.js'
import { createPresetToggle } from './ui/presetToggle.js'
import { applyPresetToConfig, PRESETS } from './config/presets.js'
import { DEFAULTS } from './config/defaults.js'
import {
  loadPresetSelection,
  savePresetSelection,
  mergePresetEdits,
  savePresetConfig,
  snapshotPresetConfig,
  clearPresetConfigIfUnchanged,
} from './config/presetStorage.js'

// Entry point for presets.html -- the page that toggles between the shipped
// Currents animation and the alternate F1 spec.
//
// It runs the same scene, the same panel and the same frame loop as index.html.
// The only differences are the ones a switcher actually needs: which preset is
// live, where that choice is remembered, and a UI to change it. No part of the
// render pipeline is forked.

// The panel's own single-key store. Loaded once at boot so any state saved by an
// earlier build is picked up; never written to again. Persistence from here on
// belongs to the per-preset vault in presetStorage.js, because one key cannot
// express "this edit belongs to look B".
const storageKey = 'f1-presets-page-panel-v1'

// Read the remembered choice BEFORE the scene is built. The config it selects
// has to be in place before the first frame, or the page opens on one look and
// snaps to the other.
let activeId = loadPresetSelection()

// ---------------------------------------------------------------------------
// Saving
//
// A panel interaction fires onChange dozens of times while a slider is dragged,
// so the write is debounced. The preset each write belongs to is captured WHEN
// THE SAVE IS SCHEDULED, not read when it fires -- the bug that shape exists to
// prevent:
//
//   flushSave(); activeId = next;   // switch the preset
//
// `flushSave` clears the timer and saves immediately, which is fine. But any
// save still in flight (a debounce that had not fired yet) runs its callback
// AFTER `activeId` has been reassigned, so it writes the OUTGOING look's values
// into the INCOMING look's vault. The next visit to that preset then restores
// the wrong look -- the two animations bleed into each other through storage,
// which is exactly what per-preset vaults are supposed to make impossible.
//
// Saving is also SUSPENDED while a preset switch or a reset is in flight:
//
//   * switching rewrites every value, and the panel re-reads all of them as it
//     refreshes, so an unsuppressed auto-save would record the rewrite as if the
//     user had typed it;
//   * resetting is not an edit at all -- the vault should end up clear, not
//     refilled with the spec values the reset just restored.
let saveTimer = 0
let saveTarget = null
let saveSuspended = false

function scheduleSave() {
  if (saveSuspended) return
  clearTimeout(saveTimer)
  // Bound at schedule time, so a switch mid-debounce cannot misattribute it.
  saveTarget = activeId
  saveTimer = setTimeout(() => {
    saveTimer = 0
    savePresetConfig(saveTarget)
    saveTarget = null
  }, 250)
}

function flushSave() {
  clearTimeout(saveTimer)
  saveTimer = 0
  // Write to the preset the pending save was scheduled for, or -- when nothing
  // is pending -- to the one that is active right now.
  savePresetConfig(saveTarget ?? activeId)
  saveTarget = null
}

// Run `fn` with auto-saving suspended, so a rewrite of the whole config cannot
// be mistaken for a user edit.
function withoutSaving(fn) {
  saveSuspended = true
  try {
    return fn()
  } finally {
    saveSuspended = false
  }
}

// The boot config is resolved HERE, before the scene exists, rather than from
// inside createExperience. Two reasons:
//
//   1. Nothing needs rebuilding on boot. The airflow geometry is built from
//      `config` a few lines later and the camera curves are built from it after
//      that, so applying a preset here IS the initial state, not a change to it.
//   2. A hook inside createExperience could not reach `app` anyway -- `const app`
//      is in its temporal dead zone for the whole of that call.
//
// Order: spec first, then the edits saved against that same preset. The merge is
// what makes a reload continue the look instead of resetting it -- the saved
// edits were made against this same spec, so they rebuild exactly the state that
// was left behind.
applyPresetToConfig(activeId, DEFAULTS)
mergePresetEdits(activeId)

const app = createExperience({
  canvas: document.querySelector('#webgl'),
  storageKey,
  presets: PRESETS,
  initialPresetId: activeId,
  onPersist: () => scheduleSave(),

  // Reset restores the ACTIVE preset, so that preset's vault has to be dropped
  // with it -- otherwise the next load would merge the discarded edits straight
  // back over the freshly restored spec, and the button would appear to do
  // nothing.
  onReset: () => withoutSaving(() => app.applyPreset(activeId)),
  onResetVault: {
    // Captured before the reset so the clear can tell "still the discarded
    // values" from "something legitimately re-saved since".
    snapshot: () => snapshotPresetConfig(activeId),
    clearIfUnchanged: (before) => clearPresetConfigIfUnchanged(activeId, before),
  },
})

// Swap the tab title to name what is on screen -- useful when both pages are
// open in separate tabs.
function syncTitle() {
  const preset = PRESETS.find((p) => p.id === activeId)
  document.title = `F1 × Currents - ${preset ? preset.label : activeId}`
}
syncTitle()

const toggle = createPresetToggle({
  presets: PRESETS,
  activeId,
  onChange: (id) => {
    if (id === activeId) return

    // Freeze the outgoing preset before leaving it, so nothing edited in the
    // last 250 ms is lost to the debounce.
    flushSave()

    activeId = id
    savePresetSelection(id)

    withoutSaving(() => {
      // The `edit` hook lands between "spec written" and "scene rebuilt". That is
      // the only window in which restoring the incoming preset's saved values can
      // have any effect: the rebuild happens once, after the hook, against the
      // final config. Merging after applyPreset instead would leave the scene and
      // the panel showing the spec while the config held the edits.
      const applied = app.applyPreset(id, { edit: () => mergePresetEdits(id) })

      syncTitle()
      console.log(
        `[F1 x Currents] preset -> ${applied.label} (${applied.id})` +
        `${applied.needsAirflowRebuild ? ' [airflow geometry rebuilt]' : ''}` +
        `${applied.carChanged ? ' [car transform + material re-applied]' : ''}`
      )
    })

    // The switch itself is not an edit. Nothing is written for either preset:
    // the outgoing one was just flushed, and the incoming one already holds
    // whatever was restored from its own vault.
  },
})

console.log(
  '[F1 x Currents] Presets page. Switch with 1/2 or ←/→, collapse the switcher with H. ' +
  `Active: ${activeId}`
)

// Kept reachable for console poking and for an automated smoke test.
window.__f1Presets = { app, toggle, getActiveId: () => activeId }
