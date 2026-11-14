/**
 * Path-revision material (docs/11): the moments A* found a CHEAPER way to a node it had already
 * discovered.
 *
 * WHY THIS IS ITS OWN LAYER
 * "A* is not simply walking forward - it maintains and improves tentative solutions" is one of the
 * algorithm's most characteristic behaviours, and it is the one thing a static route drawing cannot
 * show at all. The trace records 148 of these revisions; the audit report has always carried them,
 * but a report is not a picture. This material makes each one visible: the connection that was just
 * improved flashes brighter than an ordinary examined road, and fades back into the explored network.
 *
 * The extra draw call is deliberate and disclosed (docs/11 §8): one call for the revision layer, on
 * top of the roads and the points. It is 148 quads - 5.5 % of the search layer's geometry.
 *
 * SHAPE: identical to `SearchEdges` (a rectangle between two nodes, built in camera space from the
 * live projection matrix), so the two layers line up exactly. Only the colour and the timing differ -
 * which is what makes a revision read as "this connection just got better" rather than "a road exists".
 */
import * as THREE from 'three';

/**
 * Build the path-revision material.
 *
 * @param {typeof import('../config.js').config} config the live singleton
 * @returns {{ material: THREE.ShaderMaterial, uniforms: Record<string, THREE.IUniform>,
 *            sync: (next: typeof config, frame: number, framesPerEvent: number) => void }}
 */
export function createRevisionMaterial(config) {
  const uniforms = {
    u_frame: { value: 0 },
    u_edgeWidth: { value: config.search.edgeWidth },
    u_revisionHold: { value: config.search.revisionHoldEvents },
    u_revisionAlpha: { value: config.search.revisionAlpha },
    u_revisionFadeEvents: { value: config.search.revisionFadeEvents },
    u_dim: { value: 1 },
    u_colour: { value: new THREE.Color(config.search.revisionColour) }
  };

  const material = new THREE.ShaderMaterial({
    name: 'SearchRevisions',
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
      uniform float u_revisionHold;
      uniform float u_revisionFadeEvents;

      varying float vSide;
      varying float vAlong;
      varying float vExam;

      void main() {
        // A revision is not in the future and not already gone: before its frame it does not exist,
        // and after its whole window it is the ordinary explored road's job to keep the corridor lit.
        if (aExam < 0.0 || u_frame < aExam || u_frame > aExam + u_revisionHold * u_revisionFadeEvents) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          vSide = 0.0;
          vAlong = 0.0;
          vExam = 0.0;
          return;
        }

        vec3 cameraCentre = (modelViewMatrix * vec4(position, 1.0)).xyz;
        vec3 cameraAlong = (modelViewMatrix * vec4(position + aDirection, 1.0)).xyz - cameraCentre;
        float lengthAlong = length(cameraAlong);
        vec2 axis = lengthAlong > 1e-4 ? cameraAlong.xy / lengthAlong : vec2(1.0, 0.0);
        vec2 perpendicular = vec2(-axis.y, axis.x);

        vec3 centre = cameraCentre + cameraAlong * aCornerVec.y;
        // A revision beam is wider than the road it replaces, so it reads as an event rather than as a
        // slightly brighter stretch of the same ribbon.
        vec2 offset = perpendicular * aSide * u_edgeWidth * 1.6;
        gl_Position = projectionMatrix * vec4(centre.xy + offset, centre.z, 1.0);

        vSide = aSide;
        vAlong = aCornerVec.y;
        vExam = aExam;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float u_frame;
      uniform float u_revisionHold;
      uniform float u_revisionAlpha;
      uniform float u_revisionFadeEvents;
      uniform float u_dim;
      uniform vec3 u_colour;

      varying float vSide;
      varying float vAlong;
      varying float vExam;

      void main() {
        // Flat at full strength through the hold, then a smooth ease out over the fade window.
        float delta = u_frame - vExam;
        float hold = max(u_revisionHold, 1.0);
        float fade = max(u_revisionFadeEvents, 1.0);
        float t = clamp((delta - hold) / fade, 0.0, 1.0);
        float envelope = 1.0 - t * t * (3.0 - 2.0 * t);

        float crossFade = 1.0 - abs(vSide);
        float endFade = 0.55 + 0.45 * (1.0 - abs(2.0 * vAlong - 1.0));
        gl_FragColor = vec4(u_colour, u_revisionAlpha * envelope * crossFade * endFade * u_dim);
        #include <colorspace_fragment>
      }
    `
  });

  const applied = {
    hold: Number.NaN,
    edgeWidth: Number.NaN,
    revisionAlpha: Number.NaN,
    fadeEvents: Number.NaN,
    dim: Number.NaN,
    colour: ''
  };

  /**
   * Push config + frame into the uniforms.
   *
   * @param {typeof config} next
   * @param {number} frame
   * @param {number} framesPerEvent
   * @param {{ final: boolean }} phase
   */
  function sync(next, frame, framesPerEvent, phase) {
    uniforms.u_frame.value = frame;
    const dim = phase.final ? next.search.settleFactor : 1;
    if (applied.dim !== dim) {
      uniforms.u_dim.value = dim;
      applied.dim = dim;
    }
    const hold = Math.max(next.search.revisionHoldEvents * framesPerEvent, 1);
    if (applied.hold !== hold) {
      uniforms.u_revisionHold.value = hold;
      applied.hold = hold;
    }
    const fade = Math.max(next.search.revisionFadeEvents * framesPerEvent, 1);
    if (applied.fadeEvents !== fade) {
      uniforms.u_revisionFadeEvents.value = fade;
      applied.fadeEvents = fade;
    }
    if (applied.edgeWidth !== next.search.edgeWidth) {
      uniforms.u_edgeWidth.value = next.search.edgeWidth;
      applied.edgeWidth = next.search.edgeWidth;
    }
    if (applied.revisionAlpha !== next.search.revisionAlpha) {
      uniforms.u_revisionAlpha.value = next.search.revisionAlpha;
      applied.revisionAlpha = next.search.revisionAlpha;
    }
    if (applied.colour !== next.search.revisionColour) {
      uniforms.u_colour.value.set(next.search.revisionColour);
      applied.colour = next.search.revisionColour;
    }
  }

  return { material, uniforms, sync };
}
