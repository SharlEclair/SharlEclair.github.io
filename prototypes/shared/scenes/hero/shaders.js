/**
 * Hero scene shaders. One fullscreen pass: sphere-traced "Creation" hands (smooth-unioned tapered capsules posed on
 * the CPU), a stippled cloud bank (layered fbm planes), stars and the four-point flare. Output is grey luminance
 * (values above 1 = white-hot) that the dither / ascii / halftone passes turn into pixels.
 */
export const NSEG = 23 // segments per hand: 8 palm/wrist/forearm, 12 fingers, 3 thumb

export const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

export const FRAG = /* glsl */`
precision highp float;
#define NSEG ${NSEG}
varying vec2 vUv;
uniform vec2 uRes;
uniform float uAspect;
uniform float uTanHalf;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform float uTime;
uniform float uP;
uniform vec3 uLight;
uniform vec4 uHand[2];
uniform vec3 uTip[2];
uniform vec4 uSegA[${NSEG * 2}];
uniform vec4 uSegB[${NSEG * 2}];
uniform vec3 uContact;
uniform vec2 uFlareScr;
uniform float uFlare;
uniform float uGlitter;
uniform vec2 uTipScr[2];
uniform vec2 uSpark;
uniform vec2 uOrbit;
uniform float uLcd;
uniform float uStarScale;
uniform vec3 uPtr;      // pointer in p space (xy), hover amount (z)
uniform vec3 uRipple;   // click ripple origin (xy) and age in seconds (z, < 0 = none)
uniform vec3 uPulse;    // x: arrival ring phase, y: looping ring phase, z: strength

float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float vn3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z);
}
float fbm(vec2 p) {
  float a = 0.5; float s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return s;
}

// ---------------------------------------------------------------- hands
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float sdTaper(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a; vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
float mapHand(vec3 p, int hand) {
  float d = 1e5;
  int base = hand * NSEG;
  for (int i = 0; i < NSEG; i++) {
    vec4 A = uSegA[base + i]; vec4 B = uSegB[base + i];
    float di = sdTaper(p, A.xyz, B.xyz, A.w, B.w);
    float k = i < 8 ? 0.13 : (i < 20 ? 0.03 : 0.08);
    d = smin(d, di, k);
  }
  return d;
}
bool trace(vec3 ro, vec3 rd, int hand, out float tHit) {
  vec4 S = uHand[hand];
  vec3 oc = ro - S.xyz;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - S.w * S.w;
  float disc = b * b - c;
  tHit = 0.0;
  if (disc < 0.0) return false;
  float sq = sqrt(disc);
  float t = max(-b - sq, 0.0);
  float tmax = -b + sq;
  for (int i = 0; i < 72; i++) {
    float d = mapHand(ro + rd * t, hand);
    if (d < 0.0025) { tHit = t; return true; }
    t += d * 0.88;
    if (t > tmax) return false;
  }
  return false;
}
vec3 calcN(vec3 p, int hand) {
  vec2 e = vec2(1.0, -1.0) * 0.004;
  return normalize(e.xyy * mapHand(p + e.xyy, hand) + e.yyx * mapHand(p + e.yyx, hand) +
                   e.yxy * mapHand(p + e.yxy, hand) + e.xxx * mapHand(p + e.xxx, hand));
}
float calcAO(vec3 p, vec3 n, int hand) {
  float o = 0.0;
  for (int i = 1; i <= 3; i++) {
    float hh = 0.07 * float(i);
    o += (hh - mapHand(p + n * hh, hand)) / pow(2.0, float(i));
  }
  return clamp(1.0 - o * 3.2, 0.0, 1.0);
}

float shadeHand(vec3 ro, vec3 rd, float t, int hand) {
  vec3 pos = ro + rd * t;
  vec3 n = calcN(pos, hand);
  vec3 V = -rd;
  vec3 L = normalize(uLight);
  float dif = smoothstep(-0.15, 0.95, dot(n, L));
  float fill = clamp(dot(n, normalize(vec3(-0.7, -0.35, 0.5))) * 0.5 + 0.5, 0.0, 1.0) * 0.09;
  vec3 H = normalize(L + V);
  float spec = pow(clamp(dot(n, H), 0.0, 1.0), 40.0) * 0.55;
  float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 2.4);
  float rim = clamp(dot(n, normalize(vec3(0.0, 0.5, -1.0))) * 0.5 + 0.5, 0.0, 1.0);
  float occ = calcAO(pos, n, hand);
  float m = vn3(pos * 3.4) * 0.6 + vn3(pos * 8.0) * 0.3;
  float vein = 1.0 - smoothstep(0.0, 0.09, abs(sin(pos.x * 2.6 + pos.y * 1.7 + m * 7.0)));
  float albedo = 0.8 + 0.2 * m - 0.14 * vein * (1.0 - uLcd);
  float lum = albedo * (dif * 0.85 + fill + 0.015) * occ + spec * 0.8 + fres * (0.05 + 0.75 * rim);
  // lit by the spark between the fingertips
  lum += uFlare * exp(-length(pos - uContact) * 2.6) * 0.4;
  // the arms dissolve into the dark, like the phosphor reference
  lum *= 0.82 * (1.0 - smoothstep(1.7, 3.5, length(pos - uTip[hand])));
  return lum;
}

// ---------------------------------------------------------------- sky
float ringHit(float r, float R, float w) { float x = (r - R) / w; return exp(-x * x); }
float ringK() { return clamp(uAspect * 1.15, 0.55, 1.0); }
float pulseR1() { return mix(0.07, 0.3, uPulse.x) * ringK(); }
float pulseR2() { return mix(0.05, 1.0, uPulse.y) * ringK(); }

// pointer hover ripple, click ripple and the arrival shockwave: a displacement for the cloud bank
vec2 skyWarp(vec2 p) {
  vec2 w = vec2(0.0);
  vec2 d = p - uPtr.xy; float r = length(d) + 1e-3;
  w += d / r * sin(r * 24.0 - uTime * 5.0) * exp(-r * 3.2) * uPtr.z * 0.022;
  if (uRipple.z >= 0.0) {
    vec2 e = p - uRipple.xy; float q = length(e) + 1e-3;
    float rr = uRipple.z * 0.9;
    w += e / q * sin((q - rr) * 28.0) * exp(-pow((q - rr) * 6.0, 2.0)) * exp(-uRipple.z * 1.2) * 0.07;
  }
  vec2 f = p - uFlareScr; float fr = length(f) + 1e-3;
  w += f / fr * (ringHit(fr, pulseR1(), 0.14) + ringHit(fr, pulseR2(), 0.16) * 0.8) * uPulse.z * 0.035;
  return w;
}

float billow(vec2 q) {
  float a = 0.55; float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * (1.0 - abs(2.0 * vn(q) - 1.0));
    q = q * 2.07 + vec2(11.3, 5.7);
    a *= 0.5;
  }
  return s;
}
// density of one cloud bank (> 0 inside); fl = 0 nearest (lowest, biggest) .. 2 farthest (highest, finest)
float cloudField(vec2 p, float fl) {
  float par = 1.0 - 0.33 * fl;
  float dir = fl > 0.5 ? -1.0 : 1.0;
  float x = p.x + uOrbit.x * par * 1.5 + (uP - 0.5) * 0.5 * par + uTime * (0.024 - 0.007 * fl) * dir;
  float y = p.y + uOrbit.y * par * 0.5;
  float base = -0.95 + 0.3 * fl + 0.04 * uP * par;
  float top = base + 0.62 * (vn(vec2(x * 0.5 + fl * 7.0, fl * 3.1)) - 0.5) + 0.16 * (vn(vec2(x * 1.7 + fl * 3.0, 9.0 + fl)) - 0.5);
  float s = (1.0 + 0.45 * fl) * mix(1.0, 0.6, uLcd);
  float b = billow(vec2(x * s * 0.95 + fl * 5.0, y * s * 1.5));
  return (top - y) * 1.5 + (b - 0.52) * 1.1 * (1.0 - 0.3 * fl);
}
float clouds(vec2 p0) {
  vec2 p = p0 + skyWarp(p0);
  vec2 toF = uFlareScr - p;
  float fd = length(toF);
  float lw = 0.55 * clamp(0.35 + uFlare + uP * 0.4, 0.0, 1.0);
  vec2 ld = normalize(mix(vec2(0.2, 1.0), toF / (fd + 1e-3), lw));
  float glow = exp(-fd * 1.25) * (0.25 + 0.75 * uFlare) * (0.4 + 0.6 * uP) * (1.0 - 0.6 * uLcd);
  float lum = 0.0; float T = 1.0;
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float d = cloudField(p, fl);
    float d2 = cloudField(p + ld * 0.035, fl);
    float lit = clamp((d - d2) * 22.0, 0.0, 1.0);
    float mask = smoothstep(0.0, 0.07, d);
    float edge = 1.0 - smoothstep(0.0, 0.5, d);
    float fade = 1.0 - 0.34 * fl;
    float body = 0.02 + 0.3 * edge * edge + 0.95 * lit * (0.15 + 0.85 * edge) + glow * (0.12 + 0.55 * edge);
    body *= mix(1.0, 0.3, smoothstep(0.15, 0.9, d));
    lum += mask * body * fade * T;
    T *= 1.0 - mask * 0.9;
  }
  return lum;
}
float smallStars(vec2 p, float cellPx, float par, float dens) {
  float pix = 2.0 / uRes.y;
  vec2 q = (p + uOrbit * par) / (cellPx * pix);
  vec2 id = floor(q); vec2 f = fract(q);
  float h = h21(id + par * 11.0);
  if (h > dens) return 0.0;
  vec2 c = 0.25 + 0.5 * vec2(h21(id + 3.1), h21(id + 7.7));
  float d = length(f - c) * cellPx;
  vec2 pp = p - uPtr.xy;
  float near = exp(-dot(pp, pp) / 0.035) * uPtr.z;
  float tw = 0.65 + 0.35 * sin(uTime * 2.0 + h * 60.0);
  tw = mix(tw, 0.55 + 0.45 * sin(uTime * 17.0 + h * 90.0), near);
  return smoothstep(1.2 + near * 1.6, 0.2, d) * (0.4 + 0.8 * fract(h * 91.7)) * tw * (1.0 + 2.2 * near);
}
float starburstD(vec2 u, float s, float decay) {
  u /= s;
  float r = length(u) + 1e-4;
  float a = atan(u.y, u.x);
  float cr = pow(abs(cos(2.0 * a)), 56.0) * (0.62 + 0.38 * abs(sin(a)));
  float dg = pow(abs(cos(2.0 * (a - 0.785398))), 110.0);
  float core = exp(-r * 4.5) * 1.5;
  float rays = cr * exp(-r * decay) + 0.4 * dg * exp(-r * 2.4);
  return core + rays;
}
float starburst(vec2 u, float s) { return starburstD(u, s, 1.15); }
float bigStars(vec2 p) {
  float s = 0.0;
  float R1 = pulseR1(); float R2 = pulseR2();
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    vec2 c = vec2((h11(fi * 3.1 + 1.0) - 0.5) * 1.9 * uAspect, mix(-0.05, 0.92, h11(fi * 5.7 + 2.0)));
    c += uOrbit * (0.2 + 0.7 * h11(fi * 2.3));
    float sz = (0.022 + 0.04 * h11(fi * 9.1 + 4.0)) * uStarScale;
    vec2 u = p - c;
    vec2 pp = c - uPtr.xy;
    float near = exp(-dot(pp, pp) / 0.08) * uPtr.z;
    float fr = length(c - uFlareScr);
    float sweep = (ringHit(fr, R1, 0.12) + ringHit(fr, R2, 0.14)) * uPulse.z;
    float boost = near + sweep + 0.35 * uFlare;
    if (length(u) > sz * (1.0 + 1.2 * boost) * 15.0) continue;
    float rate = (0.9 + h11(fi)) * 1.6 + near * 9.0;
    float tw = 0.6 + 0.4 * sin(uTime * rate + fi * 5.0);
    s += starburst(u, sz * (1.0 + 0.9 * boost)) * tw * 0.7 * (1.0 + 1.4 * boost);
  }
  return s;
}
float glitterRing(vec2 u, float R, float amount) {
  float r = length(u);
  if (r > R * 1.6 + 0.05 || amount < 0.01) return 0.0;
  float a = atan(u.y, u.x);
  float N = 26.0;
  float sec = 6.2831853 / N;
  float spin = uTime * 0.18;
  float ia = floor((a + spin) / sec);
  float g = 0.0;
  float pix = 2.0 / uRes.y;
  for (int j = -1; j <= 1; j++) {
    float idx = ia + float(j);
    float h1 = h11(idx * 1.3 + 0.5); float h2 = h11(idx * 2.9 + 3.0);
    if (h1 > amount) continue;
    float ang = (idx + 0.5 + (h1 - 0.5) * 0.7) * sec - spin;
    float rad = R * (0.7 + 0.7 * h2);
    vec2 pos = vec2(cos(ang), sin(ang)) * rad;
    float sz = pix * (1.2 + 2.4 * h2) * (1.0 + uLcd);
    float tw = 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * 3.0 + idx * 7.0));
    float d = length(u - pos);
    g += (smoothstep(sz, 0.0, d) + 0.6 * starburst(u - pos, sz * 3.0) * 0.25) * tw;
  }
  return g;
}
// expanding dashed pulse rings centred on the flare: one tied to scroll (readable in a still), one looping
float pulseRing(vec2 u) {
  if (uPulse.z < 0.01) return 0.0;
  float r = length(u);
  float a = atan(u.y, u.x);
  float pix = 2.0 / uRes.y;
  float w = pix * (2.2 + 1.8 * uLcd);
  float R1 = pulseR1(); float R2 = pulseR2();
  float a1 = (1.0 - 0.45 * uPulse.x) * smoothstep(0.0, 0.12, uPulse.x) * 0.7;
  float a2 = pow(1.0 - uPulse.y, 1.6) * smoothstep(0.0, 0.06, uPulse.y);
  float dash = 0.82 + 0.18 * sin(a * 14.0 + R1 * 9.0);
  float dash2 = 0.82 + 0.18 * sin(a * 18.0 - R2 * 6.0);
  float ring = ringHit(r, R1, w) * a1 * dash + ringHit(r, R2, w * 1.3) * a2 * dash2 * 0.85;
  float haze = (ringHit(r, R1, w * 7.0) * a1 + ringHit(r, R2, w * 8.0) * a2) * 0.05;
  return (ring * 0.9 + haze) * uPulse.z;
}

void main() {
  vec2 p = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0);
  vec3 rd = normalize(uCamRot * vec3(p * uTanHalf, -1.0));
  vec3 ro = uCamPos;
  float lum = 0.0;

  // sky
  float star = smallStars(p, mix(13.0, 7.0, uLcd), 0.25, mix(0.1, 0.05, uLcd)) + 0.8 * smallStars(p, mix(22.0, 9.0, uLcd), 0.55, mix(0.07, 0.04, uLcd));
  lum += star * smoothstep(-0.9, 0.2, p.y);
  lum += bigStars(p) * (1.0 - 0.3 * uLcd);
  lum += clouds(p) * (1.0 - 0.3 * uLcd);
  lum *= mix(1.0, 0.5, uLcd);

  // hands
  float tA; float tB;
  bool hitA = trace(ro, rd, 0, tA);
  bool hitB = trace(ro, rd, 1, tB);
  if (hitA || hitB) {
    bool useA = hitA && (!hitB || tA < tB);
    lum = useA ? shadeHand(ro, rd, tA, 0) : shadeHand(ro, rd, tB, 1);
  }

  float pre = lum;
  // sparks at the fingertips (hover) and the contact flare
  float tipGlow = 0.0;
  for (int i = 0; i < 2; i++) {
    float sp = i == 0 ? uSpark.x : uSpark.y;
    tipGlow += starburst(p - uTipScr[i], (0.03 + 0.06 * sp) * uStarScale) * (0.1 + 1.1 * sp);
  }
  lum += tipGlow * (1.0 - uFlare);
  if (uFlare > 0.001) {
    vec2 u = p - uFlareScr;
    float fk = ringK();
    float s = (0.05 + 0.15 * uFlare) * uStarScale * fk;
    float rot = uTime * 0.04;
    lum += exp(-length(u) * 12.0 / fk) * uFlare * 0.35 * (1.0 - 0.7 * uLcd);
    lum += pulseRing(u);
    u = mat2(cos(rot), sin(rot), -sin(rot), cos(rot)) * u;
    lum += starburstD(u, s, 1.9) * uFlare * 1.2;
    lum += glitterRing(u, (0.1 + 0.22 * uGlitter) * fk, uGlitter) * 1.2;
  }
  // click ripple: a thin bright ring at the pointer
  if (uRipple.z >= 0.0) {
    float q = length(p - uRipple.xy);
    float rr = uRipple.z * 0.9;
    lum += ringHit(q, rr, 2.2 * 2.0 / uRes.y) * exp(-uRipple.z * 1.6) * 0.6;
  }

  lum = pre + (lum - pre) * mix(1.0, 0.6, uLcd);
  gl_FragColor = vec4(lum, lum, lum, 1.0);
}
`
