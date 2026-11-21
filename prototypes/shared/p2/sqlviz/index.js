/**
 * The self-healing SQL project's pinned animation. Variants (pick with ?sql=):
 *   squiggle  (default) a live query editor: red squiggle under the bad column, the fix as a diff, 10 / 10
 *   ten       Ten Questions: the 10-question test set as LCD tiles, one fails, heals, flips green
 *   loop      The Loop: layered isometric plates (ask / safety check / run / answer); the query packet fails at
 *             RUN, detours through diagnose and fix, passes
 *   barrel    an interactive ASCII database barrel wrapped in the query text; a red crack healed by a scan ring
 *   proof     Proof Mark: a proofreader's red pen corrects the query, then the score
 *   ribbon    the original WebGL query ribbon over a contour landscape
 *
 * A variant module (shared/p2/sqlviz/<name>.js) exports
 *   mount(el, { runway, theme, reduced, progress }) -> { setTheme(theme), dispose() }
 * where `el` is the project's [data-viz="sql"] box, and `progress()` returns the damped 0..1 progress of the pinned
 * runway (200vh runway = 100vh of scroll). They build DOM/SVG/canvas inside `el`, never import three.js unless they
 * need it, and run work only while the section is on screen. Rules: no em or en dashes; copy only from
 * shared/content.js facts; the end state is real text so reduced-motion / no-JS get a complete static frame.
 */
import { stableVh } from '/shared/ui/viewport.js'

export const SQL_VARIANTS = ['squiggle', 'ten', 'loop', 'barrel', 'proof', 'ribbon']
export const DEFAULT_SQL = 'squiggle'

export function sqlVariant() {
  const asked = new URLSearchParams(location.search).get('sql')
  return SQL_VARIANTS.includes(asked) ? asked : DEFAULT_SQL
}

const LOADERS = {
  squiggle: () => import('./squiggle.js'),
  ten: () => import('./ten.js'),
  loop: () => import('./loop.js'),
  barrel: () => import('./barrel.js'),
  proof: () => import('./proof.js'),
}

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))

/** Damped scroll progress of a pinned runway, like the WebGL harness uses. Call the result each frame. */
function makeProgress(runway, reduced) {
  let p = 0
  let last = performance.now()
  const raw = () => {
    const r = runway.getBoundingClientRect()
    const range = r.height - stableVh()
    return range > 0 ? clamp(-r.top / range) : 0
  }
  p = raw()
  return () => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
    last = now
    const t = raw()
    p = reduced ? t : damp(p, t, 8, dt)
    if (Math.abs(p - t) < 1e-4) p = t
    return p
  }
}

/** Mount a DOM/SVG/canvas variant. Returns { setTheme, dispose } (never rejects: failures leave the box empty). */
export async function mountSqlViz(el, { theme, reduced = false } = {}) {
  const name = sqlVariant()
  const runway = el.closest('.runway')
  try {
    const mod = await LOADERS[name]()
    return mod.mount(el, { runway, theme, reduced, progress: makeProgress(runway, reduced) })
  } catch (error) {
    console.warn(`sql animation "${name}" failed to load`, error)
    return null
  }
}
