/**
 * The slide-in cartridge: slim grey housing, raised label frame, grip ridges, gold edge connector, and a pixel-font
 * label drawn to a canvas. `insert(t)` is a pure function of t (0 = hovering well above the bay, 1 = seated), so it
 * scrubs both ways from page scroll.
 */
import { L } from './layout.js'
import { roundedRectShape, rectHole, extrude, mergeAll } from './parts.js'
import { drawText, measureText } from './pixfont.js'

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const backOut = (x, c1 = 0.6) => { const c3 = c1 + 1; const u = x - 1; return 1 + c3 * u * u * u + c1 * u * u }

const LW = 136
const LH = 80
const LS = 4

function luminance(hex) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function defaultArt(g, x, y, w, h, accent) {
  g.fillStyle = '#10141a'
  g.fillRect(x, y, w, h)
  // Stars
  g.fillStyle = '#6b7482'
  for (let i = 0; i < 14; i += 1) g.fillRect(x + ((i * 37) % (w - 2)) + 1, y + ((i * 17) % Math.max(1, Math.floor(h * 0.5))) + 1, 1, 1)
  // Moon
  g.fillStyle = '#e9e4d2'
  const mx = x + w - 24
  const my = y + 12
  for (let j = -6; j <= 6; j += 1) for (let i = -6; i <= 6; i += 1) if (i * i + j * j <= 30 && (i + 3) * (i + 3) + (j - 1) * (j - 1) > 22) g.fillRect(mx + i, my + j, 1, 1)
  // Dunes, dithered at the ridge
  g.fillStyle = accent
  for (let i = 0; i < w; i += 1) {
    const ridge = Math.round(h * 0.62 - Math.sin((i / w) * Math.PI * 1.6 + 0.4) * h * 0.16)
    g.fillRect(x + i, y + ridge, 1, h - ridge)
    if (i % 2 === 0) g.fillRect(x + i, y + ridge - 1, 1, 1)
  }
  g.fillStyle = 'rgba(0,0,0,0.35)'
  for (let i = 0; i < w; i += 2) g.fillRect(x + i, y + h - 5, 1, 1)
  g.fillStyle = '#10141a'
  g.fillRect(x, y + h - 3, w, 3)
}

function paintLabel(g, { title = '', subtitle = '', color = '#d9b34a', art }) {
  const light = luminance(color) > 0.55
  const ink = light ? '#14161a' : '#f2ecdc'
  const dark = '#14161a'
  const cream = '#f2ecdc'
  g.imageSmoothingEnabled = false
  g.fillStyle = color
  g.fillRect(0, 0, LW, LH)
  // frame
  g.fillStyle = dark
  g.fillRect(0, 0, LW, 2); g.fillRect(0, LH - 2, LW, 2); g.fillRect(0, 0, 2, LH); g.fillRect(LW - 2, 0, 2, LH)
  g.fillStyle = cream
  g.fillRect(3, 3, LW - 6, 1); g.fillRect(3, LH - 4, LW - 6, 1); g.fillRect(3, 3, 1, LH - 6); g.fillRect(LW - 4, 3, 1, LH - 6)
  // title band
  g.fillStyle = dark
  g.fillRect(6, 6, LW - 12, 20)
  const words = String(title).toUpperCase()
  const maxPx = LW - 20
  let lines = [words]
  let k = 2
  if (measureText(words, 2) > maxPx) {
    k = 1
    if (measureText(words, 1) > maxPx) {
      const parts = words.split(' ')
      const mid = Math.ceil(parts.length / 2)
      lines = [parts.slice(0, mid).join(' '), parts.slice(mid).join(' ')]
    }
  }
  const textH = 7 * k
  const total = lines.length * textH + (lines.length - 1) * 2
  lines.forEach((ln, i) => {
    const w = measureText(ln, k)
    drawText(g, ln, Math.round((LW - w) / 2), 6 + Math.round((20 - total) / 2) + i * (textH + 2), cream, k)
  })
  // art
  const ax = 8
  const ay = 29
  const aw = LW - 16
  const ah = 38
  g.fillStyle = dark
  g.fillRect(ax - 1, ay - 1, aw + 2, ah + 2)
  if (typeof art === 'function') {
    g.save()
    g.beginPath(); g.rect(ax, ay, aw, ah); g.clip()
    art(g, ax, ay, aw, ah)
    g.restore()
  } else if (art && (art instanceof HTMLCanvasElement || art instanceof HTMLImageElement || art instanceof ImageBitmap)) {
    g.drawImage(art, ax, ay, aw, ah)
  } else defaultArt(g, ax, ay, aw, ah, light ? '#5a4a1c' : '#e0c15a')
  // subtitle
  if (subtitle) {
    const s = String(subtitle).toUpperCase()
    const w = measureText(s, 1)
    drawText(g, s, Math.round((LW - w) / 2), 70, ink, 1)
  }
}

