/**
 * GLSL for the SQL scene: the contour ground, the ribbon, the shards. All materials share one uniforms bag (scene.js).
 *
 * Story uniforms, all pure functions of scroll progress (see story() in scene.js):
 *   uB      0..1  how broken the ribbon is (splinter, red, shards burst)
 *   uR      scan ring radius on the ground, around the break point (negative = no ring yet)
 *   uBase   x where the intact ribbon currently ends (head while gliding, then the knit front)
 *   uSpread how far splintered lanes lag behind uBase
 *   uXT     x where the ribbon tail fades out
 */
export const PATH_GLSL = /* glsl */`
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float bayer(vec2 p){ p = floor(mod(p, 4.0)); return (mod(p.x * 4.0 + p.y * 7.0 + p.x * p.y * 3.0, 16.0) + 0.5) / 16.0; }
float pathZ(float x){ return 2.0 * sin(0.4 * x + 0.5) + 0.9 * sin(0.93 * x + 2.1); }
vec3 pathP(float x, float t){
  return vec3(x, 1.45 + 0.5 * sin(0.55 * x + 1.0) + 0.07 * sin(t * 0.8 + x * 1.1), pathZ(x));
}
/** tangent T and the ribbon's across direction C (twisting around T) */
void pathFrame(float x, float t, out vec3 T, out vec3 C){
  T = normalize(pathP(x + 0.06, t) - pathP(x - 0.06, t));
  vec3 side = normalize(cross(T, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(side, T);
  float th = -0.55 + 1.2 * sin(0.42 * x + 0.5 + t * 0.25) + 0.12 * sin(1.3 * x - t * 0.3);
  C = cos(th) * side + sin(th) * up;
}
`

/* ------------------------------------------------------------------ ground */
export const GROUND_VERT = /* glsl */`
uniform sampler2D uHeight;
uniform vec4 uBox;
uniform float uAmp;
varying vec3 vWorld;
void main(){
  vec3 p = position;
  vec2 uv = (p.xz - uBox.xy) / uBox.zw;
  p.y = texture2D(uHeight, uv).r * uAmp * 0.28 - 0.35;
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`

