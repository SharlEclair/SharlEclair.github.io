/**
 * Harvest orbit-3d: the photographic Earth (dark theme only). Loaded lazily by orbit-earth.js.
 *
 *   createPhotoEarth(THREE, { renderer, U, PRE, END, VERT, group, sphereGeo, shellMesh, own })
 *     -> { update(dark), dispose }
 *
 * Textures (public/textures/earth): day colour, night lights, and one packed map
 * (R = height, G = land mask / roughness, B = clouds). While they load, or if loading fails, the procedural
 * Earth stays on screen; once ready a photo sphere fades in over it, with a separate cloud sphere above it
 * and a thin Rayleigh atmosphere shell replacing the stripe shell.
 * Fetches per fragment: surface 6 (+4 inside the lens only), clouds 2.
 */

const FRAG_COMMON = /* glsl */`
uniform sampler2D tDay, tNight, tBC;
uniform float uFade;
uniform vec3 uSunCol;
varying vec3 vNW;
varying vec3 vPW;
vec2 gUx, gUy;
vec4 tx(sampler2D t, vec2 uv){ return textureGrad(t, uv, gUx, gUy); }
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.875; }
// cloud density at a local-space direction (drift along longitude)
float cloudDens(vec3 nlp){
  vec2 uv = eqUv(nlp);
  uv.x += uTime * 0.00045;
  float b = tx(tBC, uv).b;
  float w = fbm(nlp * 64.0 + vec3(0.0, uTime * 0.004, 0.0));
  return smoothstep(0.3, 0.92, b + (w - 0.5) * 0.5);
}
// sun colour after the atmosphere: red at grazing angles
vec3 sunTint(float nL){ return mix(vec3(1.0, 0.34, 0.1), uSunCol, smoothstep(-0.02, 0.5, nL)); }
void setGrads(vec3 nl){
  vec2 uv = eqUv(nl);
  gUx = dFdx(uv); gUy = dFdy(uv);
  gUx.x -= floor(gUx.x + 0.5); gUy.x -= floor(gUy.x + 0.5);
}
`

