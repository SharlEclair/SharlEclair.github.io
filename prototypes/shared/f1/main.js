import { createExperience } from './core/experience.js'

// The standalone page: full-window canvas, the tuning panel, window scroll.
// Embedding in a portfolio page goes through mount.js instead.
const query = new URLSearchParams(location.search)
const app = createExperience({
  canvas: document.querySelector('#webgl'),
  storageKey: 'f1-currents-upgraded-v1',
  // Tuning switches for measurement: ?pr=0.75 caps the pixel ratio, ?msaa=0 drops multisampling.
  maxPixelRatio: query.has('pr') ? Number(query.get('pr')) : 1.25,
  msaa: query.has('msaa') ? Number(query.get('msaa')) : 0,
})

// Verification hooks (tools/sheet.mjs): force a progress value, and know when the
// car has arrived so a capture is not taken of an empty line field.
window.__F1 = app
window.__TEST_SET_PROGRESS = (value) => app.setProgress(value)
const ready = setInterval(() => {
  if (app.getCar()) {
    window.__F1_READY = true
    clearInterval(ready)
  }
}, 100)
