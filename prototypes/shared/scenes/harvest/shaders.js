/**
 * GLSL for the Harvest scene. All materials share one `uniforms` bag (time, fog, theme colours, flow/grow drivers) built
 * in scene.js. uLight switches the compositing: dark = glowing additive highlights, light = printed-map ink mixes.
 */

export const COMMON = /* glsl */`
uniform float uTime;
uniform float uLight;
uniform vec3 uFogColor;
uniform float uFogDensity;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 fogMix(vec3 c, float dist){ float f = 1.0 - exp(-pow(dist * uFogDensity, 1.6)); return mix(c, uFogColor, clamp(f, 0.0, 1.0)); }
// highlight: additive glow on dark, ink / paint mix on light
vec3 hilite(vec3 col, vec3 c, float a){ return uLight > 0.5 ? mix(col, c, clamp(a, 0.0, 1.0)) : col + c * a; }
`

const TAIL = /* glsl */`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`

/* ------------------------------------------------------------------ terrain */
export const TERRAIN_VERT = /* glsl */`
uniform sampler2D uHeight;
uniform vec4 uBox;
varying vec3 vWorld;
void main(){
  vec3 p = position;
  vec2 uv = (p.xz - uBox.xy) / uBox.zw;
  p.y = texture2D(uHeight, uv).r;
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`

export const TERRAIN_FRAG = COMMON + /* glsl */`
uniform sampler2D uHeight;
uniform vec4 uBox;
uniform vec2 uTexel;
uniform vec3 cLow, cMid, cHigh, cLine, cIdx, cScan, cDot;
uniform vec2 uShade, uLineAmt, uIdxAmt;
uniform float uSwX, uSwZ0, uSwZ1, uScanOn;
uniform float uLineW, uLcd, uPx, uContour;
varying vec3 vWorld;

float tex(vec2 uv){ return texture2D(uHeight, uv).r; }

void main(){
  vec2 uv = (vWorld.xz - uBox.xy) / uBox.zw;
  float h = tex(uv);
  float hx1 = tex(uv + vec2(uTexel.x, 0.0)), hx0 = tex(uv - vec2(uTexel.x, 0.0));
  float hz1 = tex(uv + vec2(0.0, uTexel.y)), hz0 = tex(uv - vec2(0.0, uTexel.y));
  float tw = uBox.z * uTexel.x * 2.0;
  vec3 n = normalize(vec3(hx0 - hx1, tw, hz0 - hz1));
  vec3 L = normalize(vec3(-0.62, 0.42, 0.45));
  float lit = clamp(dot(n, L), 0.0, 1.0);

  vec3 col = mix(cLow, cMid, smoothstep(0.1, 4.0, h));
  col = mix(col, cHigh, smoothstep(4.5, 11.0, h));
  col *= uShade.x + uShade.y * lit;

  // contour hairlines + bolder index lines
  float st = 0.62 * uContour;
  float c = h / st;
  float fw = max(fwidth(c), 1e-4);
  float f1 = abs(fract(c - 0.5) - 0.5);
  float line = (1.0 - smoothstep(0.0, fw * uLineW, f1)) * smoothstep(0.004, 0.03, fw);
  float c5 = c / 5.0;
  float f5 = abs(fract(c5 - 0.5) - 0.5);
  float idx = (1.0 - smoothstep(0.0, max(fwidth(c5), 1e-4) * uLineW * 1.3, f5)) * smoothstep(0.0008, 0.006, fwidth(c5));
  col = mix(col, cLine, line * (uLineAmt.x + uLineAmt.y * lit));
  col = mix(col, cIdx, idx * (uIdxAmt.x + uIdxAmt.y * lit) * (1.0 - 0.6 * uLcd));

  // halftone dots: ember highlights on lit ridges (dark), hachure shading on the shadow side (light)
  if (uLcd < 0.5) {
    vec2 sp = gl_FragCoord.xy / (uPx * 5.0);
    sp = mat2(0.7071, -0.7071, 0.7071, 0.7071) * sp;
    float dd = length(fract(sp) - 0.5);
    if (uLight > 0.5) {
      float hl = smoothstep(0.5, 0.12, lit) * smoothstep(1.2, 5.0, h);
      float dots = 1.0 - smoothstep(sqrt(hl) * 0.46 - 0.08, sqrt(hl) * 0.46, dd);
      col = mix(col, cDot, dots * hl * 0.5);
    } else {
      float hl = smoothstep(0.6, 0.98, lit) * smoothstep(2.5, 8.0, h);
      float dots = 1.0 - smoothstep(sqrt(hl) * 0.46 - 0.08, sqrt(hl) * 0.46, dd);
      col += cDot * dots * hl * 0.4;
    }
  }

  // push-broom scan: bright line, fading wake with a pixel grid, only inside the swath
  float inSw = smoothstep(uSwZ0 - 1.5, uSwZ0 + 1.5, vWorld.z) * (1.0 - smoothstep(uSwZ1 - 1.5, uSwZ1 + 1.5, vWorld.z));
  float dx = uSwX - vWorld.x;
  float front = exp(-dx * dx / (0.14 + 0.22 * uLcd));
  float dxp = max(dx, 0.0);
  float wake = step(0.0, dx) * exp(-dxp * 0.22) * (1.0 - exp(-dxp * 4.0));
  vec2 gp = vWorld.xz / 1.7;
  vec2 gf = abs(fract(gp - 0.5) - 0.5);
  float gl = 1.0 - smoothstep(0.0, max(fwidth(gp.x), fwidth(gp.y)) * (1.2 + uLcd), min(gf.x, gf.y));
  float rnd = hash12(floor(gp));
  float scan = (front * 1.7 + wake * (0.07 * rnd + 0.4 * gl)) * inSw * uScanOn;
  col = hilite(col, cScan, scan * (1.0 + uLcd * 0.7) * (uLight > 0.5 ? 0.85 : 1.0));

  float dist = length(vWorld - cameraPosition);
  col = fogMix(col, dist);
  // the map sheet ends softly into the background
  vec2 eg = min(uv, 1.0 - uv) * uBox.zw;
  col = mix(uFogColor, col, smoothstep(0.0, 40.0, min(eg.x, eg.y)));
  gl_FragColor = vec4(col, 1.0);
` + TAIL + `}`

