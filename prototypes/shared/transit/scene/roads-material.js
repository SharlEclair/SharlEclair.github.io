/**
 * Roads material (docs/08 Step 3, docs/05 §3).
 *
 * The street network is baked as ONE TRIS mesh carrying both glow strips (HANDOFF.md §7 D1), so a
 * single `ShaderMaterial` keeps the whole network at one draw call (docs/01 §3). `Roads` carries no
 * UVs by design - the two strips differ by baked geometry height - so the shader keys the strip off
 * `position.y`:
 *
 *   y = 0.25  16 m glow strip  -> wide, low-alpha amber bloom
 *   y = 0.50   6 m core strip  -> narrow, dim amber hairline
 *
 * Blending: `AdditiveBlending` + `transparent: true` per docs/05 §3, and `blending` is what carries
 * the "no bloom pass" glow contract. `depthWrite` stays at its default `true`: with additive blending
 * an overlap can only add brightness, so letting the depth buffer keep the front-most fragment is
 * free attenuation for the 17.02% of the glow region that distinct streets cover >= 2x (mean
 * multiplicity 1.193, max 14x - docs/09 §4). The low `glowAlpha` is the shader-side blow-out
 * control the user authorized; the depth buffer is what stops that 17% from stacking.
 */
import * as THREE from 'three';

/** Baked strip heights. Only used as shader constants; they are ETL facts, not tunables. */
export const ROAD_GLOW_Y = 0.25;
export const ROAD_CORE_Y = 0.5;

/** Midpoint between the two strip heights: the vertex-shader strip selector's threshold. */
export const ROAD_STRIP_SPLIT_Y = (ROAD_GLOW_Y + ROAD_CORE_Y) / 2;

/**
 * @param {typeof import('../config.js').config} config the live singleton
 * @returns {{ material: THREE.ShaderMaterial, uniforms: Record<string, THREE.IUniform>,
 *            sync: (next: typeof config) => void }}
 */
export function createRoadsMaterial(config) {
  const uniforms = {
    u_streetColor: { value: new THREE.Color(config.roads.color) },
    u_glowColor: { value: new THREE.Color(config.roads.glowColor) },
    u_glowAlpha: { value: config.roads.glowAlpha },
    u_coreOpacity: { value: config.roads.coreOpacity },
    u_splitY: { value: ROAD_STRIP_SPLIT_Y }
  };

  const material = new THREE.ShaderMaterial({
    name: 'RoadsLayeredGlow',
    uniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: true,
    vertexShader: /* glsl */ `
      uniform float u_splitY;

      varying float vStrip; // 0.0 = 16 m glow at y = 0.25, 1.0 = 6 m core at y = 0.50

      void main() {
        // Roads have no UVs (docs/02 payload): the strip is a baked height. Read it as a smooth
        // ramp so the two strips cannot alias into each other if the threshold is ever re-tuned.
        vStrip = smoothstep(u_splitY - 0.05, u_splitY + 0.05, position.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 u_streetColor;
      uniform vec3 u_glowColor;
      uniform float u_glowAlpha;
      uniform float u_coreOpacity;

      varying float vStrip;

      void main() {
        // 0.0 on the glow strip -> 1.0 on the core strip.
        float strip = smoothstep(0.35, 0.65, vStrip);

        // docs/05 §3 layer 2 (glow): wide, amber, low alpha.
        float glow = (1.0 - strip) * u_glowAlpha;
        // docs/05 §3 layer 1 (core): narrow, dim amber, effectively opaque so it masks the glow
        // underneath it and cannot itself double-blend where two streets cross.
        float core = strip * u_coreOpacity;

        float alpha = clamp(glow + core, 0.0, 1.0);
        vec3 colour = mix(u_glowColor, u_streetColor, strip);

        gl_FragColor = vec4(colour * alpha, alpha);
        #include <colorspace_fragment>
      }
    `
  });

  const applied = {
    streetColor: '',
    glowColor: '',
    glowAlpha: Number.NaN,
    coreOpacity: Number.NaN
  };

  /**
   * Push config into the uniforms. Strings are compared before `.set()` so a GUI drag or a CDP
   * preset injection still allocates nothing per frame.
   *
   * @param {typeof config} next
   */
  function sync(next) {
    if (applied.streetColor !== next.roads.color) {
      uniforms.u_streetColor.value.set(next.roads.color);
      applied.streetColor = next.roads.color;
    }
    if (applied.glowColor !== next.roads.glowColor) {
      uniforms.u_glowColor.value.set(next.roads.glowColor);
      applied.glowColor = next.roads.glowColor;
    }
    if (applied.glowAlpha !== next.roads.glowAlpha) {
      uniforms.u_glowAlpha.value = next.roads.glowAlpha;
      applied.glowAlpha = next.roads.glowAlpha;
    }
    if (applied.coreOpacity !== next.roads.coreOpacity) {
      uniforms.u_coreOpacity.value = next.roads.coreOpacity;
      applied.coreOpacity = next.roads.coreOpacity;
    }
  }

  return { material, uniforms, sync };
}
