/**
 * Shader materials for the map layers. Everything is drawn with premultiplied "over" blending onto a
 * transparent canvas; `u_add` slides each glow layer from ordinary alpha (light theme, ink on paper)
 * toward pure additive light (dark theme), so the canvas blends into whatever page sits behind it.
 *
 * Shared uniforms (one object, referenced by every material):
 *   u_res    drawing-buffer size in device pixels
 *   u_ratio  device pixel ratio (line widths are authored in CSS pixels)
 *   u_t      search time, normalised so 1 = the goal settled
 *   u_fog*   depth haze, as alpha lost with view distance
 */
import * as THREE from 'three'
import { FIELD, MAP_BOUNDS } from './data.js'

export function createShared() {
  return {
    u_res: { value: new THREE.Vector2(1, 1) },
    u_ratio: { value: 1 },
    u_t: { value: 0 },
    u_fogNear: { value: 1e4 },
    u_fogFar: { value: 2e4 },
    u_fog: { value: 0.5 },
    u_field: { value: null },
    u_fb: { value: new THREE.Vector4(FIELD.x0, FIELD.z0, FIELD.x1 - FIELD.x0, FIELD.z1 - FIELD.z0) },
    u_bounds: { value: new THREE.Vector2(MAP_BOUNDS.x, MAP_BOUNDS.z) }
  }
}

const COMMON = /* glsl */ `
uniform vec2 u_res;
uniform float u_ratio;
uniform float u_t;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_fog;
uniform vec2 u_bounds;
uniform sampler2D u_field;
uniform vec4 u_fb;

float mapMask(vec2 w) {
  float mx = 1.0 - smoothstep(u_bounds.x - 560.0, u_bounds.x, abs(w.x));
  float mz = 1.0 - smoothstep(u_bounds.y - 700.0, u_bounds.y, abs(w.y));
  return mx * mz;
}
float fogOf(float viewDist) {
  return 1.0 - u_fog * smoothstep(u_fogNear, u_fogFar, viewDist);
}
`

const DITHER = /* glsl */ `
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(floor(p), 4.0));
  int k = i.x + i.y * 4;
  float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return (m[k] + 0.5) / 16.0;
}
float dither(float a) {
  return step(bayer4(gl_FragCoord.xy / 2.0), a);
}
`

const FINISH = /* glsl */ `
uniform float u_add;
vec4 finish(vec3 c, float a) {
  return vec4(c * a, a * (1.0 - u_add));
}
`

function baseMaterial(name, vertexShader, fragmentShader, uniforms, extra = {}) {
  const { max = false, ...rest } = extra
  return new THREE.ShaderMaterial({
    name,
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: max ? THREE.MaxEquation : THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: max ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    ...rest
  })
}

// ------------------------------------------------------------------------------------ line ribbons

/**
 * Screen-space ribbons from segments. Per vertex: aSeg = (ax, az, bx, bz), aData (per segment),
 * aCorner = (end 0|1, side -1|+1). `hook` must set `width` (device px) and may clear `vis`.
 */
function lineVertex(extraUniforms, hook, zOut = null) {
  return /* glsl */ `
${COMMON}
${extraUniforms}
attribute vec4 aSeg;
attribute vec2 aData;
attribute vec2 aCorner;
uniform float u_y;
varying vec2 vWorld;
varying float vAcross;
varying float vHW;
varying vec2 vData;
varying vec2 vExtra;
varying float vFog;
varying float vEnd;
void main() {
  mat4 vp = projectionMatrix * viewMatrix;
  vec4 ca = vp * vec4(aSeg.x, u_y, aSeg.y, 1.0);
  vec4 cb = vp * vec4(aSeg.z, u_y, aSeg.w, 1.0);
  vec2 sa = ca.xy / ca.w * 0.5 * u_res;
  vec2 sb = cb.xy / cb.w * 0.5 * u_res;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-3 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float width = 1.0;
  float vis = 1.0;
  vec2 extra = vec2(0.0);
  vec2 data = aData;
  ${hook}
  float hw = max(width, 0.0) * 0.5 + 0.75;
  float e = aCorner.x;
  vec2 p = mix(sa, sb, e) + nrm * aCorner.y * hw + dir * (e * 2.0 - 1.0) * hw * 0.6;
  float w = mix(ca.w, cb.w, e);
  gl_Position = vec4(p / (0.5 * u_res) * w, ${zOut === null ? 'mix(ca.z, cb.z, e)' : `${zOut.toFixed(3)} * w`}, w);
  if (vis < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vWorld = mix(aSeg.xy, aSeg.zw, e);
  vAcross = aCorner.y * hw;
  vHW = width * 0.5;
  vData = data;
  vExtra = extra;
  vFog = fogOf(w);
  vEnd = e;
}`
}

