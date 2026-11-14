// Authored defaults, loaded as raw JSON via a dedicated copy of the same code.
//
// Do NOT re-export `config` from here. `config` is a live singleton that the
// panel mutates in place and merges persisted values over, so any snapshot
// taken from it is only as pristine as the module-evaluation order happens to
// be -- importing this module from the panel captured an already-contaminated
// config and made "Reset Defaults" restore the very values it was meant to
// discard. Parsing an independent file cannot be affected by that ordering,
// and cannot be mutated by the reset that reads it.
import raw from '../config.defaults.json' with { type: 'json' }

export const DEFAULTS = raw
