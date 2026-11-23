/**
 * Harvest "orbit" variants: a satellite crosses a quiet planet, a scan beam locks onto California and a lens opens on three
 * reservoirs whose water runs out into the fields and turns them green. One scene module for shared/gl/harness.js, three tiers:
 *
 *   ?harvest=orbit-25   2.5D print: flat layers, ortho camera           (tier '25')
 *   ?harvest=orbit-mid  halftone instrument: 3D objects, ortho camera   (tier 'mid')
 *   ?harvest=orbit-3d   night pass: real 3D, perspective camera         (tier '3d')
 *
 * Spec: prototypes/.logs/harvest-orbit-design.md. This file owns the camera, the layout (orbit-layout.js), the storyboard timeline,
 * stars, space lift, scan beam, orbit ring and the DOM labels (orbit-labels.js). The satellite is orbit-sat.js, the planet
 * (disk or sphere, atmosphere, ground track, lens) is orbit-earth.js. Every frame is a pure function of ctx.p / ctx.time / pointer.
 *
 * Placement: screen anchors, never setViewOffset. The Earth centre/radius come from layoutFor(); the satellite rides a circle in
 * an orbit plane that contains the Earth centre and the region, and that circle is the ring, the satellite path and the ground track.
 */
import { ORBIT_THEMES } from './orbit-theme.js'
import { makeOrbitSat } from './orbit-sat.js'
import { makeOrbitEarth } from './orbit-earth.js'
import { makeOrbitLabels } from './orbit-labels.js'
import * as L from './orbit-layout.js'
import { createCinePost } from './orbit-post-cine.js'