/* ------------------------------------------------------------------ water (one plane per reservoir) */
export const WATER_VERT = /* glsl */`
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

export const WATER_FRAG = COMMON + /* glsl */`
uniform sampler2D uHeight;
uniform vec4 uBox;
uniform float uLevel, uLake, uHover, uDetX, uBand, uCell, uLineW, uLcd, uLevelRef;
uniform vec3 cShallow, cDeep, cWater, cEdge, cScan, cDull;
varying vec3 vWorld;

void main(){
  vec2 uv = (vWorld.xz - uBox.xy) / uBox.zw;
  vec4 T = texture2D(uHeight, uv);
  float d = uLake < 0.5 ? T.g : (uLake < 1.5 ? T.b : T.a);
  float depth = uLevel - T.r;
  if (depth <= 0.0 || d > 1.7) discard;

  // detection: the swath converts the lake to a mosaic of "water pixels" that then settles
  float dt = clamp((uDetX - vWorld.x) / uBand, 0.0, 1.0);
  vec2 cid = floor(vWorld.xz / uCell);
  float rnd = hash12(cid);
  float det = dt >= 1.0 ? 1.0 : smoothstep(rnd * 0.8, rnd * 0.8 + 0.2, dt);
  vec2 cf = abs(fract(vWorld.xz / uCell) - 0.5);
  float cellEdge = smoothstep(0.38, 0.5, max(cf.x, cf.y));
  float mosaic = (dt > 0.0 && dt < 1.0) ? 1.0 : 0.0;

  float dp = clamp(depth / 2.3, 0.0, 1.0);
  vec3 wcol = mix(cShallow, cDeep, pow(dp, 0.65));
  vec3 dull = cDull * (0.85 + 0.3 * dp);
  vec3 col = mix(dull, wcol * (1.0 + 0.25 * uLcd), det);

  // flash as each cell flips to "water"
  float flash = det * (1.0 - det) * 4.0 * mosaic;
  col = hilite(col, cScan, flash * (uLight > 0.5 ? 0.55 : 0.3));
  col = hilite(col, cScan, mosaic * cellEdge * det * (uLight > 0.5 ? 0.35 : 0.3));

  // depth contours inside the lake (move as the level moves)
  float cc = depth / 0.42;
  float fw = max(fwidth(cc), 1e-4);
  float dl = (1.0 - smoothstep(0.0, fw * uLineW, abs(fract(cc - 0.5) - 0.5))) * smoothstep(0.004, 0.03, fw);
  col = mix(col, uLight > 0.5 ? vec3(1.0) : cShallow * 1.2, dl * (uLight > 0.5 ? 0.38 : 0.3) * det);

  // soft surface sheen
  float sheen = sin(vWorld.x * 0.8 + vWorld.z * 0.35 + uTime * 0.5) * sin(vWorld.z * 1.3 - uTime * 0.35 + vWorld.x * 0.2);
  col += cWater * (0.04 + 0.06 * sheen) * det * (1.0 - uLcd) * (uLight > 0.5 ? 0.4 : 1.0);

  // outlined shoreline: the detected water edge
  float edgeW = 0.075 + uHover * 0.08 + 0.05 * uLcd;
  float edge = 1.0 - smoothstep(0.0, edgeW, depth);
  col = hilite(col, cEdge, edge * (0.75 + uHover) * (0.25 + 0.75 * det));
  col *= 1.0 + uHover * (uLight > 0.5 ? 0.12 : 0.55) * det;

  float alpha = smoothstep(0.0, 0.05, depth);
  col = fogMix(col, length(vWorld - cameraPosition));
  gl_FragColor = vec4(col, alpha);
` + TAIL + `}`

/* ------------------------------------------------------------------ sky dome */
export const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`
export const SKY_FRAG = /* glsl */`
uniform vec3 cTop, cHorizon, cGlow;
uniform float uStars, uTime;
varying vec3 vDir;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 dir = normalize(vDir);
  float y = dir.y;
  vec3 col = mix(cHorizon, cTop, smoothstep(0.0, 0.55, y));
  col += cGlow * exp(-abs(y - 0.02) * 9.0) * (0.35 + 0.65 * smoothstep(0.3, -0.9, dir.z));
  // stippled stars
  vec2 st = vec2(atan(dir.x, dir.z) * 70.0, y * 70.0);
  vec2 id = floor(st);
  float r = hash12(id);
  vec2 f = fract(st) - 0.5;
  float star = step(0.978, r) * (1.0 - smoothstep(0.08, 0.3, length(f)));
  float tw = 0.65 + 0.35 * sin(uTime * 1.3 + r * 60.0);
  col += vec3(1.0, 0.93, 0.85) * star * tw * smoothstep(0.1, 0.5, y) * uStars;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/* ------------------------------------------------------------------ particles */
export const PART_VERT = /* glsl */`
attribute vec3 aSeed;
uniform float uTime, uSize, uPx;
uniform vec3 uBoxMin, uBoxSize;
varying float vA;
varying float vMix;
void main(){
  vec3 p = position;
  p.y += uTime * (0.35 + aSeed.x * 0.6);
  p.x += sin(uTime * 0.25 + aSeed.y * 6.28) * 1.2;
  p.z += cos(uTime * 0.2 + aSeed.z * 6.28) * 1.2;
  p = uBoxMin + mod(p - uBoxMin, uBoxSize);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * uPx * (0.5 + aSeed.z) * (70.0 / max(dist, 1.0)), 1.0, 14.0 * uPx);
  vA = smoothstep(2.0, 9.0, dist) * (1.0 - smoothstep(60.0, 130.0, dist)) * (0.4 + 0.6 * aSeed.y);
  vMix = aSeed.x;
}`
export const PART_FRAG = /* glsl */`
uniform vec3 cA, cB;
uniform float uOpacity;
varying float vA;
varying float vMix;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.12, 0.5, d)) * vA * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(cA, cB, step(0.55, vMix)), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/* ------------------------------------------------------------------ flow ribbons (canals + feeders) */
export const FLOW_VERT = /* glsl */`
attribute float aD;
varying float vD;
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  vD = aD;
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`
export const FLOW_FRAG = COMMON + /* glsl */`
uniform float uFront, uFlowOn, uLcd;
uniform vec3 cWater, cShallow, cHead, cCore;
varying float vD;
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  float h = uFront - vD;
  if (h < 0.0) discard;
  float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
  float core = pow(max(across, 0.0), 0.6);
  float dash = 0.55 + 0.45 * sin(vD * 0.9 - uTime * 3.0 * uFlowOn);
  float head = exp(-h * 0.22) * 1.6;
  vec3 col = mix(cWater, cShallow, core) * (uLight > 0.5 ? (0.8 + 0.35 * dash) : (0.5 + 0.8 * dash)) * (1.0 + uLcd * 0.8);
  col = hilite(col, cHead, head * core * (uLight > 0.5 ? 0.5 : 1.0));
  col = mix(col, cCore, smoothstep(0.65, 1.0, core) * (uLight > 0.5 ? 0.5 : 0.25));
  float a = core * (0.55 + 0.45 * dash) * smoothstep(0.0, 1.5, h);
  col = fogMix(col, length(vWorld - cameraPosition));
  gl_FragColor = vec4(col, clamp(a * (uLight > 0.5 ? 1.35 : 1.0) + head * 0.3, 0.0, 1.0));
` + TAIL + `}`

