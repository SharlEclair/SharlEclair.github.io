/**
 * 'ribbons': parallel signal lines run down the screen and part around a chrome bead. Above the bead the lines are
 * ruler-straight (ordered); below it they tangle. Scroll lowers the bead, so the tidy region grows with it.
 * Pointer slides the bead sideways.
 */
import { createScreenScene, smooth, ease, lerp } from './base.js'

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform float uAspect, uTime, uP, uRows, uPix;
uniform vec3 uBead; // x, y, radius

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
void main(){
  vec2 q = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0);
  vec2 c = uBead.xy; float R = uBead.z;
  vec2 d = q - c; float r = length(d);

  // messy below the bead, ordered above it
  float m = smoothstep(c.y + 0.02, c.y - 0.75, q.y);
  float n1 = noise(vec2(q.x * 2.2, q.y * 2.6 - uTime * 0.35));
  float n2 = noise(vec2(q.x * 4.0 + 7.0, q.y * 4.5 + uTime * 0.25));
  float wob = (n1 - 0.5) * 2.6 + (n2 - 0.5) * 1.2;

  // lines bend away from the bead
  float push = R * 1.35 * exp(-r * r / (2.0 * R * R * 1.6));
  float bend = sign(d.x) * push * smoothstep(-R * 1.2, R * 0.2, d.y + R * 0.9) ;
  float u = (q.x - c.x - bend) * uRows + m * wob * 0.95;

  float cell = abs(fract(u) - 0.5);
  float aa = uPix * uRows * 1.2;
  float width = 0.22;
  float line = 1.0 - smoothstep(width - aa, width + aa, cell);

  // the centre line is the bright feed above the bead
  float cu = abs((q.x - c.x) * uRows);
  float feed = (1.0 - smoothstep(0.34 - aa, 0.34 + aa, cu)) * step(c.y, q.y) * (1.0 - m);
  float ln = max(line * mix(1.0, 0.88, m), feed);
  ln *= mix(0.8, 1.0, smoothstep(-1.0, 0.7, q.y));
  ln *= smoothstep(R * 1.0, R * 1.22, r); // dark halo around the bead

  // chrome bead
  float inside = 1.0 - smoothstep(R - uPix * 1.2, R, r);
  vec3 nrm = vec3(d / R, sqrt(max(0.0, 1.0 - dot(d, d) / (R * R))));
  float diff = clamp(dot(nrm, normalize(vec3(-0.5, 0.65, 0.6))), 0.0, 1.0);
  vec3 refl = reflect(vec3(0.0, 0.0, -1.0), nrm);
  float sky = smoothstep(-0.25, 0.35, refl.y + 0.18 * sin(refl.x * 4.0));
  float spec = pow(clamp(dot(refl, normalize(vec3(-0.5, 0.65, 0.6))), 0.0, 1.0), 24.0);
  float bead = clamp(0.04 + 0.42 * diff * diff + 0.5 * sky * (0.4 + 0.6 * diff) + 1.2 * spec, 0.0, 1.0);
  float rim = smoothstep(R - uPix * 2.5, R, r) * 0.22;
  bead = clamp(bead - rim * 0.5, 0.0, 1.0);

  float lum = mix(ln, bead, inside);
  gl_FragColor = vec4(vec3(pow(lum, 2.2)), 1.0);
}
`

export async function createScene({ THREE, size, look = 'lcd', palette = 'dmg' } = {}) {
  return createScreenScene({
    THREE, size, look, palette, reducedAt: 0.55, contrast: 1.2,
    build({ THREE, lcd }) {
      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
      const uniforms = {
        uAspect: { value: 1 }, uTime: { value: 0 }, uP: { value: 0 }, uRows: { value: lcd ? 8 : 9 },
        uPix: { value: lcd ? 2 / 144 : 2 / 240 }, uBead: { value: new THREE.Vector3(0, 0.5, 0.4) },
      }
      const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false })
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
      quad.frustumCulled = false
      scene.add(quad)
      let bx = 0
      return {
        scene, camera,
        resize(aspect) { uniforms.uAspect.value = aspect },
        update({ p, time, px, py, dt, aspect }) {
          uniforms.uTime.value = time
          uniforms.uP.value = p
          bx += (px * 0.35 * aspect * 0.5 - bx) * (1 - Math.exp(-5 * dt))
          const by = lerp(0.52, -0.12, ease(p)) + Math.sin(time * 0.9) * 0.025 + py * 0.05
          uniforms.uBead.value.set(bx + Math.sin(time * 0.5) * 0.02, by, 0.4)
        },
        dispose() { material.dispose(); quad.geometry.dispose() },
      }
    },
  })
}
