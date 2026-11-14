/**
 * Ground material - water, parks and the Albert Park circuit (docs/05 s6).
 *
 * ONE material for the whole ground, so the new layers cost exactly ONE draw call (docs/01 s3). Water,
 * park and circuit are separated by the per-vertex `aLayer` attribute the ETL baked, never by one
 * primitive per layer - the same rule docs/01 s3 sets for a network's two strips.
 *
 * The geometry arrives already triangulated from `scripts/bake_ground.py` (docs/02 s1): the browser is
 * a rendering engine, so this material only shades vertices, it never projects, clips or triangulates.
 *
 * LAYER HEIGHTS are baked, not uniforms: park y = 0.02, water y = 0.05, circuit y = 0.60. The circuit
 * sits ABOVE both road strips (0.25 / 0.50) so the venue is not buried by the streets it is made of, and
 * BELOW the route core (1.00) so the answer still rides on top of it.
 *
 * BLENDING is deliberately Normal, not additive. docs/05 s3 fakes glow by stacking additive layers, but
 * these are large ground PLANES: additive water over a bright city would blow the frame out to white
 * instead of reading as water. `depthWrite` is false so a ground plane can never occlude the search
 * layer or the route above it.
 */
import * as THREE from 'three';

/**
 * @param {typeof import('../config.js').config} config the live singleton
 * @returns {{ material: THREE.ShaderMaterial, uniforms: Record<string, THREE.IUniform>,
 *            sync: (next: typeof config) => void, setFade: (value: number) => void }}
 */
export function createGroundMaterial(config) {
  const uniforms = {
    u_landColour: { value: new THREE.Color(config.ground.landColor) },
    u_waterColour: { value: new THREE.Color(config.ground.waterColor) },
    u_circuitColour: { value: new THREE.Color(config.ground.circuitColor) },
    u_landAlpha: { value: config.ground.landAlpha },
    u_waterAlpha: { value: config.ground.waterAlpha },
    u_circuitAlpha: { value: config.ground.circuitAlpha },
    u_layerPark: { value: config.ground.layerPark },
    u_layerWater: { value: config.ground.layerWater },
    u_layerCircuit: { value: config.ground.layerCircuit },
    u_fade: { value: 1 }
  };

  const material = new THREE.ShaderMaterial({
    name: 'GroundLayers',
    uniforms,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    vertexShader: /* glsl */ `
      attribute float aLayer;

      varying float vLayer;
      varying vec3 vWorld;

      void main() {
        vLayer = aLayer;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 u_landColour;
      uniform vec3 u_waterColour;
      uniform vec3 u_circuitColour;
      uniform float u_landAlpha;
      uniform float u_waterAlpha;
      uniform float u_circuitAlpha;
      uniform float u_layerPark;
      uniform float u_layerWater;
      uniform float u_layerCircuit;
      uniform float u_fade;

      varying float vLayer;
      varying vec3 vWorld;

      void main() {
        // The layer ids are baked floats, so the bands are exact: a vertex carries 0.0, 1.0 or 2.0 and
        // can never fall between two of them. Written as steps rather than a branch to keep every
        // fragment on the same path. (half is a RESERVED WORD in GLSL - naming this variable that made
        // the whole fragment shader fail to compile, which renders as missing geometry, not as an error.
        // And no backticks in this comment: the GLSL lives in a template literal - trap G26.)
        float band = 0.5;
        float isPark = 1.0 - step(u_layerPark + band, vLayer);
        float isWater = step(u_layerWater - band, vLayer) * (1.0 - step(u_layerWater + band, vLayer));
        float isCircuit = step(u_layerCircuit - band, vLayer);

        vec3 colour = u_landColour * isPark + u_waterColour * isWater + u_circuitColour * isCircuit;
        float alpha = u_landAlpha * isPark + u_waterAlpha * isWater + u_circuitAlpha * isCircuit;

        // Distance falloff, matching the city's own aerial haze vocabulary: ground darkens as it recedes
        // so the far end of the corridor does not read as a flat painted sheet.
        float haze = 1.0 - smoothstep(1200.0, 5200.0, length(cameraPosition - vWorld));
        alpha *= mix(0.35, 1.0, haze);

        gl_FragColor = vec4(colour, alpha * u_fade);
        #include <colorspace_fragment>
      }
    `
  });

  const applied = {
    landColour: '',
    waterColour: '',
    circuitColour: '',
    landAlpha: Number.NaN,
    waterAlpha: Number.NaN,
    circuitAlpha: Number.NaN
  };

  /**
   * Push config into the uniforms; compared before assignment so a GUI drag allocates nothing.
   *
   * @param {typeof config} next
   */
  function sync(next) {
    const g = next.ground;
    if (applied.landColour !== g.landColor) {
      uniforms.u_landColour.value.set(g.landColor);
      applied.landColour = g.landColor;
    }
    if (applied.waterColour !== g.waterColor) {
      uniforms.u_waterColour.value.set(g.waterColor);
      applied.waterColour = g.waterColor;
    }
    if (applied.circuitColour !== g.circuitColor) {
      uniforms.u_circuitColour.value.set(g.circuitColor);
      applied.circuitColour = g.circuitColor;
    }
    if (applied.landAlpha !== g.landAlpha) {
      uniforms.u_landAlpha.value = g.landAlpha;
      applied.landAlpha = g.landAlpha;
    }
    if (applied.waterAlpha !== g.waterAlpha) {
      uniforms.u_waterAlpha.value = g.waterAlpha;
      applied.waterAlpha = g.waterAlpha;
    }
    if (applied.circuitAlpha !== g.circuitAlpha) {
      uniforms.u_circuitAlpha.value = g.circuitAlpha;
      applied.circuitAlpha = g.circuitAlpha;
    }
  }

  /**
   * The progress-driven fade. Separate from `sync` because it is not config-driven, and mirrored onto
   * `material.opacity` so an audit can read it back off the material exactly as it does for Buildings.
   *
   * @param {number} value
   */
  function setFade(value) {
    uniforms.u_fade.value = value;
    material.opacity = value;
  }

  return { material, uniforms, sync, setFade };
}
