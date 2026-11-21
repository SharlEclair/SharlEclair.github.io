/**
 * Harvest URL variants (?harvest=chart | plates | ridge | bars2d). Same story and the same 0..1 progress as the default
 * scene, drawn as data: the water level of the reservoirs falls as it pours to the fields, then the acreage rises.
 *
 *   chart   columns (one InstancedMesh) on a soft city-like grid over the real reservoir / field layout, one hero peak
 *   plates  three translucent isometric plates (satellite view, water level, acreage), the columns rise from them
 *   ridge   the columns merged into one smooth glowing heightfield surface with a bright crest line (one draw call)
 *   bars2d  a calm, flat 2.5D bar chart (3 reservoirs, then the acreage) standing in front of a faint terrain
 *
 * All text is real DOM (crisp at any dpr), projected from anchor points and only touched when it moves.
 * Loaded lazily by scene.js, never for the default look and never for look 'lcd'. Same module contract as the default scene.
 * Story (progress): 0.00-0.25 satellite sweeps, data lights up   0.25-0.55 water level falls as it pours to the fields
 *                   0.55-0.90 acreage grows in a wave              0.90-1.00 settle
 */
import { LAKES, buildNetwork, buildPaddies, heightAt, lakeD, rng, MAIN_Z } from './world.js'
import { makeSatellite } from './parts.js'
import * as S from './shaders.js'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

const THEMES = {
  dark: {
    bg: '#05060e', a: '#070a22', b: '#3c2cae', c: '#3b7fe8', d: '#8ff8ff', low: '#0c1030', crest: '#d6fcff', glow: '#5fe6ff',
    gndMix: 0.2, shade: [1.1, 0.62, 0.86], far: [30, 88], glowAmt: 0.8, additive: true,
    line: '#9db4ff', lineA: 0.5, hud: '#cfe0ff', hudAccent: '#5fe6ff', fg: '#e6efff', accent: '#5fe6ff', accent2: '#a58bff',
    plateA: '#3b2fa8', plateB: '#1f7fc4', plateWarm: '#7a3bb8', plateAlpha: 0.2, dot: '#9fb2ff', dotLit: '#7df3ff', dotField: '#a58bff', edge: '#8fa6ff',
    sat: { gold: '#e9c06a', satDark: '#1a242c', accent: '#6bf0d8', panelBg: '#0d1440', panelGrid: '#6b8cff', panelFrame: '#f5b95a', panelEmissive: 0x16205c },
    swath: '#7df3ff', hemi: [0xcdd8ff, 0x0a0c20, 1.5], sun: 3,
  },
  light: {
    bg: '#e8e6db', a: '#16201f', b: '#1b4a52', c: '#1d8580', d: '#3cc2b0', low: '#d3d1c3', crest: '#101a1c', glow: '#2a9d9a',
    gndMix: 0.12, shade: [1.12, 0.6, 0.84], far: [30, 88], glowAmt: 0.2, additive: false,
    line: '#131312', lineA: 0.55, hud: '#131312', hudAccent: '#0a7a6e', fg: '#131312', accent: '#0a7a3d', accent2: '#c8372d',
    plateA: '#2a2f30', plateB: '#2a9d9a', plateWarm: '#2a2f30', plateAlpha: 0.1, dot: '#131312', dotLit: '#0a7a6e', dotField: '#2a2f30', edge: '#131312',
    sat: { gold: '#2a2a27', satDark: '#c8372d', accent: '#c8372d', panelBg: '#30312e', panelGrid: '#8f8e83', panelFrame: '#c8372d', panelEmissive: 0x000000 },
    swath: '#c8372d', hemi: [0xffffff, 0xd6d2c2, 1.2], sun: 1.7,
  },
}

/* ------------------------------------------------------------------ data: where the columns stand and how tall they get */
const FIELD_X = [-46, 46], FIELD_Z = [MAIN_Z, 45.5]
const PLATE = { x0: -56, z0: -42, w: 112, d: 92, ys: [0, 26, 52] } // plates variant: acreage, water level, satellite view
const RG = { x0: -78, z0: -64, w: 156, d: 134 } // ridge variant: extent of the surface and of its data texture (1 texel = 1 unit)
const BAR_Z = 30

function addGround(cols, rnd, step, skip) {
  for (let x = -96; x <= 96; x += step) {
    for (let z = -72; z <= 80; z += step) {
      if ((x / 98) ** 2 + ((z - 6) / 78) ** 2 > 1) continue
      if (skip(x, z)) continue
      const r = rnd()
      cols.push({ x, z, w: step, d: step, y: 0, kind: 0, lake: 0, dist: 0, t: clamp(0.02 + heightAt(x, z) * 0.008 + 0.035 * r * r, 0.02, 0.14), seed: r })
    }
  }
}

