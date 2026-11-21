/**
 * "Floor light" for the handheld, the alternative to the flat sprite glow in scene.js (variants: shared/gb/variants.js).
 * Light pools on an invisible floor under the console and bleeds up a backdrop behind it, like the glowing card
 * reference: bright and wide just under the bottom edge, fading upward behind the (translucent) shell.
 *
 *   const fg = createFloorGlow(THREE)       // fg.group: scene.js copies the rig position and scale onto it (level, never rolled)
 *   fg.setMode('floor' | 'grid')            // grid: the same light broken into LED cells, a few lit brighter
 *   fg.setTheme('dark' | 'light')           // dark: blue-teal light; light: a soft warm shadow pool
 *   fg.setLevel(0..1)                       // overall fade (the scene fades it out during the LCD dive)
 *
 * Two quads, one tiny shader, no render targets: a vertical backdrop just behind the body (the camera sits near eye
 * level, so a floor alone projects to a thin sliver) and a horizontal floor patch under it. Both use NormalBlending
 * with non-premultiplied output, which three turns into valid premultiplied alpha, so it composites the same over the
 * page's transparent canvas (alpha: true, clearAlpha 0). Everything fades to exactly 0 before each quad edge.
 */
import { L } from './layout.js'

const BASE_Y = -L.H / 2
// Grid cells are whole multiples of the LCD pixel pitch (the raw pitch is only 2 to 3 screen pixels at hero size),
// with the grid origin on the LCD's top-left corner so the cells line up with the screen's own pixels.
const LCD_PITCH = L.screen.w / 160

const LOOKS = {
  dark: { deep: 0x1d3cff, hot: 0x59dcff, spark: 0xcff4ff, wall: 0.8, floor: 0.4 },
  light: { deep: 0x4a3d2a, hot: 0x6b5a40, spark: 0x3a2f20, wall: 0.2, floor: 0.26 },
}

const VERT = /* glsl */ `
  uniform float uFloor;
  varying vec2 vP;
  void main() {
    vP = mix(position.xy, position.xz, uFloor);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  uniform float uFloor, uGrid, uCell, uOpacity, uLevel, uReach, uBase;
  uniform vec2 uOrigin;
  uniform vec3 uDeep, uHot, uSpark;
  varying vec2 vP;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // Light amount 0..1 at a point on the plane (plane coordinates: x,y on the backdrop; x,z on the floor)
  float field(vec2 p) {
    if (uFloor > 0.5) {
      float r = length(vec2(p.x / 2.5, p.y / 1.9));
      return exp(-r * r * 2.6) * (1.0 - smoothstep(0.45, 1.0, r));
    }
    float y = p.y - uBase;                                  // 0 at the console's bottom edge
    float up = max(y + 0.05, 0.0);
    float v = exp(-pow(up / uReach, 1.35));                 // fades upward behind the console
    v *= smoothstep(-1.5, -0.35, y);                        // and below the pool
    float halfW = mix(2.1, 1.45, smoothstep(0.0, 1.8, y));  // wide pool, narrowing as it climbs
    float h = exp(-pow(abs(p.x) / halfW, 2.6));
    float edge = (1.0 - smoothstep(0.7, 1.0, abs(p.x) / 3.4)) * (1.0 - smoothstep(0.55, 1.0, up / 4.4));
    return v * h * edge;
  }

  void main() {
    float fs = field(vP);
    vec3 col = mix(uDeep, uHot, pow(fs, 1.3));
    float a = fs * uOpacity;
    if (uGrid > 0.5) {
      vec2 g = (vP - uOrigin) / uCell;
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float fc = field((id + 0.5) * uCell + uOrigin);       // sampled once per cell: quantised
      float h = hash(id);
      float spark = step(0.97, hash(id + 17.3));
      float lit = max(fc - 0.05, 0.0) * 1.05 * (0.72 + 0.28 * h);
      lit = min(1.0, lit + spark * fc * 1.5);
      // rounded LED square with a gap between cells
      float aa = max(fwidth(g.x), 1e-4);
      float d = length(max(abs(f) - vec2(0.27), 0.0)) - 0.09;
      float sq = 1.0 - smoothstep(-aa, aa, d);
      float ag = sq * (lit * 1.05 + fc * 0.04) * uOpacity;
      vec3 cg = mix(uDeep, uHot, pow(clamp(lit, 0.0, 1.0), 1.3));
      cg = mix(cg, uSpark, spark * 0.65);
      // cells smaller than ~3 screen pixels turn to mush: hand over to the smooth field
      float k = smoothstep(2.5, 5.0, uCell / max(fwidth(vP.x), 1e-5));
      col = mix(col, cg, k);
      a = mix(fs * uOpacity * 0.8, ag, k);
    }
    a *= uLevel;
    a += (hash(gl_FragCoord.xy) - 0.5) / 255.0;            // dither: low-alpha gradients on near-black band otherwise
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`

