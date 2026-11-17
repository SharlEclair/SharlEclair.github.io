/**
 * Full-bleed "phosphor" treatments: the scene is rendered into a small low-res target (RGB = grey luminance, values
 * above 1 are "hot"), then drawn to the canvas (or any target) at full resolution as one of
 *
 *   'bayer'     ordered dither (8x8 Bayer) onto a palette, each dither pixel is one LED-like cell
 *   'ascii'     luminance -> a ramp of glyphs taken from a canvas font atlas, one glyph per cell
 *   'halftone'  rotated (45 deg) dot grid, dot area follows luminance
 *
 * Every mode adds the same CRT dressing in the shader (no postprocessing library): scanlines locked to the cell
 * rows, a cheap bloom (16 taps of the low-res target), vignette, a faint flicker and a slow rolling brightness bar.
 *
 *   const pass = createTreatmentPass(THREE, { mode: 'bayer' })      // or createAsciiPass / createHalftonePass
 *   pass.setSize(cssW, cssH, dpr)            // follow the canvas; this sizes pass.lowRT for you
 *   pass.render(renderer, scene, camera)     // scene -> lowRT -> canvas   (4th arg: a render target instead of the canvas)
 *   // or render the scene yourself into pass.lowRT and call pass.compose(renderer, target)
 *
 * Same call shape as createDitherPass in pass.js. Palette order is DARK -> LIGHT (2..8 colours, sRGB hex).
 */
export const PHOSPHOR = ['#010503', '#04301a', '#0f9a47', '#4dff94', '#e4fff0']
export const AMBER_CRT = ['#080300', '#3a1600', '#b45309', '#ffb347', '#fff1d6']

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`
const FRAG = /* glsl */`
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tGlyph;
uniform vec3 uPalette[8];
uniform int uCount;
uniform int uMode;          // 0 bayer, 1 ascii, 2 halftone
uniform vec2 uCanvas;       // drawing buffer size in px
uniform vec2 uGrid;         // low-res target size in texels
uniform vec2 uCell;         // cell size in drawing-buffer px
uniform float uGlyphs;
uniform float uBias;
uniform float uContrast;
uniform float uStrength;    // 0 = plain posterise, 1 = full dither
uniform float uScan;
uniform float uScanPeriod;  // px
uniform float uGlow;
uniform float uGlowR;       // bloom radius, fraction of canvas height
uniform float uVignette;
uniform float uGap;         // LED gap between cells (bayer mode), 0..1
uniform float uTime;
uniform float uFlicker;
varying vec2 vUv;

float bayer8(vec2 p) {
  ivec2 q = ivec2(mod(floor(p), 8.0));
  int x = q.x; int y = q.y ^ q.x;
  int v = ((y & 1) << 5) | ((x & 1) << 4) | ((y & 2) << 2) | ((x & 2) << 1) | ((y & 4) >> 1) | ((x & 4) >> 2);
  return (float(v) + 0.5) / 64.0;
}
vec3 pal(int i) {
  vec3 c = uPalette[0];
  for (int k = 0; k < 8; k++) { if (k == i) c = uPalette[k]; }
  return c;
}
vec3 ramp(float l) {
  float n = float(uCount - 1);
  float f = clamp(l, 0.0, 1.0) * n;
  int i = int(floor(f));
  int j = int(min(float(i + 1), n));
  return mix(pal(i), pal(j), fract(f));
}
float tone(float lum) {
  float l = pow(clamp(lum, 0.0, 1.5), 1.0 / 2.2);
  return clamp((l - 0.5) * uContrast + 0.5 + uBias, 0.0, 1.3);
}
float lumAt(vec2 uv) { return texture2D(tScene, uv).r; }

float bloom(vec2 uv) {
  float acc = 0.0;
  float asp = uCanvas.y / uCanvas.x;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 16.0) * uGlowR;
    float a = fi * 2.39996;
    vec2 o = vec2(cos(a) * asp, sin(a)) * r;
    float l = clamp(lumAt(uv + o), 0.0, 1.4);
    acc += l * l;
  }
  return acc / 16.0;
}

