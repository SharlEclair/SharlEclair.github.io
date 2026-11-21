/**
 * Harvest URL variants (?harvest=chart | plates). Same story and the same 0..1 progress as the default scene, drawn as a
 * glowing data-field: one InstancedMesh of columns whose heights are the water level (reservoirs) and then the acreage
 * (rice fields), vertex-gradient shaded, with additive top caps for the glow (no post pass).
 *
 *   chart   columns standing on a dark city-like grid laid out over the real reservoir / field layout, thin axis + HUD bar
 *   plates  three translucent isometric plates (satellite view, water level, acreage) with the columns rising from them
 *
 * Loaded lazily by scene.js, never for the default look and never for look 'lcd'. Same module contract as the default scene.
 * Story (progress): 0.00-0.25 satellite sweeps, data lights up   0.25-0.55 water level falls as it pours to the fields
 *                   0.55-0.90 acreage columns grow in a wave      0.90-1.00 settle
 */
import { LAKES, buildNetwork, buildPaddies, heightAt, lakeD, rng, MAIN_Z } from './world.js'
import { makeSatellite, makeLabel } from './parts.js'
import * as S from './shaders.js'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

const THEMES = {
  dark: {
    bg: '#05060e', a: '#080c26', b: '#4a35c4', c: '#3f86ee', d: '#86f7ff', gnd: '#1a1f55', glow: '#5fe6ff',
    gndMix: 0.24, shade: [1.1, 0.62, 0.86], far: [42, 100], glowAmt: 0.85, additive: true,
    line: '#9db4ff', lineA: 0.5, hud: '#cfe0ff', hudAccent: '#5fe6ff', label: '#e6efff', labelAccent: '#5fe6ff', labelAccent2: '#a58bff',
    plateA: '#3b2fa8', plateB: '#1f7fc4', plateWarm: '#7a3bb8', plateAlpha: 0.2, dot: '#9fb2ff', dotLit: '#7df3ff', dotField: '#a58bff', edge: '#8fa6ff',
    sat: { gold: '#e9c06a', satDark: '#1a242c', accent: '#6bf0d8', panelBg: '#0d1440', panelGrid: '#6b8cff', panelFrame: '#f5b95a', panelEmissive: 0x16205c },
    swath: '#7df3ff', hemi: [0xcdd8ff, 0x0a0c20, 1.5], sun: 3,
  },
  light: {
    bg: '#e8e6db', a: '#131312', b: '#1b3f48', c: '#1d7d7c', d: '#2fb3a6', gnd: '#b9b8ac', glow: '#2a9d9a',
    gndMix: 0.16, shade: [1.12, 0.6, 0.84], far: [42, 100], glowAmt: 0.2, additive: false,
    line: '#131312', lineA: 0.55, hud: '#131312', hudAccent: '#0a7a6e', label: '#131312', labelAccent: '#0a7a3d', labelAccent2: '#c8372d',
    plateA: '#2a2f30', plateB: '#2a9d9a', plateWarm: '#2a2f30', plateAlpha: 0.1, dot: '#131312', dotLit: '#0a7a6e', dotField: '#2a2f30', edge: '#131312',
    sat: { gold: '#2a2a27', satDark: '#c8372d', accent: '#c8372d', panelBg: '#30312e', panelGrid: '#8f8e83', panelFrame: '#c8372d', panelEmissive: 0x000000 },
    swath: '#c8372d', hemi: [0xffffff, 0xd6d2c2, 1.2], sun: 1.7,
  },
}

/* ------------------------------------------------------------------ data: where the columns stand and how tall they get */
const FIELD_X = [-46, 46], FIELD_Z = [MAIN_Z, 45.5]
const PLATE = { x0: -56, z0: -42, w: 112, d: 92, ys: [0, 26, 52] } // plates variant: acreage, water level, satellite view

