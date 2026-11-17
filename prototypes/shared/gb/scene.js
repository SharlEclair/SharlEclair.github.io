/**
 * Gameboy scene module (see shared/gl/harness.js for the contract). One handheld + one cartridge, posed along a
 * scroll "track" and playable: D-pad up/down selects, A opens, START launches the runner, B backs out. Mouse/touch
 * pressing the 3D buttons works, so does the keyboard while `api.interactive` is true.
 *
 *   const m = await createScene({ THREE, renderer, size, track, cartridge, interactive, onOpen })
 *   track: [{ at, xf, y, z, rx, ry, rz, s, cart }]  xf = x in half-widths of the view, s = scale (1 = fits), cart = insert t
 */
import { createGameboy } from './gameboy.js'
import { createCartridge } from './cartridge.js'
import { createLcd } from './lcd.js'
import { L } from './layout.js'
import { makeGlowTexture } from './textures.js'
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
  items, reducedAt = 1, fov = 30, idle = true, bootOnStart = true, theme = 'dark',
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
  const lcd = createLcd({ items: menu, palette: four(LCD_PALETTES[palette] ?? palette), onOpen: (it) => onOpen(it), boot: bootOnStart })
  const gb = await createGameboy({ THREE, lcd })
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
  function setTheme(name) {
    const light = name === 'light'
    glowLook = light ? { opacity: 0.1, color: 0x6b5a40 } : { opacity: 0.14, color: 0xd6f0e2 }
    // Normal blending in both themes: over the near-black page a pale colour at low alpha reads as added light, and
    // unlike additive it writes valid premultiplied alpha, so it composites the same over the page's transparent canvas.
    glowMat.color.set(glowLook.color)
    gb.setTheme(light ? 'light' : 'dark')
    // brighter room on cream so the frosted shell does not go muddy
    scene.environmentIntensity = light ? 1.15 : 1
    state.theme = light ? 'light' : 'dark'
  }

  const state = { prevDown: false, hover: null, trackRef: track, pose: samplePose(track, 0), w: size.w, h: size.h, onscreen: true, attached: null, theme: 'dark', palette }
  setTheme(theme)
  const api = {
    scene, camera, gb, cart, lcd, interactive,
    /** 'dark' (default, page #08080a) or 'light' (cream paper #e8e6db): shell look + the halo behind the console. */
    setTheme,
    get theme() { return state.theme },
    /**
     * Recolour the screen: a LCD_PALETTES name ('dmg' 'pocket' 'night' 'amber' 'ink' 'ember' 'ice' 'berry') or a
     * dark -> light colour list. The LCD UI recolours live; an attached screen scene is passed the name too if it
     * has its own setPalette(name).
     */
    setPalette(name) {
      const list = Array.isArray(name) ? name : LCD_PALETTES[name]
      if (!list) return
      lcd.setPalette(four(list))
      state.attached?.inner.setPalette?.(name)
      state.palette = name
    },
    get palette() { return state.palette },
    /** idle motion only costs frames while the handheld is actually in view */
    get animated() { return idle && state.onscreen },
    get hover() { return state.hover },
    get pose() { return state.pose },
    /**
     * Put another scene module (built with look: 'lcd') on the handheld's screen.
     *   attachScreen(inner, { target, progress: (ctx) => 0..1 })  ->  detachScreen()
     * `target` is a createScreenTarget() render target; the inner scene is updated and rendered into it every frame
     * the handheld is on screen.
     */
    attachScreen(inner, { target, progress = (ctx) => ctx.p, pointer = null } = {}) {
      state.attached = { inner, target, progress, pointer }
      if (typeof state.palette === 'string') inner.setPalette?.(state.palette)
      gb.setScreenSource(target.texture)
    },
    detachScreen() { state.attached = null; gb.setScreenSource(null) },
    beats: [
      { at: 0.0, id: '01', title: 'Tilt', text: 'Small and floating, cartridge hovering above the bay.' },
      { at: 0.3, id: '02', title: 'Approach', text: 'It turns toward you; the cartridge descends.' },
      { at: 0.6, id: '03', title: 'Seat', text: 'Cartridge seated, the screen boots.' },
      { at: 1.0, id: '04', title: 'Play', text: 'Straight on. Up/down select, A opens, START plays.' },
    ],
    setTrack(next) { state.trackRef = next },
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
      const floatY = idle && !ctx.reduced ? Math.sin(t * 0.9) * 0.06 : 0
      const swayZ = idle && !ctx.reduced ? Math.sin(t * 0.6) * 0.012 : 0
      // `fill` (0..1) blends toward "the LCD covers the whole view", centred on the screen: the dive into the cartridge.
      const fill = pose.fill || 0
      const S = L.screen
      const cover = Math.max((halfW * 2) / S.w, (halfH * 2) / S.h) * 1.06
      const scale = Math.max(0.01, pose.s * fit) * (1 - fill) + cover * fill
      const tilt = 1 - fill
      rig.position.set(pose.xf * halfW - fill * S.cx * scale, pose.y + floatY - fill * S.cy * scale, pose.z)
      glowMat.opacity = glowLook.opacity * (1 - smooth(clamp01(fill * 1.6)))
      glow.visible = glowMat.opacity > 0.002
      rig.scale.setScalar(scale)
      rig.rotation.set(pose.rx - ctx.pointer.sy * 0.18 * tilt, pose.ry + ctx.pointer.sx * 0.28 * tilt, pose.rz + swayZ * tilt)
      cart.insert(pose.cart)
      cart.update?.(dt)
      if (ctx.reduced) lcd.wake()

      state.onscreen = Math.abs(pose.xf) < 1.6 && pose.s > 0.03

      // Pointer: hover + press on the pointerdown edge (the page turns `hover` into a cursor)
      if (api.interactive && state.onscreen && ctx.pointer.inside) {
        const hit = gb.pick({ x: ctx.pointer.x, y: ctx.pointer.y }, camera)
        state.hover = hit && hit !== 'screen' ? hit : hit === 'screen' && lcd.mode !== 'boot' ? 'screen' : null
      } else state.hover = null
      // Presses are latched from the pointerdown event itself, so a quick tap that is released before the next frame still counts.
      if (state.pending) {
        const { x, y } = state.pending
        state.pending = null
        if (api.interactive && state.onscreen && !state.attached) {
          const hit = gb.pick({ x, y }, camera)
          if (hit) gb.tap(hit === 'screen' ? 'a' : hit)
        }
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
      envRT.dispose()
      pmrem.dispose()
    },
  }

  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'a', ' ': 'a', z: 'a', x: 'b', Escape: 'b', Backspace: 'b', s: 'start' }
  function onKey(e) {
    if (!api.interactive || e.metaKey || e.ctrlKey || e.altKey) return
    const btn = KEYS[e.key]
    if (!btn) return
    // Only steal keys the console uses, and never from form fields or links with focus
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (tag === 'A' && (e.key === 'Enter' || e.key === ' '))) return
    e.preventDefault()
    gb.tap(btn)
  }
  window.addEventListener('keydown', onKey)
  function onDown(e) {
    const r = renderer.domElement.getBoundingClientRect()
    state.pending = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) }
  }
  window.addEventListener('pointerdown', onDown, { passive: true })
  const dispose = api.dispose
  api.dispose = () => { window.removeEventListener('pointerdown', onDown); dispose() }
  return api
}
