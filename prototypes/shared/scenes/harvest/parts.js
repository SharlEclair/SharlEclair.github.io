/** Building blocks for the Harvest scene: satellite, text labels, ribbons. Everything is created once, never per frame. */

/** Sentinel-2-like satellite: boxy bus, two gridded solar wings, dish, imaging aperture. Flies along +x, wings along z.
 *  `look` = { gold, satDark, accent, panelBg, panelGrid, panelFrame, panelEmissive }; setLook(look) re-colours it live. */
export function makeSatellite(THREE, look0, disposables) {
  const g = new THREE.Group()
  const gold = new THREE.MeshStandardMaterial({ color: look0.gold, metalness: 0.35, roughness: 0.5, emissive: look0.gold, emissiveIntensity: 0.22 })
  const dark = new THREE.MeshStandardMaterial({ color: look0.satDark, metalness: 0.5, roughness: 0.55 })
  const glow = new THREE.MeshBasicMaterial({ color: look0.accent })
  const edgeMat = new THREE.LineBasicMaterial({ color: look0.accent })

  let panelMap = null
  let panelCtx = null
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 128
    panelCtx = c.getContext('2d')
    panelMap = new THREE.CanvasTexture(c)
    panelMap.colorSpace = THREE.SRGBColorSpace
    panelMap.anisotropy = 4
    disposables.push(panelMap)
  }
  const paintPanel = (l) => {
    if (!panelCtx) return
    const x = panelCtx
    x.fillStyle = l.panelBg
    x.fillRect(0, 0, 256, 128)
    x.strokeStyle = l.panelGrid
    x.lineWidth = 2
    for (let i = 0; i <= 8; i += 1) { x.beginPath(); x.moveTo((i / 8) * 256, 0); x.lineTo((i / 8) * 256, 128); x.stroke() }
    for (let j = 0; j <= 4; j += 1) { x.beginPath(); x.moveTo(0, (j / 4) * 128); x.lineTo(256, (j / 4) * 128); x.stroke() }
    x.strokeStyle = l.panelFrame
    x.lineWidth = 4
    x.strokeRect(2, 2, 252, 124)
    panelMap.needsUpdate = true
  }
  paintPanel(look0)
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: panelMap, metalness: 0.3, roughness: 0.45, emissive: look0.panelEmissive, emissiveIntensity: 0.9 })

  const bus = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.15, 1.7), gold)
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.78, 0.2, 1.78), dark)
  band.position.y = 0.1
  const aperture = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 1.2), glow)
  aperture.position.y = -0.6
  g.add(bus, band, aperture)
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.2), dark)
    arm.position.set(0, 0, s * 1.4)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 4.7), panelMat)
    panel.position.set(0, 0, s * 4.0)
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(panel.geometry), edgeMat)
    edges.position.copy(panel.position)
    g.add(arm, panel, edges)
    disposables.push(arm.geometry, panel.geometry, edges.geometry)
  }
  const dishStem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), dark)
  dishStem.position.set(0.7, 0.85, 0)
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.28, 16, 1, true), gold)
  dish.position.set(0.7, 1.25, 0)
  dish.rotation.x = Math.PI
  dish.material.side = THREE.DoubleSide
  g.add(dishStem, dish)
  disposables.push(bus.geometry, band.geometry, aperture.geometry, dishStem.geometry, dish.geometry, gold, dark, glow, edgeMat, panelMat)

  function setLook(l) {
    gold.color.set(l.gold)
    gold.emissive.set(l.gold)
    dark.color.set(l.satDark)
    glow.color.set(l.accent)
    edgeMat.color.set(l.accent)
    panelMat.emissive.set(l.panelEmissive)
    paintPanel(l)
  }
  return { group: g, aperture, setLook }
}

/** Small mono text sprite. Returns { sprite, aspect, setColors(color, accent) }. Scale it with sprite.scale.set(h * aspect, h, 1). */
export function makeLabel(THREE, text, { color = '#efe6d4', accent = '#ffb24a', disposables } = {}) {
  const c = document.createElement('canvas')
  const x = c.getContext('2d')
  const font = '600 34px ui-monospace, "SF Mono", Menlo, Consolas, monospace'
  x.font = font
  x.letterSpacing = '5px'
  const tw = Math.ceil(x.measureText(text).width)
  c.width = tw + 56
  c.height = 72
  const paint = (col, acc) => {
    x.clearRect(0, 0, c.width, c.height)
    x.font = font
    x.letterSpacing = '5px'
    x.textBaseline = 'middle'
    x.globalAlpha = 1
    x.fillStyle = acc
    x.fillRect(0, 14, 5, 44)
    x.fillStyle = col
    x.fillText(text, 24, 38)
    x.fillStyle = acc
    x.globalAlpha = 0.55
    x.fillRect(24, 62, tw, 2)
  }
  paint(color, accent)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: false })
  const sprite = new THREE.Sprite(mat)
  sprite.center.set(0, 0.5)
  disposables?.push(tex, mat)
  return { sprite, aspect: c.width / c.height, setColors(col, acc) { paint(col, acc); tex.needsUpdate = true } }
}

/** Flat ribbon mesh through 3D polylines: attribute aD = distance along the path (world units). */
export function ribbonGeometry(THREE, ribbons) {
  let verts = 0
  for (const r of ribbons) verts += r.pts.length * 2
  const pos = new Float32Array(verts * 3)
  const uv = new Float32Array(verts * 2)
  const ad = new Float32Array(verts)
  const idx = []
  let v = 0
  for (const r of ribbons) {
    const n = r.pts.length
    const base = v
    for (let i = 0; i < n; i += 1) {
      const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(n - 1, i + 1)]
      let tx = b[0] - a[0], tz = b[2] - a[2]
      const l = Math.hypot(tx, tz) || 1
      tx /= l
      tz /= l
      const hw = r.width / 2
      for (let s = 0; s < 2; s += 1) {
        const side = s === 0 ? -1 : 1
        pos.set([r.pts[i][0] - tz * hw * side, r.pts[i][1], r.pts[i][2] + tx * hw * side], v * 3)
        uv.set([i / (n - 1), s], v * 2)
        ad[v] = r.d[i]
        v += 1
      }
      if (i < n - 1) {
        const o = base + i * 2
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setAttribute('aD', new THREE.BufferAttribute(ad, 1))
  geo.setIndex(idx)
  return geo
}
