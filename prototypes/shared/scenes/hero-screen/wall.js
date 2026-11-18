/**
 * 'wall': bricks tumble down out of the dark, bottom row first, and land in a running-bond wall that sways gently.
 */
import { createScreenScene, smooth, ease } from './base.js'
import { rng, litMaterial, pointerFollow } from './lit.js'

export async function createScene({ THREE, size, look = 'lcd', palette = 'dmg' } = {}) {
  return createScreenScene({
    THREE, size, look, palette, reducedAt: 0.92, contrast: 1.3,
    build({ THREE }) {
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
      camera.position.set(0, 0, 9.2)
      const geo = new THREE.BoxGeometry(1, 1, 1)
      const material = litMaterial(THREE)
      const group = new THREE.Group()
      scene.add(group)
      const R = rng(11)
      const BW = 0.92, BH = 0.44, BD = 0.52, ROWS = 8, COLS = 4
      const items = []
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const mesh = new THREE.Mesh(geo, material)
        mesh.scale.set(BW * 0.97, BH * 0.94, BD)
        group.add(mesh)
        const off = (r % 2) * BW * 0.5
        items.push({
          mesh,
          slot: new THREE.Vector3((c - (COLS - 1) / 2) * BW + off - BW * 0.25, (r - (ROWS - 1) / 2) * BH, 0),
          chaos: new THREE.Vector3((R() * 2 - 1) * 3.4, 3.2 + R() * 3.5, (R() * 2 - 1) * 1.8),
          axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(),
          spin: 0.7 + R() * 1.1, ang0: R() * 6.28,
          delay: (r / (ROWS - 1)) * 0.5 + R() * 0.1,
        })
      }
      const qa = new THREE.Quaternion(), qi = new THREE.Quaternion()
      const ptr = pointerFollow(0.5, 0.25)
      let aspect = 1
      return {
        scene, camera,
        resize(a) { aspect = a; camera.aspect = a; camera.updateProjectionMatrix() },
        update({ p, time, px, py, dt }) {
          ptr.follow(px, py, dt)
          const spread = Math.max(1, aspect * 0.85)
          const gate = Math.min(1, p * 1.2)
          for (const it of items) {
            const t = Math.min(1, Math.max(0, (gate - it.delay) / 0.4)) // 0 hovering .. 1 landed
            const fall = t * t // gravity-ish
            const wob = 1 - ease(t)
            it.mesh.position.set(
              it.slot.x + (it.chaos.x * spread + Math.sin(time * 0.4 + it.ang0) * 0.4) * wob,
              it.slot.y + (it.chaos.y + Math.cos(time * 0.5 + it.ang0) * 0.3) * (1 - fall),
              it.chaos.z * wob,
            )
            qa.setFromAxisAngle(it.axis, it.ang0 + time * it.spin)
            it.mesh.quaternion.slerpQuaternions(qa, qi, smooth(0.55, 1, t))
          }
          group.rotation.set(0.12 + ptr.pitch, Math.sin(time * 0.35) * 0.35 + 0.3 + ptr.yaw, 0)
        },
        dispose() { geo.dispose(); material.dispose() },
      }
    },
  })
}