function buildColumns(mode) {
  const net = buildNetwork()
  const { paddies } = buildPaddies(net.dMain)
  const distMax = Math.max(...paddies.map((q) => q.dist))
  const rnd = rng(311)
  const cols = [] // { x, z, w, d, y, kind (0 ground, 1 lake, 2 field), lake, dist, t, seed }
  const sn = (x, z) => clamp(0.5 + 0.34 * Math.sin(x * 0.23 + 1.3) * Math.sin(z * 0.29 + 0.4) + 0.26 * Math.sin(x * 0.71 + z * 0.43), 0, 1)
  const plates = mode === 'plates'

  // acreage: a grid of cells inside every paddy
  const maxA = Math.max(...paddies.map((q) => q.w * q.d))
  for (const q of paddies) {
    const nx = Math.max(1, Math.round(q.w / 2.2)), nz = Math.max(1, Math.round(q.d / 2.2))
    const cw = q.w / nx, cd = q.d / nz
    const pf = 0.55 + 0.45 * Math.sqrt((q.w * q.d) / maxA)
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < nz; j += 1) {
        const x = q.cx - q.w / 2 + (i + 0.5) * cw, z = q.cz - q.d / 2 + (j + 0.5) * cd
        const r = rnd()
        let t = pf * (0.1 + 0.55 * sn(x, z) + 0.35 * r * r * r)
        if (rnd() < 0.09) t += 0.35
        cols.push({ x, z, w: cw, d: cd, y: plates ? PLATE.ys[0] : 0, kind: 2, lake: 0, dist: net.dMain(x) + (z - MAIN_Z), t: clamp(t, 0.1, 1), seed: rnd() })
      }
    }
  }

  // water level: a grid of cells inside every reservoir outline, deepest in the middle
  const cell = 2.0
  LAKES.forEach((L, k) => {
    const R = Math.max(L.r[0], L.r[1]) * 1.5
    for (let x = L.c[0] - R; x <= L.c[0] + R; x += cell) {
      for (let z = L.c[1] - R; z <= L.c[1] + R; z += cell) {
        const d = lakeD(k, x, z)
        if (d > 0.95) continue
        const r = rnd()
        cols.push({ x, z, w: cell, d: cell, y: plates ? PLATE.ys[1] : 0, kind: 1, lake: k, dist: 0, t: clamp(0.42 + 0.5 * (1 - d / 0.95) ** 0.6 + 0.14 * r, 0.1, 1), seed: rnd() })
      }
    }
  })

  // the quiet city-like grid under the chart: low columns that follow the real terrain
  if (!plates) {
    const step = 2.6
    for (let x = -96; x <= 96; x += step) {
      for (let z = -72; z <= 80; z += step) {
        if ((x / 98) ** 2 + ((z - 6) / 78) ** 2 > 1) continue
        if (x > FIELD_X[0] - 1 && x < FIELD_X[1] + 1 && z > FIELD_Z[0] - 1.4 && z < FIELD_Z[1] + 1.4) continue
        let inLake = false
        for (let k = 0; k < 3; k += 1) if (lakeD(k, x, z) < 1.12) { inLake = true; break }
        if (inLake) continue
        const r = rnd()
        cols.push({ x, z, w: step, d: step, y: 0, kind: 0, lake: 0, dist: 0, t: clamp(0.03 + heightAt(x, z) * 0.011 + 0.05 * r * r, 0.03, 0.2), seed: r })
      }
    }
  }
  return { cols, distMax }
}

