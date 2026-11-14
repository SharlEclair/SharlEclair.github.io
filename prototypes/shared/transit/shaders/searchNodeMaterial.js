/**
 * Search-node material (docs/11): one billboarded point per graph node the A* search touched, in a
 * single draw call.
 *
 * Every per-frame decision is `u_frame` against the node's OWN baked frames:
 *
 *   aArrival   the frame A* first discovered this node (`-1` = never)
 *   aSettle    the frame it was popped and settled (`-1` = still open when the goal settled)
 *   aCost      (g, h) in metres - `f = g + h` is the search's own priority
 *
 * and the resulting visual vocabulary is the brief's:
 *
 *   not discovered yet      collapsed outside the clip volume: it is not on the frontier, so drawing it
 *                           would claim the search had reached a road it has not
 *   discovered, not settled the ACTIVE frontier point - sized `dotBeamRadius`, brightened by how good
 *                           its `f` is relative to the frame's live best (`u_bestF`)
 *   settled                 a dim persistent trace, strongest immediately after the pop and easing to
 *                           `u_settledAlpha`, so the explored region accumulates behind the frontier
 *                           instead of flashing and disappearing
 *
 * The points are billboards built from geometry rather than `THREE.Points`: a `Points` sprite is sized
 * in pixels, and the brief asks for a small concentrated glow that behaves like a light in the scene,
 * so the disc is sized in METRES and attenuates with distance on its own.
 *
 * WHY A NODE IS CULLED RATHER THAN DRAWN AT ALPHA 0: an alpha-0 quad still rasterises. A middle-of-search
 * frame has ~90 live frontier points and ~400 settled ones out of 491 quads, and the collapsed ones are
 * what keeps the fill cost off the frame budget while the picture is unchanged.
 */
import * as THREE from 'three';

/**
 * Build the search-node material.
 *
 * @param {typeof import('../config.js').config} config the live singleton
 * @returns {{ material: THREE.ShaderMaterial, uniforms: Record<string, THREE.IUniform>,
 *            sync: (next: typeof config, frame: number, phase: object) => void }}
 */
