/**
 * "Harvest Surprise": a satellite passes over three reservoirs, their water pours down canals into a valley of
 * rectangular rice paddies, the paddies flood and light up, then green rice rises in a wave. Scene module for
 * shared/gl/harness.js. Everything fits inside progress 0..1 (the page maps that to ONE viewport of scroll).
 *
 *   createScene({ THREE, renderer, size, look: 'full' | 'lcd', theme: 'dark' | 'light', palette })
 *     look 'full' -> straight to the canvas; HUD gauges + labels are drawn in-scene
 *     look 'lcd'  -> renders through shared/dither/pass.js into the `target` it is handed (160x144, 4 shades)
 *     theme       -> default document.documentElement.dataset.theme; live: scene.setTheme('dark' | 'light')
 *
 * Camera is nearly still: one high oblique view with a slow drift. The view is shifted with camera.setViewOffset so the
 * action sits in the right ~60% of a wide stage (project text over the left) and in the top ~55% of a tall one.
 * Every pixel is a pure function of ctx.p / ctx.time / pointer; there is no state that lags the scroll.
 *
 * Story (progress):  0.00-0.25 satellite passes, reservoirs light up   0.25-0.55 water pours into the paddies
 *                    0.55-0.90 rice grows in a wave                     0.90-1.00 settle on 3 reservoirs + rice acreage
 */
import { createDitherPass, LCD_PALETTES } from '../../dither/pass.js'
import { BOX, LAKES, buildHeightmap, buildNetwork, buildPaddies, MAIN_Z, heightAt, rng } from './world.js'
import * as S from './shaders.js'
import { makeSatellite, makeLabel, ribbonGeometry } from './parts.js'
import { HUD_VERT, HUD_FRAG } from './hud.js'

export const beats = [
  { at: 0, id: '01', title: 'Satellite', text: 'A satellite passes over three reservoirs.' },
  { at: 0.25, id: '02', title: 'Water', text: 'Reservoir water pours into the rice fields.' },
  { at: 0.55, id: '03', title: 'Rice', text: 'The fields fill and the rice grows.' },
  { at: 0.9, id: '04', title: 'Acreage', text: 'Three reservoirs and the rice acreage.' },
]

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

/** Everything that differs between the two looks. Colours are hex strings; amounts are plain numbers. */
const THEMES = {
  dark: {
    light: 0, stars: 1, fog: '#07100f', top: '#07100f', horizon: '#07100f', glow: '#000000',
    low: '#0b2220', mid: '#173a31', high: '#4d6e58', line: '#d8d1b4', idx: '#f3deaa', scan: '#f3deaa', dot: '#f3deaa',
    shade: [0.25, 1.05], lineAmt: [0.16, 0.2], idxAmt: [0.3, 0.3],
    shallow: '#6bf0d8', deep: '#11909a', water: '#25c0b8', dull: '#0a2224', edge: '#f3deaa', head: '#f3deaa', core: '#ffffff',
    soil: '#3a2c20', levee: '#dcc99a', rice: '#86d23c', tip: '#12140a', flood: [0.55, 0.3], padGreen: 0.62, riceMul: [0.55, 1.25],
    swath: '#f3deaa', additive: true, motes: 0.55,
    hudFg: '#f3deaa', hudTeal: '#6bf0d8', hudGreen: '#86d23c', hudBg: '#02100f', hudBgA: 0.72, vig: 0.22,
    label: '#f3e7c4', labelAccent: '#5fe8d2', labelAccent2: '#f3deaa',
    sat: { gold: '#e9c06a', satDark: '#1a242c', accent: '#6bf0d8', panelBg: '#0d1440', panelGrid: '#6b8cff', panelFrame: '#f5b95a', panelEmissive: 0x16205c },
    hemi: [0xcdeee6, 0x0a1c1e, 1.6], sun: 3.2,
  },
  light: {
    light: 1, stars: 0, fog: '#e8e6db', top: '#e8e6db', horizon: '#e8e6db', glow: '#000000',
    low: '#e8e6db', mid: '#e8e6db', high: '#e6e3d7', line: '#131312', idx: '#131312', scan: '#c8372d', dot: '#131312',
    shade: [0.7, 0.62], lineAmt: [0.5, 0], idxAmt: [0.85, 0],
    shallow: '#7cc2da', deep: '#2a7f9e', water: '#3590ad', dull: '#d8dacd', edge: '#164a60', head: '#bfe6f2', core: '#cdeef8',
    soil: '#d8cca8', levee: '#131312', rice: '#5db83a', tip: '#0b1400', flood: [0.86, 0.1], padGreen: 0.9, riceMul: [0.72, 1.06],
    swath: '#c8372d', additive: false, motes: 0,
    hudFg: '#131312', hudTeal: '#2a7f9e', hudGreen: '#3f9e2f', hudBg: '#e8e6db', hudBgA: 0.78, vig: 0,
    label: '#131312', labelAccent: '#0a7a3d', labelAccent2: '#c8372d',
    sat: { gold: '#2a2a27', satDark: '#c8372d', accent: '#c8372d', panelBg: '#30312e', panelGrid: '#8f8e83', panelFrame: '#c8372d', panelEmissive: 0x000000 },
    hemi: [0xffffff, 0xd6d2c2, 1.2], sun: 1.7,
  },
}

