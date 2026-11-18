import * as THREE from 'three'

// Car surfaces: a painted livery body, carbon-fibre aero parts and rubber tyres, per theme.
//
// Everything is procedural (shader patches on MeshPhysicalMaterial, no texture files), so a theme switch
// is a uniform write and the render cost is one extra material per role. The livery is evaluated in the
// car's own frame (x lateral, y up, z nose), so it sits on the body the same way whichever way the car
// is rotated in the scene. No text, numbers or logos: only abstract bands.
//
// GLB nodes: Base Unsubsurfed + Sidepod (body), FL/FR/RL/RR_Tire, everything else is carbon.

const STYLES = {
  light: {
    body: '#f4f6f9', a: '#1d3f9f', b: '#63b5ee', c: '#e3252c',
    bodyRough: 0.24, bodyEnv: 1.0, clearcoat: 1, clearcoatRough: 0.04,
    carbon: '#0d0e11', carbonRough: 0.32, carbonEnv: 0.45,
    tyre: '#111113', tyreRough: 0.88, tyreEnv: 0.3,
    ring: '#f1f1ee', ringWidth: 0.012, ringMix: 0, k: 1,
  },
  dark: {
    body: '#10266a', a: '#d0102a', b: '#ffc21c', c: '#1c3fb8',
    bodyRough: 0.3, bodyEnv: 1.35, clearcoat: 1, clearcoatRough: 0.05,
    carbon: '#14151a', carbonRough: 0.34, carbonEnv: 1.2,
    tyre: '#0d0d0f', tyreRough: 0.9, tyreEnv: 0.55,
    ring: '#e1162b', ringWidth: 0.05, ringMix: 0, k: 2.1,
  },
}

let styleName = 'dark'
export function setCarStyle(name) {
  styleName = name === 'light' ? 'light' : 'dark'
}