export function createSearchNodeMaterial(config) {
  const uniforms = {
    u_frame: { value: 0 },
    u_band: { value: 1 },
    u_dotBeamRadius: { value: config.search.dotBeamRadius },
    u_minPixelRadius: { value: config.search.minPixelRadius },
    u_viewportHeight: { value: 800 },
    u_dotCoreRadius: { value: config.search.dotCoreRadius },
    u_dotAlpha: { value: config.search.dotAlpha },
    u_settledAlpha: { value: config.search.settledAlpha },
    u_frontierFloor: { value: config.search.frontierFloor },
    u_coreMix: { value: config.search.coreMix },
    u_priorityBoost: { value: config.search.priorityBoost },
    u_priorityRange: { value: config.search.priorityRange },
    u_bestF: { value: 0 },
    u_dim: { value: 1 },
    u_debug: { value: 0 },
    u_colour: { value: new THREE.Color(config.search.colour) },
    u_coreColour: { value: new THREE.Color(config.search.coreColour) },
    u_emberColour: { value: new THREE.Color(config.search.emberColour) }
  };

  const material = new THREE.ShaderMaterial({
    name: 'SearchNodes',
    uniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // The quad is built in camera space, so its winding relative to a world-space front face is not
    // worth reasoning about: the disc is two triangles of fill, and DoubleSide makes the question moot.
    side: THREE.DoubleSide,
    // depthTest is off for the measured reason recorded in candidateMaterial.js: the city fades to
    // opacity 0 but keeps `depthWrite: true`, so anything at ground level would be buried in an
    // invisible city. The search is drawn OVER the map; the amber solution deliberately is not.
    depthTest: false,
    vertexShader: /* glsl */ `
      // position is the node's own world position - the standard attribute, so three.js can compute
      // the geometry's bounds and the layer is a normal member of the scene graph. The billboard is
      // built AROUND it in camera space, which is why there is no per-corner position attribute.
      attribute vec2 aCorner;
      attribute float aArrival;
      attribute float aSettle;
      attribute vec2 aCost;

      uniform float u_frame;
      uniform float u_band;
      uniform float u_dotBeamRadius;
      uniform float u_minPixelRadius;
      uniform float u_viewportHeight;
      uniform float u_settledAlpha;
      uniform float u_frontierFloor;
      uniform float u_dotAlpha;
      uniform float u_priorityBoost;
      uniform float u_priorityRange;
      uniform float u_bestF;
      uniform float u_dim;

      varying vec2 vCorner;
      varying float vAlpha;
      varying float vSettled;

      void main() {
        // Not discovered yet: this node is not part of the search at this frame. Collapsing it beats
        // drawing it at alpha 0 because rasterisation happens before the fragment shader runs.
        if (aArrival < 0.0 || u_frame < aArrival) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          vCorner = vec2(0.0);
          vAlpha = 0.0;
          vSettled = 0.0;
          return;
        }

        float settleDelta = aSettle - u_frame;
        // 1.0 while this node is settled and the replay has reached its pop, else 0.0.
        float settled = (aSettle >= 0.0 && settleDelta <= 0.0) ? 1.0 : 0.0;

        float alpha;
        if (settled > 0.5) {
          // The persistent trace, whose strength decays with how long ago the pop happened.
          float age = min(-settleDelta / max(u_band, 1.0), 1.0);
          alpha = mix(u_dotAlpha, u_settledAlpha, age);
        } else {
          // A live frontier point. Every open node is DRAWN - an open node is exactly what the
          // algorithm is holding as a candidate - and its brightness decays with how long ago it was
          // discovered, down to u_frontierFloor. It is deliberately not culled at the band edge:
          // culling would make the picture disagree with what the probe reports (measured before this
          // change: 64 open nodes reported against 6 drawn), and "which nodes are on the frontier" is a
          // property of the algorithm rather than of the look. The band sets the FALLOFF; the floor
          // sets the visibility.
          float age = min((u_frame - aArrival) / max(u_band, 1.0), 1.0);
          float f = aCost.x + aCost.y;
          float worse = clamp((f - u_bestF) / max(u_priorityRange, 1.0), 0.0, 1.0);
          float gain = 1.0 + u_priorityBoost * (1.0 - worse);
          alpha = u_dotAlpha * gain * mix(1.0, u_frontierFloor, age);
        }

        // Set once the reconstruction has replaced the search (docs/11 s4.4): the explored network
        // steps back so the amber winner is the brightest thing on screen.
        alpha *= u_dim;

        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // The point is sized in METRES so it behaves like a light in the scene and attenuates with
        // distance. That is right for most of the flight, but the last third climbs to a 3 km birdseye
        // where an 11 m disc is under a pixel and the frontier would simply disappear - and the frontier
        // is the whole subject of the picture. The floor below keeps the disc at u_minPixelRadius
        // pixels of the drawing buffer however far away it is; the metre radius takes over as soon as it
        // is the larger of the two. The metres-per-pixel factor comes from the live projection matrix
        // (not a hardcoded fov), so a GUI fov change cannot desynchronise it.
        float metresPerPixel = 2.0 * length(mv.xyz) / (projectionMatrix[1][1] * u_viewportHeight);
        mv.xy += aCorner * max(u_dotBeamRadius, u_minPixelRadius * metresPerPixel);
        gl_Position = projectionMatrix * mv;

        vCorner = aCorner;
        vAlpha = alpha;
        vSettled = settled;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float u_dotAlpha;
      uniform float u_dotBeamRadius;
      uniform float u_dotCoreRadius;
      uniform float u_coreMix;
      uniform float u_debug;
      uniform vec3 u_colour;
      uniform vec3 u_coreColour;
      uniform vec3 u_emberColour;

      varying vec2 vCorner;
      varying float vAlpha;
      varying float vSettled;

      void main() {
        float r = length(vCorner);
        // Keep the billboard round. Without this the quad's own corners would paint a hard square.
        if (r > 1.0) {
          discard;
        }

        // The core's radius as a fraction of the quad's, clamped away from 0 and 1 so the profile stays
        // well defined whatever the GUI is dragged to (a 0/0 smoothstep is a NaN, docs/03 §3).
        float coreR = clamp(u_dotCoreRadius / max(u_dotBeamRadius, 1e-3), 0.02, 0.95);

        // A tight core inside a soft beam, with a weak wide term so the glow does not end on a visible
        // edge. Almost all of the energy sits near the centre and the power falloff does the rest, so
        // the point reads as a concentrated point rather than a flat disc.
        float beam = pow(max(1.0 - r, 0.0), 5.0);
        float halo = pow(max(1.0 - r, 0.0), 0.8) * 0.12;
        float core = 1.0 - smoothstep(0.0, coreR, r);

        // Settled nodes carry a flatter profile: a trail, not a point of light.
        float shape = mix(beam * 0.35 + halo + core * 1.1, beam * 0.25 + halo + core * 0.5, vSettled * 0.6);
        float alpha = vAlpha * shape;

        // docs/05 §4: the core may run toward the palette's Yellow-White so the leading edge has a hot
        // centre, but the point stays violet-dominated - hence u_coreMix, which stays well below 1.
        vec3 colour = mix(u_colour, u_coreColour, core * u_coreMix);
        // A settled node has burnt out: it cools to the ember colour of the visited filigree.
        colour = mix(colour, u_emberColour, vSettled);

        // Debug: strictly-violet points, no white core, no beam gain - a probe representation that lets
        // the numeric state be read without the look getting in the way.
        if (u_debug > 0.5) {
          colour = u_colour;
        }
        gl_FragColor = vec4(colour, alpha);
        #include <colorspace_fragment>
      }
    `
  });

  const applied = {
    band: Number.NaN,
    beamRadius: Number.NaN,
    minPixelRadius: Number.NaN,
    viewportHeight: Number.NaN,
    coreRadius: Number.NaN,
    dotAlpha: Number.NaN,
    settledAlpha: Number.NaN,
    frontierFloor: Number.NaN,
    coreMix: Number.NaN,
    priorityBoost: Number.NaN,
    priorityRange: Number.NaN,
    bestF: Number.NaN,
    debug: Number.NaN,
    colour: '',
    coreColour: '',
    emberColour: ''
  };

  /**
   * Push config + frame + phase into the uniforms. `frame` is the replay position in frames, `phase`
   * carries the state the layer needs (whether the reconstruction has begun), and `bestF` is the live
   * best priority on the frontier - the reference the priority gain is measured against.
   *
   * @param {typeof config} next
   * @param {number} frame
   * @param {{ final: boolean }} phase
   * @param {number} framesPerEvent
   * @param {number} bestF
   */
  function sync(next, frame, phase, framesPerEvent, bestF) {
    uniforms.u_frame.value = frame;
    uniforms.u_dim.value = 1 - (phase.clear ?? 0);
    if (applied.emberColour !== next.search.emberColour) {
      uniforms.u_emberColour.value.set(next.search.emberColour);
      applied.emberColour = next.search.emberColour;
    }
    uniforms.u_bestF.value = Number.isFinite(bestF) ? bestF : 0;

    const band = Math.max(next.search.frontierBandEvents * framesPerEvent, 1);
    if (applied.band !== band) {
      uniforms.u_band.value = band;
      applied.band = band;
    }
    if (applied.beamRadius !== next.search.dotBeamRadius) {
      uniforms.u_dotBeamRadius.value = next.search.dotBeamRadius;
      applied.beamRadius = next.search.dotBeamRadius;
    }
    if (applied.minPixelRadius !== next.search.minPixelRadius) {
      uniforms.u_minPixelRadius.value = next.search.minPixelRadius;
      applied.minPixelRadius = next.search.minPixelRadius;
    }
    if (applied.viewportHeight !== next.search.viewportHeight) {
      uniforms.u_viewportHeight.value = next.search.viewportHeight;
      applied.viewportHeight = next.search.viewportHeight;
    }
    if (applied.coreRadius !== next.search.dotCoreRadius) {
      uniforms.u_dotCoreRadius.value = next.search.dotCoreRadius;
      applied.coreRadius = next.search.dotCoreRadius;
    }
    if (applied.dotAlpha !== next.search.dotAlpha) {
      uniforms.u_dotAlpha.value = next.search.dotAlpha;
      applied.dotAlpha = next.search.dotAlpha;
    }
    if (applied.settledAlpha !== next.search.settledAlpha) {
      uniforms.u_settledAlpha.value = next.search.settledAlpha;
      applied.settledAlpha = next.search.settledAlpha;
    }
    if (applied.frontierFloor !== next.search.frontierFloor) {
      uniforms.u_frontierFloor.value = next.search.frontierFloor;
      applied.frontierFloor = next.search.frontierFloor;
    }
    if (applied.coreMix !== next.search.coreMix) {
      uniforms.u_coreMix.value = next.search.coreMix;
      applied.coreMix = next.search.coreMix;
    }
    if (applied.priorityBoost !== next.search.priorityBoost) {
      uniforms.u_priorityBoost.value = next.search.priorityBoost;
      applied.priorityBoost = next.search.priorityBoost;
    }
    if (applied.priorityRange !== next.search.priorityRange) {
      uniforms.u_priorityRange.value = next.search.priorityRange;
      applied.priorityRange = next.search.priorityRange;
    }
    if (applied.debug !== next.search.debug) {
      uniforms.u_debug.value = next.search.debug ? 1 : 0;
      applied.debug = next.search.debug;
    }
    if (applied.colour !== next.search.colour) {
      uniforms.u_colour.value.set(next.search.colour);
      applied.colour = next.search.colour;
    }
    if (applied.coreColour !== next.search.coreColour) {
      uniforms.u_coreColour.value.set(next.search.coreColour);
      applied.coreColour = next.search.coreColour;
    }
  }

  return { material, uniforms, sync };
}