const ELEV = (56 * Math.PI) / 180
const SAT_S = 2.0, SAT_Y = 15, SAT_Z = -21
const SAT_X0 = -66, SAT_X1 = 70

/** `?harvest=chart|plates|ridge|bars2d` swap in a data-field variant (shared/scenes/harvest/variants.js). Default and look 'lcd' are untouched. */
export async function createScene(opts = {}) {
  // chart is the default; ?harvest=classic gives the original scene
  const asked = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('harvest')
  const v = opts.look === 'lcd' || typeof location === 'undefined' || asked === 'classic' ? null : asked ?? 'chart'
  if (v === 'chart' || v === 'plates' || v === 'ridge' || v === 'bars2d') return (await import('./variants.js')).createVariantScene({ ...opts, mode: v, beats })
  return createDefaultScene(opts)
}

async function createDefaultScene({ THREE, renderer, size, look = 'full', palette, theme } = {}) {
  const lcd = look === 'lcd'
  const disposables = []
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 10, 1600)
  scene.add(camera)
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const V = (v) => ({ value: v })
  let themeName = lcd ? 'dark' : (theme ?? (typeof document !== 'undefined' ? document.documentElement.dataset.theme : null) ?? 'dark')
  if (themeName !== 'light') themeName = 'dark'
  let T = THEMES[themeName]

  // ------------------------------------------------------------------ world data
  const hm = buildHeightmap(448, THREE.DataUtils.toHalfFloat)
  const heightTex = new THREE.DataTexture(hm.data, hm.w, hm.h, THREE.RGBAFormat, THREE.HalfFloatType)
  heightTex.minFilter = THREE.LinearFilter
  heightTex.magFilter = THREE.LinearFilter
  heightTex.generateMipmaps = false
  heightTex.needsUpdate = true
  disposables.push(heightTex)

  const net = buildNetwork()
  const { paddies, feederX, zBot } = buildPaddies(net.dMain)
  const distMax = Math.max(...paddies.map((q) => q.dist))

  // ------------------------------------------------------------------ shared uniforms (theme fills the colours)
  const col = () => V(new THREE.Color())
  const U = {
    uTime: V(0), uLight: V(0), uFogColor: col(), uFogDensity: V(0.001),
    uHeight: V(heightTex), uBox: V(new THREE.Vector4(BOX.x0, BOX.z0, BOX.w, BOX.d)), uTexel: V(new THREE.Vector2(1 / hm.w, 1 / hm.h)),
    cLow: col(), cMid: col(), cHigh: col(), cLine: col(), cIdx: col(), cScan: col(), cDot: col(),
    uShade: V(new THREE.Vector2()), uLineAmt: V(new THREE.Vector2()), uIdxAmt: V(new THREE.Vector2()),
    uSwX: V(-999), uSwZ0: V(-42), uSwZ1: V(-6), uScanOn: V(1), uLineW: V(lcd ? 2.2 : 1), uLcd: V(lcd ? 1 : 0), uPx: V(1), uContour: V(lcd ? 2.8 : 1.7),
    uLevel: V(0), uLake: V(0), uHover: V(0), uDetX: V(-999), uBand: V(12), uCell: V(1.15), uLevelRef: V(0),
    cShallow: col(), cDeep: col(), cWater: col(), cEdge: col(), cDull: col(), cHead: col(), cCore: col(),
    uFront: V(0), uFlowOn: V(1), uGrow: V(0), uDistMax: V(distMax), uRowH: V(1.9), uFlood: V(new THREE.Vector2()), uPadGreen: V(0.6),
    cSoil: col(), cRice: col(), cLevee: col(), cTip: col(), uRiceMul: V(new THREE.Vector2()),
  }
  const mat = (vertexShader, fragmentShader, extra = {}, opts = {}) => {
    const m = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { ...U, ...extra }, ...opts })
    disposables.push(m)
    return m
  }

  // ------------------------------------------------------------------ sky (a flat field of the ground colour)
  const skyU = { cTop: col(), cHorizon: col(), cGlow: col(), uStars: V(0) }
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 14),
    mat(S.SKY_VERT, S.SKY_FRAG, skyU, { side: THREE.BackSide, depthWrite: false, depthFunc: THREE.LessEqualDepth }),
  )
  sky.renderOrder = -10
  sky.frustumCulled = false
  scene.add(sky)
  disposables.push(sky.geometry)

  // ------------------------------------------------------------------ terrain
  const tGeo = new THREE.PlaneGeometry(BOX.w, BOX.d, 224, 168)
  tGeo.rotateX(-Math.PI / 2)
  tGeo.translate(0, 0, BOX.z0 + BOX.d / 2)
  const terrain = new THREE.Mesh(tGeo, mat(S.TERRAIN_VERT, S.TERRAIN_FRAG))
  terrain.frustumCulled = false
  scene.add(terrain)
  disposables.push(tGeo)

  // ------------------------------------------------------------------ reservoirs
  const lakes = LAKES.map((L, k) => {
    const side = Math.max(L.r[0], L.r[1]) * 3.6
    const geo = new THREE.PlaneGeometry(side, side)
    geo.rotateX(-Math.PI / 2)
    const uniforms = { uLevel: V(L.level), uLake: V(k), uHover: V(0) }
    const m = mat(S.WATER_VERT, S.WATER_FRAG, uniforms, { transparent: true, depthWrite: false })
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(L.c[0], L.level, L.c[1])
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    scene.add(mesh)
    disposables.push(geo)
    return { k, mesh, uniforms, hover: 0 }
  })

  // ------------------------------------------------------------------ canals + paddies + rice
  const tm = new THREE.Matrix4()
  const ribbons = net.canals.map((c) => ({ pts: c.pts, d: c.d, width: 1.15 }))
  {
    const pts = [], d = []
    for (let x = -47; x <= 47.01; x += 2) { pts.push([x, heightAt(x, MAIN_Z) + 0.22, MAIN_Z]); d.push(net.dMain(x)) }
    ribbons.push({ pts, d, width: 1.45 })
    for (const fx of feederX) {
      const fp = [], fd = []
      for (let z = MAIN_Z; z <= zBot + 0.01; z += 2) { fp.push([fx, heightAt(fx, z) + 0.2, z]); fd.push(net.dMain(fx) + (z - MAIN_Z)) }
      ribbons.push({ pts: fp, d: fd, width: 0.72 })
    }
  }
  const flowGeo = ribbonGeometry(THREE, ribbons)
  const flow = new THREE.Mesh(flowGeo, mat(S.FLOW_VERT, S.FLOW_FRAG, {}, { transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }))
  flow.frustumCulled = false
  flow.renderOrder = 3
  scene.add(flow)
  disposables.push(flowGeo)

  const pGeo = new THREE.BoxGeometry(1, 1, 1)
  pGeo.translate(0, 0.5, 0)
  const paddyMesh = new THREE.InstancedMesh(pGeo, mat(S.PADDY_VERT, S.PADDY_FRAG), paddies.length)
  const pDist = new Float32Array(paddies.length), pSeed = new Float32Array(paddies.length)
  const rowList = []
  const rnd = rng(91)
  paddies.forEach((q, i) => {
    const gy = heightAt(q.cx, q.cz)
    tm.makeScale(q.w, 0.26, q.d).setPosition(q.cx, gy, q.cz)
    paddyMesh.setMatrixAt(i, tm)
    pDist[i] = q.dist
    pSeed[i] = q.seed
    const n = Math.max(2, Math.floor(q.d / 1.1))
    for (let r = 0; r < n; r += 1) rowList.push({ x: q.cx, y: gy + 0.24, z: q.cz - q.d / 2 + ((r + 0.5) / n) * q.d, w: q.w * 0.9, dist: q.dist, seed: rnd() })
  })
  pGeo.setAttribute('aDist', new THREE.InstancedBufferAttribute(pDist, 1))
  pGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(pSeed, 1))
  paddyMesh.frustumCulled = false
  scene.add(paddyMesh)
  disposables.push(pGeo)

  // rice row: a sawtooth of small pyramids, y 0..1
  const TEETH = 12
  const rp = []
  for (let t = 0; t < TEETH; t += 1) {
    const x0 = -0.5 + t / TEETH, x1 = x0 + 1 / TEETH, xm = (x0 + x1) / 2
    const A = [x0, 0, -0.5], B = [x1, 0, -0.5], Cc = [x1, 0, 0.5], D = [x0, 0, 0.5], Tp = [xm, 1, 0]
    for (const tri of [[A, B, Tp], [B, Cc, Tp], [Cc, D, Tp], [D, A, Tp]]) rp.push(...tri.flat())
  }
  const rGeo = new THREE.BufferGeometry()
  rGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rp), 3))
  const riceMesh = new THREE.InstancedMesh(rGeo, mat(S.RICE_VERT, S.RICE_FRAG, {}, { side: THREE.DoubleSide }), rowList.length)
  const rDist = new Float32Array(rowList.length), rSeed = new Float32Array(rowList.length)
  rowList.forEach((r, i) => {
    tm.makeScale(r.w, 1, 0.55).setPosition(r.x, r.y, r.z)
    riceMesh.setMatrixAt(i, tm)
    rDist[i] = r.dist
    rSeed[i] = r.seed
  })
  rGeo.setAttribute('aDist', new THREE.InstancedBufferAttribute(rDist, 1))
  rGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(rSeed, 1))
  riceMesh.frustumCulled = false
  scene.add(riceMesh)
  disposables.push(rGeo)

  // ------------------------------------------------------------------ satellite + swath curtain
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff1d0, 3)
  sun.position.set(-30, 60, 40)
  scene.add(sun)
  const sat = makeSatellite(THREE, T.sat, disposables)
  sat.group.scale.setScalar(SAT_S)
  scene.add(sat.group)
  const swPos = new Float32Array(9)
  const swGeo = new THREE.BufferGeometry()
  swGeo.setAttribute('position', new THREE.BufferAttribute(swPos, 3))
  swGeo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array([0, 1, 1]), 1))
  const swath = new THREE.Mesh(swGeo, new THREE.ShaderMaterial({
    vertexShader: S.SWATH_VERT, fragmentShader: S.SWATH_FRAG, uniforms: { cAccent: col(), uOpacity: V(1) },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }))
  disposables.push(swath.material)
  swath.frustumCulled = false
  swath.renderOrder = 4
  scene.add(swath)
  disposables.push(swGeo)

  // ------------------------------------------------------------------ motes (dark look only)
  let motes = null
  if (!lcd) {
    const N = 420, r = rng(5)
    const pos = new Float32Array(N * 3), seed = new Float32Array(N * 3)
    for (let i = 0; i < N; i += 1) {
      pos.set([BOX.x0 + r() * BOX.w, r() * 40, BOX.z0 + r() * BOX.d], i * 3)
      seed.set([r(), r(), r()], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3))
    motes = new THREE.Points(g, mat(S.PART_VERT, S.PART_FRAG, { uSize: V(2.2), uBoxMin: V(new THREE.Vector3(BOX.x0, 0, BOX.z0)), uBoxSize: V(new THREE.Vector3(BOX.w, 40, BOX.d)), cA: col(), cB: col(), uOpacity: V(0.55) }, { transparent: true, depthWrite: false }))
    motes.frustumCulled = false
    motes.renderOrder = 5
    scene.add(motes)
    disposables.push(g)
  }

  // ------------------------------------------------------------------ HUD quad + labels (overlay scene in screen units)
  const hudU = {
    uAspect: V(1), uTime: V(0), uLcd: V(lcd ? 1 : 0), uFrame: V(1), uPtrOn: V(1), uHover: V(0), uPx: V(1), uVig: V(0),
    uPanelOn: V(0), uRet: V(1), uFlood: V(0), uAcre: V(0), uBgA: V(0.7), uLevels: V(new THREE.Vector3(0.9, 0.8, 0.85)),
    uPtr: V(new THREE.Vector2()), uFocus: V(new THREE.Vector2()), uPanel: V(new THREE.Vector4(0.5, -0.7, 0.5, 0.13)), uFrameRect: V(new THREE.Vector4(0, 0, 1, 1)),
    cFg: col(), cTeal: col(), cGreen: col(), cBg: col(),
  }
  const hudMat = new THREE.ShaderMaterial({ vertexShader: HUD_VERT, fragmentShader: HUD_FRAG, uniforms: hudU, transparent: true, depthTest: false, depthWrite: false })
  const hudQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), hudMat)
  hudQuad.frustumCulled = false
  hudQuad.renderOrder = 900
  scene.add(hudQuad)
  disposables.push(hudQuad.geometry, hudMat)

  const overlay = new THREE.Scene()
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10)
  const labels = {}
  const labelKinds = {}
  if (!lcd) {
    const mk = (id, text, parent, kind = 1, centered = false) => {
      const l = makeLabel(THREE, text, { color: T.label, accent: kind === 2 ? T.labelAccent2 : T.labelAccent, disposables })
      l.sprite.material.depthTest = false
      l.sprite.renderOrder = 1000
      l.sprite.visible = false
      if (centered) l.sprite.center.set(0.5, 0.5)
      parent.add(l.sprite)
      labels[id] = l
      labelKinds[id] = kind
    }
    mk('sat', 'SATELLITE', scene, 2)
    mk('s2', 'SENTINEL-2', scene, 2)
    for (let k = 0; k < 3; k += 1) mk(`lake${k}`, 'RESERVOIR', scene, 1, true)
    mk('three', '3 RESERVOIRS', scene, 1, true)
    mk('rice', 'RICE', scene)
    mk('level', 'WATER LEVEL', overlay)
    mk('acre', 'ACREAGE', overlay)
  }
  const placeWorld = (l, x, y, z, a, f = 0.04) => {
    f *= lay.ls
    const s = l.sprite
    s.visible = a > 0.02
    if (!s.visible) return
    s.material.opacity = a
    s.position.set(x, y, z)
    const d = camera.position.distanceTo(s.position)
    const h = f * 2 * d * tanH
    s.scale.set(h * l.aspect, h, 1)
  }
  const placeHud = (l, x, y, a, f = 0.03) => {
    f *= lay.ls
    const s = l.sprite
    s.visible = a > 0.02
    if (!s.visible) return
    s.material.opacity = a
    s.position.set(x, y, 0)
    s.scale.set(f * 2 * l.aspect, f * 2, 1)
  }

  const pass = lcd ? createDitherPass(THREE, { width: 160, height: 144, palette: palette ?? LCD_PALETTES.dmg, contrast: 1.8, bias: -0.1 }) : null

  // ------------------------------------------------------------------ theme
  function setTheme(name) {
    themeName = name === 'light' && !lcd ? 'light' : 'dark'
    T = THEMES[themeName]
    const k = lcd ? { mid: 0.85, high: 0.75, line: 0.8 } : {}
    U.uLight.value = T.light
    U.uFogColor.value.set(T.fog)
    U.cLow.value.set(T.low)
    U.cMid.value.set(T.mid).multiplyScalar(k.mid ?? 1)
    U.cHigh.value.set(T.high).multiplyScalar(k.high ?? 1)
    U.cLine.value.set(T.line).multiplyScalar(k.line ?? 1)
    U.cIdx.value.set(T.idx)
    U.cScan.value.set(T.scan)
    U.cDot.value.set(T.dot)
    U.uShade.value.set(...T.shade)
    U.uLineAmt.value.set(...T.lineAmt)
    U.uIdxAmt.value.set(...T.idxAmt)
    U.cShallow.value.set(T.shallow)
    U.cDeep.value.set(T.deep)
    U.cWater.value.set(T.water)
    U.cDull.value.set(T.dull)
    U.cEdge.value.set(T.edge)
    U.cHead.value.set(T.head)
    U.cCore.value.set(T.core)
    U.uFlood.value.set(...T.flood)
    U.uPadGreen.value = T.padGreen
    U.cSoil.value.set(T.soil)
    U.cRice.value.set(T.rice)
    U.cLevee.value.set(T.levee)
    U.cTip.value.set(T.tip)
    U.uRiceMul.value.set(...T.riceMul)
    skyU.cTop.value.set(T.top)
    skyU.cHorizon.value.set(T.horizon)
    skyU.cGlow.value.set(T.glow).multiplyScalar(lcd ? 0.75 : 1)
    skyU.uStars.value = lcd ? 0 : T.stars
    swath.material.uniforms.cAccent.value.set(T.swath)
    swath.material.blending = T.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    swath.material.needsUpdate = true
    hemi.color.set(T.hemi[0])
    hemi.groundColor.set(T.hemi[1])
    hemi.intensity = T.hemi[2]
    sun.intensity = T.sun
    sat.setLook(T.sat)
    if (motes) {
      motes.material.uniforms.cA.value.set('#f3deaa')
      motes.material.uniforms.cB.value.set('#6bf0d8')
      motes.visible = T.motes > 0
    }
    hudU.cFg.value.set(T.hudFg)
    hudU.cTeal.value.set(T.hudTeal)
    hudU.cGreen.value.set(T.hudGreen)
    hudU.cBg.value.set(T.hudBg)
    hudU.uBgA.value = T.hudBgA
    hudU.uVig.value = lcd ? 0 : T.vig
    for (const id of Object.keys(labels)) labels[id].setColors(T.label, labelKinds[id] === 2 ? T.labelAccent2 : T.labelAccent)
  }

  // ------------------------------------------------------------------ view: layout of the stage, camera fit
  const view = { w: lcd ? 160 : 1, h: lcd ? 144 : 1, aspect: lcd ? 160 / 144 : 1, dpr: 1 }
  const lay = { D: 150, fx: 0, fy: 0, fhw: 1, fhh: 1, ls: 1 }
  const st = { ptr: new THREE.Vector2() }
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -3.2)
  const hit = new THREE.Vector3()
  const pos = new THREE.Vector3(), tgt = new THREE.Vector3()

  function resize(w, h, dpr = 1) {
    if (lcd) { view.w = 160; view.h = 144; view.aspect = 160 / 144; view.dpr = 1 } else { view.w = w; view.h = h; view.aspect = w / h; view.dpr = dpr }
    const a = view.aspect
    // m = 1 on wide stages (text left, action right), 0 on tall ones (action on top, text below)
    const m = lcd ? 0.5 : smooth(0.85, 1.2, a)
    // focal region in screen fractions: centre (cx, cy), size (fw, fh)
    const cx = lcd ? 0.5 : lerp(0.5, 0.67, m)
    const cy = lcd ? 0.5 : lerp(0.235, 0.415, m)
    const fw = lcd ? 1 : lerp(1, 0.64, m)
    const fh = lcd ? 1 : lerp(0.44, 0.86, m)
    const Wc = lcd ? 62 : 100 / 0.92
    const Hc = (lcd ? 70 : 86) * Math.sin(ELEV) + 8 * Math.cos(ELEV)
    lay.ls = lcd ? 1 : lerp(0.62, 1, m)
    hudU.uRet.value = lay.ls
    lay.D = Math.max(Wc / (2 * tanH * a * fw), Hc / (2 * tanH * fh))
    camera.aspect = a
    if (lcd) camera.clearViewOffset()
    else camera.setViewOffset(view.w, view.h, (0.5 - cx) * view.w, (0.5 - cy) * view.h, view.w, view.h)
    camera.updateProjectionMatrix()
    // HUD rects in shader units (x -aspect..aspect, y -1..1 up)
    lay.fx = (2 * cx - 1) * a
    lay.fy = 1 - 2 * cy
    const fl = lerp(0.03, 0.42, m), fr = lerp(0.97, 0.985, m), ft = lerp(0.02, 0.04, m), fb = lerp(0.53, 0.96, m)
    const l = (2 * fl - 1) * a, r = (2 * fr - 1) * a, t = 1 - 2 * ft, b = 1 - 2 * fb
    hudU.uFrameRect.value.set((l + r) / 2, (t + b) / 2, (r - l) / 2, (t - b) / 2)
    lay.fhw = (r - l) / 2
    lay.fhh = (t - b) / 2
    const kp = Math.min(1, (r - l - 0.1) / 1.0)
    hudU.uPanel.value.set(r - 0.04 - 0.5 * kp, b + 0.045 + 0.13 * kp, 0.5 * kp, 0.13 * kp)
    hudU.uFocus.value.set(lay.fx, lay.fy)
    ortho.left = -a; ortho.right = a; ortho.top = 1; ortho.bottom = -1
    ortho.updateProjectionMatrix()
    U.uPx.value = view.dpr
    hudU.uAspect.value = a
    hudU.uPx.value = view.dpr
  }

  const lakeBase = LAKES.map((L) => L.level)

  function update(ctx) {
    const reduced = ctx.reduced
    const p = reduced ? 1 : clamp(ctx.p, 0, 1)
    const time = reduced ? 6 : ctx.time
    const aspect = view.aspect
    const px = reduced ? 0 : ctx.pointer.sx
    const py = reduced ? 0 : ctx.pointer.sy
    U.uTime.value = time
    hudU.uTime.value = time

    // ---- story drivers
    const pour = 1 - (1 - clamp((p - 0.25) / 0.3, 0, 1)) ** 1.8
    const grow = smooth(0.55, 0.9, p)
    const settle = smooth(0.92, 0.98, p)
    U.uFront.value = pour * (distMax + 16)
    U.uGrow.value = grow
    hudU.uFlood.value = pour
    hudU.uAcre.value = grow

    // reservoirs: levels sink a little as the water leaves, then pulse once in the settle
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.4)
    lakes.forEach((lk) => {
      const drop = 0.62 * smooth(0.25 + lk.k * 0.02, 0.55, p)
      const lv = lakeBase[lk.k] - drop
      lk.mesh.position.y = lv
      lk.uniforms.uLevel.value = lv
    })
    const lv = hudU.uLevels.value
    lv.set(0.9 - 0.5 * smooth(0.25, 0.55, p), 0.82 - 0.46 * smooth(0.27, 0.55, p), 0.94 - 0.52 * smooth(0.29, 0.55, p))

    // satellite sweep
    const sweepT = clamp(p / 0.25, 0, 1)
    const satX = reduced ? 200 : lerp(SAT_X0, SAT_X1, sweepT)
    U.uSwX.value = satX
    U.uDetX.value = reduced ? 999 : satX
    U.uScanOn.value = 1 - smooth(0.2, 0.26, p)
    const bob = Math.sin(time * 0.6) * 0.3
    sat.group.position.set(satX, SAT_Y + bob, SAT_Z)
    sat.group.visible = satX < SAT_X1 - 2
    swPos.set([satX, SAT_Y - 0.6 * SAT_S + bob, SAT_Z, satX, 2.2, U.uSwZ0.value, satX, 2.2, U.uSwZ1.value])
    swGeo.attributes.position.needsUpdate = true
    swath.visible = sat.group.visible
    swath.material.uniforms.uOpacity.value = (1 - smooth(0.2, 0.26, p)) * (T.additive ? 1 : 0.8)

    // ---- camera: one high oblique view, a slow drift and a touch of pointer parallax
    const D = lay.D * (1.025 - 0.035 * p)
    let yaw = (p - 0.5) * 0.05 - px * 0.025 + Math.sin(time * 0.07) * 0.006
    const elev = ELEV - py * 0.02
    if (lcd) tgt.set(lerp(-12, 12, smooth(0, 0.3, p)), 0, lerp(-8, 14, smooth(0.3, 0.6, p)))
    else tgt.set((p - 0.5) * 3, 0, 5)
    pos.set(Math.sin(yaw) * Math.cos(elev) * D, Math.sin(elev) * D, Math.cos(yaw) * Math.cos(elev) * D).add(tgt)
    camera.position.copy(pos)
    camera.lookAt(tgt)
    camera.updateMatrixWorld()
    sky.position.copy(camera.position)
    U.uFogDensity.value = 0.18 / D

    // ---- reticle: pointer when active, otherwise a slow idle scan inside the focal frame
    const active = ctx.pointer.inside || Math.abs(px) + Math.abs(py) > 0.01
    const fx = lay.fx, fy = lay.fy
    if (active) st.ptr.set(px * aspect, py)
    else st.ptr.set(fx + Math.sin(time * 0.31) * 0.5 * lay.fhw, fy + Math.sin(time * 0.47 + 1) * 0.4 * lay.fhh)
    if (reduced) st.ptr.set(fx + 0.2 * lay.fhw, fy - 0.1 * lay.fhh)
    hudU.uPtr.value.copy(st.ptr)
    ndc.set(st.ptr.x / aspect, st.ptr.y)
    ray.setFromCamera(ndc, camera)
    let nearest = -1, nd = 9
    if (ray.ray.intersectPlane(plane, hit)) {
      for (let kk = 0; kk < 3; kk += 1) {
        const L = LAKES[kk]
        const d = Math.hypot(hit.x - L.c[0], (hit.z - L.c[1]) * 1.2) / Math.max(L.r[0], L.r[1])
        if (d < nd) { nd = d; nearest = kk }
      }
    }
    const dk = reduced ? 1 : 1 - Math.exp(-9 * Math.min(ctx.dt || 0.016, 0.05))
    let hv = 0
    for (const lk of lakes) {
      const target = lk.k === nearest && nd < 1.2 ? 1 : 0
      lk.hover += (target - lk.hover) * dk
      const shown = Math.max(lk.hover, settle * (0.35 + 0.35 * pulse))
      lk.uniforms.uHover.value = shown
      hv = Math.max(hv, lk.hover)
    }
    hudU.uHover.value = hv
    hudU.uPtrOn.value = reduced ? 0.7 : 1

    // ---- HUD
    hudU.uFrame.value = 0.55 + 0.3 * (1 - smooth(0.25, 0.4, p))
    hudU.uPanelOn.value = lcd ? 0 : smooth(0.1, 0.18, p)

    if (!lcd) {
      const pv = hudU.uPanel.value
      const k = pv.z / 0.5
      const labA = smooth(0.1, 0.18, p)
      placeHud(labels.level, pv.x - 0.46 * k, pv.y + pv.w + 0.04 * k + 0.012, labA, 0.028 * Math.max(k, 0.8))
      placeHud(labels.acre, pv.x - 0.12 * k, pv.y + pv.w + 0.04 * k + 0.012, labA, 0.028 * Math.max(k, 0.8))
      const sa = sat.group.visible ? smooth(0.0, 0.03, p) * (1 - smooth(0.17, 0.24, p)) : 0
      const sep = (0.055 * lay.ls * 2 * lay.D * tanH) / Math.sin(ELEV)
      placeWorld(labels.sat, satX + 4, SAT_Y - 2, SAT_Z + 15, reduced ? 0 : sa)
      placeWorld(labels.s2, satX + 4, SAT_Y - 2, SAT_Z + 15 + sep, reduced ? 0 : sa)
      LAKES.forEach((L, kk) => {
        const seen = reduced ? 1 : smooth(L.c[0] - 8, L.c[0] + 2, satX)
        const a = seen * (1 - smooth(0.88, 0.92, p)) * (0.85 + 0.15 * lakes[kk].hover)
        placeWorld(labels[`lake${kk}`], L.c[0], 5, L.c[1] - L.r[1] - 4, Math.min(1, a))
      })
      placeWorld(labels.three, LAKES[1].c[0], 5, LAKES[1].c[1] - LAKES[1].r[1] - 5, settle)
      placeWorld(labels.rice, 8, 3, 6.5, smooth(0.56, 0.66, p))
    }
    if (motes) motes.material.uniforms.uOpacity.value = T.motes * (1 - smooth(0.55, 0.7, p) * 0.4)
  }

  function render(rend, ctx, target) {
    if (lcd) { pass.render(rend, scene, camera, target ?? null); return }
    rend.setRenderTarget(target ?? null)
    rend.render(scene, camera)
    const ac = rend.autoClear
    rend.autoClear = false
    rend.render(overlay, ortho)
    rend.autoClear = ac
  }

  function dispose() {
    pass?.dispose()
    for (const d of disposables) d.dispose?.()
    scene.traverse((o) => { o.geometry?.dispose?.() })
    overlay.traverse((o) => { o.geometry?.dispose?.() })
  }

  setTheme(themeName)
  if (size && size.w > 1) resize(size.w, size.h, size.dpr)
  else resize(lcd ? 160 : 1280, lcd ? 144 : 720, 1)

  return {
    scene,
    camera,
    animated: true,
    look,
    beats,
    get theme() { return themeName },
    setTheme,
    update,
    resize,
    render,
    dispose,
  }
}
