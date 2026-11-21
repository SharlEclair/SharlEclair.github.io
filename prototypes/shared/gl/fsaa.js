import * as THREE from 'three'

/**
 * Full-Scene Anti-Aliasing (FSAA / 2x2 Supersampling) pass.
 * Renders the scene at 2x resolution (4x subpixel samples) into an offscreen HalfFloat target,
 * then downsamples with bilinear filtering onto the output canvas or target.
 */
export function createFsaaPass(THREE_INST = THREE, { scale = 2 } = {}) {
  let target = null
  let w = 1
  let h = 1

  const material = new THREE_INST.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(tDiffuse, vUv);
      }
    `,
    depthTest: false,
    depthWrite: false,
    blending: THREE_INST.NoBlending,
  })

  const quad = new THREE_INST.Mesh(new THREE_INST.PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const quadScene = new THREE_INST.Scene()
  quadScene.add(quad)
  const quadCamera = new THREE_INST.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  return {
    setSize(nw, nh, dpr = 1) {
      w = Math.max(1, Math.round(nw * dpr * scale))
      h = Math.max(1, Math.round(nh * dpr * scale))
      if (!target) {
        target = new THREE_INST.WebGLRenderTarget(w, h, {
          minFilter: THREE_INST.LinearFilter,
          magFilter: THREE_INST.LinearFilter,
          type: THREE_INST.HalfFloatType,
          format: THREE_INST.RGBAFormat,
          generateMipmaps: false,
        })
      } else {
        target.setSize(w, h)
      }
      material.uniforms.tDiffuse.value = target.texture
    },
    get target() {
      return target
    },
    render(renderer, outTarget = null) {
      if (!target) return
      renderer.setRenderTarget(outTarget)
      renderer.render(quadScene, quadCamera)
    },
    dispose() {
      target?.dispose()
      material.dispose()
      quad.geometry.dispose()
    },
  }
}
