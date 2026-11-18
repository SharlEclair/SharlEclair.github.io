/**
 * 'dice': a handful of pipped dice tumble through the dark, then bounce and settle into a neat 4x3 grid.
 */
import { createScreenScene, smooth, ease } from './base.js'
import { rng, pointerFollow } from './lit.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const VERT = /* glsl */`
varying vec3 vN; varying vec3 vP; varying vec3 vO;
void main(){
  vP = position; vO = normal;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`
const FRAG = /* glsl */`
precision highp float;
varying vec3 vN; varying vec3 vP; varying vec3 vO;
float dot2(vec2 uv, vec2 c){ return 1.0 - smoothstep(0.1, 0.135, length(uv - c)); }
float pips(vec2 uv, int v){
  float m = 0.0;
  if (v == 1 || v == 3 || v == 5) m = max(m, dot2(uv, vec2(0.5)));
  if (v >= 2) { m = max(m, dot2(uv, vec2(0.27, 0.27))); m = max(m, dot2(uv, vec2(0.73, 0.73))); }
  if (v >= 4) { m = max(m, dot2(uv, vec2(0.27, 0.73))); m = max(m, dot2(uv, vec2(0.73, 0.27))); }
  if (v == 6) { m = max(m, dot2(uv, vec2(0.27, 0.5))); m = max(m, dot2(uv, vec2(0.73, 0.5))); }
  return m;
}
void main(){
  vec3 n = normalize(vN);
  float top = clamp(dot(n, normalize(vec3(0.45, 0.85, 0.5))), 0.0, 1.0);
  float lum = 0.26 + 0.7 * pow(top, 0.85);
  vec3 a = abs(vP); vec2 uv; int v;
  if (a.x >= a.y && a.x >= a.z) { uv = vP.yz + 0.5; v = vP.x > 0.0 ? 1 : 6; }
  else if (a.y >= a.z) { uv = vP.xz + 0.5; v = vP.y > 0.0 ? 2 : 5; }
  else { uv = vP.xy + 0.5; v = vP.z > 0.0 ? 3 : 4; }
  lum = mix(lum, 0.05, pips(uv, v));
  gl_FragColor = vec4(vec3(pow(clamp(lum, 0.0, 1.0), 2.2)), 1.0);
}`

export async function createScene({ THREE, size, look = 'lcd', palette = 'dmg' } = {}) {
  return createScreenScene({
    THREE, size, look, palette, reducedAt: 0.9, contrast: 1.3,
    build({ THREE }) {
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
      camera.position.set(0, 0, 9.6)
      const geo = new RoundedBoxGeometry(1, 1, 1, 3, 0.12)
      const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG })
      const group = new THREE.Group()
      scene.add(group)
      const R = rng(5)
      const COLS = 4, ROWS = 3, S = 1.08
      const items = []
      const quarter = () => Math.floor(R() * 4) * Math.PI / 2
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const mesh = new THREE.Mesh(geo, material)
        mesh.scale.setScalar(0.98)
        group.add(mesh)
        items.push({
          mesh,
          slot: new THREE.Vector3((c - (COLS - 1) / 2) * S, ((ROWS - 1) / 2 - r) * S, 0),
          chaos: new THREE.Vector3((R() * 2 - 1) * 3.4, (R() * 2 - 1) * 2.2, (R() * 2 - 1) * 1.8),
          axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(),
          spin: 0.6 + R() * 1.0, ang0: R() * 6.28,
          fin: new THREE.Quaternion().setFromEuler(new THREE.Euler(quarter(), quarter(), quarter())),
          delay: R() * 0.3 + c * 0.05,
        })
      }
      const qa = new THREE.Quaternion()
      const ptr = pointerFollow(0.5, 0.3)
      let aspect = 1
      return {
        scene, camera,
        resize(a) { aspect = a; camera.aspect = a; camera.updateProjectionMatrix() },
        update({ p, time, px, py, dt }) {
          ptr.follow(px, py, dt)
          const spread = Math.max(1, aspect * 0.85)
          const gate = Math.min(1, p * 1.18)
          for (const it of items) {
            const t = Math.min(1, Math.max(0, (gate - it.delay) / 0.55))
            const w = 1 - ease(t)
            const hop = (1 - t) * Math.abs(Math.sin(t * 11)) * 0.7 * smooth(0.0, 0.2, t)
            it.mesh.position.set(
              it.slot.x + (it.chaos.x * spread + Math.sin(time * 0.4 + it.ang0) * 0.4) * w,
              it.slot.y + (it.chaos.y + Math.cos(time * 0.5 + it.ang0) * 0.3) * w + hop,
              it.chaos.z * w,
            )
            qa.setFromAxisAngle(it.axis, it.ang0 + time * it.spin)
            it.mesh.quaternion.slerpQuaternions(qa, it.fin, smooth(0.35, 0.95, t))
          }
          group.rotation.set(0.35 + ptr.pitch, Math.sin(time * 0.3) * 0.3 + ptr.yaw, 0)
        },
        dispose() { geo.dispose(); material.dispose() },
      }
    },
  })
}
