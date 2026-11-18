import * as THREE from 'three'
import { LIVERY_DEFAULTS } from '../tune.js'

// Car surfaces: a painted livery body, carbon-fibre aero parts, rubber tyres and black glass, per theme.
//
// Everything is procedural (shader patches on MeshPhysicalMaterial, no texture files), so a theme switch
// is a uniform write and the render cost is one extra material per role. The livery is evaluated in the
// car's own frame (x lateral, y up, z nose), so it sits on the body the same way whichever way the car
// is rotated in the scene. No text, numbers or logos: only abstract colour blocks.
//
// GLB nodes: Base Unsubsurfed + Sidepod (shell: nose, chassis, engine cover, halo), FL/FR/RL/RR_Tire,
// everything else (wings, floor, bargeboards, suspension) is carbon. The airbox sits on two small GLB
// patches ('2ndColor', '3rdColor') that the livery recolours.
//
// DARK  the colour scheme of the sibling f1-three-test project's own car file (its "keep original part
//       colours" finish): a deep navy shell (its BaseColor is near-black navy), a signal yellow
//       (its 2ndColor, #FFC000) and a signal red (its 3rdColor, #FD1216) on the airbox and the stripes,
//       dark carbon, soft-compound red sidewall marks.
// LIGHT white engine cover and sidepods, a broad blue-to-light-blue swoosh with a red stripe along the
//       sidepod, black nose, halo, wings and floor, black wheels with white sidewall marks.

const STYLES = {
  light: {
    mode: 1,
    body: '#f5f6f8', a: '#1b3d9c', b: '#5eb3ec', c: '#e4252d', d: '#0b0c0f',
    paintRough: 0.26, paintMetal: 0.0, paintEnv: 1.0, clearcoat: 1, clearcoatRough: 0.04,
    carbon: '#0b0c0f', carbonRough: 0.4, carbonEnv: 0.3, carbonSheen: 0.35,
    tyre: '#101012', tyreRough: 0.86, tyreEnv: 0.3,
    glass: '#050608', glassRough: 0.05, glassEnv: 1.2,
    mark: '#f4f4f1', markRough: 0.55,
    ring: '#f1f1ee', ringWidth: 0.012, ringMix: 0, k: 1,
    acc2: 'carbon', acc3: 'body',
  },
  dark: {
    mode: 0,
    body: '#0f2262', a: '#d6102a', b: '#ffc21c', c: '#1c3fb8', d: '#0b1028',
    paintRough: 0.3, paintMetal: 0.12, paintEnv: 1.25, clearcoat: 1, clearcoatRough: 0.05,
    carbon: '#15161b', carbonRough: 0.36, carbonEnv: 1.1, carbonSheen: 0.6,
    tyre: '#0d0d0f', tyreRough: 0.86, tyreEnv: 0.5,
    glass: '#04050a', glassRough: 0.06, glassEnv: 1.4,
    mark: '#e1162b', markRough: 0.6,
    ring: '#e1162b', ringWidth: 0.05, ringMix: 0, k: 2.1,
    acc2: 'yellow', acc3: 'red',
  },
}

let styleName = 'dark'
export function setCarStyle(name) {
  styleName = name === 'light' ? 'light' : 'dark'
}
export const getCarStyle = () => styleName

// Live tuning (tune.js LIVERY_DEFAULTS): offsets and multipliers over the per-theme values above.
export const liveryTune = { ...LIVERY_DEFAULTS }

// Shared uniforms (values swapped per theme without recompiling).
const U = {
  uCarInv: { value: new THREE.Matrix4() },
  uBodyC: { value: new THREE.Vector3() },
  uBodyH: { value: new THREE.Vector3(1, 1, 1) },
  uBase: { value: new THREE.Color() },
  uA: { value: new THREE.Color() },
  uB: { value: new THREE.Color() },
  uC: { value: new THREE.Color() },
  uD: { value: new THREE.Color() },
  uRing: { value: new THREE.Color() },
  uRingW: { value: 0.02 },
  uRingMix: { value: 1 },
  uK: { value: 1 },
  uMode: { value: 0 },
  uWeave: { value: 1 },
  uDbg: { value: 0 },
}

