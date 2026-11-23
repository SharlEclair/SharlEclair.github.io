/**
 * Harvest "orbit" variants: the Earth, its ground track and the lens (WP3).
 *
 *   makeOrbitEarth(THREE, { tier: '25' | 'mid' | '3d', theme, renderer, disposables })
 *     -> { group, setTheme, setView, setStory, regionWorld, regionScreenRadius, solveRot, distMax, dispose }
 *
 * group is a unit-radius Earth at the origin. The scene scales and positions it (uniform scale only, no rotation).
 * The Earth's own spin lives in the shaders (setView.rot), so the group never rotates.
 *
 * setView({ rot, sunAz, lensR, trackN, trackHead, pxScale, ...extras })
 *   rot        spin in radians about the tilted axis (positive moves the near surface to the right / east).
 *              solveRot(dirWorld) returns the rot that brings the region closest to a world direction from the centre.
 *   sunAz      radians, 0..~0.14. 3d tier: terminator slides over the region (pre-dawn at 0, morning at 0.12).
 *   lensR      lens radius in unit-sphere units (lens px radius / Earth px radius).
 *   trackN     orbit plane normal in WORLD axes (group orientation, no rotation). The plane is forced through the region
 *              point every frame so the track always crosses the lens centre.
 *   trackHead  angle (radians) of the sub-satellite point measured along the track FROM THE REGION POINT in the
 *              direction of travel (negative = before the region). Alternative: trackHeadDir (Vector3, world direction
 *              from the Earth centre to the sub-satellite point), which wins when present.
 *   pxScale    device px per CSS px (line widths are CSS px). Default renderer.getPixelRatio().
 *   extras     time (seconds, drifts the clouds), trackOn (bool).
 * setStory({ lakeOn:[a,b,c], waterT, front, grow, iris, ringScale, ringRot, scanAlpha, pulse })
 *   front      world distance units (0 .. distMax + 16); or pass pour (0..1) and it is scaled by (distMax + 16).
 *   ringRot    radians (values above 6.4 are read as degrees). pulse: ripple progress 0..1 (0 and 1 draw nothing).
 * Render order: tier 25 uses renderOrder 10 (disk) and 11 (lens); the sphere tiers draw opaque (atmosphere shell 12).
 */
import { bakeEarthMaps, bakeRegionMap, REGION } from './orbit-maps.js'
import { createPhotoEarth } from './orbit-earth-photo.js'

const RAD = Math.PI / 180
const HEX = {
  bg: 'cBg', ink: 'cInk', inkMuted: 'cInkMuted', ocean: 'cOcean', oceanDeep: 'cOceanDeep', land: 'cLand', landHi: 'cLandHi',
  atmoIn: 'cAtmoIn', atmoMid: 'cAtmoMid', atmoOut: 'cAtmoOut', thread: 'cThread', water: 'cWater', waterDim: 'cWaterDim',
  flood: 'cFlood', soil: 'cSoil', levee: 'cLevee', rice: 'cRice', riceHi: 'cRiceHi', city: 'cCity', sun: 'cSun',
}

