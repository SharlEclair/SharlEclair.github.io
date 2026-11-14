/**
 * HDR post-processing for Transit Desert.
 *
 * The scene is rendered into a half-float target, so the burning frontier, the winning path's core, the
 * endpoint glows and the circuit can all carry values above display white. One bloom pass then turns
 * exactly those into light, and nothing else: the idle street network sits near 9 % and never reaches
 * the threshold, which is what keeps the glow concentrated on the leading edge.
 *
 *   RenderPass -> UnrealBloomPass (HDR threshold) -> grade (plum flash wash, vignette, dither) -> OutputPass
 *
 * The composer owns the final image: renderer tone mapping is applied once, by OutputPass, and no
 * material tone-maps or converts on its own. Every uniform written here derives from u_progress, so
 * the picture stays a pure function of scroll.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * A float target keeps NaN and Inf, and one such pixel is enough for the bloom blur to blank the whole
 * frame (measured: a single NaN from the circuit layer at u = 0.02 produced a black screen). This pass
 * sits between the scene and the bloom and makes every pixel finite and non-negative.
 */
const SanitizeShader = {
  name: 'TransitSanitize',
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // Comparisons with NaN are false, so anything that is not a finite positive number becomes 0.
      c.r = (c.r > 0.0 && c.r < 1000.0) ? c.r : (c.r >= 1000.0 ? 64.0 : 0.0);
      c.g = (c.g > 0.0 && c.g < 1000.0) ? c.g : (c.g >= 1000.0 ? 64.0 : 0.0);
      c.b = (c.b > 0.0 && c.b < 1000.0) ? c.b : (c.b >= 1000.0 ? 64.0 : 0.0);
      gl_FragColor = vec4(min(c, vec3(64.0)), 1.0);
    }
  `
};

const GradeShader = {
  name: 'TransitGrade',
  uniforms: {
    tDiffuse: { value: null },
    u_wash: { value: new THREE.Color('#2E0E24') },
    u_flash: { value: 0 },
    u_vignette: { value: 0.4 },
    u_focus: { value: new THREE.Vector2(0.5, 0.5) }
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
    uniform vec3 u_wash;
    uniform float u_flash;
    uniform float u_vignette;
    uniform vec2 u_focus;
    varying vec2 vUv;

    void main() {
      vec3 colour = texture2D(tDiffuse, vUv).rgb;

      // The completion flash: a deep plum atmospheric wash that lifts the whole frame for a moment,
      // a little stronger around the destination it radiates from. Added in linear HDR, before tone
      // mapping, so it brightens the dark sky without clipping what is already lit.
      float fromFocus = distance(vUv, u_focus);
      float falloff = mix(1.0, 0.55, smoothstep(0.0, 0.9, fromFocus));
      colour += u_wash * u_flash * falloff;

      // Vignette: the frame's edges fall away so the eye stays on the search.
      float edge = distance(vUv, vec2(0.5));
      colour *= 1.0 - u_vignette * smoothstep(0.35, 0.95, edge);

      // A static half-LSB dither. No clock: the pattern is a function of the pixel alone, and it is
      // what stops the wash and the vignette banding on an 8-bit display.
      float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      colour += (n - 0.5) / 255.0;

      gl_FragColor = vec4(max(colour, 0.0), 1.0);
    }
  `
};

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {typeof import('./config.js').config} config
 */
export function createPost(renderer, scene, camera, config) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // 4x MSAA on the HDR target: the scene is thin additive lines, which alias badly without it, and it
  // is far cheaper here than a post AA pass that would also soften the bloom's input.
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: renderer.capabilities.isWebGL2 ? 4 : 0
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(1); // sizes are passed in drawing-buffer pixels

  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    config.post.bloomStrength,
    config.post.bloomRadius,
    config.post.bloomThreshold
  );
  const grade = new ShaderPass(GradeShader);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(new ShaderPass(SanitizeShader));
  composer.addPass(bloom);
  composer.addPass(grade);
  composer.addPass(output);

  const applied = { wash: '' };

  return {
    composer,
    bloom,
    grade,
    setSize(width, height) {
      composer.setSize(width, height);
    },
    /**
     * @param {typeof config} next
     * @param {number} flash the completion flash envelope, 0..1
     * @param {{ x: number, y: number }|null} focus destination in 0..1 screen UV, or null
     */
    sync(next, flash, focus) {
      const p = next.post;
      bloom.strength = p.bloomStrength + p.flashBloom * flash;
      bloom.radius = p.bloomRadius;
      bloom.threshold = p.bloomThreshold;
      grade.uniforms.u_flash.value = flash * p.flashWash;
      grade.uniforms.u_vignette.value = p.vignette;
      if (focus) {
        grade.uniforms.u_focus.value.set(focus.x, focus.y);
      }
      if (applied.wash !== p.washColour) {
        grade.uniforms.u_wash.value.set(p.washColour);
        applied.wash = p.washColour;
      }
      renderer.toneMappingExposure = p.exposure;
    },
    render() {
      composer.render();
    },
    dispose() {
      composer.dispose();
      target.dispose();
    }
  };
}