const VERT_HEAD = `
uniform mat4 uCarInv;
varying vec3 vCarP;
varying vec3 vLocP;
varying vec3 vLocN;
`
const VERT_MAIN = `
#include <begin_vertex>
vCarP = (uCarInv * modelMatrix * vec4(transformed, 1.0)).xyz;
vLocP = position;
vLocN = normal;
`
const FRAG_HEAD = `
varying vec3 vCarP;
varying vec3 vLocP;
varying vec3 vLocN;
uniform vec3 uBodyC; uniform vec3 uBodyH;
uniform vec3 uBase; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uD;
uniform vec3 uRing; uniform float uRingW; uniform float uRingMix; uniform float uK;
uniform float uMode; uniform float uWeave; uniform float uDbg;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float band(float d, float lo, float hi, float aa){
  return smoothstep(lo - aa, lo + aa, d) - smoothstep(hi - aa, hi + aa, d);
}
`

function patch(material, key, fragColor, fragRough, fragLights = '') {
  material.customProgramCacheKey = () => 'f1b-' + key
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <begin_vertex>', VERT_MAIN)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + fragColor)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + fragRough)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + fragLights)
  }
}

// Livery in body coordinates n: x lateral, y up, z along the car (nose is +z), each -1..1 over the shell.
const BODY_COLOR = `
  vec3 n = (vCarP - uBodyC) / uBodyH;
  float ax = abs(n.x);
  vec3 col = uBase;
  float blk = 0.0; // 1 where the paint is black: kept satin so it reads as black paint, not a mirror
  if (uMode < 0.5) {
    // Dark: navy shell, a red wedge sweeping back over the sidepods, yellow pinstripe, blue shoulder.
    float d = n.z * 0.8 + n.y * 1.0 - ax * 0.35 + 0.07 * sin(n.z * 5.0 + n.x * 2.0);
    d *= uK;
    float aa = fwidth(d) * 1.1 + 0.004;
    col = mix(col, uC, band(d, -0.52, -0.38, aa));
    col = mix(col, uA, band(d, -0.38, 0.08, aa));
    col = mix(col, uB, band(d, 0.08, 0.3, aa));
    col = mix(col, uC, band(d, 0.36, 0.39, aa));
  } else {
    // Light: white shell. e is a diagonal that runs from the front outer corner of the sidepod back and
    // in toward the airbox; the swoosh is a dark blue band that lightens on its upper edge, with a red
    // stripe outboard of it. The nose and halo are black.
    float e = n.z - 1.15 * ax + 0.3 * n.y;
    float aa = fwidth(e) * 1.1 + 0.004;
    float w = 0.2 + 0.2 * smoothstep(-0.8, 0.1, n.z);
    float c0 = -0.95;
    float zmask = smoothstep(-0.95, -0.6, n.z) * (1.0 - smoothstep(0.0, 0.12, n.z));
    float swoosh = band(e, c0 - w, c0 + w, aa) * zmask;
    col = mix(col, mix(uA, uB, smoothstep(c0 + 0.02, c0 + w + 0.02, e)), swoosh);
    col = mix(col, uC, band(e, c0 - w - 0.2, c0 - w - 0.07, aa) * zmask);
    float nose = smoothstep(0.22 - aa, 0.22 + aa, n.z);
    col = mix(col, uD, nose);
    // A thin blue and red pinstripe across the nose, where the white ends.
    col = mix(col, uB, band(n.z, 0.24, 0.265, aa) * nose * (1.0 - smoothstep(0.3, 0.4, ax)));
    col = mix(col, uC, band(n.z, 0.275, 0.295, aa) * nose * (1.0 - smoothstep(0.3, 0.4, ax)));
    // Halo and roll hoop: the highest part of the shell.
    float halo = smoothstep(0.52, 0.58, n.y);
    col = mix(col, uD, halo);
    blk = max(nose, halo);
  }
  if (uDbg > 0.5) col = vec3(n.z * 0.5 + 0.5, ax, n.y * 0.5 + 0.5);
  diffuseColor.rgb = col;
`
const BODY_ROUGH = `roughnessFactor = mix(roughnessFactor, 0.5, blk);`
const BODY_LIGHTS = `
#ifdef USE_CLEARCOAT
  material.clearcoat *= 1.0 - 0.8 * blk;
#endif
`

