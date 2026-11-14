/**
 * The Albert Park circuit: the destination, and the reason the route ends where it does.
 *
 * The reference project's baked circuit layer is degenerate (see tools/bake-circuit.mjs), so this draws
 * the real centreline from `data/circuit.js` as ONE mesh / ONE draw call with two kinds of quad,
 * separated by a per-vertex attribute rather than by a second primitive:
 *
 *   aKind = 0  the track surface: a flat ribbon just above the road strips
 *   aKind = 1  a light curtain: a vertical quad rising `wallHeight` metres off the centreline, fading
 *              upward. From the low early camera it stands off the ground like a lit barrier, which is
 *              what makes the loop read as a built venue and not as one more street.
 *
 * It is the ONLY violet thing in an otherwise ember scene, which is the other half of "recognisable".
 * A single bright light laps the circuit as the scroll advances; its position is an angle around the
 * loop's centroid driven by u_progress, so the layer stays a pure function of scroll.
 */
import * as THREE from 'three';
import { circuit } from '../data/circuit.js';
import { fadeEase } from './city.js';

const TRACK_Y = 0.9;

export function createCircuit(scene, config) {
  const segments = [];
  for (const line of circuit.polylines) {
    for (let i = 1; i < line.length; i += 1) {
      segments.push([line[i - 1], line[i]]);
    }
  }
  const quads = segments.length * 2;
  const position = new Float32Array(quads * 6 * 3);
  const direction = new Float32Array(quads * 6 * 3);
  const corner = new Float32Array(quads * 6 * 2);
  const kind = new Float32Array(quads * 6);
  // (end selector, side) for the six vertices of a quad
  const CORNERS = [[0, 1], [1, 1], [1, -1], [0, 1], [1, -1], [0, -1]];
  let v = 0;
  for (const [a, b] of segments) {
    for (let k = 0; k < 2; k += 1) {
      for (const [end, side] of CORNERS) {
        const p = end === 0 ? a : b;
        position[v * 3] = p[0];
        position[v * 3 + 1] = TRACK_Y;
        position[v * 3 + 2] = p[1];
        direction[v * 3] = b[0] - a[0];
        direction[v * 3 + 1] = 0;
        direction[v * 3 + 2] = b[1] - a[1];
        corner[v * 2] = end;
        corner[v * 2 + 1] = side;
        kind[v] = k;
        v += 1;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aDirection', new THREE.BufferAttribute(direction, 3));
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));

  const uniforms = {
    u_colour: { value: new THREE.Color(config.circuit.colour) },
    u_hotColour: { value: new THREE.Color(config.circuit.hotColour) },
    u_halfWidth: { value: config.circuit.halfWidth },
    u_wallHeight: { value: config.circuit.wallHeight },
    u_minPixels: { value: config.circuit.minPixels },
    u_viewportHeight: { value: 800 },
    u_gain: { value: 1 },
    u_centre: { value: new THREE.Vector2(circuit.centre[0], circuit.centre[1]) },
    u_chasePhase: { value: 0 },
    u_chaseGain: { value: config.circuit.chaseGain },
    u_chaseWidth: { value: config.circuit.chaseWidth }
  };

  const material = new THREE.ShaderMaterial({
    name: 'AlbertParkCircuit',
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    vertexShader: /* glsl */ `
      attribute vec3 aDirection;
      attribute vec2 aCorner;
      attribute float aKind;

      uniform float u_halfWidth;
      uniform float u_wallHeight;
      uniform float u_minPixels;
      uniform float u_viewportHeight;
      uniform vec2 u_centre;

      varying float vAcross;
      varying float vKind;
      varying float vAngle;
      varying float vAtten;

      void main() {
        vec3 world = position + aDirection * aCorner.x;
        // Seen edge-on from street level the whole 5 km loop collapses onto a few horizon pixels and its
        // additive layers stack into a white blob. Fade it by the elevation angle it is viewed from.
        float elevation = cameraPosition.y / max(length(cameraPosition - world), 1.0);
        vAtten = smoothstep(0.035, 0.24, elevation);
        vAngle = atan(world.z - u_centre.y, world.x - u_centre.x);
        vKind = aKind;

        if (aKind < 0.5) {
          // Track surface: widen across the road in the ground plane, with a pixel floor.
          vec4 mv = modelViewMatrix * vec4(world, 1.0);
          float metresPerPixel = 2.0 * length(mv.xyz) / (projectionMatrix[1][1] * u_viewportHeight);
          float halfWidth = max(u_halfWidth, u_minPixels * metresPerPixel);
          vec3 across = normalize(vec3(-aDirection.z, 0.0, aDirection.x) + vec3(1e-5, 0.0, 0.0));
          world += across * aCorner.y * halfWidth;
          vAcross = aCorner.y;
        } else {
          // Light curtain: side = -1 is the foot on the track, +1 the top edge.
          float up = aCorner.y * 0.5 + 0.5;
          world.y += up * u_wallHeight;
          vAcross = up;
        }
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 u_colour;
      uniform vec3 u_hotColour;
      uniform float u_gain;
      uniform float u_chasePhase;
      uniform float u_chaseGain;
      uniform float u_chaseWidth;

      varying float vAcross;
      varying float vKind;
      varying float vAngle;
      varying float vAtten;

      void main() {
        // The lapping light: distance around the loop from the chase head, wrapped to -0.5..0.5 turns.
        float turn = vAngle / 6.28318530718;
        float d = fract(turn - u_chasePhase + 0.5) - 0.5;
        // A comet: sharp ahead of the head, a longer tail behind it.
        float head = exp(-abs(d) / max(u_chaseWidth * (d > 0.0 ? 0.25 : 1.0), 1e-4));

        float profile;
        vec3 colour;
        if (vKind < 0.5) {
          float across = 1.0 - abs(vAcross);
          profile = mix(across, across * across, 0.6);
          colour = mix(u_colour, u_hotColour, across * across);
        } else {
          // Brightest at the foot, gone by the top edge.
          // max(): an interpolated varying can overshoot 1, and pow() of a negative is a NaN that the
          // bloom blur would then spread across the whole frame.
          profile = pow(max(1.0 - vAcross, 0.0), 2.2) * 0.38;
          colour = u_colour;
        }
        vec3 lit = colour * u_gain * profile + u_hotColour * head * u_chaseGain * profile * min(u_gain, 1.5);
        gl_FragColor = vec4(max(lit, 0.0) * vAtten, 1.0);
        #include <colorspace_fragment>
      }
    `
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'AlbertParkCircuit';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1.5;
  scene.add(mesh);

  const applied = { colour: '', hot: '' };

  /**
   * @param {typeof config} next
   * @param {number} progress u_progress, 0..1
   * @param {number} flash the completion flash envelope, 0..1
   */
  function sync(next, progress, flash = 0) {
    const c = next.circuit;
    if (applied.colour !== c.colour) {
      uniforms.u_colour.value.set(c.colour);
      applied.colour = c.colour;
    }
    if (applied.hot !== c.hotColour) {
      uniforms.u_hotColour.value.set(c.hotColour);
      applied.hot = c.hotColour;
    }
    uniforms.u_halfWidth.value = c.halfWidth;
    uniforms.u_wallHeight.value = c.wallHeight;
    uniforms.u_minPixels.value = c.minPixels;
    uniforms.u_viewportHeight.value = next.search.viewportHeight;
    uniforms.u_chaseGain.value = c.chaseGain;
    uniforms.u_chaseWidth.value = c.chaseWidth;
    uniforms.u_chasePhase.value = progress * c.laps;
    const t = fadeEase(progress, c.revealStart, c.revealEnd);
    uniforms.u_gain.value = (c.gainNear + (c.gainFar - c.gainNear) * t) * (1 + flash * 0.6);
  }

  return {
    mesh,
    material,
    uniforms,
    sync,
    /** World-space anchor for the DOM label: the loop's northern apex, on the ground. */
    labelAnchor: new THREE.Vector3(circuit.centre[0], 0, circuit.extent[2]),
    centre: new THREE.Vector3(circuit.centre[0], 0, circuit.centre[1]),
    fingerprint: { segments: segments.length, lengthM: circuit.lengthM, fitResidualM: circuit.fitResidualM, warnings: [] }
  };
}
