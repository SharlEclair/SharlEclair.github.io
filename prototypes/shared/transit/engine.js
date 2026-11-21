/**
 * Transit Desert engine.
 *
 * One scalar drives everything: `renderAt(u)` is the only thing that draws, and the picture is a pure
 * function of u. The story, in 0..1 of a single viewport of scroll:
 *
 *   0.00 - 0.65   the search spreads from RMIT (isochrone contours, a bright front, examined streets lit)
 *   0.65 - 0.90   the route draws from RMIT to the Albert Park circuit, the circuit lights up
 *   0.90 - 1.00   hold, label settled
 *
 * The camera is a poster-map view with a slight tilt; it only drifts a few percent over the whole run.
 */
import * as THREE from 'three'
import { glParams } from '/shared/gl/params.js'
import { createFxaaPass } from '/shared/gl/fxaa.js'
import { createFsaaPass } from '/shared/gl/fsaa.js'
import { loadMapData } from './data.js'
import {
  buildSegmentGeometry,
  createBuildingsMaterial,
  createCircuitMaterial,
  createExploredMaterial,
  createFieldMaterial,
  createGroundMaterial,
  createMarkerMaterial,
  createRoadsMaterial,
  createRouteMaterial,
  createShared
} from './materials.js'
import { FIELD } from './data.js'
import { THEMES, resolveTheme, resolveRoads, lookFor, rgb } from './theme.js'
import { observeVisibility } from './scroll.js'

export const TIMELINE = { searchEnd: 0.65, routeEnd: 0.9 }

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const lerp = (a, b, t) => a + (b - a) * t
const DEG = Math.PI / 180

/** Search time (1 = goal settled) from scroll progress: a soft ease so it neither lurches nor stalls. */
export function searchTime(u) {
  const x = clamp01(u / TIMELINE.searchEnd)
  const eased = x * x * (3 - 2 * x)
  return lerp(x, eased, 0.35) * 1.02
}

export function routeReveal(u) {
  return inOutCubic(clamp01((u - TIMELINE.searchEnd) / (TIMELINE.routeEnd - TIMELINE.searchEnd)))
}

const v3 = (hex) => new THREE.Vector3(...rgb(hex))

