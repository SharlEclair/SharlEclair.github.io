/**
 * Lazy mount for any scene module (see harness.js for the contract), same behaviour as shared/lazy.js:
 * a poster shows at once, three.js and the scene are imported only when the section is near, and reduced
 * motion / data saver / low-power devices keep the poster.
 *
 *   import { lazyScene } from '/shared/gl/lazy-scene.js'
 *   lazyScene(stageEl, () => import('/shared/scenes/harvest/scene.js'), {
 *     runway: runwayEl, poster: '/posters/harvest.jpg', posterAlt: '...',
 *     scene: { look: 'full' },            // passed to createScene({ ..., look: 'full' })
 *     harness: { maxPixelRatio: 1.25 },   // passed to createHarness
 *   })  // -> Promise<harness | null>
 */
import { canRunWebGL, pixelRatioCap } from '/shared/lazy.js'

function whenNear(element, rootMargin = '150% 0px') {
  return new Promise((resolve) => {
    if (typeof IntersectionObserver !== 'function') return resolve()
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { observer.disconnect(); resolve() }
    }, { rootMargin })
    observer.observe(element)
  })
}

export async function lazyScene(stage, importer, options = {}) {
  const { runway, poster = null, posterAlt = '', live = canRunWebGL(options), scene = {}, harness = {}, onReady } = options
  let img = null
  if (poster) {
    img = document.createElement('img')
    img.src = poster
    img.alt = posterAlt
    img.decoding = 'async'
    img.className = 'webgl-poster'
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .6s cubic-bezier(.16,1,.3,1)'
    if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative'
    stage.appendChild(img)
  }
  if (!live) return null
  await whenNear(runway ?? stage)
  try {
    const [{ createHarness }, mod] = await Promise.all([import('/shared/gl/harness.js'), importer()])
    const h = createHarness(stage, { runway, maxPixelRatio: pixelRatioCap(), ...harness })
    const instance = await mod.createScene({ THREE: h.THREE, renderer: h.renderer, size: h.size, ...scene })
    h.scene = instance
    h.add(instance)
    h.start()
    onReady?.(h, instance)
    if (img) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        img.style.opacity = '0'
        img.addEventListener('transitionend', () => img.remove(), { once: true })
      }))
    }
    return h
  } catch (error) {
    console.warn('[portfolio] scene failed to start; keeping the poster', error)
    return null
  }
}