/* ------------------------------------------------------------------ GLSL */
const PRE = /* glsl */`
uniform float uDark, uPx, uRpx, uOrtho, uTime;
uniform vec3 cBg, cInk, cInkMuted, cOcean, cOceanDeep, cLand, cLandHi, cAtmoIn, cAtmoMid, cAtmoOut, cThread,
  cWater, cWaterDim, cFlood, cSoil, cLevee, cRice, cRiceHi, cCity, cSun;
uniform float uLeveeA;
uniform mat3 uToLocal;
uniform vec3 uRegionDir, uLensE, uLensN, uLakeOn, uTrackN, uTrackH, uAxisW, uAxis2W, uSun, uKey;
uniform float uLensR, uIris, uRingScale, uRingRot, uScan, uPulse, uWaterT, uFront, uGrow, uDistMax, uTrackOn;
uniform sampler2D tEarth, tRegion;
vec3 gDx, gDy;
float gradDot(vec3 a){ return length(vec2(dot(gDx, a), dot(gDy, a))) + 1e-7; }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
vec2 eqUv(vec3 nl){ return vec2(atan(nl.x, nl.z) * 0.15915494 + 0.5, asin(clamp(nl.y, -1.0, 1.0)) * 0.31830989 + 0.5); }
vec4 over(vec4 d, vec3 c, float a){
  float oa = a + d.a * (1.0 - a);
  return oa > 1e-5 ? vec4((c * a + d.rgb * d.a * (1.0 - a)) / oa, oa) : d;
}
// periodic line (centre on integers) with phase gradient gp per px; duty = filled fraction
float stripeCov(float phase, float gp, float duty){
  float t = abs(fract(phase + 0.5) - 0.5);
  float c = clamp((duty * 0.5 - t) / gp + 0.5, 0.0, 1.0);
  return mix(c, duty, smoothstep(0.28, 0.65, gp));
}
// AM halftone dot coverage in device px; c = ink fraction 0..1
float dotScreen(float c, float cellCss, float ang){
  float cell = cellCss * uPx;
  vec2 p = rot2(gl_FragCoord.xy, ang) / cell;
  vec2 f = fract(p) - 0.5;
  float d = length(f) * cell;
  c = clamp(c, 0.0, 1.0);
  float r = mix(sqrt(c * 0.3183), 0.7071, smoothstep(0.7, 1.0, c)) * cell;
  return clamp(r - d + 0.5, 0.0, 1.0) * smoothstep(0.0, 0.03, c);
}

// ---- great-circle ground track (thread), drawn behind the head only
float trackMask(vec3 n){
  vec3 T = cross(uTrackN, uTrackH);
  float s = dot(n, uTrackN);
  float line = clamp(0.75 * uPx - abs(s) / gradDot(uTrackN) + 0.5, 0.0, 1.0);
  float X = dot(n, uTrackH), Y = -dot(n, T);
  vec2 gX = vec2(dot(gDx, uTrackH), dot(gDy, uTrackH));
  vec2 gY = -vec2(dot(gDx, T), dot(gDy, T));
  float gd = length((X * gY - Y * gX) / (X * X + Y * Y + 1e-5)) + 1e-6;
  float dl = atan(Y, X);
  float cap = clamp(dl / gd + 0.5, 0.0, 1.0);
  float tail = 1.0 - smoothstep(2.8, 3.1, dl);
  return line * cap * tail * mix(1.0, 0.72, smoothstep(0.0, 1.8, dl)) * uTrackOn;
}

// ---- lens contents (region map, 4.6). Window 120 x 96 world units in a 512 square; the lens samples a true circle.
const float LENS_W = 54.0; // world units per lens radius (before the bulge)
vec2 regionUv(vec2 lq){
  vec2 q = lq * (1.0 - 0.12 * dot(lq, lq)) * LENS_W;
  return vec2(0.5 + q.x / 120.0, 0.5 + q.y / 96.0);   // v = 1 is north
}
void lensTap(vec2 uv, out vec3 col, out float padW, out float gr){
  vec4 m = textureLod(tRegion, uv, 0.0);
  float k = uv.x < 0.39 ? 0.0 : (uv.x < 0.665 ? 1.0 : 2.0);
  float on = k < 0.5 ? uLakeOn.x : (k < 1.5 ? uLakeOn.y : uLakeOn.z);
  vec3 ground = mix(cLand, cLandHi, 0.12) * 0.92;
  col = ground;
  float lakeIn = smoothstep(0.17, 0.22, m.r);
  float zone = (1.0 - smoothstep(0.40, 0.415, uv.y)) * smoothstep(0.055, 0.07, uv.y);          // field area (south of the main canal)
  float pad = smoothstep(0.55, 0.9, m.g) * (1.0 - lakeIn);
  float dist = m.b * uDistMax;
  // levees / bare ground inside the field zone
  col = mix(col, mix(ground, cLevee, uLeveeA * 0.4), zone * (1.0 - pad) * (1.0 - lakeIn));
  // paddies: soil -> flood by the front
  float since = uFront - dist;
  float flood = smoothstep(0.0, 9.0, since);
  float sd = fract(sin(m.b * 913.7 + 3.1) * 43758.5);
  vec3 soil = cSoil * (0.8 + 0.4 * sd);
  vec3 fl = cFlood * mix(0.62, 0.95, uDark < 0.5 ? 1.0 : 0.0) * (0.9 + 0.2 * sd);
  vec3 pc = mix(soil, fl, flood);
  float head = step(0.0, since) * exp(-max(since, 0.0) * 0.22) * (1.0 - flood * 0.5);
  pc = mix(pc, cWater, head * (uDark > 0.5 ? 0.35 : 0.5));
  col = mix(col, pc, pad);
  // reservoirs
  float wA = smoothstep(uWaterT - 0.012, uWaterT + 0.012, m.r);
  float bedA = smoothstep(0.238, 0.262, m.r) * (1.0 - wA);
  vec3 wcol = mix(cWaterDim, cWater, on);
  wcol *= 0.8 + 0.3 * smoothstep(uWaterT, uWaterT + 0.7, m.r);
  float shore = exp(-(m.r - uWaterT) * 30.0) * on;
  wcol = mix(wcol, cWater, shore * 0.5) + (uDark > 0.5 ? cWater * shore * 0.25 : vec3(0.0));
  col = mix(col, mix(ground, cWaterDim, 0.5) * 0.85, bedA * 0.9);
  col = mix(col, wcol, wA);
  // canals
  float ca = smoothstep(0.12, 0.5, m.a) * (1.0 - lakeIn);
  float cd = m.b * uDistMax;
  float lc = smoothstep(0.0, 5.0, uFront - cd);
  float chead = step(0.0, uFront - cd) * exp(-max(uFront - cd, 0.0) * 0.25);
  vec3 ccol = mix(mix(ground, cLevee, uLeveeA * 0.8), cWater, lc);
  ccol = mix(ccol, cWater * 1.25, chead * 0.5 * (uDark > 0.5 ? 1.0 : 0.4));
  col = mix(col, ccol, ca);
  padW = pad * (1.0 - ca * 0.8);
  gr = clamp((uGrow - m.b * 0.45 + 0.03 * (sd - 0.5)) / 0.55, 0.0, 1.0);
}
vec3 lensContents(vec2 lq, vec2 dxq, vec2 dyq){
  vec3 acc = vec3(0.0); float padSum = 0.0, grSum = 0.0;
  vec2 offs[4] = vec2[4](vec2(-0.375, -0.125), vec2(0.125, -0.375), vec2(0.375, 0.125), vec2(-0.125, 0.375));
  for (int i = 0; i < 4; i++){
    vec2 lp = lq + dxq * offs[i].x + dyq * offs[i].y;
    vec3 c; float pw, g;
    lensTap(regionUv(lp), c, pw, g);
    acc += c; padSum += pw; grSum += pw * g;
  }
  vec3 col = acc * 0.25;
  float padW = padSum * 0.25;
  float gr = grSum / max(padSum, 1e-3);
  // 1 px survey grid every 32 texels
  vec2 gg = regionUv(lq) * 16.0;
  vec2 gpx = vec2(length(vec2(dxq.x, dyq.x)) * LENS_W / 120.0, length(vec2(dxq.y, dyq.y)) * LENS_W / 96.0) * 15.0 + 1e-5;
  vec2 gd = abs(fract(gg + 0.5) - 0.5) / gpx;
  col = mix(col, cInk, 0.06 * clamp(0.5 * uPx - min(gd.x, gd.y) + 0.5, 0.0, 1.0));
  // levee outline on the paddy edges
  col = mix(col, cLevee, 4.0 * padW * (1.0 - padW) * uLeveeA * 0.6);
  // rice printed as a halftone (3 px cells) that grows to solid
  float cell = 3.0 * uPx;
  vec2 p = rot2(gl_FragCoord.xy, 0.2618) / cell;
  vec2 id = floor(p), f = fract(p) - 0.5;
  float hj = hash12(id);
  float amt = clamp(gr * 1.04 + (hj - 0.5) * 0.34 * (1.0 - abs(gr * 2.0 - 1.0)), 0.0, 1.0);
  float r = 0.76 * sqrt(amt);
  float cov = clamp((r - length(f)) * cell + 0.5, 0.0, 1.0) * smoothstep(0.015, 0.06, gr);
  float edgeW = smoothstep(0.0, 0.08, gr) * (1.0 - smoothstep(0.16, 0.42, gr));
  vec3 dcol = mix(cRice, cRiceHi, edgeW) * (0.93 + 0.14 * hj);
  col = mix(col, dcol, cov * smoothstep(0.2, 0.7, padW));
  return col;
}

// ---- the lens: contents, rim, footprint ring, ticks, dot, pulse. lq in lens radii (y = north), dxq/dyq per screen px.
vec4 lensLayer(vec2 lq, vec2 dxq, vec2 dyq){
  float rho = length(lq);
  vec2 rd = lq / max(rho, 1e-4);
  float gR = length(vec2(dot(dxq, rd), dot(dyq, rd))) + 1e-6;
  vec4 res = vec4(0.0);
  float io = uIris;
  // knock-out just outside the rim, so stripes and dots do not run into the lens
  float dk = (rho - 1.0) / gR;
  float ko = clamp(dk + 0.5, 0.0, 1.0) * clamp(3.0 * uPx + 0.5 - dk, 0.0, 1.0) * 0.9 * smoothstep(0.0, 0.2, io);
  res = over(res, cBg, ko);
  // contents inside the iris
  float ins = clamp((io - rho) / gR + 0.5, 0.0, 1.0) * step(0.002, io);
  if (ins > 0.0) res = over(res, lensContents(lq, dxq, dyq), ins);
  // closed ring (1 px, 0.5) becoming the 2 px rim
  float halfW = mix(0.5, 1.0, smoothstep(0.0, 0.6, io)) * uPx;
  float ra = clamp(halfW - abs(rho - 1.0) / gR + 0.5, 0.0, 1.0) * mix(0.5, 1.0, smoothstep(0.0, 0.5, io));
  res = over(res, cThread, ra);
  // dashed footprint / survey ring at ringScale
  if (uScan > 0.001){
    float d = abs(rho - uRingScale) / gR;
    float rc = clamp(0.5 * uPx - d + 0.5, 0.0, 1.0);
    float ang = atan(lq.y, lq.x);
    float v = sin(28.0 * (ang - uRingRot));
    vec2 gA = vec2(lq.x * dxq.y - lq.y * dxq.x, lq.x * dyq.y - lq.y * dyq.x) / max(rho * rho, 1e-4);
    float gv = 28.0 * length(gA) + 1e-5;
    float dash = clamp((v + 0.157) / gv + 0.5, 0.0, 1.0);
    res = over(res, cThread, rc * dash * uScan);
  }
  // four ticks on the compass points once the ring has turned 45 deg
  float tickA = max(uScan, smoothstep(0.2, 0.5, io));
  if (tickA > 0.001){
    float tk = 0.0;
    for (int k = 0; k < 4; k++){
      float a = uRingRot - 0.7853981 + float(k) * 1.5707963;
      vec2 dr = vec2(cos(a), sin(a)), pr = vec2(-dr.y, dr.x);
      float gAl = length(vec2(dot(dxq, dr), dot(dyq, dr))) + 1e-6;
      float gAc = length(vec2(dot(dxq, pr), dot(dyq, pr))) + 1e-6;
      float al = (dot(lq, dr) - uRingScale) / gAl;
      float ac = dot(lq, pr) / gAc;
      float m = clamp(0.75 * uPx - abs(ac) + 0.5, 0.0, 1.0) * clamp(min(al + 3.5 * uPx, 5.5 * uPx - al) + 0.5, 0.0, 1.0);
      tk = max(tk, m);
    }
    res = over(res, cThread, tk * tickA);
  }
  // pin dot while the lens is closed
  float dd = rho / gR;
  res = over(res, cThread, clamp(2.0 * uPx - dd + 0.5, 0.0, 1.0) * (1.0 - smoothstep(0.0, 0.25, io)));
  // end pulse: one ripple leaving the rim
  if (uPulse > 0.001 && uPulse < 0.999){
    float rp = 1.0 + 0.24 * uPulse;
    float pc = clamp(0.5 * uPx - abs(rho - rp) / gR + 0.5, 0.0, 1.0) * (1.0 - uPulse) * smoothstep(0.0, 0.1, uPulse) * 0.85;
    res = over(res, cThread, pc);
  }
  return res;
}

// lens coordinates of a sphere normal (screen-aligned tangent frame at the region)
void lensCoords(vec3 n, out vec2 lq, out vec2 dxq, out vec2 dyq, out float vis){
  lq = vec2(dot(n, uLensE), dot(n, uLensN)) / uLensR;
  dxq = vec2(dot(gDx, uLensE), dot(gDx, uLensN)) / uLensR;
  dyq = vec2(dot(gDy, uLensE), dot(gDy, uLensN)) / uLensR;
  vis = step(0.35, dot(n, uRegionDir));
}

// the lens bits shared by the sphere tiers
vec3 applyLens(vec3 col, vec3 n){
  vec2 lq, dxq, dyq; float vis;
  lensCoords(n, lq, dxq, dyq, vis);
  vec4 L = vec4(0.0);
  if (vis > 0.5 && length(lq) < 3.2) L = lensLayer(lq, dxq, dyq);
  return mix(col, L.rgb, L.a);
}
`

