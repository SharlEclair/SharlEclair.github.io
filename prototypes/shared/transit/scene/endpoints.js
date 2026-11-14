/**
 * Start and destination markers: two soft radial amber-gold point glows (reference frame_0001).
 *
 * They are on screen from the first frame, before the search has examined anything, so the viewer
 * knows what the fire is trying to connect. Two screen-sized points in one draw call; the hot core is
 * above the bloom threshold, the halo is not.
 */
import * as THREE from 'three';

export function createEndpoints(scene, config, trace) {
  const coords = trace.nodes.coords;
  const index = (id) => {
    const direct = coords[id];
    if (direct) return id;
    const found = trace.nodes.ids.indexOf(id);
    return found >= 0 ? found : 0;
  };
  // The path is authoritative for which nodes are the two ends, whatever form sourceNode/goalNode take.
  const path = trace.finalPath.nodes;
  const ends = [index(path[0]), index(path[path.length - 1])];
  const position = new Float32Array(6);
  ends.forEach((node, i) => {
    position[i * 3] = coords[node][0];
    position[i * 3 + 1] = 2;
    position[i * 3 + 2] = -coords[node][1];
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aWhich', new THREE.BufferAttribute(new Float32Array([0, 1]), 1));

  const uniforms = {
    u_colour: { value: new THREE.Color(config.endpoints.colour) },
    u_coreColour: { value: new THREE.Color(config.endpoints.coreColour) },
    u_size: { value: 52 },
    u_gain: { value: config.endpoints.gain },
    u_flash: { value: 0 }
  };

  const material = new THREE.ShaderMaterial({
    name: 'RouteEndpoints',
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    vertexShader: /* glsl */ `
      attribute float aWhich;
      uniform float u_size;
      uniform float u_flash;
      varying float vWhich;
      void main() {
        vWhich = aWhich;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = u_size * (1.0 + u_flash * 0.5);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 u_colour;
      uniform vec3 u_coreColour;
      uniform float u_gain;
      uniform float u_flash;
      varying float vWhich;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        float core = 1.0 - smoothstep(0.0, 0.12, r);
        float halo = pow(max(1.0 - r, 0.0), 3.2);
        vec3 colour = u_coreColour * core * u_gain + u_colour * halo * 0.55 * (1.0 + u_flash);
        gl_FragColor = vec4(colour, 1.0);
        #include <colorspace_fragment>
      }
    `
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'RouteEndpoints';
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);

  function sync(next, pixelRatio, flash = 0) {
    uniforms.u_size.value = next.endpoints.pixelRadius * 2 * pixelRatio;
    uniforms.u_gain.value = next.endpoints.gain;
    uniforms.u_flash.value = flash;
  }

  return {
    points,
    material,
    sync,
    start: new THREE.Vector3(position[0], 0, position[2]),
    goal: new THREE.Vector3(position[3], 0, position[5])
  };
}
