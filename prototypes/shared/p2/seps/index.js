/**
 * Section separators. gen-p2.mjs emits `<div class="sep" data-slot="1|2">` between sections; this picks a variant and
 * lets it build inside each slot.
 *
 *   ?sep=query   (default) a SQL query mistypes, diagnoses itself and reruns: the self-healing agent, in four lines
 *   ?sep=ghost   two timing markers race: the real 389.9 s vs 34.2 s coursebook build
 *   ?sep=seam    a hex grid floods from two pins (Melbourne, Mumbai); where the floods meet becomes the divider
 *   ?sep=swap    the console swaps its cartridge (slot 1) and dives into the project list
 *   ?sep=zoom    the next heading resolves through 1-bit dithered "zoom levels"
 *   ?sep=tear    the old torn newspaper
 *   ?sep=ribbon  blue, teal and violet ribbons braid into one thin line through a glass pill
 *   ?sep=led     an LED panel: a wave sweeps across and settles into a dot-matrix caption
 *   ?sep=plates  isometric translucent plates slide apart and re-stack
 *   ?sep=lap     an F1 timing-tower row: mini-sectors fill, the PB chip lights
 *   ?sep=cursor  the console's pixel dino walks the divider and opens the next section like a door
 *   ?sep=ascii   a character-cell wave (real monospace text) flattens into one rule that names the next section
 *   ?sep=strands three labelled strands (blue, teal, violet) braid, then pull taut into one thin line
 *   ?sep=twist   a CSS 3D rope/DNA twist of 64 slices untwists into a thin line
 *   ?sep=termbar a terminal line: a block-character bar fills with the scroll, then collapses to a rule
 *   ?sep=power-cycle    an LCD frame squeezes to a line, then a dot, and powers back on as a phosphor rule
 *   ?sep=save-file      a retro SAVE DATA screen: bar fills, SAVED stamps, the next file is selected
 *   ?sep=lsm-compact    log segments fall into a grid like a falling-block game, rows compact and clear into the rule
 *   ?sep=dag-run        an Airflow-style DAG: nodes go queued, running, success; the sink stretches into the rule
 *   ?sep=defrag         a disk-defrag cluster map hops into contiguous runs and packs into one bar
 *   ?sep=columnar-pivot a row-store table rotates into columns (Parquet) and settles on one header line
 *   ?sep=hash-ring      a consistent-hashing ring unrolls into a labelled timeline rule
 *   ?sep=watermark      event-time dots, a watermark sweep, late dots grey out, an emit chip drops in
 *   ?sep=schema-migrate a table header runs ALTER TABLE steps and settles as the next version
 *   ?sep=hexdump        an xxd-style dump resolves byte by byte and spells the next section
 *
 * A variant module (shared/p2/seps/<name>.js) exports:
 *   mount(el, { slot, reduced }) -> void | () => void   build inside `el` (the slot); may return a cleanup
 * and brings its own CSS (a <link> to ./<name>.css added by mount, or inline). Rules for all variants: the slot is
 * aria-hidden and holds nothing focusable; motion is a pure function of scroll position; any scroll animation fits
 * within 100vh of scroll; prefers-reduced-motion and no-JS get a static end state.
 */
const LOADERS = {
  query: () => import('./query.js'),
  ghost: () => import('./ghost.js'),
  seam: () => import('./seam.js'),
  swap: () => import('./swap.js'),
  zoom: () => import('./zoom.js'),
  tear: () => import('./tear-sep.js'),
  ribbon: () => import('./ribbon.js'),
  led: () => import('./led.js'),
  plates: () => import('./plates.js'),
  lap: () => import('./lap.js'),
  cursor: () => import('./cursor.js'),
  ascii: () => import('./ascii.js'),
  strands: () => import('./strands.js'),
  twist: () => import('./twist.js'),
  termbar: () => import('./termbar.js'),
  'power-cycle': () => import('./power-cycle.js'),
  'save-file': () => import('./save-file.js'),
  'lsm-compact': () => import('./lsm-compact.js'),
  'dag-run': () => import('./dag-run.js'),
  'defrag': () => import('./defrag.js'),
  'columnar-pivot': () => import('./columnar-pivot.js'),
  'hash-ring': () => import('./hash-ring.js'),
  'watermark': () => import('./watermark.js'),
  'schema-migrate': () => import('./schema-migrate.js'),
  'hexdump': () => import('./hexdump.js'),
}
export const DEFAULT_SEP = 'ascii'
export const sepNames = Object.keys(LOADERS)

export async function initSeps() {
  const els = [...document.querySelectorAll('.sep')]
  if (!els.length) return
  const asked = new URLSearchParams(location.search).get('sep')
  const name = Object.hasOwn(LOADERS, asked) ? asked : DEFAULT_SEP
  document.documentElement.dataset.sep = name
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  try {
    const mod = await LOADERS[name]()
    for (const el of els) mod.mount(el, { slot: Number(el.dataset.slot), reduced })
  } catch (error) {
    console.warn(`separator variant "${name}" failed to load`, error)
  }
}