const lineFragment = (uniforms, body) => /* glsl */ `
${COMMON}
${DITHER}
${FINISH}
${uniforms}
varying vec2 vWorld;
varying float vAcross;
varying float vHW;
varying vec2 vData;
varying vec2 vExtra;
varying float vFog;
varying float vEnd;
float cov() { return clamp(vHW + 0.5 - abs(vAcross), 0.0, 1.0); }
float gauss() { float x = vAcross / max(vHW + 0.75, 0.001); return exp(-x * x * 3.2); }
void main() {
  ${body}
}`

export function buildSegmentGeometry({ seg, dat, count }) {
  const pos = new Float32Array(count * 4 * 3)
  const aSeg = new Float32Array(count * 4 * 4)
  const aData = new Float32Array(count * 4 * 2)
  const aCorner = new Float32Array(count * 4 * 2)
  const index = new Uint32Array(count * 6)
  const corners = [
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 1]
  ]
  for (let i = 0; i < count; i += 1) {
    for (let c = 0; c < 4; c += 1) {
      const v = i * 4 + c
      aSeg.set(seg.subarray(i * 4, i * 4 + 4), v * 4)
      aData[v * 2] = dat[i * 2]
      aData[v * 2 + 1] = dat[i * 2 + 1]
      aCorner[v * 2] = corners[c][0]
      aCorner[v * 2 + 1] = corners[c][1]
    }
    const b = i * 4
    index.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], i * 6)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aSeg', new THREE.BufferAttribute(aSeg, 4))
  g.setAttribute('aData', new THREE.BufferAttribute(aData, 2))
  g.setAttribute('aCorner', new THREE.BufferAttribute(aCorner, 2))
  g.setIndex(new THREE.BufferAttribute(index, 1))
  return g
}

/** Draw each pixel at most once (the ribbon is written at one constant depth): no stacking where segments overlap. */
const ONCE = { depthTest: true, depthWrite: true, depthFunc: THREE.LessDepth }

const col = () => ({ value: new THREE.Vector3() })

/**
 * The street network. Default: fine hairlines. With `u_glow` = 1 (the `?roads=glow` look) each street is a
 * thin bright core plus a soft falloff halo in ONE ribbon pass (no extra draw call), amber for through
 * streets (aData.x = 1) and cyan for the rest, dim until the search reaches them, flaring as its front passes.
 */
