/** Shared bits for the 'cubes' family of LCD scenes: seeded rng, a one-light shader (bright top, dark bevel line), pointer smoothing. */
export function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646 }

const VERT = /* glsl */`
varying vec3 vN; varying vec2 vUv;
void main(){
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`
const FRAG = /* glsl */`
precision highp float;
varying vec3 vN; varying vec2 vUv;
uniform float uEdge; uniform float uTone;
void main(){
  vec3 n = normalize(vN);
  float top = clamp(dot(n, normalize(vec3(0.45, 0.85, 0.5))), 0.0, 1.0);
  float lum = (0.2 + 0.76 * pow(top, 0.85)) * uTone;
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = 1.0 - smoothstep(0.0, 0.085, min(e.x, e.y));
  lum = mix(lum, 0.06, edge * uEdge);
  gl_FragColor = vec4(vec3(pow(clamp(lum, 0.0, 1.0), 2.2)), 1.0);
}`

export function litMaterial(THREE, { edge = 1, tone = 1 } = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uEdge: { value: edge }, uTone: { value: tone } } })
}

/** Smoothed pointer yaw/pitch: call follow(px, py, dt), read .yaw / .pitch. */
export function pointerFollow(ay = 0.5, ap = 0.3) {
  const s = { yaw: 0, pitch: 0, follow(px, py, dt) { const k = 1 - Math.exp(-5 * dt); s.yaw += (px * ay - s.yaw) * k; s.pitch += (py * ap - s.pitch) * k } }
  return s
}
