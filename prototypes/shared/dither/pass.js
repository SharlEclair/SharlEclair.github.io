/**
 * Ordered-dither post pass. Renders any THREE scene at a LOW resolution, then maps its luminance through an 8x8
 * Bayer matrix onto a small palette (dark -> light). Same pass serves the gameboy LCD (4 greens, 160x144) and a
 * full-bleed 1-bit/2-colour look.
 *
 *   const pass = createDitherPass(THREE, { width: 160, height: 144, palette: LCD_PALETTES.dmg })
 *   const screen = createScreenTarget(THREE, 160, 144)       // texture for the gameboy screen mesh
 *   pass.render(renderer, scene, camera, screen)             // or pass.render(renderer, scene, camera) -> canvas
 *
 * Palette order is DARK -> LIGHT, 2 to 8 entries (hex strings, sRGB). Resolution of the dither grid is
 * width x height (use pass.setSize(w, h) to follow a canvas: e.g. canvas/3 for chunky pixels).
 * Scenes should be lit for contrast: the pass thresholds luminance, so keep the subject bright on a dark ground.
 */
export const LCD_PALETTES = {
  dmg: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],          // classic green
  pocket: ['#1b1d16', '#4b5444', '#8a967c', '#c4cfa9'],        // grey-green, calmer
  night: ['#06100a', '#1d3b2a', '#4f8f67', '#b9ffd0'],          // phosphor on black (matches the hero hands)
  amber: ['#120700', '#4a1d00', '#c25a00', '#ffc766'],
  mono: ['#000000', '#ffffff'],
  // dark ink on light grey-cream. Listed dark -> light like the rest; scenes that want "ink on paper" (subject dark,
  // ground light) reverse it, see INK_PALETTES / paletteColors below.
  ink: ['#1d1c1a', '#5a5852', '#a8a597', '#e7e3d6'],
  ember: ['#140a06', '#4a2312', '#b4571c', '#ffbd62'], // dark brown to warm amber
  ice: ['#071423', '#1f4766', '#5fa3c9', '#bfe9f7'], // deep navy to pale ice blue
  berry: ['#1a0716', '#5a1a4c', '#c04a8e', '#ffc2e2'], // plum to pink
}
/** Palettes whose ground is the LIGHT end: scenes (bright subject on black) get the colour order reversed. */
export const INK_PALETTES = new Set(['ink'])
export function paletteColors(name) {
  const list = Array.isArray(name) ? name : LCD_PALETTES[name] ?? LCD_PALETTES.dmg
  return !Array.isArray(name) && INK_PALETTES.has(name) ? [...list].reverse() : list
}


const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`
const FRAG = /* glsl */`
precision highp float;
uniform sampler2D tScene;
uniform vec3 uPalette[8];
uniform int uCount;
uniform float uBias;
uniform float uContrast;
uniform float uStrength;   // 0 = plain posterise, 1 = full dither
uniform vec2 uGrid;        // dither grid size in pixels (== low-res target size)
varying vec2 vUv;

// 8x8 Bayer via bit interleave: returns 0..1
float bayer8(vec2 p) {
  ivec2 q = ivec2(mod(floor(p), 8.0));
  int x = q.x; int y = q.y ^ q.x;
  int v = ((y & 1) << 5) | ((x & 1) << 4) | ((y & 2) << 2) | ((x & 2) << 1) | ((y & 4) >> 1) | ((x & 4) >> 2);
  return (float(v) + 0.5) / 64.0;
}
vec3 pick(int i) {
  vec3 c = uPalette[0];
  for (int k = 0; k < 8; k++) { if (k == i) c = uPalette[k]; }
  return c;
}
void main() {
  vec3 col = texture2D(tScene, vUv).rgb;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  lum = pow(clamp(lum, 0.0, 1.0), 1.0 / 2.2);
  lum = clamp((lum - 0.5) * uContrast + 0.5 + uBias, 0.0, 1.0);
  float n = float(uCount - 1);
  float thr = mix(0.5, bayer8(vUv * uGrid), uStrength);
  int idx = int(clamp(floor(lum * n + thr), 0.0, n));
  gl_FragColor = vec4(pick(idx), 1.0);
}
`

/** Render target for a mesh texture: nearest-filtered, tagged sRGB so the palette colours come out exact. */
export function createScreenTarget(THREE, width = 160, height = 144) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: false,
  })
  target.texture.colorSpace = THREE.SRGBColorSpace
  return target
}

export function createDitherPass(THREE, options = {}) {
  const { width = 160, height = 144, palette = LCD_PALETTES.dmg, bias = 0, contrast = 1.15, strength = 1 } = options
  let w = width
  let h = height
  const lowRT = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    type: THREE.HalfFloatType,
    generateMipmaps: false,
    depthBuffer: true,
  })
  const uniforms = {
    tScene: { value: lowRT.texture },
    uPalette: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
    uCount: { value: 4 },
    uBias: { value: bias },
    uContrast: { value: contrast },
    uStrength: { value: strength },
    uGrid: { value: new THREE.Vector2(w, h) },
  }
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const quadScene = new THREE.Scene()
  quadScene.add(quad)
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  function setPalette(colors) {
    // Raw sRGB bytes: the shader writes them straight to an sRGB-tagged target or the canvas.
    const list = colors.slice(0, 8)
    list.forEach((c, i) => {
      const col = new THREE.Color(c)
      const srgb = col.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
      uniforms.uPalette.value[i].set(srgb.r, srgb.g, srgb.b)
    })
    uniforms.uCount.value = list.length
  }
  setPalette(palette)

  return {
    lowRT,
    uniforms,
    get width() { return w },
    get height() { return h },
    setPalette,
    setSize(nw, nh) {
      w = Math.max(1, Math.round(nw))
      h = Math.max(1, Math.round(nh))
      lowRT.setSize(w, h)
      uniforms.uGrid.value.set(w, h)
    },
    /** Render `scene` low-res, dither it, and write the result to `target` (null = the canvas). */
    render(renderer, scene, camera, target = null) {
      const prev = renderer.getRenderTarget()
      renderer.setRenderTarget(lowRT)
      renderer.clear()
      renderer.render(scene, camera)
      renderer.setRenderTarget(target)
      if (target) renderer.clear()
      renderer.render(quadScene, quadCamera)
      renderer.setRenderTarget(prev)
    },
    dispose() {
      lowRT.dispose()
      material.dispose()
      quad.geometry.dispose()
    },
  }
}