export function createRoadsMaterial(shared) {
  const uniforms = {
    ...shared,
    u_y: { value: 0.3 },
    u_add: { value: 0 },
    u_ink: col(),
    u_alpha: { value: 0.2 },
    u_width: { value: 0.9 },
    u_glow: { value: 0 },
    u_colMain: col(),
    u_colSide: col(),
    u_hotCol: col(),
    u_dim: { value: 0.4 },
    u_boost: { value: 1 }
  }
  const decl = 'uniform float u_width; uniform float u_glow;'
  return baseMaterial(
    'Roads',
    lineVertex(decl, 'width = (u_glow > 0.5 ? mix(7.0, 12.0, data.x) : u_width) * u_ratio;'),
    lineFragment('uniform vec3 u_ink; uniform float u_alpha; uniform float u_glow; uniform vec3 u_colMain; uniform vec3 u_colSide; uniform vec3 u_hotCol; uniform float u_dim; uniform float u_boost;', `
      if (u_glow < 0.5) {
        float a = u_alpha * cov() * vFog * mapMask(vWorld);
        gl_FragColor = finish(u_ink, a);
        return;
      }
      float d = abs(vAcross) / u_ratio;
      float prim = vData.x;
      float core = clamp(mix(0.55, 0.85, prim) + 0.4 - d, 0.0, 1.0);
      float sig = mix(2.1, 3.4, prim);
      float halo = exp(-d * d / (sig * sig)) * mix(0.34, 0.5, prim);
      vec2 f = texture2D(u_field, clamp((vWorld - u_fb.xy) / u_fb.zw, 0.0, 1.0)).rg;
      float age = u_t - f.x;
      float near = 1.0 - smoothstep(90.0, 230.0, f.y);
      float reached = smoothstep(0.0, 0.05, age) * near;
      float front = exp(-max(age, 0.0) / 0.045) * step(0.0, age) * near;
      float bright = (mix(u_dim, 1.0, reached) + front * 0.9) * u_boost;
      vec3 c = mix(u_colSide, u_colMain, prim);
      c = mix(c, u_hotCol, front * 0.45);
      c = mix(c, vec3(1.0), core * 0.25);
      float a = clamp(max(core, halo) * bright, 0.0, 1.0) * vFog * mapMask(vWorld);
      gl_FragColor = finish(c, a);
    `),
    uniforms
  )
}

/** Examined edges: the search. `halo` draws the wide soft glow of the freshest edges. */
export function createExploredMaterial(shared, { halo = false } = {}) {
  const uniforms = {
    ...shared,
    u_y: { value: 0.5 },
    u_add: { value: 0 },
    u_settledCol: col(),
    u_hotCol: col(),
    u_settled: { value: 0.6 },
    u_width: { value: 1.2 },
    u_hotWidth: { value: 0.9 },
    u_hotLen: { value: 0.05 },
    u_haloWidth: { value: 14 },
    u_haloGain: { value: 0.5 },
    u_vis: { value: 1 }
  }
  const decl = 'uniform float u_width, u_hotWidth, u_hotLen, u_haloWidth;'
  const hook = halo
    ? `
      float age = u_t - data.x;
      float hot = exp(-max(age, 0.0) / (u_hotLen * 0.6));
      vis = step(0.0, age) * step(0.02, hot);
      width = u_haloWidth * u_ratio;
      extra = vec2(age, hot);`
    : `
      float age = u_t - data.x;
      float hot = exp(-max(age, 0.0) / u_hotLen);
      vis = step(0.0, age);
      width = u_width * u_ratio * (1.0 + u_hotWidth * hot);
      extra = vec2(age, hot);`
  const body = halo
    ? `
      float a = vExtra.y * vExtra.y * u_haloGain * gauss() * vFog * mapMask(vWorld) * u_vis;
      gl_FragColor = finish(u_hotCol, a);`
    : `
      float hot = vExtra.y;
      vec3 c = mix(u_settledCol, u_hotCol, smoothstep(0.1, 0.9, hot));
      float a = (u_settled + (1.0 - u_settled) * hot) * cov() * vFog * mapMask(vWorld) * u_vis;
      gl_FragColor = finish(c, a);`
  return baseMaterial(
    halo ? 'ExploredHalo' : 'Explored',
    lineVertex(decl, hook, halo ? 0.6 : null),
    lineFragment('uniform vec3 u_settledCol; uniform vec3 u_hotCol; uniform float u_settled; uniform float u_haloGain; uniform float u_vis;', body),
    uniforms,
    halo ? ONCE : {}
  )
}

