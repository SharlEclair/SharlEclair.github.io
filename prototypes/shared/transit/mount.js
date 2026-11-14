/**
 * Embed Transit Desert in any page.
 *
 *   import { mountTransit } from '/shared/transit/mount.js'
 *
 *   const transit = await mountTransit(stageElement, {
 *     runway: tallSectionElement,   // EITHER: scroll through this element maps to 0..1
 *     progress: () => myProgress,   // OR: you own the maths and return 0..1 each frame
 *   })
 *
 * `stageElement` is the box the canvas fills (normally a `position: sticky; height: 100vh` child of
 * the runway). The canvas tracks its size, the loop pauses while it is off screen, and frames are only
 * drawn when the progress value changes, so an idle page costs nothing.
 *
 * Returns `{ engine, setProgress(v | null), destroy() }`.
 * One instance per page (the config singleton and the debug hooks are page-global).
 */
import { config } from './config.js';
import { startEngine } from './engine.js';

const LABEL_CSS = `
.transit-label{position:absolute;left:0;top:0;pointer-events:none;opacity:0;will-change:transform,opacity;
  font:500 11px/1.2 ui-monospace,"SFMono-Regular","Cascadia Mono",Menlo,Consolas,monospace;
  letter-spacing:.16em;text-transform:uppercase;color:#C9B8FF;white-space:nowrap;
  transition:opacity .25s cubic-bezier(.16,1,.3,1)}
.transit-label>span{display:block;transform:translate(-50%,-240%);padding:.45em .7em;
  border:1px solid rgba(201,184,255,.5);background:rgba(13,5,11,.72)}
.transit-label>span::after{content:"";position:absolute;left:50%;top:100%;width:1px;height:1.6em;background:rgba(201,184,255,.6)}
`;

function ensureLabelStyles() {
  if (document.getElementById('transit-label-css')) return;
  const style = document.createElement('style');
  style.id = 'transit-label-css';
  style.textContent = LABEL_CSS;
  document.head.appendChild(style);
}

/**
 * @param {HTMLElement} stage element the canvas should fill
 * @param {object} [options]
 * @param {HTMLElement} [options.runway] tall element whose scroll range maps to 0..1 (defaults to the stage's parent)
 * @param {() => number} [options.progress] external 0..1 source; overrides `runway`
 * @param {boolean} [options.gui=false] mount the lil-gui tuning panel
 * @param {boolean|string} [options.label=true] show the circuit label; pass a string to change its text
 * @param {number} [options.maxPixelRatio=1.25]
 * @param {Partial<typeof config>} [options.overrides] shallow per-group config overrides, applied before boot
 */
export async function mountTransit(stage, options = {}) {
  const {
    runway = stage.parentElement,
    progress = null,
    gui = false,
    label = true,
    maxPixelRatio = 1.25,
    overrides = null
  } = options;

  if (overrides) {
    for (const [group, values] of Object.entries(overrides)) {
      if (values && typeof values === 'object' && !Array.isArray(values) && config[group]) {
        Object.assign(config[group], values);
      } else {
        config[group] = values;
      }
    }
  }

  if (getComputedStyle(stage).position === 'static') {
    stage.style.position = 'relative';
  }
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);

  let labelElement = null;
  if (label) {
    ensureLabelStyles();
    labelElement = document.createElement('div');
    labelElement.className = 'transit-label';
    labelElement.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('span');
    inner.textContent = typeof label === 'string' ? label : 'Albert Park Circuit';
    labelElement.appendChild(inner);
    stage.appendChild(labelElement);
  }

  // Built-in mapping: 0 when the runway's top reaches the top of the viewport, 1 when its bottom
  // reaches the bottom. Read per frame (only while the stage is on screen), so content above the
  // section can change height without the mapping going stale.
  const fromRunway = () => {
    const rect = runway.getBoundingClientRect();
    const range = rect.height - window.innerHeight;
    return range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 0;
  };

  window.__CONFIG = config;
  const engine = await startEngine({
    canvas,
    stage,
    hero: runway,
    hudProgress: null,
    gui,
    progressSource: progress ?? fromRunway,
    maxPixelRatio,
    label: labelElement
  });

  return {
    engine,
    config,
    setProgress: (value) => engine.setProgress?.(value),
    destroy() {
      engine.destroy?.();
      canvas.remove();
      labelElement?.remove();
    }
  };
}
