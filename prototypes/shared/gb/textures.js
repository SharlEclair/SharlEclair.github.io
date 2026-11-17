/** Procedural canvas textures for the gameboy: the board seen through frosted plastic, decals, glass, glow. */
import { L } from './layout.js'
import { drawText, measureText } from './pixfont.js'

export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

function tex(THREE, c, { srgb = true, aniso = 4, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = aniso
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/**
 * The circuit board as seen through frosted smoke plastic: a charcoal board, dark rubber membranes under the D-pad and
 * buttons, faint grey traces, all softly blurred (the plastic diffuses it). `parts` are footprints in gameboy-local
 * units ({ x, y, w, h }) so the soft shadows line up with the crisp 3D blocks placed on top.
 */
export function makePcbTextures(THREE, parts, holes) {
  const { w: BW, h: BH, y: BY } = L.pcb
  const PX = 180
  const cw = Math.round(BW * PX)
  const ch = Math.round(BH * PX)
  const [c0, g0] = canvas(cw, ch)
  const rand = rng(1989)
  const X = (x) => (x + BW / 2) * PX
  const Y = (y) => (BH / 2 - (y - BY)) * PX

  // Board: charcoal, lighter toward the outline where the plastic is thick and milky
  const base = g0.createRadialGradient(cw * 0.5, ch * 0.55, 10, cw * 0.5, ch * 0.5, Math.max(cw, ch) * 0.62)
  base.addColorStop(0, '#3e4146')
  base.addColorStop(0.7, '#45484d')
  base.addColorStop(1, '#55585e')
  g0.fillStyle = base
  g0.fillRect(0, 0, cw, ch)

  // Traces: faint grey buses with 45 degree jogs
  g0.lineCap = 'round'
  g0.lineJoin = 'round'
  for (let b = 0; b < 30; b += 1) {
    const horizontal = rand() > 0.45
    const n = 2 + Math.floor(rand() * 5)
    const sp = 6 + Math.floor(rand() * 3)
    const x = rand() * cw
    const y = rand() * ch
    const len1 = 20 + rand() * 110
    const jog = 12 + rand() * 30
    const len2 = 20 + rand() * 120
    const sgn = rand() > 0.5 ? 1 : -1
    g0.strokeStyle = `rgba(${rand() > 0.5 ? '150,154,160' : '20,21,23'},${0.25 + rand() * 0.25})`
    g0.lineWidth = 2
    for (let i = 0; i < n; i += 1) {
      const ox = horizontal ? 0 : i * sp
      const oy = horizontal ? i * sp : 0
      const p0 = [x + ox, y + oy]
      const p1 = horizontal ? [p0[0] + len1, p0[1]] : [p0[0], p0[1] + len1]
      const p2 = horizontal ? [p1[0] + jog, p1[1] + sgn * jog] : [p1[0] + sgn * jog, p1[1] + jog]
      const p3 = horizontal ? [p2[0] + len2, p2[1]] : [p2[0], p2[1] + len2]
      g0.beginPath(); g0.moveTo(...p0); g0.lineTo(...p1); g0.lineTo(...p2); g0.lineTo(...p3); g0.stroke()
    }
  }
  // Small SMD parts: dark specks
  for (let i = 0; i < 70; i += 1) {
    g0.fillStyle = `rgba(14,15,17,${0.4 + rand() * 0.4})`
    const w = 4 + rand() * 9
    g0.fillRect(rand() * cw, rand() * ch, w, w * (0.4 + rand() * 0.5))
  }
  // Rubber membranes under the controls: dark soft discs (the darkest masses in the photos)
  const disc = (x, y, r, a) => {
    const gr = g0.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * PX)
    gr.addColorStop(0, `rgba(10,10,12,${a})`)
    gr.addColorStop(0.75, `rgba(10,10,12,${a * 0.85})`)
    gr.addColorStop(1, 'rgba(10,10,12,0)')
    g0.fillStyle = gr
    g0.beginPath(); g0.arc(X(x), Y(y), r * PX, 0, 7); g0.fill()
  }
  disc(L.dpad.x, L.dpad.y, L.dpad.ring * 1.0, 0.92)
  disc(L.buttons.a.x, L.buttons.a.y, L.buttons.r * 1.7, 0.85)
  disc(L.buttons.b.x, L.buttons.b.y, L.buttons.r * 1.7, 0.85)
  disc(L.speaker.x, L.speaker.y, L.speaker.r * 1.1, 0.9)
  disc(L.start.x, L.start.y, 0.26, 0.7)  // Footprint shadows of the 3D parts
  for (const p of parts) {
    g0.fillStyle = 'rgba(8,8,10,0.55)'
    g0.fillRect(X(p.x - p.w * 0.6), Y(p.y + p.h * 0.6), p.w * 1.2 * PX, p.h * 1.2 * PX)
  }
  for (const h of holes) {
    g0.fillStyle = 'rgba(190,194,200,0.5)'
    g0.beginPath(); g0.arc(X(h.x), Y(h.y), 9, 0, 7); g0.fill()
  }
  drawText(g0, 'PF-2 REV.B', X(-0.9), Y(-1.2), 'rgba(200,204,210,0.4)', 2)

  // Diffuse it: the frosted plastic blurs everything behind it
  const [c1, g1] = canvas(cw, ch)
  g1.filter = 'blur(5px)'
  g1.drawImage(c0, 0, 0)
  g1.filter = 'none'
  const map = tex(THREE, c1, { aniso: 4 })
  return { map, orm: null }
}

/**
 * The frosted diffuser that sits just under the front face: white, alpha = how milky the plastic reads. Milkier along
 * the outline (thicker plastic, light scattering in from the edges) and in the strip just below the screen, clearer
 * mid-body. Plane size = W x H.
 */
export function makeDiffuser(THREE) {
  const PX = 160
  const cw = Math.round(L.W * PX)
  const ch = Math.round(L.H * PX)
  const [c, g] = canvas(cw, ch)
  const X = (x) => (x + L.W / 2) * PX
  const Y = (y) => (L.H / 2 - y) * PX
  const [tl, tr, br, bl] = L.radii.map((r) => r * PX)
  const path = (inset) => {
    const x0 = inset
    const y0 = inset
    const x1 = cw - inset
    const y1 = ch - inset
    const k = (r) => Math.max(2, r - inset)
    g.beginPath()
    g.moveTo(x0 + k(tl), y0)
    g.lineTo(x1 - k(tr), y0)
    g.arcTo(x1, y0, x1, y0 + k(tr), k(tr))
    g.lineTo(x1, y1 - k(br))
    g.arcTo(x1, y1, x1 - k(br), y1, k(br))
    g.lineTo(x0 + k(bl), y1)
    g.arcTo(x0, y1, x0, y1 - k(bl), k(bl))
    g.lineTo(x0, y0 + k(tl))
    g.arcTo(x0, y0, x0 + k(tl), y0, k(tl))
    g.closePath()
  }
  // Nothing outside the body outline (the big bottom-right corner especially)
  path(4)
  g.clip()
  g.fillStyle = 'rgba(255,255,255,0.05)'
  g.fillRect(0, 0, cw, ch)
  // Edge milkiness: stroke the outline with a wide soft line
  g.filter = 'blur(14px)'
  for (const [inset, a, wd] of [[6, 0.8, 30], [24, 0.45, 48]]) {
    g.strokeStyle = `rgba(255,255,255,${a})`
    g.lineWidth = wd
    path(inset)
    g.stroke()
  }
  // Light strip under the screen panel and the upper-left glow seen in the photos
  const b = L.bezel
  const strip = g.createLinearGradient(0, Y(b.y0), 0, Y(b.y0 - 0.5))
  strip.addColorStop(0, 'rgba(255,255,255,0.34)')
  strip.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = strip
  g.fillRect(X(-L.W / 2), Y(b.y0) - 6, cw, 0.5 * PX + 6)
  const glowL = g.createRadialGradient(X(-1.15), Y(-0.1), 0, X(-1.15), Y(-0.1), 1.1 * PX)
  glowL.addColorStop(0, 'rgba(255,255,255,0.22)')
  glowL.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = glowL
  g.fillRect(0, 0, cw, ch)
  g.filter = 'none'
  return tex(THREE, c, { aniso: 4 })
}

/** Engraved arrow notches on the D-pad arms + the rim of the centre dimple. Plane = span x span, centred on the pad. */
export function makeDpadMarks(THREE, span, arm) {
  const S = 512
  const [c, g] = canvas(S, S)
  const k = S / span
  const a = (arm / 2) * k
  g.translate(S / 2, S / 2)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (let i = 0; i < 4; i += 1) {
    g.save()
    g.rotate((i * Math.PI) / 2)
    // Open triangle pointing outward, sitting toward the arm's tip
    const tip = -S / 2 + 0.11 * S
    const baseY = tip + a * 0.75
    const hw = a * 0.42
    g.strokeStyle = 'rgba(150,152,158,0.26)'
    g.lineWidth = 6
    g.beginPath(); g.moveTo(-hw, baseY); g.lineTo(0, tip); g.lineTo(hw, baseY); g.stroke()
    g.strokeStyle = 'rgba(0,0,0,0.5)'
    g.lineWidth = 3
    g.beginPath(); g.moveTo(-hw, baseY - 2); g.lineTo(0, tip - 2); g.lineTo(hw, baseY - 2); g.stroke()
    g.restore()
  }
  return tex(THREE, c, { aniso: 8 })
}

/** Small printed text (the "on / off" under the pill). */
export function makePrint(THREE, text, { w = 512, h = 96, px = 52, ink = 'rgba(225,228,234,0.85)' } = {}) {
  const [c, g] = canvas(w, h)
  g.font = `400 ${px}px "Helvetica Neue", Arial, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  if ('letterSpacing' in g) g.letterSpacing = '4px'
  g.fillStyle = ink
  g.fillText(text, w / 2, h / 2)
  return tex(THREE, c, { aniso: 8 })
}

/** Roughness map for the black glass: mostly glossy, with fine scratches and dust (green channel = roughness). */
export function makeGlassWear(THREE, seed = 11) {
  const S = 512
  const [c, g] = canvas(S, S / 2)
  const rand = rng(seed)
  // three multiplies material.roughness (set to 1) by this green channel: base ~0.1, scratches 0.35-0.6
  g.fillStyle = 'rgb(0,26,0)'
  g.fillRect(0, 0, S, S / 2)
  for (let i = 0; i < 140; i += 1) {
    const x = rand() * S
    const y = rand() * (S / 2)
    const l = 10 + rand() * 70
    const ang = (rand() - 0.5) * 0.25
    g.strokeStyle = `rgba(0,${90 + Math.floor(rand() * 60)},0,${0.25 + rand() * 0.5})`
    g.lineWidth = rand() > 0.85 ? 1.6 : 0.8
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); g.stroke()
  }
  for (let i = 0; i < 400; i += 1) {
    g.fillStyle = `rgba(0,${100 + Math.floor(rand() * 60)},0,${0.3 + rand() * 0.6})`
    g.fillRect(rand() * S, rand() * (S / 2), 1 + rand(), 1 + rand())
  }
  return tex(THREE, c, { srgb: false, aniso: 8 })
}

/** Soft radial falloff for the glow billboard behind the console (white; tint with the material colour). */
export function makeGlowTexture(THREE) {
  const S = 256
  const [c, g] = canvas(S, S)
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10
    gr.addColorStop(t, `rgba(255,255,255,${(Math.pow(1 - t, 2.2) * (1 - t * 0.2)).toFixed(3)})`)
  }
  g.fillStyle = gr
  g.fillRect(0, 0, S, S)
  return tex(THREE, c, { aniso: 1 })
}

export function makeLetterTexture(THREE, letter, ink = 'rgba(86,10,8,0.9)') {
  const [c, g] = canvas(128, 128)
  g.font = '500 78px "Helvetica Neue", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // Engraved: a light lower lip, then the dark cut
  g.fillStyle = 'rgba(255,190,170,0.35)'
  g.fillText(letter, 64, 70)
  g.fillStyle = ink
  g.fillText(letter, 64, 68)
  return tex(THREE, c, { aniso: 4 })
}

export { drawText, measureText }
