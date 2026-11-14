// HDR post-processing for F1 x Currents.
//
//   RenderPass -> UnrealBloomPass -> grade (aberration, vignette, grain) -> OutputPass
//
// The scene renders into a half-float target, so the additive line field can
// stack past display white and the focal band can carry an HDR gain. Bloom turns
// that into light; the grade pass adds the lens: a little radial chromatic
// aberration toward the corners, a vignette that pulls the room dark around the
// car, and fine grain so the dark gradients never band.
//
// The composer owns the final image. Renderer tone mapping (Neutral, chosen in
// renderer.js because it preserves the red band's saturation) is applied once,
// by OutputPass.
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { LOOK } from '../look.js'

const GradeShader = {
  name: 'F1Grade',
  uniforms: {
    tDiffuse: { value: null },
    u_time: { value: 0 },
    u_vignette: { value: LOOK.vignette },
    u_aberration: { value: LOOK.aberration },
    u_grain: { value: LOOK.grain },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float u_time;
    uniform float u_vignette;
    uniform float u_aberration;
    uniform float u_grain;
    varying vec2 vUv;

    void main() {
      vec2 fromCentre = vUv - 0.5;
      float edge = length(fromCentre);

      // Radial chromatic aberration: zero at the centre, growing toward the corners.
      vec2 shift = fromCentre * edge * u_aberration * 4.0;
      vec3 colour = vec3(
        texture2D(tDiffuse, vUv + shift).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - shift).b
      );
      // Not finite or negative -> 0, so one bad pixel cannot poison the frame.
      colour = vec3(
        colour.r > 0.0 ? min(colour.r, 64.0) : 0.0,
        colour.g > 0.0 ? min(colour.g, 64.0) : 0.0,
        colour.b > 0.0 ? min(colour.b, 64.0) : 0.0
      );

      colour *= 1.0 - u_vignette * smoothstep(0.3, 0.92, edge);

      float n = fract(sin(dot(gl_FragCoord.xy + fract(u_time) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
      colour += (n - 0.5) * u_grain * (0.35 + colour);

      gl_FragColor = vec4(max(colour, 0.0), 1.0);
    }
  `,
}

export function createPost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4,
  })
  const composer = new EffectComposer(renderer, target)
  composer.setPixelRatio(1)

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), LOOK.bloomStrength, LOOK.bloomRadius, LOOK.bloomThreshold)
  const grade = new ShaderPass(GradeShader)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(bloom)
  composer.addPass(grade)
  composer.addPass(new OutputPass())

  return {
    composer,
    bloom,
    grade,
    setSize(width, height) {
      composer.setSize(width, height)
    },
    render(elapsed, animateGrain = true) {
      grade.uniforms.u_time.value = animateGrain ? elapsed : 0
      composer.render()
    },
    dispose() {
      composer.dispose()
      target.dispose()
    },
  }
}
