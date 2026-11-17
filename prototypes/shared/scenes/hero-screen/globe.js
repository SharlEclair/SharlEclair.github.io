/**
 * 'globe': a data sphere that starts as a bare lat/long wireframe and fills in as solid, lit landmasses while you
 * scroll. Loose data points drift around it and settle, one by one, onto a neat orbit ring. Pointer tilts the globe.
 */
import { createScreenScene, smooth, lerp, ease } from './base.js'

const VERT = /* glsl */`
varying vec3 vObj; varying vec3 vN; varying vec3 vVN;
void main(){
  vObj = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vVN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`
const FRAG = /* glsl */`
precision highp float;
varying vec3 vObj; varying vec3 vN; varying vec3 vVN;
uniform float uFill;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float gridLine(float a){ float w = fwidth(a); return 1.0 - smoothstep(0.0, 1.0, (abs(fract(a - 0.5) - 0.5)) / max(w, 1e-4) - 0.55); }
void main(){
  vec3 o = normalize(vObj);
  float lon = atan(o.z, o.x) / 6.2831853 * 16.0;
  float lat = asin(clamp(o.y, -1.0, 1.0)) / 3.14159265 * 12.0;
  float g = max(gridLine(lon) * smoothstep(0.985, 0.93, abs(o.y)), gridLine(lat));
  float f = sin(2.1 * o.x + 1.3 * sin(2.7 * o.y + 0.5)) + sin(2.4 * o.y + 1.1 * sin(1.9 * o.z + 1.0)) + sin(1.8 * o.z + 0.9 * sin(2.3 * o.x + 2.0));
  float land = smoothstep(0.3, 0.42, f);
  float diff = clamp(dot(normalize(vN), normalize(vec3(-0.55, 0.5, 0.75))), 0.0, 1.0);
  float rim = pow(1.0 - clamp(vVN.z, 0.0, 1.0), 2.2);
  float lit = smoothstep(0.3, 0.55, diff);
  float solid = mix(mix(0.08, 0.36, lit), mix(0.5, 1.0, lit), land);
  float wire = g * 0.82 + land * 0.2 * diff;
  float lum = mix(wire, max(solid * (1.0 - g * 0.5), g * 0.4 * (1.0 - land)), uFill);
  lum = max(lum, rim * mix(0.75, 0.45, uFill));
  gl_FragColor = vec4(vec3(pow(clamp(lum, 0.0, 1.0), 2.2)), 1.0);
}`

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646 }
const N = 12

export async function createScene({ THREE, size, look = 'lcd', palette = 'dmg' } = {}) {
  return createScreenScene({
    THREE, size, look, palette, reducedAt: 0.9, contrast: 1.25,
    build({ THREE, lcd }) {
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
      camera.position.set(0, 0, 9.4)
      const globeMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uFill: { value: 0 } } })
      const globeGeo = new THREE.SphereGeometry(1.45, 48, 32)
      const globe = new THREE.Mesh(globeGeo, globeMat)
      const tilt = new THREE.Group()
      tilt.add(globe)
      scene.add(tilt)

      const ringGeo = new THREE.TorusGeometry(2.05, 0.04, 5, 96)
      const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(Math.pow(0.75, 2.2)) })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = Math.PI / 2
      const ringTilt = new THREE.Group()
      ringTilt.rotation.set(0.38, 0, -0.42)
      ringTilt.add(ring)
      scene.add(ringTilt)

      const dotGeo = new THREE.SphereGeometry(0.15, 10, 8)
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
      const R = rng(11)
      const dots = []
      for (let i = 0; i < N; i++) {
        const mesh = new THREE.Mesh(dotGeo, dotMat)
        scene.add(mesh)
        const a = R() * 6.28, b = (R() - 0.5) * 2.4
        const rad = 2.4 + R() * 1.4
        dots.push({
          mesh, i, delay: (i / N) * 0.5 + R() * 0.1,
          chaos: new THREE.Vector3(Math.cos(a) * rad * 0.9, b * 1.1, Math.sin(a) * rad * 0.5),
          phase: R() * 6.28, s: 0.7 + R() * 0.8,
        })
      }
      const tmp = new THREE.Vector3(), ringPos = new THREE.Vector3()
      let tx = 0, ty = 0
      return {
        scene, camera,
        resize(a) { camera.aspect = a; camera.updateProjectionMatrix() },
        update({ p, time, px, py, dt, aspect }) {
          const k = 1 - Math.exp(-5 * dt)
          tx += (px * 0.35 - tx) * k
          ty += (py * 0.25 - ty) * k
          tilt.rotation.set(0.32 + ty * -0.6, 0, 0.2)
          globe.rotation.y = time * 0.28 + tx * 1.4 + p * 1.2
          globeMat.uniforms.uFill.value = smooth(0.05, 0.75, p)
          ringTilt.rotation.y = tx * 0.4
          const ang0 = time * 0.35
          for (const d of dots) {
            const t = ease(Math.min(1, Math.max(0, (p * 1.3 - d.delay) / 0.55)))
            const wob = 1 - t
            const a = (d.i / N) * 6.2832 + ang0
            ringPos.set(Math.cos(a) * 2.05, 0, Math.sin(a) * 2.05)
            ringPos.applyEuler(ringTilt.rotation)
            tmp.copy(d.chaos)
            tmp.x += Math.sin(time * 0.5 * d.s + d.phase) * 0.45
            tmp.y += Math.cos(time * 0.4 * d.s + d.phase) * 0.35
            d.mesh.position.copy(tmp).lerp(ringPos, t)
            d.mesh.scale.setScalar(lerp(0.8 + (d.i % 3) * 0.28, 1, t))
          }
        },
        dispose() { globeGeo.dispose(); globeMat.dispose(); ringGeo.dispose(); ringMat.dispose(); dotGeo.dispose(); dotMat.dispose() },
      }
    },
  })
}
