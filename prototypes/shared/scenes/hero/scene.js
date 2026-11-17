/**
 * "Creation": two procedural hands reach across a stippled cloud bank; at the end of the scroll a four-point star
 * ignites between the index fingertips. Scene module for shared/gl/harness.js.
 *
 *   const mod = await createScene({ THREE, renderer, size, look: 'full', treatment: 'bayer' })
 *   look 'full'  -> phosphor dither / ascii / halftone straight to the canvas (option treatment, default 'bayer')
 *   look 'lcd'   -> renders into the `target` it is handed (160x144 screen target) with a 4-shade palette
 *
 * The hands are sphere-traced in one fragment shader (smooth unions of tapered capsules that the CPU poses with
 * forward kinematics every frame), so there is no mesh to dispose: only render targets and one material.
 */
import { createDitherPass, LCD_PALETTES } from '../../dither/pass.js'
import { createTreatmentPass, PHOSPHOR } from '../../dither/ascii.js'
import { VERT, FRAG, NSEG } from './shaders.js'

export const beats = [
  { at: 0, id: '01', title: 'Apart', text: 'Two hands and a gap, still in the dark.' },
  { at: 0.45, id: '02', title: 'Reach', text: 'They drift together; nothing happens yet.' },
  { at: 0.85, id: '03', title: 'Contact', text: 'A spark where the fingers almost meet.' },
]

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

// ---------------------------------------------------------------- hand rig (units: palm length = 1)
const FINGERS = [
  { base: [1.0, 0, -0.3], L: [0.42, 0.26, 0.2], r: [0.095, 0.086, 0.077, 0.069], fan: -0.07 },
  { base: [1.02, 0, -0.1], L: [0.46, 0.29, 0.21], r: [0.098, 0.089, 0.079, 0.07], fan: -0.015 },
  { base: [0.98, 0, 0.1], L: [0.43, 0.27, 0.2], r: [0.093, 0.084, 0.074, 0.066], fan: 0.04 },
  { base: [0.9, 0, 0.29], L: [0.33, 0.2, 0.17], r: [0.081, 0.073, 0.065, 0.059], fan: 0.13 },
]
const PALM_Z = [-0.24, -0.08, 0.08, 0.24]

// Adam (left, relaxed, wrist limp) and God (right, index leading). Both are authored as right hands pointing +x;
// God is mirrored in x when placed. flex = [mcp, pip, dip] radians toward the palm.
const ADAM = {
  roll: 0.5, arm: 0.2, bend: -0.34, fingers: [[0.1, 0.08, 0.05], [0.52, 0.58, 0.32], [0.72, 0.68, 0.4], [0.9, 0.78, 0.45]],
  thumb: { yaw: [0.5, 0.35, 0.25], pitch: [0.15, 0.25, 0.3] }, spread: 1, mirror: false,
}
const GOD = {
  roll: 0.38, arm: 0.06, bend: 0.1, fingers: [[0.0, 0.0, 0.02], [0.6, 0.65, 0.35], [0.85, 0.9, 0.5], [1.05, 1.0, 0.55]],
  thumb: { yaw: [0.55, 0.4, 0.3], pitch: [0.2, 0.3, 0.35] }, spread: 0.7, mirror: true,
}

// scratch
const local = new Float32Array(NSEG * 8) // ax ay az ra bx by bz rb
const grp = new Uint8Array(NSEG)

function pushSeg(i, ax, ay, az, ra, bx, by, bz, rb, g) {
  local.set([ax, ay, az, ra, bx, by, bz, rb], i * 8)
  grp[i] = g
}