export function createCartridge({ THREE, track, envIntensity = 1 }) {
  const { w: CW, h: CH, t: CT } = L.cart
  const bevel = 0.024
  const group = new THREE.Group()
  group.name = 'cartridge'

  // Housing outline: full-width upper body, stepped-in connector section, asymmetric shoulder chamfers
  const iw = CW - bevel * 2
  const ih = CH - bevel * 2
  const x1 = iw / 2
  const x2 = x1 - 0.14
  const top = ih / 2
  const bot = -ih / 2
  const s = new THREE.Shape()
  s.moveTo(-x2, bot)
  s.lineTo(x2, bot)
  s.lineTo(x2, bot + 0.26)
  s.lineTo(x1, bot + 0.38)
  s.lineTo(x1, top - 0.07)
  s.quadraticCurveTo(x1, top, x1 - 0.07, top)
  s.lineTo(-x1 + 0.07, top)
  s.quadraticCurveTo(-x1, top, -x1, top - 0.07)
  s.lineTo(-x1, bot + 0.3)
  s.lineTo(-x2, bot + 0.18)
  s.closePath()
  const housing = extrude(THREE, s, CT - bevel * 2, { bevel, bevelT: bevel, segments: 3 })
  const plastic = new THREE.MeshPhysicalMaterial({ color: 0x9a9ea6, roughness: 0.42, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: envIntensity })

  // Raised frame around the label, and grip ridges
  const frameShape = roundedRectShape(THREE, 1.58, 0.98, [0.05, 0.05, 0.05, 0.05], 0, 0.04)
  frameShape.holes.push(rectHole(THREE, 1.5, 0.9, 0.03, 0, 0.04))
  const frameG = extrude(THREE, frameShape, 0.012, { bevel: 0.004, bevelT: 0.004, segments: 1, center: false })
  frameG.translate(0, 0, CT / 2 - 0.002)
  const ridges = []
  for (let i = 0; i < 4; i += 1) {
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.34, 0.016, 0.016)
      g.translate(sx * 0.62, 0.55 + i * 0.036, CT / 2 - 0.004)
      ridges.push(g)
    }
  }
  const trim = mergeAll([frameG, ...ridges].map((g) => (g.attributes.uv ? g : g)))
  const trimMat = new THREE.MeshPhysicalMaterial({ color: 0x8b8f97, roughness: 0.5, clearcoat: 0.3, envMapIntensity: envIntensity })

  // Label
  const labelCanvas = document.createElement('canvas')
  labelCanvas.width = LW * LS
  labelCanvas.height = LH * LS
  const small = document.createElement('canvas')
  small.width = LW
  small.height = LH
  const labelTex = new THREE.CanvasTexture(labelCanvas)
  labelTex.colorSpace = THREE.SRGBColorSpace
  labelTex.anisotropy = 8
  const labelMat = new THREE.MeshPhysicalMaterial({ map: labelTex, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: envIntensity * 0.8 })
  const labelGeo = new THREE.PlaneGeometry(1.5, 0.9)
  labelGeo.translate(0, 0.04, 0)
  const label = new THREE.Mesh(labelGeo, labelMat)
  label.position.z = CT / 2 + 0.0035

  // Gold edge-connector card poking out of the bottom
  const [cardTex] = (() => {
    const c = document.createElement('canvas')
    c.width = 256; c.height = 48
    const g = c.getContext('2d')
    g.fillStyle = '#2a3a2c'; g.fillRect(0, 0, 256, 48)
    g.fillStyle = '#e2b866'
    for (let i = 0; i < 31; i += 1) g.fillRect(6 + i * 8, 4, 5, 34)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return [t]
  })()
  const cardGeo = new THREE.BoxGeometry(1.3, 0.1, 0.03)
  cardGeo.translate(0, -CH / 2 - 0.035, 0)
  const cardMat = new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.35, metalness: 0.4, envMapIntensity: envIntensity })
  const card = new THREE.Mesh(cardGeo, cardMat)
  // The card texture's fingers should face the front: rotate UVs by mapping the box's front face (default)
  const housingMesh = new THREE.Mesh(housing, plastic)
  const trimMesh = new THREE.Mesh(trim, trimMat)
  group.add(housingMesh, trimMesh, label, card)
  track.push(housing, plastic, trim, trimMat, labelTex, labelMat, labelGeo, cardTex, cardGeo, cardMat)

  const state = {
    t: 0,
    extra: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    hover: { x: -0.5, y: 3.0, z: 0.9, rx: -0.5, ry: 0.55, rz: 0.22 },
    // seated: the cart's top sits L.cart.out above the body's top edge
    seat: { x: 0, y: L.H / 2 + L.cart.out - CH / 2, z: L.cart.z },
    info: { title: '', subtitle: '', color: '#d9b34a' },
    onChange: null,
  }

  const api = {
    group,
    state,
    setCartridge(info = {}) {
      Object.assign(state.info, info)
      const g = labelCanvas.getContext('2d')
      const sg = small.getContext('2d')
      paintLabel(sg, state.info)
      g.imageSmoothingEnabled = false
      g.clearRect(0, 0, labelCanvas.width, labelCanvas.height)
      g.drawImage(small, 0, 0, labelCanvas.width, labelCanvas.height)
      labelTex.needsUpdate = true
      state.onChange?.()
      return api
    },
    /** t: 0 hovering above the bay .. 1 seated. Values are not clamped so the page can overshoot or fly off. */
    insert(t) {
      state.t = t
      apply()
      return api
    },
    get t() { return state.t },
    /** Extra offset on top of the insert path, in gameboy-local units / radians. Does not allocate. */
    setPose(p = {}) {
      const e = state.extra
      if (p.x !== undefined) e.x = p.x
      if (p.y !== undefined) e.y = p.y
      if (p.z !== undefined) e.z = p.z
      if (p.rx !== undefined) e.rx = p.rx
      if (p.ry !== undefined) e.ry = p.ry
      if (p.rz !== undefined) e.rz = p.rz
      apply()
      return api
    },
    /** Animate insert() toward `target` over `seconds`; advanced by the module's update(). */
    insertTo(target, seconds = 1) {
      anim.from = state.t
      anim.to = target
      anim.dur = Math.max(1e-3, seconds)
      anim.k = 0
      anim.on = true
    },
    visible(v) { group.visible = v },
  }
  const anim = { on: false, from: 0, to: 1, dur: 1, k: 0 }

  function apply() {
    const t = state.t
    const g = smooth(0, 1, clamp01(t))
    const f = t >= 1 ? 1 : t <= 0 ? 0 : backOut(g)
    const w = 1 - smooth(0.02, 0.72, clamp01(t))
    const h = state.hover
    const sd = state.seat
    const e = state.extra
    // Beyond 0..1 keep travelling linearly so the page can push the cartridge further out or in.
    const over = t > 1 ? (t - 1) * 0.6 : t < 0 ? t : 0
    group.position.set(
      sd.x + h.x * w + e.x,
      sd.y + h.y * (1 - f) + over * h.y * (t < 0 ? 1 : -0.5) + e.y,
      sd.z + h.z * w + e.z,
    )
    group.rotation.set(h.rx * w + e.rx, h.ry * w + e.ry, h.rz * w + e.rz)
    state.onChange?.()
  }

  api.update = (dt) => {
    if (!anim.on) return
    anim.k = Math.min(1, anim.k + dt / anim.dur)
    const e = anim.k < 0.5 ? 4 * anim.k ** 3 : 1 - (-2 * anim.k + 2) ** 3 / 2
    state.t = anim.from + (anim.to - anim.from) * e
    if (anim.k >= 1) anim.on = false
    apply()
  }
  api.setCartridge({ color: '#d9b34a' })
  apply()
  return api
}
