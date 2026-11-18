/**
 * Stage harness: one canvas + one WebGLRenderer + a render loop for any number of "scene modules".
 *
 *   const h = createHarness(stageEl, { runway: sectionEl, maxPixelRatio: 1.25 })
 *   h.add(await createScene({ THREE: h.THREE, renderer: h.renderer, size: h.size, ...options }))
 *   h.start()
 *
 * SCENE MODULE CONTRACT (every scene under shared/ implements this; nothing else is assumed):
 *
 *   {
 *     scene:  THREE.Scene,            // required unless you implement render()
 *     camera: THREE.Camera,           // required unless you implement render()
 *     animated: boolean,              // true = has idle motion, renders every visible frame. false = renders only when
 *                                     //   progress / pointer / size changed (an idle page costs nothing)
 *     update(ctx),                    // called before each render, see ctx below
 *     resize(w, h, dpr),              // CSS pixels; called once at start and on every resize (update camera.aspect here)
 *     render?(renderer, ctx, target), // optional custom render (post-processing, dither). `target` is a
 *                                     //   WebGLRenderTarget or null (= the canvas). Default: renderer.render(scene, camera)
 *     beats?: [{ at, id, title, text }],  // optional story beats along progress 0..1, for the page to caption
 *     dispose(),                      // free geometries, materials, textures, render targets
 *   }
 *
 *   ctx = { progress, p, pointer, dt, time, size, reduced, renderer, THREE }
 *     progress  raw scroll progress 0..1 (runway mapping, or the test override)
 *     p         progress damped toward `progress` (smooth, use for camera/pose)
 *     pointer   { x, y, sx, sy, inside, down }  x,y in -1..1 (+y is UP), sx,sy damped, inside = over the stage
 *     dt, time  seconds
 *     reduced   prefers-reduced-motion: render a composed still, no idle loops
 *
 * Scenes must also work rendered into a small render target (the gameboy screen), so never read canvas size from
 * the DOM inside a scene: use the `size` you are given in resize().
 *
 * Test hooks (used by tools/shot.mjs --progress): h.setProgress(v | null), h.setPointer(x, y | null).
 */
import * as THREE from 'three'
import { stableVh } from '/shared/ui/viewport.js'
import { glParams } from '/shared/gl/params.js'

const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))

// Adaptive resolution. Every harness watches its own frame times while it animates; when the average drops under
// ~48 fps it renders at a lower pixel ratio (x0.8 per step, never below MIN_Q) and the page remembers the result, so
// the other scenes start at that level too. Only ever steps down: a 60 Hz display gives no headroom signal to step
// back up on, and flip-flopping is worse than a slightly softer image. ?quality=1 pins full resolution (testing).
const MIN_Q = 0.65
const SLOW_MS = 21
// ?quality=0.5..1 pins the scale (no adapting); ?quality=auto (default) adapts. ?aa= and ?dpr= override per stage.
// See shared/gl/params.js.
const pinned = glParams.quality !== 'auto'
let sharedQ = pinned ? glParams.quality : 1