function buildLocal(pose, wob, fat) {
  let n = 0
  // palm: four slabs from the wrist line to the knuckles + thenar mound
  for (let i = 0; i < 4; i++) {
    const f = FINGERS[i]
    pushSeg(n++, 0, 0, PALM_Z[i] * 0.85, 0.15 * fat, f.base[0], 0.0, f.base[2], 0.135 * fat, 1)
  }
  pushSeg(n++, 0.04, -0.07, -0.2, 0.17 * fat, 0.46, -0.1, -0.42, 0.115 * fat, 1)
  // wrist (hand side) + forearm (two slabs, rotated only by the arm angle)
  pushSeg(n++, -0.02, 0, -0.06, 0.15 * fat, -0.4, 0, -0.06, 0.12 * fat, 1)
  pushSeg(n++, -0.2, 0, 0.0, 0.085 * fat, -2.0, 0, 0.05, 0.1 * fat, 0)
  pushSeg(n++, -0.2, 0, -0.12, 0.085 * fat, -2.0, 0, -0.19, 0.1 * fat, 0)
  // fingers
  for (let i = 0; i < 4; i++) {
    const f = FINGERS[i]
    const flex = pose.fingers[i]
    let x = f.base[0], y = f.base[1], z = f.base[2]
    let th = 0
    const sp = f.fan * pose.spread
    for (let j = 0; j < 3; j++) {
      th += flex[j] + (wob ? wob[i] * (j + 1) * 0.02 : 0)
      const nx = x + f.L[j] * Math.cos(th) * Math.cos(sp)
      const ny = y - f.L[j] * Math.sin(th)
      const nz = z + f.L[j] * Math.cos(th) * Math.sin(sp)
      pushSeg(n++, x, y, z, f.r[j] * fat, nx, ny, nz, f.r[j + 1] * fat, 1)
      x = nx; y = ny; z = nz
    }
  }
  // thumb
  {
    let x = 0.12, y = -0.04, z = -0.3
    const R = [0.125, 0.1, 0.085, 0.075]
    const L = [0.36, 0.3, 0.24]
    let yaw = 0
    let pit = 0
    for (let j = 0; j < 3; j++) {
      yaw += pose.thumb.yaw[j]
      pit += pose.thumb.pitch[j]
      const nx = x + L[j] * Math.cos(pit) * Math.cos(yaw)
      const ny = y - L[j] * Math.sin(pit)
      const nz = z - L[j] * Math.cos(pit) * Math.sin(yaw)
      pushSeg(n++, x, y, z, R[j] * fat, nx, ny, nz, R[j + 1] * fat, 1)
      x = nx; y = ny; z = nz
    }
  }
}

const tipOut = [0, 0, 0]
/** Poses a hand into world space; returns the index fingertip in tipOut. Writes uniform vec4 arrays. */
function placeHand(pose, wob, fat, mirror, scale, target, tilt, outA, outB, offset, lean) {
  buildLocal(pose, wob, fat)
  const cr = Math.cos(pose.roll), sr = Math.sin(pose.roll)
  const ca = Math.cos(pose.arm), sa = Math.sin(pose.arm)
  const cb = Math.cos(pose.arm + pose.bend), sb = Math.sin(pose.arm + pose.bend)
  const ct = Math.cos(-tilt), st = Math.sin(-tilt)
  const mx = mirror ? -1 : 1
  const out = new Float32Array(NSEG * 8)
  for (let i = 0; i < NSEG; i++) {
    const c = grp[i] === 0 ? ca : cb
    const s = grp[i] === 0 ? sa : sb
    for (let e = 0; e < 2; e++) {
      const o = i * 8 + e * 4
      let x = local[o], y = local[o + 1], z = local[o + 2]
      // roll about the finger axis, then arm/wrist bend about z, then mirror
      const y1 = y * cr - z * sr
      const z1 = y * sr + z * cr
      const x2 = x * c - y1 * s
      const y2 = x * s + y1 * c
      out[o] = x2 * mx * scale
      out[o + 1] = y2 * scale
      out[o + 2] = z1 * scale
      out[o + 3] = local[o + 3] * scale
    }
  }
  // index fingertip = last segment of finger 0 (segments 8,9,10)
  const ti = 10 * 8 + 4
  const tx = out[ti], ty = out[ti + 1], tz = out[ti + 2]
  const ox = target[0] - tx, oy = target[1] - ty, oz = target[2] - tz
  let cx = 0, cy = 0, cz = 0
  for (let i = 0; i < NSEG; i++) {
    for (let e = 0; e < 2; e++) {
      const o = i * 8 + e * 4
      const x = out[o] + ox, y = out[o + 1] + oy, z = out[o + 2] + oz
      // rig tilt about z (portrait recomposition)
      const rx = x * ct - y * st + lean[0]
      const ry = x * st + y * ct + lean[1]
      const v = e === 0 ? outA[offset + i] : outB[offset + i]
      v.set(rx, ry, z, out[o + 3])
      cx += rx; cy += ry; cz += z
    }
  }
  cx /= NSEG * 2; cy /= NSEG * 2; cz /= NSEG * 2
  let rad = 0
  for (let i = 0; i < NSEG; i++) {
    for (const v of [outA[offset + i], outB[offset + i]]) {
      rad = Math.max(rad, Math.hypot(v.x - cx, v.y - cy, v.z - cz) + v.w)
    }
  }
  const tx2 = tx + ox, ty2 = ty + oy
  tipOut[0] = tx2 * ct - ty2 * st + lean[0]
  tipOut[1] = tx2 * st + ty2 * ct + lean[1]
  tipOut[2] = tz + oz
  return { cx, cy, cz, rad }
}