export function createFloorGlow(THREE) {
  const group = new THREE.Group()
  group.name = 'floor_glow'
  const U = {
    uGrid: { value: 0 }, uCell: { value: LCD_PITCH * 3 }, uOpacity: { value: 1 }, uLevel: { value: 1 }, uReach: { value: 1.5 }, uBase: { value: BASE_Y },
    uDeep: { value: new THREE.Color() }, uHot: { value: new THREE.Color() }, uSpark: { value: new THREE.Color() },
  }
  const make = (floor, origin, geo, opacityKey) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...U, uFloor: { value: floor ? 1 : 0 }, uOrigin: { value: new THREE.Vector2(...origin) } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, toneMapped: false, fog: false,
      blending: THREE.NormalBlending, extensions: {},
    })
    // uOpacity differs per quad (the floor pool is brighter), everything else is shared
    m.uniforms.uOpacity = { value: 1 }
    const mesh = new THREE.Mesh(geo, m)
    mesh.renderOrder = -10
    mesh.frustumCulled = false
    mesh.userData.key = opacityKey
    return mesh
  }
  const sx = L.screen.cx - L.screen.w / 2
  const wallGeo = new THREE.PlaneGeometry(6.8, 6.2)
  wallGeo.translate(0, -0.1, 0)
  const floorGeo = new THREE.PlaneGeometry(5, 4)
  floorGeo.rotateX(-Math.PI / 2)
  floorGeo.translate(0, BASE_Y - 0.03, 0)
  const wall = make(false, [sx, L.screen.cy + L.screen.h / 2], wallGeo, 'wall')
  wall.position.z = -0.4
  const floor = make(true, [sx, 0], floorGeo, 'floor')
  group.add(wall, floor)

  const state = { theme: 'dark', k: { ...LOOKS.dark }, level: 1, mode: 'floor' }
  const apply = () => {
    const k = state.k
    U.uDeep.value.set(k.deep)
    U.uHot.value.set(k.hot)
    U.uSpark.value.set(k.spark)
    wall.material.uniforms.uOpacity.value = k.wall
    floor.material.uniforms.uOpacity.value = k.floor
    for (const m of [wall, floor]) {
      m.material.uniforms.uLevel.value = state.level
      m.visible = state.level * (m.userData.key === 'wall' ? k.wall : k.floor) > 0.002
    }
  }
  apply()

  const api = {
    group, uniforms: U,
    /** Live look values for anim/gb-tune.html: `look.wall`, `look.floor` (peak opacity), `look.deep`, `look.hot`, `look.spark` (hex). Call refresh() after. */
    look: state.k,
    refresh: apply,
    setMode(mode) { state.mode = mode; U.uGrid.value = mode === 'grid' ? 1 : 0; for (const m of [wall, floor]) m.material.uniforms.uGrid.value = U.uGrid.value },
    setTheme(name) { state.theme = name === 'light' ? 'light' : 'dark'; Object.assign(state.k, LOOKS[state.theme]); apply() },
    setLevel(v) { if (v !== state.level) { state.level = v; apply() } },
    /** Grid cell size in LCD pixels (a whole number) and how far up the backdrop the light climbs (local units). */
    setCell(n) { const c = LCD_PITCH * Math.max(1, Math.round(n)); for (const m of [wall, floor]) m.material.uniforms.uCell.value = c },
    setReach(v) { for (const m of [wall, floor]) m.material.uniforms.uReach.value = v },
    get cell() { return Math.round(wall.material.uniforms.uCell.value / LCD_PITCH) },
    get reach() { return wall.material.uniforms.uReach.value },
    get mode() { return state.mode },
    dispose() { wallGeo.dispose(); floorGeo.dispose(); wall.material.dispose(); floor.material.dispose() },
  }
  return api
}