/** The circuit centrelines: ink hairlines that light up when the route arrives. */
export function createCircuitMaterial(shared) {
  const uniforms = {
    ...shared,
    u_y: { value: 0.6 },
    u_add: { value: 0 },
    u_ink: col(),
    u_lit: col(),
    u_alpha: { value: 0.5 },
    u_amount: { value: 0 },
    u_width: { value: 1.3 },
    u_litWidth: { value: 0.5 }
  }
  const decl = 'uniform float u_width, u_litWidth, u_amount;'
  return baseMaterial(
    'Circuit',
    lineVertex(decl, 'width = (u_width + u_litWidth * u_amount) * u_ratio;'),
    lineFragment('uniform vec3 u_ink; uniform vec3 u_lit; uniform float u_alpha; uniform float u_amount;', `
      vec3 c = mix(u_ink, u_lit, u_amount);
      float a = mix(u_alpha, 0.7, u_amount) * cov() * vFog;
      gl_FragColor = finish(c, a);
    `),
    uniforms
  )
}

/**
 * The answer. mode 'casing' = a paper-coloured keyline under it, 'glow' = soft halo, 'core' = the line.
 * `u_reveal` is the arc-length fraction drawn so far; the head burns hot and cools behind it.
 */
export function createRouteMaterial(shared, mode) {
  const uniforms = {
    ...shared,
    u_y: { value: 0.9 },
    u_add: { value: 0 },
    u_routeCol: col(),
    u_hotCol: col(),
    u_paper: col(),
    u_reveal: { value: 0 },
    u_width: { value: 3 },
    u_heatK: { value: 30 },
    u_glow: { value: 0.6 },
    u_haloWidth: { value: 16 },
    u_gain: { value: 1 }
  }
  const decl = 'uniform float u_width, u_haloWidth, u_reveal;'
  const width = mode === 'core' ? 'u_width * u_ratio' : mode === 'glow' ? 'u_haloWidth * u_ratio' : '(u_width + 5.0) * u_ratio'
  const hook = `width = ${width}; vis = step(data.x, u_reveal);`
  const frag = lineFragment(
    'uniform vec3 u_routeCol; uniform vec3 u_hotCol; uniform vec3 u_paper; uniform float u_reveal; uniform float u_heatK; uniform float u_glow; uniform float u_gain;',
    `
      float u = mix(vData.x, vData.y, vEnd);
      if (u > u_reveal) discard;
      float heat = exp(-(u_reveal - u) * u_heatK);
      ${
        mode === 'core'
          ? `vec3 c = mix(u_routeCol, u_hotCol, heat * 0.85);
             gl_FragColor = finish(c, cov() * vFog);`
          : mode === 'glow'
            ? `float a = gauss() * (u_glow + (1.0 - u_glow) * heat) * u_gain * 0.85 * vFog;
               gl_FragColor = finish(mix(u_routeCol, u_hotCol, heat * 0.5), a);`
            : `float ca = cov() * 0.85 * vFog;
             gl_FragColor = vec4(u_paper * ca, ca);`
      }
    `
  )
  return baseMaterial('Route-' + mode, lineVertex(decl, hook, mode === 'glow' ? 0.4 : null), frag, uniforms, mode === 'glow' ? ONCE : {})
}

// -------------------------------------------------------------------------------------- field overlay

/**
 * The search as a field on the ground: travel-time contours, a stippled wash trailing the front,
 * and a hairline rim exactly at the front. Drawn on one big quad.
 */
