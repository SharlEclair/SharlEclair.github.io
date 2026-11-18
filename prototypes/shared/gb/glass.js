/**
 * Alternative shell material for the handheld: three's built-in transmission (MeshPhysicalMaterial.transmission),
 * the technique from the Codrops "transparent glass and plastic in three.js" article, updated for r186.
 *
 *  - transmission 1 makes the *body* see-through while keeping surface reflections (unlike opacity).
 *  - thickness + ior bend what is behind it (the board and parts inside the shell).
 *  - roughness blurs the transmitted image through the transmission target's mip chain: that is the frosting.
 *  - a faint noise normalMap breaks up the blur banding the article mentions for mid roughness values.
 *  - attenuationColor / attenuationDistance tint light as it travels through the plastic (smoke, blue, green...).
 *  - dispersion (r163+) splits colours at the edges; clearcoat gives the polished outer lacquer.
 *
 * Limits of three's transmission: it only sees opaque objects (not the transparent halos or other transmissive
 * meshes), and the page behind a transparent canvas is not visible through it, only what is in the scene.
 * Used by anim/gb-tune.html; the live page keeps the cheaper fake-frost shell in gameboy.js.
 *
 *   const glass = createGlassVariant(THREE, gb, renderer)
 *   glass.enable(true | false)   glass.mats -> [shell, trim] for sliders   glass.setResolution(0..1)
 */

/**
 * Procedural frosted-plastic microsurface: one tileable noise field drives a normal map (bumps that scatter the
 * transmitted light) and a roughness map (patches that are rougher or smoother, like real sand-blasted plastic).
 *   grain.setCoarseness(0..1)  how big the grains are (blur passes over the noise)
 *   grain.setVariation(0..1)   how much the roughness varies across the surface
 *   grain.setScale(s)          texture repeats across the shell
 */
function makeGrain(THREE, size = 128) {
  const raw = new Float32Array(size * size)
  for (let i = 0; i < raw.length; i += 1) raw[i] = Math.random()
  const nData = new Uint8Array(size * size * 4)
  const rData = new Uint8Array(size * size * 4)
  const mk = (data) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.NoColorSpace
    t.generateMipmaps = true
    t.minFilter = THREE.LinearMipmapLinearFilter
    t.magFilter = THREE.LinearFilter
    t.repeat.set(5, 6)
    return t
  }
  const normal = mk(nData)
  const rough = mk(rData)
  let field = raw
  let variation = 0.35
  const wrap = (v) => ((v % size) + size) % size
  const blur = (src) => {
    const out = new Float32Array(src.length)
    const at = (x, y) => src[wrap(y) * size + wrap(x)]
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) out[y * size + x] = (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1) + at(x, y) * 2) / 6
    return out
  }
  function bake() {
    // renormalise the blurred field to 0..1 so coarseness does not change the strength
    let lo = 1; let hi = 0
    for (const v of field) { if (v < lo) lo = v; if (v > hi) hi = v }
    const k = 1 / Math.max(1e-6, hi - lo)
    const f = (x, y) => (field[wrap(y) * size + wrap(x)] - lo) * k
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const dx = (f(x + 1, y) - f(x - 1, y)) * 2.2
      const dy = (f(x, y + 1) - f(x, y - 1)) * 2.2
      const len = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      nData[i] = ((-dx / len) * 0.5 + 0.5) * 255
      nData[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255
      nData[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      nData[i + 3] = 255
      // three reads roughness from the green channel, multiplied by material.roughness
      const g = (1 - variation * f(x, y)) * 255
      rData[i] = g; rData[i + 1] = g; rData[i + 2] = g; rData[i + 3] = 255
    }
    normal.needsUpdate = true
    rough.needsUpdate = true
  }
  bake()
  return {
    normal,
    rough,
    setCoarseness(c) { let f = raw; for (let i = 0; i < Math.round(c * 8); i += 1) f = blur(f); field = f; bake() },
    setVariation(v) { variation = v; bake() },
    setScale(s) { normal.repeat.set(s, s * 1.2); rough.repeat.set(s, s * 1.2) },
    dispose() { normal.dispose(); rough.dispose() },
  }
}

