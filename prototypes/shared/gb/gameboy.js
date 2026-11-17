/**
 * The handheld: loads /models/gameboy.glb (modelled in Blender by tools/gb_build.py, node names: body bezel screen
 * dpad btn_a btn_b wells start port speaker screws bay), dresses it with a frosted smoke-plastic material (no
 * transmission pass: fresnel-driven alpha + edge scatter, a back-face pass for thickness and a milky diffuser layer
 * under the front face), puts a softly diffused board and a few dark parts inside, and drives the LCD
 * (shared/gb/lcd.js) as the screen texture. Local units: layout.js.
 *
 *   const gb = await createGameboy({ THREE, lcd })
 *   scene.add(gb.group); gb.update(dt); gb.tap('a'); gb.pick(ndc, camera) -> 'a' | 'b' | 'start' | 'up'... | 'screen' | null
 *   gb.setTheme('dark' | 'light')
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { L } from './layout.js'
import { makePcbTextures, makeLetterTexture, makeDiffuser, makeDpadMarks, makePrint, makeGlassWear } from './textures.js'
import { mergeColored, box, cylZ } from './parts.js'

const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')

// Theme looks for the frosted plastic. Dark: milky, bright soft edge scatter. Light (cream paper): a darker smoke with
// more body so it does not vanish into the page, and edges that darken rather than glow.
const LOOKS = {
  dark: { color: 0x9ba2a9, face: 0.24, edge: 0.94, back: 0.5, scatter: 0xdde7ef, scatterK: 0.42, diffuser: 0.75, diffuserColor: 0xd2d8de },
  light: { color: 0x8f969e, face: 0.5, edge: 0.95, back: 0.6, scatter: 0x3a3f46, scatterK: -0.18, diffuser: 0.8, diffuserColor: 0xb8bec6 },
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
      color, roughness: rough, metalness: 0, clearcoat: 0.22, clearcoatRoughness: 0.42, transparent: true,
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
    btn_a: plastic(0xe0412f, 0.48, { clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.3, sheenColor: 0xff9a80 }),
    btn_b: plastic(0xe0412f, 0.48, { clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.3, sheenColor: 0xff9a80 }),
    start: plastic(0x1fa6d6, 0.22, { clearcoat: 0.9, clearcoatRoughness: 0.12, emissive: 0x0a6f95, emissiveIntensity: 0.25 }),
    port: plastic(0x16171a, 0.45, { metalness: 0.4 }),
    speaker: plastic(0xffffff, 0.34, { vertexColors: true, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    screws: plastic(0x2c2e33, 0.5),
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

  for (const [name, m] of Object.entries(mats)) if (nodes[name]) nodes[name].material = m
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false })

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
  const pcbMat = new THREE.MeshBasicMaterial({ map: pcbTex.map })
  const pcb = new THREE.Mesh(pcbGeo, pcbMat)
  pcb.position.set(0, L.pcb.y, L.pcb.z)
  group.add(pcb)
  const zc = L.pcb.z + 0.003
  const parts = [
    box(THREE, chips[0].w, chips[0].h, 0.05, chips[0].x, chips[0].y, zc + 0.025, '#141518'),
    box(THREE, chips[1].w, chips[1].h, 0.11, chips[1].x, chips[1].y, zc + 0.055, '#0b0c0d'),
    box(THREE, 0.3, 0.05, 0.03, chips[1].x, chips[1].y + chips[1].h / 2 + 0.04, zc + 0.015, '#0e0f11'),
    // round standoffs under the screw pits
    ...L.holes.map((h) => cylZ(THREE, 0.05, 0.2, h.x, h.y, zc + 0.1, '#25272b', 16)),
    // a few SMD caps
    ...[[-0.3, -1.18], [0.2, -0.62], [-0.22, -0.5], [0.66, -0.98], [-0.42, -1.48]].map(([x, y]) => box(THREE, 0.08, 0.05, 0.04, x, y, zc + 0.02, '#4a4740')),
  ]
  const partMesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.5 * envIntensity }))
  group.add(partMesh)
  track.push(pcbGeo, pcbMat, pcbTex.map, partMesh.geometry, partMesh.material)

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
  if (nodes.dpad) {
    const tex = makeDpadMarks(THREE, L.dpad.span, L.dpad.arm)
    const geo = new THREE.PlaneGeometry(L.dpad.span, L.dpad.span)
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    const m = new THREE.Mesh(geo, mat)
    m.position.set(0, 0, 0.0865)
    m.renderOrder = 5
    nodes.dpad.add(m)
    track.push(tex, geo, mat)
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
  }
  setTheme(theme)

  // ------------------------------------------------------------------ interaction
  const press = { a: 0, b: 0, start: 0, up: 0, down: 0, left: 0, right: 0 }
  const rest = {}
  for (const n of ['dpad', 'btn_a', 'btn_b', 'start']) rest[n] = nodes[n]?.position.clone()
  const pickables = ['btn_a', 'btn_b', 'start', 'dpad', 'screen', 'bezel'].map((n) => nodes[n]).filter(Boolean)
  const ray = new THREE.Raycaster()
  const tmp = new THREE.Vector3()

  const api = {
    group, nodes, mats, lcd, texture: screenTex, press, interactive: false, setTheme,
    /** Which control is under the raycaster, or null. D-pad returns its direction. */
    pick(ndc, camera) {
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(pickables, false)[0]
      if (!hit) return null
      const n = hit.object.name
      if (n === 'btn_a') return 'a'
      if (n === 'btn_b') return 'b'
      if (n === 'start') return 'start'
      if (n === 'screen' || n === 'bezel') return 'screen'
      if (n === 'dpad') {
        hit.object.worldToLocal(tmp.copy(hit.point))
        const dx = tmp.x
        const dy = tmp.y
        return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'up' : 'down'
      }
      return null
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
