import * as THREE from 'three'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'

/**
 * Lightweight, 1-pass FXAA post-processing helper for Three.js WebGLRenderers.
 * Renders into an offscreen render target, then composites through FXAAShader onto the canvas (or outTarget).
 */
export function createFxaaPass(THREE_INST = THREE) {
  let target = null
  let w = 1
  let h = 1

  const material = new THREE_INST.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      resolution: { value: new THREE_INST.Vector2(1, 1) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: FXAAShader.fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })

  const quad = new THREE_INST.Mesh(new THREE_INST.PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const quadScene = new THREE_INST.Scene()
  quadScene.add(quad)
  const quadCamera = new THREE_INST.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  return {
    setSize(nw, nh, dpr = 1) {
      w = Math.max(1, Math.round(nw * dpr))
      h = Math.max(1, Math.round(nh * dpr))
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
      material.uniforms.resolution.value.set(1 / w, 1 / h)
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