/* ------------------------------------------------------------------ paddies */
export const PADDY_VERT = /* glsl */`
attribute float aDist;
attribute float aSeed;
varying vec3 vWorld;
varying vec2 vUv;
varying vec2 vScale;
varying float vDist;
varying float vSeed;
varying float vNy;
void main(){
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vUv = position.xz + 0.5;
  vScale = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz));
  vDist = aDist; vSeed = aSeed; vNy = normal.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`
export const PADDY_FRAG = COMMON + /* glsl */`
uniform float uFront, uGrow, uDistMax, uLcd, uLineW, uPadGreen;
uniform vec2 uFlood;
uniform vec3 cSoil, cWater, cShallow, cRice, cHead, cLevee;
varying vec3 vWorld;
varying vec2 vUv;
varying vec2 vScale;
varying float vDist;
varying float vSeed;
varying float vNy;
void main(){
  float since = uFront - vDist;
  float flood = smoothstep(0.0, 9.0, since);
  float arrive = exp(-max(since, 0.0) * 0.22) * step(0.0, since);
  float gr = clamp((uGrow - (vDist / uDistMax) * 0.45) / 0.55, 0.0, 1.0);
  vec3 col = cSoil * (0.8 + 0.4 * vSeed);
  // flooded film with slow reflected bands
  float band = 0.5 + 0.5 * sin(vWorld.z * 1.7 + vWorld.x * 0.4 + uTime * 0.8 + vSeed * 6.0);
  vec3 wcol = mix(cShallow, cWater, 0.35 + 0.4 * band);
  col = mix(col, wcol * (uFlood.x + uFlood.y * band), flood * (1.0 - gr * 0.6) * 0.95);
  // the field lights up as the water reaches it
  col = hilite(col, cHead, arrive * (1.0 - gr) * (uLight > 0.5 ? 0.45 : 0.4));
  col = mix(col, cRice * uPadGreen, gr * 0.6);
  // hairline levees
  vec2 e = min(vUv, 1.0 - vUv) * vScale;
  float edge = 1.0 - smoothstep(0.0, 0.07 * uLineW + 0.02, min(e.x, e.y));
  col = mix(col, cLevee, edge * (0.5 + 0.4 * flood));
  col *= vNy > 0.5 ? 1.0 : 0.7;
  col = fogMix(col, length(vWorld - cameraPosition));
  gl_FragColor = vec4(col, 1.0);
` + TAIL + `}`

