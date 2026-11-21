/**
 * The handheld: loads /models/gameboy.glb (modelled in Blender by tools/gb_build.py, node names: body bezel screen
 * dpad btn_a btn_b wells start port speaker screws bay), dresses it with a frosted smoke-plastic material (no
 * transmission pass: fresnel-driven alpha + edge scatter, a back-face pass for thickness and a milky diffuser layer
 * under the front face), puts a softly diffused board and a few dark parts inside, and drives the LCD
 * (shared/gb/lcd.js) as the screen texture. Local units: layout.js.
 *
 *   const gb = await createGameboy({ THREE, lcd })
 *   scene.add(gb.group); gb.update(dt); gb.tap('a'); gb.pick(ndc, camera) -> 'a' | 'b' | 'start' | 'up'... | 'screen' | 'bezel' | 'body' | null
 *   gb.pickInfo(ndc, camera) -> { part, px, py } (px, py = LCD pixel under the ray when part is 'screen')
 *   gb.setTheme('dark' | 'light')
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { L } from './layout.js'
import { makePcbTextures, makePcbMask, makeLetterTexture, makeDiffuser, makeDpadMarks, makePrint, makeGlassWear } from './textures.js'
import { mergeColored, box, cylZ } from './parts.js'
import { makeGlowTexture } from './textures.js'
import { makeGelMaterial, GEL_LOOKS } from './gel.js'
import { VARIANTS } from './variants.js'

const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')

// Theme looks for the frosted plastic. Dark: milky, bright soft edge scatter. Light (cream paper): a darker smoke with
// more body so it does not vanish into the page, and edges that darken rather than glow.
// Dark is the baked "transmission glass" look chosen in anim/gb-tune.html: near-clear blue-grey plastic with a faintly
// blurred, brightened board inside. Fitted (by a numeric search over sample points on the console, two poses) to the
// real-transmission render so the live page gets it without the extra transmission pass. `rough`, `coat`, `env` are
// the frost materials' roughness / clearcoat / reflection; `pcb` and `parts` scale the board and chips seen through it.
const LOOKS = {
  dark: {
    color: 0x415964, face: 0.26, edge: 0.42, back: 0.6, scatter: 0xe9f2fa, scatterK: 0.8, diffuser: 0.21, diffuserColor: 0x5d6796,
    rough: 0.28, coat: 1, env: 1.1, pcb: 1.95, parts: 0.69,
  },
  // Light page: a dark smoke tint (still translucent: the board shows through) so the console reads against cream paper
  light: { color: 0x2c3138, face: 0.58, edge: 0.96, back: 0.68, scatter: 0x7d8792, scatterK: 0.22, diffuser: 0.34, diffuserColor: 0x3c434c, rough: 0.3, coat: 1, env: 1.0, pcb: 2.3, parts: 1.0 },
}

export async function createGameboy({ THREE, lcd, modelUrl = `${BASE}/models/gameboy.glb`, envIntensity = 1, theme = 'dark' }) {
  const gltf = await new GLTFLoader().loadAsync(modelUrl)
  const root = gltf.scene
  const group = new THREE.Group()
  group.add(root)
  const track = []
  const nodes = {}
  root.traverse((o) => { if (o.name) nodes[o.name] = o })

  // Older glbs shipped a cartridge; the page drives the procedural one (labels, insert path), so hide it here.
  for (const n of ['cartridge', 'cart_label', 'cart_ridges', 'cart_pins']) if (nodes[n]) nodes[n].visible = false

  // ------------------------------------------------------------------ frosted plastic
  // Uniforms are shared objects, so setTheme() only changes values (no recompile).
  const U = {
    uFace: { value: 0.3 }, uEdge: { value: 0.92 }, uBack: { value: 0.55 },
    uScatter: { value: new THREE.Color() }, uScatterK: { value: 0.5 },
  }
  const frost = ({ color = 0xd3d8de, side = THREE.FrontSide, faceK = 1, scatterK = 1, rough = 0.5 } = {}) => {
    const m = new THREE.MeshPhysicalMaterial({
      color, roughness: rough, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.16, transparent: true,
      envMapIntensity: 1.1 * envIntensity, side, depthWrite: false,
    })
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U)
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform float uFace, uEdge, uBack, uScatterK; uniform vec3 uScatter;\nvoid main() {')
        .replace(
          '#include <opaque_fragment>',
          `float ndv = abs(dot(normalize(vViewPosition), normal));
           float fr = pow(1.0 - ndv, 1.6);
           // light scattered inside the plastic exits at grazing angles: brighter, milkier edges
           outgoingLight += uScatter * uScatterK * ${scatterK.toFixed(2)} * (0.1 + fr * 1.1);
           diffuseColor.a = mix(uFace * ${faceK.toFixed(2)}, uEdge, smoothstep(0.0, 0.85, fr));
           if (!gl_FrontFacing) diffuseColor.a *= uBack;
           #include <opaque_fragment>`,
        )
    }
    m.customProgramCacheKey = () => `gb-frost-${faceK}-${scatterK}`
    track.push(m)
    return m
  }
  const shell = frost()
  const shellBack = frost({ side: THREE.BackSide })
  const clear = frost({ faceK: 1.5, scatterK: 1.0, rough: 0.4 })
  const collar = frost({ faceK: 1.2, scatterK: 0.5, rough: 0.5 })

  const plastic = (color, r = 0.4, extra = {}) => { const m = new THREE.MeshPhysicalMaterial({ color, roughness: r, metalness: 0, envMapIntensity: envIntensity, ...extra }); track.push(m); return m }
  const wear = makeGlassWear(THREE)
  track.push(wear)
  const mats = {
    body: shell,
    bay: clear,
    wells: collar,
    // roughness 1 x the wear map's green channel (~0.1 glossy, scratches rougher)
    bezel: plastic(0x040405, 1, { roughnessMap: wear, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 * envIntensity }),
    dpad: plastic(0x1c1d20, 0.5, { clearcoat: 0.25, clearcoatRoughness: 0.45 }),
    // glossy red-orange caps and a vivid cyan-blue pill; a same-hue emissive keeps them saturated under ACES
    btn_a: plastic(0xff3b12, 0.3, { clearcoat: 1, clearcoatRoughness: 0.09, emissive: 0xff2a06, emissiveIntensity: 0.4 }),
    btn_b: plastic(0xff3b12, 0.3, { clearcoat: 1, clearcoatRoughness: 0.09, emissive: 0xff2a06, emissiveIntensity: 0.4 }),
    start: plastic(0x0088ff, 0.32, { clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x0080ff, emissiveIntensity: 0.7 }),
    port: plastic(0x16171a, 0.45, { metalness: 0.4 }),
    speaker: plastic(0xffffff, 0.34, { vertexColors: true, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    screws: plastic(0x2c2e33, 0.5),
  }

  // Gel variants of the pill and the A / B caps (?pill=gel, ?btn=gel): built up front, swapped in with setPill / setBtn.
  // The node's own flat material stays in `mats`, so the default look is untouched.
  const gel = {}
  for (const [name, look] of [['start', GEL_LOOKS.pill], ['btn_a', GEL_LOOKS.cap], ['btn_b', GEL_LOOKS.cap]]) {
    if (nodes[name]?.geometry) { gel[name] = makeGelMaterial(THREE, nodes[name].geometry, look, envIntensity); track.push(gel[name]) }
  }
  const variant = { pill: 'flat', btn: 'flat' }
  function setPill(mode) {
    variant.pill = mode === 'gel' && gel.start ? 'gel' : 'flat'
    if (nodes.start) nodes.start.material = variant.pill === 'gel' ? gel.start : mats.start
  }
  function setBtn(mode) {
    variant.btn = mode === 'gel' && gel.btn_a ? 'gel' : 'flat'
    for (const n of ['btn_a', 'btn_b']) if (nodes[n]) nodes[n].material = variant.btn === 'gel' ? gel[n] : mats[n]
  }

  // The black glass has no UVs in the glb: give it planar ones so the wear map lands
  if (nodes.bezel?.geometry) {
    const b = L.bezel
    const g = nodes.bezel.geometry
    const pos = g.attributes.position
    const uv = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i += 1) { uv[i * 2] = (pos.getX(i) - b.x0) / (b.x1 - b.x0); uv[i * 2 + 1] = (pos.getY(i) - b.y0) / (b.y1 - b.y0) }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  }

  // Speaker: a dark dish with pale frosted slot ribs (one node, so colour by height: ribs stand above the dish)
  if (nodes.speaker?.geometry) {
    const g = nodes.speaker.geometry
    const pos = g.attributes.position
    const col = new Float32Array(pos.count * 3)
    const dish = new THREE.Color(0x5d6268)
    const rib = new THREE.Color(0x111214)
    for (let i = 0; i < pos.count; i += 1) {
      const c = pos.getZ(i) > 0.0075 ? rib : dish
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }

  // LCD texture: a canvas drawn top-down. The glb UVs are already glTF-style, so flipY must be off.
  const screenTex = new THREE.CanvasTexture(lcd.canvas)
  screenTex.flipY = false
  screenTex.colorSpace = THREE.SRGBColorSpace
  screenTex.magFilter = THREE.NearestFilter
  screenTex.minFilter = THREE.LinearFilter
  screenTex.generateMipmaps = false
  // polygonOffset: the LCD sits a hair above the black glass; keep it winning the depth test at grazing angles
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })
  track.push(screenTex, screenMat)
  mats.screen = screenMat
  // LCD realism: the picture sits INSIDE the glass. Dimmer, a soft reflection gradient from the black glass over it, a
  // vignette with an inner shadow toward the bezel, a faint pixel grid and a little cool ambient bounce. All uniforms,
  // so ?lcdfx= and the tuner change values without a recompile. Screen UVs span the LCD mesh (0..1).
  const LU = { uDim: { value: 0 }, uVig: { value: 0 }, uGridFx: { value: 0 }, uRefl: { value: 0 } }
  const LCDFX = { off: [0, 0, 0, 0], soft: [0.12, 0.3, 0.1, 0.5], strong: [0.22, 0.55, 0.2, 1] }
  screenMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, LU)
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'varying vec2 vScr;\nvoid main() {\nvScr = uv;')
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'varying vec2 vScr;\nuniform float uDim, uVig, uGridFx, uRefl;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        `{
           vec2 q = vScr * 2.0 - 1.0;
           float edge = min(min(vScr.x, 1.0 - vScr.x) * 1.11, min(vScr.y, 1.0 - vScr.y));
           float inner = 1.0 - smoothstep(0.0, 0.09, edge);                  // shadow the bezel casts on the picture
           float vig = dot(q, q) * 0.5;
           outgoingLight *= 1.0 - uDim - uVig * (0.35 * inner + 0.45 * vig);
           // pixel grid: dark gutters between LCD pixels, fading out when a pixel is under ~3 screen pixels
           vec2 pp = vScr * vec2(160.0, 144.0);
           vec2 cell = abs(fract(pp) - 0.5) * 2.0;
           float gutter = smoothstep(0.62, 0.95, max(cell.x, cell.y));
           float gridK = smoothstep(0.55, 0.25, fwidth(pp.x));
           outgoingLight *= 1.0 - uGridFx * gutter * gridK;
           // glass over it: a diagonal soft sheen from the upper left, a brighter lip along the top, cool bounce low down
           float diag = vScr.x * 0.55 + (1.0 - vScr.y) * 0.75;
           float sheen = smoothstep(0.0, 0.6, 0.9 - diag) * 0.07 + smoothstep(0.1, 0.0, 1.0 - vScr.y) * 0.05;
           outgoingLight += vec3(0.62, 0.72, 0.85) * uRefl * (sheen + 0.025 * (1.0 - vScr.y) * (1.0 - vScr.y));
         }
         #include <opaque_fragment>`,
      )
  }
  screenMat.customProgramCacheKey = () => 'gb-lcdfx'
  function setLcdFx(mode) {
    const v = LCDFX[mode] ?? LCDFX.soft
    LU.uDim.value = v[0]; LU.uVig.value = v[1]; LU.uGridFx.value = v[2]; LU.uRefl.value = v[3]
    lcdfxMode = LCDFX[mode] ? mode : 'soft'
  }
  let lcdfxMode = 'soft'
  setLcdFx(VARIANTS.lcdfx)

  for (const [name, m] of Object.entries(mats)) if (nodes[name]) nodes[name].material = m
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false })
  setPill(VARIANTS.pill)
  setBtn(VARIANTS.btn)

  // Draw order inside the frosted shell: back walls, then the milky diffuser, then the front faces, then clear trim.
  if (nodes.body) {
    const back = new THREE.Mesh(nodes.body.geometry, shellBack)
    back.name = 'body_back'
    back.renderOrder = 1
    back.frustumCulled = false
    nodes.body.parent.add(back)
    back.position.copy(nodes.body.position); back.quaternion.copy(nodes.body.quaternion); back.scale.copy(nodes.body.scale)
    nodes.body.renderOrder = 3
  }
  for (const n of ['wells', 'bay']) if (nodes[n]) nodes[n].renderOrder = 4

  // ------------------------------------------------------------------ inside the shell: diffused board, dark parts
  const chips = [
    { x: 0.15, y: -0.99, w: 0.2, h: 0.2 },        // the small dark chip above the USB block (photo 2)
    { x: 0.0, y: -1.38, w: 0.4, h: 0.34 },         // USB-C receptacle shell, seen through the front
  ]
  const pcbTex = makePcbTextures(THREE, chips, L.holes)
  const pcbGeo = new THREE.PlaneGeometry(L.pcb.w, L.pcb.h)
  // Unlit: seen through frosted plastic the board is a soft shadow, its brightness set by the texture alone
  // rounded corners: an alpha mask (cut-out, antialiased by alpha-to-coverage under MSAA)
  const pcbMask = makePcbMask(THREE, L.pcb.w, L.pcb.h, 0.16)
  const pcbMat = new THREE.MeshBasicMaterial({ map: pcbTex.map, alphaMap: pcbMask, alphaTest: 0.5, alphaToCoverage: true })
  const pcb = new THREE.Mesh(pcbGeo, pcbMat)
  pcb.position.set(0, L.pcb.y, L.pcb.z)
  group.add(pcb)
  const zc = L.pcb.z + 0.003
  const parts = [
    box(THREE, chips[0].w, chips[0].h, 0.05, chips[0].x, chips[0].y, zc + 0.025, '#141518'),
    box(THREE, chips[1].w, chips[1].h, 0.11, chips[1].x, chips[1].y, zc + 0.055, '#0b0c0d'),
    box(THREE, 0.3, 0.05, 0.03, chips[1].x, chips[1].y + chips[1].h / 2 + 0.04, zc + 0.015, '#0e0f11'),
    // round standoffs under the screw pits
    ...L.holes.map((h) => cylZ(THREE, 0.05, 0.2, h.x, h.y, zc + 0.1, '#2c2f34', 32)),
    // a few SMD caps
    ...[[-0.3, -1.18], [0.2, -0.62], [-0.22, -0.5], [0.66, -0.98], [-0.42, -1.48]].map(([x, y]) => box(THREE, 0.08, 0.05, 0.04, x, y, zc + 0.02, '#4a4740')),
  ]
  const partMesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.5 * envIntensity }))
  group.add(partMesh)
  track.push(pcbGeo, pcbMat, pcbMask, pcbTex.map, partMesh.geometry, partMesh.material)

  // Milky diffuser just under the front face: makes the plastic read thick and frosted, internals faint behind it
  const difTex = makeDiffuser(THREE)
  const difGeo = new THREE.PlaneGeometry(L.W, L.H)
  const difMat = new THREE.MeshBasicMaterial({ map: difTex, transparent: true, depthWrite: false, color: 0xffffff })
  const diffuser = new THREE.Mesh(difGeo, difMat)
  diffuser.position.z = L.front - 0.075
  diffuser.renderOrder = 2
  diffuser.frustumCulled = false
  group.add(diffuser)
  track.push(difTex, difGeo, difMat)

  // Letters on the caps (children of the button nodes, so they dip with them). The game UI uses A and B.
  const capTop = L.buttons.top + 0.032
  for (const [name, letter] of [['btn_a', 'A'], ['btn_b', 'B']]) {
    if (!nodes[name]) continue
    const tex = makeLetterTexture(THREE, letter, 'rgba(92,14,10,0.88)')
    const geo = new THREE.PlaneGeometry(0.24, 0.24)
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    const m = new THREE.Mesh(geo, mat)
    m.position.set(0, 0, capTop)
    m.renderOrder = 5
    nodes[name].add(m)
    track.push(tex, geo, mat)
  }
  // Arrow notches on the D-pad arms
  let markMesh = null
  let glowMarks = null
  if (nodes.dpad) {
    const tex = makeDpadMarks(THREE, L.dpad.span, L.dpad.arm)
    const geo = new THREE.PlaneGeometry(L.dpad.span, L.dpad.span)
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    const m = new THREE.Mesh(geo, mat)
    m.position.set(0, 0, 0.0865)
    m.renderOrder = 5
    nodes.dpad.add(m)
    track.push(tex, geo, mat)
    markMesh = m
    // glass D-pad: the arrows engraved and lit teal (additive, only shown in ?dpad=glass)
    const gtex = makeDpadMarks(THREE, L.dpad.span, L.dpad.arm, 'glow')
    const gmat = new THREE.MeshBasicMaterial({ map: gtex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    glowMarks = new THREE.Mesh(geo, gmat)
    glowMarks.position.set(0, 0, 0.0872)
    glowMarks.renderOrder = 6
    glowMarks.visible = false
    nodes.dpad.add(glowMarks)
    track.push(gtex, gmat)
  }
  // A faint coloured halo under each button (normal blending, so it composites over a transparent canvas)
  const haloTex = makeGlowTexture(THREE)
  track.push(haloTex)
  const halos = []
  // The light bleeds into the plastic around each cap's base, as in the reference photos: a flat additive disc sitting
  // inside the shell, in the opaque pass (not a camera-facing sprite floating over it), so the frosted shell above it
  // blurs and scatters it, and it can never appear to hover in front of the console.
  const haloGeo = new THREE.PlaneGeometry(1, 1)
  track.push(haloGeo)
  for (const [name, color, w, h, op] of [['btn_a', 0xff4a1a, 0.5, 0.5, 0.3], ['btn_b', 0xff4a1a, 0.5, 0.5, 0.3], ['start', 0x1aa8ff, 0.66, 0.34, 0.35]]) {
    if (!nodes[name]) continue
    const mat = new THREE.MeshBasicMaterial({ map: haloTex, color, blending: THREE.AdditiveBlending, transparent: false, depthWrite: false, toneMapped: false, opacity: op, fog: false })
    const sp = new THREE.Mesh(haloGeo, mat)
    sp.scale.set(w, h, 1)
    sp.position.set(0, 0, -0.015) // right under the cap base: deeper discs slide away from the cap when the console tilts
    sp.frustumCulled = false
    nodes[name].add(sp)
    halos.push({ mat, op })
    track.push(mat)
  }
  // "on / off" printed under the pill
  const printTex = makePrint(THREE, 'on / off')
  const printGeo = new THREE.PlaneGeometry(0.4, 0.075)
  const printMat = new THREE.MeshBasicMaterial({ map: printTex, transparent: true, depthWrite: false, opacity: 0.9 })
  const print = new THREE.Mesh(printGeo, printMat)
  print.position.set(L.start.x, L.start.y - L.start.h / 2 - 0.072, L.front + 0.002)
  print.renderOrder = 5
  group.add(print)
  track.push(printTex, printGeo, printMat)

  // D-pad variants (?dpad=): built up front, swapped with setDpad. 'flat' is the default material in `mats`.
  const dpadLook = {
    gel: { base: { color: 0x15181c, roughness: 0.36, clearcoat: 0.9, clearcoatRoughness: 0.2, sheen: 0.7, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x2c5360) }, rim: [0.1, 0.8, 0.9], rimK: 0.5, top: 0.1 },
    glass: { base: { color: 0x07090c, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.7 * envIntensity }, rim: [0.1, 0.75, 1.0], rimK: 0.35, top: 0.05 },
    rubber: { base: { color: 0x222428, roughness: 0.9, clearcoat: 0, sheen: 0.8, sheenRoughness: 0.55, sheenColor: new THREE.Color(0x8c96a2) }, rim: null, rimK: 0, top: 0 },
  }
  const dpadMats = { flat: mats.dpad }
  for (const [kind, d] of Object.entries(dpadLook)) {
    const m = new THREE.MeshPhysicalMaterial({ metalness: 0, envMapIntensity: envIntensity, ...d.base })
    if (d.rimK > 0) {
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float dNdv = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
           totalEmissiveRadiance += vec3(${d.rim.map((v) => v.toFixed(2)).join(',')}) * ${d.rimK.toFixed(2)} * pow(1.0 - dNdv, 2.4);
           totalEmissiveRadiance += vec3(0.7, 0.85, 1.0) * ${d.top.toFixed(2)} * smoothstep(0.55, 1.0, normal.y);`,
        )
      }
    }
    m.customProgramCacheKey = () => `gb-dpad-${kind}`
    dpadMats[kind] = m
    track.push(m)
  }
  let dpadMode = 'flat'
  function setDpad(mode) {
    dpadMode = dpadMats[mode] ? mode : 'flat'
    if (nodes.dpad) nodes.dpad.material = dpadMats[dpadMode]
    if (glowMarks) glowMarks.visible = dpadMode === 'glass'
    if (markMesh) markMesh.visible = dpadMode !== 'glass' && dpadMode !== 'rubber'
  }
  setDpad(VARIANTS.dpad)

  function setTheme(name) {
    const k = LOOKS[name] ?? LOOKS.dark
    U.uFace.value = k.face
    U.uEdge.value = k.edge
    U.uBack.value = k.back
    U.uScatter.value.set(k.scatter)
    U.uScatterK.value = k.scatterK
    for (const m of [shell, shellBack]) m.color.set(k.color)
    clear.color.set(k.color)
    collar.color.set(k.color)
    difMat.color.set(k.diffuserColor)
    difMat.opacity = k.diffuser
    printMat.color.set(name === 'light' ? 0x2a2d33 : 0xffffff)
    for (const m of [shell, shellBack, clear, collar]) {
      m.userData.r0 ??= m.roughness
      m.userData.c0 ??= m.clearcoat
      m.roughness = k.rough ?? m.userData.r0
      m.clearcoat = k.coat ?? m.userData.c0
      m.envMapIntensity = (k.env ?? 1.1) * envIntensity
    }
    pcbMat.color.setScalar(k.pcb ?? 1)
    partMesh.material.color.setScalar(k.parts ?? 1)
  }
  setTheme(theme)

  // ------------------------------------------------------------------ interaction
  const press = { a: 0, b: 0, start: 0, up: 0, down: 0, left: 0, right: 0 }
  const rest = {}
  for (const n of ['dpad', 'btn_a', 'btn_b', 'start']) rest[n] = nodes[n]?.position.clone()
  const pickables = ['btn_a', 'btn_b', 'start', 'dpad', 'screen', 'bezel', 'body'].map((n) => nodes[n]).filter(Boolean)
  const ray = new THREE.Raycaster()
  const tmp = new THREE.Vector3()

  const api = {
    group, nodes, mats, lcd, texture: screenTex, press, interactive: false, setTheme,
    /** Look variants (shared/gb/variants.js): 'flat' (default) | 'gel' for the on/off pill and for the A / B caps. `gel` holds the gel materials. */
    setPill, setBtn, setDpad, setLcdFx, dpadMats, get dpadMode() { return dpadMode }, get lcdfxMode() { return lcdfxMode }, lcdU: LU, gel, get pillMode() { return variant.pill }, get btnMode() { return variant.btn },
    /** Live handles for anim/gb-tune.html (the tuning page): shared frost uniforms, the diffuser and button halos. */
    tune: { U, frost: [shell, shellBack, clear, collar], difMat, diffuser, halos, printMat, pcbMat, partMat: partMesh.material },
    /** Which control is under the raycaster, or null. D-pad returns its direction. */
    pick(ndc, camera) { return api.pickInfo(ndc, camera).part },
    pickInfo(ndc, camera) {
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(pickables, false)[0]
      if (!hit) return { part: null }
      const n = hit.object.name
      if (n === 'btn_a' || n === 'btn_b' || n === 'start') return { part: n === 'start' ? 'start' : n === 'btn_a' ? 'a' : 'b' }
      if (n === 'screen' || n === 'bezel') {
        // LCD pixel under the ray; the glass around the lit area is 'bezel' (never maps to a menu row)
        group.worldToLocal(tmp.copy(hit.point))
        const S = L.screen
        const px = ((tmp.x - (S.cx - S.w / 2)) / S.w) * 160
        const py = ((S.cy + S.h / 2 - tmp.y) / S.h) * 144
        return px >= 0 && px < 160 && py >= 0 && py < 144 ? { part: 'screen', px, py } : { part: 'bezel' }
      }
      if (n === 'dpad') {
        hit.object.worldToLocal(tmp.copy(hit.point))
        const dx = tmp.x
        const dy = tmp.y
        return { part: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'up' : 'down' }
      }
      return { part: n }
    },
    /**
     * Show another picture on the screen: pass a WebGLRenderTarget texture (bottom-up) or null to go back to the LCD UI.
     * glb UVs are glTF-style (top-left origin), so render-target textures are flipped here once.
     */
    setScreenSource(tex) {
      if (tex) {
        tex.repeat.set(1, -1)
        tex.offset.set(0, 1)
        screenMat.map = tex
      } else screenMat.map = screenTex
      screenMat.needsUpdate = true
    },
    /** Press a control: animates the cap and feeds the LCD. */
    tap(btn) {
      if (btn in press) press[btn] = 1
      lcd.press(btn)
    },
    update(dt) {
      for (const key of Object.keys(press)) press[key] *= Math.exp(-9 * dt)
      const dip = (name, v, depth) => { if (nodes[name]) { nodes[name].position.copy(rest[name]); nodes[name].position.z -= depth * v } }
      dip('btn_a', press.a, 0.03)
      dip('btn_b', press.b, 0.03)
      dip('start', press.start, 0.02)
      if (nodes.dpad) {
        const m = Math.max(press.up, press.down, press.left, press.right)
        dip('dpad', m, 0.012)
        nodes.dpad.rotation.set((press.down - press.up) * 0.1, (press.right - press.left) * 0.1, 0)
      }
      const changed = lcd.update(dt)
      if (changed) screenTex.needsUpdate = true
      return changed
    },
    dispose() {
      for (const t of track) t.dispose?.()
      root.traverse((o) => { if (o.isMesh) o.geometry?.dispose() })
    },
  }
  return api
}