const poseBlend = (a, b, t) => ({
  roll: lerp(a.roll, b.roll, t), arm: lerp(a.arm, b.arm, t), bend: lerp(a.bend, b.bend, t),
  fingers: a.fingers.map((f, i) => f.map((v, j) => lerp(v, b.fingers[i][j], t))),
  thumb: a.thumb, spread: lerp(a.spread, b.spread, t), mirror: a.mirror,
})

export async function createScene({ THREE, renderer, size, look = 'full', palette, treatment = 'bayer', cell, glyphCell, pixelRatio } = {}) {
  const lcd = look === 'lcd'
  const quadScene = new THREE.Scene()
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 80)

  const segA = Array.from({ length: NSEG * 2 }, () => new THREE.Vector4())
  const segB = Array.from({ length: NSEG * 2 }, () => new THREE.Vector4())
  const handSph = [new THREE.Vector4(0, 0, 0, 2), new THREE.Vector4(0, 0, 0, 2)]
  const tips = [new THREE.Vector3(), new THREE.Vector3()]
  const uniforms = {
    uRes: { value: new THREE.Vector2(160, 144) },
    uAspect: { value: 1 },
    uTanHalf: { value: Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) },
    uCamPos: { value: new THREE.Vector3(0, 0, 8) },
    uCamRot: { value: new THREE.Matrix3() },
    uTime: { value: 0 },
    uP: { value: 0 },
    uLight: { value: new THREE.Vector3(0.4, 0.8, 0.9) },
    uHand: { value: handSph },
    uTip: { value: tips },
    uSegA: { value: segA },
    uSegB: { value: segB },
    uContact: { value: new THREE.Vector3() },
    uFlareScr: { value: new THREE.Vector2() },
    uFlare: { value: 0 },
    uGlitter: { value: 0 },
    uTipScr: { value: [new THREE.Vector2(), new THREE.Vector2()] },
    uSpark: { value: new THREE.Vector2() },
    uOrbit: { value: new THREE.Vector2() },
    uLcd: { value: lcd ? 1 : 0 },
    uStarScale: { value: lcd ? 0.55 : 1 },
    uPtr: { value: new THREE.Vector3(0, 0, 0) },
    uRipple: { value: new THREE.Vector3(0, 0, -1) },
    uPulse: { value: new THREE.Vector3(0, 0, 0) },
  }
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  quadScene.add(quad)

  const pass = lcd
    ? createDitherPass(THREE, { width: 160, height: 144, palette: palette ?? LCD_PALETTES.dmg, contrast: 1.35, bias: 0.02 })
    : createTreatmentPass(THREE, { mode: treatment, palette: palette ?? PHOSPHOR, contrast: 1.5, bias: -0.06, ...(cell ? { cell } : {}), ...(glyphCell ? { glyphCell } : {}) })

  const view = { w: lcd ? 160 : 1, h: lcd ? 144 : 1, aspect: lcd ? 160 / 144 : 1, dpr: 1 }
  const state = { gap: 2.6, flare: 0, spark: [0, 0], sparkDamped: [0, 0], yaw: 0, pitch: 0, act: 0, dist: 8, down: false, rippleAge: -1 }
  const leanA = [0, 0]
  const leanB = [0, 0]
  const zero2 = [0, 0]
  const tmp = new THREE.Vector3()
  const mid = new THREE.Vector3()
  const rigA = [0, 0, 0]
  const rigB = [0, 0, 0]
  const wobA = [0, 0, 0, 0]
  const wobB = [0, 0, 0, 0]

  function resize(w, h, dpr = 1) {
    if (lcd) {
      view.w = 160; view.h = 144; view.aspect = 160 / 144
    } else {
      view.w = w; view.h = h; view.aspect = w / h; view.dpr = dpr
      const small = Math.min(w, h) < 520
      pass.setSize(w, h, dpr)
      // narrow stages get finer cells so the hands still read
      if (!cell) pass.setCell(small ? 2.5 : 3.4)
      pass.uniforms.uGap.value = small ? 0.28 : 0.4
    }
    camera.aspect = view.aspect
    camera.updateProjectionMatrix()
    uniforms.uAspect.value = view.aspect
    const lw = lcd ? 160 : pass.lowRT.width
    const lh = lcd ? 144 : pass.lowRT.height
    uniforms.uRes.value.set(lw, lh)
    uniforms.uStarScale.value = lcd ? 0.55 : clamp(0.85 + (900 - Math.min(h, 900)) / 1400, 0.85, 1.4)
  }

  function gapAt(p) {
    if (p < 0.8) return lerp(2.7, 0.26, ease(p / 0.8))
    return lerp(0.26, 0.07, smooth(0, 1, (p - 0.8) / 0.2))
  }
  const REDUCED_P = 0.9 // the composed still for prefers-reduced-motion: hands nearly touching, flare lit

  function update(ctx) {
    const reduced = ctx.reduced
    const p = reduced ? REDUCED_P : clamp(ctx.p, 0, 1)
    const time = reduced ? 3.2 : ctx.time
    const px = reduced ? 0 : ctx.pointer.sx
    const py = reduced ? 0 : ctx.pointer.sy
    const aspect = view.aspect
    const dt = Math.min(ctx.dt || 0.016, 0.05)
    const k = reduced ? 1 : 1 - Math.exp(-8 * dt)
    uniforms.uTime.value = time
    uniforms.uP.value = p

    // pointer presence (eased), position in the shader's screen space, click ripple
    state.act += ((reduced ? 0 : ctx.pointer.inside ? 1 : 0) - state.act) * (reduced ? 1 : 1 - Math.exp(-6 * dt))
    const pxs = px * aspect
    uniforms.uPtr.value.set(pxs, py, state.act)
    const down = !reduced && ctx.pointer.down && ctx.pointer.inside
    if (down && !state.down) { state.rippleAge = 0; uniforms.uRipple.value.x = pxs; uniforms.uRipple.value.y = py }
    state.down = down
    if (state.rippleAge >= 0) { state.rippleAge += dt; if (state.rippleAge > 3.5) state.rippleAge = -1 }
    uniforms.uRipple.value.z = state.rippleAge

    // composition: portrait tilts the whole rig into a diagonal
    const tilt = lerp(-0.1, 1.0, smooth(1.25, 0.65, aspect))
    const fat = lcd ? 1.34 : 1
    const scale = 1
    const gap = gapAt(p)
    state.gap = gap
    const bob = reduced ? 0 : Math.sin(time * 0.7)
    const bob2 = reduced ? 0 : Math.sin(time * 0.7 + 2.1)
    for (let i = 0; i < 4; i++) {
      wobA[i] = reduced ? 0 : Math.sin(time * 1.1 + i * 1.3)
      wobB[i] = reduced ? 0 : Math.sin(time * 0.9 + i * 1.7 + 1)
    }
    const dy = lerp(0.42, 0.0, smooth(0, 0.9, p))
    const tipR = 0.07
    const half = gap / 2 + tipR
    // Adam rests a touch lower and curls more; God arrives with the leading index finger
    const adam = poseBlend(ADAM, ADAM, 0)
    const god = poseBlend(GOD, GOD, 0)
    adam.fingers = adam.fingers.map((f, i) => (i === 0 ? [f[0] + 0.02 * (1 - p), f[1], f[2]] : f))
    const flareP = smooth(0.72, 0.92, p)
    const tgtA = [-half, -0.12 - dy * 0.5 + bob * 0.03, 0]
    const tgtB = [half, 0.1 + dy * 0.5 + bob2 * 0.03, 0]

    // lean: each hand drifts toward the pointer (world units ~ screen delta x camera reach). The pair is kept
    // apart so the fingertips can come close but never cross.
    const reach = state.act * (1 - 0.45 * smooth(0.8, 1, p)) * 0.2
    const wScale = state.dist * uniforms.uTanHalf.value
    const tipS = uniforms.uTipScr.value
    const leanTo = (lean, s) => {
      let lx = (pxs - s.x) * wScale * reach
      let ly = (py - s.y) * wScale * reach
      const m = Math.hypot(lx, ly)
      if (m > 0.32) { lx *= 0.32 / m; ly *= 0.32 / m }
      lean[0] += (lx - lean[0]) * k
      lean[1] += (ly - lean[1]) * k
    }
    leanTo(leanA, tipS[0])
    leanTo(leanB, tipS[1])
    {
      const c0 = Math.cos(-tilt), s0 = Math.sin(-tilt)
      const sx = (tgtB[0] - tgtA[0]) * c0 - (tgtB[1] - tgtA[1]) * s0
      const sy = (tgtB[0] - tgtA[0]) * s0 + (tgtB[1] - tgtA[1]) * c0
      const len = Math.hypot(sx, sy) || 1
      const ux = sx / len, uy = sy / len
      const along = (leanB[0] - leanA[0]) * ux + (leanB[1] - leanA[1]) * uy
      const c = 0.17 - len - along
      if (c > 0) {
        leanA[0] -= ux * c / 2; leanA[1] -= uy * c / 2
        leanB[0] += ux * c / 2; leanB[1] += uy * c / 2
      }
    }
    adam.arm += leanA[1] * 0.3
    god.arm += leanB[1] * 0.3

    const hA = placeHand(adam, wobA, fat, false, scale, tgtA, tilt, segA, segB, 0, leanA)
    tips[0].set(tipOut[0], tipOut[1], tipOut[2])
    handSph[0].set(hA.cx, hA.cy, hA.cz, hA.rad)
    const hB = placeHand(god, wobB, fat, true, scale, tgtB, tilt, segA, segB, NSEG, leanB)
    tips[1].set(tipOut[0], tipOut[1], tipOut[2])
    handSph[1].set(hB.cx, hB.cy, hB.cz, hB.rad)
    mid.copy(tips[0]).add(tips[1]).multiplyScalar(0.5)
    uniforms.uContact.value.copy(mid)

    // camera: slow dolly + orbit with the scroll, pointer orbits and tilts, framing fits the rig
    const tanH = uniforms.uTanHalf.value
    const port = smooth(1.25, 0.65, aspect)
    const hx = gap / 2 + lerp(3.1, 3.6, port)
    const sT = Math.abs(Math.sin(tilt)), cT = Math.cos(tilt)
    const halfW = hx * cT + 0.95 * sT + 0.3
    const halfH = hx * sT + 0.95 * cT + 0.55
    let dist = Math.max(halfW / (tanH * aspect), halfH / tanH)
    dist *= lerp(1.0, 0.92, ease(p)) * (lcd ? 0.8 : 1)
    state.dist = dist
    const yawBase = lerp(-0.22, 0.12, ease(p)) + (reduced ? 0 : Math.sin(time * 0.17) * 0.03)
    const yaw = yawBase - px * 0.3
    const pitch = 0.1 + py * 0.14 + lerp(0.1, 0.0, p)
    const tgt = tmp.set(0, lerp(-0.5, -0.3, p), 0)
    camera.position.set(
      tgt.x + dist * Math.sin(yaw) * Math.cos(pitch),
      tgt.y + dist * Math.sin(pitch),
      tgt.z + dist * Math.cos(yaw) * Math.cos(pitch),
    )
    camera.lookAt(tgt)
    camera.updateMatrixWorld()
    uniforms.uCamPos.value.copy(camera.position)
    uniforms.uCamRot.value.setFromMatrix4(camera.matrixWorld)
    uniforms.uOrbit.value.set(-yaw * 0.9, pitch * 0.9)

    // light follows the pointer: the dither pattern shifts across the form
    uniforms.uLight.value.set(0.45 + px * 1.7, 0.85 + py * 1.0, 0.4).normalize()

    // screen-space positions (same space as the shader's p) of the tips and the flare
    const toScr = (v, out) => { tmp.copy(v).project(camera); out.set(tmp.x * aspect, tmp.y) }
    toScr(tips[0], uniforms.uTipScr.value[0])
    toScr(tips[1], uniforms.uTipScr.value[1])
    toScr(mid, uniforms.uFlareScr.value)

    // hover: pointer near a fingertip (or the gap) brightens the spark
    const hov = (s) => smooth(0.42, 0.04, Math.hypot(pxs - s.x, py - s.y))
    const hoverMid = hov(uniforms.uFlareScr.value)
    const target0 = Math.max(hov(uniforms.uTipScr.value[0]), hoverMid * 0.8)
    const target1 = Math.max(hov(uniforms.uTipScr.value[1]), hoverMid * 0.8)
    state.sparkDamped[0] += ((ctx.pointer.inside ? target0 : 0) - state.sparkDamped[0]) * k
    state.sparkDamped[1] += ((ctx.pointer.inside ? target1 : 0) - state.sparkDamped[1]) * k
    uniforms.uSpark.value.set(state.sparkDamped[0], state.sparkDamped[1])
    const hoverBoost = Math.max(state.sparkDamped[0], state.sparkDamped[1])
    uniforms.uFlare.value = clamp(flareP + hoverBoost * 0.16 * smooth(0.3, 0.8, p), 0, 1) * (p > 0.3 ? 1 : 0)
    uniforms.uGlitter.value = clamp(smooth(0.76, 0.98, p) + hoverBoost * 0.35 * smooth(0.5, 0.9, p), 0, 1)
    // payoff: one ring tied to the scroll (so a still has it), one looping outward from the contact
    uniforms.uPulse.value.set(smooth(0.8, 1.0, p), reduced ? 0.4 : (time * 0.27) % 1, smooth(0.78, 0.92, p))
    if (!lcd) pass.uniforms.uTime.value = time
  }

  function render(rend, ctx, target) {
    if (lcd) {
      pass.render(rend, quadScene, quadCamera, target ?? null)
    } else {
      pass.render(rend, quadScene, quadCamera, target ?? null)
    }
  }

  function dispose() {
    pass.dispose()
    material.dispose()
    quad.geometry.dispose()
  }

  if (size) resize(size.w, size.h, size.dpr)
  else resize(lcd ? 160 : 1280, lcd ? 144 : 720, 1)

  return {
    scene: quadScene,
    camera,
    animated: true,
    look,
    pass,
    beats,
    update,
    resize,
    render,
    dispose,
    setTreatment(mode) { if (!lcd) { pass.setMode(mode); resize(view.w, view.h, view.dpr) } },
  }
}