export const GROUND_FRAG = PATH_GLSL + /* glsl */`
uniform sampler2D uHeight;
uniform vec4 uBox;
uniform float uTime, uPx, uDark, uB, uR, uXT, uXE, uXf, uAmp, uStep, uMark, uHealK, uLineGain;
uniform vec2 uFocus;
uniform vec3 cBg, cLine, cLineHot, cRed, cGlow;
varying vec3 vWorld;

void main(){
  vec2 w = vWorld.xz;
  vec2 Bp = vec2(uXf, pathZ(uXf));
  float dB = length(w - Bp);
  float ringOn = step(0.0, uR);
  float healed = ringOn * (1.0 - smoothstep(uR - 0.9, uR + 0.2, dB));
  float brk = uB * exp(-pow(dB / 6.5, 2.0)) * (1.0 - healed);

  // glitch: whole rows of the map tear sideways under the break
  float row = floor(w.y / 0.36);
  float tick = floor(uTime * 8.0);
  float tearOn = step(0.45, hash21(vec2(row * 1.7, tick * 0.5)));
  float tear = (hash21(vec2(row, tick)) - 0.5) * 2.6 * brk * tearOn;
  vec2 q = vec2(w.x + tear, w.y);

  // height field: parallel slope + relief + a valley under the ribbon + a ripple at the scan ring
  float h = texture2D(uHeight, (q - uBox.xy) / uBox.zw).r * uAmp + 0.052 * q.y;
  float dz = q.y - pathZ(q.x);
  float along = smoothstep(uXT - 2.0, uXT + 4.0, q.x) * (1.0 - smoothstep(uXE - 0.5, uXE + 3.0, q.x));
  h -= 0.6 * along * exp(-dz * dz / 4.2);
  float rr = dB - uR;
  h += 0.30 * exp(-rr * rr / 0.6) * ringOn;
  h += 0.05 * sin(uTime * 0.35 + q.x * 0.07 + q.y * 0.05);

  float c = h / uStep;
  float fw = max(fwidth(c), 1e-4);
  float f1 = abs(fract(c - 0.5) - 0.5);
  float lineA = (1.0 - smoothstep(0.0, fw * 1.1, f1)) * (1.0 - smoothstep(0.30, 0.65, fw));
  float c5 = c / 5.0;
  float fw5 = max(fwidth(c5), 1e-4);
  float idx = (1.0 - smoothstep(0.0, fw5 * 1.5, abs(fract(c5 - 0.5) - 0.5))) * (1.0 - smoothstep(0.30, 0.65, fw5));

  float pool = exp(-dz * dz / 3.4) * along;
  float rf = 1.0 - smoothstep(14.0, 24.0, uR);
  float after = ringOn * step(dB, uR) * exp(-(uR - dB) / 5.5) * rf;
  float ringLine = ringOn * (exp(-rr * rr / 0.05) + 0.35 * uDark * exp(-rr * rr / 0.9)) * rf;
  float echo = ringOn * exp(-pow(dB - uR * 0.62, 2.0) / 0.05) * step(1.0, uR) * rf;

  float a = lineA * (0.24 + 0.16 * idx) + idx * 0.22;
  a *= uLineGain * (1.0 + 1.1 * pool + 1.5 * after + 0.7 * brk);
  a += (ringLine + echo * 0.35) * 0.9;

  // fault marker: dashed ring and a cross on the ground where the ribbon will break
  float md = abs(dB - 0.95);
  float ang = atan(w.y - Bp.y, w.x - Bp.x);
  float dash = step(0.5, fract(ang * 1.9 + uTime * 0.12));
  float crs = max(step(abs(w.x - Bp.x), 0.04) * step(abs(w.y - Bp.y), 0.42), step(abs(w.y - Bp.y), 0.04) * step(abs(w.x - Bp.x), 0.42));
  float mark = (smoothstep(0.07, 0.02, md) * dash + crs) * uMark * (1.0 - 0.7 * healed);
  a += mark * 0.85;

  vec3 lc = mix(cLine, cLineHot, clamp(pool * 0.7 + after * 1.2 + idx * 0.65 + ringLine, 0.0, 1.0));
  float redMix = clamp(brk * 1.25 + mark * brk, 0.0, 1.0) * (1.0 - clamp(ringLine * 2.0, 0.0, 1.0));
  lc = mix(lc, cRed, redMix);

  // soft fade into the page colour, dithered so it dissolves into dots rather than a gradient
  float fade = 1.0 - smoothstep(34.0, 66.0, length((w - uFocus) * vec2(0.72, 1.0)));
  a *= step(bayer(gl_FragCoord.xy / (uPx * 1.5)) * 0.999, fade);

  vec3 col = cBg;
  col += mix(cGlow, cRed, brk) * pool * 0.07 * (1.0 + after);
  col = mix(col, lc, clamp(a, 0.0, 1.0));
  col = mix(col, cRed, brk * 0.035 * uDark);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

/* ------------------------------------------------------------------ ribbon */
export const RIBBON_VERT = PATH_GLSL + /* glsl */`
attribute vec2 aUV;
uniform float uX0, uX1, uTime, uB, uHalfW, uCore, uXf, uHealK;
varying float vX;
varying float vV;
varying vec3 vW;
varying float vFace;
void main(){
  float x = mix(uX0, uX1, aUV.x);
  vec3 T, C;
  pathFrame(x, uTime, T, C);
  vec3 P = pathP(x, uTime);
  float near = exp(-pow((x - uXf + 3.0) / 3.4, 2.0));
  float jt = uB * (1.0 - uHealK) * near;
  float n = floor(uTime * 14.0);
  float gx = floor(x * 3.0);
  vec3 jit = (vec3(hash21(vec2(gx, n)), hash21(vec2(gx + 4.0, n + 3.0)), hash21(vec2(gx + 9.0, n + 7.0))) - 0.5) * vec3(0.7, 1.1, 0.7) * jt;
  vec3 pos = P + jit + C * aUV.y * (uHalfW / uCore);
  vX = x;
  vV = aUV.y;
  vW = pos;
  vFace = abs(dot(cross(T, C), normalize(cameraPosition - pos)));
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`

export const RIBBON_FRAG = PATH_GLSL + /* glsl */`
uniform float uTime, uPx, uDark, uB, uR, uXf, uBase, uSpread, uNoseW, uXT, uCore, uGlow, uCoreMix;
uniform vec3 cEdge, cCore, cRed, cWhiteRed;
varying float vX;
varying float vV;
varying vec3 vW;
varying float vFace;

void main(){
  float x = vX;
  float e = abs(vV) / uCore;                       // 0 at the centre line, 1 at the core edge

  // lanes: the ribbon is seven strands; under a fault they end at different places
  float lanes = 7.0;
  float lc = clamp(vV / uCore * 0.5 + 0.5, 0.0, 1.0) * lanes;
  float lane = clamp(floor(lc), 0.0, lanes - 1.0);
  float hl = hash21(vec2(lane, 3.1));
  float cut = uBase - uSpread * (0.15 + 0.85 * hl);
  float aCut = 1.0 - smoothstep(cut - 0.1, cut + 0.02, x);

  // nose and tail
  float env = mix(1.0, smoothstep(0.0, 2.2, uBase - x), uNoseW);
  float ec = e / pow(max(env, 0.001), 0.8);
  float tailA = smoothstep(uXT, uXT + 6.0, x);

  // healed by the scan ring?
  vec2 Bp = vec2(uXf, pathZ(uXf));
  float dB = length(vW.xz - Bp);
  float ringOn = step(0.0, uR);
  float healed = ringOn * (1.0 - smoothstep(uR - 0.9, uR + 0.2, dB));
  float red = uB * (1.0 - healed);
  float ringLine = ringOn * exp(-pow(dB - uR, 2.0) / 0.5) * (1.0 - smoothstep(14.0, 24.0, uR));

  // strands pull apart a little while broken
  float lf = abs(fract(lc) - 0.5);
  float gap = 1.0 - red * 0.85 * smoothstep(0.36, 0.5, lf);
  float flick = mix(1.0, step(0.3, hash21(vec2(lane, floor(uTime * 12.0)))), red * 0.55);

  float body = 1.0 - smoothstep(0.55, 1.0, ec);
  float inten = body * aCut * tailA * gap * flick;
  float flow = 0.86 + 0.14 * sin(x * 5.0 - uTime * 4.0) + 0.1 * pow(0.5 + 0.5 * sin(x * 1.1 - uTime * 2.6), 6.0);
  float t = bayer(gl_FragCoord.xy / (uPx * 1.5));
  float a = step(t, clamp(inten * flow * 1.3, 0.0, 1.0));

  // halo: the cheap bloom, additive on dark only
  float halo = exp(-e * e * 1.6) * (1.0 - smoothstep(0.7, 1.0, abs(vV))) * (1.0 - smoothstep(uBase - 0.2, uBase + 1.2, x)) * tailA;
  halo *= 0.11 * uGlow * (1.0 + 0.8 * ringLine) * (1.0 - 0.5 * red);

  float hot = smoothstep(0.55, 0.0, e) * (0.55 + 0.45 * (1.0 - vFace));
  vec3 col = mix(cEdge, cCore, hot * uCoreMix);
  col = mix(col, mix(cRed, cWhiteRed, hot * 0.7), red);
  col += cCore * ringLine * 0.5 * uDark;

  // bright spot on the nose
  float nose = exp(-pow((x - uBase) / 0.45, 2.0)) * exp(-e * e * 1.5) * uNoseW * tailA;
  col = mix(col, cCore, clamp(nose * 0.8, 0.0, 1.0) * (1.0 - red));

  float alpha = clamp(a + halo, 0.0, 1.0);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`

/* ------------------------------------------------------------------ shards */
export const SHARD_VERT = PATH_GLSL + /* glsl */`
attribute vec4 aHome;   // x: home x on the path, y: across (-1..1), z: length, w: width
attribute vec4 aRnd;
uniform float uTime, uB, uR, uXf, uHalfW, uHealK;
varying vec2 vUv;
varying float vPull;
varying float vAlpha;
varying float vRed;

mat3 rot(vec3 ax, float an){
  float s = sin(an), c = cos(an), k = 1.0 - c;
  return mat3(
    k * ax.x * ax.x + c, k * ax.x * ax.y + s * ax.z, k * ax.x * ax.z - s * ax.y,
    k * ax.x * ax.y - s * ax.z, k * ax.y * ax.y + c, k * ax.y * ax.z + s * ax.x,
    k * ax.x * ax.z + s * ax.y, k * ax.y * ax.z - s * ax.x, k * ax.z * ax.z + c);
}

void main(){
  float hx = aHome.x;
  vec3 T, C;
  pathFrame(hx, uTime, T, C);
  vec3 H = pathP(hx, uTime) + C * aHome.y * uHalfW;
  vec3 B = pathP(uXf, uTime);
  float u = hx - (uXf - 7.2);
  float dS = 1.0 + 0.5 * u + 1.2 * aRnd.x;
  float a = aRnd.y * 6.2831853;
  vec3 S = vec3(B.x + cos(a) * dS * 1.15, 0.5 + aRnd.z * (1.5 + 0.18 * dS), B.z + sin(a) * dS * 0.8);
  S.y += 0.3 * sin(uTime * (0.7 + aRnd.w) + aRnd.x * 9.0);
  S.x += 0.25 * sin(uTime * 0.9 + aRnd.y * 11.0);

  float burst = 1.0 - pow(1.0 - uB, 3.0);
  bool past = hx < uXf;
  vec3 start = past ? H : B;
  vec3 pos = mix(start, S, burst);
  float pull = smoothstep(0.0, 1.0, clamp((uR - dS) / 4.0, 0.0, 1.0)) * step(0.0, uR);
  pos = mix(pos, H, pull);
  pos.y += sin(pull * 3.14159) * 1.1;

  // quad in the shard's frame, tumbling while scattered
  vec3 ax = normalize(vec3(aRnd.w - 0.5, aRnd.x - 0.3, aRnd.y - 0.5) + 0.001);
  float spin = (1.0 - pull) * burst * (aRnd.z * 7.0 + uTime * (aRnd.w - 0.5) * 3.0);
  vec3 loc = (T * position.x * aHome.z + C * position.y * aHome.w) * 1.6;
  loc = rot(ax, spin) * loc;
  vec3 wp = pos + loc;

  vUv = uv;
  vPull = pull;
  float vis = step(0.001, uB) * (past ? 1.0 : smoothstep(0.0, 0.3, uB));
  vAlpha = vis * (1.0 - smoothstep(0.88, 1.0, pull));
  vRed = uB * (1.0 - smoothstep(0.3, 0.75, pull));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`

export const SHARD_FRAG = /* glsl */`
uniform float uPx, uDark;
uniform vec3 cEdge, cCore, cRed, cWhiteRed;
varying vec2 vUv;
varying float vPull;
varying float vAlpha;
varying float vRed;
float bayer(vec2 p){ p = floor(mod(p, 4.0)); return (mod(p.x * 4.0 + p.y * 7.0 + p.x * p.y * 3.0, 16.0) + 0.5) / 16.0; }
void main(){
  vec2 l = (vUv - 0.5) * 2.0;                      // -1..1, the quad is 1.6x the shard
  vec2 s = abs(l) * 1.6;
  float body = (1.0 - smoothstep(0.78, 1.0, max(s.x, s.y * 1.0)));
  float a = step(bayer(gl_FragCoord.xy / (uPx * 1.5)), body * 1.2);
  float glow = exp(-dot(l, l) * 2.2) * 0.32 * uDark;
  vec3 col = mix(cEdge, cCore, 0.55 * (1.0 - s.x * s.x));
  col = mix(col, mix(cRed, cWhiteRed, 0.55), vRed);
  float alpha = clamp(a + glow, 0.0, 1.0) * vAlpha;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`