export function createFieldMaterial(shared) {
  const uniforms = {
    ...shared,
    u_add: { value: 0 },
    u_accent: col(),
    u_hot: col(),
    u_contour: { value: 0.25 },
    u_haze: { value: 0.4 },
    u_hazeK: { value: 22 },
    u_settledMix: { value: 0.35 }
  }
  return baseMaterial(
    'Field',
    /* glsl */ `
${COMMON}
varying vec2 vWorld;
varying float vView;
void main() {
  vWorld = position.xz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
    /* glsl */ `
${COMMON}
${DITHER}
${FINISH}
uniform vec3 u_accent;
uniform vec3 u_hot;
uniform float u_contour;
uniform float u_haze;
uniform float u_hazeK;
uniform float u_settledMix;
varying vec2 vWorld;
varying float vView;
void main() {
  vec2 uv = (vWorld - u_fb.xy) / u_fb.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec2 f = texture2D(u_field, uv).rg;
  float T = f.x;
  float mask = (1.0 - smoothstep(90.0, 230.0, f.y)) * mapMask(vWorld) * fogOf(vView);
  float age = u_t - T;
  float on = step(0.0, age) * mask;
  float fw = max(fwidth(T), 1e-5);

  // isochrone contours every 0.04 of the search
  float g = T / 0.04;
  float cd = abs(fract(g + 0.5) - 0.5) / max(fwidth(g), 1e-4);
  float line = (1.0 - smoothstep(0.4, 1.4, cd)) * on;
  // fade older contours slightly so the front reads as the brightest thing
  float settle = mix(1.0, u_settledMix, smoothstep(0.0, 0.2, age));

  // the front itself, one hairline contour at level u_t
  float rimPx = abs(age) / fw;
  float rim = (1.0 - smoothstep(0.6, 2.4, rimPx)) * mask * step(0.001, u_t);

  // stippled wash trailing the front
  float wash = exp(-max(age, 0.0) * u_hazeK) * on * u_haze;
  float stipple = dither(wash) * step(0.04, wash);

  float a = max(max(line * u_contour * settle, stipple * 0.55), rim * 0.9);
  vec3 c = mix(u_accent, u_hot, max(rim, wash * 0.8));
  gl_FragColor = finish(c, a);
}`,
    uniforms
  )
}

/** Parks and water as flat tone and stipple. */
export function createGroundMaterial(shared) {
  const uniforms = {
    ...shared,
    u_add: { value: 0 },
    u_ink: col(),
    u_water: { value: 0.07 },
    u_park: { value: 0.1 }
  }
  return baseMaterial(
    'Ground',
    /* glsl */ `
${COMMON}
attribute float aLayer;
varying vec2 vWorld;
varying float vLayer;
varying float vView;
void main() {
  vWorld = position.xz;
  vLayer = aLayer;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
    /* glsl */ `
${COMMON}
${DITHER}
${FINISH}
uniform vec3 u_ink;
uniform float u_water;
uniform float u_park;
varying vec2 vWorld;
varying float vLayer;
varying float vView;
void main() {
  float m = mapMask(vWorld) * fogOf(vView);
  float a;
  if (vLayer > 0.5) {
    // water: a flat tone with a fine stipple
    a = u_water * 0.7 + dither(u_water * 2.2) * u_water * 0.9;
  } else {
    // parks: stipple only
    a = dither(u_park * 1.6) * u_park * 2.6;
  }
  gl_FragColor = finish(u_ink, a * m);
}`,
    uniforms,
    { side: THREE.DoubleSide }
  )
}

/** Buildings: low relief, dithered walls, lit and raised as the search passes. */
export function createBuildingsMaterial(shared) {
  const uniforms = {
    ...shared,
    u_add: { value: 0 },
    u_ink: col(),
    u_accent: col(),
    u_hot: col(),
    u_roof: { value: 0.06 },
    u_wall: { value: 0.12 },
    u_hs: { value: 0.5 },
    u_hmin: { value: 0.35 },
    u_glow: { value: 0 }
  }
  return baseMaterial(
    'Buildings',
    /* glsl */ `
${COMMON}
uniform float u_hs;
uniform float u_hmin;
varying vec3 vW;
varying float vLit;
varying float vHot;
varying float vFog;
void main() {
  vec2 q = (floor(position.xz / 28.0) + 0.5) * 28.0;
  vec2 uv = (q - u_fb.xy) / u_fb.zw;
  vec2 f = texture2D(u_field, clamp(uv, 0.0, 1.0)).rg;
  float mask = 1.0 - smoothstep(90.0, 230.0, f.y);
  float age = u_t - f.x;
  float lit = smoothstep(0.0, 0.06, age) * mask;
  vLit = lit;
  vHot = exp(-max(age, 0.0) / 0.035) * step(0.0, age) * mask;
  vec3 p = position;
  p.y *= u_hs * mix(u_hmin, 1.0, lit);
  vW = p;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vFog = fogOf(-mv.z) * mapMask(p.xz);
  gl_Position = projectionMatrix * mv;
}`,
    /* glsl */ `
${COMMON}
${DITHER}
${FINISH}
uniform vec3 u_ink;
uniform vec3 u_accent;
uniform vec3 u_hot;
uniform float u_roof;
uniform float u_wall;
uniform float u_glow;
varying vec3 vW;
varying float vLit;
varying float vHot;
varying float vFog;
void main() {
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  float roof = step(0.6, abs(n.y));
  if (u_glow > 0.5) {
    // dark extruded blocks: a faint cool roof, one wall catching light, the other falling into black
    float side = smoothstep(-0.45, 0.45, dot(n.xz, vec2(0.7071)));
    vec3 wc = mix(vec3(0.0), vec3(0.42, 0.52, 0.66), side);
    float wa = mix(0.62, 0.2, side);
    vec3 cc = mix(wc, vec3(0.55, 0.6, 0.68), roof);
    float ca = mix(wa, 0.1 + 0.04 * clamp(vW.y / 60.0, 0.0, 1.0), roof);
    cc = mix(cc, u_accent, vLit * 0.5);
    cc = mix(cc, u_hot, vHot * 0.7);
    ca += vLit * 0.05 + vHot * 0.25 * roof;
    gl_FragColor = finish(cc, ca * vFog);
    return;
  }
  float h = clamp(vW.y / 120.0, 0.0, 1.0);
  float base = mix(u_wall * 2.2 * dither(0.5), u_roof * (0.8 + 0.5 * h), roof);
  vec3 c = mix(u_ink, u_accent, vLit * 0.85);
  c = mix(c, u_hot, vHot * 0.8);
  float a = base + vLit * mix(0.03, 0.1, roof) + vHot * 0.3 * roof;
  // The baked undersides are gone from the mesh; they only ever doubled the roof's own alpha, so do that here.
  float under = u_roof * 0.8 + vLit * 0.1 + vHot * 0.3;
  a = mix(a, a + under - a * under, roof);
  gl_FragColor = finish(c, a * vFog);
}`,
    uniforms,
    { depthTest: true, depthWrite: true, side: THREE.DoubleSide }
  )
}

// ------------------------------------------------------------------------------------------ markers

/** A small ring + dot used for RMIT and the destination. */
export function createMarkerMaterial(shared) {
  const uniforms = {
    ...shared,
    u_add: { value: 0 },
    u_ink: col(),
    u_alpha: { value: 1 },
    u_size: { value: 18 },
    u_fill: { value: 0 }
  }
  return baseMaterial(
    'Marker',
    /* glsl */ `
uniform float u_size;
uniform float u_ratio;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = u_size * u_ratio;
}`,
    /* glsl */ `
${DITHER}
${FINISH}
uniform vec3 u_ink;
uniform float u_alpha;
uniform float u_ratio;
uniform float u_size;
uniform float u_fill;
void main() {
  vec2 p = (gl_PointCoord - 0.5) * u_size * u_ratio;
  float r = length(p);
  float rad = u_size * u_ratio * 0.5 - 1.5 * u_ratio;
  float ring = 1.0 - smoothstep(0.0, 1.0, abs(r - rad) - 0.6 * u_ratio);
  float core = 1.0 - smoothstep(rad * 0.2 - 0.5, rad * 0.2 + 0.7, r);
  float a = max(ring, core * (0.5 + 0.5 * u_fill));
  gl_FragColor = finish(u_ink, a * u_alpha);
}`,
    uniforms
  )
}
