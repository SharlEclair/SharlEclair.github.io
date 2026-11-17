/**
 * Screen-space HUD for the Harvest scene, drawn by one full-screen quad (so it dithers with everything else in the
 * 160x144 look): a viewfinder frame around the focal area, a pointer reticle, and one small readout panel:
 *   left  = three reservoir gauges (water level), right = a grid of field cells that flood and then turn green (acreage).
 * Coordinates inside the shader: y in -1..1, x in -aspect..aspect. No numbers, no claims: only gauges and cells.
 */
export const HUD_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

export const HUD_FRAG = /* glsl */`
uniform float uAspect, uTime, uLcd, uFrame, uPtrOn, uHover, uPx, uVig, uPanelOn, uFlood, uAcre, uRet;
uniform vec2 uPtr, uFocus;
uniform vec3 uLevels;
uniform vec4 uPanel, uFrameRect;
uniform vec3 cFg, cTeal, cGreen, cBg;
uniform float uBgA;
varying vec2 vUv;

vec4 acc = vec4(0.0);
void lay(vec3 c, float a){ a = clamp(a, 0.0, 1.0); acc = vec4(c * a, a) + acc * (1.0 - a); }
float ln(float d, float w, float aa){ return 1.0 - smoothstep(w - aa * 0.5, w + aa * 0.5, d); }
float sdBox(vec2 p, vec2 b){ vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }

void main(){
  vec2 p = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0);
  float aa = max(fwidth(p.y), 1e-4);
  float lw = (0.8 + 0.35 * uLcd) * aa;

  // very soft halftone edge (kept faint on purpose)
  float vig = smoothstep(1.1, 2.0, length(p * vec2(0.85, 1.0))) * uVig;
  if (vig > 0.001) {
    vec2 sp = gl_FragCoord.xy / (uPx * 6.0);
    sp = mat2(0.7071, -0.7071, 0.7071, 0.7071) * sp;
    float dd = length(fract(sp) - 0.5);
    float rad = sqrt(vig) * 0.6;
    lay(cBg, (1.0 - smoothstep(rad - 0.1, rad, dd)) * step(0.02, vig) * 0.8);
  }

  // viewfinder frame around the focal area
  vec2 q = abs(p - uFrameRect.xy) - uFrameRect.zw;
  float edgeD = max(q.x, q.y);
  float arm = 0.11;
  float br = ln(abs(edgeD), lw * 1.4, aa) * step(-arm, min(q.x, q.y));
  float tk = 0.0;
  if (q.y > -0.022 && q.y < 0.0) tk = ln(abs(fract(p.x / 0.1 + 0.5) - 0.5) * 0.1, lw, aa);
  if (q.x > -0.022 && q.x < 0.0) tk = max(tk, ln(abs(fract(p.y / 0.1 + 0.5) - 0.5) * 0.1, lw, aa));
  tk *= step(max(q.x, q.y), 0.0);
  vec2 fp = p - uFocus;
  float cross = max(ln(abs(fp.x), lw, aa) * step(abs(fp.y), 0.03), ln(abs(fp.y), lw, aa) * step(abs(fp.x), 0.03));
  lay(cFg, (br + tk * 0.7 + cross * 0.6) * uFrame);

  // readout panel
  if (uPanelOn > 0.001) {
    float k = uPanel.z / 0.5;
    vec2 s = (p - uPanel.xy) / k;
    float lk = lw / k;
    float ak = aa / k;
    float dP = sdBox(s, vec2(0.5, 0.13));
    lay(cBg, (1.0 - step(0.0, dP)) * uBgA * uPanelOn);
    lay(cFg, ln(abs(dP), lk, ak) * 0.5 * uPanelOn);

    // three reservoir gauges
    for (int i = 0; i < 3; i++) {
      float tx = -0.41 + 0.09 * float(i);
      vec2 t = s - vec2(tx, 0.0);
      float dT = sdBox(t, vec2(0.016, 0.085));
      float f = clamp(uLevels[i], 0.0, 1.0);
      float top = -0.085 + f * 0.17;
      lay(cTeal, (1.0 - smoothstep(-lk * 1.5, -lk * 0.5, dT)) * step(s.y, top) * 0.85 * uPanelOn);
      lay(cFg, ln(abs(dT), lk, ak) * 0.8 * uPanelOn);
      lay(cFg, ln(abs(s.y - top), lk * 1.2, ak) * step(abs(t.x), 0.026) * uPanelOn);
      float tick = 0.0;
      for (int j = 1; j < 4; j++) tick = max(tick, ln(abs(s.y - (-0.085 + 0.0425 * float(j))), lk, ak) * step(-0.026, t.x) * step(t.x, -0.016));
      lay(cFg, tick * 0.55 * uPanelOn);
    }

    // field cells: flood (teal), then green
    vec2 g = s - vec2(0.17, 0.0);
    vec2 cs = vec2(0.58 / 12.0, 0.17 / 4.0);
    if (abs(g.x) < 0.29 + 0.002 && abs(g.y) < 0.085 + 0.002) {
      vec2 gi = (g + vec2(0.29, 0.085)) / cs;
      vec2 id = floor(clamp(gi, vec2(0.0), vec2(11.999, 3.999)));
      vec2 lc = (fract(clamp(gi, vec2(0.0), vec2(11.999, 3.999))) - 0.5) * cs;
      float sd = sdBox(lc, cs * 0.5 - 0.004);
      float colF = (id.x + 0.5) / 12.0;
      float fl = clamp(uFlood * 1.8 - colF * 0.8 - id.y * 0.02, 0.0, 1.0);
      float gr = clamp(uAcre * 1.8 - colF * 0.8 - id.y * 0.02, 0.0, 1.0);
      vec3 cc = mix(cTeal, cGreen, smoothstep(0.0, 0.6, gr));
      float amt = max(fl * 0.6, gr);
      lay(cc, (1.0 - smoothstep(-lk, 0.0, sd)) * amt * 0.95 * uPanelOn);
      lay(cFg, ln(abs(sd), lk * 0.8, ak) * 0.32 * uPanelOn);
    }
  }

  // pointer reticle
  vec2 rd = p - uPtr;
  float r = length(rd);
  float ang = atan(rd.y, rd.x);
  float R = 0.072 * uRet + 0.014 * uHover + 0.003 * sin(uTime * 3.0);
  float ring = ln(abs(r - R), lw * 1.3, aa) * step(0.2, abs(sin(ang * 2.0)));
  vec2 ad = abs(rd);
  float ticks = max(ln(ad.x, lw * 1.3, aa) * step(R * 0.62, ad.y) * step(ad.y, R * 1.5), ln(ad.y, lw * 1.3, aa) * step(R * 0.62, ad.x) * step(ad.x, R * 1.5));
  float outer = ln(abs(r - R * 2.0), lw * 0.8, aa) * step(0.5, fract((ang / 6.2831853 + uTime * 0.05) * 20.0)) * 0.7;
  float pulse = ln(abs(r - fract(uTime * 0.45) * R * 4.0), lw * 0.7, aa) * (1.0 - fract(uTime * 0.45)) * 0.6;
  float dot0 = 1.0 - smoothstep(lw * 1.0, lw * 1.8, r);
  float hair = (ln(ad.x, lw * 0.5, aa) + ln(ad.y, lw * 0.5, aa)) * 0.16;
  lay(cFg, (ring + ticks + outer + pulse * uHover + dot0 + hair) * uPtrOn);

  gl_FragColor = vec4(acc.rgb / max(acc.a, 1e-4), acc.a);
  #include <colorspace_fragment>
}
`
