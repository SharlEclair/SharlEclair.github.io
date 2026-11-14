/**
 * Search-edge material: the roads the A* search actually examined, drawn as a BURNING PAPER EDGE.
 *
 * Each ribbon carries the road's own first-examination frame, and its temperature is a function of
 * `u_frame - aExam` alone, so the picture stays a pure function of the replay position:
 *
 *   not examined yet   collapsed outside the clip volume - the idle crimson network underneath is the
 *                      city's own Roads mesh, and lighting a road early would claim knowledge A* lacked
 *   just relaxed       incandescent white-yellow (#FFF6CC) at several times display white, so the HDR
 *                      bloom pass catches it: this is the advancing perimeter
 *   cooling            vivid gold (#FFB800), still above the bloom threshold for a few events
 *   visited            a dim, fine burnt-orange filigree (#7A2600) that stays behind as the record of
 *                      where the search has been, well under the bloom threshold
 *
 * The three bands are exponentials with different rates rather than a single mix, so the white-hot
 * band is thin, the gold band is a little wider, and the hot glow stays concentrated on the leading
 * edge exactly as the reference frames show. Additive blending into a half-float target; values above
 * 1.0 are deliberate.
 *
 * The winning route's own roads are NOT in this layer (the mesh builder skips edges flagged onPath).
 *
 * The ribbon is built in the vertex shader: two triangles between the segment's endpoints, widened
 * perpendicular to the projected road. Its half-width is in metres with a screen-space floor, so the
 * filigree stays a crisp ~2 px line from the 3 km birdseye instead of dissolving below a pixel.
 */
import * as THREE from 'three';

/**
 * @param {typeof import('../config.js').config} config the live singleton
 * @returns {{ material: THREE.ShaderMaterial, uniforms: Record<string, THREE.IUniform>,
 *            sync: (next: typeof config, frame: number, phase: object, framesPerEvent?: number) => void }}
 */
