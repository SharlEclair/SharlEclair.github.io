/**
 * Transit Desert - entry point (docs/08 Step 4: the src/main.js -> src/engine.js split).
 *
 * This module does exactly three things: resolve the DOM nodes the engine needs, hand the config
 * singleton to the browser as `window.__CONFIG` (docs/07 §2) *before* the first frame, and start the
 * engine. Everything else - the renderer, the shader materials, the camera spline, the render loop
 * and the test hooks - lives in `src/engine.js`.
 *
 * Keeping the entry point this thin is what makes `window.__CONFIG` useful to a headless harness: a
 * capture script can inject a preset the moment this module has run, without waiting for the GLB.
 */
import { config } from './config.js';
import { startEngine } from './engine.js';

const canvas = document.querySelector('#scene');
const stage = document.querySelector('#stage');
const hero = document.querySelector('#hero');
const hudProgress = document.querySelector('#hud-progress');

if (!canvas || !stage || !hero) {
  throw new Error('index.html must provide #scene, #stage and #hero (docs/06 §1)');
}

window.__CONFIG = config;
window.__APP_READY = false;

// Tuning switches for measurement: ?pr=0.75 caps the pixel ratio, ?msaa=0 drops multisampling.
const query = new URLSearchParams(location.search);
startEngine({
  canvas,
  stage,
  hero,
  hudProgress,
  maxPixelRatio: query.has('pr') ? Number(query.get('pr')) : 1.25,
  msaa: query.has('msaa') ? Number(query.get('msaa')) : 0
}).catch((error) => {
  // Keep the message for the harnesses, and the stack for a human: a bare message with no frame is
  // the difference between a five-minute fix and a five-minute hunt.
  window.__APP_ERROR = String(error && error.message ? error.message : error);
  window.__APP_ERROR_STACK = String(error && error.stack ? error.stack : error);
  console.error('[transit-desert] engine failed to start:', error);
});
