/**
 * Lazy WebGL for the portfolio variants.
 *
 * Three.js and the two scenes are ~700 KB of script plus a 2.9 MB city model. None of it belongs in
 * the first paint, and on a phone or with reduced motion it may not belong on the page at all. These
 * helpers keep the page itself tiny: a stage shows a static poster immediately, and the real scene is
 * imported only when its section approaches the viewport and the device is suited to it.
 *
 *   import { lazyTransit, lazyF1 } from '/shared/lazy.js'
 *   lazyF1(stageEl, { runway: sectionEl })
 *   lazyTransit(stageEl, { runway: sectionEl })
 *
 * Both return a promise resolving to the mount handle, or to `null` when the poster was kept.
 * Posters: /posters/f1-top.jpg, f1-chase.jpg, transit-search.jpg, transit-route.jpg (1600x1000).
 */

const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')

export const posters = {
  f1: [`${BASE}/posters/f1-top.jpg`, `${BASE}/posters/f1-chase.jpg`],
  transit: [`${BASE}/posters/transit-search.jpg`, `${BASE}/posters/transit-route.jpg`],
}

/** Whether this device should get the live scene at all. */
export function canRunWebGL({ allowMobile = true } = {}) {
  // Reduced motion, data saver and low-power hardware all keep the static poster.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  const connection = navigator.connection
  if (connection?.saveData) return false
  if ((navigator.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2) return false
  if (!allowMobile && window.matchMedia('(max-width: 720px)').matches) return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2'))
  } catch {
    return false
  }
}

/** Pixel-ratio cap by device class: phones and coarse pointers render at 1x. */
export function pixelRatioCap() {
  return window.matchMedia('(pointer: coarse), (max-width: 900px)').matches ? 1 : 1.25
}

function addPoster(stage, src, alt) {
  const img = document.createElement('img')
  img.src = src
  img.alt = alt
  img.decoding = 'async'
  img.loading = 'lazy'
  img.className = 'webgl-poster'
  img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .6s cubic-bezier(.16,1,.3,1)'
  if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative'
  stage.appendChild(img)
  return img
}

function whenNear(element, rootMargin = '150% 0px') {
  return new Promise((resolve) => {
    if (typeof IntersectionObserver !== 'function') return resolve()
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect()
        resolve()
      }
    }, { rootMargin })
    observer.observe(element)
  })
}

async function lazy(stage, kind, options, load) {
  const { poster = posters[kind][kind === 'f1' ? 0 : 1], posterAlt = '', live = canRunWebGL(options), ...rest } = options
  const img = poster ? addPoster(stage, poster, posterAlt) : null
  if (!live) return null
  await whenNear(options.runway ?? stage)
  try {
    const handle = await load({ maxPixelRatio: pixelRatioCap(), ...rest })
    if (img) {
      img.style.opacity = '0'
      img.addEventListener('transitionend', () => img.remove(), { once: true })
    }
    return handle
  } catch (error) {
    console.warn(`[portfolio] ${kind} scene failed to start; keeping the poster`, error)
    return null
  }
}

/**
 * @param {HTMLElement} stage
 * @param {object} [options] any mountF1 option, plus `poster`, `posterAlt`, `live`, `allowMobile`
 */
export function lazyF1(stage, options = {}) {
  return lazy(stage, 'f1', options, async (rest) => {
    const { mountF1 } = await import('./f1/mount.js')
    return mountF1(stage, rest)
  })
}

/**
 * @param {HTMLElement} stage
 * @param {object} [options] any mountTransit option, plus `poster`, `posterAlt`, `live`, `allowMobile`
 */
export function lazyTransit(stage, options = {}) {
  return lazy(stage, 'transit', options, async (rest) => {
    const { mountTransit } = await import('./transit/mount.js')
    return mountTransit(stage, rest)
  })
}