/* ------------------------------------------------------------------ rice rows */
export const RICE_VERT = /* glsl */`
attribute float aDist;
attribute float aSeed;
uniform float uGrow, uDistMax, uRowH, uTime;
varying vec3 vWorld;
varying float vY;
varying float vG;
void main(){
  float gr = clamp((uGrow - (aDist / uDistMax) * 0.45 - aSeed * 0.08) / 0.55, 0.0, 1.0);
  gr = 1.0 - pow(1.0 - gr, 2.2);
  vec3 p = position;
  vY = p.y;
  p.y *= gr * uRowH * (0.7 + 0.5 * aSeed);
  p.x += sin(uTime * 1.4 + aSeed * 40.0 + p.x * 9.0) * 0.012 * p.y;
  vG = gr;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`
export const RICE_FRAG = COMMON + /* glsl */`
uniform vec3 cRice, cTip;
uniform vec2 uRiceMul;
uniform float uLcd;
varying vec3 vWorld;
varying float vY;
varying float vG;
void main(){
  if (vG < 0.01) discard;
  vec3 col = mix(cRice * uRiceMul.x, cRice * uRiceMul.y, vY) + cTip * vY;
  col *= 1.0 + uLcd * 0.5;
  col = fogMix(col, length(vWorld - cameraPosition));
  gl_FragColor = vec4(col, 1.0);
` + TAIL + `}`

/* ------------------------------------------------------------------ swath curtain (satellite -> ground) */
export const SWATH_VERT = /* glsl */`
attribute float aT;
varying float vT;
void main(){
  vT = aT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
export const SWATH_FRAG = /* glsl */`
uniform vec3 cAccent;
uniform float uOpacity;
varying float vT;
void main(){
  float a = (0.05 + 0.3 * pow(vT, 2.5)) * uOpacity;
  gl_FragColor = vec4(cAccent, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
