/**
 * Shared plumbing for the LCD screen variants: one dither pass (160x144 target for look 'lcd', canvas/3 for 'full'),
 * palette by name with live setPalette(), reduced-motion handling, and the harness scene-module contract.
 *
 *   createScreenScene({ THREE, size, look, palette, build }) where build({ THREE, lcd }) returns
 *     { scene, camera, update({ p, time, px, py, dt, reduced, aspect }), resize?(aspect), dispose?() }
 * Scenes draw a BRIGHT subject on a DARK ground (the palette's light end is the subject); 'ink' reverses itself.
 */
import { createDitherPass, paletteColors } from '../../dither/pass.js'

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

export function createScreenScene({ THREE, size, look = 'lcd', palette = 'dmg', build, reducedAt = 0.85, contrast = 1.25, bias = 0, cell = 3 }) {
  const lcd = look === 'lcd'
  const inner = build({ THREE, lcd })
  const view = { w: lcd ? 160 : 1280, h: lcd ? 144 : 720, aspect: lcd ? 160 / 144 : 16 / 9 }
  const pass = createDitherPass(THREE, {
    width: lcd ? 160 : 1280 / cell,
    height: lcd ? 144 : 720 / cell,
    palette: paletteColors(lcd ? palette : Array.isArray(palette) ? palette : palette === 'dmg' ? 'night' : palette),
    contrast,
    bias,
  })

  function resize(w, h) {
    if (!lcd && w && h) {
      view.w = w; view.h = h; view.aspect = w / h
      pass.setSize(Math.max(80, w / cell), Math.max(60, h / cell))
    }
    inner.resize?.(view.aspect)
  }

  function update(ctx) {
    const reduced = ctx.reduced
    const p = reduced ? reducedAt : clamp(ctx.p ?? ctx.progress ?? 0, 0, 1)
    inner.update({
      p,
      time: reduced ? 4.2 : ctx.time,
      px: reduced ? 0 : ctx.pointer?.sx ?? 0,
      py: reduced ? 0 : ctx.pointer?.sy ?? 0,
      dt: Math.min(ctx.dt || 0.016, 0.05),
      reduced,
      aspect: view.aspect,
    })
  }

  resize(size?.w, size?.h)

  return {
    scene: inner.scene,
    camera: inner.camera,
    animated: true,
    look,
    pass,
    update,
    resize,
    render(renderer, ctx, target) { pass.render(renderer, inner.scene, inner.camera, target ?? null) },
    setPalette(name) { pass.setPalette(paletteColors(name)) },
    dispose() { pass.dispose(); inner.dispose?.() },
  }
}
