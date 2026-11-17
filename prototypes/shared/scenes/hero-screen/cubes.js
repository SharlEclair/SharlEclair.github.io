/**
 * 'cubes': a swarm of tumbling blocks of different sizes drifts across the screen, then, left to right as you scroll,
 * each one finds its slot and the swarm locks into a 3x3x3 cube that turns slowly. Messy to ordered.
 */
import { createScreenScene, smooth, lerp, ease } from './base.js'

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
uniform float uEdge;
void main(){
  vec3 n = normalize(vN);
  float top = clamp(dot(n, normalize(vec3(0.45, 0.85, 0.5))), 0.0, 1.0);
  float lum = 0.24 + 0.72 * pow(top, 0.85);
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = 1.0 - smoothstep(0.0, 0.085, min(e.x, e.y));
  lum = mix(lum, 0.06, edge * uEdge); // dark bevel line keeps neighbouring cubes apart
  gl_FragColor = vec4(vec3(pow(clamp(lum, 0.0, 1.0), 2.2)), 1.0);
}`

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646 }

export async function createScene({ THREE, size, look = 'lcd', palette = 'dmg' } = {}) {
  return createScreenScene({
    THREE, size, look, palette, reducedAt: 0.9, contrast: 1.3,
    build({ THREE, lcd }) {
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
      camera.position.set(0, 0, 11.5)
      const geo = new THREE.BoxGeometry(1, 1, 1)
      const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uEdge: { value: 1 } } })
      const group = new THREE.Group()
      scene.add(group)
      const R = rng(7)
      const items = []
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        const mesh = new THREE.Mesh(geo, material)
        group.add(mesh)
        const side = (x + 1) / 2 // 0 left .. 1 right
        items.push({
          mesh,
          grid: new THREE.Vector3(x, y, z),
          chaos: new THREE.Vector3((R() * 2 - 1) * 3.6, (R() * 2 - 1) * 2.2, (R() * 2 - 1) * 1.6),
          axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(),
          spin: 0.4 + R() * 0.9, ang0: R() * 6.28, size: 0.34 + R() * 0.55, phase: R() * 6.28,
          delay: side * 0.35 + R() * 0.12,
        })
      }
      const q = new THREE.Quaternion(), tmp = new THREE.Vector3()
      let aspect = 1, yaw = 0, pitch = 0
      return {
        scene, camera,
        resize(a) { aspect = a; camera.aspect = a; camera.updateProjectionMatrix() },
        update({ p, time, px, py, dt }) {
          const k = 1 - Math.exp(-5 * dt)
          yaw += (px * 0.5 - yaw) * k
          pitch += (py * 0.3 - pitch) * k
          const spread = Math.max(1, aspect * 0.85)
          const gate = Math.min(1, p * 1.18)
          for (const it of items) {
            const t = ease(Math.min(1, Math.max(0, (gate - it.delay) / 0.55)))
            const wob = 1 - t
            // chaos: drift + bob; order: grid slot
            tmp.set(
              it.chaos.x * spread + Math.sin(time * 0.35 + it.phase) * 0.5,
              it.chaos.y + Math.cos(time * 0.42 + it.phase * 1.3) * 0.4,
              it.chaos.z + Math.sin(time * 0.3 + it.phase * 0.7) * 0.3,
            ).multiplyScalar(wob)
            it.mesh.position.copy(it.grid).multiplyScalar(1.02).multiplyScalar(t).add(tmp)
            q.setFromAxisAngle(it.axis, (it.ang0 + time * it.spin) * wob)
            it.mesh.quaternion.copy(q)
            const slot = lerp(0.84, 0.995, smooth(0.8, 1, p))
            it.mesh.scale.setScalar(lerp(it.size, slot, t))
          }
          group.rotation.set(0.5 + pitch, time * 0.32 + yaw + 0.5, 0)
          group.rotation.y = 0.55 + time * 0.28 + yaw
          material.uniforms.uEdge.value = 1
        },
        dispose() { geo.dispose(); material.dispose() },
      }
    },
  })
}
