/**
 * Harvest "orbit" variants: generated maps (baked once at init).
 *
 *  bakeEarthMaps(THREE, renderer, { w, h })  equirect RGBA8: R land mask, G relief, B clouds, A city lights.
 *  bakeRegionMap(THREE)                      512 x 512 RGBA8 map of the Harvest world (reservoirs, paddies, canals).
 *  REGION                                    internal region centre + world window (never displayed).
 *
 * Texture conventions (both maps): v = 1 is NORTH (equirect: lat +90 at v = 1, lon -180..180 at u = 0..1;
 * region map: world z = window.z0 (north, -z) at v = 1, x = window.x0 at u = 0). Nothing is flipped on upload, so
 * data row 0 is the SOUTH row. No mipmaps, linear filtering, no colour space.
 *
 * The planet is built from 3D integer-hash value noise sampled on the unit sphere (no seam, no polar pinch). The same
 * hash and algorithm run in GLSL (render-target bake) and in JS (CPU fallback), so both give the same planet.
 */
import { LAKES, lakeD, buildNetwork, buildPaddies, MAIN_Z } from './world.js'

export const REGION = { lat: 39.5, lon: -122.0, window: { x0: -60, x1: 60, z0: -46, z1: 50 } }

const SEED = 7
const SEEDH = Math.imul(SEED, 3266489917) >>> 0
const RAD = Math.PI / 180

/* ------------------------------------------------------------------ tunables (shared by GLSL and JS) */
const T = {
  scale: 2.4, // continent noise frequency on the unit sphere
  gain: 2.2, level: 0.0, // contrast and offset applied to the fbm field (equivalent to moving the threshold)
  warp: 0.95, // domain warp strength
  thresh: 0.53,
  soft: 0.02,
  contLat: 38, contLon: -104, contW: 0.9, contAmp: 0.24, // a continent behind the region (east of it)
  seaLat: 8, seaLon: -150, seaW: 0.7, seaAmp: 0.12, // an ocean basin to the west of it
  cloudThresh: 0.58,
  clearDeg: 7, // clouds are 0 inside this many degrees of the region
  cityClearDeg: 8.5, // no city lights inside this many degrees of the region
}