const EARTH = (PRE, END) => PRE + FRAG_COMMON + /* glsl */`
void main(){
  vec3 n = normalize(vNW);
  gDx = dFdx(n); gDy = dFdy(n);
  vec3 V = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(cameraPosition - vPW);
  float ndv = max(dot(n, V), 0.0);
  vec3 nl = uToLocal * n;
  setGrads(nl);
  vec2 uv = eqUv(nl);
  vec3 ll = uToLocal * uSun;
  vec3 east = normalize(vec3(nl.z, 0.0, -nl.x) + vec3(1e-4, 0.0, 0.0));
  vec3 north = cross(nl, east);
  float nL = dot(nl, ll);

  vec4 bc = tx(tBC, uv);
  float land = smoothstep(0.3, 0.7, bc.g);
  // relief: forward differences of the height channel plus a fine procedural layer
  float cl = max(sqrt(max(1.0 - nl.y * nl.y, 0.0)), 0.12);
  float hx = tx(tBC, uv + vec2(1.5 / 4096.0, 0.0)).r - bc.r;
  float hy = tx(tBC, uv + vec2(0.0, 1.5 / 2048.0)).r - bc.r;
  vec2 gr = vec2(hx / (0.0023 * cl), hy / 0.0023);
  float dn = fbm(nl * 150.0);
  vec2 fine = vec2(vnoise(nl * 240.0 + 3.1), vnoise(nl * 240.0 + 9.7)) - 0.5;
  gr += fine * 0.9 * (0.35 + bc.r);
  vec3 nb = normalize(nl - 0.011 * (gr.x * east + gr.y * north) * land);
  float nbL = dot(nb, ll);
  float d = pow(clamp((nbL + 0.07) / 1.07, 0.0, 1.0), 0.92);
  vec3 stint = sunTint(nL);

  // albedo with a subtle high frequency breakup on land
  vec3 alb = tx(tDay, uv).rgb;
  alb = mix(vec3(dot(alb, vec3(0.3, 0.55, 0.15))), alb, 0.8);
  alb *= mix(1.0, 0.8 + 0.4 * dn, land * 0.7);
  // cloud shadow: the cloud above the point toward the sun
  vec3 sh = ll - nl * nL;
  float cs = cloudDens(normalize(nl + sh * 0.007 / max(nL, 0.12)));
  float dayAmt = smoothstep(-0.1, 0.15, nL);
  vec3 base = alb * (1.0 - 0.7 * cs * dayAmt);
  vec3 col = base * stint * d * 1.9;

  // ocean: Fresnel sky reflection and a roughness driven sun glint
  float ocean = 1.0 - land;
  vec3 H = normalize(uSun + V);
  float NH = max(dot(n, H), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  float a = mix(0.07, 0.16, smoothstep(0.0, 0.6, 1.0 - ndv));
  float a2 = a * a;
  float den = NH * NH * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * den * den);
  float NLg = max(nL, 0.0);
  col += uSunCol * min(D * 0.07, 3.0) * (0.3 + 3.0 * F) * NLg * ocean * (1.0 - cs * 0.9);
  col += vec3(0.1, 0.26, 0.7) * F * 0.9 * smoothstep(-0.05, 0.4, nL) * ocean;

  // dark side: faint skylight and warm city lights, kept out of the lens
  col += base * vec3(0.35, 0.5, 1.0) * 0.02 * (1.0 - dayAmt) * (0.4 + 0.6 * ndv);
  vec2 lq, dxq, dyq; float vis;
  lensCoords(n, lq, dxq, dyq, vis);
  float lm = vis > 0.5 ? smoothstep(1.0, 2.4, length(lq)) : 1.0;
  float cd = cloudDens(nl);
  vec3 lights = tx(tNight, uv).rgb;
  col += lights * vec3(1.0, 0.6, 0.28) * 2.4 * (1.0 - smoothstep(-0.14, 0.03, nL)) * (1.0 - cd * 0.75) * lm;

  // twilight band
  col += vec3(0.5, 0.2, 0.28) * 0.07 * exp(-pow(nL / 0.09, 2.0)) * (0.35 + 0.65 * land) * (1.0 - cd * 0.5);

  // aerial perspective and horizon glow
  float fr = 1.0 - ndv;
  float sunSide = smoothstep(-0.4, 0.35, nL);
  float ter = exp(-pow((nL - 0.02) / 0.3, 2.0));
  vec3 hazeCol = mix(vec3(0.17, 0.4, 1.0), vec3(1.0, 0.52, 0.24), ter * 0.7);
  float aer = 1.0 - exp(-2.4 * pow(fr, 2.3));
  col = mix(col, hazeCol * (0.05 + 0.75 * sunSide), aer * 0.62);
  col += hazeCol * pow(fr, 6.0) * (0.05 + 1.4 * sunSide) * 0.9;

  col = mix(col, cThread, trackMask(n));
  col = applyLens(col, n);
  gl_FragColor = vec4(col, uFade);
` + END + `}`

