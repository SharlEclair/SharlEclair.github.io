/**
 * Embed F1 x Currents in any page.
 *
 *   import { mountF1 } from '/shared/f1/mount.js'
 *
 *   const f1 = mountF1(stageElement, {
 *     runway: tallSectionElement,   // EITHER: scroll through this element maps to 0..1
 *     progress: () => myProgress,   // OR: you own the maths and return 0..1 each frame
 *   })
 *
 * `stageElement` is the box the canvas fills (normally a `position: sticky; height: 100vh` child of
 * the runway). The canvas tracks its size, and the loop stops while the stage is off screen.
 * Scroll input is smoothed inside the scene (~140 ms), so pass raw progress.
 *
 * Returns `{ app, setProgress(v | null), destroy() }`. One instance per page.
 */
import { createExperience } from './core/experience.js'

/**
 * @param {HTMLElement} stage element the canvas should fill
 * @param {object} [options]
 * @param {HTMLElement} [options.runway] tall element whose scroll range maps to 0..1 (defaults to the stage's parent)
 * @param {() => number} [options.progress] external 0..1 source; overrides `runway`
 * @param {boolean} [options.gui=false] mount the lil-gui tuning panel
 * @param {number} [options.maxPixelRatio=1.25]
 * @param {boolean} [options.reducedMotion] freeze the flow field's clock; defaults to the OS setting
 */
export function mountF1(stage, options = {}) {
  const {
    runway = stage.parentElement,
    progress = null,
    gui = false,
    maxPixelRatio = 1.25,
    reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  } = options

  if (getComputedStyle(stage).position === 'static') {
    stage.style.position = 'relative'
  }
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'display:block;width:100%;height:100%'
  canvas.setAttribute('aria-hidden', 'true')
  stage.appendChild(canvas)

  // Built-in mapping: 0 when the runway's top reaches the top of the viewport, 1 when its bottom
  // reaches the bottom. One getBoundingClientRect per frame, only while the stage is on screen.
  const fromRunway = () => {
    const rect = runway.getBoundingClientRect()
    const range = rect.height - window.innerHeight
    return range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 0
  }

  const app = createExperience({
    canvas,
    container: stage,
    progress: progress ?? fromRunway,
    gui,
    maxPixelRatio,
    staticTime: reducedMotion,
    storageKey: 'f1-currents-embedded',
  })

  return {
    app,
    setProgress: (value) => app.setProgress(value),
    destroy() {
      app.destroy()
      canvas.remove()
    },
  }
}
