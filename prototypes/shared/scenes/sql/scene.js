/**
 * "Self-healing ribbon": a glowing, dithered ribbon (the query) flies low over a dark contour landscape inside a HUD
 * frame. It runs, hits a fault and splinters (red, shards, the ground glitches), a scan ring sweeps out from the break
 * pulling the shards back in, the ribbon knits together and turns green again, and a result panel settles in.
 * Scene module for shared/gl/harness.js. ONE scroll of progress 0..1 (the page pins the stage for 100vh).
 *
 *   createScene({ THREE, renderer, size, theme, textLeft, textBottom, layout, watchTheme })
 *     theme       'dark' | 'light' (default: document.documentElement.dataset.theme)
 *     textLeft    fraction of the stage width the page text covers on wide stages (default 0.4)
 *     textBottom  fraction of the stage height the page text covers on tall stages (default 0.45)
 *     layout      'auto' (tall when aspect < 0.95) | 'wide' | 'tall'
 *     watchTheme  follow the page's `themechange` event (default true)
 *   returned module: { scene, camera, animated, beats, update, resize, render, setTheme(theme), dispose }
 *
 * Every pixel is a pure function of ctx.p / ctx.time: nothing accumulates, so scrubbing backwards just works.
 * The camera uses setViewOffset so the action sits in the right 60% (wide) or top 55% (tall) of the stage.
 */
import { BOX, XF, HALF_W, pathZ, pathY, buildHeightmap, rng } from './world.js'
import { GROUND_VERT, GROUND_FRAG, RIBBON_VERT, RIBBON_FRAG, SHARD_VERT, SHARD_FRAG } from './shaders.js'
import { HUD_VERT, HUD_FRAG, makeLabel } from './hud.js'

export const beats = [
  { at: 0, id: '01', title: 'RUNNING', text: 'SQL' },
  { at: 0.27, id: '02', title: 'ERROR', text: 'FIRST ATTEMPT 9 / 10' },
  { at: 0.44, id: '03', title: 'SELF-HEALING', text: 'DIAGNOSE RETRY' },
  { at: 0.8, id: '04', title: 'CORRECT', text: 'AFTER SELF-HEALING 10 / 10' },
]