/* ------------------------------------------------------------------ GLSL (bake on the GPU) */
const GLSL_COMMON = /* glsl */ `
#define SEEDH ${SEEDH}u
#define PI 3.14159265359
#define RAD 0.017453292519943295
const float SCALE = ${T.scale.toFixed(4)};
const float WARP = ${T.warp.toFixed(4)};
const float GAIN = ${T.gain.toFixed(4)};
const float LEVEL = ${T.level.toFixed(4)};
const float THRESH = ${T.thresh.toFixed(4)};
const float SOFT = ${T.soft.toFixed(4)};
const vec2 REG = vec2(${REGION.lat.toFixed(2)}, ${REGION.lon.toFixed(2)});

float h3(ivec3 q) {
  uint h = uint(q.x) * 374761393u + uint(q.y) * 668265263u + uint(q.z) * 2246822519u + SEEDH;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h ^ (h >> 16u)) * (1.0 / 4294967296.0);
}
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * (3.0 - 2.0 * f);
  ivec3 b = ivec3(i);
  float x00 = mix(h3(b), h3(b + ivec3(1, 0, 0)), u.x);
  float x10 = mix(h3(b + ivec3(0, 1, 0)), h3(b + ivec3(1, 1, 0)), u.x);
  float x01 = mix(h3(b + ivec3(0, 0, 1)), h3(b + ivec3(1, 0, 1)), u.x);
  float x11 = mix(h3(b + ivec3(0, 1, 1)), h3(b + ivec3(1, 1, 1)), u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
}
float fbm3(vec3 p, int oct) {
  float s = 0.0, a = 0.5, f = 1.0, t = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    s += a * noise3(p * f + vec3(17.3, 9.1, 5.7) * float(i));
    t += a; f *= 2.03; a *= 0.5;
  }
  return s / t;
}
vec3 sph(float lat, float lon) {
  float cl = cos(lat * RAD);
  return vec3(cl * cos(lon * RAD), sin(lat * RAD), cl * sin(lon * RAD));
}
float degTo(vec3 p, float lat, float lon) { return acos(clamp(dot(p, sph(lat, lon)), -1.0, 1.0)) / RAD; }
float bump(vec3 p, float lat, float lon, float w) { float a = acos(clamp(dot(p, sph(lat, lon)), -1.0, 1.0)); return exp(-(a * a) / (w * w)); }

// land field: > THRESH is land. Includes the enforced Pacific coastline near the region.
float landField(vec3 p, float lat, float lon) {
  vec3 w = vec3(fbm3(p * 1.6 + vec3(3.1, 7.7, 1.3), 3), fbm3(p * 1.6 + vec3(11.3, 2.9, 8.1), 3), fbm3(p * 1.6 + vec3(5.7, 13.1, 4.3), 3)) - 0.5;
  float f = 0.5 + (fbm3(p * SCALE + w * WARP, 5) - 0.5) * GAIN + LEVEL;
  f += ${T.contAmp.toFixed(3)} * bump(p, ${T.contLat.toFixed(1)}, ${T.contLon.toFixed(1)}, ${T.contW.toFixed(3)});
  f -= ${T.seaAmp.toFixed(3)} * bump(p, ${T.seaLat.toFixed(1)}, ${T.seaLon.toFixed(1)}, ${T.seaW.toFixed(3)});
  // Pacific coast: lon = -124 + 2 sin(6 lat). Wide soft bias (land east, sea west) so the coast belongs to a real continent,
  // then an exact override inside lat 30..48, lon -130..-112 (the wiggle is 0.6 deg there, larger outside).
  float coast = -124.0 + 2.0 * sin(lat * 6.0 * RAD);
  float wl = smoothstep(26.0, 30.0, lat) * (1.0 - smoothstep(48.0, 53.0, lat));
  float wig = fbm3(p * 9.0 + vec3(2.0, 5.0, 9.0), 3) - 0.5;
  float d = lon - coast + (1.2 + 7.0 * (1.0 - wl)) * wig;
  float wide = smoothstep(12.0, 30.0, lat) * (1.0 - smoothstep(48.0, 66.0, lat));
  float east = smoothstep(-2.0, 3.0, d) * (1.0 - smoothstep(-112.0, -72.0, lon));
  float west = (1.0 - smoothstep(-3.0, 2.0, d)) * smoothstep(-170.0, -140.0, lon) * smoothstep(-8.0, -2.0, d);
  f += wide * (0.30 * east - 0.22 * west);
  float wo = smoothstep(-136.0, -130.0, lon) * (1.0 - smoothstep(-112.0, -108.0, lon));
  float forced = THRESH + 0.35 * clamp(d / 1.5, -1.0, 1.0);
  return mix(f, forced, wl * wo);
}
float landMask(float f) { return smoothstep(THRESH - SOFT, THRESH + SOFT, f); }
float reliefAt(vec3 p, float f) {
  float inland = smoothstep(THRESH, THRESH + 0.16, f);
  float r = fbm3(p * 5.0 + vec3(1.0, 8.0, 3.0), 4);
  float ridge = 1.0 - abs(2.0 * fbm3(p * 3.1 + vec3(6.0, 2.0, 7.0), 4) - 1.0);
  float zone = smoothstep(0.42, 0.60, fbm3(p * 2.0 + vec3(9.0, 4.0, 1.0), 3));
  return clamp(0.06 + inland * (0.30 * r + 0.85 * ridge * ridge * ridge * zone), 0.0, 1.0);
}

float cityAt(vec2 uv, vec3 p) {
  vec2 g = uv * vec2(128.0, 64.0);
  vec2 base = floor(g);
  vec2 fr = g - base;
  vec2 sg = vec2(fr.x < 0.5 ? -1.0 : 1.0, fr.y < 0.5 ? -1.0 : 1.0);
  float a = 0.0;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 c = base + vec2(float(i) * sg.x, float(j) * sg.y);
      if (c.y < 0.0 || c.y > 63.0) continue;
      ivec2 id = ivec2(mod(c.x, 128.0), c.y);
      if (h3(ivec3(id, 101)) > 0.30) continue;
      vec2 pt = c + vec2(0.3 + 0.4 * h3(ivec3(id, 102)), 0.3 + 0.4 * h3(ivec3(id, 103)));
      float lat = pt.y / 64.0 * 180.0 - 90.0, lon = pt.x / 128.0 * 360.0 - 180.0;
      vec3 q = sph(lat, lon);
      float f = landField(q, lat, lon);
      if (f < THRESH + 0.03) continue;
      if (reliefAt(q, f) > 0.5) continue;
      float cluster = 0.10 + 0.90 * smoothstep(0.42, 0.58, fbm3(q * 3.0 + vec3(4.0, 1.0, 6.0), 3));
      float coastal = 1.0 - smoothstep(0.03, 0.12, f - THRESH);
      float latFade = 1.0 - smoothstep(55.0, 68.0, abs(lat));
      float prob = cluster * (0.35 + 0.65 * coastal) * latFade;
      if (h3(ivec3(id, 104)) > prob) continue;
      float br = 0.45 + 0.55 * pow(h3(ivec3(id, 105)), 1.5);
      vec2 dt = (g - pt) * 8.0;
      a = max(a, br * exp(-dot(dt, dt) / (2.0 * 1.2 * 1.2)));
    }
  }
  return a * smoothstep(${T.cityClearDeg.toFixed(2)}, ${(T.cityClearDeg + 4.5).toFixed(2)}, degTo(p, REG.x, REG.y));
}

vec4 earthTexel(vec2 uv) {
  float lat = uv.y * 180.0 - 90.0, lon = uv.x * 360.0 - 180.0;
  vec3 p = sph(lat, lon);
  float f = landField(p, lat, lon);
  float land = landMask(f);
  float relief = land * reliefAt(p, f);
  vec3 cw = vec3(fbm3(p * 2.2 + vec3(7.0, 1.0, 2.0), 3), fbm3(p * 2.2 + vec3(1.0, 9.0, 4.0), 3), fbm3(p * 2.2 + vec3(5.0, 3.0, 8.0), 3)) - 0.5;
  float cf = fbm3(p * 3.4 + cw * 1.1 + vec3(0.0, 4.0, 9.0), 5);
  float cloud = smoothstep(${T.cloudThresh.toFixed(3)} - 0.05, ${T.cloudThresh.toFixed(3)} + 0.12, cf);
  cloud *= smoothstep(${T.clearDeg.toFixed(2)}, ${(T.clearDeg + 5).toFixed(2)}, degTo(p, REG.x, REG.y));
  return vec4(land, relief, cloud, cityAt(uv, p) * land);
}
`

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`
const FRAG = /* glsl */ `
varying vec2 vUv;
${GLSL_COMMON}
void main() { gl_FragColor = earthTexel(vUv); }
`

/* ------------------------------------------------------------------ JS port (CPU fallback; same algorithm) */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const mixf = (a, b, t) => a + (b - a) * t

function h3(ix, iy, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2246822519) + SEEDH) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz)
  const x00 = mixf(h3(ix, iy, iz), h3(ix + 1, iy, iz), ux)
  const x10 = mixf(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), ux)
  const x01 = mixf(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), ux)
  const x11 = mixf(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), ux)
  return mixf(mixf(x00, x10, uy), mixf(x01, x11, uy), uz)
}
function fbm3(x, y, z, oct) {
  let s = 0, a = 0.5, f = 1, t = 0
  for (let i = 0; i < oct; i += 1) {
    s += a * noise3(x * f + 17.3 * i, y * f + 9.1 * i, z * f + 5.7 * i)
    t += a; f *= 2.03; a *= 0.5
  }
  return s / t
}
function sph(lat, lon) {
  const cl = Math.cos(lat * RAD)
  return [cl * Math.cos(lon * RAD), Math.sin(lat * RAD), cl * Math.sin(lon * RAD)]
}
const REGV = sph(REGION.lat, REGION.lon)
const angTo = (p, v) => Math.acos(clamp(p[0] * v[0] + p[1] * v[1] + p[2] * v[2], -1, 1))
const degToRegion = (p) => angTo(p, REGV) / RAD
function bump(p, lat, lon, w) { const a = angTo(p, sph(lat, lon)); return Math.exp(-(a * a) / (w * w)) }

function landField(p, lat, lon) {
  const [x, y, z] = p
  const wx = fbm3(x * 1.6 + 3.1, y * 1.6 + 7.7, z * 1.6 + 1.3, 3) - 0.5
  const wy = fbm3(x * 1.6 + 11.3, y * 1.6 + 2.9, z * 1.6 + 8.1, 3) - 0.5
  const wz = fbm3(x * 1.6 + 5.7, y * 1.6 + 13.1, z * 1.6 + 4.3, 3) - 0.5
  let f = 0.5 + (fbm3(x * T.scale + wx * T.warp, y * T.scale + wy * T.warp, z * T.scale + wz * T.warp, 5) - 0.5) * T.gain + T.level
  f += T.contAmp * bump(p, T.contLat, T.contLon, T.contW)
  f -= T.seaAmp * bump(p, T.seaLat, T.seaLon, T.seaW)
  const coast = -124 + 2 * Math.sin(lat * 6 * RAD)
  const wl = sstep(26, 30, lat) * (1 - sstep(48, 53, lat))
  const wig = fbm3(x * 9 + 2, y * 9 + 5, z * 9 + 9, 3) - 0.5
  const d = lon - coast + (1.2 + 7 * (1 - wl)) * wig
  const wide = sstep(12, 30, lat) * (1 - sstep(48, 66, lat))
  const east = sstep(-2, 3, d) * (1 - sstep(-112, -72, lon))
  const west = (1 - sstep(-3, 2, d)) * sstep(-170, -140, lon) * sstep(-8, -2, d)
  f += wide * (0.30 * east - 0.22 * west)
  const wo = sstep(-136, -130, lon) * (1 - sstep(-112, -108, lon))
  const forced = T.thresh + 0.35 * clamp(d / 1.5, -1, 1)
  return mixf(f, forced, wl * wo)
}
const landMask = (f) => sstep(T.thresh - T.soft, T.thresh + T.soft, f)
function reliefAt(p, f) {
  const inland = sstep(T.thresh, T.thresh + 0.16, f)
  const r = fbm3(p[0] * 5 + 1, p[1] * 5 + 8, p[2] * 5 + 3, 4)
  const q = 1 - Math.abs(2 * fbm3(p[0] * 3.1 + 6, p[1] * 3.1 + 2, p[2] * 3.1 + 7, 4) - 1)
  const zone = sstep(0.42, 0.6, fbm3(p[0] * 2 + 9, p[1] * 2 + 4, p[2] * 2 + 1, 3))
  return clamp(0.06 + inland * (0.3 * r + 0.85 * q * q * q * zone), 0, 1)
}
function cityAt(u, v, p) {
  const gx = u * 128, gy = v * 64
  const bx = Math.floor(gx), by = Math.floor(gy)
  const sx = gx - bx < 0.5 ? -1 : 1, sy = gy - by < 0.5 ? -1 : 1
  let a = 0
  for (let j = 0; j < 2; j += 1) {
    for (let i = 0; i < 2; i += 1) {
      const cx = bx + i * sx, cy = by + j * sy
      if (cy < 0 || cy > 63) continue
      const idx = ((cx % 128) + 128) % 128
      if (h3(idx, cy, 101) > 0.30) continue
      const px = cx + 0.3 + 0.4 * h3(idx, cy, 102), py = cy + 0.3 + 0.4 * h3(idx, cy, 103)
      const lat = (py / 64) * 180 - 90, lon = (px / 128) * 360 - 180
      const q = sph(lat, lon)
      const f = landField(q, lat, lon)
      if (f < T.thresh + 0.03) continue
      if (reliefAt(q, f) > 0.5) continue
      const cluster = 0.10 + 0.90 * sstep(0.42, 0.58, fbm3(q[0] * 3 + 4, q[1] * 3 + 1, q[2] * 3 + 6, 3))
      const coastal = 1 - sstep(0.03, 0.12, f - T.thresh)
      const latFade = 1 - sstep(55, 68, Math.abs(lat))
      const prob = cluster * (0.35 + 0.65 * coastal) * latFade
      if (h3(idx, cy, 104) > prob) continue
      const br = 0.45 + 0.55 * Math.pow(h3(idx, cy, 105), 1.5)
      const dx = (gx - px) * 8, dy = (gy - py) * 8
      a = Math.max(a, br * Math.exp(-(dx * dx + dy * dy) / (2 * 1.2 * 1.2)))
    }
  }
  return a * sstep(T.cityClearDeg, T.cityClearDeg + 4.5, degToRegion(p))
}
function earthTexel(u, v, out) {
  const lat = v * 180 - 90, lon = u * 360 - 180
  const p = sph(lat, lon)
  const f = landField(p, lat, lon)
  const land = landMask(f)
  const relief = land * reliefAt(p, f)
  const [x, y, z] = p
  const cx = fbm3(x * 2.2 + 7, y * 2.2 + 1, z * 2.2 + 2, 3) - 0.5
  const cy = fbm3(x * 2.2 + 1, y * 2.2 + 9, z * 2.2 + 4, 3) - 0.5
  const cz = fbm3(x * 2.2 + 5, y * 2.2 + 3, z * 2.2 + 8, 3) - 0.5
  const cf = fbm3(x * 3.4 + cx * 1.1, y * 3.4 + cy * 1.1 + 4, z * 3.4 + cz * 1.1 + 9, 5)
  let cloud = sstep(T.cloudThresh - 0.05, T.cloudThresh + 0.12, cf)
  cloud *= sstep(T.clearDeg, T.clearDeg + 5, degToRegion(p))
  out[0] = land; out[1] = relief; out[2] = cloud
  out[3] = land > 0 ? cityAt(u, v, p) * land : 0
}
function bakeEarthCPU(w, h) {
  const data = new Uint8Array(w * h * 4)
  const px = [0, 0, 0, 0]
  for (let j = 0; j < h; j += 1) { // row 0 = south (v = 0)
    const v = (j + 0.5) / h
    for (let i = 0; i < w; i += 1) {
      earthTexel((i + 0.5) / w, v, px)
      const o = (j * w + i) * 4
      for (let c = 0; c < 4; c += 1) data[o + c] = Math.round(clamp(px[c], 0, 1) * 255)
    }
  }
  return data
}

/* ------------------------------------------------------------------ public: Earth */
function dataTexture(THREE, data, w, h) {
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.colorSpace = THREE.NoColorSpace
  tex.flipY = false
  tex.needsUpdate = true
  return tex
}

/**
 * Bake the planet. `opts.cpu` (tests only) forces the CPU path at the requested size; the automatic CPU fallback is 512 x 256.
 * Returns { tex, dispose() }. Equirect: u = (lon + 180) / 360, v = (lat + 90) / 180 (v = 1 north).
 */
export function bakeEarthMaps(THREE, renderer, { w = 1024, h = 512, cpu = false } = {}) {
  if (!cpu && renderer) {
    let rt = null, geo = null, mat = null
    const prevTarget = renderer.getRenderTarget()
    const prevFace = renderer.getActiveCubeFace?.() ?? 0
    const prevMip = renderer.getActiveMipmapLevel?.() ?? 0
    const prevAuto = renderer.autoClear
    try {
      rt = new THREE.WebGLRenderTarget(w, h, {
        format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        generateMipmaps: false, depthBuffer: false, stencilBuffer: false,
      })
      rt.texture.colorSpace = THREE.NoColorSpace
      rt.texture.wrapS = THREE.RepeatWrapping
      geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
      mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.frustumCulled = false
      const scene = new THREE.Scene()
      scene.add(mesh)
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
      renderer.autoClear = true
      renderer.setRenderTarget(rt)
      renderer.render(scene, cam)
      geo.dispose(); mat.dispose(); geo = null; mat = null
      const tex = rt.texture
      const made = rt
      return { tex, dispose() { made.dispose() } }
    } catch (e) {
      geo?.dispose(); mat?.dispose(); rt?.dispose()
      if (typeof console !== 'undefined') console.warn('[orbit-maps] render-target bake failed, using CPU fallback', e?.message || e)
    } finally {
      renderer.autoClear = prevAuto
      renderer.setRenderTarget(prevTarget, prevFace, prevMip)
    }
  }
  const cw = cpu ? w : 512, ch = cpu ? h : 256
  const tex = dataTexture(THREE, bakeEarthCPU(cw, ch), cw, ch)
  tex.wrapS = THREE.RepeatWrapping
  tex.needsUpdate = true
  return { tex, dispose() { tex.dispose() } }
}

/* ------------------------------------------------------------------ public: region map */
const RW = 512, RH = 512

/**
 * 512 x 512 RGBA8 of the Harvest world window (REGION.window). u = (x - x0) / 120, v = (z1 - z) / 96 (v = 1 north = -z).
 * Texels are anisotropic: 4.27 per world unit in x, 5.33 per world unit in z.
 *  R reservoir field clamp(1.25 - lakeD, 0, 1) (max over lakes): water where R > uWaterT (0.25 full, 0.33 lowered).
 *  G inside a lake (R > 0.2): 40 + 20 k (k = lake index); elsewhere 255 inside a paddy (inset 0.35), 0 on levees and bare ground.
 *  B dist / distMax (0..1): paddy distance on the whole paddy cell (levees included), canal distance along the network on canal texels.
 *  A canal mask: 255 on a 2 texel core, soft skirt out to 2.5 texels (main canal, 3 lake canals, feeders).
 */
export function bakeRegionMap(THREE) {
  const { x0, x1, z0, z1 } = REGION.window
  const sx = RW / (x1 - x0), sz = RH / (z1 - z0) // texels per world unit
  const net = buildNetwork()
  const { paddies, feederX, zBot } = buildPaddies(net.dMain)
  const distMax = Math.max(...paddies.map((q) => q.dist))
  const R = new Float32Array(RW * RH), Gc = new Uint8Array(RW * RH), Bc = new Float32Array(RW * RH), Ac = new Float32Array(RW * RH)
  const Bcanal = new Float32Array(RW * RH).fill(-1)
  // texel (i, j) -> world; row j = 0 is the south edge (v = 0)
  const wx = (i) => x0 + ((i + 0.5) / RW) * (x1 - x0)
  const wz = (j) => z1 - ((j + 0.5) / RH) * (z1 - z0)
  const tx = (x) => ((x - x0) / (x1 - x0)) * RW - 0.5
  const ty = (z) => ((z1 - z) / (z1 - z0)) * RH - 0.5

  // paddies: B on the whole cell (expanded by half the gaps so nothing is left empty), G on the inset interior
  for (const q of paddies) {
    const hx = q.w / 2 + 0.45, hz = q.d / 2 + 0.25
    const iA = Math.max(0, Math.floor(tx(q.cx - hx)) - 1), iB = Math.min(RW - 1, Math.ceil(tx(q.cx + hx)) + 1)
    const jA = Math.max(0, Math.floor(ty(q.cz + hz)) - 1), jB = Math.min(RH - 1, Math.ceil(ty(q.cz - hz)) + 1)
    for (let j = jA; j <= jB; j += 1) {
      const z = wz(j)
      for (let i = iA; i <= iB; i += 1) {
        const x = wx(i)
        const ax = Math.abs(x - q.cx), az = Math.abs(z - q.cz)
        if (ax <= hx && az <= hz) Bc[j * RW + i] = clamp(q.dist / distMax, 0, 1)
        const e = Math.min((q.w / 2 - 0.35 - ax) * sx, (q.d / 2 - 0.35 - az) * sz)
        const g = clamp(e + 0.5, 0, 1) * 255
        if (g > Gc[j * RW + i]) Gc[j * RW + i] = g
      }
    }
  }

  // reservoirs
  for (let j = 0; j < RH; j += 1) {
    const z = wz(j)
    for (let i = 0; i < RW; i += 1) {
      const x = wx(i)
      let r = 0, k = 0
      for (let l = 0; l < LAKES.length; l += 1) {
        const v = clamp(1.25 - lakeD(l, x, z), 0, 1)
        if (v > r) { r = v; k = l }
      }
      const o = j * RW + i
      R[o] = r
      if (r > 0.2) Gc[o] = 40 + 20 * k
    }
  }

  // canals: polylines in world xz with a distance value per vertex
  const lines = []
  for (const c of net.canals) lines.push(c.pts.map((p, n) => [p[0], p[2], c.d[n]]))
  {
    const m = []
    for (let x = -47; x <= 47.01; x += 1) m.push([x, MAIN_Z, net.dMain(x)])
    lines.push(m)
    for (const fx of feederX) {
      const f = []
      for (let z = MAIN_Z; z <= zBot + 0.01; z += 2) f.push([fx, z, net.dMain(fx) + (z - MAIN_Z)])
      lines.push(f)
    }
  }
  const SK = 2.5
  for (const L of lines) {
    for (let n = 1; n < L.length; n += 1) {
      const ax = tx(L[n - 1][0]), ay = ty(L[n - 1][1]), bx = tx(L[n][0]), by = ty(L[n][1])
      const da = L[n - 1][2], db = L[n][2]
      const ex = bx - ax, ey = by - ay
      const len2 = ex * ex + ey * ey || 1
      const iA = Math.max(0, Math.floor(Math.min(ax, bx) - SK - 1)), iB = Math.min(RW - 1, Math.ceil(Math.max(ax, bx) + SK + 1))
      const jA = Math.max(0, Math.floor(Math.min(ay, by) - SK - 1)), jB = Math.min(RH - 1, Math.ceil(Math.max(ay, by) + SK + 1))
      for (let ty_ = jA; ty_ <= jB; ty_ += 1) {
        for (let tx_ = iA; tx_ <= iB; tx_ += 1) {
          const t = clamp(((tx_ - ax) * ex + (ty_ - ay) * ey) / len2, 0, 1)
          const d = Math.hypot(tx_ - (ax + ex * t), ty_ - (ay + ey * t))
          if (d > SK) continue
          const cov = d <= 1 ? 1 : 1 - (d - 1) / (SK - 1)
          const o = ty_ * RW + tx_
          if (cov > Ac[o]) {
            Ac[o] = cov
            if (cov > 0.5) Bcanal[o] = clamp((da + (db - da) * t) / distMax, 0, 1)
          }
        }
      }
    }
  }

  const data = new Uint8Array(RW * RH * 4)
  for (let o = 0; o < RW * RH; o += 1) {
    data[o * 4] = Math.round(R[o] * 255)
    data[o * 4 + 1] = Gc[o]
    data[o * 4 + 2] = Math.round((Bcanal[o] >= 0 ? Bcanal[o] : Bc[o]) * 255)
    data[o * 4 + 3] = Math.round(Ac[o] * 255)
  }
  const tex = dataTexture(THREE, data, RW, RH)
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  return { tex, distMax, dispose() { tex.dispose() } }
}