export function createSearchEdgeMaterial(config) {
  const uniforms = {
    u_frame: { value: 0 },
    u_hold: { value: 1 },
    u_edgeWidth: { value: config.search.edgeWidth },
    u_minPixels: { value: config.search.edgeMinPixels },
    u_viewportHeight: { value: 800 },
    u_trailAlpha: { value: config.search.trailAlpha },
    u_hotGain: { value: config.search.hotGain },
    u_goldGain: { value: config.search.goldGain },
    u_emberGain: { value: config.search.emberGain },
    u_dim: { value: 1 },
    u_hotColour: { value: new THREE.Color(config.search.coreColour) },
    u_goldColour: { value: new THREE.Color(config.search.colour) },
    u_emberColour: { value: new THREE.Color(config.search.emberColour) }
  };

  const material = new THREE.ShaderMaterial({
    name: 'SearchEdges',
    uniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aDirection;
      attribute float aSide;
      attribute vec2 aCornerVec;
      attribute float aExam;

      uniform float u_frame;
      uniform float u_edgeWidth;
      uniform float u_minPixels;
      uniform float u_viewportHeight;

      varying float vSide;
      varying float vAlong;
      varying float vExam;
      varying float vGrain;

      void main() {
        // Not examined yet: A* has not looked at this road at this frame.
        if (aExam < 0.0 || u_frame < aExam) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          vSide = 0.0;
          vAlong = 0.0;
          vExam = 0.0;
          vGrain = 0.0;
          return;
        }

        vec3 cameraCentre = (modelViewMatrix * vec4(position, 1.0)).xyz;
        vec3 cameraAlong = (modelViewMatrix * vec4(position + aDirection, 1.0)).xyz - cameraCentre;
        float lengthAlong = length(cameraAlong);
        vec2 axis = lengthAlong > 1e-4 ? cameraAlong.xy / lengthAlong : vec2(1.0, 0.0);
        vec2 perpendicular = vec2(-axis.y, axis.x);

        vec3 centre = cameraCentre + cameraAlong * aCornerVec.y;
        // Metres with a pixel floor (same construction as the frontier points).
        float metresPerPixel = 2.0 * length(centre) / (projectionMatrix[1][1] * u_viewportHeight);
        float halfWidth = max(u_edgeWidth, u_minPixels * metresPerPixel);
        gl_Position = projectionMatrix * vec4(centre.xy + perpendicular * aSide * halfWidth, centre.z, 1.0);

        vSide = aSide;
        vAlong = aCornerVec.y;
        vExam = aExam;
        // A stable per-road value: charred paper is uneven, so the ember filigree is too.
        vGrain = fract(sin(aExam * 12.9898 + dot(aDirection.xz, vec2(0.37, 0.71))) * 43758.5453);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float u_frame;
      uniform float u_hold;
      uniform float u_trailAlpha;
      uniform float u_hotGain;
      uniform float u_goldGain;
      uniform float u_emberGain;
      uniform float u_dim;
      uniform vec3 u_hotColour;
      uniform vec3 u_goldColour;
      uniform vec3 u_emberColour;

      varying float vSide;
      varying float vAlong;
      varying float vExam;
      varying float vGrain;

      void main() {
        // Age of this road in units of the hold window: 0 at the frontier, growing behind it.
        float t = max(u_frame - vExam, 0.0) / max(u_hold, 1e-4);

        // Three temperature bands. The white-hot one dies fastest, so only the newest edges carry it.
        float hot = exp(-t * 7.0);
        float gold = exp(-t * 1.9);
        float emberLevel = mix(0.55, 1.0, vGrain);

        vec3 colour = u_emberColour * u_emberGain * emberLevel
                    + u_goldColour * u_goldGain * gold
                    + u_hotColour * u_hotGain * hot;

        // A thin bright core with a soft shoulder: a line of fire, not a painted stripe.
        float across = 1.0 - abs(vSide);
        float profile = mix(across, across * across, 0.5);
        // The cooled filigree is finer than the burning edge.
        profile *= mix(0.8, 1.0, gold);

        gl_FragColor = vec4(colour * u_trailAlpha * profile * u_dim, 1.0);
        #include <colorspace_fragment>
      }
    `
  });

  // Colour is premultiplied in the shader (alpha fixed at 1), so plain ONE/ONE blending is the exact
  // additive sum and nothing depends on how a float target treats alpha above 1.
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneFactor;

  const applied = {};

  /**
   * @param {typeof config} next
   * @param {number} frame
   * @param {{ clear?: number }} phase
   * @param {number} framesPerEvent
   */
  function sync(next, frame, phase, framesPerEvent = 1) {
    const s = next.search;
    uniforms.u_frame.value = frame;
    uniforms.u_dim.value = 1 - (phase.clear ?? 0);
    uniforms.u_hold.value = Math.max(s.examineHoldEvents * framesPerEvent, 1);
    uniforms.u_edgeWidth.value = s.edgeWidth;
    uniforms.u_minPixels.value = s.edgeMinPixels;
    uniforms.u_viewportHeight.value = s.viewportHeight;
    uniforms.u_trailAlpha.value = s.trailAlpha;
    uniforms.u_hotGain.value = s.hotGain;
    uniforms.u_goldGain.value = s.goldGain;
    uniforms.u_emberGain.value = s.emberGain;
    if (applied.hot !== s.coreColour) {
      uniforms.u_hotColour.value.set(s.coreColour);
      applied.hot = s.coreColour;
    }
    if (applied.gold !== s.colour) {
      uniforms.u_goldColour.value.set(s.colour);
      applied.gold = s.colour;
    }
    if (applied.ember !== s.emberColour) {
      uniforms.u_emberColour.value.set(s.emberColour);
      applied.ember = s.emberColour;
    }
  }

  return { material, uniforms, sync };
}
