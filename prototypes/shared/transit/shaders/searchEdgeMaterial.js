/**
 * Search-edge material (docs/11): the roads the A* search actually examined, as thin ribbons over the
 * city, in a single draw call.
 *
 * Each ribbon carries the road's own first-examination frame, and the state is a function of
 * `u_frame - aExam`:
 *
 *   not examined yet   collapsed outside the clip volume. The subdued network the search happens
 *                      INSIDE is the city's own `Roads` mesh, which is already on screen - this layer
 *                      never redraws it, and lighting a road before the trace examined it would claim
 *                      knowledge the algorithm did not have
 *   being examined now brightest, for `examineHoldEvents` events - "A* is checking these roads now"
 *   explored           a dimmer persistent trail easing to `settledFade`, so the examined region
 *                      accumulates behind the frontier
 *
 * The winning route's own roads are NOT in this layer: the mesh builder skips every edge flagged
 * `onPath`, because the winner is the amber `APath` and a violet search ribbon over it would paint the
 * answer as if it were still being searched.
 *
 * HOW THE RIBBON IS BUILT, AND WHY INSIDE THE SHADER
 * The geometry is two triangles between the road's endpoints, with `aCornerVec.y` selecting which end a
 * vertex sits on and `aCornerVec.x` which side of the road. The shader turns the world-space direction
 * into a camera-space offset perpendicular to the projected road, so the ribbon is a true ground
 * ribbon seen from above rather than a screen-space thick line, and it keeps its width in metres -
 * which means it attenuates with distance exactly the way the roads under it do.
 */
import * as THREE from 'three';

/**
 * Build the search-edge material.
 *
 * @param {typeof import('../config.js').config} config the live singleton
 * @returns {{ material: THREE.ShaderMaterial, uniforms: Record<string, THREE.IUniform>,
 *            sync: (next: typeof config, frame: number, phase: object) => void }}
 */
export function createSearchEdgeMaterial(config) {
  const uniforms = {
    u_frame: { value: 0 },
    u_hold: { value: 1 },
    u_edgeWidth: { value: config.search.edgeWidth },
    u_trailAlpha: { value: config.search.trailAlpha },
    u_settledFade: { value: config.search.settledFade },
    u_dim: { value: 1 },
    u_colour: { value: new THREE.Color(config.search.colour) }
  };

  const material = new THREE.ShaderMaterial({
    name: 'SearchEdges',
    uniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // Same measured reason as the node points: the city is invisible from mid-flight on but still
    // writes depth, so the search layer is drawn over the map rather than inside it.
    depthTest: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      // position is the road's start or end, and aDirection is the road's full vector. Both are the
      // standard/plain attributes, so three.js computes the geometry's bounds from position.
      attribute vec3 aDirection;
      attribute float aSide;
      attribute vec2 aCornerVec;
      attribute float aExam;

      uniform float u_frame;
      uniform float u_edgeWidth;

      varying float vSide;
      varying float vAlong;
      varying float vExam;

      void main() {
        // Not examined yet: A* has not looked at this road at this frame.
        if (aExam < 0.0 || u_frame < aExam) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          vSide = 0.0;
          vAlong = 0.0;
          vExam = 0.0;
          return;
        }

        // The road's tangent, projected into camera space; the ribbon's width is perpendicular to it.
        vec3 cameraCentre = (modelViewMatrix * vec4(position, 1.0)).xyz;
        vec3 cameraAlong = (modelViewMatrix * vec4(position + aDirection, 1.0)).xyz - cameraCentre;
        float lengthAlong = length(cameraAlong);
        // A degenerate road (two nodes at the same coordinate) has no direction to be perpendicular
        // to; the fallback keeps the arithmetic finite instead of turning the quad into NaN.
        vec2 axis = lengthAlong > 1e-4 ? cameraAlong.xy / lengthAlong : vec2(1.0, 0.0);
        vec2 perpendicular = vec2(-axis.y, axis.x);

        // aCornerVec.y is 0 at the road's start and 1 at its end: that is what makes ONE quad span the
        // road rather than a billboard sitting on it.
        vec3 centre = cameraCentre + cameraAlong * aCornerVec.y;
        vec2 offset = perpendicular * aSide * u_edgeWidth;
        gl_Position = projectionMatrix * vec4(centre.xy + offset, centre.z, 1.0);

        vSide = aSide;
        vAlong = aCornerVec.y;
        vExam = aExam;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float u_frame;
      uniform float u_hold;
      uniform float u_trailAlpha;
      uniform float u_settledFade;
      uniform float u_dim;
      uniform vec3 u_colour;

      varying float vSide;
      varying float vAlong;
      varying float vExam;

      void main() {
        // How long ago A* examined this road, in frames. The state is a function of that alone, which is
        // what makes the picture a pure function of the replay position (docs/07 s1).
        float delta = u_frame - vExam;
        float t = clamp(delta / max(u_hold, 1e-4), 0.0, 1.0);
        float alpha = u_trailAlpha * (1.0 + (u_settledFade - 1.0) * t);

        // Soften both long edges so a road reads as a glow rather than a hard stripe - the same
        // cross-fade the route's own ribbon uses.
        float crossFade = 1.0 - abs(vSide);
        // Soften the ends too, so a road whose neighbour has not been examined yet does not stop on a
        // hard square.
        float endFade = 0.55 + 0.45 * (1.0 - abs(2.0 * vAlong - 1.0));

        gl_FragColor = vec4(u_colour, alpha * crossFade * endFade * u_dim);
        #include <colorspace_fragment>
      }
    `
  });

  const applied = {
    hold: Number.NaN,
    edgeWidth: Number.NaN,
    trailAlpha: Number.NaN,
    settledFade: Number.NaN,
    dim: Number.NaN,
    colour: ''
  };

  /**
   * Push config + frame + phase into the uniforms.
   *
   * @param {typeof config} next
   * @param {number} frame
   * @param {{ final: boolean }} phase
   * @param {number} framesPerEvent
   */
  function sync(next, frame, phase, framesPerEvent = 1) {
    uniforms.u_frame.value = frame;
    const dim = phase.final ? next.search.settleFactor : 1;
    if (applied.dim !== dim) {
      uniforms.u_dim.value = dim;
      applied.dim = dim;
    }
    const hold = Math.max(next.search.examineHoldEvents * framesPerEvent, 1);
    if (applied.hold !== hold) {
      uniforms.u_hold.value = hold;
      applied.hold = hold;
    }
    if (applied.edgeWidth !== next.search.edgeWidth) {
      uniforms.u_edgeWidth.value = next.search.edgeWidth;
      applied.edgeWidth = next.search.edgeWidth;
    }
    if (applied.trailAlpha !== next.search.trailAlpha) {
      uniforms.u_trailAlpha.value = next.search.trailAlpha;
      applied.trailAlpha = next.search.trailAlpha;
    }
    if (applied.settledFade !== next.search.settledFade) {
      uniforms.u_settledFade.value = next.search.settledFade;
      applied.settledFade = next.search.settledFade;
    }
    if (applied.colour !== next.search.colour) {
      uniforms.u_colour.value.set(next.search.colour);
      applied.colour = next.search.colour;
    }
  }

  return { material, uniforms, sync };
}