export function createGlassVariant(THREE, gb, renderer) {
  const { body, bay, wells } = gb.nodes
  const back = body?.parent?.children.find((o) => o.name === 'body_back')
  const grain = makeGrain(THREE)
  grain.setCoarseness(0.125) // one soft pass: fine powder, not salt and pepper
  const normal = grain.normal

  // The glb body has no UVs guaranteed: project planar ones so the grain map has somewhere to land
  const g = body?.geometry
  if (g && !g.attributes.uv) {
    const pos = g.attributes.position
    const uv = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i += 1) { uv[i * 2] = pos.getX(i) / 2.5 + 0.5; uv[i * 2 + 1] = pos.getY(i) / 3.2 + 0.5 }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  }

  const make = (extra = {}) => new THREE.MeshPhysicalMaterial({
    // Tuned against tools/ref/gb-ref-1/3: smoky milky-grey shell, board and parts readable inside, bright soft edges
    color: 0xbcc3cb, metalness: 0, roughness: 0.48, transmission: 0.92, thickness: 0.25, ior: 1.45,
    attenuationColor: new THREE.Color(0xb0b8c1), attenuationDistance: 1.6, dispersion: 0, specularIntensity: 1,
    clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 1.5, normalMap: normal, normalScale: new THREE.Vector2(0.04, 0.04),
    roughnessMap: grain.rough, clearcoatNormalMap: normal, clearcoatNormalScale: new THREE.Vector2(0, 0),
    sheen: 0, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xdfe6ee), specularColor: new THREE.Color(0xffffff),
    side: THREE.DoubleSide, ...extra,
  })
  // Transmission drops the body's own diffuse light, so frosted plastic loses its milkiness and bright edges. Add them
  // back with two cheap terms (same idea as the fake-frost shell): a flat haze and a fresnel edge glow.
  const U = { uHaze: { value: 0.03 }, uHazeColor: { value: new THREE.Color(0xc8ced6) }, uEdgeK: { value: 0.9 }, uEdgeColor: { value: new THREE.Color(0xeaf2fa) } }
  const lit = (m) => {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U)
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform float uHaze, uEdgeK; uniform vec3 uHazeColor, uEdgeColor;\nvoid main() {')
        .replace('#include <opaque_fragment>', `float gNdv = abs(dot(normalize(vViewPosition), normal));
           float gFr = pow(1.0 - gNdv, 2.0);
           outgoingLight += uHazeColor * uHaze + uEdgeColor * uEdgeK * gFr;
           #include <opaque_fragment>`)
    }
    m.customProgramCacheKey = () => 'gb-glass-lit'
    return m
  }
  const shell = lit(make())
  const trim = lit(make({ roughness: 0.4, thickness: 0.5 }))
  const originals = { body: body?.material, bay: bay?.material, wells: wells?.material }
  let on = false

  return {
    mats: [shell, trim],
    U,
    normal,
    get enabled() { return on },
    enable(v) {
      on = Boolean(v)
      if (body) body.material = on ? shell : originals.body
      if (bay) bay.material = on ? trim : originals.bay
      if (wells) wells.material = on ? trim : originals.wells
      // the fake-frost helpers (back-wall pass and milky layer) are replaced by real transmission
      if (back) back.visible = !on
      gb.tune.diffuser.visible = !on
      // the board and chips are seen through the shell: lift them a little so they read as mid-grey, as in the photos
      // The button glow discs sit inside the shell, so real transmission refracts them to one side of each cap (a
      // "ghost" button next to it). Off by default here; the "A / B halo" and "Pill halo" sliders can bring them back.
      for (const h of gb.tune.halos) h.mat.opacity = on ? 0 : h.op
      gb.tune.pcbMat.color.setScalar(on ? 1.3 : 1)
      gb.tune.partMat.color.setScalar(on ? 1.5 : 1)
    },
    grain,
    setGrain(v) { for (const m of [shell, trim]) m.normalScale.set(v, v) },
    setCoatGrain(v) { for (const m of [shell, trim]) m.clearcoatNormalScale.set(v, v) },
    setResolution(v) { renderer.transmissionResolutionScale = v },
    dispose() { shell.dispose(); trim.dispose(); grain.dispose() },
  }
}
