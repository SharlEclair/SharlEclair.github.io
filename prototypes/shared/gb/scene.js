/**
 * Gameboy scene module (see shared/gl/harness.js for the contract). One handheld + one cartridge, posed along a
 * scroll "track" and playable: D-pad up/down selects, A opens, START launches the dino runner, B backs out, and the
 * Konami code (up up down down left right B A) at the menu opens a hidden snake.
 *
 *   const m = await createScene({ THREE, renderer, size, track, cartridge, interactive, onOpen, onGame })
 *   track: [{ at, xf, y, z, rx, ry, rz, s, cart }]  xf = x in half-widths of the view, s = scale (1 = fits), cart = insert t
 *
 * Contact: while `api.interactive` is true the idle bob stops and the console only leans (damped) toward the cursor.
 * A click/tap on the console sets `api.engaged`: it eases to a straight still pose, scales up 12% and then accepts
 * input (buttons, LCD taps, keyboard). `interactive = false` disengages. Touch: a tap on a menu row selects it, a
 * second tap on the selected row (or A) opens it; taps never open links in one go.
 *

 * Events (window): `gb:game` {state:'start'|'end'} comes from lcd.js; `gb:palette` {name, ms = 6000} (here) swaps the LCD
 * palette temporarily; `gb:say` {lines, ms} is handled by lcd.js. While the hero game is played the console faces the
 * screen (straight, no sway or cursor lean) and eases back 2.5 s after the last console input.
 *
 * Hero: `api.interactiveHero = true` while an attached screen shows; START (3D pill or the S key) switches the screen
 * to the LCD dino game, B / Escape returns to the attached scene. `onGame(active)` fires when a game starts / ends.
 */
import { createGameboy } from './gameboy.js'
import { createCartridge } from './cartridge.js'
import { createLcd } from './lcd.js'
import { L } from './layout.js'
import { makeGlowTexture } from './textures.js'
import { createFloorGlow } from './glowfloor.js'
import { VARIANTS } from './variants.js'
import { LCD_PALETTES } from '../dither/pass.js'
import { person } from '../content.js'

/** A dark studio with a few softboxes. Nothing sits behind the camera, so flat faces looking at us never mirror a light. */
function studioEnv(THREE) {
  const env = new THREE.Scene()
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshBasicMaterial({ color: 0x30343d, side: THREE.BackSide }))
  env.add(room)
  const panel = (w, h, pos, look, k, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }))
    m.position.set(...pos)
    m.lookAt(...look)
    env.add(m)
  }
  panel(16, 6, [0, 16, 2], [0, 0, 0], 5)               // top softbox
  panel(3, 22, [-16, 0, 4], [0, 0, 0], 3.5, 0xdfeaff)  // cool strip, left
  panel(3, 22, [16, 0, -3], [0, 0, 0], 9, 0x9fd8ff)    // rim strip, right behind
  panel(24, 10, [0, 2, -17], [0, 0, 0], 2.5)           // back wall glow
  panel(10, 3, [0, -15, 4], [0, 0, 0], 1.2, 0xffe6c8)  // warm floor bounce
  panel(12, 8, [-13, 8, 15], [0, 0, 0], 2.2)           // soft front fill from the upper left (off the mirror axis)
  return env
}

const EXT = L.extent
/** The LCD UI draws with 4 shades: stretch 2-colour palettes (e.g. 'mono') to dark, dark, light, light. */
const four = (p) => (Array.isArray(p) && p.length < 4 ? [p[0], p[0], p[p.length - 1], p[p.length - 1]] : p)
const smooth = (t) => t * t * (3 - 2 * t)
const FACE_HOLD = 2.5 // seconds without console input before the hero game pose eases back to the idle motion
const clamp01 = (v) => Math.min(1, Math.max(0, v))

