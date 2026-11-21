/**
 * URL switches for the 3D quality, read once. They apply to every WebGL stage on the page (shared/gl/harness.js).
 *
 *   ?aa=0|1|off|on|fxaa   antialiasing: 0/off, 1/on (hardware MSAA), or fxaa (screen-space FXAA).
 *                         Default: each stage's own choice (the console's canvas on, the others off).
 *   ?dpr=1.5              cap on the pixel ratio (0.5 to 3). Default: each stage's cap (1.25, or 1 on touch screens).
 *   ?quality=auto|0.5-1   resolution scale on top of the pixel ratio. auto (default) adapts: it steps down when
 *                         frames run slower than ~48 fps. A number pins it and turns the adaptive step-down off.
 *                         ?quality=1 is full resolution with no adapting.
 *   ?lowpower=1           shorthand for ?aa=0&dpr=1&quality=0.8 (try it on a slow phone)
 *
 * Example: /variants/08-handheld-hero/index.html?aa=fxaa
 */
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const low = q.get('lowpower') === '1'

const parseAa = (v) => {
  if (v == null) return null
  if (/^fxaa$/i.test(v)) return 'fxaa'
  if (/^(1|on|true|yes)$/i.test(v)) return true
  if (/^(0|off|false|no)$/i.test(v)) return false
  return null
}
const num = (v, lo, hi) => {
  const n = Number(v)
  return v != null && v !== '' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null
}

const quality = q.get('quality') ?? (low ? '0.8' : 'auto')

export const glParams = {
  /** 'fxaa', true / false when ?aa= is given, otherwise null (leave the stage's own default). */
  aa: parseAa(q.get('aa')) ?? (low ? false : null),
  /** pixel ratio cap, or null */
  dpr: num(q.get('dpr'), 0.5, 3) ?? (low ? 1 : null),
  /** 'auto', or a fixed scale 0.25..1 */
  quality: quality === 'auto' ? 'auto' : num(quality, 0.25, 1) ?? 'auto',
}
