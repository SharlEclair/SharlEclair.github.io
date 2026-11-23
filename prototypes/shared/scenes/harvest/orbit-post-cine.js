/**
 * Cinematic post stack for the Harvest orbit-3d dark tier. Hand written, three core only.
 *
 *   const post = createCinePost(THREE)
 *   post.render(renderer, scene, camera, target, { time, p, ...overrides })
 *
 * Passes (fixed count): scene -> HDR target (4x MSAA) | bright pass to half res | blur H, blur V at half res |
 * blur H (downsample), blur V at quarter res | composite (bloom add, exposure, ACES filmic, split-tone grade, vignette, grain,
 * a tiny roll) into `target` (a WebGLRenderTarget or null for the canvas).
 * The HDR target holds linear values: ShaderMaterials that include colorspace_fragment write linear into a render target, so the
 * composite owns the tone curve and the final colour space (colorspace_fragment, which follows whatever `target` is).
 */
const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const BRIGHT = /* glsl */ `
precision highp float;
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr; uniform float uKnee;
varying vec2 vUv;
vec3 tap(vec2 o) { return min(texture2D(tSrc, vUv + o * uTexel).rgb, vec3(12.0)); }
void main() {
  vec3 c = 0.25 * (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0)));
  float br = max(max(c.r, c.g), c.b);
  float soft = clamp(br - uThr + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, br - uThr) / max(br, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}`

const BLUR = /* glsl */ `
precision highp float;
uniform sampler2D tSrc; uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
  c += (texture2D(tSrc, vUv + uDir * 1.3846154).rgb + texture2D(tSrc, vUv - uDir * 1.3846154).rgb) * 0.3162162;
  c += (texture2D(tSrc, vUv + uDir * 3.2307692).rgb + texture2D(tSrc, vUv - uDir * 3.2307692).rgb) * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`

const COMPOSITE = /* glsl */ `
precision highp float;
uniform sampler2D tScene; uniform sampler2D tB1; uniform sampler2D tB2;
uniform float uAspect; uniform float uTime; uniform float uExposure; uniform float uBloom; uniform float uRoll;
uniform float uGrain; uniform float uVig;
varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 c) {
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c = IN * (c / 0.6);
  c = RRTAndODTFit(c);
  return clamp(OUT * c, 0.0, 1.0);
}
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 q = vUv - 0.5;
  q.x *= uAspect;
  float cr = cos(uRoll), sr = sin(uRoll);
  q = vec2(cr * q.x - sr * q.y, sr * q.x + cr * q.y);
  q.x /= uAspect;
  vec2 uv = clamp(q + 0.5, 0.001, 0.999);
  vec3 c = texture2D(tScene, uv).rgb;
  vec3 b = texture2D(tB1, uv).rgb * 0.6 + texture2D(tB2, uv).rgb * 0.9;
  c += b * uBloom;
  c = aces(c * uExposure);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c * vec3(0.97, 1.0, 1.05), c * vec3(1.03, 1.0, 0.965), smoothstep(0.08, 0.55, l));
  c = mix(vec3(l), c, 1.04);
  vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
  float vig = smoothstep(0.42, 1.2, length(v * vec2(0.9, 1.0)));
  c *= 1.0 - uVig * vig;
  float n = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) + hash(gl_FragCoord.yx * 1.37 + fract(uTime * 3.17) * 71.0) - 1.0;
  c *= 1.0 + n * uGrain * (1.0 - 0.5 * l);
  gl_FragColor = vec4(max(c, 0.0), 1.0);
  #include <colorspace_fragment>
}`

export function createCinePost(THREE) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2))
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mesh = new THREE.Mesh(geo)
  mesh.frustumCulled = false
  const quadScene = new THREE.Scene()
  quadScene.add(mesh)

  const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false })
  const mBright = mk(BRIGHT, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 0.9 }, uKnee: { value: 0.4 } })
  const mBlur = mk(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } })
  const mComp = mk(COMPOSITE, {
    tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, uAspect: { value: 1 }, uTime: { value: 0 },
    uExposure: { value: 1.15 }, uBloom: { value: 0.5 }, uRoll: { value: 0 }, uGrain: { value: 0.035 }, uVig: { value: 0.42 },
  })

  const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }
  const hdr = new THREE.WebGLRenderTarget(2, 2, { ...rtOpts, depthBuffer: true, samples: 4 })
  const hA = new THREE.WebGLRenderTarget(2, 2, rtOpts), hB = new THREE.WebGLRenderTarget(2, 2, rtOpts)
  const qA = new THREE.WebGLRenderTarget(2, 2, rtOpts), qB = new THREE.WebGLRenderTarget(2, 2, rtOpts)
  const targets = [hdr, hA, hB, qA, qB]
  const sz = new THREE.Vector2()
  let W = 0, H = 0

  function fit(w, h) {
    if (w === W && h === H) return
    W = w; H = h
    hdr.setSize(w, h)
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1), qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2)
    hA.setSize(hw, hh); hB.setSize(hw, hh); qA.setSize(qw, qh); qB.setSize(qw, qh)
  }

  function pass(rend, mat, out) {
    mesh.material = mat
    rend.setRenderTarget(out)
    rend.render(quadScene, cam)
  }

  /** opts: { time, p, roll, exposure, bloom, thr, grain, vig } */
  function render(rend, scene, camera, target, opts = {}) {
    rend.getDrawingBufferSize(sz)
    const w = Math.max(2, target ? target.width : sz.x), h = Math.max(2, target ? target.height : sz.y)
    fit(w, h)

    const prevAuto = rend.autoClear
    rend.autoClear = true
    rend.setRenderTarget(hdr)
    rend.render(scene, camera)

    mBright.uniforms.tSrc.value = hdr.texture
    mBright.uniforms.uTexel.value.set(1 / w, 1 / h)
    if (opts.thr != null) mBright.uniforms.uThr.value = opts.thr
    pass(rend, mBright, hA)
    mBlur.uniforms.tSrc.value = hA.texture
    mBlur.uniforms.uDir.value.set(1.5 / hA.width, 0); pass(rend, mBlur, hB)
    mBlur.uniforms.tSrc.value = hB.texture
    mBlur.uniforms.uDir.value.set(0, 1.5 / hA.height); pass(rend, mBlur, hA)
    mBlur.uniforms.tSrc.value = hA.texture
    mBlur.uniforms.uDir.value.set(2.0 / qA.width, 0); pass(rend, mBlur, qA)
    mBlur.uniforms.tSrc.value = qA.texture
    mBlur.uniforms.uDir.value.set(0, 2.0 / qA.height); pass(rend, mBlur, qB)

    const u = mComp.uniforms
    u.tScene.value = hdr.texture; u.tB1.value = hA.texture; u.tB2.value = qB.texture
    u.uAspect.value = w / h
    u.uTime.value = opts.time ?? 0
    u.uRoll.value = opts.roll ?? 0
    if (opts.exposure != null) u.uExposure.value = opts.exposure
    if (opts.bloom != null) u.uBloom.value = opts.bloom
    if (opts.grain != null) u.uGrain.value = opts.grain
    if (opts.vig != null) u.uVig.value = opts.vig
    pass(rend, mComp, target ?? null)
    rend.autoClear = prevAuto
  }

  function dispose() {
    for (const t of targets) t.dispose()
    for (const m of [mBright, mBlur, mComp]) m.dispose()
    geo.dispose()
  }

  return { render, dispose, uniforms: mComp.uniforms }
}
