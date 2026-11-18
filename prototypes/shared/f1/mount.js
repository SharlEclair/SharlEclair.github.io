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
 * Returns `{ app, setProgress(v | null), setTheme('dark' | 'light'), setLayout(mode), destroy() }`.
 * One instance per page.
 *
 * Theme: `theme` defaults to document.documentElement.dataset.theme. When no `theme` option is passed
 * the scene also follows later changes to that attribute on its own; `setTheme` restyles live either way.
 *
 * Timeline: progress 0..1 is one move (top view with flow, then the chase view). Map it to exactly 100vh
 * of scroll: `runway` height = stage height + 100vh, or return the 0..1 yourself from `progress`.
 *
 * Layout: `layout` is 'auto' (default), 'right', 'top' or 'center'. The car and flow are framed in the
 * right 60% of the stage on landscape (project text over the left ~40%) and the top 55% on portrait
 * (text over the bottom ~45%); 'auto' switches at canvas aspect 0.9. Resize is handled.
 */
import { createExperience } from './core/experience.js'
import { attachOrbit } from './camera/orbit.js'

/**
 * @param {HTMLElement} stage element the canvas should fill
 * @param {object} [options]
 * @param {HTMLElement} [options.runway] tall element whose scroll range maps to 0..1 (defaults to the stage's parent)
 * @param {() => number} [options.progress] external 0..1 source; overrides `runway`
 * @param {boolean} [options.gui=false] mount the lil-gui tuning panel
 * @param {number} [options.maxPixelRatio=1.25]
 * @param {boolean} [options.reducedMotion] freeze the flow field's clock; defaults to the OS setting
 * @param {'dark'|'light'} [options.theme] defaults to document.documentElement.dataset.theme
 * @param {'auto'|'right'|'top'|'center'} [options.layout='auto'] where the focal action sits in the stage
 * @param {string|object} [options.currents='optimised'] streamline look: 'optimised' | 'classic', or { preset, ...tune.js keys }
 */
export function mountF1(stage, options = {}) {
  const {
    runway = stage.parentElement,
    progress = null,
    gui = false,
    maxPixelRatio = 1.25,
    reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    theme = null,
    layout = 'auto',
    currents = undefined,
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
    theme,
    layout,
    ...(currents !== undefined ? { currents } : {}),
    storageKey: 'f1-currents-embedded',
  })

  // No explicit theme: track the page's data-theme attribute.
  const detachOrbit = attachOrbit(stage, (yaw, pitch, held) => app.setOrbit(yaw, pitch, held))

  const themeWatch = theme === null && typeof MutationObserver === 'function'
    ? new MutationObserver(() => app.setTheme(document.documentElement.dataset.theme))
    : null
  themeWatch?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  return {
    app,
    setProgress: (value) => app.setProgress(value),
    setTheme: (value) => app.setTheme(value),
    getTheme: () => app.getTheme(),
    setLayout: (mode) => app.setLayout(mode),
    destroy() {
      themeWatch?.disconnect()
      detachOrbit()
      app.destroy()
      canvas.remove()
    },
  }
}