const { clamp, lerp, smooth } = L
const RAD = Math.PI / 180
const TAU = Math.PI * 2
const RING_SEGS = 256
const backOut = (t, s = 1.2) => { const u = t - 1; return 1 + (s + 1) * u * u * u + s * u * u }
const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
/** Smooth piecewise curve through [p, value] keys. */
const curve = (p, keys) => {
  if (p <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i += 1) {
    if (p <= keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], smooth(keys[i - 1][0], keys[i][0], p))
  }
  return keys[keys.length - 1][1]
}
const mulberry = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/* ------------------------------------------------------------------ shaders */
const LIFT_VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.99999, 1.0); }`
const LIFT_FRAG = /* glsl */ `
uniform vec3 uColor; uniform vec2 uCenter; uniform float uRadius; uniform float uH; uniform float uDpr; uniform float uPow; uniform float uK;
void main() {
  vec2 fc = gl_FragCoord.xy / uDpr; fc.y = uH - fc.y;
  float d = length(fc - uCenter) / uRadius;
  float a = 1.0 - smoothstep(0.0, 1.0, d);
  a = pow(a, uPow) * uK;
  a += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}`

const STAR_VERT = /* glsl */ `
attribute vec2 aPos; attribute vec3 aRnd;
uniform vec2 uOff; uniform float uDpr; uniform float uWide; uniform vec2 uSize; uniform float uAlpha; uniform float uGlint; uniform float uCine;
varying float vA; varying float vB; varying float vH;
void main() {
  float kp = mix(1.0, smoothstep(0.30, 0.55, aPos.x), uWide);
  vec2 ndc = vec2(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0) + uOff;
  float on = step(aRnd.x, kp);
  gl_Position = on > 0.5 ? vec4(ndc, 0.99999, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  vB = uCine > 0.5 ? aRnd.z * aRnd.z * aRnd.z : aRnd.z * aRnd.z;
  vH = aRnd.y;
  float sz = uCine > 0.5 ? uSize.x + vB * uSize.y : uSize.x + aRnd.y * uSize.y;
  gl_PointSize = (uGlint > 0.5 ? uSize.x : sz) * uDpr;
  vA = uAlpha * (uGlint > 0.5 ? 1.0 : uCine > 0.5 ? 0.16 + 0.84 * vB : 0.3 + 0.7 * vB);
}`
const STAR_FRAG = /* glsl */ `
uniform vec3 uInk; uniform vec3 uMuted; uniform float uGlint; uniform float uCine;
varying float vA; varying float vB; varying float vH;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float a;
  if (uGlint > 0.5) {
    float h = (1.0 - smoothstep(0.0, 0.09, abs(c.y))) * (1.0 - abs(c.x));
    float v = (1.0 - smoothstep(0.0, 0.09, abs(c.x))) * (1.0 - abs(c.y));
    a = clamp(h + v, 0.0, 1.0);
    a *= a;
  } else {
    a = 1.0 - smoothstep(0.45, 1.0, length(c));
  }
  vec3 col = mix(uMuted, uInk, vB);
  if (uCine > 0.5 && uGlint < 0.5) {
    col = mix(vec3(0.60, 0.72, 1.0), vec3(1.0, 0.84, 0.66), smoothstep(0.62, 1.0, fract(vH * 7.13)));
    col = mix(vec3(1.0), col, 0.6) * (0.5 + 0.75 * vB);
  }
  gl_FragColor = vec4(col, a * vA);
  #include <colorspace_fragment>
}`

const RIBBON_VERT = /* glsl */ `
attribute vec3 aA; attribute vec3 aB; attribute vec2 aCorner; attribute vec2 aTh; attribute vec2 aLen;
uniform vec2 uView; uniform float uHalf; uniform vec3 uC; uniform vec3 uCam;
varying float vTh; varying float vLen; varying float vSide; varying float vF;
void main() {
  mat4 mvp = projectionMatrix * modelViewMatrix;
  vec4 ca = mvp * vec4(aA, 1.0);
  vec4 cb = mvp * vec4(aB, 1.0);
  vec2 pa = ca.xy / ca.w * uView * 0.5;
  vec2 pb = cb.xy / cb.w * uView * 0.5;
  vec2 dir = pb - pa;
  dir = length(dir) < 1e-5 ? vec2(1.0, 0.0) : normalize(dir);
  vec2 nrm = vec2(-dir.y, dir.x);
  float w = uHalf + 1.0;
  vec4 c = mix(ca, cb, aCorner.x);
  vec2 off = (nrm * aCorner.y * w + dir * (aCorner.x * 2.0 - 1.0) * 0.6) / (uView * 0.5);
  gl_Position = c + vec4(off * c.w, 0.0, 0.0);
  vec3 wp = (modelMatrix * vec4(mix(aA, aB, aCorner.x), 1.0)).xyz;
  vF = dot(wp - uC, normalize(uCam - uC));
  vTh = mix(aTh.x, aTh.y, aCorner.x);
  vLen = mix(aLen.x, aLen.y, aCorner.x);
  vSide = aCorner.y * w;
}`
const RING_FRAG = /* glsl */ `
uniform vec3 uSolid; uniform vec3 uSoft; uniform float uHead; uniform float uSolidA; uniform float uSoftA; uniform float uOn; uniform float uFront;
varying float vTh; varying float vLen; varying float vSide; varying float vF;
void main() {
  if ((vF > 0.0 ? 1.0 : 0.0) != uFront) discard;
  float behind = 1.0 - smoothstep(uHead - 0.004, uHead + 0.004, vTh);
  float d = abs(vSide);
  float cov = mix(clamp(0.5 - d + 0.5, 0.0, 1.0), clamp(0.75 - d + 0.5, 0.0, 1.0), behind);
  float f = fract(vLen / 12.0);
  float dash = smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.5, 0.58, f));
  float tail = smoothstep(0.0, 0.25, vTh) * (1.0 - smoothstep(6.0, 6.28, vTh));
  float a = mix(uSoftA * dash, uSolidA * tail, behind) * cov * uOn;
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(uSoft, uSolid, behind), a);
  #include <colorspace_fragment>
}`

const BEAM_VERT = /* glsl */ `
attribute vec2 aTV; varying float vT; varying float vV;
void main() { vT = aTV.x; vV = aTV.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha; uniform float uCore; uniform float uTime; uniform float uHp0; uniform float uHp1;
uniform float uFill; uniform float uRings;
varying float vT; varying float vV;
void main() {
  float hp = mix(uHp0, uHp1, vT);
  float d = abs(vV) * hp;
  float fillA = (1.0 - abs(vV)) * mix(1.0, 0.6, vT);
  float core = (1.0 - smoothstep(0.5, 1.3, d)) * uCore;
  float edge = (1.0 - smoothstep(0.5, 1.3, abs(hp - d))) * 0.55;
  float rings = 0.0;
  for (int k = 0; k < 3; k++) {
    float s = fract(uTime / 2.4 + float(k) / 3.0);
    float arc = vT - s + 0.05 * vV * vV;
    rings += exp(-arc * arc / 0.00012) * sin(3.14159 * s);
  }
  float inside = 1.0 - smoothstep(0.96, 1.0, abs(vV));
  float a = uFill * fillA + core * 0.85 + edge + uRings * rings * inside * (0.35 + 0.65 * (1.0 - abs(vV)));
  a *= uAlpha * (1.0 - smoothstep(0.9, 1.0, vT) * 0.6) * smoothstep(0.0, 0.04, vT);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}`

/* 3d dark beam: a translucent cone with a fresnel-like soft edge, a hot core fading toward the footprint, four faint travelling rings */
const BEAM_FRAG_3D = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha; uniform float uCore; uniform float uTime; uniform float uHp0; uniform float uHp1;
uniform float uFill; uniform float uRings;
varying float vT; varying float vV;
void main() {
  float av = abs(vV);
  float body = sqrt(max(0.0, 1.0 - av * av));
  float soft = 1.0 - smoothstep(0.80, 1.0, av);
  float rim = smoothstep(0.62, 0.95, av) * soft;
  float dens = 0.5 * body + 0.34 * rim;
  float along = mix(1.0, 0.34, smoothstep(0.0, 1.0, vT));
  float hot = exp(-av * av * mix(5.0, 16.0, vT)) * pow(1.0 - vT, 2.4) * uCore;
  float rings = 0.0;
  for (int k = 0; k < 4; k++) {
    float s = fract(uTime / 3.4 + float(k) / 4.0);
    float bulge = 0.022 * body;
    float f = vT - s - bulge, b = vT - s + bulge;
    rings += (exp(-f * f / 0.000030) + 0.45 * exp(-b * b / 0.000030)) * sin(3.14159 * s);
  }
  float pool = smoothstep(0.86, 1.0, vT) * (1.0 - av) * (1.0 - av);
  float a = uFill * 1.5 * along * dens + hot * 0.8 + uRings * 0.55 * rings * body * (0.5 + 0.5 * (1.0 - vT)) + pool * uFill * 1.3;
  a *= uAlpha * smoothstep(0.0, 0.03, vT) * (1.0 - smoothstep(0.985, 1.0, vT) * 0.5);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * (1.0 + 2.2 * hot + 0.5 * pool), clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}`

export async function createOrbitScene({ THREE, renderer, size, theme, tier = '25', beats = [] } = {}) {
  const persp = tier === '3d'
  const disposables = []
  const track = (d) => { disposables.push(d); return d }
  const scene = new THREE.Scene()
  const camera = persp ? new THREE.PerspectiveCamera(L.FOV3D, 1, 0.5, 200) : new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50)
  scene.add(camera)

  let themeName = theme ?? (typeof document !== 'undefined' ? document.documentElement.dataset.theme : null) ?? 'dark'
  if (themeName !== 'light') themeName = 'dark'
  let T = ORBIT_THEMES[themeName]

  // ------------------------------------------------------------------ parts
  const sat = await makeOrbitSat(THREE, { tier, theme: T, disposables })
  const earth = await makeOrbitEarth(THREE, { tier, theme: T, renderer, disposables })
  const satHolder = new THREE.Group()
  satHolder.add(sat.group)
  const earthHolder = new THREE.Group()
  earthHolder.add(earth.group)
  scene.add(earthHolder, satHolder)

  // ------------------------------------------------------------------ cinematic rig (3d dark only): warm key from the right, above and a touch behind,
  // a very low cool fill from the Earth glow below. No ambient. Standard materials only; the Earth shaders carry their own sun.
  const cineSunDir = new THREE.Vector3(0.9, 0.42, -0.12).normalize()
  const cineLights = new THREE.Group()
  if (persp) {
    const key = new THREE.DirectionalLight(0xfff1d8, 3.4)
    key.position.copy(cineSunDir).multiplyScalar(30)
    const fill = new THREE.DirectionalLight(0x4f86d6, 0.45)
    fill.position.set(-0.15, -1, 0.55).normalize().multiplyScalar(30)
    const kick = new THREE.DirectionalLight(0x8fb0e8, 0.22)
    kick.position.set(-0.6, 0.3, 1).normalize().multiplyScalar(30)
    cineLights.add(key, fill, kick)
    cineLights.visible = false
    scene.add(cineLights)
  }
  let post = null

  // ------------------------------------------------------------------ space lift + stars
  const liftU = { uColor: { value: new THREE.Color() }, uCenter: { value: new THREE.Vector2() }, uRadius: { value: 1 }, uH: { value: 1 }, uDpr: { value: 1 } }
  liftU.uPow = { value: 1 }; liftU.uK = { value: 1 }
  const lift = new THREE.Mesh(
    track(new THREE.PlaneGeometry(2, 2)),
    track(new THREE.ShaderMaterial({ vertexShader: LIFT_VERT, fragmentShader: LIFT_FRAG, uniforms: liftU, transparent: true, depthWrite: false, depthTest: true })),
  )
  lift.frustumCulled = false
  lift.renderOrder = -100
  scene.add(lift)

  const rnd = mulberry(11)
  const N_STARS = persp ? 2600 : 900
  const sPos = new Float32Array(N_STARS * 2), sRnd = new Float32Array(N_STARS * 3)
  for (let i = 0; i < N_STARS; i += 1) {
    sPos[i * 2] = rnd(); sPos[i * 2 + 1] = rnd()
    sRnd[i * 3] = rnd(); sRnd[i * 3 + 1] = rnd(); sRnd[i * 3 + 2] = rnd()
  }
  const starU = {
    uOff: { value: new THREE.Vector2() }, uDpr: { value: 1 }, uWide: { value: 1 }, uSize: { value: new THREE.Vector2(0.8, 1.2) },
    uAlpha: { value: 1 }, uGlint: { value: 0 }, uCine: { value: 0 }, uInk: { value: new THREE.Color() }, uMuted: { value: new THREE.Color() },
  }
  const starMat = track(new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: starU, transparent: true, depthWrite: false, depthTest: true }))
  const starGeo = track(new THREE.BufferGeometry())
  starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_STARS * 3), 3))
  starGeo.setAttribute('aPos', new THREE.BufferAttribute(sPos, 2))
  starGeo.setAttribute('aRnd', new THREE.BufferAttribute(sRnd, 3))
  const stars = new THREE.Points(starGeo, starMat)
  stars.frustumCulled = false
  stars.renderOrder = -90
  scene.add(stars)
  // a handful of four-point glints (dark only)
  const GL = [[0.905, 0.085], [0.965, 0.3], [0.72, 0.045], [0.6, 0.42], [0.985, 0.17], [0.82, 0.3]]
  const gPos = new Float32Array(GL.length * 2), gRnd = new Float32Array(GL.length * 3)
  GL.forEach((q, i) => { gPos.set(q, i * 2); gRnd.set([0, 0.5, 0.9], i * 3) })
  const glintU = { ...starU, uGlint: { value: 1 }, uSize: { value: new THREE.Vector2(13, 0) }, uAlpha: { value: 0.55 } }
  const glintGeo = track(new THREE.BufferGeometry())
  glintGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GL.length * 3), 3))
  glintGeo.setAttribute('aPos', new THREE.BufferAttribute(gPos, 2))
  glintGeo.setAttribute('aRnd', new THREE.BufferAttribute(gRnd, 3))
  const glints = new THREE.Points(glintGeo, track(new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: glintU, transparent: true, depthWrite: false, depthTest: true })))
  glints.frustumCulled = false
  glints.renderOrder = -89
  scene.add(glints)

  // ------------------------------------------------------------------ orbit ring (screen-space ribbon, 256 segments)
  const ringN = RING_SEGS * 4
  const ringA = new Float32Array(ringN * 3), ringB = new Float32Array(ringN * 3)
  const ringCorner = new Float32Array(ringN * 2), ringTh = new Float32Array(ringN * 2), ringLen = new Float32Array(ringN * 2)
  const ringIdx = new Uint16Array(RING_SEGS * 6)
  for (let i = 0; i < RING_SEGS; i += 1) {
    const v = i * 4
    ringCorner.set([0, -1, 0, 1, 1, -1, 1, 1], v * 2)
    ringIdx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6)
  }
  const ringGeo = track(new THREE.BufferGeometry())
  const ringAAttr = new THREE.BufferAttribute(ringA, 3)
  ringGeo.setAttribute('position', ringAAttr)
  ringGeo.setAttribute('aA', ringAAttr)
  ringGeo.setAttribute('aB', new THREE.BufferAttribute(ringB, 3))
  ringGeo.setAttribute('aCorner', new THREE.BufferAttribute(ringCorner, 2))
  ringGeo.setAttribute('aTh', new THREE.BufferAttribute(ringTh, 2))
  ringGeo.setAttribute('aLen', new THREE.BufferAttribute(ringLen, 2))
  ringGeo.setIndex(new THREE.BufferAttribute(ringIdx, 1))
  const ringU = {
    uView: { value: new THREE.Vector2(1, 1) }, uHalf: { value: 0.75 }, uHead: { value: 0 }, uOn: { value: 1 },
    uSolid: { value: new THREE.Color() }, uSoft: { value: new THREE.Color() }, uSolidA: { value: 0.95 }, uSoftA: { value: 0.9 },
  }
  ringU.uC = { value: new THREE.Vector3() }
  ringU.uCam = { value: new THREE.Vector3(0, 0, 100) }
  // two halves split by depth around the Earth centre: the back half draws before the Earth (renderOrder 5, the 2.5D disk is
  // 10), the front half after it (20). The sphere tiers also depth-test against the Earth.
  const ringHalf = (front) => {
    const mat = track(new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT, fragmentShader: RING_FRAG, uniforms: { ...ringU, uFront: { value: front ? 1 : 0 } },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    }))
    const mesh = new THREE.Mesh(ringGeo, mat)
    mesh.frustumCulled = false
    mesh.renderOrder = front ? 20 : 5
    scene.add(mesh)
    return mesh
  }
  const ringBack = ringHalf(false), ringFront = ringHalf(true)

  // ------------------------------------------------------------------ scan beam (a wedge: 4 vertices, rebuilt every frame)
  const beamPos = new Float32Array(12)
  const beamGeo = track(new THREE.BufferGeometry())
  const beamPosAttr = new THREE.BufferAttribute(beamPos, 3)
  beamPosAttr.setUsage(THREE.DynamicDrawUsage)
  beamGeo.setAttribute('position', beamPosAttr)
  beamGeo.setAttribute('aTV', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), 2))
  beamGeo.setIndex([0, 1, 2, 2, 1, 3])
  const beamU = {
    uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uCore: { value: 1 }, uTime: { value: 0 }, uHp0: { value: 2 }, uHp1: { value: 40 },
    uFill: { value: 0.12 }, uRings: { value: 0.4 },
  }
  const beamMat = track(new THREE.ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, uniforms: beamU, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide }))
  const beam = new THREE.Mesh(beamGeo, beamMat)
  beam.frustumCulled = false
  beam.renderOrder = 30
  beam.visible = false
  scene.add(beam)

  // ------------------------------------------------------------------ DOM labels
  const host = renderer?.domElement?.parentElement
  const dom = host ? makeOrbitLabels(host) : null
  if (dom) {
    dom.add('sat', 'SATELLITE', 2, 'l')
    dom.add('s2', 'SENTINEL-2', 2, 'l')
    dom.add('cal', 'CALIFORNIA', 1, 'c', true)
    dom.add('three', '3 RESERVOIRS', 1, 'r')
    dom.add('water', 'WATER LEVEL', 1, 'l')
    dom.add('rice', 'RICE', 1, 'l')
    dom.add('acre', 'ACREAGE', 1, 'l')
  }

  // ------------------------------------------------------------------ state shared by resize() and update()
  const view = { w: 1, h: 1, dpr: 1, aspect: 1 }
  let lay = L.layoutFor(1280, 720)
  let cam = L.cameraModel(tier, 16 / 9)
  let C = [0, 0, 0], R = 1
  let plane = null
  let rotBase = 0, rotSign = 1
  let thMin = 0, thMax = 0
  let trackSgn = 1
  const earthRpxRef = { v: 1 }
  const earthView = { rot: 0, sunAz: 0, lensR: 0.12, trackN: new THREE.Vector3(0, 1, 0), trackHead: 0, pxScale: 1, time: 0 }
  const story = { lakeOn: [0, 0, 0], waterT: 0.25, pour: 0, grow: 0, iris: 0, ringScale: 1, ringRot: 0, scanAlpha: 0, pulse: 0 }
  const poseArg = { yaw: 0, pitch: 0, roll: 0, wing: 0, dishYaw: 0, dishPitch: 30 * RAD, parallax: { x: 0, y: 0 } }
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3()
  const vG = new THREE.Vector3(), vA = new THREE.Vector3()
  const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3()
  const mBasis = new THREE.Matrix4()
  const arr = (v) => [v.x, v.y, v.z]
  const rotAt = (p) => rotBase + rotSign * 10 * RAD * p
  const camZAt = (p) => (persp ? -L.PUSH * p : 0)
  const pxPerWorld = (depth) => (persp ? view.h / (2 * depth * cam.tanH) : view.h / 2)
  const proj = (P, camZ = 0) => L.projectPx(cam, P, view.w, view.h, camZ)

  const earthAt = (rot, camZ = 0) => {
    earthView.rot = rot
    earthHolder.position.set(C[0], C[1], C[2])
    earthHolder.scale.setScalar(R)
    earthHolder.updateMatrixWorld(true)
    earth.setView(earthView)
    earth.regionWorld(vG)
    return L.projectPx(cam, arr(vG), view.w, view.h, camZ)
  }

  /** One-off per resize: pick the rotation base that lands the region on its anchor, then nudge the Earth centre by the residual. */
  function alignEarth() {
    const target = lay.px.r0
    let best = { d: Infinity, rot: 0 }
    const STEPS = 120
    const probe = (rot) => {
      const s = earthAt(rot)
      const cdir = L.vnorm(L.vsub(arr(vG), C))
      const toCam = persp ? L.vnorm(L.vsub([0, 0, 0], arr(vG))) : [0, 0, 1]
      const front = L.vdot(cdir, toCam) > 0.12
      return front ? Math.hypot(s[0] - target[0], s[1] - target[1]) : Infinity
    }
    for (let i = 0; i < STEPS; i += 1) {
      const rot = -Math.PI + (i / STEPS) * TAU
      const d = probe(rot)
      if (d < best.d) best = { d, rot }
    }
    let lo = best.rot - TAU / STEPS, hi = best.rot + TAU / STEPS
    for (let k = 0; k < 28; k += 1) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3
      if (probe(m1) < probe(m2)) hi = m2
      else lo = m1
    }
    rotBase = (lo + hi) / 2
    // direction of the scripted rotation: the region must drift right (prograde, west to east)
    const a = earthAt(rotBase), b = earthAt(rotBase + 0.05)
    rotSign = b[0] >= a[0] ? 1 : -1
    // residual -> shift the Earth centre so the region sits exactly on the anchor (the limb moves by the same few px)
    for (let it = 0; it < 3; it += 1) {
      const s = earthAt(rotBase)
      const dx = target[0] - s[0], dy = target[1] - s[1]
      const depth = persp ? -C[2] : 1
      C = [C[0] + dx / pxPerWorld(depth), C[1] - dy / pxPerWorld(depth), C[2]]
    }
    return Math.hypot(...[0, 1].map((i) => earthAt(rotBase)[i] - target[i]))
  }

  function sphereHit(ndc) {
    const r = L.rayThrough(cam, ndc[0], ndc[1])
    const oc = L.vsub(r.O, C)
    const b = L.vdot(oc, r.D), c = L.vdot(oc, oc) - R * R
    const t = -b - Math.sqrt(Math.max(0, b * b - c))
    return L.vadd(r.O, L.vscale(r.D, t))
  }

  function buildRing(thStart) {
    const pts = []
    for (let i = 0; i <= RING_SEGS; i += 1) pts.push(plane.at(thStart + (i / RING_SEGS) * TAU))
    let len = 0
    const px = pts.map((P) => proj(P))
    for (let i = 0; i < RING_SEGS; i += 1) {
      const A = pts[i], B = pts[i + 1], v = i * 4
      const seg = Math.hypot(px[i + 1][0] - px[i][0], px[i + 1][1] - px[i][1])
      for (let c = 0; c < 4; c += 1) {
        ringA.set(A, (v + c) * 3); ringB.set(B, (v + c) * 3)
        ringTh.set([(i / RING_SEGS) * TAU, ((i + 1) / RING_SEGS) * TAU], (v + c) * 2)
        ringLen.set([len, len + seg], (v + c) * 2)
      }
      len += seg
    }
    for (const n of ['position', 'aB', 'aTh', 'aLen']) ringGeo.attributes[n].needsUpdate = true
  }

  const spanFrac = (p) => lerp(lay.sat.span, lay.sat.span1, p)
  const satHalfSpanPx = (p) => spanFrac(p) * view.w * 0.5

  // ------------------------------------------------------------------ theme
  function setTheme(name) {
    themeName = name === 'light' ? 'light' : 'dark'
    T = ORBIT_THEMES[themeName]
    const cine = persp && themeName === 'dark'
    scene.background = new THREE.Color(cine ? '#04060d' : T.bg)
    liftU.uColor.value.set(cine ? '#2a4a88' : T.space)
    liftU.uPow.value = cine ? 1.6 : 1
    liftU.uK.value = cine ? 0.4 : 1
    starU.uCine.value = cine ? 1 : 0
    cineLights.visible = cine
    if (!cine && post) { post.dispose(); post = null }
    starU.uInk.value.set(T.ink); starU.uMuted.value.set(T.inkMuted)
    glintU.uInk.value.set(T.ink); glintU.uMuted.value.set(T.ink)
    const dark = Boolean(T.additive)
    starU.uSize.value.set(cine ? 0.8 : dark ? 0.7 : 0.9, cine ? 1.5 : dark ? 1.3 : 0.7)
    starU.uAlpha.value = dark ? 1 : 0.35
    starGeo.setDrawRange(0, cine ? N_STARS : dark ? 900 : 220)
    glints.visible = dark
    ringU.uSolid.value.set(T.thread); ringU.uSoft.value.set(T.threadSoft)
    ringU.uSoftA.value = dark ? 0.9 : 0.85
    beamU.uColor.value.set(T.thread)
    beamU.uFill.value = dark ? 0.2 : 0.09
    beamU.uRings.value = dark ? 0.45 : 0.35
    beamMat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending
    beamMat.fragmentShader = cine ? BEAM_FRAG_3D : BEAM_FRAG
    if (cine) { beamU.uFill.value = 0.11; beamU.uRings.value = 0.36 }
    beamMat.needsUpdate = true
    sat.setTheme(T)
    earth.setTheme(T)
    dom?.theme(T)
  }

  // ------------------------------------------------------------------ resize: layout, camera, Earth, orbit plane
  function resize(w, h, dpr = 1) {
    view.w = w; view.h = h; view.dpr = dpr; view.aspect = w / h
    lay = L.layoutFor(w, h)
    cam = L.cameraModel(tier, view.aspect)
    if (persp) { camera.aspect = view.aspect; camera.position.set(0, 0, 0) } else { camera.left = -view.aspect; camera.right = view.aspect; camera.top = 1; camera.bottom = -1 }
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    const place = L.earthPlacement(cam, lay)
    C = place.C; R = place.R
    alignEarth()
    earthRpxRef.v = lay.px.earth.r
    earthView.lensR = lay.px.lensR / lay.px.earth.r
    earthView.pxScale = dpr // device px per CSS px (the Earth draws its lines in CSS px)

    // orbit plane from the region at p = 0.30
    earthAt(rotAt(0.3))
    const G = arr(vG)
    const s0 = L.toNdc(...lay.sat.s0), s1 = L.toNdc(...lay.sat.s1)
    plane = L.buildOrbitPlane({ cam, C, R, G, ndcS0: s0, ndcS1: s1, depthHint: persp ? L.DEPTH_SAT : 1.6 * R })
    {
      // which way the track must run so that the satellite is "before" the region (see update)
      const gd = L.vnorm(L.vsub(G, C))
      const Nn = L.vnorm(L.vsub(plane.N, L.vscale(gd, L.vdot(plane.N, gd))))
      const sd = L.vnorm(L.vsub(plane.at(lerp(plane.th0, plane.th1, L.satPath(0.3))), C))
      trackSgn = Math.atan2(L.vdot(sd, L.vcross(Nn, gd)), L.vdot(sd, gd)) > 0 ? -1 : 1
    }
    buildRing(plane.th0 - 0.6)
    ringU.uView.value.set(w, h)

    // copy clamp on the satellite angle (wing tips)
    const half = satHalfSpanPx(0)
    const margin = 0.008 * w
    const ok = (th, side) => {
      const s = proj(plane.at(th))
      return side === 'min' ? s[0] - half >= lay.px.xMin + margin : s[0] + half <= lay.px.xMax - margin && s[1] <= lay.px.yMax
    }
    thMin = plane.th0
    for (let i = 0; i < 400 && !ok(thMin, 'min'); i += 1) thMin += 0.002
    thMax = plane.th1
    for (let i = 0; i < 400 && !ok(thMax, 'max'); i += 1) thMax -= 0.002
    if (thMin > thMax) thMin = thMax = clamp(plane.th0, Math.min(thMin, thMax), Math.max(thMin, thMax))

    liftU.uCenter.value.set(lay.px.earth.cx, lay.px.earth.cy)
    liftU.uRadius.value = persp && themeName === 'dark' ? Math.max(0.9 * h, 1.9 * lay.px.earth.r) : 0.9 * h
    liftU.uH.value = h
    liftU.uDpr.value = dpr
    starU.uDpr.value = dpr
    glintU.uDpr.value = dpr
    starU.uWide.value = lay.m
    glintU.uWide.value = lay.m

    if (dom) {
      const wide = lay.m > 0.5
      dom.size(w, h, wide ? { xMin: Math.max(0.5 * w, lay.px.copyR + 0.02 * w), xMax: w - 6 } : { xMin: 6, xMax: w - 6, yMax: 0.56 * h })
    }
  }

  // ------------------------------------------------------------------ update: the storyboard, every driver a plain function of p
  function update(ctx) {
    const reduced = ctx.reduced
    const p = reduced ? 1 : clamp(ctx.p, 0, 1)
    const time = reduced ? 6 : ctx.time
    const ptx = reduced ? 0 : ctx.pointer.sx
    const pty = reduced ? 0 : ctx.pointer.sy
    const camZ = camZAt(p)
    if (persp) { camera.position.z = camZ; camera.updateMatrixWorld() }

    // ---- parallax (section 3.1): world offsets per layer
    const depthE = persp ? -C[2] + camZ : 1
    const wpwE = L.worldPerWidth(cam, depthE)
    const earthOff = [ptx * 0.002 * wpwE, pty * 0.002 * wpwE, 0]
    const starOff = [ptx * 0.003 * 2, pty * 0.003 * 2]

    // ---- Earth: scripted rotation, region, ground track
    earthView.rot = rotAt(p)
    earthView.sunAz = 8 * RAD * p
    earthHolder.position.set(C[0] + earthOff[0], C[1] + earthOff[1], C[2])
    earthHolder.scale.setScalar(R)
    earthHolder.updateMatrixWorld(true)
    earth.setView(earthView)
    earth.regionWorld(vG)
    const Cn = [C[0] + earthOff[0], C[1] + earthOff[1], C[2]]
    const Gn = arr(vG)
    const gdir = L.vnorm(L.vsub(Gn, Cn))

    // ---- satellite on the orbit circle
    const th = clamp(lerp(plane.th0, plane.th1, L.satPath(p)), thMin, thMax)
    const bob = reduced ? 0 : Math.sin((time / 9) * TAU) * 0.003 * 2 // +/-0.003 h
    const satOffW = L.worldPerWidth(cam, persp ? 8 : 1) * 0.008
    const sp = plane.at(th)
    const S = [sp[0] + earthOff[0] + ptx * satOffW * (1 - 0.25) , sp[1] + earthOff[1] + pty * satOffW + bob * (persp ? 4 : 1), sp[2]]

    // ---- ground track frame: the orbit plane normal made to contain the region (the Earth does the same), travel direction T
    const sdir = L.vnorm(L.vsub(S, Cn))
    v0.set(...plane.N).multiplyScalar(trackSgn)
    v1.set(...gdir)
    v0.addScaledVector(v1, -v0.dot(v1)).normalize()
    const TN = arr(v0)
    const TT = L.vcross(TN, gdir)
    const angSub = Math.atan2(L.vdot(sdir, TT), L.vdot(sdir, gdir)) // < 0: the sub-satellite point is before the region
    // head of the ground track = the footprint: follows the satellite until p 0.10, slides to the region by 0.24, then runs on across the disk
    const head = p < 0.1 ? angSub : p < 0.24 ? lerp(angSub, 0, smooth(0.1, 0.24, p)) : 1.15 * smooth(0.3, 1, p)
    dbg.angSub = angSub; dbg.head = head; dbg.sgn = trackSgn
    const F = p >= 0.24 ? Gn : L.vadd(Cn, L.vscale(L.vadd(L.vscale(gdir, Math.cos(head)), L.vscale(TT, Math.sin(head))), R))

    // ---- satellite pose: nadir at the footprint, wings across the screen (3D tiers)
    const wingAng = lerp(72, 8, smooth(0, 0.18, p)) * RAD
    const spanF = spanFrac(p)
    const depthS = persp ? camZ - S[2] : 1
    const scl = L.satScale(cam, depthS, spanF, sat.span)
    satHolder.position.set(S[0], S[1], S[2])
    satHolder.scale.setScalar(scl)
    if (tier === '25') {
      satHolder.quaternion.identity()
    } else {
      const [X, Y, Z] = L.satBasis(S, F, [-1, 0, 0])
      bx.set(...X); by.set(...Y); bz.set(...Z)
      mBasis.makeBasis(bx, by, bz)
      satHolder.quaternion.setFromRotationMatrix(mBasis)
      if (persp) poseArg.camDir = (poseArg.camDir ?? new THREE.Vector3()).set(-S[0], -S[1], camZ - S[2]).normalize() // orbit-sat faces the wings to it
    }
    poseArg.yaw = -10 * RAD * smooth(0, 0.18, p) + (reduced ? 0 : Math.sin((time / 13) * TAU) * 0.4 * RAD)
    poseArg.roll = 3 * RAD * smooth(0.3, 0.55, p)
    poseArg.wing = wingAng // orbit-sat adds the boom angle that faces the camera
    poseArg.dishYaw = (25 * smooth(0, 0.18, p) + 15 * smooth(0.88, 1, p)) * RAD
    poseArg.parallax.x = ptx
    poseArg.parallax.y = pty
    sat.setPose(poseArg)
    satHolder.updateMatrixWorld(true)
    sat.aperture.getWorldPosition(vA)

    // ---- story drivers for the Earth (lens, water, rice)
    const pour = 1 - (1 - clamp((p - 0.3) / 0.25, 0, 1)) ** 1.8
    const lock = clamp((p - 0.24) / 0.08, 0, 1)
    story.lakeOn[0] = smooth(0.27, 0.3, p); story.lakeOn[1] = smooth(0.29, 0.32, p); story.lakeOn[2] = smooth(0.31, 0.34, p)
    story.waterT = 0.25 + 0.08 * pour
    story.pour = pour
    story.grow = smooth(0.55, 0.88, p)
    story.iris = smooth(0.25, 0.3, p)
    story.ringScale = p < 0.24 ? lerp(1, 2.2, smooth(0.1, 0.16, p)) : lerp(2.2, 1, backOut(lock))
    story.ringRot = lock * 45 * RAD
    story.scanAlpha = smooth(0.1, 0.16, p) * (1 - smooth(0.32, 0.38, p))
    story.pulse = clamp((p - 0.92) / 0.08, 0, 1) // ripple progress 0..1 (0 and 1 draw nothing)
    earth.setStory(story)

    earthView.trackN.set(...TN)
    earthView.trackHead = head
    earthView.time = time
    earth.setView(earthView)

    // ---- scan beam: aperture to footprint
    const alpha = smooth(0.1, 0.16, p) * (1 - smooth(0.88, 0.94, p)) * curve(p, [[0, 0.8], [0.24, 0.85], [0.28, 1.0], [0.32, 0.75], [0.55, 0.55], [0.88, 0.25], [1, 0.25]])
    beam.visible = alpha > 0.003
    if (beam.visible) {
      const half = lerp(14, 1.6, inOutCubic(lock)) * RAD
      const ax = [F[0] - vA.x, F[1] - vA.y, F[2] - vA.z]
      const len = persp ? L.vlen(ax) : Math.hypot(ax[0], ax[1]) // ortho: the cone angle lives in the screen plane
      const mid = [(F[0] + vA.x) / 2, (F[1] + vA.y) / 2, (F[2] + vA.z) / 2]
      const viewDir = persp ? L.vnorm(L.vsub([0, 0, camZ], mid)) : [0, 0, 1]
      let wdir = L.vcross(ax, viewDir)
      wdir = L.vlen(wdir) < 1e-6 ? [1, 0, 0] : L.vnorm(wdir)
      const depthA = persp ? camZ - vA.z : 1, depthF = persp ? camZ - F[2] : 1
      const hp0 = Math.max(1.5, 0)
      const hw0 = hp0 / pxPerWorld(depthA)
      const hwF = Math.max(len * Math.tan(half), 1.5 / pxPerWorld(depthF))
      const pts = [L.vadd([vA.x, vA.y, vA.z], L.vscale(wdir, -hw0)), L.vadd([vA.x, vA.y, vA.z], L.vscale(wdir, hw0)), L.vadd(F, L.vscale(wdir, -hwF)), L.vadd(F, L.vscale(wdir, hwF))]
      for (let i = 0; i < 4; i += 1) beamPos.set(pts[i], i * 3)
      beamPosAttr.needsUpdate = true
      beamU.uAlpha.value = alpha
      beamU.uCore.value = curve(p, [[0, 0.7], [0.24, 0.8], [0.28, 1.0], [0.32, 0.8]])
      beamU.uTime.value = time
      beamU.uHp0.value = hp0
      beamU.uHp1.value = hwF * pxPerWorld(depthF)
    }

    // ---- ring head, stars, lift
    ringBack.position.set(earthOff[0], earthOff[1], 0)
    ringFront.position.copy(ringBack.position)
    ringU.uC.value.set(Cn[0], Cn[1], Cn[2])
    ringU.uCam.value.set(persp ? 0 : Cn[0], persp ? 0 : Cn[1], persp ? camZ : 100)
    ringU.uHead.value = th - (plane.th0 - 0.6)
    starU.uOff.value.set(starOff[0] * 0.5, starOff[1] * 0.5)
    glintU.uOff.value.copy(starU.uOff.value)

    // ---- labels (DOM, only touched when they move or fade)
    if (dom) {
      dom.fade(renderer.domElement.style.opacity || '')
      const sp0 = proj(S, camZ)
      const regionPx = proj(Gn, camZ)
      let lensPx = lay.px.lensR
      const rr = earth.regionScreenRadius?.(camera, size ?? view)
      if (rr > 1) lensPx = rr
      const m = lay.m, wide = m > 0.5
      const halfSpan = satHalfSpanPx(p)
      const sx = sp0[0], sy = sp0[1]
      const aSat = smooth(0.02, 0.08, p) * (1 - smooth(0.2, 0.26, p))
      dom.put('sat', sx + halfSpan + 14, sy - 10, aSat, 'l')
      dom.put('s2', sx + halfSpan + 14, sy + 10, aSat, 'l')
      const cx = regionPx[0], cy = regionPx[1], Rl = lensPx
      // CALIFORNIA: a pin whose stem ends on the lens rim (up and to the right so the beam stays clear)
      const aCal = smooth(0.2, 0.26, p) * (1 - smooth(0.34, 0.4, p))
      dom.put('cal', cx + Rl * 0.55, cy - Rl * 0.84 - 4 - 17 - 9, aCal, 'c')
      const off = (a, b) => lerp(a, b, m)
      dom.put('three', cx + off(-1.2, -1.1) * Rl, cy + off(0.3, 0.85) * Rl, smooth(0.3, 0.35, p), 'r')
      const aWater = smooth(0.34, 0.39, p) * (1 - smooth(0.55, 0.6, p))
      if (wide) dom.put('water', cx + 1.18 * Rl, cy - 0.62 * Rl, aWater, 'l')
      else dom.put('water', cx - 1.2 * Rl, cy - 0.6 * Rl, aWater, 'r')
      dom.put('rice', cx + 1.2 * Rl, cy + off(-0.1, 0.05) * Rl, smooth(0.58, 0.63, p), 'l')
      dom.put('acre', cx + 1.2 * Rl, cy + off(0.45, 0.68) * Rl, smooth(0.7, 0.75, p) * (1 - smooth(0.9, 0.95, p)), 'l')
      dbg.sat = [sx, sy]; dbg.half = halfSpan; dbg.region = [cx, cy]; dbg.lens = Rl; dbg.p = p
    }
  }

  function render(rend, ctx, target) {
    if (persp && themeName === 'dark') {
      if (!ctx?.reduced) {
        post ??= createCinePost(THREE)
        const pp = clamp(ctx?.p ?? 0, 0, 1)
        const roll = (-0.0026 + 0.0052 * pp) + Math.sin(((ctx?.time ?? 0) / 17) * TAU) * 0.0004
        post.render(rend, scene, camera, target ?? null, { time: ctx?.time ?? 0, roll })
      } else {
        // reduced motion: no post stack, but keep the filmic curve for the standard materials
        const prevTm = rend.toneMapping, prevEx = rend.toneMappingExposure
        rend.toneMapping = THREE.ACESFilmicToneMapping; rend.toneMappingExposure = 1.1
        rend.setRenderTarget(target ?? null)
        rend.render(scene, camera)
        rend.toneMapping = prevTm; rend.toneMappingExposure = prevEx
      }
    } else {
      rend.setRenderTarget(target ?? null)
      rend.render(scene, camera)
    }
    stats.drawCalls = rend.info.render.calls
    stats.triangles = rend.info.render.triangles
  }

  function dispose() {
    sat.dispose?.()
    earth.dispose?.()
    for (const d of disposables) d.dispose?.()
    scene.traverse((o) => { o.geometry?.dispose?.() })
    post?.dispose(); post = null
    dom?.dispose()
  }

  const stats = { drawCalls: 0, triangles: 0 }
  const dbg = {}
  setTheme(themeName)
  if (size && size.w > 1) resize(size.w, size.h, size.dpr)
  else resize(1280, 720, 1)

  return {
    scene,
    camera,
    animated: true,
    look: 'full',
    variant: `orbit-${tier}`,
    beats,
    get theme() { return themeName },
    setTheme,
    update,
    resize,
    render,
    dispose,
    stats,
    dbg,
  }
}
