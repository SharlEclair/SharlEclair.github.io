/**
 * Behaviour shared by the two handheld variants.
 *
 *   import { initPage } from '/shared/p2/page.js'
 *   initPage({ profile: 'cartridge' | 'hero' })
 *
 * One fixed canvas (#gb-stage) carries the handheld for the whole page. Its pose is a scroll-keyed track built from the
 * sections' real positions, so it works at any viewport. Everything lazy: three.js loads only when a section is near.
 */
import { initThemeToggle, currentTheme } from '/shared/ui/theme.js'
import { initSeps } from '/shared/p2/seps/index.js'
import { mountSqlViz, sqlVariant } from '/shared/p2/sqlviz/index.js'
import { initNameMorph } from '/shared/p2/name-morph.js'
import { stableVh } from '/shared/ui/viewport.js'
import { initDisclosure, initScrollSpy } from '/shared/ui/nav.js'
import { lazyF1, lazyTransit, canRunWebGL, pixelRatioCap } from '/shared/lazy.js'
import { lazyScene } from '/shared/gl/lazy-scene.js'
import { initSettle } from '/shared/p2/settle.js'
import { initEggs } from '/shared/p2/eggs.js'
import { exitKeys, exitFade, EXIT_NAMES } from '/shared/p2/exit-variants.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

/** 0..1 progress through an element's pinned runway (scroll distance minus one viewport). */
function runwayProgress(el) {
  const rect = el.getBoundingClientRect()
  const range = rect.height - stableVh()
  return range > 0 ? clamp(-rect.top / range) : 0
}
const docY = (el) => el.getBoundingClientRect().top + scrollY

/** Poster for the current theme: /posters/x.jpg becomes /posters/x-light.jpg in the light theme. */
const themed = (src, theme = currentTheme()) => (theme === 'light' ? src.replace(/\.jpg$/, '-light.jpg') : src)
const handles = []
/** Keep a mounted scene handle so the theme toggle can retint it live. */
function track(promise) {
  promise?.then?.((h) => { if (h) { handles.push(h); window.__HANDLES = handles; (h.setTheme ?? h.scene?.setTheme)?.(currentTheme()) } })
}
/** The static console posters (no-WebGL / reduced motion) come in a light version too. */
function swapConsolePosters(theme) {
  for (const img of $$('img.gb-poster')) {
    img.dataset.base ||= img.getAttribute('src')
    img.src = themed(img.dataset.base, theme)
  }
}
function onTheme(theme) {
  swapConsolePosters(theme)
  for (const h of handles) (h.setTheme ?? h.scene?.setTheme)?.(theme)
  window.__GB?.setTheme?.(theme)
  for (const el of $$('[data-poster]')) { const img = $('.webgl-poster', el); if (img) img.src = themed(el.dataset.poster, theme) }
}

export function initPage({ profile }) {
  initSeps()
  { // tab title while the tab is in the background
    const title = document.title
    document.addEventListener('visibilitychange', () => { document.title = document.hidden ? 'Query still running...' : title })
  }
  initSettle()
  initEggs()
  initNameMorph({ h1: $('.hero--console .hero-copy h1'), brand: $('.top .brand'), reduced: reducedMotion })
  swapConsolePosters(currentTheme())
  document.addEventListener('themechange', (e) => onTheme(e.detail))
  initThemeToggle($('[data-theme-toggle]'))
  const menuBtn = $('.menu-btn')
  if (menuBtn) initDisclosure(menuBtn, $('.top nav'))
  initScrollSpy($$('.top nav a[href^="#"]'))

  // The bar floats over dark stages even in the light theme: flip it to light-on-dark there.
  const stages = $$('.hero, .proj')
  const mark = () => {
    const over = stages.some((el) => { const r = el.getBoundingClientRect(); return r.top <= 28 && r.bottom >= 28 })
    document.body.classList.toggle('over-stage', over)
  }
  addEventListener('scroll', mark, { passive: true })
  mark()

  const live = canRunWebGL()
  if (!live) document.documentElement.classList.add('no-gl')

  mountProjects()
  mountHero(profile, live)
  if (live) initHandheld(profile)
}

