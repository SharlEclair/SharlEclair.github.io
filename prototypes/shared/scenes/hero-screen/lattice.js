/**
 * 'lattice': loose spheres of mixed sizes drift apart, then pack into a close-packed crystal (three hex layers)
 * that turns slowly.
 */
import { createScreenScene, smooth, ease, lerp } from './base.js'
import { rng, litMaterial, pointerFollow } from './lit.js'

export async function createScene({ THREE, size, look = 'lcd', palette = 'dmg' } = {}) {
  return createScreenScene({
    THREE, size, look, palette, reducedAt: 0.9, contrast: 1.3,
    build({ THREE }) {
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
      camera.position.set(0, 0, 10)
      const geo = new THREE.IcosahedronGeometry(0.5, 2)
      const material = litMaterial(THREE, { edge: 0 })
      const group = new THREE.Group()
      scene.add(group)
      const R = rng(31)
      const D = 1.02, H = D * Math.sqrt(2 / 3)
      const hex = [[0, 0]]
      for (let k = 0; k < 6; k++) hex.push([Math.cos(k * Math.PI / 3) * D, Math.sin(k * Math.PI / 3) * D])
      const items = []
      for (let L = 0; L < 3; L++) {
        const ox = L === 1 ? D / 2 : L === 2 ? D : 0, oz = L === 1 ? D * 0.2887 : L === 2 ? D * 0.5774 : 0
        for (const [hx, hz] of hex) {
          const mesh = new THREE.Mesh(geo, material)
          group.add(mesh)
          items.push({
            mesh,
            slot: new THREE.Vector3(hx + ox - D / 2, (L - 1) * H, hz + oz - D * 0.29),
            chaos: new THREE.Vector3((R() * 2 - 1) * 3.6, (R() * 2 - 1) * 2.2, (R() * 2 - 1) * 1.8),
            size: 0.4 + R() * 0.55, phase: R() * 6.28,
            delay: L * 0.12 + R() * 0.2,
          })
        }
      }
      const ptr = pointerFollow(0.5, 0.3)
      let aspect = 1
      return {
        scene, camera,
        resize(a) { aspect = a; camera.aspect = a; camera.updateProjectionMatrix() },
        update({ p, time, px, py, dt }) {
          ptr.follow(px, py, dt)
          const spread = Math.max(1, aspect * 0.85)
          const gate = Math.min(1, p * 1.18)
          for (const it of items) {
            const t = ease(Math.min(1, Math.max(0, (gate - it.delay) / 0.55)))
            const w = 1 - t
            it.mesh.position.set(
              it.slot.x * t + (it.chaos.x * spread + Math.sin(time * 0.35 + it.phase) * 0.5) * w,
              it.slot.y * t + (it.chaos.y + Math.cos(time * 0.42 + it.phase) * 0.4) * w,
              it.slot.z * t + it.chaos.z * w,
            )
            it.mesh.scale.setScalar(lerp(it.size, 0.98 * D, smooth(0.3, 1, t)))
          }
          group.rotation.set(0.75 + ptr.pitch, time * 0.3 + ptr.yaw, 0.1)
        },
        dispose() { geo.dispose(); material.dispose() },
      }
    },
  })
}