/** Mask texture for the plates: R terrain, G reservoir outline, B rice fields (one texel per 2 x 2 world units). */
function buildMask(THREE) {
  const MW = 56, MH = 46
  const data = new Uint8Array(MW * MH * 4)
  for (let j = 0; j < MH; j += 1) {
    for (let i = 0; i < MW; i += 1) {
      const x = PLATE.x0 + (i + 0.5) * (PLATE.w / MW), z = PLATE.z0 + (j + 0.5) * (PLATE.d / MH)
      const o = (j * MW + i) * 4
      data[o] = clamp(heightAt(x, z) / 11, 0, 1) * 255
      let lake = 0
      for (let k = 0; k < 3; k += 1) if (lakeD(k, x, z) < 0.98) lake = 255
      data[o + 1] = lake
      data[o + 2] = x > FIELD_X[0] && x < FIELD_X[1] && z > FIELD_Z[0] && z < FIELD_Z[1] ? 255 : 0
      data[o + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, MW, MH, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

/* ------------------------------------------------------------------ shaders */
const COMMON = /* glsl */`
uniform float uTime, uSwX, uFront, uGrow, uSettle, uHmax, uDistMax;
uniform vec3 uLvl;
attribute vec4 aInfo;   // kind (0 ground, 1 reservoir, 2 field), reservoir index, distance to the main canal, seed
attribute float aT;     // target height, 0..1 of the chart height
float colHeight(vec4 info, float t, float x){
  float kind = info.x, seed = info.w;
  float lit = smoothstep(-4.0, 4.0, uSwX - x);               // the satellite has passed this column
  if (kind < 0.5) {
    float bump = exp(-pow((uSwX - x) / 3.0, 2.0)) * step(uSwX, 80.0) * step(-70.0, uSwX);
    return uHmax * t * (0.2 + 0.8 * lit) + bump * 0.9;
  }
  if (kind < 1.5) {
    int idx = int(info.y + 0.5);
    float lv = idx == 0 ? uLvl.x : (idx == 1 ? uLvl.y : uLvl.z);
    return uHmax * t * lv * lit * (1.0 + 0.03 * sin(uTime * 1.6 + seed * 20.0) + uSettle * 0.06 * sin(uTime * 2.4 + seed * 6.28));
  }
  float flood = smoothstep(info.z - 4.0, info.z + 2.0, uFront);
  float dn = info.z / uDistMax;
  float gp = smoothstep(0.0, 1.0, clamp(uGrow * 1.75 - dn * 0.75, 0.0, 1.0));
  float base = 0.03 * lit + 0.06 * flood;
  return uHmax * mix(base, max(t * (1.0 + 0.03 * sin(uTime * 1.3 + seed * 30.0)), base), gp);
}
`

const COL_VERT = /* glsl */`
${COMMON}
uniform vec2 uCenter, uFar;
varying vec3 vN;
varying float vWy, vFar, vWet, vKind;
void main(){
  vec4 base = instanceMatrix * vec4(position.x, 0.0, position.z, 1.0);
  float h = colHeight(aInfo, aT, base.x);
  vec4 wp = base;
  wp.y += position.y * h;
  vWy = position.y * h / uHmax;
  vN = normal;
  vKind = aInfo.x;
  float flood = smoothstep(aInfo.z - 4.0, aInfo.z + 2.0, uFront);
  float gp = smoothstep(0.0, 1.0, clamp(uGrow * 1.75 - aInfo.z / uDistMax * 0.75, 0.0, 1.0));
  vWet = step(1.5, aInfo.x) * flood * (1.0 - gp);
  vFar = smoothstep(uFar.x, uFar.y, length((base.xz - uCenter) * vec2(1.0, 1.25)));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

const COL_FRAG = /* glsl */`
uniform vec3 cA, cB, cC, cD, cBg;
uniform vec3 uShade;
uniform float uGndMix;
varying vec3 vN;
varying float vWy, vFar, vWet, vKind;
vec3 grad(float t){
  vec3 c = mix(cA, cB, smoothstep(0.0, 0.3, t));
  c = mix(c, cC, smoothstep(0.25, 0.7, t));
  return mix(c, cD, smoothstep(0.65, 1.0, t));
}
void main(){
  float yf = clamp(vWy, 0.0, 1.3);
  vec3 c = grad(yf);
  float sh = vN.y > 0.5 ? uShade.x : (abs(vN.x) > 0.5 ? uShade.y : uShade.z);
  c *= sh;
  if (vN.y > 0.5) c = mix(c, cD, 0.3 * smoothstep(0.08, 0.6, yf));
  if (vKind < 0.5) c = mix(cBg, c, uGndMix);
  c = mix(c, cD * 0.75, vWet * 0.32);
  c = mix(c, cBg, vFar * 0.9);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`

const CAP_VERT = /* glsl */`
${COMMON}
uniform float uGlowSize;
varying vec2 vUv;
varying float vA;
void main(){
  vUv = uv;
  vec4 base = instanceMatrix * vec4(position.x * uGlowSize, 0.0, position.z * uGlowSize, 1.0);
  float h = colHeight(aInfo, aT, instanceMatrix[3].x);
  float yf = h / uHmax;
  vA = step(0.5, aInfo.x) * smoothstep(0.06, 0.4, yf) * (0.5 + 0.7 * yf);
  base.y += h + 0.06;
  gl_Position = projectionMatrix * viewMatrix * base;
}`

const CAP_FRAG = /* glsl */`
uniform vec3 cGlow;
uniform float uGlowAmt;
varying vec2 vUv;
varying float vA;
void main(){
  float r = clamp(length(vUv - 0.5) * 2.0, 0.0, 1.0);
  float a = pow(1.0 - smoothstep(0.0, 1.0, r), 2.0) * vA * uGlowAmt;
  if (a < 0.003) discard;
  gl_FragColor = vec4(cGlow, a);
  #include <colorspace_fragment>
}`

const PLATE_VERT = /* glsl */`
attribute float aPlate;
varying vec2 vW;
varying float vPlate;
void main(){
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  vW = wp.xz;
  vPlate = aPlate;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

const PLATE_FRAG = /* glsl */`
uniform sampler2D uMask;
uniform vec4 uRect;
uniform float uSwX, uFront, uPourN, uGrow, uScan, uAlpha;
uniform vec3 cPA, cPB, cWarm, cDot, cLit, cField, cEdge;
uniform float uLight;
varying vec2 vW;
varying float vPlate;
void main(){
  vec2 g = (vW - uRect.xy) / uRect.zw;
  vec2 cells = vec2(56.0, 46.0);
  vec2 gc = g * cells;
  vec2 id = floor(gc);
  vec2 f = fract(gc) - 0.5;
  vec4 m = texture2D(uMask, (id + 0.5) / cells);
  float x = vW.x;
  float lit = smoothstep(-3.0, 3.0, uSwX - x);
  // rounded plate outline (signed distance in world units)
  vec2 q = abs(g - 0.5) * uRect.zw - (uRect.zw * 0.5 - 7.0);
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 7.0;
  float aa = max(fwidth(sd), 1e-3);
  float inside = 1.0 - smoothstep(-aa, aa, sd);
  float edge = (1.0 - smoothstep(0.0, aa * 2.0, abs(sd + 0.15)));
  float glowE = exp(-abs(sd) * 0.5) * 0.5;

  vec3 fill = mix(cPA, cPB, clamp(g.x * 0.7 + (1.0 - g.y) * 0.5, 0.0, 1.0));
  if (vPlate < 0.5) fill = mix(fill, cWarm, 0.45 * (1.0 - g.x));
  float dn = (vW.y - 10.4) / 34.0 * 0.5 + abs(x) / 46.0 * 0.5;
  float flood = smoothstep(dn * 0.85 - 0.12, dn * 0.85 + 0.12, uPourN);

  // LED dots
  float bright = 0.12;
  vec3 dc = cDot;
  if (vPlate > 1.5) {
    bright = mix(0.1, 0.25 + 0.5 * m.r, lit);
    if (m.g > 0.5) { dc = cLit; bright = mix(0.1, 0.95, lit); }
    else if (m.b > 0.5) { dc = mix(cField, cLit, uGrow); bright = mix(0.1, 0.85, lit); }
    bright += exp(-pow((uSwX - x) / 1.4, 2.0)) * uScan * 1.2;
  } else if (vPlate > 0.5) {
    if (m.g > 0.5) { dc = cLit; bright = 0.2 + 0.75 * lit; }
  } else {
    if (m.b > 0.5) { dc = mix(cField, cLit, uGrow); bright = 0.18 + 0.7 * flood; }
  }
  float rad = 0.2 + 0.12 * clamp(bright, 0.0, 1.0);
  float dot0 = 1.0 - smoothstep(rad - 0.07, rad + 0.05, length(f));
  float dotA = dot0 * clamp(bright, 0.0, 1.0);

  float a = uAlpha * inside * (0.55 + 0.45 * g.x) + (edge + glowE) * 0.55 * (inside + (1.0 - inside) * 0.55);
  a = clamp(a, 0.0, 1.0) * (inside + (1.0 - inside) * (edge + glowE));
  vec3 col = mix(fill, cEdge, clamp(edge * 0.9 + glowE * 0.4, 0.0, 1.0));
  col = mix(col, dc, dotA * inside);
  a = max(a, dotA * inside * 0.95);
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`

/* ------------------------------------------------------------------ the scene */
export async function createVariantScene({ THREE, renderer, size, theme, mode = 'chart', beats = [] } = {}) {
  const plates = mode === 'plates'
  const disposables = []
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 10, 1600)
  scene.add(camera)
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const V = (v) => ({ value: v })
  const col = () => V(new THREE.Color())
  let themeName = theme ?? (typeof document !== 'undefined' ? document.documentElement.dataset.theme : null) ?? 'dark'
  if (themeName !== 'light') themeName = 'dark'
  let T = THEMES[themeName]

  const HMAX = plates ? 13 : 17
  const { cols, distMax } = buildColumns(mode)

  const U = {
    uTime: V(0), uSwX: V(-999), uFront: V(0), uGrow: V(0), uSettle: V(0), uHmax: V(HMAX), uDistMax: V(distMax), uLvl: V(new THREE.Vector3(0.9, 0.8, 0.85)),
    uCenter: V(new THREE.Vector2(0, 6)), uFar: V(new THREE.Vector2()),
    cA: col(), cB: col(), cC: col(), cD: col(), cBg: col(), uShade: V(new THREE.Vector3()), uGndMix: V(0.5),
    cGlow: col(), uGlowAmt: V(0.5), uGlowSize: V(3),
  }
  const track = (m) => { disposables.push(m); return m }

  // ---- columns: ONE instanced mesh (10 triangles each, no underside); the glow caps share its instance data
  const n = cols.length
  const inst = new Float32Array(n * 16)
  const info = new Float32Array(n * 4)
  const tgt = new Float32Array(n)
  const tm = new THREE.Matrix4()
  const GAP = 0.78
  cols.forEach((c, i) => {
    tm.makeScale(c.w * GAP, 1, c.d * GAP).setPosition(c.x, c.y, c.z)
    tm.toArray(inst, i * 16)
    info.set([c.kind, c.lake, c.dist, c.seed], i * 4)
    tgt[i] = c.t
  })
  const instAttr = new THREE.InstancedBufferAttribute(inst, 16)
  const infoAttr = new THREE.InstancedBufferAttribute(info, 4)
  const tgtAttr = new THREE.InstancedBufferAttribute(tgt, 1)

  const bx = new THREE.BoxGeometry(1, 1, 1)
  bx.translate(0, 0.5, 0)
  const idx = bx.index.array
  const keep = []
  for (let f = 0; f < 6; f += 1) if (f !== 3) for (let k = 0; k < 6; k += 1) keep.push(idx[f * 6 + k]) // drop the underside
  bx.setIndex(keep)
  bx.clearGroups()
  bx.setAttribute('aInfo', infoAttr)
  bx.setAttribute('aT', tgtAttr)
  const colMat = track(new THREE.ShaderMaterial({ vertexShader: COL_VERT, fragmentShader: COL_FRAG, uniforms: U }))
  const colMesh = new THREE.InstancedMesh(bx, colMat, n)
  colMesh.instanceMatrix = instAttr
  colMesh.count = n
  colMesh.frustumCulled = false
  scene.add(colMesh)
  disposables.push(bx)

  const capGeo = new THREE.PlaneGeometry(1, 1)
  capGeo.rotateX(-Math.PI / 2)
  capGeo.setAttribute('aInfo', infoAttr)
  capGeo.setAttribute('aT', tgtAttr)
  const capMat = track(new THREE.ShaderMaterial({ vertexShader: CAP_VERT, fragmentShader: CAP_FRAG, uniforms: U, transparent: true, depthWrite: false }))
  const capMesh = new THREE.InstancedMesh(capGeo, capMat, n)
  capMesh.instanceMatrix = instAttr
  capMesh.count = n
  capMesh.frustumCulled = false
  capMesh.renderOrder = 3
  scene.add(capMesh)
  disposables.push(capGeo)

  // ---- plates (plates variant only): three rounded plates in one instanced mesh, drawn bottom to top
  let plateMesh = null
  const PU = { uMask: V(null), uRect: V(new THREE.Vector4(PLATE.x0, PLATE.z0, PLATE.w, PLATE.d)), uPourN: V(0), uScan: V(1), uAlpha: V(0.2), cPA: col(), cPB: col(), cWarm: col(), cDot: col(), cLit: col(), cField: col(), cEdge: col(), uLight: V(0) }
  if (plates) {
    const mask = buildMask(THREE)
    PU.uMask.value = mask
    disposables.push(mask)
    const pg = new THREE.PlaneGeometry(PLATE.w, PLATE.d)
    pg.rotateX(-Math.PI / 2)
    pg.translate(PLATE.x0 + PLATE.w / 2, 0, PLATE.z0 + PLATE.d / 2)
    pg.setAttribute('aPlate', new THREE.InstancedBufferAttribute(new Float32Array([0, 1, 2]), 1))
    const pm = track(new THREE.ShaderMaterial({ vertexShader: PLATE_VERT, fragmentShader: PLATE_FRAG, uniforms: { ...U, ...PU }, transparent: true, depthWrite: false, side: THREE.DoubleSide }))
    plateMesh = new THREE.InstancedMesh(pg, pm, 3)
    const pmx = new THREE.Matrix4()
    PLATE.ys.forEach((y, i) => plateMesh.setMatrixAt(i, pmx.makeTranslation(0, y, 0)))
    plateMesh.frustumCulled = false
    plateMesh.renderOrder = 2
    scene.add(plateMesh)
    disposables.push(pg)
  }

  // ---- thin axis / frame lines (world space)
  const lp = []
  const seg = (a, b) => lp.push(...a, ...b)
  if (plates) {
    const X0 = PLATE.x0, X1 = PLATE.x0 + PLATE.w, Z0 = PLATE.z0, Z1 = PLATE.z0 + PLATE.d
    for (const [x, z] of [[X0 + 7, Z0 + 7], [X1 - 7, Z0 + 7], [X1 - 7, Z1 - 7], [X0 + 7, Z1 - 7]]) seg([x, PLATE.ys[0], z], [x, PLATE.ys[2], z])
    LAKES.forEach((L) => seg([L.c[0], PLATE.ys[2], L.c[1]], [L.c[0], PLATE.ys[1], L.c[1]]))
    seg([0, PLATE.ys[1], 8], [0, PLATE.ys[0], 8])
  } else {
    const X0 = -52, X1 = 52, Z0 = -40, Z1 = 48
    seg([X0, 0.02, Z0], [X1, 0.02, Z0]); seg([X1, 0.02, Z0], [X1, 0.02, Z1]); seg([X1, 0.02, Z1], [X0, 0.02, Z1]); seg([X0, 0.02, Z1], [X0, 0.02, Z0])
    seg([X0, 0, Z1], [X0, HMAX + 1, Z1])
    for (let i = 0; i <= 4; i += 1) { const y = (i / 4) * HMAX; seg([X0, y, Z1], [X0 + (i % 2 ? 1.2 : 2.2), y, Z1]) }
    for (let x = X0; x <= X1 + 0.01; x += 8) seg([x, 0.02, Z1], [x, 0.02, Z1 + 1.4])
  }
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3))
  const lineMat = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }))
  const lines = new THREE.LineSegments(lineGeo, lineMat)
  lines.frustumCulled = false
  lines.renderOrder = 4
  scene.add(lines)
  disposables.push(lineGeo)

  // ---- satellite + swath curtain
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff1d0, 3)
  sun.position.set(-30, 60, 40)
  scene.add(sun)
  const sat = makeSatellite(THREE, T.sat, disposables)
  const SAT_S = 2.0
  const SAT_Y = plates ? 67 : 25, SAT_Z = plates ? 4 : 4
  const GROUND_Y = plates ? PLATE.ys[2] : 0
  const SZ0 = plates ? PLATE.z0 + 6 : -40, SZ1 = plates ? PLATE.z0 + PLATE.d - 6 : 48
  const SAT_X0 = -66, SAT_X1 = 70
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
  disposables.push(swath.material, swGeo)
  swath.frustumCulled = false
  swath.renderOrder = 5
  scene.add(swath)

  // ---- labels (world sprites) and the screen-space HUD bar (chart)
  const overlay = new THREE.Scene()
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10)
  const labels = {}
  const labelKinds = {}
  const lay = { D: 150, ls: 1, hx0: -1, hx1: 1, hy: -0.9, tmp: new THREE.Vector3() }
  const mk = (id, text, parent, kind = 1, centered = false) => {
    const l = makeLabel(THREE, text, { color: T.label, accent: kind === 2 ? T.labelAccent2 : T.labelAccent, disposables })
    l.sprite.material.depthTest = false
    l.sprite.renderOrder = 1000
    l.sprite.visible = false
    if (centered) l.sprite.center.set(0.5, 0.5)
    if (plates) l.sprite.center.set(1, 0.5)
    parent.add(l.sprite)
    labels[id] = l
    labelKinds[id] = kind
  }
  if (plates) {
    mk('pSat', 'SATELLITE', scene, 2)
    mk('pWater', 'WATER LEVEL', scene, 1)
    mk('pAcre', 'ACREAGE', scene, 1)
  } else {
    for (let k = 0; k < 3; k += 1) mk(`lake${k}`, 'RESERVOIR', scene, 1, true)
    mk('three', '3 RESERVOIRS', scene, 1, true)
    mk('hSat', 'SATELLITE', overlay, 2)
    mk('hWater', 'WATER LEVEL', overlay, 1)
    mk('hAcre', 'ACREAGE', overlay, 1)
  }
  const placeWorld = (l, x, y, z, a, f = 0.034) => {
    f *= lay.ls
    const s = l.sprite
    s.visible = a > 0.02
    if (!s.visible) return
    s.material.opacity = a
    s.position.set(x, y, z)
    const d = camera.position.distanceTo(s.position)
    const h = plates ? 3.8 : f * 2 * d * tanH // plates: a fixed size in plate units, so the labels never outgrow the stack
    s.scale.set(h * l.aspect, h, 1)
  }
  const placeHud = (l, x, y, a, f = 0.026) => {
    f *= lay.ls
    const s = l.sprite
    s.visible = a > 0.02
    if (!s.visible) return
    s.material.opacity = a
    s.position.set(x, y, 0)
    s.scale.set(f * 2 * l.aspect, f * 2, 1)
  }

  // HUD bar: baseline with ticks, a filled progress segment and a marker (all in overlay units, rebuilt on resize)
  const hudTicks = new THREE.BufferGeometry()
  const hudTickPos = new Float32Array(41 * 2 * 3)
  hudTicks.setAttribute('position', new THREE.BufferAttribute(hudTickPos, 3))
  const hudDone = new THREE.BufferGeometry()
  const hudDonePos = new Float32Array(4 * 3)
  hudDone.setAttribute('position', new THREE.BufferAttribute(hudDonePos, 3))
  const hudTickMat = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.4, depthTest: false }))
  const hudDoneMat = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95, depthTest: false }))
  const hudTickLines = new THREE.LineSegments(hudTicks, hudTickMat)
  const hudDoneLines = new THREE.LineSegments(hudDone, hudDoneMat)
  for (const o of [hudTickLines, hudDoneLines]) { o.frustumCulled = false; o.renderOrder = 999; if (!plates) overlay.add(o) }
  disposables.push(hudTicks, hudDone)

  // ------------------------------------------------------------------ theme
  function setTheme(name) {
    themeName = name === 'light' ? 'light' : 'dark'
    T = THEMES[themeName]
    scene.background = new THREE.Color(T.bg)
    U.cA.value.set(T.a); U.cB.value.set(T.b); U.cC.value.set(T.c); U.cD.value.set(T.d); U.cBg.value.set(T.bg)
    U.uShade.value.set(...T.shade)
    U.uGndMix.value = T.gndMix
    U.uFar.value.set(...T.far)
    U.cGlow.value.set(T.glow)
    U.uGlowAmt.value = T.glowAmt
    capMat.blending = T.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    capMat.needsUpdate = true
    PU.cPA.value.set(T.plateA); PU.cPB.value.set(T.plateB); PU.cWarm.value.set(T.plateWarm)
    PU.cDot.value.set(T.dot); PU.cLit.value.set(T.dotLit); PU.cField.value.set(T.dotField); PU.cEdge.value.set(T.edge)
    PU.uAlpha.value = T.plateAlpha
    PU.uLight.value = themeName === 'light' ? 1 : 0
    if (plateMesh) {
      plateMesh.material.blending = T.additive ? THREE.AdditiveBlending : THREE.NormalBlending
      plateMesh.material.needsUpdate = true
    }
    lineMat.color.set(T.line); lineMat.opacity = T.lineA * 0.7
    hudTickMat.color.set(T.hud)
    hudDoneMat.color.set(T.hudAccent)
    swath.material.uniforms.cAccent.value.set(T.swath)
    swath.material.blending = T.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    swath.material.needsUpdate = true
    hemi.color.set(T.hemi[0]); hemi.groundColor.set(T.hemi[1]); hemi.intensity = T.hemi[2]
    sun.intensity = T.sun
    sat.setLook(T.sat)
    for (const id of Object.keys(labels)) labels[id].setColors(T.label, labelKinds[id] === 2 ? T.labelAccent2 : T.labelAccent)
  }

  // ------------------------------------------------------------------ view
  const view = { w: 1, h: 1, aspect: 1, dpr: 1 }
  const ELEV = ((plates ? 34 : 37) * Math.PI) / 180
  const YAW0 = plates ? 0.785 : -0.12
  const aim = plates ? new THREE.Vector3(0, 28, 4) : new THREE.Vector3(0, 4, 4)
  const corners = [], labelCorners = [] // labelCorners: room for the plate labels on wide stages (hidden on tall ones)
  if (plates) {
    for (const x of [PLATE.x0, PLATE.x0 + PLATE.w]) for (const z of [PLATE.z0, PLATE.z0 + PLATE.d]) for (const y of [-1, 80]) corners.push(new THREE.Vector3(x, y, z))
    for (const y of PLATE.ys) labelCorners.push(new THREE.Vector3(PLATE.x0 - 34, y, PLATE.z0 + PLATE.d + 8))
  } else {
    for (const x of [-54, 54]) for (const z of [-42, 50]) for (const y of [0, HMAX + 7]) corners.push(new THREE.Vector3(x, y, z))
  }
  const dir = new THREE.Vector3(), rel = new THREE.Vector3()

  const aspectWide = () => view.aspect >= 0.9

  function resize(w, h, dpr = 1) {
    view.w = w; view.h = h; view.aspect = w / h; view.dpr = dpr
    const a = view.aspect
    // same stage as the default scene: action on the right ~60% of a wide stage, top ~55% of a tall one
    const m = smooth(0.85, 1.2, a)
    const cx = lerp(0.5, 0.67, m), cy = lerp(0.235, 0.415, m)
    const fw = lerp(1, 0.64, m), fh = lerp(0.44, 0.86, m)
    lay.ls = lerp(0.62, 1, m)
    // exact fit: distance at which every bounding corner sits inside the focal window
    dir.set(Math.sin(YAW0) * Math.cos(ELEV), Math.sin(ELEV), Math.cos(YAW0) * Math.cos(ELEV))
    camera.position.copy(aim).addScaledVector(dir, 100)
    camera.lookAt(aim)
    camera.updateMatrixWorld()
    const rx = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), uy = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    let D = 0
    for (const c of aspectWide() ? corners.concat(labelCorners) : corners) {
      rel.copy(c).sub(aim)
      D = Math.max(D, rel.dot(dir) + Math.abs(rel.dot(rx)) / (fw * 0.96 * tanH * a), rel.dot(dir) + Math.abs(rel.dot(uy)) / (fh * 0.96 * tanH))
    }
    lay.D = D
    camera.aspect = a
    camera.setViewOffset(view.w, view.h, (0.5 - cx) * view.w, (0.5 - cy) * view.h, view.w, view.h)
    camera.updateProjectionMatrix()
    ortho.left = -a; ortho.right = a; ortho.top = 1; ortho.bottom = -1
    ortho.updateProjectionMatrix()
    // HUD bar rect (overlay units)
    const fl = lerp(0.03, 0.42, m), fr = lerp(0.97, 0.985, m), fb = lerp(0.53, 0.96, m)
    lay.hx0 = (2 * fl - 1) * a + 0.02
    lay.hx1 = (2 * fr - 1) * a - 0.02
    lay.hy = 1 - 2 * fb + 0.075
    for (let i = 0; i <= 40; i += 1) {
      const x = lerp(lay.hx0, lay.hx1, i / 40)
      const th = i % 10 === 0 ? 0.03 : i % 5 === 0 ? 0.02 : 0.011
      hudTickPos.set([x, lay.hy, 0, x, lay.hy + th, 0], i * 6)
    }
    hudTicks.attributes.position.needsUpdate = true
  }

  const lvTmp = new THREE.Vector3()
  const levelOf = (p) => lvTmp.set(0.95 - 0.34 * smooth(0.25, 0.55, p), 0.88 - 0.3 * smooth(0.27, 0.55, p), 1.0 - 0.36 * smooth(0.29, 0.55, p))

  function update(ctx) {
    const reduced = ctx.reduced
    const p = reduced ? 1 : clamp(ctx.p, 0, 1)
    const time = reduced ? 6 : ctx.time
    const px = reduced ? 0 : ctx.pointer.sx
    const py = reduced ? 0 : ctx.pointer.sy
    U.uTime.value = time
    const pour = 1 - (1 - clamp((p - 0.25) / 0.3, 0, 1)) ** 1.8
    U.uFront.value = pour * (distMax + 16)
    PU.uPourN.value = pour
    U.uGrow.value = smooth(0.55, 0.9, p)
    const settle = smooth(0.92, 0.98, p)
    U.uSettle.value = settle
    U.uLvl.value.copy(levelOf(p))

    // satellite sweep: columns rise as it passes over them
    const sweepT = clamp(p / 0.25, 0, 1)
    const satX = reduced ? 200 : lerp(SAT_X0, SAT_X1, sweepT)
    U.uSwX.value = reduced ? 999 : satX
    const scanOn = 1 - smooth(0.2, 0.26, p)
    PU.uScan.value = scanOn
    const bob = Math.sin(time * 0.6) * 0.3
    sat.group.position.set(satX, SAT_Y + bob, SAT_Z)
    sat.group.visible = satX < SAT_X1 - 2
    swPos.set([satX, SAT_Y - 0.6 * SAT_S + bob, SAT_Z, satX, GROUND_Y + 0.2, SZ0, satX, GROUND_Y + 0.2, SZ1])
    swGeo.attributes.position.needsUpdate = true
    swath.visible = sat.group.visible
    swath.material.uniforms.uOpacity.value = scanOn * (T.additive ? 1 : 0.8)

    // camera: a slow drift and a touch of pointer parallax
    const D = lay.D * (1.02 - 0.03 * p)
    const yaw = YAW0 + (p - 0.5) * 0.08 - px * 0.03 + Math.sin(time * 0.07) * 0.006
    const elev = ELEV - py * 0.02
    camera.position.set(Math.sin(yaw) * Math.cos(elev) * D, Math.sin(elev) * D, Math.cos(yaw) * Math.cos(elev) * D).add(aim)
    camera.lookAt(aim)
    camera.updateMatrixWorld()

    // labels
    const lv = U.uLvl.value
    if (plates) {
      const a = aspectWide() ? smooth(0.0, 0.05, p) : 0
      const edgeX = PLATE.x0 - 1, edgeZ = PLATE.z0 + PLATE.d + 1
      placeWorld(labels.pSat, edgeX, PLATE.ys[2], edgeZ, a * (reduced ? 1 : 0.55 + 0.45 * (1 - smooth(0.22, 0.3, p))))
      placeWorld(labels.pWater, edgeX, PLATE.ys[1], edgeZ, a * (0.55 + 0.45 * (smooth(0.0, 0.1, p) * (1 - smooth(0.5, 0.6, p)))))
      placeWorld(labels.pAcre, edgeX, PLATE.ys[0], edgeZ, a * (0.55 + 0.45 * smooth(0.55, 0.65, p)))
    } else {
      LAKES.forEach((L, k) => {
        const seen = reduced ? 1 : smooth(L.c[0] - 6, L.c[0] + 4, satX)
        const a = seen * (1 - smooth(0.88, 0.92, p))
        placeWorld(labels[`lake${k}`], L.c[0], HMAX * 0.97 * [lv.x, lv.y, lv.z][k] + 4.2, L.c[1] + 2, Math.min(1, a))
      })
      placeWorld(labels.three, LAKES[1].c[0], HMAX * 0.97 * lv.y + 4.6, LAKES[1].c[1] + 2, settle)
      const lw = lay.hx1 - lay.hx0
      const yL = lay.hy + 0.05
      placeHud(labels.hSat, lay.hx0, yL, 0.4 + 0.6 * (1 - smooth(0.22, 0.28, p)))
      placeHud(labels.hWater, lay.hx0 + lw * 0.27, yL, 0.4 + 0.6 * smooth(0.0, 0.1, p) * (1 - smooth(0.5, 0.6, p)))
      placeHud(labels.hAcre, lay.hx0 + lw * 0.58, yL, 0.4 + 0.6 * smooth(0.55, 0.65, p))
      const xp = lerp(lay.hx0, lay.hx1, p)
      hudDonePos.set([lay.hx0, lay.hy, 0, xp, lay.hy, 0, xp, lay.hy - 0.012, 0, xp, lay.hy + 0.045, 0])
      hudDone.attributes.position.needsUpdate = true
    }
  }

  function render(rend, ctx, target) {
    rend.setRenderTarget(target ?? null)
    rend.render(scene, camera)
    if (!plates) {
      const ac = rend.autoClear
      rend.autoClear = false
      rend.render(overlay, ortho)
      rend.autoClear = ac
    }
  }

  function dispose() {
    for (const d of disposables) d.dispose?.()
    scene.traverse((o) => { o.geometry?.dispose?.() })
    overlay.traverse((o) => { o.geometry?.dispose?.() })
    colMesh.dispose?.()
    capMesh.dispose?.()
    plateMesh?.dispose?.()
  }

  setTheme(themeName)
  if (size && size.w > 1) resize(size.w, size.h, size.dpr)
  else resize(1280, 720, 1)

  return {
    scene,
    camera,
    animated: true,
    look: 'full',
    variant: mode,
    beats,
    get theme() { return themeName },
    setTheme,
    update,
    resize,
    render,
    dispose,
    stats: { instances: n, triangles: n * 10 + n * 2 + (plates ? 6 : 0) },
  }
}