export async function startEngine({
  canvas,
  stage,
  progressSource,
  maxPixelRatio = 1.5,
  labels = null,
  theme = null,
  roads: roadsOption = null,
  layout = 'auto',
  onReady = null
}) {
  const isFxaa = glParams.aa === 'fxaa'
  const isFsaa = glParams.aa === 'fsaa'
  const hasPostAa = isFxaa || isFsaa
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: hasPostAa ? false : (glParams.aa ?? true), alpha: true, premultipliedAlpha: true })
  const aaPass = isFxaa ? createFxaaPass(THREE) : isFsaa ? createFsaaPass(THREE) : null
  const ratio = Math.min(window.devicePixelRatio || 1, glParams.dpr ?? maxPixelRatio) * (glParams.quality === 'auto' ? 1 : glParams.quality)
  renderer.setPixelRatio(ratio)
  renderer.setClearColor(0x000000, 0)
  renderer.autoClear = true

  const data = await loadMapData()

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(22, 1, 200, 60000)
  const shared = createShared()
  shared.u_field.value = data.field
  shared.u_ratio.value = ratio

  // ---------------------------------------------------------------------------------------- layers
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.x1 - FIELD.x0, FIELD.z1 - FIELD.z0).rotateX(-Math.PI / 2).translate(
      (FIELD.x0 + FIELD.x1) / 2,
      -0.2,
      (FIELD.z0 + FIELD.z1) / 2
    ),
    createFieldMaterial(shared)
  )
  field.renderOrder = 1

  const groundMesh = new THREE.Mesh(data.ground, createGroundMaterial(shared))
  groundMesh.renderOrder = 0

  const buildings = new THREE.Mesh(data.buildings, createBuildingsMaterial(shared))
  buildings.renderOrder = 2

  const roadGeo = buildSegmentGeometry(data.roads)
  const roads = new THREE.Mesh(roadGeo, createRoadsMaterial(shared))
  roads.renderOrder = 3

  const exploredGeo = buildSegmentGeometry(data.explored)
  const exploredHalo = new THREE.Mesh(exploredGeo, createExploredMaterial(shared, { halo: true }))
  exploredHalo.renderOrder = 4
  const explored = new THREE.Mesh(exploredGeo, createExploredMaterial(shared))
  explored.renderOrder = 5

  const circuit = new THREE.Mesh(buildSegmentGeometry(data.circuit), createCircuitMaterial(shared))
  circuit.renderOrder = 6

  const routeGeo = buildSegmentGeometry(data.route)
  const routeCasing = new THREE.Mesh(routeGeo, createRouteMaterial(shared, 'casing'))
  const routeGlow = new THREE.Mesh(routeGeo, createRouteMaterial(shared, 'glow'))
  const routeCore = new THREE.Mesh(routeGeo, createRouteMaterial(shared, 'core'))
  routeCasing.renderOrder = 7
  routeGlow.renderOrder = 8
  routeCore.renderOrder = 9

  const markerGeo = (x, z) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([x, 1.2, z], 3))
    return g
  }
  const startMarker = new THREE.Points(markerGeo(...[data.routeStart[0], data.routeStart[1]]), createMarkerMaterial(shared))
  const goalMarker = new THREE.Points(markerGeo(...[data.routeEnd[0], data.routeEnd[1]]), createMarkerMaterial(shared))
  startMarker.renderOrder = 10
  goalMarker.renderOrder = 10

  const all = [
    groundMesh, field, buildings, roads, exploredHalo, explored, circuit,
    routeCasing, routeGlow, routeCore, startMarker, goalMarker
  ]
  for (const m of all) {
    m.frustumCulled = false
    scene.add(m)
  }

  // ----------------------------------------------------------------------------------------- theme
  let themeName = resolveTheme(theme)
  const roadsVariant = resolveRoads(roadsOption)
  let look = lookFor(themeName, roadsVariant)
  let palette = { ...THEMES[themeName], ...look?.palette }

  function applyTheme(name) {
    themeName = name
    look = lookFor(name, roadsVariant)
    palette = { ...THEMES[name], ...look?.palette }
    const p = palette
    const cam = look?.camera
    rig.tilt0 = cam?.tilt0 ?? 38
    rig.tilt1 = cam?.tilt1 ?? 34
    rig.dolly = cam?.dolly ?? 0.93
    rig.drift = cam?.drift ?? 4
    const set = (mat, values) => {
      for (const [k, v] of Object.entries(values)) {
        const u = mat.uniforms[k]
        if (!u) continue
        if (typeof v === 'string') u.value.copy(v3(v))
        else u.value = v
      }
    }
    set(roads.material, { u_ink: p.ink, u_alpha: p.road, u_add: look ? 1 : 0 })
    // the glow look: one additive (max-blended, so overlapping ribbons never stack) pass, hidden behind blocks
    const rm = roads.material
    set(rm, { u_glow: look ? 1 : 0, u_hotCol: p.accentHot })
    if (look) set(rm, { u_colMain: p.roadMain, u_colSide: p.roadSide })
    rm.blendEquation = look ? THREE.MaxEquation : THREE.AddEquation
    rm.blendDst = look ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor
    rm.depthTest = Boolean(look)
    set(groundMesh.material, { u_ink: p.ink, u_water: p.water, u_park: p.park, u_add: 0 })
    set(buildings.material, {
      u_ink: p.ink, u_accent: p.accent, u_hot: p.accentHot, u_roof: p.roofInk, u_wall: p.wallInk, u_add: 0,
      u_glow: look ? 1 : 0,
      u_hs: look ? p.blockHeight : 0.5
    })
    set(field.material, {
      u_accent: p.accent, u_hot: p.accentHot, u_contour: p.contour, u_haze: p.haze, u_add: p.add
    })
    for (const m of [explored, exploredHalo]) {
      set(m.material, { u_settledCol: p.accent, u_hotCol: p.accentHot, u_settled: p.settled, u_add: p.add })
    }
    exploredHalo.material.uniforms.u_haloGain.value = 0.5 * p.haloGain
    set(circuit.material, { u_ink: p.circuit, u_lit: p.circuitLit, u_alpha: p.circuitAlpha, u_add: 0 })
    for (const m of [routeGlow, routeCore]) {
      set(m.material, { u_routeCol: p.route, u_hotCol: p.routeHot, u_paper: p.paper, u_add: m === routeGlow ? p.add : 0 })
    }
    set(routeCasing.material, { u_paper: p.paper, u_add: 0 })
    routeGlow.material.uniforms.u_gain.value = p.haloGain
    for (const m of [startMarker, goalMarker]) set(m.material, { u_ink: p.ink, u_add: 0 })
    set(startMarker.material, { u_ink: p.ink })
    shared.u_fog.value = themeName === 'dark' ? 0.55 : 0.45
    if (labels) {
      for (const el of Object.values(labels)) {
        if (!el) continue
        el.dataset.theme = themeName
        el.style.setProperty('--tl-ink', p.label)
        el.style.setProperty('--tl-sub', p.labelSub)
        el.style.setProperty('--tl-halo', p.paper)
      }
    }
    needsDraw = true
  }

  // ---------------------------------------------------------------------------------------- camera
  const rig = {
    D: 9000,
    target: new THREE.Vector3(),
    shift: new THREE.Vector2(),
    psi: 25,
    tilt0: 38,
    tilt1: 34,
    dolly: 0.93,
    drift: 4
  }
  const hud = labels?.hud ?? null
  let stageWidth = 1
  let stageHeight = 1
  let phone = false

  /** The region of the stage the story should live in, in stage pixels. */
  function actionRect(w, h) {
    if (phone) return { x0: 0.05 * w, x1: 0.95 * w, y0: Math.max(0.04 * h, 100), y1: Math.max(0.54 * h, 100 + 0.42 * h) }
    return { x0: 0.41 * w, x1: 0.985 * w, y0: 0.04 * h, y1: 0.96 * h }
  }

  function pose(u, D = rig.D) {
    const e = smooth(0, 1, u)
    const tilt = lerp(rig.tilt0, rig.tilt1, e) * DEG
    const psi = (rig.psi + rig.drift * e) * DEG
    const dist = D * lerp(1, rig.dolly, e)
    // screen-up in world, on the ground plane (psi = 0: north, i.e. -z)
    const upx = Math.sin(psi)
    const upz = -Math.cos(psi)
    camera.position.set(
      rig.target.x - Math.sin(tilt) * upx * dist,
      Math.cos(tilt) * dist,
      rig.target.z - Math.sin(tilt) * upz * dist
    )
    camera.up.set(0, 1, 0)
    camera.lookAt(rig.target)
    camera.updateMatrixWorld(true)
    shared.u_fogNear.value = dist * 0.9
    shared.u_fogFar.value = dist * 1.6
  }

  const scratch = new THREE.Vector3()
  function fit() {
    const w = stageWidth
    const h = stageHeight
    phone = layout === 'phone' || (layout === 'auto' && (w < 760 || w / h < 0.85))
    rig.psi = phone ? (look?.camera?.psiPhone ?? 14) : (look?.camera?.psi ?? 25)
    camera.aspect = w / h
    camera.updateProjectionMatrix()

    const kp = data.keyPoints
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const [x, z] of kp) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
    }
    rig.target.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2)

    const r = actionRect(w, h)
    const toNdcX = (px) => (px / w) * 2 - 1
    const toNdcY = (py) => 1 - (py / h) * 2
    // keep a margin so the final, slightly closer frame still fits
    const shrink = 0.93
    const cx = (toNdcX(r.x0) + toNdcX(r.x1)) / 2
    const cy = (toNdcY(r.y0) + toNdcY(r.y1)) / 2
    const tw = (toNdcX(r.x1) - toNdcX(r.x0)) * shrink
    const th = (toNdcY(r.y0) - toNdcY(r.y1)) * shrink

    let D = 9000
    let bx = 0
    let by = 0
    for (let i = 0; i < 6; i += 1) {
      pose(0.5, D)
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const [x, z] of kp) {
        scratch.set(x, 0, z).project(camera)
        x0 = Math.min(x0, scratch.x); x1 = Math.max(x1, scratch.x)
        y0 = Math.min(y0, scratch.y); y1 = Math.max(y1, scratch.y)
      }
      bx = (x0 + x1) / 2
      by = (y0 + y1) / 2
      const s = Math.max((x1 - x0) / tw, (y1 - y0) / th)
      D *= s
    }
    rig.D = D
    rig.shift.set(cx - bx, cy - by)
    camera.updateProjectionMatrix()
    camera.projectionMatrix.elements[8] -= rig.shift.x
    camera.projectionMatrix.elements[9] -= rig.shift.y
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
    if (hud) {
      hud.style.transform = `translate3d(${Math.round(r.x0 + (phone ? 0 : 0.01 * w))}px,${Math.round(r.y1)}px,0) translateY(-100%)`
    }
  }

  // ------------------------------------------------------------------------------------------ size
  let needsDraw = true
  function resize() {
    const w = stage.clientWidth || window.innerWidth
    const h = stage.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    if (aaPass) aaPass.setSize(w, h, ratio)
    stageWidth = w
    stageHeight = h
    shared.u_res.value.set(renderer.domElement.width, renderer.domElement.height)
    fit()
    needsDraw = true
  }

  // ------------------------------------------------------------------------------------------ draw
  const labelScratch = new THREE.Vector3()
  const labelCache = new Map()
  function placeLabel(el, x, z, opacity, key) {
    if (!el) return
    labelScratch.set(x, 1, z).project(camera)
    const px = Math.round((labelScratch.x * 0.5 + 0.5) * stageWidth)
    const py = Math.round((-labelScratch.y * 0.5 + 0.5) * stageHeight)
    const on = opacity > 0.01 && labelScratch.z < 1
    const text = `${px},${py},${opacity.toFixed(2)},${on}`
    if (labelCache.get(key) === text) return
    labelCache.set(key, text)
    el.style.opacity = on ? String(opacity) : '0'
    el.style.transform = `translate3d(${px}px,${py}px,0)`
  }

  // The iso look's HUD: counts taken from the recorded search (nodes reached, route length drawn so far).
  const hudEls = hud
    ? { nodes: hud.querySelector('[data-k=nodes]'), route: hud.querySelector('[data-k=route]') }
    : null
  let hudOn = null
  let hudKey = ''
  function updateHud(t, r) {
    if (!hud) return
    const on = Boolean(look?.hud)
    if (on !== hudOn) {
      hudOn = on
      hud.style.display = on ? '' : 'none'
      hudKey = ''
    }
    if (!on) return
    const times = data.nodeTimes
    let lo = 0
    let hi = times.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (times[mid] <= t) lo = mid + 1
      else hi = mid
    }
    const key = `${lo},${Math.round(r * data.routeLengthM / 10)}`
    if (key === hudKey) return
    hudKey = key
    hudEls.nodes.textContent = `${String(lo).padStart(3, '0')} / ${data.nodeTotal}`
    hudEls.route.textContent = `${((r * data.routeLengthM) / 1000).toFixed(2)} KM`
  }

  let currentU = 0
  let drawnU = Number.NaN
  function renderAt(u) {
    currentU = u
    pose(u)
    const t = searchTime(u)
    const r = routeReveal(u)
    shared.u_t.value = t

    // once the route draws, the search recedes so the answer is the single bright thing
    const recede = 1 - 0.45 * smooth(TIMELINE.searchEnd, TIMELINE.routeEnd, u)
    for (const m of [explored, exploredHalo]) m.material.uniforms.u_settled.value = palette.settled * recede
    exploredHalo.material.uniforms.u_vis.value = 1
    field.material.uniforms.u_contour.value = palette.contour * recede
    field.material.uniforms.u_haze.value = palette.haze * lerp(1, 0.2, smooth(0.5, 0.8, u))

    for (const m of [routeCasing, routeGlow, routeCore]) m.material.uniforms.u_reveal.value = r
    roads.material.uniforms.u_boost.value = 1 - 0.3 * smooth(TIMELINE.searchEnd, TIMELINE.routeEnd, u)

    const lit = smooth(0.78, 0.93, u)
    circuit.material.uniforms.u_amount.value = lit
    startMarker.material.uniforms.u_alpha.value = 0.75
    goalMarker.material.uniforms.u_alpha.value = lerp(0.4, 1, lit)
    goalMarker.material.uniforms.u_ink.value.copy(v3(lit > 0.5 ? palette.route : palette.ink))

    if (aaPass) {
      renderer.setRenderTarget(aaPass.target)
      renderer.clear()
      renderer.render(scene, camera)
      aaPass.render(renderer, null)
    } else {
      renderer.render(scene, camera)
    }
    drawnU = u
    needsDraw = false

    updateHud(t, r)
    if (labels) {
      placeLabel(labels.circuit, data.circuitCentre[0] - 380, data.circuitCentre[1] - 60, smooth(0.84, 0.95, u), 'c')
      placeLabel(labels.rmit, data.routeStart[0], data.routeStart[1], 1 - smooth(0.72, 0.9, u) * 0.4, 'r')
    }
  }

  // ------------------------------------------------------------------------------------------ loop
  let override = null
  const read = () => {
    if (override !== null) return override
    const v = Number(progressSource())
    return Number.isFinite(v) ? clamp01(v) : 0
  }
  let frame = null
  function tick() {
    frame = requestAnimationFrame(tick)
    const u = read()
    if (!needsDraw && u === drawnU) return
    renderAt(u)
  }
  const startLoop = () => {
    if (frame === null) frame = requestAnimationFrame(tick)
  }
  const stopLoop = () => {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
  }

  applyTheme(themeName)
  resize()
  const onResize = () => {
    resize()
    if (frame === null) renderAt(read())
  }
  window.addEventListener('resize', onResize)
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null
  observer?.observe(stage)
  const visibility = observeVisibility(stage, {
    onVisible: () => {
      startLoop()
      renderAt(read())
    },
    onHidden: stopLoop
  })

  renderAt(read())
  startLoop()

  const engine = {
    renderer,
    scene,
    camera,
    renderAt,
    resize,
    get theme() {
      return themeName
    },
    setTheme(name) {
      const next = resolveTheme(name)
      if (next === themeName) return
      applyTheme(next)
      fit()
      renderAt(currentU)
    },
    setProgress(value) {
      override = typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : null
      renderAt(read())
    },
    destroy() {
      stopLoop()
      visibility.disconnect()
      observer?.disconnect()
      window.removeEventListener('resize', onResize)
      scene.traverse((o) => {
        o.geometry?.dispose()
        o.material?.dispose()
      })
      data.field.dispose()
      aaPass?.dispose()
      renderer.dispose()
    }
  }
  window.__ENGINE = engine
  window.__TEST_SET_PROGRESS = (value) => {
    engine.setProgress(value)
    return { progress: currentU }
  }
  window.__APP_READY = true
  onReady?.(engine)
  return engine
}