function buildColumns(mode) {
  const net = buildNetwork()
  const { paddies } = buildPaddies(net.dMain)
  const distMax = Math.max(...paddies.map((q) => q.dist))
  const rnd = rng(311)
  const cols = [] // { x, z, w, d, y, kind (0 ground, 1 lake, 2 field), lake, dist, t, seed }
  const plates = mode === 'plates'

  if (mode === 'bars2d') {
    // three reservoir bars, then one acreage bar per paddy column
    ;[0.92, 0.84, 0.97].forEach((t, k) => cols.push({ x: -44 + k * 10.5, z: BAR_Z, w: 8, d: 3.2, y: 0, kind: 1, lake: k, dist: 0, t, seed: rnd() }))
    const groups = new Map()
    for (const q of paddies) {
      const key = Math.round(q.cx * 10)
      const g = groups.get(key) ?? { x: q.cx, a: 0, dist: 0, n: 0 }
      g.a += q.w * q.d; g.dist += q.dist; g.n += 1
      groups.set(key, g)
    }
    const gs = [...groups.values()].sort((a, b) => a.x - b.x)
    const maxA = Math.max(...gs.map((g) => g.a))
    gs.forEach((g, i) => cols.push({ x: -8 + i * 5.8, z: BAR_Z, w: 4.6, d: 3.2, y: 0, kind: 2, lake: 0, dist: g.dist / g.n, t: clamp(0.3 + 0.55 * (g.a / maxA) + 0.15 * rnd(), 0.25, 1), seed: rnd() }))
    addGround(cols, rnd, 2.8, (x, z) => z > BAR_Z - 4)
    return { cols, distMax }
  }

  const sn = (x, z) => clamp(0.5 + 0.34 * Math.sin(x * 0.23 + 1.3) * Math.sin(z * 0.29 + 0.4) + 0.26 * Math.sin(x * 0.71 + z * 0.43), 0, 1)
  // acreage: a grid of cells inside every paddy
  const maxA = Math.max(...paddies.map((q) => q.w * q.d))
  const fields = []
  for (const q of paddies) {
    const nx = Math.max(1, Math.round(q.w / 2.2)), nz = Math.max(1, Math.round(q.d / 2.2))
    const cw = q.w / nx, cd = q.d / nz
    const pf = 0.5 + 0.4 * Math.sqrt((q.w * q.d) / maxA)
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < nz; j += 1) {
        const x = q.cx - q.w / 2 + (i + 0.5) * cw, z = q.cz - q.d / 2 + (j + 0.5) * cd
        const r = rnd()
        let t = pf * (0.1 + 0.5 * sn(x, z) + 0.3 * r * r * r)
        if (rnd() < 0.06) t += 0.2
        const c = { x, z, w: cw, d: cd, y: plates ? PLATE.ys[0] : 0, kind: 2, lake: 0, dist: net.dMain(x) + (z - MAIN_Z), t: clamp(t, 0.1, 0.6), seed: rnd() }
        cols.push(c)
        fields.push(c)
      }
    }
  }
  if (!plates) {
    // hierarchy: one clear hero peak (seed 2 marks it for the glow) with a shoulder, and a quieter second peak
    for (const [px, pz, h, hero] of [[19, 26, 1, true], [-22, 19, 0.78, false]]) {
      for (const c of fields) {
        const r = Math.hypot(c.x - px, (c.z - pz) * 1.2)
        if (r < 8) c.t = Math.max(c.t, h * (0.1 + 0.9 * (1 - r / 8) ** 1.5))
        if (hero && r < 1.6) c.seed = 2
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
  if (!plates && mode !== 'ridge') {
    addGround(cols, rnd, 2.6, (x, z) => {
      if (x > FIELD_X[0] - 1 && x < FIELD_X[1] + 1 && z > FIELD_Z[0] - 1.4 && z < FIELD_Z[1] + 1.4) return true
      for (let k = 0; k < 3; k += 1) if (lakeD(k, x, z) < 1.12) return true
      return false
    })
  }
  return { cols, distMax }
}

/** Ridge data texture: R reservoir height, G field height, B field distance to the canals, A terrain. Half float, linear. */
function buildRidgeTex(THREE, cols, distMax) {
  const W = RG.w, H = RG.d
  const ch = [new Float32Array(W * H), new Float32Array(W * H), new Float32Array(W * H)]
  for (const c of cols) {
    if (c.kind === 0) continue
    const k = c.kind === 1 ? 0 : 1
    const x0 = Math.max(0, Math.floor(c.x - c.w * 0.5 - RG.x0)), x1 = Math.min(W, Math.ceil(c.x + c.w * 0.5 - RG.x0))
    const z0 = Math.max(0, Math.floor(c.z - c.d * 0.5 - RG.z0)), z1 = Math.min(H, Math.ceil(c.z + c.d * 0.5 - RG.z0))
    for (let iz = z0; iz < z1; iz += 1) {
      for (let ix = x0; ix < x1; ix += 1) {
        const o = iz * W + ix
        ch[k][o] = Math.max(ch[k][o], c.t)
        if (k === 1) ch[2][o] = c.dist / distMax
      }
    }
  }
  const blur = (a) => {
    const out = new Float32Array(a.length)
    for (let z = 0; z < H; z += 1) {
      for (let x = 0; x < W; x += 1) {
        let s = 0, n = 0
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx, zz = z + dz
            if (xx < 0 || zz < 0 || xx >= W || zz >= H) continue
            s += a[zz * W + xx]; n += 1
          }
        }
        out[z * W + x] = s / n
      }
    }
    return out
  }
  const sm = ch.map(blur)
  const data = new Uint16Array(W * H * 4)
  for (let z = 0; z < H; z += 1) {
    for (let x = 0; x < W; x += 1) {
      const o = z * W + x
      const g = clamp(0.02 + heightAt(RG.x0 + x + 0.5, RG.z0 + z + 0.5) * 0.008, 0.02, 0.14)
      data.set([THREE.DataUtils.toHalfFloat(sm[0][o]), THREE.DataUtils.toHalfFloat(sm[1][o]), THREE.DataUtils.toHalfFloat(sm[2][o]), THREE.DataUtils.toHalfFloat(g)], o * 4)
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
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
const UNI = /* glsl */`
uniform float uTime, uSwX, uFront, uGrow, uSettle, uHmax, uDistMax;
uniform vec3 uLvl;
`
const COMMON = /* glsl */`
${UNI}
attribute vec4 aInfo;   // kind (0 ground, 1 reservoir, 2 field), reservoir index, distance to the main canal, seed
attribute float aT;     // target height, 0..1 of the chart height
float colHeight(vec4 info, float t, float x){
  float kind = info.x, seed = info.w;
  float lit = smoothstep(-4.0, 4.0, uSwX - x);               // the satellite has passed this column
  if (kind < 0.5) {
    float bump = exp(-pow((uSwX - x) / 3.0, 2.0)) * step(uSwX, 80.0) * step(-70.0, uSwX);
    return uHmax * t * (0.2 + 0.8 * lit) + bump * 0.7;
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

const GRAD = /* glsl */`
uniform vec3 cA, cB, cC, cD, cLow, cBg;
vec3 grad(float t){
  vec3 c = mix(cA, cB, smoothstep(0.0, 0.4, t));
  c = mix(c, cC, smoothstep(0.3, 0.78, t));
  return mix(c, cD, smoothstep(0.62, 1.05, t));
}
`

const COL_VERT = /* glsl */`
${COMMON}
uniform vec2 uCenter, uFar;
varying vec3 vN;
varying float vWy, vTop, vFar, vWet, vKind;
void main(){
  vec4 base = instanceMatrix * vec4(position.x, 0.0, position.z, 1.0);
  float h = colHeight(aInfo, aT, base.x);
  vec4 wp = base;
  wp.y += position.y * h;
  vWy = position.y * h / uHmax;
  vTop = h / uHmax;
  vN = normal;
  vKind = aInfo.x;
  float flood = smoothstep(aInfo.z - 4.0, aInfo.z + 2.0, uFront);
  float gp = smoothstep(0.0, 1.0, clamp(uGrow * 1.75 - aInfo.z / uDistMax * 0.75, 0.0, 1.0));
  vWet = step(1.5, aInfo.x) * flood * (1.0 - gp);
  vFar = smoothstep(uFar.x, uFar.y, length((base.xz - uCenter) * vec2(1.0, 1.25)));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

const COL_FRAG = /* glsl */`
${GRAD}
uniform vec3 uShade;
uniform float uGndMix;
varying vec3 vN;
varying float vWy, vTop, vFar, vWet, vKind;
void main(){
  float yf = clamp(vWy, 0.0, 1.3);
  vec3 c = grad(yf);
  float sh = vN.y > 0.5 ? uShade.x : (abs(vN.x) > 0.5 ? uShade.y : uShade.z);
  c *= sh;
  if (vN.y > 0.5) c = mix(c, cD, 0.3 * smoothstep(0.08, 0.6, yf));
  c += cD * 0.22 * pow(clamp(yf, 0.0, 1.0), 3.0) * (vN.y > 0.5 ? 1.0 : 0.5);       // a quiet inner glow toward the tip
  if (vKind < 0.5) c = mix(cBg, c, uGndMix);
  else c = mix(cLow, c, smoothstep(0.02, 0.16, vTop));                                // low columns stay pale, never black
  c = mix(c, cD * 0.75, vWet * 0.3);
  c = mix(c, cBg, vFar * 0.92);
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
  vec4 base = instanceMatrix * vec4(position.x * uGlowSize * (aInfo.w > 1.5 ? 1.6 : 1.0), 0.0, position.z * uGlowSize * (aInfo.w > 1.5 ? 1.6 : 1.0), 1.0);
  float h = colHeight(aInfo, aT, instanceMatrix[3].x);
  float yf = h / uHmax;
  vA = step(0.5, aInfo.x) * smoothstep(0.08, 0.5, yf) * (0.4 + 0.8 * yf * yf) * (aInfo.w > 1.5 ? 2.4 : 1.0);
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
  float a = pow(1.0 - smoothstep(0.0, 1.0, r), 2.4) * vA * uGlowAmt;
  if (a < 0.003) discard;
  gl_FragColor = vec4(cGlow, a);
  #include <colorspace_fragment>
}`

const RIDGE_VERT = /* glsl */`
${UNI}
uniform sampler2D uData;
uniform vec4 uRect;
uniform vec2 uCenter, uFar;
varying vec3 vN;
varying float vYf, vFar, vWet, vCrest;
float ridgeH(vec2 xz){
  vec4 s = texture2D(uData, (xz - uRect.xy) / uRect.zw);
  float lit = smoothstep(-4.0, 4.0, uSwX - xz.x);
  float bump = exp(-pow((uSwX - xz.x) / 3.0, 2.0)) * step(uSwX, 80.0) * step(-70.0, uSwX);
  float hg = uHmax * s.a * (0.25 + 0.75 * lit) + bump * 0.5;
  float lv = xz.x < -15.0 ? uLvl.x : (xz.x < 20.0 ? uLvl.y : uLvl.z);
  float hl = uHmax * s.r * lv * lit * smoothstep(0.02, 0.14, s.r) * (1.0 + uSettle * 0.04 * sin(uTime * 2.4 + xz.x * 0.3));
  float dist = s.b * uDistMax;
  float flood = smoothstep(dist - 4.0, dist + 2.0, uFront);
  float gp = smoothstep(0.0, 1.0, clamp(uGrow * 1.75 - s.b * 0.75, 0.0, 1.0));
  float base = 0.03 * lit + 0.06 * flood;
  float hf = uHmax * mix(base, max(s.g, base), gp) * smoothstep(0.02, 0.14, s.g);
  return max(hg, max(hl, hf));
}
void main(){
  vec2 xz = position.xz;
  float e = 1.0;
  float h = ridgeH(xz);
  float hx0 = ridgeH(xz - vec2(e, 0.0)), hx1 = ridgeH(xz + vec2(e, 0.0));
  float hz0 = ridgeH(xz - vec2(0.0, e)), hz1 = ridgeH(xz + vec2(0.0, e));
  vN = normalize(vec3(hx0 - hx1, 2.0 * e, hz0 - hz1));
  float curv = (hx0 + hx1 + hz0 + hz1 - 4.0 * h) / (e * e);
  vYf = h / uHmax;
  vCrest = smoothstep(0.2, 1.0, -curv * 2.5 / uHmax) * smoothstep(0.15, 0.45, vYf);
  vec4 s = texture2D(uData, (xz - uRect.xy) / uRect.zw);
  float flood = smoothstep(s.b * uDistMax - 4.0, s.b * uDistMax + 2.0, uFront);
  float gp = smoothstep(0.0, 1.0, clamp(uGrow * 1.75 - s.b * 0.75, 0.0, 1.0));
  vWet = smoothstep(0.02, 0.14, s.g) * flood * (1.0 - gp);
  vFar = smoothstep(uFar.x * 0.85, uFar.y * 0.75, length((xz - uCenter) * vec2(1.0, 1.25)));
  gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, h, xz.y, 1.0);
}`

const RIDGE_FRAG = /* glsl */`
${GRAD}
uniform vec3 cCrest;
varying vec3 vN;
varying float vYf, vFar, vWet, vCrest;
void main(){
  float yf = clamp(vYf, 0.0, 1.3);
  vec3 c = grad(yf * 1.02);
  float lam = 0.5 + 0.5 * max(dot(normalize(vN), normalize(vec3(-0.35, 0.8, 0.5))), 0.0);
  c *= lam;
  c += cD * 0.12 * pow(clamp(yf, 0.0, 1.0), 3.0);
  float g = yf * 12.0;
  float iso = 1.0 - clamp(abs(fract(g - 0.5) - 0.5) / max(fwidth(g), 1e-4), 0.0, 1.0);   // thin contour lines
  c = mix(c, cD, iso * 0.16 * smoothstep(0.06, 0.3, yf));
  c = mix(cLow, c, smoothstep(0.02, 0.14, yf));
  c = mix(c, cD * 0.75, vWet * 0.3);
  c = mix(c, cCrest, clamp(vCrest, 0.0, 1.0) * 0.75);                                      // the bright crest line
  c = mix(c, cBg, vFar * 0.92);
  gl_FragColor = vec4(c, 1.0);
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

/* ------------------------------------------------------------------ DOM labels (real text, projected from anchors) */
const LABEL_CSS = `
.hv-labels{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2;font-size:var(--hv-fs,12px)}
.hv-label{position:absolute;left:0;top:0;white-space:nowrap;opacity:0;will-change:transform,opacity;padding:3px 0 3px 7px;border-left:2px solid var(--hv-a1);
  font:600 var(--hv-fs,12px)/1 var(--mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--hv-fg);
  text-shadow:0 0 7px var(--hv-halo),0 0 3px var(--hv-halo),0 1px 1px var(--hv-halo)}
.hv-label[data-k="2"]{border-left-color:var(--hv-a2)}
`
function makeDom(host) {
  if (typeof document === 'undefined') return null
  if (!document.getElementById('hv-style')) {
    const st = document.createElement('style')
    st.id = 'hv-style'
    st.textContent = LABEL_CSS
    document.head.appendChild(st)
  }
  const root = document.createElement('div')
  root.className = 'hv-labels'
  root.setAttribute('aria-hidden', 'true')
  host.appendChild(root)
  const items = {}
  const AX = { l: '0', c: '-50%', r: '-100%' }
  return {
    add(id, text, kind = 1, anchor = 'l') {
      const el = document.createElement('div')
      el.className = 'hv-label'
      el.dataset.k = String(kind)
      el.textContent = text
      root.appendChild(el)
      items[id] = { el, ax: AX[anchor], on: false, x: 0, y: 0, a: 0 }
    },
    put(id, x, y, a, anchor) {
      const it = items[id]
      if (!it) return
      if (!(a > 0.02)) {
        if (it.on) { it.el.style.opacity = '0'; it.on = false }
        return
      }
      if (anchor) it.ax = AX[anchor]
      const qa = Math.round(a * 20) / 20, qx = Math.round(x), qy = Math.round(y)
      if (it.on && qx === it.x && qy === it.y && qa === it.a) return
      it.x = qx; it.y = qy; it.a = qa; it.on = true
      it.el.style.transform = `translate3d(${qx}px,${qy}px,0) translate(${it.ax},-50%)`
      it.el.style.opacity = String(qa)
    },
    theme(T) {
      root.style.setProperty('--hv-fg', `var(--on-stage, ${T.fg})`)
      root.style.setProperty('--hv-halo', `var(--stage, ${T.bg})`)
      root.style.setProperty('--hv-a1', T.accent)
      root.style.setProperty('--hv-a2', T.accent2)
    },
    size(w) { root.style.setProperty('--hv-fs', w < 700 ? '11px' : '12px') },
    fade(o) { root.style.opacity = o },
    dispose() { root.remove() },
  }
}

/* ------------------------------------------------------------------ the scene */
export async function createVariantScene({ THREE, renderer, size, theme, mode = 'chart', beats = [] } = {}) {
  const plates = mode === 'plates', ridge = mode === 'ridge', bars = mode === 'bars2d'
  const instanced = !ridge
  const hudOn = !plates && !bars
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

  const HMAX = plates ? 13 : bars ? 15 : ridge ? 20 : 17
  const { cols, distMax } = buildColumns(ridge ? 'ridge' : mode)

  const U = {
    uTime: V(0), uSwX: V(-999), uFront: V(0), uGrow: V(0), uSettle: V(0), uHmax: V(HMAX), uDistMax: V(distMax), uLvl: V(new THREE.Vector3(0.9, 0.8, 0.85)),
    uCenter: V(new THREE.Vector2(0, 6)), uFar: V(new THREE.Vector2()),
    cA: col(), cB: col(), cC: col(), cD: col(), cBg: col(), cLow: col(), cCrest: col(), uShade: V(new THREE.Vector3()), uGndMix: V(0.5),
    cGlow: col(), uGlowAmt: V(0.5), uGlowSize: V(bars ? 2.2 : 3.4),
  }
  const track = (m) => { disposables.push(m); return m }
  let capMat = null, colMesh = null, capMesh = null, ridgeMesh = null, n = 0

  if (instanced) {
    // ---- columns: ONE instanced mesh (10 triangles each, no underside); the glow caps share its instance data
    n = cols.length
    const inst = new Float32Array(n * 16)
    const info = new Float32Array(n * 4)
    const tgt = new Float32Array(n)
    const tm = new THREE.Matrix4()
    const GAP = bars ? 0.84 : 0.78
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
    colMesh = new THREE.InstancedMesh(bx, colMat, n)
    colMesh.instanceMatrix = instAttr
    colMesh.count = n
    colMesh.frustumCulled = false
    scene.add(colMesh)
    disposables.push(bx)

    const capGeo = new THREE.PlaneGeometry(1, 1)
    capGeo.rotateX(-Math.PI / 2)
    capGeo.setAttribute('aInfo', infoAttr)
    capGeo.setAttribute('aT', tgtAttr)
    capMat = track(new THREE.ShaderMaterial({ vertexShader: CAP_VERT, fragmentShader: CAP_FRAG, uniforms: U, transparent: true, depthWrite: false }))
    capMesh = new THREE.InstancedMesh(capGeo, capMat, n)
    capMesh.instanceMatrix = instAttr
    capMesh.count = n
    capMesh.frustumCulled = false
    capMesh.renderOrder = 3
    scene.add(capMesh)
    disposables.push(capGeo)
  } else {
    // ---- ridge: ONE smooth heightfield mesh, its height read from a data texture in the vertex shader
    const tex = buildRidgeTex(THREE, cols, distMax)
    disposables.push(tex)
    const rg = new THREE.PlaneGeometry(RG.w, RG.d, RG.w, RG.d)
    rg.rotateX(-Math.PI / 2)
    rg.translate(0, 0, RG.z0 + RG.d / 2)
    rg.deleteAttribute('normal')
    rg.deleteAttribute('uv')
    const rm = track(new THREE.ShaderMaterial({ vertexShader: RIDGE_VERT, fragmentShader: RIDGE_FRAG, uniforms: { ...U, uData: V(tex), uRect: V(new THREE.Vector4(RG.x0, RG.z0, RG.w, RG.d)) } }))
    ridgeMesh = new THREE.Mesh(rg, rm)
    ridgeMesh.frustumCulled = false
    scene.add(ridgeMesh)
    disposables.push(rg)
  }

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

  // ---- thin axis / frame lines (world space, no text)
  const lp = []
  const seg = (a, b) => lp.push(...a, ...b)
  if (plates) {
    const X0 = PLATE.x0, X1 = PLATE.x0 + PLATE.w, Z0 = PLATE.z0, Z1 = PLATE.z0 + PLATE.d
    for (const [x, z] of [[X0 + 7, Z0 + 7], [X1 - 7, Z0 + 7], [X1 - 7, Z1 - 7], [X0 + 7, Z1 - 7]]) seg([x, PLATE.ys[0], z], [x, PLATE.ys[2], z])
    LAKES.forEach((L) => seg([L.c[0], PLATE.ys[2], L.c[1]], [L.c[0], PLATE.ys[1], L.c[1]]))
    seg([0, PLATE.ys[1], 8], [0, PLATE.ys[0], 8])
  } else if (bars) {
    // a calm frame: baseline, left axis with ticks, faint gridlines behind the bars
    const X0 = -52, X1 = 52, Z = BAR_Z - 3
    seg([X0, 0, BAR_Z + 2.2], [X1, 0, BAR_Z + 2.2])
    seg([X0, 0, Z], [X0, HMAX + 1, Z])
    for (let i = 1; i <= 4; i += 1) { const y = (i / 4) * HMAX; seg([X0, y, Z], [X1, y, Z]); seg([X0 - 1.6, y, Z], [X0, y, Z]) }
    for (let x = X0; x <= X1 + 0.01; x += 8) seg([x, 0, BAR_Z + 2.2], [x, -1.1, BAR_Z + 2.2])
  } else {
    // axis: a back wall with four gridlines, a vertical axis at the front-left corner with ticks, a footprint outline
    const X0 = -52, X1 = 52, Z0 = -40, Z1 = 48
    seg([X0, 0.02, Z0], [X1, 0.02, Z0]); seg([X1, 0.02, Z0], [X1, 0.02, Z1]); seg([X1, 0.02, Z1], [X0, 0.02, Z1]); seg([X0, 0.02, Z1], [X0, 0.02, Z0])
    for (let i = 1; i <= 4; i += 1) seg([X0, (i / 4) * HMAX, Z0], [X1, (i / 4) * HMAX, Z0])
    seg([X0, 0, Z0], [X0, HMAX, Z0]); seg([X1, 0, Z0], [X1, HMAX, Z0])
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

  // ---- satellite + swath curtain (not in the calm bar chart)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff1d0, 3)
  sun.position.set(-30, 60, 40)
  scene.add(sun)
  const sat = makeSatellite(THREE, T.sat, disposables)
  const SAT_S = 2.0
  const SAT_Y = plates ? 67 : 25, SAT_Z = 4
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

  // ---- HUD bar (chart, ridge): baseline with ticks, filled progress segment and a marker, in overlay units
  const overlay = new THREE.Scene()
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10)
  const lay = { D: 150, hx0: -1, hx1: 1, hy: -0.9 }
  const hudTicks = new THREE.BufferGeometry()
  const hudTickPos = new Float32Array(41 * 2 * 3)
  hudTicks.setAttribute('position', new THREE.BufferAttribute(hudTickPos, 3))
  const hudDone = new THREE.BufferGeometry()
  const hudDonePos = new Float32Array(4 * 3)
  hudDone.setAttribute('position', new THREE.BufferAttribute(hudDonePos, 3))
  const hudTickMat = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.4, depthTest: false }))
  const hudDoneMat = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95, depthTest: false }))
  for (const o of [new THREE.LineSegments(hudTicks, hudTickMat), new THREE.LineSegments(hudDone, hudDoneMat)]) { o.frustumCulled = false; o.renderOrder = 999; if (hudOn) overlay.add(o) }
  disposables.push(hudTicks, hudDone)

  // ---- DOM labels
  const host = renderer?.domElement?.parentElement
  const dom = host ? makeDom(host) : null
  if (dom) {
    if (plates) {
      dom.add('pSat', 'SATELLITE', 2, 'r'); dom.add('pWater', 'WATER LEVEL', 1, 'r'); dom.add('pAcre', 'ACREAGE', 1, 'r')
    } else if (bars) {
      dom.add('bWater', 'WATER LEVEL', 1, 'c'); dom.add('bAcre', 'ACREAGE', 1, 'c')
      dom.add('bRes', '3 RESERVOIRS', 1, 'c'); dom.add('bRice', 'RICE', 1, 'c')
    } else {
      for (let k = 0; k < 3; k += 1) dom.add(`lake${k}`, 'RESERVOIR', 1, 'c')
      dom.add('three', '3 RESERVOIRS', 1, 'c')
      dom.add('hSat', 'SATELLITE', 2); dom.add('hWater', 'WATER LEVEL', 1); dom.add('hAcre', 'ACREAGE', 1)
    }
  }
  const pv = new THREE.Vector3()
  const view = { w: 1, h: 1, aspect: 1, dpr: 1 }
  /** Project a world anchor to CSS pixels and place a label there (hidden behind the camera). */
  const putWorld = (id, x, y, z, a, anchor) => {
    if (!dom) return
    pv.set(x, y, z).project(camera)
    if (pv.z > 1 || pv.z < -1) { dom.put(id, 0, 0, 0); return }
    dom.put(id, (pv.x * 0.5 + 0.5) * view.w, (1 - (pv.y * 0.5 + 0.5)) * view.h, a, anchor)
  }
  /** Overlay units (x -aspect..aspect, y -1..1) to pixels. */
  const putHud = (id, ox, oy, a) => dom?.put(id, (ox / view.aspect * 0.5 + 0.5) * view.w, (0.5 - oy * 0.5) * view.h, a)

  // ------------------------------------------------------------------ theme
  function setTheme(name) {
    themeName = name === 'light' ? 'light' : 'dark'
    T = THEMES[themeName]
    scene.background = new THREE.Color(T.bg)
    U.cA.value.set(T.a); U.cB.value.set(T.b); U.cC.value.set(T.c); U.cD.value.set(T.d); U.cBg.value.set(T.bg); U.cLow.value.set(T.low); U.cCrest.value.set(T.crest)
    U.uShade.value.set(...T.shade)
    U.uGndMix.value = T.gndMix * (bars ? 1.6 : 1)
    U.uFar.value.set(...T.far)
    U.cGlow.value.set(T.glow)
    U.uGlowAmt.value = T.glowAmt * (bars ? 0.5 : 1)
    if (capMat) { capMat.blending = T.additive ? THREE.AdditiveBlending : THREE.NormalBlending; capMat.needsUpdate = true }
    PU.cPA.value.set(T.plateA); PU.cPB.value.set(T.plateB); PU.cWarm.value.set(T.plateWarm)
    PU.cDot.value.set(T.dot); PU.cLit.value.set(T.dotLit); PU.cField.value.set(T.dotField); PU.cEdge.value.set(T.edge)
    PU.uAlpha.value = T.plateAlpha
    PU.uLight.value = themeName === 'light' ? 1 : 0
    if (plateMesh) {
      plateMesh.material.blending = T.additive ? THREE.AdditiveBlending : THREE.NormalBlending
      plateMesh.material.needsUpdate = true
    }
    lineMat.color.set(T.line); lineMat.opacity = T.lineA * (bars ? 0.45 : 0.7)
    hudTickMat.color.set(T.hud)
    hudDoneMat.color.set(T.hudAccent)
    swath.material.uniforms.cAccent.value.set(T.swath)
    swath.material.blending = T.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    swath.material.needsUpdate = true
    hemi.color.set(T.hemi[0]); hemi.groundColor.set(T.hemi[1]); hemi.intensity = T.hemi[2]
    sun.intensity = T.sun
    sat.setLook(T.sat)
    dom?.theme(T)
  }

  // ------------------------------------------------------------------ view
  const ELEV = ((plates ? 34 : bars ? 30 : ridge ? 34 : 37) * Math.PI) / 180
  const YAW0 = plates ? 0.785 : bars ? 0 : -0.12
  const aim = plates ? new THREE.Vector3(0, 28, 4) : bars ? new THREE.Vector3(2, 6.5, BAR_Z) : new THREE.Vector3(0, 4, 4)
  const corners = [], labelCorners = [] // labelCorners: room for the plate labels on wide stages
  if (plates) {
    for (const x of [PLATE.x0, PLATE.x0 + PLATE.w]) for (const z of [PLATE.z0, PLATE.z0 + PLATE.d]) for (const y of [-1, 80]) corners.push(new THREE.Vector3(x, y, z))
    for (const y of PLATE.ys) labelCorners.push(new THREE.Vector3(PLATE.x0 - 34, y, PLATE.z0 + PLATE.d + 8))
  } else if (bars) {
    for (const x of [-52, 52]) for (const z of [BAR_Z - 3, BAR_Z + 3]) for (const y of [-3, HMAX + 7]) corners.push(new THREE.Vector3(x, y, z))
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
    dom?.size(w)
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

    // satellite sweep: the data rises as it passes over
    const sweepT = clamp(p / 0.25, 0, 1)
    const satX = reduced ? 200 : lerp(SAT_X0, SAT_X1, sweepT)
    U.uSwX.value = reduced ? 999 : satX
    const scanOn = 1 - smooth(0.2, 0.26, p)
    PU.uScan.value = scanOn
    const bob = Math.sin(time * 0.6) * 0.3
    sat.group.position.set(satX, SAT_Y + bob, SAT_Z)
    sat.group.visible = !bars && satX < SAT_X1 - 2
    swPos.set([satX, SAT_Y - 0.6 * SAT_S + bob, SAT_Z, satX, GROUND_Y + 0.2, SZ0, satX, GROUND_Y + 0.2, SZ1])
    swGeo.attributes.position.needsUpdate = true
    swath.visible = sat.group.visible
    swath.material.uniforms.uOpacity.value = scanOn * (T.additive ? 1 : 0.8)

    // camera: a slow drift and a touch of pointer parallax
    const D = lay.D * (1.02 - 0.03 * p)
    const yaw = YAW0 + (bars ? 0.3 : 1) * ((p - 0.5) * 0.08 - px * 0.03 + Math.sin(time * 0.07) * 0.006)
    const elev = ELEV - py * 0.02
    camera.position.set(Math.sin(yaw) * Math.cos(elev) * D, Math.sin(elev) * D, Math.cos(yaw) * Math.cos(elev) * D).add(aim)
    camera.lookAt(aim)
    camera.updateMatrixWorld()

    // labels (DOM, only touched when they move or fade)
    if (!dom) return
    dom.fade(renderer.domElement.style.opacity || '')
    const lv = U.uLvl.value
    const wide = aspectWide()
    const aWater = 0.5 + 0.5 * smooth(0.0, 0.1, p) * (1 - smooth(0.5, 0.6, p))
    const aAcre = 0.5 + 0.5 * smooth(0.55, 0.65, p)
    if (plates) {
      const a = smooth(0.0, 0.05, p)
      const edgeX = PLATE.x0 - 1, edgeZ = PLATE.z0 + PLATE.d + 1
      const aSat = a * (reduced ? 1 : 0.5 + 0.5 * (1 - smooth(0.22, 0.3, p)))
      for (const [id, y, al] of [['pSat', PLATE.ys[2], aSat], ['pWater', PLATE.ys[1], a * aWater], ['pAcre', PLATE.ys[0], a * aAcre]]) {
        if (wide) putWorld(id, edgeX, y, edgeZ, al, 'r')
        else {
          pv.set(edgeX, y + 4, edgeZ).project(camera)
          dom.put(id, 10, (1 - (pv.y * 0.5 + 0.5)) * view.h, al, 'l') // tall stage: pinned to the left edge, left aligned, no room beside the stack
        }
      }
    } else if (bars) {
      const a = smooth(0.0, 0.1, p)
      putWorld('bWater', -33.5, HMAX * 0.99 * Math.max(lv.x, lv.y, lv.z) + 3.4, BAR_Z, a * aWater)
      putWorld('bAcre', 19, HMAX + 3.4, BAR_Z, a * aAcre)
      putWorld('bRes', -33.5, -3.4, BAR_Z + 2.2, smooth(0.08, 0.2, p))
      putWorld('bRice', 19, -3.4, BAR_Z + 2.2, smooth(0.5, 0.65, p))
    } else {
      LAKES.forEach((L, k) => {
        const seen = reduced ? 1 : smooth(L.c[0] - 6, L.c[0] + 4, satX)
        const a = wide ? seen * (1 - smooth(0.88, 0.92, p)) : 0
        putWorld(`lake${k}`, L.c[0], HMAX * 0.97 * [lv.x, lv.y, lv.z][k] + 4.2, L.c[1] + 2, Math.min(1, a))
      })
      putWorld('three', LAKES[1].c[0], HMAX * 0.97 * lv.y + 4.6, LAKES[1].c[1] + 2, settle)
      const lw = lay.hx1 - lay.hx0
      const yL = lay.hy + 0.055
      putHud('hSat', lay.hx0, yL, 0.5 + 0.5 * (1 - smooth(0.22, 0.28, p)))
      putHud('hWater', lay.hx0 + lw * 0.27, yL, aWater)
      putHud('hAcre', lay.hx0 + lw * 0.58, yL, aAcre)
      const xp = lerp(lay.hx0, lay.hx1, p)
      hudDonePos.set([lay.hx0, lay.hy, 0, xp, lay.hy, 0, xp, lay.hy - 0.012, 0, xp, lay.hy + 0.045, 0])
      hudDone.attributes.position.needsUpdate = true
    }
  }

  function render(rend, ctx, target) {
    rend.setRenderTarget(target ?? null)
    rend.render(scene, camera)
    if (hudOn) {
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
    colMesh?.dispose?.()
    capMesh?.dispose?.()
    plateMesh?.dispose?.()
    dom?.dispose()
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
    stats: { instances: n, triangles: ridge ? RG.w * RG.d * 2 : n * 12 + (plates ? 6 : 0) },
  }
}