export function createHarness(stage, options = {}) {
  const {
    runway = stage.parentElement,
    progress: external = null,
    maxPixelRatio: maxPixelRatioOpt = 1.25,
    antialias: antialiasOpt = false,
    alpha = false,
    clearColor = 0x000000,
    clearAlpha = 1,
    pointerFrom = 'window', // 'window' maps the page pointer onto the stage rect; 'stage' only listens on the stage
  } = options

  const antialias = glParams.aa ?? antialiasOpt
  const maxPixelRatio = glParams.dpr ?? maxPixelRatioOpt
  if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative'
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'display:block;width:100%;height:100%'
  canvas.setAttribute('aria-hidden', 'true')
  stage.appendChild(canvas)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias, alpha, powerPreference: 'high-performance' })
  renderer.setClearColor(clearColor, clearAlpha)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const size = { w: 1, h: 1, dpr: 1 }
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, inside: false, down: false }
  const mods = []
  const state = { progress: 0, p: 0, override: null, pointerOverride: null, time: 0, last: 0, raf: 0, visible: true, dirty: true, started: false }
  const reduced = () => Boolean(reducedQuery?.matches)
  const perf = { n: 0, sum: 0, warm: 30 }

  function resize() {
    const w = Math.max(1, stage.clientWidth)
    const h = Math.max(1, stage.clientHeight)
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, coarse && glParams.dpr == null ? 1 : maxPixelRatio) * sharedQ
    perf.warm = 30; perf.n = 0; perf.sum = 0 // new buffers and shader compiles: do not judge the next few frames
    size.w = w
    size.h = h
    size.dpr = dpr
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    for (const m of mods) m.resize?.(w, h, dpr)
    state.dirty = true
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(stage)

  const fromRunway = () => {
    const rect = runway.getBoundingClientRect()
    const range = rect.height - stableVh()
    return range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 0
  }
  const readProgress = () => (state.override ?? (external ? external() : fromRunway()))

  const onMove = (event) => {
    const rect = stage.getBoundingClientRect()
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
    pointer.inside = nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1
    pointer.x = Math.max(-1, Math.min(1, nx))
    pointer.y = Math.max(-1, Math.min(1, ny))
    state.dirty = true
  }
  const onDown = () => { pointer.down = true; state.dirty = true }
  const onUp = () => { pointer.down = false; state.dirty = true }
  const target = pointerFrom === 'stage' ? stage : window
  target.addEventListener('pointermove', onMove, { passive: true })
  target.addEventListener('pointerdown', onDown, { passive: true })
  window.addEventListener('pointerup', onUp, { passive: true })

  const io = new IntersectionObserver(([entry]) => {
    state.visible = entry.isIntersecting
    if (state.visible) { state.last = performance.now(); state.dirty = true; schedule() }
  }, { rootMargin: '10% 0px' })
  io.observe(stage)
  const onVisibility = () => { state.last = performance.now(); schedule() }
  document.addEventListener('visibilitychange', onVisibility)

  function frame(now) {
    state.raf = 0
    if (!state.visible || document.hidden) return
    const raw = now - state.last
    const dt = Math.min(0.05, raw / 1000 || 0.016)
    state.last = now
    state.time += dt
    const still = reduced()
    const progress = readProgress()
    const px = state.pointerOverride ? state.pointerOverride.x : pointer.x
    const py = state.pointerOverride ? state.pointerOverride.y : pointer.y
    if (progress !== state.progress || px !== pointer.sx || py !== pointer.sy) state.dirty = true
    state.progress = progress
    state.p = still || state.override !== null ? progress : damp(state.p, progress, 6, dt)
    pointer.sx = still ? 0 : damp(pointer.sx, px, 5, dt)
    pointer.sy = still ? 0 : damp(pointer.sy, py, 5, dt)
    if (Math.abs(state.p - progress) > 1e-4 || Math.abs(pointer.sx - px) > 1e-3 || Math.abs(pointer.sy - py) > 1e-3) state.dirty = true
    const animated = !still && mods.some((m) => m.animated)
    if (animated && !pinned && raw > 0 && raw < 500) {
      if (perf.warm > 0) perf.warm -= 1
      else {
        perf.sum += raw; perf.n += 1
        if (perf.n >= 45) {
          const avg = perf.sum / perf.n
          perf.sum = 0; perf.n = 0
          if (avg > SLOW_MS && sharedQ > MIN_Q) { sharedQ = Math.max(MIN_Q, sharedQ * 0.8); resize() }
        }
      }
    } else if (!animated) { perf.n = 0; perf.sum = 0 }
    if (animated || state.dirty) {
      const ctx = { progress, p: state.p, pointer, dt, time: state.time, size, reduced: still, renderer, THREE }
      for (const m of mods) {
        m.update?.(ctx)
        if (m.render) m.render(renderer, ctx, null)
        else { renderer.setRenderTarget(null); renderer.render(m.scene, m.camera) }
      }
      state.dirty = false
    }
    schedule()
  }
  function schedule() {
    if (!state.raf && state.visible && state.started && !document.hidden) state.raf = requestAnimationFrame(frame)
  }

  return {
    THREE,
    renderer,
    canvas,
    stage,
    size,
    pointer,
    get progress() { return state.progress },
    /** Current resolution scale (1 = full), shared by every scene on the page. */
    get quality() { return sharedQ },
    add(mod) { mods.push(mod); mod.resize?.(size.w, size.h, size.dpr); state.dirty = true; return mod },
    start() { state.started = true; resize(); state.last = performance.now(); schedule() },
    invalidate() { state.dirty = true; schedule() },
    setProgress(v) { state.override = v == null ? null : v; state.dirty = true; schedule() },
    setPointer(x, y) { state.pointerOverride = x == null ? null : { x, y }; state.dirty = true; schedule() },
    destroy() {
      cancelAnimationFrame(state.raf)
      resizeObserver.disconnect()
      io.disconnect()
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const m of mods) m.dispose?.()
      mods.length = 0
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