const CARBON_COLOR = `
  float w = sin((vCarP.x + vCarP.z) * 90.0) * sin((vCarP.x - vCarP.z) * 90.0);
  w = mix(w, 0.0, clamp(fwidth(vCarP.x + vCarP.z) * 40.0, 0.0, 1.0));
  diffuseColor.rgb *= 1.0 + 0.5 * w * uWeave;
`
const CARBON_ROUGH = `roughnessFactor *= 1.0 + 0.25 * w * uWeave;`

const TYRE_COLOR = `
  float rr = length(vLocP.yz);
  float side = smoothstep(0.55, 0.8, abs(vLocN.x));
  float ang = atan(vLocP.z, vLocP.y);
  float grain = h21(vec2(floor(ang * 260.0), floor(rr * 90.0 + abs(vLocP.x) * 40.0)));
  float groove = smoothstep(0.42, 0.5, abs(fract(vLocP.x * 8.0) - 0.5));
  diffuseColor.rgb *= 0.8 + 0.4 * grain;
  diffuseColor.rgb *= mix(1.0 - 0.45 * groove, 1.0, side);
  float ringD = abs(rr - 0.72);
  float ring = (1.0 - smoothstep(uRingW, uRingW + 0.006, ringD)) * side;
  diffuseColor.rgb = mix(diffuseColor.rgb, uRing, ring * uRingMix);
`
const TYRE_ROUGH = `roughnessFactor *= 0.85 + 0.3 * grain - 0.1 * ring;`

let mats = null
function build() {
  const phys = (extra = {}) => new THREE.MeshPhysicalMaterial({ ...extra })
  const body = phys({ metalness: 0.05 })
  patch(body, 'body', BODY_COLOR, BODY_ROUGH, BODY_LIGHTS)
  // Carbon: a faint woven sheen on top of a satin clearcoat.
  const carbon = phys({ metalness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.12, sheen: 0.3, sheenRoughness: 0.5 })
  patch(carbon, 'carbon', CARBON_COLOR, CARBON_ROUGH)
  const tyre = phys({ metalness: 0, clearcoat: 0 })
  patch(tyre, 'tyre', TYRE_COLOR, TYRE_ROUGH)
  const mark = new THREE.MeshStandardMaterial({ metalness: 0 })
  const yellow = phys({ metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05 })
  const red = phys({ metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05 })
  // Polished black glass: halo trim, visor and mirror faces.
  const glass = phys({ metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1 })
  return { body, carbon, tyre, mark, yellow, red, glass }
}

// Multi-material GLB nodes arrive as a Group (node name) holding one Mesh per material, so the node name
// is the parent's; the GLB's own material name (captured once) says which part of the node it is.
const nodeName = (m, car) => (m.parent && m.parent !== car && m.parent.name ? m.parent.name : m.name)
const roleOf = (m, car, s) => {
  if (!m.userData.origMat) m.userData.origMat = m.material.name || ''
  const node = nodeName(m, car)
  const orig = m.userData.origMat
  if (/_tire$/i.test(node)) return orig === 'Bloody Red' ? 'mark' : 'tyre'
  if (orig === 'BaseColor') return 'body'
  if (orig === '2ndColor') return s.acc2
  if (orig === '3rdColor') return s.acc3
  if (orig === 'Mirror') return 'glass'
  return 'carbon'
}

const _box = new THREE.Box3()
const _inv = new THREE.Matrix4()
const _rel = new THREE.Matrix4()
let _envMap = null