// ---------------------------------------------------------------------------------------------- projects & hero
function mountProjects() {
  const f1 = $('[data-viz="f1"]')
  if (f1) {
    f1.dataset.poster = '/posters/f1-top.jpg'
    track(lazyF1(f1, { runway: f1.closest('.runway'), theme: currentTheme(), poster: themed('/posters/f1-top.jpg'), posterAlt: 'A Formula 1 car seen from above, streamlines flowing past.' }))
  }
  const tr = $('[data-viz="transit"]')
  if (tr) {
    tr.dataset.poster = '/posters/transit-route.jpg'
    track(lazyTransit(tr, { runway: tr.closest('.runway'), theme: currentTheme(), poster: themed('/posters/transit-route.jpg'), posterAlt: 'A search spreading over a city street map, a glowing route in red and violet.' }))
  }
  const sql = $('[data-viz="sql"]')
  if (sql && sqlVariant() !== 'ribbon') {
    // The default SQL animation is DOM/SVG/canvas (shared/p2/sqlviz/); ?sql=ribbon brings back the WebGL ribbon
    track(mountSqlViz(sql, { theme: currentTheme(), reduced: reducedMotion }))
  } else if (sql) {
    sql.dataset.poster = '/posters/sql.jpg'
    track(lazyScene(sql, () => import('/shared/scenes/sql/scene.js'), {
      runway: sql.closest('.runway'), poster: themed('/posters/sql.jpg'), posterAlt: 'A glowing query ribbon over a contour landscape, splintered by a fault and knit back together.',
      scene: { theme: currentTheme() },
      harness: { progress: () => runwayProgress(sql.closest('.runway')) },
    }))
  }
}

function mountHero(profile, live) {
  const el = $('[data-viz="hero"]')
  if (!el || profile === 'hero') return // in the handheld-hero variant the hero lives on the console screen
  track(lazyScene(el, () => import('/shared/scenes/hero/scene.js'), {
    runway: el.closest('.runway'), poster: '/posters/hero.jpg', posterAlt: 'Two phosphor-green hands reaching toward each other across stippled clouds.',
    scene: { look: 'full' }, live,
    harness: { progress: () => runwayProgress(el.closest('.runway')) },
  }))
}

