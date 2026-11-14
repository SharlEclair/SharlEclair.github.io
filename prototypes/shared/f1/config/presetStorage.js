import { config } from '../config.js'
import {
  PRESETS,
  DEFAULT_PRESET_ID,
  PRESET_STORAGE_KEY,
  deepAssignNamed,
} from './presets.js'

// Per-preset persistence.
//
// The panel already persists the whole config, but it can only do so under ONE
// key. With two presets that means every edit made on the "F1" look would come
// back the next time the page opened on "Currents" -- the presets would bleed
// into each other, and switching would appear to do nothing.
//
// So each preset gets its own vault, and this module owns the read side.
//
// This deliberately does NOT apply the preset. Applying it is
// `applyPresetToConfig`'s job and it reports what has to be rebuilt; doing it
// here as well would apply the spec twice per switch, and the second pass would
// diff a config against itself and report that nothing changed. The order the
// caller must use is:
//
//   1. applyPresetToConfig(id, DEFAULTS)  -- baseline, then the preset's spec;
//   2. mergePresetEdits(id)               -- that preset's saved edits on top.
//
// Restoring (2) from the vault on the next load is exactly right: the saved
// edits were made against the same spec, so what comes back is a continuation
// of the same look rather than a half-merged hybrid.

const editKey = (presetId) => `f1-presets-page-config-v1:${presetId}`

export function loadPresetSelection() {
  try {
    const id = localStorage.getItem(PRESET_STORAGE_KEY)
    if (id && PRESETS.some((p) => p.id === id)) return id
  } catch (_) { /* storage blocked; fall through to the default */ }
  return DEFAULT_PRESET_ID
}

export function savePresetSelection(id) {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, id)
  } catch (_) { /* ignore */ }
}

// Layer the edits saved against `id` over whatever the config currently holds.
// Returns whether a vault was found, so a caller can tell "no edits yet" from
// "edits that happened to change nothing".
export function mergePresetEdits(id) {
  try {
    const raw = localStorage.getItem(editKey(id))
    if (!raw) return false
    deepAssignNamed(config, JSON.parse(raw))
    return true
  } catch (_) {
    return false
  }
}

export function savePresetConfig(id) {
  try {
    localStorage.setItem(editKey(id), JSON.stringify(config))
  } catch (_) { /* ignore */ }
}

export function clearPresetConfig(id) {
  try {
    localStorage.removeItem(editKey(id))
  } catch (_) { /* ignore */ }
}

// Read the raw vault contents, WITHOUT merging them into config. Used to capture
// what a reset is about to discard.
export function snapshotPresetConfig(id) {
  try {
    return localStorage.getItem(editKey(id))
  } catch (_) {
    return null
  }
}

// Clear the vault only if it still holds exactly what it held before the reset.
//
// Clearing unconditionally is the obvious implementation and it is subtly wrong:
// anything that re-saves between the capture and the clear would be silently
// thrown away. Comparing makes the intent explicit -- "drop the values we just
// discarded, keep anything the user has since created" -- so a future change to
// the save path cannot turn this into data loss without the check going red.
export function clearPresetConfigIfUnchanged(id, before) {
  try {
    const now = localStorage.getItem(editKey(id))
    if (now === before) {
      localStorage.removeItem(editKey(id))
      return true
    }
    return false
  } catch (_) {
    return false
  }
}
