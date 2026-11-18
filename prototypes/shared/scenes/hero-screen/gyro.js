/**
 * 'gyro': loose rings and a core tumble around each other, then, as you scroll, snap into a nested gyroscope whose
 * rings keep turning on their own axes.
 */
import { createScreenScene, smooth, ease } from './base.js'
import { rng, litMaterial, pointerFollow } from './lit.js'

export async function createScene({ THREE, size, look = 'lcd', palette = 'dmg' } = {}) {
  return createScreenScene({
    THREE, size, look, palette, reducedAt: 0.9, contrast: 1.3,
    build({ THREE }) {
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
      camera.position.set(0, 0, 11.5)
      const R = rng(23)
      const defs = [
        { r: 2.5, t: 0.2, tone: 0.95, axis: [0, 1, 0], spin: 0.5, n: [0, 0, 1] },
        { r: 1.95, t: 0.2, tone: 0.8, axis: [1, 0, 0], spin: -0.7, n: [1, 0, 0] },
        { r: 1.4, t: 0.2, tone: 1.0, axis: [0, 0, 1], spin: 0.9, n: [0, 1, 0] },
      ]
      const mats = [], geos = [], items = []
      const group = new THREE.Group()
      scene.add(group)
      for (const d of defs) {
        const g = new THREE.TorusGeometry(d.r, d.t, 14, 56); geos.push(g)
        const m = litMaterial(THREE, { edge: 0, tone: d.tone }); mats.push(m)
        const mesh = new THREE.Mesh(g, m)
        group.add(mesh)
        // ordered orientation: ring plane normal d.n (torus default normal is +z), then spin about d.axis
        const base = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...d.n))
        items.push({ mesh, base, axis: new THREE.Vector3(...d.axis), spin: d.spin, cax: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), cspin: 0.5 + R() * 0.6, a0: R() * 6.28, chaos: new THREE.Vector3((R() * 2 - 1) * 3, (R() * 2 - 1) * 1.8, (R() * 2 - 1) * 1.2), delay: R() * 0.2 })
      }
      const cg = new THREE.IcosahedronGeometry(0.75, 1).toNonIndexed(); cg.computeVertexNormals(); geos.push(cg)
      const cm = litMaterial(THREE, { edge: 0, tone: 1 }); mats.push(cm)
      const core = new THREE.Mesh(cg, cm); group.add(core)
      const qs = new THREE.Quaternion(), qo = new THREE.Quaternion(), qr = new THREE.Quaternion()
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
            const t = ease(Math.min(1, Math.max(0, (gate - it.delay) / 0.6)))
            qs.setFromAxisAngle(it.cax, it.a0 + time * it.cspin)
            qr.setFromAxisAngle(it.axis, time * it.spin)
            qo.copy(qr).multiply(it.base)
            it.mesh.quaternion.slerpQuaternions(qs, qo, smooth(0.3, 1, t))
            const w = 1 - t
            it.mesh.position.set(it.chaos.x * spread * w + Math.sin(time * 0.4 + it.a0) * 0.4 * w, it.chaos.y * w, it.chaos.z * w)
          }
          const tc = ease(Math.min(1, Math.max(0, (gate - 0.1) / 0.6)))
          core.position.set((1 - tc) * -1.4 * spread, (1 - tc) * 1.1, 0)
          core.rotation.set(time * 0.3, time * 0.45, 0)
          group.rotation.set(0.45 + ptr.pitch, 0.4 + Math.sin(time * 0.25) * 0.25 + ptr.yaw, 0)
        },
        dispose() { geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()) },
      }
    },
  })
}