const THEMES = {
  dark: {
    bg: '#08080a', line: '#1fa85d', lineHot: '#39ff88', edge: '#39ff88', core: '#b8ffd2', red: '#ff4a3a', whiteRed: '#ff9a8a', glow: '#39ff88',
    frame: '#39ff88', panel: '#08080a', panelLine: '#39ff88', hudGreen: '#39ff88',
    text: '#c8ffe0', dim: '#4a9c6e', err: '#ff6455', panelText: '#d9ffe8', panelAccent: '#39ff88',
  },
  light: {
    bg: '#e8e6db', line: '#17402d', lineHot: '#0b6a3e', edge: '#0b6a3e', core: '#131312', red: '#d3392b', whiteRed: '#d3392b', glow: '#000000',
    frame: '#131312', panel: '#131312', panelLine: '#e8e6db', hudGreen: '#0b6a3e',
    text: '#131312', dim: '#6c6a60', err: '#d3392b', panelText: '#e8e6db', panelAccent: '#3fe08a',
  },
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const window3 = (a, b, c, d, v) => smooth(a, b, v) * (1 - smooth(c, d, v))

/** Everything the story drives, from progress alone. */
function story(p) {
  const g = clamp(p / 0.26, 0, 1)
  const F = lerp(-9.5, XF, g)
  const b = smooth(0.26, 0.34, p)
  const m = smooth(0.43, 0.78, p)
  const R = m > 0.0005 ? (m < 0.8 ? m * 16.25 : 13 + ((m - 0.8) / 0.2) * 15) : -2
  const s = clamp((R - 6) / 7, 0, 1)
  let base, spread
  if (p < 0.26) { base = F; spread = 0 } else if (R < 0) { base = XF - 4 * b; spread = 3.2 * b } else { base = XF - 4 + 11 * s; spread = 3.2 * (1 - s) }
  const noseW = p < 0.26 ? 1 : 1 - b * (1 - s)
  const xT = (p < 0.26 ? F : XF) - 18 + 7 * s
  const xE = p < 0.26 ? F : XF + 7 * s
  const retX = p < 0.26 ? F : XF + 7 * s
  const err = b * (1 - s)
  return {
    F, b, m, R, s, base, spread, noseW, xT, xE, retX, err,
    markA: smooth(0.04, 0.16, p),
    running: window3(0, 0.01, 0.255, 0.285, p) + (p < 0.01 ? 1 - smooth(0, 0.01, p) : 0),
    error: window3(0.255, 0.285, 0.42, 0.45, p),
    healing: window3(0.42, 0.45, 0.78, 0.81, p),
    correct: smooth(0.78, 0.81, p),
    tagA: window3(0.29, 0.34, 0.45, 0.51, p),
    panelA: smooth(0.8, 0.92, p),
    chips: [
      smooth(0.29, 0.31, p) * 0.5 + smooth(0.45, 0.47, p) * 0.5,
      smooth(0.45, 0.47, p) * 0.5 + smooth(0.68, 0.7, p) * 0.5,
      smooth(0.68, 0.7, p) * 0.5 + smooth(0.8, 0.82, p) * 0.5,
      smooth(0.8, 0.82, p) * 0.5 + smooth(0.9, 0.92, p) * 0.5,
    ],
  }
}

export async function createScene({ THREE, size, theme, textLeft = 0.4, textBottom = 0.45, layout = 'auto', watchTheme = true } = {}) {
  const disposables = []
  const track = (d) => { disposables.push(d); return d }
  const V = (v) => ({ value: v })
  const col = (hex) => new THREE.Color(hex)

  let themeName = theme === 'light' || theme === 'dark' ? theme : (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(THEMES[themeName].bg)
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 500)
  scene.add(camera)
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))

  // ------------------------------------------------------------------ shared uniforms
  const hm = buildHeightmap(512, THREE.DataUtils.toHalfFloat)
  const heightTex = track(new THREE.DataTexture(hm.data, hm.w, hm.h, THREE.RGBAFormat, THREE.HalfFloatType))
  heightTex.minFilter = THREE.LinearFilter
  heightTex.magFilter = THREE.LinearFilter
  heightTex.generateMipmaps = false
  heightTex.needsUpdate = true

  const X0 = XF - 17, X1 = XF + 7.6
  const U = {
    uTime: V(0), uPx: V(1), uDark: V(1), uB: V(0), uR: V(-2), uXf: V(XF), uBase: V(0), uSpread: V(0), uNoseW: V(1), uXT: V(0), uXE: V(0),
    uHealK: V(0), uMark: V(0), uGlow: V(1), uLineGain: V(1), uCoreMix: V(0.6),
    uHeight: V(heightTex), uBox: V(new THREE.Vector4(BOX.x0, BOX.z0, BOX.w, BOX.d)), uAmp: V(1.5), uStep: V(0.165), uFocus: V(new THREE.Vector2(2, -4)),
    uX0: V(X0), uX1: V(X1), uHalfW: V(HALF_W), uCore: V(0.5),
    cBg: V(col('#000')), cLine: V(col('#000')), cLineHot: V(col('#000')), cRed: V(col('#000')), cGlow: V(col('#000')),
    cEdge: V(col('#000')), cCore: V(col('#000')), cWhiteRed: V(col('#000')),
  }

  // ------------------------------------------------------------------ ground
  const gGeo = track(new THREE.PlaneGeometry(BOX.w, BOX.d, 200, 136))
  gGeo.rotateX(-Math.PI / 2)
  gGeo.translate(BOX.x0 + BOX.w / 2, 0, BOX.z0 + BOX.d / 2)
  const gMat = track(new THREE.ShaderMaterial({ vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, uniforms: U }))
  const ground = new THREE.Mesh(gGeo, gMat)
  ground.frustumCulled = false
  scene.add(ground)

  // ------------------------------------------------------------------ ribbon: 2 verts per slice, shaded and twisted on the GPU
  const SEG = 420
  const rPos = new Float32Array((SEG + 1) * 2 * 3)
  const rUV = new Float32Array((SEG + 1) * 2 * 2)
  const rIdx = []
  for (let i = 0; i <= SEG; i += 1) {
    const u = i / SEG
    rUV.set([u, -1, u, 1], i * 4)
    if (i < SEG) { const a = i * 2; rIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  }
  const rGeo = track(new THREE.BufferGeometry())
  rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3))
  rGeo.setAttribute('aUV', new THREE.BufferAttribute(rUV, 2))
  rGeo.setIndex(rIdx)
  const glowMat = (vertexShader, fragmentShader, extra = {}) => track(new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms: { ...U, ...extra }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }))
  const ribbonMat = glowMat(RIBBON_VERT, RIBBON_FRAG)
  const ribbon = new THREE.Mesh(rGeo, ribbonMat)
  ribbon.frustumCulled = false
  ribbon.renderOrder = 2
  scene.add(ribbon)

  // ------------------------------------------------------------------ shards: instanced quads whose motion is all in the vertex shader
  const N = 190
  const rnd = rng(11)
  const plane = new THREE.PlaneGeometry(1, 1)
  const sGeo = track(new THREE.InstancedBufferGeometry())
  sGeo.index = plane.index
  sGeo.setAttribute('position', plane.getAttribute('position'))
  sGeo.setAttribute('uv', plane.getAttribute('uv'))
  const home = new Float32Array(N * 4), rn = new Float32Array(N * 4)
  for (let i = 0; i < N; i += 1) {
    const r1 = rnd()
    home.set([XF - 7.2 + ((i + rnd() * 0.9) / N) * 14.2, rnd() * 2 - 1, 0.2 + r1 * r1 * 0.75, 0.05 + rnd() * 0.11], i * 4)
    rn.set([rnd(), rnd(), rnd(), rnd()], i * 4)
  }
  sGeo.setAttribute('aHome', new THREE.InstancedBufferAttribute(home, 4))
  sGeo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rn, 4))
  sGeo.instanceCount = N
  const shardMat = glowMat(SHARD_VERT, SHARD_FRAG)
  const shards = new THREE.Mesh(sGeo, shardMat)
  shards.frustumCulled = false
  shards.renderOrder = 3
  scene.add(shards)

  // ------------------------------------------------------------------ HUD overlay (own scene, ortho in -aspect..aspect x -1..1)
  const hudU = {
    uAspect: V(1), uTime: V(0), uPx: V(1), uFrame: V(0.9), uErr: V(0), uTagA: V(0), uPanelA: V(0), uPtrOn: V(1), uTagLit: V(9), uHeal: V(0),
    uPtr: V(new THREE.Vector2()), uTag: V(new THREE.Vector4()), uPanel: V(new THREE.Vector4()), uGaugeTag: V(new THREE.Vector4()), uGaugePanel: V(new THREE.Vector4()), uLead: V(new THREE.Vector4()),
    uChips: V([0, 1, 2, 3, 4].map(() => new THREE.Vector4())),
    cFrame: V(col('#000')), cGreen: V(col('#000')), cRed: V(col('#000')), cPanelFill: V(col('#000')), cPanelLine: V(col('#000')), cGauge: V(col('#000')),
  }
  const hudMat = track(new THREE.ShaderMaterial({ vertexShader: HUD_VERT, fragmentShader: HUD_FRAG, uniforms: hudU, transparent: true, depthTest: false, depthWrite: false }))
  const hudQuad = new THREE.Mesh(track(new THREE.PlaneGeometry(2, 2)), hudMat)
  hudQuad.frustumCulled = false
  hudQuad.renderOrder = 0
  const hudScene = new THREE.Scene()
  hudScene.add(hudQuad)
  const hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)

  const L = {}
  const mk = (id, text, o) => { L[id] = track(makeLabel(THREE, text, o)); hudScene.add(L[id].mesh) }
  mk('running', 'RUNNING', { px: 11 })
  mk('error', 'ERROR', { px: 11 })
  mk('healing', 'SELF-HEALING', { px: 11 })
  mk('correct', 'CORRECT', { px: 11 })
  mk('sql', 'SQL', { px: 10 })
  mk('diag', 'DIAGNOSE', { px: 9.5 })
  mk('retry', 'RETRY', { px: 9.5 })
  mk('safety', 'SAFETY CHECK', { px: 9.5 })
  mk('tests', '45 TESTS', { px: 9.5 })
  mk('first', 'FIRST ATTEMPT', { px: 9, spacing: 0.2 })
  mk('score9', '9 / 10', { px: 20, weight: 700, spacing: 0.06 })
  mk('score10', '10 / 10', { px: 34, weight: 700, spacing: 0.05 })
  mk('fix', 'CORRECT, AFTER SELF-HEALING', { px: 9.5, spacing: 0.14 })

  // ------------------------------------------------------------------ theme
  function applyTheme() {
    const T = THEMES[themeName]
    const dark = themeName === 'dark'
    scene.background.set(T.bg)
    U.uDark.value = dark ? 1 : 0
    U.uGlow.value = dark ? 1 : 0
    U.cBg.value.set(T.bg); U.cLine.value.set(T.line); U.cLineHot.value.set(T.lineHot); U.cRed.value.set(T.red); U.cGlow.value.set(T.glow)
    U.cEdge.value.set(T.edge); U.cCore.value.set(T.core); U.cWhiteRed.value.set(T.whiteRed)
    U.uLineGain.value = dark ? 1 : 2.1
    U.uCoreMix.value = dark ? 0.6 : 0.85
    for (const m of [ribbonMat, shardMat]) { m.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending; m.needsUpdate = true }
    hudU.cFrame.value.set(T.frame); hudU.cGreen.value.set(T.hudGreen); hudU.cRed.value.set(T.red)
    hudU.cGauge.value.set(T.panelAccent); hudU.cPanelFill.value.set(T.panel); hudU.cPanelLine.value.set(T.panelLine)
    hudU.uFrame.value = dark ? 0.8 : 0.7
  }
  applyTheme()
  function setTheme(next) {
    const t = next === 'light' ? 'light' : 'dark'
    if (t === themeName) return
    themeName = t
    applyTheme()
  }
  const onTheme = (event) => setTheme(event.detail)
  if (watchTheme && typeof document !== 'undefined') document.addEventListener('themechange', onTheme)

  // ------------------------------------------------------------------ layout
  const view = { w: 1280, h: 720, aspect: 16 / 9, dpr: 1, tall: false, cx: 0.7, cy: 0.5, fit: 50, lookX: 1 }
  function resize(w, h, dpr = 1) {
    view.w = Math.max(1, w); view.h = Math.max(1, h); view.aspect = view.w / view.h; view.dpr = dpr
    view.tall = layout === 'tall' || (layout === 'auto' && view.aspect < 0.95)
    let Uw, Uh, Wfit, Hfit
    if (view.tall) {
      view.cx = 0.5; view.cy = 0.5 * (1 - textBottom) + 0.03; Uw = view.w; Uh = view.h * (1 - textBottom); Wfit = 24; Hfit = 13; view.lookX = 1.4
    } else {
      view.cx = textLeft + (1 - textLeft) / 2; view.cy = 0.5; Uw = view.w * (1 - textLeft); Uh = view.h; Wfit = 21; Hfit = 13; view.lookX = 1
    }
    view.fit = Math.max((Wfit * view.h) / (2 * tanH * Uw), (Hfit * view.h) / (2 * tanH * Uh))
    camera.aspect = view.aspect
    // the sub-view starts left of / above the full frame, so the scene centre lands at (cx, cy) of the stage
    camera.setViewOffset(view.w, view.h, (0.5 - view.cx) * view.w, (0.5 - view.cy) * view.h, view.w, view.h)
    camera.updateProjectionMatrix()
    U.uPx.value = dpr
    hudU.uPx.value = dpr
    hudU.uAspect.value = view.aspect
    hudCam.left = -view.aspect; hudCam.right = view.aspect; hudCam.top = 1; hudCam.bottom = -1
    hudCam.updateProjectionMatrix()
  }
  if (size && size.w > 1) resize(size.w, size.h, size.dpr)
  else resize(1280, 720, 1)

  // HUD helpers: px are CSS pixels from the stage's top-left
  const hx = (px) => (px - view.w / 2) * (2 / view.h)
  const hy = (py) => (view.h / 2 - py) * (2 / view.h)
  function put(l, px, py, { anchor = 'l', a = 1, color, scale = 1 } = {}) {
    const vis = a > 0.015
    l.mesh.visible = vis
    if (!vis) return
    const u = 2 / view.h
    const w = l.w * scale, h = l.h * scale
    const left = anchor === 'l' ? px - l.pad * scale : anchor === 'r' ? px - w + l.pad * scale : px - w / 2
    l.mesh.scale.set(w * u, h * u, 1)
    l.mesh.position.set(hx(left + w / 2), hy(py), 0)
    l.material.opacity = a
    l.material.color.set(color)
  }

  const dark = () => themeName === 'dark'
  const tmp = new THREE.Vector3()
  const toScreen = (x, y, z) => {
    tmp.set(x, y, z).project(camera)
    return { nx: tmp.x, ny: tmp.y, px: (tmp.x * 0.5 + 0.5) * view.w, py: (0.5 - tmp.y * 0.5) * view.h }
  }

  function update(ctx) {
    const reduced = ctx.reduced
    const p = reduced ? 1 : clamp(ctx.p, 0, 1)
    const time = reduced ? 8 : ctx.time
    const sx = reduced ? 0 : ctx.pointer.sx
    const sy = reduced ? 0 : ctx.pointer.sy
    const T = THEMES[themeName]
    const S = story(p)

    U.uTime.value = time
    hudU.uTime.value = time
    U.uB.value = S.b
    U.uR.value = S.R
    U.uBase.value = S.base
    U.uSpread.value = S.spread
    U.uNoseW.value = S.noseW
    U.uXT.value = S.xT
    U.uXE.value = S.xE
    U.uHealK.value = S.s
    U.uMark.value = S.markA * (1 - smooth(0.86, 0.95, p) * 0.6)

    // camera: a slow orbit and a tiny dolly, plus pointer parallax
    const yaw = -0.2 + 0.1 * p + sx * 0.035
    const pitch = 0.6 - 0.035 * p + sy * 0.02
    const dist = view.fit * (1.03 - 0.05 * p)
    camera.position.set(view.lookX + Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, -0.5 + Math.cos(yaw) * Math.cos(pitch) * dist)
    camera.lookAt(view.lookX, 0, -0.5)
    camera.updateMatrixWorld()

    // ---- HUD
    const u = 2 / view.h
    const regL = view.tall ? 22 : view.w * textLeft + 30
    const regR = view.w - (view.tall ? 22 : 30)
    const regT = view.tall ? 30 : 34
    const regB = view.tall ? view.h * (1 - textBottom) - 16 : view.h - 32
    const k = view.tall ? 0.92 : 1
    const ret = toScreen(S.retX, pathY(S.retX), pathZ(S.retX))
    hudU.uPtr.value.set(ret.nx * view.aspect, ret.ny)
    hudU.uPtrOn.value = 0.95
    hudU.uErr.value = S.err

    // status row
    const stColor = (name) => (name === 'error' ? T.err : T.text)
    put(L.running, regL + 18, regT, { a: S.running, color: stColor('running'), scale: k })
    put(L.error, regL + 18, regT, { a: S.error, color: T.err, scale: k })
    put(L.healing, regL + 18, regT, { a: S.healing, color: T.text, scale: k })
    put(L.correct, regL + 18, regT, { a: S.correct, color: T.text, scale: k })
    put(L.sql, regR - 22, regT, { anchor: 'r', a: 0.7, color: T.dim, scale: k })
    const chip = hudU.uChips.value
    const stateRed = S.error > 0.5 ? 1 : 0
    chip[0].set(hx(regL + 5), hy(regT), S.error + S.healing + S.running > 0.5 || S.correct > 0.5 ? 1 : 0, stateRed)

    // step row
    const steps = [['diag', L.diag], ['retry', L.retry], ['safety', L.safety], ['tests', L.tests]]
    let cx = regL + 5
    const rowY = regB
    steps.forEach(([, label], i) => {
      chip[i + 1].set(hx(cx), hy(rowY), S.chips[i], 0)
      const st = S.chips[i]
      put(label, cx + 13, rowY, { a: (dark() ? 0.45 : 0.6) + 0.4 * st, color: st > 0.01 ? T.text : T.dim, scale: k })
      cx += 13 + label.w * k + 18
    })

    // fault tag, anchored to the break point
    const bp = toScreen(XF, pathY(XF), pathZ(XF))
    const tw = 134 * k, th = 70 * k
    let tx = bp.px + 34, ty = bp.py - 104 * k
    tx = clamp(tx, regL, regR - tw)
    ty = clamp(ty, regT + 26, regB - th - 30)
    hudU.uTagA.value = S.tagA
    hudU.uTag.value.set(hx(tx + tw / 2), hy(ty + th / 2), (tw / 2) * u, (th / 2) * u)
    hudU.uGaugeTag.value.set(hx(tx + tw / 2), hy(ty + th - 11 * k), ((tw - 20 * k) / 2) * u, 3 * k * u)
    hudU.uLead.value.set(hx(bp.px), hy(bp.py), hx(tx), hy(ty + th))
    put(L.first, tx + 10 * k, ty + 15 * k, { a: S.tagA * 0.75, color: T.panelText, scale: k })
    put(L.score9, tx + 10 * k, ty + 36 * k, { a: S.tagA, color: '#ff6a58', scale: k })

    // result panel
    const pw = view.tall ? Math.min(292, view.w - 44) : 308
    const ph = view.tall ? 100 : 114
    const pxR = regR - 8, pyB = regB - 38
    const pl = pxR - pw, pt = pyB - ph
    hudU.uPanelA.value = S.panelA
    hudU.uPanel.value.set(hx(pl + pw / 2), hy(pt + ph / 2), (pw / 2) * u, (ph / 2) * u)
    hudU.uGaugePanel.value.set(hx(pl + pw / 2), hy(pt + ph * 0.6), ((pw - 32) / 2) * u, 4 * u)
    put(L.score10, pl + 16, pt + ph * 0.32, { a: S.panelA, color: T.panelAccent, scale: view.tall ? 0.88 : 1 })
    put(L.fix, pl + 16, pt + ph * 0.84, { a: S.panelA, color: T.panelText, scale: view.tall ? 0.88 : 1 })
    hudU.uTagLit.value = 9
  }

  function render(renderer, ctx, target) {
    renderer.setRenderTarget(target ?? null)
    renderer.render(scene, camera)
    const auto = renderer.autoClear
    renderer.autoClear = false
    renderer.render(hudScene, hudCam)
    renderer.autoClear = auto
  }

  function dispose() {
    if (watchTheme && typeof document !== 'undefined') document.removeEventListener('themechange', onTheme)
    for (const d of disposables) d.dispose?.()
    plane.dispose()
  }

  return { scene, camera, animated: true, beats, update, resize, render, setTheme, getTheme: () => themeName, dispose }
}