const END = /* glsl */`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`

const SPHERE_VERT = /* glsl */`
varying vec3 vNW;
varying vec3 vPW;
void main(){
  vNW = mat3(modelMatrix) * normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

const QUAD_VERT = /* glsl */`
varying vec2 vQ;
void main(){
  vQ = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

/* tier 25: the disk, pinstripes, 3 atmosphere stripes, track */
const DISK_FRAG = PRE + /* glsl */`
varying vec2 vQ;
const vec3 SP = vec3(-0.287, 0.884, -0.37);   // pinstripe pole: lines at ~18 deg, bending around the limb
void main(){
  vec2 q = vQ;
  float rho = length(q);
  vec2 rd = q / max(rho, 1e-4);
  float gR = length(vec2(dot(dFdx(q), rd), dot(dFdy(q), rd))) + 1e-6;
  vec3 n = vec3(q, sqrt(max(1.0 - rho * rho, 0.0)));
  gDx = dFdx(n); gDy = dFdy(n);
  float ins = clamp((1.0 - rho) / gR + 0.5, 0.0, 1.0);
  vec4 res = vec4(0.0);
  if (ins > 0.0){
    vec3 nl = uToLocal * n;
    vec4 em = textureLod(tEarth, eqUv(nl), 0.0);
    float land = clamp(em.r, 0.0, 1.0);
    vec3 fill = mix(cOcean, cLand, land * (uDark > 0.5 ? 0.9 : 0.75));
    float s = dot(n, SP);
    float phase = asin(clamp(s, -0.999, 0.999)) * uRpx / (7.0 * uPx);
    float gp = uRpx / (7.0 * uPx) * gradDot(SP) / sqrt(max(1.0 - s * s, 0.02));
    float duty = mix(0.17, 0.36, land) + 0.08 * land * em.g;
    float cov = stripeCov(phase, gp, duty);
    vec3 sc = mix(cInkMuted, cInk, land * 0.55);
    float sa = 0.42 * (0.5 + 0.5 * smoothstep(0.0, 0.7, n.z));
    vec3 col = mix(fill, sc, cov * sa * (uDark > 0.5 ? 1.0 : 1.9));
    col = mix(col, uDark > 0.5 ? cInkMuted : cInk, clamp(0.8 * uPx - (1.0 - rho) / gR + 0.5, 0.0, 1.0) * 0.55);
    // ground track
    col = mix(col, cThread, trackMask(n));
    res = vec4(col, ins);
  }
  // three atmosphere stripes outside the limb, thinning toward the right edge
  float ang = atan(q.x, q.y);
  float fade = 1.0 - 0.9 * smoothstep(-0.5, 0.55, ang);
  fade *= smoothstep(-2.5, -1.85, ang);
  vec3 ac[3] = vec3[3](cAtmoIn, cAtmoMid, cAtmoOut);
  for (int i = 0; i < 3; i++){
    float ri = 1.012 + 0.014 * float(i);
    float thick = 0.006 * uRpx * (0.4 + 0.6 * fade);
    float d = abs(rho - (ri + 0.003)) / gR;
    float a = clamp(0.5 * thick - d + 0.5, 0.0, 1.0) * fade * 0.95;
    res = over(res, ac[i], a);
  }
  if (res.a <= 0.0) discard;
  gl_FragColor = res;
` + END + `}`

/* tier 25: the flat circular lens quad */
const LENS_FRAG = PRE + /* glsl */`
varying vec2 vQ;
void main(){
  gDx = vec3(0.0); gDy = vec3(0.0);
  vec2 dxq = dFdx(vQ), dyq = dFdy(vQ);
  vec4 L = lensLayer(vQ, dxq, dyq);
  if (L.a <= 0.001) discard;
  gl_FragColor = L;
` + END + `}`

/* tier mid: real sphere, screen-space halftone */
const MID_FRAG = PRE + /* glsl */`
varying vec3 vNW;
varying vec3 vPW;
void main(){
  vec3 n = normalize(vNW);
  gDx = dFdx(n); gDy = dFdy(n);
  vec3 V = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(cameraPosition - vPW);
  float ndv = max(dot(n, V), 0.0);
  float gN = length(vec2(dFdx(ndv), dFdy(ndv))) + 1e-6;
  float limbPx = ndv / (2.0 * gN);
  vec3 nl = uToLocal * n;
  vec4 em = textureLod(tEarth, eqUv(nl), 0.0);
  float land = clamp(em.r, 0.0, 1.0), rel = em.g;
  float L = dot(n, uKey) * 0.5 + 0.5;
  vec3 ground; vec3 dcol; float c;
  if (uDark > 0.5){
    ground = mix(cOcean, cLand, land * 0.55);
    c = smoothstep(0.30, 0.95, L) * mix(0.17, 0.34 + 0.2 * rel, land);
    dcol = mix(cInkMuted, cInk, land * (0.1 + 0.4 * rel));
    dcol = mix(dcol, cAtmoMid * 0.75, (1.0 - land) * smoothstep(0.5, 0.95, L) * 0.6);
  } else {
    ground = mix(cBg, cLand, land * 0.5);
    c = 0.04 + 0.62 * (1.0 - smoothstep(0.12, 0.92, L)) + land * (0.2 + 0.2 * rel) * (0.5 + 0.5 * (1.0 - L * 0.6));
    dcol = cInk;
  }
  vec3 col = mix(ground, dcol, dotScreen(c, 5.0, 0.2618) * (uDark > 0.5 ? 0.8 : 0.92));
  // limb: halftone rim band + one inked line
  float lp = limbPx / uPx;
  float rimC = (1.0 - smoothstep(1.5, 9.0, lp)) * (0.35 + 0.65 * (uDark > 0.5 ? smoothstep(0.2, 0.9, L) : 1.0));
  col = mix(col, cAtmoIn, dotScreen(rimC * 0.6, 2.6, 0.5236) * 0.8 * smoothstep(0.8, 1.6, lp));
  col = mix(col, cAtmoIn, clamp(0.9 * uPx - limbPx + 0.5, 0.0, 1.0));
  col = mix(col, cThread, trackMask(n));
  col = applyLens(col, n);
  gl_FragColor = vec4(col, 1.0);
` + END + `}`

/* tier 3d: the night pass / engraving */
const EARTH3D_FRAG = PRE + /* glsl */`
varying vec3 vNW;
varying vec3 vPW;
float hatchCov(float phase, float gp, float duty){ return stripeCov(phase, gp, clamp(duty, 0.0, 0.92)); }
void main(){
  vec3 n = normalize(vNW);
  gDx = dFdx(n); gDy = dFdy(n);
  vec3 V = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(cameraPosition - vPW);
  float ndv = max(dot(n, V), 0.0);
  float gN = length(vec2(dFdx(ndv), dFdy(ndv))) + 1e-6;
  float limbPx = ndv / (2.0 * gN);
  vec3 nl = uToLocal * n;
  vec2 uv = eqUv(nl);
  vec4 em = textureLod(tEarth, uv, 0.0);
  float land = clamp(em.r, 0.0, 1.0);
  float nL = dot(n, uSun);
  float day = smoothstep(-0.08, 0.18, nL);
  vec3 col;
  float cloud = 0.0;
  if (uDark > 0.5){
    // relief shading (fake bump): two extra taps of G, light direction taken in local east / north
    vec3 east = normalize(vec3(nl.z, 0.0, -nl.x) + vec3(1e-4, 0.0, 0.0));
    vec3 north = cross(nl, east);
    vec3 ll = uToLocal * uSun;
    float gx = textureLod(tEarth, uv + vec2(0.0016, 0.0), 0.0).g - em.g;
    float gy = textureLod(tEarth, uv + vec2(0.0, 0.0032), 0.0).g - em.g;
    float shade = clamp(1.0 - 70.0 * (gx * dot(ll, east) + gy * dot(ll, north)), 0.55, 1.6);
    vec3 oc = mix(cOcean, cOceanDeep, smoothstep(0.4, 0.0, ndv));
    vec3 ld = mix(cLand, cLandHi, em.g * 0.9) * mix(1.0, shade, land);
    vec3 base = mix(oc, ld, land);
    // clouds + their shadow
    cloud = smoothstep(0.30, 0.85, textureLod(tEarth, uv + vec2(uTime * 0.002, 0.0), 0.0).b);
    float cs = smoothstep(0.30, 0.85, textureLod(tEarth, uv - vec2(dot(ll, east), dot(ll, north)) * 0.004, 0.0).b);
    base *= 1.0 - 0.25 * cs * land;
    vec3 dayCol = base * (0.5 + 3.4 * max(nL, 0.0));
    vec3 nightCol = base * 0.45;
    col = mix(nightCol, dayCol, day);
    // twilight band
    col += vec3(0.035, 0.02, 0.045) * exp(-pow(nL / 0.10, 2.0)) * (0.5 + 0.5 * land);
    // ocean glint
    vec3 H = normalize(uSun + V);
    col += cSun * pow(max(dot(n, H), 0.0), 60.0) * 0.35 * day * (1.0 - land) * (1.0 - cloud * 0.8);
    // cloud deck
    vec3 cc = vec3(0.22, 0.25, 0.32) * (0.25 + 1.4 * max(nL, 0.0));
    col = mix(col, cc, cloud * mix(0.07, 0.26, day));
    // city lights on the night side
    col += cCity * em.a * (1.0 - day) * 1.5 * (1.0 - cloud * 0.7);
    // inner atmosphere
    float fres = pow(1.0 - ndv, 4.0);
    col += mix(cAtmoIn, cAtmoMid, 0.35) * fres * 0.7 * (0.3 + 0.7 * smoothstep(-0.3, 0.4, nL));
  } else {
    // engraving: hatch along latitude, a second hatch at 60 deg on land, paper for ocean
    float tone = 0.06 + (1.0 - day) * 0.5 + land * (0.2 + 0.12 * em.g) + 0.4 * pow(1.0 - ndv, 3.0);
    float k = uRpx / (5.0 * uPx);
    float y1 = dot(n, uAxisW);
    float ph1 = asin(clamp(y1, -0.999, 0.999)) * k;
    float g1 = k * gradDot(uAxisW) / sqrt(max(1.0 - y1 * y1, 0.02));
    float y2 = dot(n, uAxis2W);
    float ph2 = asin(clamp(y2, -0.999, 0.999)) * k;
    float g2 = k * gradDot(uAxis2W) / sqrt(max(1.0 - y2 * y2, 0.02));
    float h1 = hatchCov(ph1, g1, min(tone, 1.0) * 0.62);
    float h2 = hatchCov(ph2, g2, land * (0.08 + 0.4 * (1.0 - day)) * 0.9);
    vec3 paper = mix(cBg, cLand, land * 0.45);
    col = mix(paper, cInk, max(h1, h2) * 0.78);
  }
  // limb rim: red line (light) / thin bright inner edge (dark)
  if (uDark < 0.5) col = mix(col, cAtmoIn, clamp(1.2 * uPx - limbPx + 0.5, 0.0, 1.0));
  col = mix(col, cThread, trackMask(n));
  col = applyLens(col, n);
  gl_FragColor = vec4(col, 1.0);
` + END + `}`

const SHELL_VERT = /* glsl */`
varying vec3 vNW;
varying vec3 vPW;
void main(){
  vNW = mat3(modelMatrix) * normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`
const SHELL_FRAG = /* glsl */`
uniform float uOrtho;
uniform vec3 cAtmoIn, cAtmoMid, cAtmoOut, uSun;
uniform float uShell;
varying vec3 vNW;
varying vec3 vPW;
void main(){
  vec3 n = normalize(vNW);
  vec3 V = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(cameraPosition - vPW);
  float nd = abs(dot(n, V));
  float rho = uShell * sqrt(max(1.0 - nd * nd, 0.0));
  float h = clamp((rho - 1.0) / (uShell - 1.0), 0.0, 1.0);
  if (rho < 0.999) discard;
  float I = pow(1.0 - h, 2.4);
  vec3 c = mix(mix(cAtmoIn, cAtmoMid, smoothstep(0.0, 0.5, h)), cAtmoOut, smoothstep(0.4, 1.0, h));
  float lit = 0.35 + 0.65 * smoothstep(-0.3, 0.4, dot(normalize(vec3(n.xy, 0.0) + n * 0.3), uSun));
  gl_FragColor = vec4(c * I * lit * 0.9, 1.0);
` + END + `}`

/* ------------------------------------------------------------------ factory */
export function makeOrbitEarth(THREE, { tier = '25', theme, renderer, disposables } = {}) {
  const T = tier === '3d' ? '3d' : tier === 'mid' ? 'mid' : '25'
  const owned = []
  const own = (o) => {
    owned.push(o)
    if (Array.isArray(disposables)) disposables.push(o)
    else if (disposables && typeof disposables.add === 'function') disposables.add(o)
    return o
  }

  const earthMaps = own(bakeEarthMaps(THREE, renderer, { w: 1024, h: 512 }))
  const region = own(bakeRegionMap(THREE))
  const distMax = region.distMax
  earthMaps.tex.wrapS = THREE.RepeatWrapping
  region.tex.wrapS = region.tex.wrapT = THREE.ClampToEdgeWrapping

  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
  const U = {
    uDark: { value: 1 }, uPx: { value: 1 }, uRpx: { value: 600 }, uOrtho: { value: T === '3d' ? 0 : 1 }, uTime: { value: 0 },
    uLeveeA: { value: 0.35 },
    uToLocal: { value: new THREE.Matrix3() },
    uRegionDir: { value: V3(0, 0, 1) }, uLensE: { value: V3(1, 0, 0) }, uLensN: { value: V3(0, 1, 0) },
    uLakeOn: { value: V3() }, uTrackN: { value: V3(0, 1, 0) }, uTrackH: { value: V3(1, 0, 0) },
    uAxisW: { value: V3(0, 1, 0) }, uAxis2W: { value: V3(1, 0, 0) },
    uSun: { value: V3(1, 0, 0) }, uKey: { value: V3(-0.5, 0.7, 0.5).normalize() },
    uLensR: { value: 0.125 }, uIris: { value: 0 }, uRingScale: { value: 1 }, uRingRot: { value: 0 }, uScan: { value: 0 },
    uPulse: { value: 0 }, uWaterT: { value: 0.25 }, uFront: { value: 0 }, uGrow: { value: 0 }, uDistMax: { value: distMax },
    uTrackOn: { value: 0 }, uShell: { value: 1.022 },
    tEarth: { value: earthMaps.tex }, tRegion: { value: region.tex },
  }
  for (const k of Object.values(HEX)) U[k] = { value: new THREE.Color() }

  const group = new THREE.Group()
  group.name = 'orbit-earth'
  let pxScaleSet = false

  const refreshPx = (r, scene, camera) => {
    if (!pxScaleSet) U.uPx.value = r.getPixelRatio()
    const t = r.getRenderTarget()
    let W, H
    if (t) { W = t.width; H = t.height } else { const s = r.getDrawingBufferSize(tmpV2); W = s.x; H = s.y }
    group.updateWorldMatrix(true, false)
    const R = group.matrixWorld.getMaxScaleOnAxis()
    const e = camera.matrixWorld.elements
    tmpA.setFromMatrixPosition(group.matrixWorld)
    tmpB.copy(tmpA).addScaledVector(tmpC.set(e[0], e[1], e[2]), R)
    tmpA.project(camera); tmpB.project(camera)
    U.uRpx.value = Math.max(8, Math.hypot((tmpB.x - tmpA.x) * W * 0.5, (tmpB.y - tmpA.y) * H * 0.5))
  }
  const tmpV2 = new THREE.Vector2(), tmpA = V3(), tmpB = V3(), tmpC = V3()

  const mk = (vs, fs, extra = {}) => new THREE.ShaderMaterial({ uniforms: U, vertexShader: vs, fragmentShader: fs, ...extra })
  let diskMesh = null, lensMesh = null, sphereMesh = null, shellMesh = null, photo = null
  const LENS_HALF = 2.6

  if (T === '25') {
    const g = own(new THREE.PlaneGeometry(2 * 1.08, 2 * 1.08))
    const m = own(mk(QUAD_VERT, DISK_FRAG, { transparent: true, depthWrite: false, depthTest: false }))
    diskMesh = new THREE.Mesh(g, m)
    diskMesh.renderOrder = 10
    diskMesh.frustumCulled = false
    diskMesh.onBeforeRender = refreshPx
    group.add(diskMesh)
    const lg = own(new THREE.PlaneGeometry(2 * LENS_HALF, 2 * LENS_HALF))
    const lm = own(mk(QUAD_VERT, LENS_FRAG, { transparent: true, depthWrite: false, depthTest: false }))
    lensMesh = new THREE.Mesh(lg, lm)
    lensMesh.renderOrder = 11
    lensMesh.frustumCulled = false
    group.add(lensMesh)
  } else {
    const seg = T === '3d' ? [128, 96] : [96, 64]
    const g = own(new THREE.SphereGeometry(1, seg[0], seg[1]))
    const m = own(mk(SPHERE_VERT, T === '3d' ? EARTH3D_FRAG : MID_FRAG))
    sphereMesh = new THREE.Mesh(g, m)
    sphereMesh.frustumCulled = false
    sphereMesh.onBeforeRender = refreshPx
    group.add(sphereMesh)
    if (T === '3d') {
      const sg = own(new THREE.SphereGeometry(U.uShell.value, 96, 64))
      const sm = own(mk(SHELL_VERT, SHELL_FRAG, {
        side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }))
      shellMesh = new THREE.Mesh(sg, sm)
      shellMesh.renderOrder = 12
      shellMesh.frustumCulled = false
      group.add(shellMesh)
      photo = createPhotoEarth(THREE, {
        renderer, U, PRE, END, VERT: SPHERE_VERT, group, sphereGeo: g, sphereMesh, shellMesh, own,
        cloudGeo: own(new THREE.SphereGeometry(1.006, 128, 96)),
      })
    }
  }

  /* ---- orientation: world = spin(rot about A) * tilt; A = the tilted pole (23 deg right, 10 deg toward the viewer) */
  const qTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(10 * RAD, 0, -23 * RAD, 'XYZ'))
  const axisA = V3(0, 1, 0).applyQuaternion(qTilt)
  const lat = REGION.lat * RAD, lon = REGION.lon * RAD
  const rLocal = V3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon))
  const axis2Local = V3(Math.sin(60 * RAD), Math.cos(60 * RAD), 0)
  const qWorld = new THREE.Quaternion(), qSpin = new THREE.Quaternion(), qInv = new THREE.Quaternion()
  const m4 = new THREE.Matrix4()
  const rDir = V3(), tmp = V3(), tmp2 = V3(), tmp3 = V3()
  let curLensR = 0.125
  U.uAxisW.value.copy(axisA)

  const setTheme = (th) => {
    U.uDark.value = th.additive ? 1 : 0
    for (const [key, uni] of Object.entries(HEX)) {
      const v = th[key]
      if (typeof v === 'string' && v[0] === '#') U[uni].value.set(v)
      else if (key === 'city') U[uni].value.setRGB(0, 0, 0)
    }
    U.uLeveeA.value = th.leveeA ?? (th.additive ? 0.35 : 0.55)
    if (shellMesh) shellMesh.visible = !!th.additive
    photo?.update(U.uDark.value > 0.5)
  }

  const setView = (v = {}) => {
    const { rot = 0, sunAz = 0, lensR = 0.125, trackN, trackHead = 0, trackHeadDir, pxScale, time = 0 } = v
    if (pxScale > 0) { U.uPx.value = pxScale; pxScaleSet = true }
    U.uTime.value = time
    photo?.update(U.uDark.value > 0.5)
    qSpin.setFromAxisAngle(axisA, rot)
    qWorld.copy(qSpin).multiply(qTilt)
    qInv.copy(qWorld).invert()
    m4.makeRotationFromQuaternion(qInv)
    U.uToLocal.value.setFromMatrix4(m4)
    U.uAxis2W.value.copy(axis2Local).applyQuaternion(qWorld)
    rDir.copy(rLocal).applyQuaternion(qWorld).normalize()
    U.uRegionDir.value.copy(rDir)
    // screen-aligned tangent frame at the region
    tmp.set(1, 0, 0).addScaledVector(rDir, -rDir.x).normalize()
    U.uLensE.value.copy(tmp)
    U.uLensN.value.copy(tmp2.crossVectors(rDir, tmp).normalize())
    curLensR = lensR
    U.uLensR.value = lensR
    // sun: dawn terminator slides across the region
    const dotR = Math.min(0.9, -0.09 + 1.9 * sunAz)
    tmp.set(0.85, -0.3, 0.45)
    tmp.addScaledVector(rDir, -tmp.dot(rDir)).normalize()
    U.uSun.value.copy(rDir).multiplyScalar(dotR).addScaledVector(tmp, Math.sqrt(1 - dotR * dotR)).normalize()
    // ground track: plane forced through the region point, head along the travel direction
    if (trackN) {
      tmp.copy(trackN).addScaledVector(rDir, -trackN.dot(rDir))
      if (tmp.lengthSq() > 1e-8) {
        tmp.normalize()
        U.uTrackN.value.copy(tmp)
        if (trackHeadDir) {
          tmp2.copy(trackHeadDir).addScaledVector(tmp, -trackHeadDir.dot(tmp)).normalize()
        } else {
          tmp3.crossVectors(tmp, rDir)                 // direction of travel at the region
          tmp2.copy(rDir).multiplyScalar(Math.cos(trackHead)).addScaledVector(tmp3, Math.sin(trackHead))
        }
        U.uTrackH.value.copy(tmp2)
        U.uTrackOn.value = v.trackOn === false ? 0 : 1
      }
    } else U.uTrackOn.value = 0
    if (lensMesh) {
      lensMesh.position.set(rDir.x, rDir.y, 0.01)
      lensMesh.scale.set(lensR, lensR, 1)
      lensMesh.visible = rDir.z > 0.02
    }
  }

  const setStory = (s = {}) => {
    if (s.lakeOn) U.uLakeOn.value.set(s.lakeOn[0] ?? 0, s.lakeOn[1] ?? 0, s.lakeOn[2] ?? 0)
    if (s.waterT != null) U.uWaterT.value = s.waterT
    if (s.pour != null) U.uFront.value = s.pour * (distMax + 16)
    else if (s.front != null) U.uFront.value = s.front
    if (s.grow != null) U.uGrow.value = s.grow
    if (s.iris != null) U.uIris.value = Math.max(0, Math.min(1, s.iris))
    if (s.ringScale != null) U.uRingScale.value = s.ringScale
    if (s.ringRot != null) U.uRingRot.value = Math.abs(s.ringRot) > 6.4 ? s.ringRot * RAD : s.ringRot
    if (s.scanAlpha != null) U.uScan.value = s.scanAlpha
    if (s.pulse != null) U.uPulse.value = s.pulse
  }

  const regionWorld = (out) => {
    group.updateWorldMatrix(true, false)
    return out.copy(rDir).applyMatrix4(group.matrixWorld)
  }

  const regionScreenRadius = (camera, size) => {
    const w = size?.w ?? size?.width ?? size?.x ?? 1
    const h = size?.h ?? size?.height ?? size?.y ?? 1
    group.updateWorldMatrix(true, false)
    camera.updateMatrixWorld()
    const R = group.matrixWorld.getMaxScaleOnAxis()
    regionWorld(tmp)
    const e = camera.matrixWorld.elements
    tmp2.copy(tmp).addScaledVector(tmp3.set(e[0], e[1], e[2]), curLensR * R)
    tmp.project(camera); tmp2.project(camera)
    return Math.hypot((tmp2.x - tmp.x) * w * 0.5, (tmp2.y - tmp.y) * h * 0.5)
  }

  /** Spin that brings the region closest to a world direction from the Earth centre (any length). */
  const solveRot = (dir) => {
    const r0 = rLocal.clone().applyQuaternion(qTilt)
    const a = r0.clone().addScaledVector(axisA, -r0.dot(axisA))
    const d = dir.clone().normalize()
    const b = d.addScaledVector(axisA, -d.dot(axisA))
    return Math.atan2(axisA.dot(new THREE.Vector3().crossVectors(a, b)), a.dot(b))
  }

  setTheme(theme)
  setView({})

  const dispose = () => {
    photo?.dispose()
    group.removeFromParent()
    for (const o of owned) { try { o.dispose?.() } catch (e) { /* already gone */ } }
    owned.length = 0
  }

  return { group, setTheme, setView, setStory, regionWorld, regionScreenRadius, solveRot, dispose, distMax }
}