// Shared uniforms (values swapped per theme without recompiling).
const U = {
  uCarInv: { value: new THREE.Matrix4() },
  uBodyC: { value: new THREE.Vector3() },
  uBodyH: { value: new THREE.Vector3(1, 1, 1) },
  uBase: { value: new THREE.Color() },
  uA: { value: new THREE.Color() },
  uB: { value: new THREE.Color() },
  uC: { value: new THREE.Color() },
  uRing: { value: new THREE.Color() },
  uRingW: { value: 0.02 },
  uRingMix: { value: 1 },
  uK: { value: 1 },
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
uniform vec3 uBase; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC;
uniform vec3 uRing; uniform float uRingW; uniform float uRingMix; uniform float uK;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float band(float d, float lo, float hi, float aa){
  return smoothstep(lo - aa, lo + aa, d) - smoothstep(hi - aa, hi + aa, d);
}
`

function patch(material, key, fragColor, fragRough) {
  material.customProgramCacheKey = () => 'f1-' + key
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <begin_vertex>', VERT_MAIN)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + fragColor)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + fragRough)
  }
}

const BODY_COLOR = `
  vec3 n = (vCarP - uBodyC) / uBodyH;
  float d = n.z * 0.8 + n.y * 1.0 - abs(n.x) * 0.35 + 0.07 * sin(n.z * 5.0 + n.x * 2.0);
  d *= uK;
  float aa = fwidth(d) * 1.1 + 0.004;
  vec3 col = uBase;
  col = mix(col, uC, band(d, -0.52, -0.38, aa));
  col = mix(col, uA, band(d, -0.38, 0.08, aa));
  col = mix(col, uB, band(d, 0.08, 0.3, aa));
  col = mix(col, uC, band(d, 0.36, 0.39, aa));
  diffuseColor.rgb = col;
`

const CARBON_COLOR = `
  float w = sin((vCarP.x + vCarP.z) * 90.0) * sin((vCarP.x - vCarP.z) * 90.0);
  w = mix(w, 0.0, clamp(fwidth(vCarP.x + vCarP.z) * 40.0, 0.0, 1.0));
  diffuseColor.rgb *= 1.0 + 0.5 * w;
`
const CARBON_ROUGH = `roughnessFactor *= 1.0 + 0.25 * w;`

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
  patch(body, 'body', BODY_COLOR, '')
  const carbon = phys({ metalness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.12 })
  patch(carbon, 'carbon', CARBON_COLOR, CARBON_ROUGH)
  const tyre = phys({ metalness: 0, clearcoat: 0 })
  patch(tyre, 'tyre', TYRE_COLOR, TYRE_ROUGH)
  const mark = new THREE.MeshStandardMaterial({ metalness: 0 })
  const acc2 = phys({ metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05 })
  const acc3 = phys({ metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05 })
  const mirror = phys({ metalness: 1, roughness: 0.08, color: 0xb8bcc4 })
  return { body, carbon, tyre, mark, acc2, acc3, mirror }
}

// Multi-material GLB nodes arrive as a Group (node name) holding one Mesh per material, so the node name
// is the parent's; the GLB's own material name (captured once) says which part of the node it is.
const nodeName = (m, car) => (m.parent && m.parent !== car && m.parent.name ? m.parent.name : m.name)
const roleOf = (m, car) => {
  if (!m.userData.origMat) m.userData.origMat = m.material.name || ''
  const node = nodeName(m, car)
  const orig = m.userData.origMat
  if (/_tire$/i.test(node)) return orig === 'Bloody Red' ? 'mark' : 'tyre'
  if (orig === 'BaseColor') return 'body'
  if (orig === '2ndColor') return 'acc2'
  if (orig === '3rdColor') return 'acc3'
  if (orig === 'Mirror') return 'mirror'
  return 'carbon'
}

const _box = new THREE.Box3()
const _inv = new THREE.Matrix4()
const _rel = new THREE.Matrix4()

export function applyCarStyle(car, envMap) {
  if (!car) return
  mats = mats || build()
  const s = STYLES[styleName]

  car.updateMatrixWorld(true)
  _inv.copy(car.matrixWorld).invert()
  U.uCarInv.value.copy(_inv)

  // Body extents in the car's own frame (used to normalise the livery).
  _box.makeEmpty()
  car.traverse((m) => {
    if (!m.isMesh || roleOf(m, car) !== 'body' || /sidepod/i.test(nodeName(m, car))) return
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
  U.uRing.value.set(s.ring)
  U.uRingW.value = s.ringWidth
  U.uRingMix.value = s.ringMix
  U.uK.value = s.k

  const { body, carbon, tyre, mark, acc2, acc3, mirror } = mats
  const set = (m, color, rough, env, cc, ccr) => {
    m.color.set(color)
    m.roughness = rough
    m.envMapIntensity = env
    m.envMap = envMap
    if (cc !== undefined) { m.clearcoat = cc; m.clearcoatRoughness = ccr }
    m.needsUpdate = true
  }
  set(body, '#ffffff', s.bodyRough, s.bodyEnv, s.clearcoat, s.clearcoatRough)
  set(carbon, s.carbon, s.carbonRough, s.carbonEnv)
  set(tyre, s.tyre, s.tyreRough, s.tyreEnv)
  set(mark, s.ring, 0.6, 0.4)
  set(acc2, styleName === 'light' ? s.b : s.c, 0.3, s.bodyEnv, 1, 0.05)
  set(acc3, styleName === 'light' ? s.c : s.a, 0.3, s.bodyEnv, 1, 0.05)
  mirror.envMap = envMap
  mirror.needsUpdate = true

  car.traverse((m) => {
    if (!m.isMesh) return
    const role = roleOf(m, car)
    const next = { tyre, mark, body, acc2, acc3, mirror, carbon }[role]
    if (m.material !== next) m.material = next
    // Spin the tyre's node (or the mesh itself when the node has a single material).
    const spin = /_tire$/i.test(nodeName(m, car)) ? (m.parent !== car ? m.parent : m) : null
    if (spin && !spin.userData.baseQ) spin.userData.baseQ = spin.quaternion.clone()
  })
}

// Spin the tyres about their axles so the rolling speed equals the flow speed (the road moves at
// `speed` world units per second under the car). Tyre radius is 0.92 in model units.
const _q = new THREE.Quaternion()
const _axis = new THREE.Vector3(1, 0, 0)
export function updateCarWheels(car, elapsed, speed) {
  if (!car) return
  const radius = 0.92 * car.scale.x
  const angle = (elapsed * speed) / radius
  _q.setFromAxisAngle(_axis, angle)
  car.traverse((m) => {
    if (m.userData.baseQ) m.quaternion.copy(m.userData.baseQ).multiply(_q)
  })
}