// ---------------------------------------------------------------------------------------------- the handheld
async function initHandheld(profile) {
  const stage = document.createElement('div')
  stage.id = 'gb-stage'
  stage.setAttribute('aria-hidden', 'true')
  document.body.appendChild(stage)

  const hero = $('#top')
  const harvest = $('[data-viz="harvest"]')?.closest('.runway')
  const contact = $('#contact')
  const narrow = () => innerWidth < 760
  // ?exit=settle|arc|shrink|turn|face: variants of the default way the console leaves the hero (shared/p2/exit-variants.js)
  const exitParam = new URLSearchParams(location.search).get('exit')
  const exitName = profile === 'hero' && EXIT_NAMES.includes(exitParam) ? exitParam : null
  // ?sep=swap: the Cartridge Swap separator drives extra pose keys, the cartridge label, the LCD card and the canvas fade
  const swap = document.documentElement.dataset.sep === 'swap' ? await import('/shared/p2/seps/swap.js') : null

  // The Harvest full-bleed scene (cartridge profile fades it in behind the dive, hero profile just scrubs it)
  const harvestEl = $('[data-viz="harvest"]')
  if (harvestEl) {
    const run = harvestEl.closest('.runway')
    const start = profile === 'cartridge' ? 0.3 : 0
    harvestEl.dataset.poster = '/posters/harvest.jpg'
    track(lazyScene(harvestEl, () => import('/shared/scenes/harvest/scene.js'), {
      runway: run, poster: themed('/posters/harvest.jpg'), posterAlt: 'A satellite view over reservoirs and a patchwork of rice fields filling with water and turning green.',
      scene: { look: 'full', theme: currentTheme() }, harness: { progress: () => clamp((runwayProgress(run) - start) / (1 - start)) },
    }))
  }

  const [{ createHarness }, { createScene, samplePose }, { createScreenTarget }] = await Promise.all([
    import('/shared/gl/harness.js'), import('/shared/gb/scene.js'), import('/shared/dither/pass.js'),
  ])
  void samplePose
  const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - stableVh())
  const h = createHarness(stage, {
    alpha: true, antialias: true, clearAlpha: 0, maxPixelRatio: pixelRatioCap(), pointerFrom: 'window',
    progress: () => scrollY / maxScroll(),
  })
  const { THREE } = h
  const label = profile === 'cartridge' ? { title: 'HARVEST SURPRISE', subtitle: 'RICE FROM ORBIT' } : { title: 'PORTFOLIO', subtitle: 'ASHWIN PILLAI' }
  const gbs = await createScene({ THREE, renderer: h.renderer, size: h.size, track: [{ at: 0, xf: 2, y: 0, s: 1, cart: 1 }], cartridge: label, interactive: false, palette: new URLSearchParams(location.search).get('lcd') || 'ink', theme: currentTheme() })
  h.add(gbs)
  gbs.attachScreen = gbs.attachScreen.bind(gbs)
  h.start()
  window.__GB = gbs
  window.__GB_HARNESS = h

  // ---- screens: hero (hero profile) or Harvest (cartridge profile) rendered through the dither pass onto the LCD
  const screens = {}
  const importers = { hero: () => import('/shared/scenes/hero-screen/index.js').then((m) => m.variants[m.pickVariant()]()), harvest: () => import('/shared/scenes/harvest/scene.js') }
  async function lcdScene(name) {
    const mod = await importers[name]()
    const inner = await mod.createScene({ THREE, renderer: h.renderer, size: { w: 160, h: 144, dpr: 1 }, look: 'lcd' })
    return { inner, target: createScreenTarget(THREE, 160, 144) }
  }

  // ---- pose track from real section positions (rebuilt on resize / content load)
  function buildTrack() {
    const H = maxScroll()
    const vh = stableVh()
    const k = (px, pose) => ({ at: clamp(px / H), ...pose })
    const hide = { xf: 1.9, y: -0.2, z: -1, rx: 0, ry: 0.5, rz: -0.3, s: 0.7, cart: 1, fill: 0 }
    const cTop = docY(contact)
    const rest = narrow()
      ? { xf: 0, y: -1.0, z: 0, rx: -0.04, ry: -0.08, rz: 0, s: 0.74, cart: 1, fill: 0 }
      : { xf: 0.34, y: -0.4, z: 0, rx: -0.05, ry: -0.2, rz: 0, s: 0.92, cart: 1, fill: 0 }
    const track = []
    if (profile === 'hero') {
      const hTop = docY(hero)
      const hEnd = hTop + hero.offsetHeight - vh
      const front = narrow() ? { xf: 0, y: -1.1, s: 0.62 } : { xf: 0.4, y: -0.45, s: 1 }
      track.push(
        k(hTop, { ...front, z: 0, rx: -0.05, ry: -0.32, rz: 0.05, cart: 1, fill: 0 }),
        k(hTop + (hEnd - hTop) * 0.55, { ...front, z: 0.3, rx: -0.12, ry: -0.5, rz: 0.12, cart: 1, fill: 0 }),
      )
      const exit = exitName ? exitKeys(exitName, { k, vh, hEnd, front, narrow: narrow() }) : []
      if (exit.length) track.push(...exit)
      else track.push(
        k(hEnd, { xf: front.xf + 0.15, y: front.y + 0.5, z: -0.5, rx: -0.2, ry: -0.9, rz: 0.4, s: front.s * 0.7, cart: 1, fill: 0 }),
        k(hEnd + vh * 0.5, hide),
      )
    } else if (harvest) {
      const hv0 = docY(harvest)
      const hv = (f) => hv0 + f * (harvest.offsetHeight - vh)
      track.push(
        k(hv(0) - vh * 0.6, hide),
        k(hv(0), { xf: 1.7, y: -0.4, z: 0, rx: -0.1, ry: -0.9, rz: 0.5, s: 0.9, cart: 0, fill: 0 }),
        k(hv(0.09), { xf: 0.36, y: -0.35, z: 0, rx: -0.12, ry: -0.5, rz: 0.1, s: 0.95, cart: 0.2, fill: 0 }),
        k(hv(0.16), { xf: 0.04, y: -0.4, z: 0.2, rx: -0.06, ry: -0.18, rz: 0.02, s: 1, cart: 1, fill: 0 }),
        k(hv(0.23), { xf: 0, y: -0.4, z: 0.4, rx: 0, ry: 0, rz: 0, s: 1.05, cart: 1, fill: 0 }),
        k(hv(0.31), { xf: 0, y: -0.4, z: 0.4, rx: 0, ry: 0, rz: 0, s: 1.05, cart: 1, fill: 1 }),
        k(hv(0.33), { xf: 0, y: -0.4, z: 0.4, rx: 0, ry: 0, rz: 0, s: 1.05, cart: 1, fill: 1 }),
        k(hv(0.36), hide),
      )
    }
    if (swap) track.push(...swap.swapKeys({ k, hide, vh, narrow: narrow() }))
    track.push(
      k(cTop - vh * 1.05, { ...hide, cart: 0 }),
      k(cTop - vh * 0.7, { ...rest, xf: rest.xf + 1.2, ry: 0.5, rz: -0.25, cart: 0, s: rest.s * 0.85 }),
      k(cTop - vh * 0.2, { ...rest, cart: 0.35 }),
      k(cTop + vh * 0.15, rest),
      k(H, rest),
    )
    track.sort((a, b) => a.at - b.at)
    for (let i = 1; i < track.length; i += 1) if (track[i].at <= track[i - 1].at) track[i].at = track[i - 1].at + 1e-5
    gbs.setTrack(track)
    h.invalidate()
  }
  buildTrack()
  addEventListener('resize', () => requestAnimationFrame(buildTrack))
  addEventListener('load', buildTrack)
  if (document.fonts?.ready) document.fonts.ready.then(buildTrack)
  new ResizeObserver(() => buildTrack()).observe(document.body)

  // ---- screen switching, canvas opacity, interactivity, cursor
  let wanted = null
  async function showScreen(name) {
    if (name === wanted) return
    wanted = name
    if (!name) { gbs.detachScreen(); return }
    if (!screens[name]) {
      screens[name] = lcdScene(name)
    }
    const s = await screens[name]
    if (wanted !== name) return
    gbs.attachScreen(s.inner, {
      target: s.target,
      progress: name === 'hero' ? () => runwayProgress(hero) * 0.75 : () => clamp(runwayProgress(harvest) / 0.3) * 0.12,
    })
  }
  let contactOn = false
  const contactIO = new IntersectionObserver(([e]) => {
    const on = e.isIntersecting
    gbs.interactive = on
    if (on && !contactOn) { gbs.lcd.reboot(); contactOn = true } else if (!on) contactOn = false
  }, { threshold: 0.45 })
  contactIO.observe(contact)

  let queued = false
  function onScroll() {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      let op = 1
      if (profile === 'hero') {
        const hEnd = docY(hero) + hero.offsetHeight
        const onHero = scrollY < hEnd - stableVh() * 0.2
        showScreen(onHero ? 'hero' : null)
        gbs.interactiveHero = onHero
      } else if (harvest) {
        const p = runwayProgress(harvest)
        const inRun = scrollY > docY(harvest) - stableVh() && scrollY < docY(harvest) + harvest.offsetHeight
        showScreen(inRun && p < 0.4 ? 'harvest' : null)
        if (inRun) op = 1 - smooth(0.29, 0.34, p) * (p < 0.7 ? 1 : 0)
        const full = $('[data-viz="harvest"]')
        if (full) full.style.opacity = String(profile === 'cartridge' ? smooth(0.27, 0.33, p) : 1)
      }
      if (exitName) op *= exitFade(exitName, { hEnd: docY(hero) + hero.offsetHeight - stableVh(), vh: stableVh() }, scrollY)
      if (swap) op *= swap.swapTick(gbs, scrollY, stableVh())
      stage.style.opacity = String(op)
      document.body.classList.toggle('gb-hover', Boolean(gbs.hover))
    })
  }
  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('pointermove', () => { document.body.classList.toggle('gb-hover', Boolean(gbs.hover)) }, { passive: true })
  onScroll()
}

// ---------------------------------------------------------------------------------------------- easter eggs
const baseTitle = document.title
document.addEventListener('visibilitychange', () => { document.title = document.hidden ? 'come back, the undercut is still on' : baseTitle })
console.log('%cLet it happen.', 'font:italic 20px Georgia;color:#39ff88', '\nPSA: the console on the contact section hides two games. Try START, then the Konami code at the menu.')