export function applyCarStyle(car, envMap) {
  if (!car) return
  _envMap = envMap
  mats = mats || build()
  const s = STYLES[styleName]
  const t = liveryTune

  car.updateMatrixWorld(true)
  _inv.copy(car.matrixWorld).invert()
  U.uCarInv.value.copy(_inv)

  // Body extents in the car's own frame (used to normalise the livery).
  _box.makeEmpty()
  car.traverse((m) => {
    if (!m.isMesh || roleOf(m, car, s) !== 'body' || /sidepod/i.test(nodeName(m, car))) return
    m.geometry.computeBoundingBox()
    _rel.multiplyMatrices(_inv, m.matrixWorld)
    _box.union(m.geometry.boundingBox.clone().applyMatrix4(_rel))
  })
  if (!_box.isEmpty()) {
    _box.getCenter(U.uBodyC.value)
    _box.getSize(U.uBodyH.value).multiplyScalar(0.5)
  }

  U.uBase.value.set(s.body)
  U.uA.value.set(s.a)
  U.uB.value.set(s.b)
  U.uC.value.set(s.c)
  U.uD.value.set(s.d)
  U.uRing.value.set(s.ring)
  U.uRingW.value = s.ringWidth
  U.uRingMix.value = s.ringMix
  U.uK.value = s.k
  U.uMode.value = s.mode
  U.uWeave.value = t.carbonSheen

  const { body, carbon, tyre, mark, yellow, red, glass } = mats
  const clamp01 = (v) => Math.min(1, Math.max(0, v))
  const set = (m, color, rough, env, cc, ccr) => {
    m.color.set(color)
    m.roughness = clamp01(rough)
    m.envMapIntensity = env
    m.envMap = envMap
    if (cc !== undefined) { m.clearcoat = cc; m.clearcoatRoughness = clamp01(ccr) }
    m.needsUpdate = true
  }
  const paintRough = s.paintRough + t.paintRough
  const paintEnv = s.paintEnv * t.paintEnv
  const cc = s.clearcoat * t.clearcoat
  const ccr = s.clearcoatRough + t.clearcoatRough
  set(body, '#ffffff', paintRough, paintEnv, cc, ccr)
  body.metalness = s.paintMetal
  set(carbon, s.carbon, s.carbonRough + t.carbonRough, s.carbonEnv * t.carbonEnv)
  carbon.sheen = 0.5 * s.carbonSheen * t.carbonSheen
  set(tyre, s.tyre, s.tyreRough + t.tyreRough, s.tyreEnv * t.tyreEnv)
  set(mark, s.mark, s.markRough, 0.4)
  set(yellow, s.b, paintRough, paintEnv, cc, ccr)
  set(red, s.a, paintRough, paintEnv, cc, ccr)
  set(glass, s.glass, s.glassRough + t.glassRough, s.glassEnv)
  glass.clearcoat = 1
  glass.clearcoatRoughness = 0.02

  car.traverse((m) => {
    if (!m.isMesh) return
    const role = roleOf(m, car, s)
    const next = { tyre, mark, body, yellow, red, glass, carbon }[role]
    if (m.material !== next) m.material = next
    // Spin the tyre's node (or the mesh itself when the node has a single material).
    const spin = /_tire$/i.test(nodeName(m, car)) ? (m.parent !== car ? m.parent : m) : null
    if (spin && !spin.userData.baseQ) spin.userData.baseQ = spin.quaternion.clone()
  })
}

// Merge livery tuning (tune.js LIVERY_FIELDS keys) and re-apply to the car.
export function tuneLivery(car, partial) {
  Object.assign(liveryTune, partial)
  applyCarStyle(car, _envMap)
}

// Spin the tyres about their axles. `distance` is how far the road has moved under the car (world units),
// so the rolling speed equals the flow speed when the caller passes time.flow (times any wheel-sync factor).
// Tyre radius is 0.92 in model units.
const _q = new THREE.Quaternion()
const _axis = new THREE.Vector3(1, 0, 0)
export function updateCarWheels(car, distance) {
  if (!car) return
  const radius = 0.92 * car.scale.x
  _q.setFromAxisAngle(_axis, distance / radius)
  car.traverse((m) => {
    if (m.userData.baseQ) m.quaternion.copy(m.userData.baseQ).multiply(_q)
  })
}

export function setLiveryDebug(on) {
  U.uDbg.value = on ? 1 : 0
}