export const DEMO_TRACK = [
  { at: 0.0, xf: 0.5, y: 0.9, z: -3, rx: -0.25, ry: -0.55, rz: 0.4, s: 0.5, cart: 0 },
  { at: 0.3, xf: 0.35, y: 0.1, z: 0, rx: -0.12, ry: -0.35, rz: 0.12, s: 0.85, cart: 0.25 },
  { at: 0.6, xf: 0.0, y: -0.4, z: 0, rx: -0.05, ry: 0.15, rz: 0.0, s: 0.95, cart: 1 },
  { at: 1.0, xf: 0.0, y: -0.5, z: 0.5, rx: 0, ry: 0, rz: 0, s: 1.05, cart: 1 },
]

export function samplePose(track, p) {
  let a = track[0]
  let b = track[track.length - 1]
  if (p <= a.at) return { ...a }
  if (p >= b.at) return { ...b }
  for (let i = 0; i < track.length - 1; i += 1) {
    if (p >= track[i].at && p <= track[i + 1].at) { a = track[i]; b = track[i + 1]; break }
  }
  const t = smooth(clamp01((p - a.at) / Math.max(1e-6, b.at - a.at)))
  const out = {}
  for (const k of ['xf', 'y', 'z', 'rx', 'ry', 'rz', 's', 'cart', 'fill']) out[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * t
  return out
}

function openItem(item) {
  if (!item?.href) return
  if (item.href.startsWith('mailto:')) window.location.href = item.href
  else if (item.href.startsWith('#')) window.location.hash = item.href
  else window.open(item.href, '_blank', 'noopener')
}

export async function createScene({
  THREE, renderer, size, track = DEMO_TRACK, palette = 'dmg', cartridge = {}, interactive = false, onOpen = openItem,
  items, reducedAt = 1, fov = 30, idle = true, bootOnStart = true, theme = 'dark', onGame = null, interactiveHero = false,
}) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(fov, size.w / size.h, 0.1, 100)
  camera.position.set(0, 0, 12)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envRT = pmrem.fromScene(studioEnv(THREE), 0.03)
  scene.environment = envRT.texture
  scene.environmentIntensity = 1
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const key = new THREE.DirectionalLight(0xffffff, 1.1)
  key.position.set(-4, 6.5, 0.8)
  const rim = new THREE.DirectionalLight(0x9fd8ff, 1.2)
  rim.position.set(4, 2, -4)
  // soft front key from the upper left: lights the caps and pill without a mirror hit on the flat faces
  const front = new THREE.DirectionalLight(0xfff6ee, 0.9)
  front.position.set(-3, 4, 7)
  scene.add(key, rim, front)

  const menu = items ?? [
    { label: 'EMAIL', display: person.email.toUpperCase(), href: `mailto:${person.email}` },
    { label: 'LINKEDIN', href: person.linkedin.url },
    { label: 'GITHUB', display: `GITHUB/${person.github.handle.toUpperCase()}`, href: person.github.url },
  ]
  const lcd = createLcd({ items: menu, palette: four(LCD_PALETTES[palette] ?? palette), onOpen: (it) => onOpen(it), boot: bootOnStart, onMode: (m) => modeChanged(m) })
  const gb = await createGameboy({ THREE, lcd })
  // ?shell=glass: real three.js transmission glass for the case (shared/gb/glass.js), instead of the cheap faked frost
  let glassV = null
  if (VARIANTS.shell === 'glass') {
    glassV = (await import('./glass.js')).createGlassVariant(THREE, gb, renderer)
    renderer.transmissionResolutionScale = 0.6
  }
  const cart = createCartridge({ THREE, track: [], envIntensity: 1 })
  // Flat faces looking straight at the camera mirror the bright room light through a clearcoat: keep them matte.
  cart.group.traverse((o) => { if (o.material) { o.material.envMapIntensity = 0.3; if ('clearcoat' in o.material) o.material.clearcoat = 0.12 } })
  cart.setCartridge({ title: 'HARVEST SURPRISE', subtitle: 'RICE FROM ORBIT', color: '#d9b34a', ...cartridge })
  const rig = new THREE.Group()
  const pivot = new THREE.Group()
  pivot.add(gb.group, cart.group)
  rig.add(pivot)
  scene.add(rig)

  // A barely-there soft light behind the console, like light bleeding around a product shot. A sprite parented to the
  // pivot, so it follows the console but always faces the camera. Dark: cool white with a hint of the screen green,
  // premultiplied so it composites correctly over a transparent canvas. Light: a faint warm shadow halo instead.
  const glowTex = makeGlowTexture(THREE)
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, depthTest: true, toneMapped: false, fog: false, blending: THREE.NormalBlending })
  const glow = new THREE.Sprite(glowMat)
  glow.position.set(0, 0.15, -L.D * 1.2)
  glow.scale.set(L.W * 2.6, L.H * 2.3, 1)
  glow.renderOrder = -10
  pivot.add(glow)
  let glowLook = { opacity: 0 }
  // ?glow= variants (shared/gb/variants.js): 'default' is the sprite above, 'floor' / 'grid' the floor light, 'off' nothing.
  // The floor light is built on first use, so the default look pays nothing for it.
  let glowMode = 'default'
  let glowKind = null // 'floor' | 'grid' when the floor light is on
  let glowAnim = '' // '' | 'pulse' | 'drain'
  let glowPinned = false // ?glow=scroll: static floor light anchored to the page (scrolls up with the content)
  let glowStick = false // ?glow=stick: as scroll, but in the hero it holds still while the stage is pinned and leaves only with the page
  let heroStage
  const heroStageTop = () => {
    if (heroStage === undefined) heroStage = document.querySelector('.hero .stage')
    return heroStage ? heroStage.getBoundingClientRect().top : null
  }
  let floorGlow = null
  const ensureFloor = () => {
    if (!floorGlow) {
      floorGlow = createFloorGlow(THREE)
      floorGlow.setTheme(state.theme)
      floorGlow.group.visible = Boolean(glowKind)
      scene.add(floorGlow.group) // world fixed: parked at a rest pose of the console (see updateFloorGlow), not following it
    }
    return floorGlow
  }
  function setGlow(mode) {
    glowPinned = mode === 'scroll' || mode === 'stick'
    glowStick = mode === 'stick'
    const [kind, anim = ''] = String(glowPinned ? 'floor' : mode).split('-')
    glowKind = kind === 'floor' || kind === 'grid' ? kind : null
    glowAnim = glowKind && (anim === 'pulse' || anim === 'drain') ? anim : ''
    glowMode = glowPinned ? mode :glowKind ? glowKind + (glowAnim ? '-' + glowAnim : '') : mode === 'off' ? 'off' : 'default'
    if (glowKind) ensureFloor().setMode(glowKind)
    if (floorGlow) { floorGlow.group.visible = Boolean(glowKind); floorGlow.setBreath(0) }
    if (glowMode !== 'default') glow.visible = false
  }
  // ---- the floor light stays where the console rests. Rest poses are found in the track: the first key, and any key
  // that holds the same place as a neighbour (the console parks there). The light sits at the nearest rest pose; as the
  // console moves away its presence falls from 1 to 0 (and comes back on return). Between two rests it re-parks only
  // once it has fully faded, so it never slides across the page.
  let anchors = []
  let anchorIdx = 0
  let glowAlive = false
  const near = (a, b) => Math.abs(a.xf - b.xf) < 1e-3 && Math.abs(a.y - b.y) < 1e-3 && Math.abs(a.s - b.s) < 1e-3
  function findAnchors(tr) {
    const out = []
    tr.forEach((k, i) => {
      if (Math.abs(k.xf ?? 0) > 1.2 || (k.fill ?? 0) > 0.05) return
      if (i === 0 || near(k, tr[i - 1]) || (tr[i + 1] && near(k, tr[i + 1]))) out.push({ at: k.at ?? 0, xf: k.xf ?? 0, y: k.y ?? 0, z: k.z ?? 0, s: k.s ?? 1 })
    })
    if (!out.length && tr[0]) out.push({ at: tr[0].at ?? 0, xf: tr[0].xf ?? 0, y: tr[0].y ?? 0, z: tr[0].z ?? 0, s: tr[0].s ?? 1 })
    return out
  }
  anchors = findAnchors(track)
  function updateFloorGlow(pose, scale, fit, halfW, fade, time, reduced, p) {
    if (!floorGlow || !glowKind || !anchors.length) { glowAlive = false; return }
    if (glowPinned) {
      // ?glow=scroll: parked at the rest pose nearest in scroll, static, and slid up the screen by exactly the distance
      // scrolled since that rest (a rigid NDC shift, so it moves like page content, no perspective change)
      let best = 0
      anchors.forEach((a, i) => { if (Math.abs(p - a.at) < Math.abs(p - anchors[best].at)) best = i })
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight)
      let dy
      const top = glowStick ? heroStageTop() : null
      if (top !== null && top > -state.h) {
        // hero: the light is part of the pinned stage, so it holds until the stage scrolls away, then rides up with it
        best = 0
        dy = Math.max(0, -top)
      } else dy = (p - anchors[best].at) * maxScroll
      anchorIdx = best
      const a = anchors[best]
      const sc = a.s * fit
      const level = (1 - smooth(clamp01((Math.abs(dy) / state.h - 1) / 0.6))) * fade
      floorGlow.setBreath(0)
      floorGlow.setShift(dy / (state.h / 2))
      floorGlow.setLevel(level)
      floorGlow.group.scale.setScalar(sc)
      floorGlow.group.position.set(a.xf * halfW, a.y, a.z)
      glowAlive = level > 0.003
      return
    }
    const presence = (a) => {
      const as = a.s * fit
      const d = Math.hypot((pose.xf - a.xf) * halfW, pose.y - a.y) / (L.H * as) + Math.abs(scale / as - 1)
      return 1 - smooth(clamp01((d - 0.12) / 1.0))
    }
    let pr = presence(anchors[Math.min(anchorIdx, anchors.length - 1)])
    if (pr < 0.02) {
      let best = anchorIdx
      let bp = pr
      anchors.forEach((a, i) => { const v = presence(a); if (v > bp) { bp = v; best = i } })
      anchorIdx = best
      pr = bp
    }
    const a = anchors[Math.min(anchorIdx, anchors.length - 1)]
    const sc = a.s * fit
    let level = pr
    let sx = 1
    let sy = 1
    let breath = 0
    if (glowAnim === 'pulse') {
      breath = reduced ? 0 : Math.sin(time * 1.7) * pr
      level = pr * (0.85 + 0.15 * Math.sin(time * 1.7 + 0.6)) * smooth(clamp01(pr * 3))
    } else if (glowAnim === 'drain') {
      // contract into a thin line along the floor, then fade out; the reverse on return
      const q = smooth(clamp01(pr / 0.75))
      sy = 0.025 + 0.975 * q
      sx = 0.6 + 0.4 * q
      level = smooth(clamp01(pr / 0.3))
    }
    floorGlow.setBreath(breath)
    floorGlow.setLevel(level * fade)
    floorGlow.group.scale.set(sc * sx, sc * sy, sc)
    // keep the floor line where it was while the height collapses
    floorGlow.group.position.set(a.xf * halfW, a.y + sc * (-L.H / 2) * (1 - sy), a.z)
    glowAlive = level * fade > 0.003
  }
  function setTheme(name) {
    const light = name === 'light'
    glowLook = light ? { opacity: 0.1, color: 0x6b5a40 } : { opacity: 0.14, color: 0xd6f0e2 }
    // Normal blending in both themes: over the near-black page a pale colour at low alpha reads as added light, and
    // unlike additive it writes valid premultiplied alpha, so it composites the same over the page's transparent canvas.
    glowMat.color.set(glowLook.color)
    gb.setTheme(light ? 'light' : 'dark')
    if (glassV) {
      // gb.setTheme reset the board and parts: put the glass look back, tinted smoke on the light theme
      glassV.enable(true)
      for (const m of glassV.mats) {
        m.color.set(light ? 0x3a424c : 0xbcc3cb)
        m.attenuationColor.set(light ? 0x2c3138 : 0xb0b8c1)
      }
    }
    const swap = VARIANTS.shell === 'swap' || VARIANTS.shell === 'pale' || VARIANTS.shell === 'glass'
    cart.setTheme?.(light !== swap ? 'light' : 'dark', VARIANTS.shell === 'mono' || swap)
    // brighter room on cream so the frosted shell does not go muddy
    scene.environmentIntensity = light ? 1.15 : 1
    state.theme = light ? 'light' : 'dark'
    floorGlow?.setTheme(state.theme)
    if (!state.paletteExplicit && themedPalette) applyPalette(light ? LIGHT_LCD : DARK_LCD)
  }

  const state = { interactive, interactiveHero, engaged: false, eng: 0, calm: 0, moving: false, heroGame: false, playing: false, hover: null, face: 0, inputT: 0, seenInput: 0, trackRef: track, pose: samplePose(track, 0), w: size.w, h: size.h, onscreen: true, attached: null, theme: 'dark', palette }
  // LCD palette follows the site theme (dark: ink, light: graphite) when the page's default 'ink' is in use and nothing
  // chose one: no ?lcd= / ?palette= in the URL and setPalette() not called. Other palettes passed in stay as given.
  // ?shell=mono: dark LCD ground on the dark theme, light LCD ground on the light theme
  // ?shell=swap: the opposite way round (light LCD on the dark theme, dark LCD on the light theme)
  const mono = VARIANTS.shell === 'mono'
  const swapped = VARIANTS.shell === 'swap' || VARIANTS.shell === 'pale' || VARIANTS.shell === 'glass'
  const DARK_LCD = mono ? 'graphite' : swapped ? 'bone' : 'ink'
  const LIGHT_LCD = mono ? 'bone' : 'graphite'
  const urlQ = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)
  state.paletteExplicit = urlQ.has('lcd') || urlQ.has('palette')
  const themedPalette = palette === 'ink'
  function applyPalette(name) {
    const list = Array.isArray(name) ? name : LCD_PALETTES[name]
    if (!list) return
    lcd.setPalette(four(list))
    state.attached?.inner.setPalette?.(name)
    state.palette = name
  }
  setTheme(theme)
  setGlow(VARIANTS.glow)

  // ---- games: onGame(active) fires when the LCD enters / leaves the dino or the Konami snake
  function modeChanged(m) {
    const playing = m === 'game' || m === 'konami'
    if (playing !== state.playing) { state.playing = playing; onGame?.(playing) }
    if (!playing) endHeroGame()
  }
  /** Hero START: swap the attached scene for the LCD and start the dino game. */
  function heroStart() {
    if (!state.attached || state.heroGame) return
    state.heroGame = true
    gb.setScreenSource(null)
    lcd.startGame()
  }
  /** Back to the attached scene (B / Escape, or the page scrolled away). */
  function endHeroGame() {
    if (!state.heroGame) return
    state.heroGame = false
    if (state.attached) gb.setScreenSource(state.attached.target.texture)
    if (lcd.mode === 'game') lcd.press('b')
  }

  const api = {
    scene, camera, gb, cart, lcd,
    /** Live handles for anim/gb-tune.html (the tuning page). */
    tune: { key, rim, front, glow, glowMat, renderer, floor: ensureFloor, get glowOpacity() { return glowLook.opacity }, set glowOpacity(v) { glowLook.opacity = v } },
    /** Contact section live: idle bob off, cursor lean on. Setting it false also clears `engaged`. */
    get interactive() { return state.interactive },
    set interactive(v) { state.interactive = Boolean(v); if (!v) state.engaged = false },
    /** True after the console was clicked/tapped: straight, still, 12% bigger, accepting input. */
    get engaged() { return state.engaged },
    setEngaged(v) { state.engaged = Boolean(v) && state.interactive },
    /** Hero: true while the attached hero screen is visible and START may take it over. */
    get interactiveHero() { return state.interactiveHero },
    set interactiveHero(v) { state.interactiveHero = Boolean(v); if (!v) endHeroGame() },
    /** True while the hero START game is showing on the LCD. */
    get heroGame() { return state.heroGame },
    /** Leave the hero game (if any) and show the attached scene again. */
    endHeroGame,
    /** Is a game (dino or Konami snake) on the LCD right now. */
    get playing() { return state.playing },
    /** 'dark' (default, page #08080a) or 'light' (cream paper #e8e6db): shell look + the halo behind the console. */
    setTheme,
    get theme() { return state.theme },
    /** Light behind the console: 'default' (soft sprite) | 'floor' | 'grid' | 'off'. Also ?glow= (shared/gb/variants.js). */
    setGlow,
    get glowMode() { return glowMode },
    /**
     * Recolour the screen: a LCD_PALETTES name ('dmg' 'pocket' 'night' 'amber' 'ink' 'ember' 'ice' 'berry') or a
     * dark -> light colour list. The LCD UI recolours live; an attached screen scene is passed the name too if it
     * has its own setPalette(name).
     */
    setPalette(name) {
      state.paletteExplicit = true
      applyPalette(name)
    },
    get palette() { return state.palette },
    /** idle motion only costs frames while the handheld is actually in view */
    get animated() { return (state.onscreen || glowAlive) && (idle || state.moving) },
    get hover() { return state.hover },
    get pose() { return state.pose },
    /**
     * Put another scene module (built with look: 'lcd') on the handheld's screen.
     *   attachScreen(inner, { target, progress: (ctx) => 0..1 })  ->  detachScreen()
     * `target` is a createScreenTarget() render target; the inner scene is updated and rendered into it every frame
     * the handheld is on screen.
     */
    attachScreen(inner, { target, progress = (ctx) => ctx.p, pointer = null } = {}) {
      state.heroGame = false
      if (lcd.mode === 'game') lcd.press('b')
      state.attached = { inner, target, progress, pointer }
      if (typeof state.palette === 'string') inner.setPalette?.(state.palette)
      gb.setScreenSource(target.texture)
    },
    detachScreen() {
      state.heroGame = false
      if (lcd.mode === 'game') lcd.press('b')
      state.attached = null
      gb.setScreenSource(null)
    },
    beats: [
      { at: 0.0, id: '01', title: 'Tilt', text: 'Small and floating, cartridge hovering above the bay.' },
      { at: 0.3, id: '02', title: 'Approach', text: 'It turns toward you; the cartridge descends.' },
      { at: 0.6, id: '03', title: 'Seat', text: 'Cartridge seated, the screen boots.' },
      { at: 1.0, id: '04', title: 'Play', text: 'Straight on. Up/down select, A opens, START plays.' },
    ],
    setTrack(next) { state.trackRef = next; anchors = findAnchors(next); anchorIdx = 0 },
    update(ctx) {
      const dt = ctx.dt
      const p = ctx.reduced ? reducedAt : ctx.p
      const pose = samplePose(state.trackRef, p)
      state.pose = pose
      const halfH = 12 * Math.tan((fov * Math.PI) / 360)
      const halfW = halfH * camera.aspect
      // s = 1: the seated console (body + cart) fits 80% of the view height or width
      const fit = Math.min((halfH * 2 * 0.8) / (EXT.top - EXT.bottom), (halfW * 2 * 0.8) / (EXT.w + 0.1))
      const t = ctx.time
      // Envelopes: `calm` 0 -> 1 once the contact section is live (the idle bob fades out and is exactly zero after),
      // `eng` 0 -> 1 when engaged (straight pose + 12% bigger). Both are dt-driven so they stay smooth at any frame rate.
      const calmTo = state.interactive ? 1 : 0
      state.calm += Math.max(-dt / 0.6, Math.min(dt / 0.6, calmTo - state.calm))
      const engTo = state.engaged ? 1 : 0
      state.eng = ctx.reduced ? engTo : Math.abs(engTo - state.eng) < 0.0005 ? engTo : state.eng + (engTo - state.eng) * (1 - Math.exp(-4 * dt))
      state.moving = state.calm !== calmTo || state.eng !== engTo
      // Facing: while the hero dino game is played the console turns straight to the screen and stops swaying / leaning,
      // and eases back FACE_HOLD seconds after the last console input. Only rotation, sway and the cursor lean are
      // overridden (position, scale and the scroll keys still apply).
      if (state.heroGame && lcd.inputAt !== state.seenInput) { state.seenInput = lcd.inputAt; state.inputT = performance.now() }
      const faceTo = state.heroGame && performance.now() - state.inputT < FACE_HOLD * 1000 ? 1 : 0
      state.face = ctx.reduced || Math.abs(faceTo - state.face) < 0.0005 ? faceTo : state.face + (faceTo - state.face) * (1 - Math.exp(-(faceTo ? 5 : 2.5) * dt))
      state.moving = state.moving || state.face !== faceTo
      const kf = 1 - smooth(state.face)
      const idleAmp = (1 - smooth(state.calm)) * kf
      const e = smooth(state.eng)
      const floatY = idle && !ctx.reduced ? Math.sin(t * 0.9) * 0.06 * idleAmp : 0
      const swayZ = idle && !ctx.reduced ? Math.sin(t * 0.6) * 0.012 * idleAmp : 0
      // `fill` (0..1) blends toward "the LCD covers the whole view", centred on the screen: the dive into the cartridge.
      const fill = pose.fill || 0
      const S = L.screen
      const cover = Math.max((halfW * 2) / S.w, (halfH * 2) / S.h) * 1.06
      const scale = Math.max(0.01, pose.s * fit) * (1 - fill) * (1 + 0.12 * e) + cover * fill
      const tilt = 1 - fill
      rig.position.set(pose.xf * halfW - fill * S.cx * scale, pose.y + floatY - fill * S.cy * scale, pose.z)
      const glowFade = 1 - smooth(clamp01(fill * 1.6))
      glowMat.opacity = glowLook.opacity * glowFade
      glow.visible = glowMode === 'default' && glowMat.opacity > 0.002
      rig.scale.setScalar(scale)
      updateFloorGlow(pose, scale, fit, halfW, glowFade, t, ctx.reduced, ctx.p)
      // cursor lean: smaller angles on the contact pose, and none once engaged
      const lean = tilt * (1 - e) * (1 - 0.3 * smooth(state.calm)) * kf
      rig.rotation.set(pose.rx * (1 - e) * kf - ctx.pointer.sy * 0.18 * lean, pose.ry * (1 - e) * kf + ctx.pointer.sx * 0.28 * lean, pose.rz * (1 - e) * kf + swayZ * tilt)
      cart.insert(pose.cart)
      cart.update?.(dt)
      if (ctx.reduced) lcd.wake()

      state.onscreen = Math.abs(pose.xf) < 1.6 && pose.s > 0.03

      // Hover (the page turns `hover` into a cursor). Before engaging, anywhere on the console counts.
      state.hover = null
      if ((state.interactive || state.interactiveHero) && state.onscreen && ctx.pointer.inside) {
        const part = gb.pick({ x: ctx.pointer.x, y: ctx.pointer.y }, camera)
        if (state.attached && !state.heroGame) state.hover = state.interactiveHero && part === 'start' ? 'start' : null
        else if (!part) state.hover = null
        else if (!state.heroGame && !state.engaged) state.hover = part
        else state.hover = part === 'body' || part === 'bezel' ? null : part === 'screen' && lcd.mode === 'boot' ? null : part
      }
      gb.update(dt)

      const att = state.attached
      if (att && state.onscreen) {
        const innerCtx = { ...ctx, progress: att.progress(ctx), p: att.progress(ctx), pointer: att.pointer ? att.pointer(ctx) : ctx.pointer, size: { w: att.target.width, h: att.target.height, dpr: 1 } }
        att.inner.update?.(innerCtx)
        if (att.inner.render) att.inner.render(renderer, innerCtx, att.target)
        else { renderer.setRenderTarget(att.target); renderer.render(att.inner.scene, att.inner.camera); renderer.setRenderTarget(null) }
      }
    },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); state.w = w; state.h = h },
    dispose() {
      window.removeEventListener('keydown', onKey)
      gb.dispose()
      glowTex.dispose()
      glowMat.dispose()
      floorGlow?.dispose()
      envRT.dispose()
      pmrem.dispose()
    },
  }

  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'a', ' ': 'a', z: 'a', j: 'a', x: 'b', b: 'b', k: 'b', Escape: 'b', Backspace: 'b', q: 'start', w: 'up', a: 'left', s: 'down', d: 'right' }
  const DOM_TARGET = 'a,button,input,textarea,select,label,summary,[role="button"],[role="link"]'

  /** May the console take input right now (and which buttons)? */
  const accepts = (btn) => {
    if (!state.onscreen) return false
    if (state.heroGame) return state.interactiveHero
    if (state.attached) return state.interactiveHero && btn === 'start'
    return state.interactive && state.engaged
  }
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    // WASD is the D-pad; S stays START while the hero START is the only thing the console accepts (nothing to move yet)
    const btn = k === 's' && state.attached && !state.heroGame ? 'start' : KEYS[k]
    if (!btn || !accepts(btn)) return
    // Only steal keys the console uses, and never from form fields or links with focus
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'A' && (e.key === 'Enter' || e.key === ' '))) return
    e.preventDefault()
    if (state.attached && !state.heroGame) heroStart()
    else gb.tap(btn)
  }

  /** One deliberate press (mouse down, or a touch that lifted without dragging), resolved inside the event handler. */
  function press(ndc, touch) {
    if (!state.onscreen) return
    const { part, px, py } = gb.pickInfo(ndc, camera)
    if (!part) return
    if (state.attached && !state.heroGame) { if (state.interactiveHero && part === 'start') heroStart(); return }
    if (!(state.heroGame ? state.interactiveHero : state.interactive)) return
    // The click that engages is swallowed: it presses nothing
    if (!state.heroGame && !state.engaged) { state.engaged = true; return }
    if (part === 'screen') lcd.tapAt(px, py, { confirm: touch })
    else if (part in gb.press) gb.tap(part)
  }
  const ndcOf = (e) => {
    const r = renderer.domElement.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) }
  }
  const ignore = (e) => e.target instanceof Element && e.target.closest(DOM_TARGET)
  const touches = new Map()
  function onDown(e) {
    if (ignore(e)) return
    if (e.pointerType === 'mouse') { if (e.button === 0) press(ndcOf(e), false); return }
    // touch / pen: wait for the lift, so a swipe that starts over the console (to scroll) never presses anything
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() })
  }
  function onUp(e) {
    const g = touches.get(e.pointerId)
    if (!g) return
    touches.delete(e.pointerId)
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10 || performance.now() - g.t > 600 || ignore(e)) return
    press(ndcOf(e), true)
  }
  const onCancel = (e) => touches.delete(e.pointerId)
  // lcd.js announces the dino game: a start while the hero START is in charge restarts the facing timer
  const onGameEvt = (e) => { if (e.detail?.state === 'start' && state.heroGame) state.inputT = performance.now() }
  // `gb:palette` {name, ms = 6000}: borrow an LCD_PALETTES palette for a while, then restore what was showing
  let palTimer = 0
  let palBefore = null
  const onPalette = (e) => {
    const name = e.detail?.name
    if (!LCD_PALETTES[name]) return
    if (palBefore === null) palBefore = state.palette
    applyPalette(name)
    clearTimeout(palTimer)
    palTimer = setTimeout(() => {
      const back = !state.paletteExplicit && themedPalette ? (state.theme === 'light' ? LIGHT_LCD : DARK_LCD) : palBefore
      palBefore = null
      applyPalette(back)
    }, Math.max(0, Number(e.detail.ms) || 6000))
  }
  window.addEventListener('gb:game', onGameEvt)
  window.addEventListener('gb:palette', onPalette)
  window.addEventListener('keydown', onKey)
  window.addEventListener('pointerdown', onDown, { passive: true })
  window.addEventListener('pointerup', onUp, { passive: true })
  window.addEventListener('pointercancel', onCancel, { passive: true })
  const dispose = api.dispose
  api.dispose = () => {
    window.removeEventListener('gb:game', onGameEvt)
    window.removeEventListener('gb:palette', onPalette)
    clearTimeout(palTimer)
    window.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    dispose()
  }
  return api
}
