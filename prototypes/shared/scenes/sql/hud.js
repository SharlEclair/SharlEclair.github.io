/**
 * Screen-space HUD for the SQL scene, one full-screen quad (frame, ticks, reticle, fault tag, 10 cell gauges, result
 * panel, step markers) plus a handful of mono text sprites. Coordinates inside the shader: y in -1..1, x in
 * -aspect..aspect (the same space as the Harvest HUD). Text is drawn white on a canvas and tinted by material colour,
 * so a theme change is a colour swap.
 */
export const HUD_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

export const HUD_FRAG = /* glsl */`
uniform float uAspect, uTime, uPx, uFrame, uErr, uTagA, uPanelA, uPtrOn, uTagLit, uHeal;
uniform vec2 uPtr;
uniform vec4 uTag, uPanel, uGaugeTag, uGaugePanel, uLead;
uniform vec4 uChips[5];
uniform vec3 cFrame, cGreen, cRed, cPanelFill, cPanelLine, cGauge;
varying vec2 vUv;

vec4 acc = vec4(0.0);
void lay(vec3 c, float a){ a = clamp(a, 0.0, 1.0); acc = vec4(c * a, a) + acc * (1.0 - a); }
float ln(float d, float w, float aa){ return 1.0 - smoothstep(w - aa * 0.5, w + aa * 0.5, d); }
float box(vec2 p, vec2 hs){ vec2 d = abs(p) - hs; return max(d.x, d.y); }
float segd(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0)); }

/** ten cell gauge: lit cells in green, an optional red cell at the end */
void gauge(vec2 p, vec4 g, float lit, float errCell, float k, float aa){
  vec2 d = (p - g.xy) / g.zw;
  if (abs(d.x) > 1.0 || abs(d.y) > 1.0 || k < 0.002) return;
  float x = (d.x * 0.5 + 0.5) * 10.0;
  float i = floor(x), f = fract(x);
  float cell = step(0.1, f) * step(f, 0.9);
  float on = step(i + 0.5, lit);
  float isErr = errCell * step(9.0, i);
  vec3 c = mix(cGauge, cRed, isErr);
  float pulse = 0.7 + 0.3 * sin(uTime * 9.0);
  float al = cell * (on * 0.95 + isErr * pulse * (1.0 - on) + (1.0 - on) * (1.0 - isErr) * 0.14);
  lay(c, al * k);
}

void main(){
  vec2 p = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0);
  float aa = max(fwidth(p.y), 1e-4);
  float lw = 0.8 * aa;
  vec3 ret = mix(cGreen, cRed, uErr);

  // viewfinder frame: corner brackets and edge ticks
  vec2 b = vec2(uAspect - 0.04, 0.95);
  vec2 q = abs(p) - b;
  float edgeD = max(q.x, q.y);
  float br = ln(abs(edgeD), lw * 1.4, aa) * step(-0.1, min(q.x, q.y));
  float tk = 0.0;
  if (q.y > -0.022 && q.y < 0.0) tk = ln(abs(fract(p.x / 0.1 + 0.5) - 0.5) * 0.1, lw, aa);
  if (q.x > -0.022 && q.x < 0.0) tk = max(tk, ln(abs(fract(p.y / 0.1 + 0.5) - 0.5) * 0.1, lw, aa));
  tk *= step(max(q.x, q.y), 0.0);
  lay(cFrame, (br + tk * 0.7) * uFrame);

  // fault tag: leader line, plate, gauge
  if (uTagA > 0.002) {
    float dl = segd(p, uLead.xy, uLead.zw);
    lay(ret, ln(dl, lw, aa) * 0.7 * uTagA);
    vec2 td = (p - uTag.xy) / uTag.zw;
    float inside = step(abs(td.x), 1.0) * step(abs(td.y), 1.0);
    lay(cPanelFill, inside * 0.9 * uTagA);
    float bar = step(abs(td.y), 1.0) * step(-1.0, td.x) * step(td.x, -1.0 + 0.007 / uTag.z);
    lay(cRed, bar * uTagA);
    gauge(p, uGaugeTag, uTagLit, 1.0, uTagA, aa);
  }

  // result panel
  if (uPanelA > 0.002) {
    vec2 pd = (p - uPanel.xy) / uPanel.zw;
    float inside = step(abs(pd.x), 1.0) * step(abs(pd.y), 1.0);
    lay(cPanelFill, inside * 0.97 * uPanelA);
    float fr = ln(abs(box(p - uPanel.xy, uPanel.zw)), lw * 1.2, aa) * inside;
    lay(cPanelLine, fr * 0.65 * uPanelA);
    float cr = ln(abs(box(p - uPanel.xy, uPanel.zw + 0.012)), lw, aa) * step(-0.05, min(abs(p.x - uPanel.x) - uPanel.z, abs(p.y - uPanel.y) - uPanel.w) + 0.012);
    lay(cPanelLine, cr * 0.5 * uPanelA);
    gauge(p, uGaugePanel, 10.0, 0.0, uPanelA, aa);
  }

  // step markers: status dot (0) and the four steps
  for (int i = 0; i < 5; i++) {
    vec4 ch = uChips[i];
    float h = i == 0 ? 0.0085 : 0.0075;
    float d = box(p - ch.xy, vec2(h));
    float st = ch.z;
    vec3 cc = mix(cGreen, cRed, ch.w);
    float fill = (1.0 - smoothstep(-aa, 0.0, d)) * (st >= 0.99 ? 1.0 : (st > 0.3 ? 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 7.0)) : 0.0));
    float rim = ln(abs(d), lw, aa) * (st > 0.01 ? 0.9 : 0.4);
    lay(cc, max(fill, rim) * uFrame);
  }

  // reticle on the ribbon head
  vec2 rd = p - uPtr;
  float r = length(rd);
  float ang = atan(rd.y, rd.x);
  float S = 0.072 + 0.004 * sin(uTime * 3.0);
  vec2 qq = abs(rd) - S;
  float rb = ln(abs(max(qq.x, qq.y)), lw * 1.4, aa) * step(-0.028, min(qq.x, qq.y));
  float ring = ln(abs(r - 0.034), lw * 1.1, aa) * step(0.35, abs(sin(ang * 3.0 + uTime * 0.8)));
  float dot0 = 1.0 - smoothstep(lw * 1.2, lw * 2.4, r);
  vec2 ad = abs(rd);
  float arms = max(ln(ad.x, lw, aa) * step(S + 0.018, ad.y) * step(ad.y, S + 0.075), ln(ad.y, lw, aa) * step(S + 0.018, ad.x) * step(ad.x, S + 0.075)) * 0.8;
  float pf = fract(uTime * 0.5);
  float pulse = ln(abs(r - pf * 0.2), lw * 0.8, aa) * (1.0 - pf) * 0.55;
  lay(ret, (rb + ring + dot0 + arms + pulse) * uPtrOn);

  gl_FragColor = vec4(acc.rgb / max(acc.a, 1e-4), acc.a);
  #include <colorspace_fragment>
}
`

/** White mono text on a canvas, as a plane mesh in the HUD scene. Sized and tinted per frame by place(). */
export function makeLabel(THREE, text, { px = 11, weight = 600, spacing = 0.16 } = {}) {
  const S = 2
  const font = `${weight} ${px * S}px ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace`
  const probe = document.createElement('canvas').getContext('2d')
  probe.font = font
  const track = px * S * spacing
  const adv = [...text].map((ch) => probe.measureText(ch).width + track)
  const total = adv.reduce((a, b) => a + b, 0) - track
  const pad = 3 * S
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(total + pad * 2)
  canvas.height = Math.ceil(px * S * 1.6)
  const ctx = canvas.getContext('2d')
  ctx.font = font
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  let x = pad
  ;[...text].forEach((ch, i) => { ctx.fillText(ch, x, canvas.height / 2 + px * 0.06 * S); x += adv[i] })
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.generateMipmaps = false
  map.minFilter = THREE.LinearFilter
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
  const geometry = new THREE.PlaneGeometry(1, 1)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = 10
  mesh.visible = false
  return {
    mesh, material, text, w: canvas.width / S, h: canvas.height / S, pad: pad / S,
    dispose() { map.dispose(); material.dispose(); geometry.dispose() },
  }
}