void main() {
  vec2 px = vUv * uCanvas;
  vec3 col = vec3(0.0);
  float l = 0.0;
  vec2 guv = vUv;

  if (uMode == 0) {
    vec2 g = vUv * uGrid;
    vec2 cid = floor(g);
    vec2 f = fract(g);
    guv = (cid + 0.5) / uGrid;
    l = tone(lumAt(guv));
    float n = float(uCount - 1);
    float thr = mix(0.5, bayer8(cid), uStrength);
    int idx = int(clamp(floor(l * n + thr), 0.0, n));
    col = pal(idx);
    vec2 m = smoothstep(0.0, 0.34, f) * smoothstep(0.0, 0.34, 1.0 - f);
    col *= mix(1.0, m.x * m.y, uGap);
  } else if (uMode == 1) {
    vec2 c = px / uCell;
    vec2 cid = floor(c);
    vec2 f = fract(c);
    guv = (cid + 0.5) * uCell / uCanvas;
    l = tone(lumAt(guv));
    float gi = floor(clamp(l, 0.0, 1.0) * (uGlyphs - 1.0) + 0.5 + (bayer8(cid) - 0.5) * 0.55 * uStrength);
    gi = clamp(gi, 0.0, uGlyphs - 1.0);
    float cov = texture2D(tGlyph, vec2((gi + f.x) / uGlyphs, f.y)).r;
    col = ramp(0.35 + 0.65 * clamp(l, 0.0, 1.2)) * cov + pal(0);
    col = mix(col, pal(uCount - 1), clamp((l - 1.0) * 2.0, 0.0, 1.0) * cov);
  } else {
    float s = 0.70710678;
    vec2 q = vec2(px.x + px.y, px.y - px.x) * s / uCell.x;
    vec2 cid = floor(q);
    vec2 ctr = cid + 0.5;
    vec2 cp = vec2(ctr.x - ctr.y, ctr.x + ctr.y) * s * uCell.x;
    guv = cp / uCanvas;
    l = tone(lumAt(guv));
    float r = sqrt(clamp(l, 0.0, 1.0)) * 0.78;
    float d = length(fract(q) - 0.5);
    float aa = 1.2 / uCell.x;
    float dotv = smoothstep(r + aa, r - aa, d) * step(0.02, l);
    col = ramp(0.45 + 0.55 * clamp(l, 0.0, 1.2)) * dotv + pal(0);
    col = mix(col, pal(uCount - 1), clamp((l - 1.0) * 2.0, 0.0, 1.0) * dotv);
  }

  // CRT dressing
  float scan = 1.0 - uScan * (0.5 + 0.5 * cos(px.y / uScanPeriod * 6.2831853));
  col *= scan;
  vec3 phos = ramp(0.62);
  col += phos * bloom(guv) * uGlow;
  vec2 v = (vUv - 0.5) * vec2(uCanvas.x / uCanvas.y, 1.0);
  col *= mix(1.0, smoothstep(1.35, 0.25, length(v)), uVignette);
  float band = exp(-pow((vUv.y - fract(uTime * 0.07)) * 9.0, 2.0));
  col *= 1.0 + 0.10 * band * uFlicker + uFlicker * 0.025 * sin(uTime * 53.0);
  gl_FragColor = vec4(col, 1.0);
}
`

function glyphAtlas(THREE, glyphs, gw, gh) {
  const canvas = document.createElement('canvas')
  canvas.width = glyphs.length * gw
  canvas.height = gh
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold ${Math.round(gh * 0.72)}px "JetBrains Mono", "IBM Plex Mono", Consolas, "Courier New", monospace`
  for (let i = 0; i < glyphs.length; i++) {
    if (glyphs[i] !== ' ') ctx.fillText(glyphs[i], i * gw + gw / 2, gh / 2 + gh * 0.04)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

export const MODES = { bayer: 0, ascii: 1, halftone: 2 }

export function createTreatmentPass(THREE, options = {}) {
  const {
    mode = 'bayer',
    palette = PHOSPHOR,
    cell = 3.4,                       // css px per dither pixel (bayer) / per dot (halftone: use ~6)
    glyphs = ' .:-=+*#%@',
    glyphCell = [7, 12],              // css px per glyph cell (ascii)
    sample = 2,                       // css px per low-res texel (halftone)
    bias = 0,
    contrast = 1.15,
    strength = 1,
    scan = 0.34,
    glow = 0.55,
    glowRadius = 0.03,
    vignette = 0.55,
    gap = 0.4,
    flicker = 1,
  } = options
  let currentMode = mode
  let cellSize = cell
  let cssW = 1
  let cssH = 1
  let dpr = 1
  const lowRT = new THREE.WebGLRenderTarget(4, 4, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,
    generateMipmaps: false,
    depthBuffer: true,
  })
  const atlas = glyphAtlas(THREE, glyphs, 32, 56)
  const uniforms = {
    tScene: { value: lowRT.texture },
    tGlyph: { value: atlas },
    uPalette: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
    uCount: { value: 5 },
    uMode: { value: MODES[mode] ?? 0 },
    uCanvas: { value: new THREE.Vector2(1, 1) },
    uGrid: { value: new THREE.Vector2(4, 4) },
    uCell: { value: new THREE.Vector2(3, 3) },
    uGlyphs: { value: glyphs.length },
    uBias: { value: bias },
    uContrast: { value: contrast },
    uStrength: { value: strength },
    uScan: { value: scan },
    uScanPeriod: { value: 3 },
    uGlow: { value: glow },
    uGlowR: { value: glowRadius },
    uVignette: { value: vignette },
    uGap: { value: gap },
    uTime: { value: 0 },
    uFlicker: { value: flicker },
  }
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const quadScene = new THREE.Scene()
  quadScene.add(quad)
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  function setPalette(colors) {
    const list = colors.slice(0, 8)
    list.forEach((c, i) => {
      const srgb = new THREE.Color(c).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
      uniforms.uPalette.value[i].set(srgb.r, srgb.g, srgb.b)
    })
    uniforms.uCount.value = list.length
  }
  setPalette(palette)

  function layout() {
    const bw = Math.max(1, Math.round(cssW * dpr))
    const bh = Math.max(1, Math.round(cssH * dpr))
    uniforms.uCanvas.value.set(bw, bh)
    let gw
    let gh
    if (currentMode === 'ascii') {
      const cols = Math.max(8, Math.round(cssW / glyphCell[0]))
      const rows = Math.max(4, Math.round(cssH / glyphCell[1]))
      gw = cols * 2
      gh = rows * 2
      uniforms.uCell.value.set(bw / cols, bh / rows)
      uniforms.uScanPeriod.value = Math.max(2, bh / rows / 3)
    } else if (currentMode === 'halftone') {
      gw = Math.max(8, Math.round(cssW / sample))
      gh = Math.max(8, Math.round(cssH / sample))
      uniforms.uCell.value.set(cellSize * dpr, cellSize * dpr)
      uniforms.uScanPeriod.value = Math.max(2, cellSize * dpr / 2)
    } else {
      gw = Math.max(8, Math.round(cssW / cellSize))
      gh = Math.max(8, Math.round(cssH / cellSize))
      uniforms.uCell.value.set(bw / gw, bh / gh)
      uniforms.uScanPeriod.value = Math.max(2, bh / gh)
    }
    lowRT.setSize(gw, gh)
    uniforms.uGrid.value.set(gw, gh)
  }

  function compose(renderer, target = null) {
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(target)
    if (target) renderer.clear()
    renderer.render(quadScene, quadCamera)
    renderer.setRenderTarget(prev)
  }

  return {
    lowRT,
    uniforms,
    get mode() { return currentMode },
    get width() { return lowRT.width },
    get height() { return lowRT.height },
    setPalette,
    /** css px per dither pixel (bayer) / dot (halftone); call before setSize or follow with setSize */
    setCell(next) {
      cellSize = Math.max(1.5, next)
      layout()
    },
    setMode(next) {
      if (!(next in MODES)) return
      currentMode = next
      uniforms.uMode.value = MODES[next]
      layout()
    },
    setSize(w, h, ratio = 1) {
      cssW = Math.max(1, w)
      cssH = Math.max(1, h)
      dpr = ratio
      layout()
    },
    compose,
    render(renderer, scene, camera, target = null) {
      const prev = renderer.getRenderTarget()
      renderer.setRenderTarget(lowRT)
      renderer.clear()
      renderer.render(scene, camera)
      renderer.setRenderTarget(prev)
      compose(renderer, target)
    },
    dispose() {
      lowRT.dispose()
      atlas.dispose()
      material.dispose()
      quad.geometry.dispose()
    },
  }
}

export const createAsciiPass = (THREE, options = {}) => createTreatmentPass(THREE, { ...options, mode: 'ascii' })
export const createHalftonePass = (THREE, options = {}) => createTreatmentPass(THREE, { cell: 6, ...options, mode: 'halftone' })
export const createPhosphorBayerPass = (THREE, options = {}) => createTreatmentPass(THREE, { ...options, mode: 'bayer' })