const CLOUD = (PRE, END) => PRE + FRAG_COMMON + /* glsl */`
void main(){
  vec3 n = normalize(vNW);
  gDx = dFdx(n); gDy = dFdy(n);
  vec3 V = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(cameraPosition - vPW);
  float ndv = max(dot(n, V), 0.0);
  vec3 nl = uToLocal * n;
  setGrads(nl);
  vec3 ll = uToLocal * uSun;
  float nL = dot(nl, ll);
  float dens = cloudDens(nl);
  if (dens < 0.004) discard;
  // self shadow: denser cloud on the sun side darkens this texel
  vec3 sh = ll - nl * nL;
  float ds = cloudDens(normalize(nl + sh * 0.0035));
  float shade = clamp(ds - dens * 0.55, 0.0, 1.0);
  float d = pow(clamp((nL + 0.1) / 1.1, 0.0, 1.0), 0.85);
  vec3 col = sunTint(nL) * d * 2.0 * (1.0 - 0.55 * shade) * vec3(0.97, 0.98, 1.0);
  col += vec3(0.4, 0.5, 0.8) * 0.018;
  float fr = 1.0 - ndv;
  float sunSide = smoothstep(-0.3, 0.3, nL);
  col += vec3(0.5, 0.65, 1.0) * pow(fr, 3.0) * 0.5 * sunSide;      // limb brightening
  float alpha = dens * 0.8 * (1.0 + 0.5 * pow(fr, 2.0));
  alpha *= mix(0.55, 1.0, sunSide);
  // keep the lens and the ground track clear
  vec2 lq, dxq, dyq; float vis;
  lensCoords(n, lq, dxq, dyq, vis);
  float hole = vis > 0.5 ? (1.0 - smoothstep(1.05, 1.6, length(lq))) * smoothstep(0.0, 0.3, uIris) : 0.0;
  alpha *= (1.0 - hole) * (1.0 - clamp(trackMask(n) * 1.5, 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * uFade);
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
const SHELL = /* glsl */`
uniform float uOrtho, uShell, uFade;
uniform vec3 uSun;
varying vec3 vNW;
varying vec3 vPW;
void main(){
  vec3 n = normalize(vNW);
  vec3 V = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(cameraPosition - vPW);
  float nd = abs(dot(n, V));
  float rho = uShell * sqrt(max(1.0 - nd * nd, 0.0));
  float h = clamp((rho - 1.0) / (uShell - 1.0), 0.0, 1.0);
  if (rho < 0.999) discard;
  float I = pow(1.0 - h, 2.8);
  vec3 ln = normalize(vec3(n.xy, 0.0) + n * 0.3);
  float sd = dot(ln, uSun);
  float sunSide = smoothstep(-0.45, 0.4, sd);
  float ter = exp(-pow((sd - 0.02) / 0.3, 2.0));
  vec3 c = mix(vec3(0.1, 0.32, 1.0), vec3(1.0, 0.5, 0.2), ter * 0.7);
  c = mix(c, vec3(0.65, 0.82, 1.0), pow(1.0 - h, 9.0) * 0.45);
  gl_FragColor = vec4(c * I * (0.04 + sunSide) * 1.5 * uFade, 1.0);
` + '  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}'

export function createPhotoEarth(THREE, { renderer, U, PRE, END, VERT, group, sphereGeo, cloudGeo, sphereMesh, shellMesh, own }) {
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/'
  const dir = base + 'textures/earth/'
  const aniso = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8
  let dead = false, started = false, ready = false, fadeT0 = -1
  const tex = []
  const loader = new THREE.TextureLoader()
  const load = (file, srgb) => new Promise((res, rej) => {
    loader.load(dir + file, (t) => {
      if (dead) { t.dispose(); return rej(new Error('disposed')) }
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.anisotropy = aniso
      t.generateMipmaps = true
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.magFilter = THREE.LinearFilter
      t.wrapS = THREE.RepeatWrapping
      t.wrapT = THREE.ClampToEdgeWrapping
      t.needsUpdate = true
      tex.push(t)
      res(t)
    }, undefined, rej)
  })

  const PU = {
    ...U,
    tDay: { value: null }, tNight: { value: null }, tBC: { value: null },
    uFade: { value: 0 }, uSunCol: { value: new THREE.Color('#fff1d8') },
  }
  let photoMesh = null, cloudMesh = null, photoShell = null, origShell = shellMesh ? shellMesh.material : null

  const build = ([day, night, bc]) => {
    PU.tDay.value = day; PU.tNight.value = night; PU.tBC.value = bc
    const mk = (fs, vs, extra) => own(new THREE.ShaderMaterial({ uniforms: PU, vertexShader: vs, fragmentShader: fs, ...extra }))
    photoMesh = new THREE.Mesh(sphereGeo, mk(EARTH(PRE, END), VERT, { transparent: true }))
    photoMesh.frustumCulled = false
    photoMesh.renderOrder = 1
    photoMesh.onBeforeRender = sphereMesh.onBeforeRender
    group.add(photoMesh)
    cloudMesh = new THREE.Mesh(cloudGeo, mk(CLOUD(PRE, END), VERT, { transparent: true, depthWrite: false }))
    cloudMesh.frustumCulled = false
    cloudMesh.renderOrder = 11
    group.add(cloudMesh)
    photoShell = mk(SHELL, SHELL_VERT, { side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    ready = true
  }

  const start = () => {
    if (started) return
    started = true
    Promise.all([load('earth_day_4096.jpg', true), load('earth_night_4096.jpg', true), load('earth_bump_roughness_clouds_4096.jpg', false)])
      .then((t) => { if (!dead) { build(t) } })
      .catch((e) => {  })
  }

  const update = (dark) => {
    if (dark) start()
    const on = ready && dark
    if (on && fadeT0 < 0) fadeT0 = performance.now()
    const f = on ? Math.min(1, (performance.now() - fadeT0) / 900) : 0
    PU.uFade.value = f
    if (ready) {
      photoMesh.visible = on
      cloudMesh.visible = on
      photoMesh.material.transparent = f < 1
      sphereMesh.visible = !(on && f >= 1)
      if (shellMesh) shellMesh.material = on ? photoShell : origShell
    }
    if (!on) fadeT0 = -1
  }

  const dispose = () => {
    dead = true
    for (const t of tex) t.dispose()
    tex.length = 0
    photoMesh?.removeFromParent(); cloudMesh?.removeFromParent()
    if (shellMesh && origShell) shellMesh.material = origShell
  }

  return { update, dispose }
}
