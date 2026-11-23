/**
 * orbit-sat-pbr.js : photoreal PBR build of the orbit satellite (tier '3d', dark theme only).
 *
 *   buildPbrSat(T, { bodyG, wingPivot, dishPitch }, own) ->
 *     { setVisible(b), setTheme(th), onPose({ cw, amp, t }), setExposure(v), setSunDir(vec3), envIntensity }
 *
 * Same conventions and dimensions as orbit-sat.js (+x flight, +y zenith, -y nadir, wings along +/-z, bus length 1).
 * Meshes are parented to the rig groups made by orbit-sat.js so its pose logic drives them.
 * Everything is generated in code: canvas MLI / cell / equipment atlases with normal and
 * roughness-metalness maps, a half-float equirect environment (dark space, warm sun disk, blue Earth glow)
 * that three prefilters itself (PMREM) because it is assigned through material.envMap, never scene.environment.
 * Geometry is merged per (material, parent): 9 draw calls.
 */

const rad = (d) => (d * Math.PI) / 180
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

function rng32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GIMBAL = [-0.3, 0.735, 0]
const DISH_R = 0.26
const DISH_DEPTH = 0.07
const DISH_T = 0.012
const DISH_FOCAL_Y = 0.18
const SUN_DEF = [0.78, 0.32, -0.54]

/* ------------------------------------------------------------------ canvases */

function img(S, W = S, H = S) {
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')
  const im = ctx.createImageData(W, H)
  return { cv, ctx, im, d: im.data, W, H }
}
const flush = (o) => o.ctx.putImageData(o.im, 0, 0)
const byte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)

function worleyMake(G, sig, rnd) {
  const n = G * G
  const o = { G, sx: new Float32Array(n), sy: new Float32Array(n), tx: new Float32Array(n), ty: new Float32Array(n), tn: new Float32Array(n) }
  for (let i = 0; i < n; i++) {
    o.sx[i] = rnd()
    o.sy[i] = rnd()
    o.tx[i] = (rnd() + rnd() + rnd() - 1.5) * sig * 1.6
    o.ty[i] = (rnd() + rnd() + rnd() - 1.5) * sig * 1.6
    o.tn[i] = rnd()
  }
  return o
}
const WO = { gx: 0, gy: 0, e: 0, tone: 0 }
function worley(o, u, v) {
  const G = o.G
  const cx = Math.floor(u)
  const cy = Math.floor(v)
  let d1 = 1e9
  let d2 = 1e9
  let i1 = 0
  let i2 = 0
  for (let dy = -1; dy <= 1; dy++) {
    const yy = cy + dy
    const wy = ((yy % G) + G) % G
    for (let dx = -1; dx <= 1; dx++) {
      const xx = cx + dx
      const wx = ((xx % G) + G) % G
      const k = wy * G + wx
      const ex = xx + o.sx[k] - u
      const ey = yy + o.sy[k] - v
      const d = ex * ex + ey * ey
      if (d < d1) {
        d2 = d1
        i2 = i1
        d1 = d
        i1 = k
      } else if (d < d2) {
        d2 = d
        i2 = k
      }
    }
  }
  const t = smooth((Math.sqrt(d2) - Math.sqrt(d1)) / 0.35)
  const a = 0.5 + 0.5 * t
  WO.gx = o.tx[i1] * a + o.tx[i2] * (1 - a)
  WO.gy = o.ty[i1] * a + o.ty[i2] * (1 - a)
  WO.e = t
  WO.tone = o.tn[i1]
}

/** 2x2 atlas of MLI blankets (gold, silver, bronze kapton, white beta cloth) with crinkle normals. */
function paintFoil(S) {
  const C = img(S)
  const N = img(S)
  const M = img(S)
  const h = S / 2
  const defs = [
    { c: [238, 168, 62], tone: 0.14, rough: 0.36, metal: 0.82, crease: 0.3, sig: 0.34 },
    { c: [208, 212, 220], tone: 0.08, rough: 0.3, metal: 1, crease: 0.22, sig: 0.34 },
    { c: [160, 98, 40], tone: 0.16, rough: 0.44, metal: 0.78, crease: 0.34, sig: 0.3 },
    { c: [224, 224, 216], tone: 0.05, rough: 0.72, metal: 0.04, crease: 0.12, sig: 0.16 },
  ]
  defs.forEach((df, ti) => {
    const ox = (ti % 2) * h
    const oy = (ti >> 1) * h
    const rnd = rng32(101 + ti * 17)
    // tileable ridged value-noise height field: long soft crinkles with sharp creases, plus fine wrinkles
    const lat = (G) => Float32Array.from({ length: G * G }, () => rnd())
    const octs = [
      { G: 5, w: 1.0, L: lat(5) },
      { G: 11, w: 0.3, L: lat(11) },
      { G: 26, w: 0.07, L: lat(26) },
    ]
    const hf = new Float32Array(h * h)
    const cr = new Float32Array(h * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < h; x++) {
        let ht = 0
        let ck = 0
        for (const o of octs) {
          const fx = (x / h) * o.G
          const fy = (y / h) * o.G
          const ix = Math.floor(fx)
          const iy = Math.floor(fy)
          const tx = smooth(fx - ix)
          const ty = smooth(fy - iy)
          const g = o.G
          const a0 = o.L[(iy % g) * g + (ix % g)]
          const a1 = o.L[(iy % g) * g + ((ix + 1) % g)]
          const a2 = o.L[((iy + 1) % g) * g + (ix % g)]
          const a3 = o.L[((iy + 1) % g) * g + ((ix + 1) % g)]
          const n = a0 + (a1 - a0) * tx + (a2 - a0) * ty + (a0 - a1 - a2 + a3) * tx * ty
          const d = Math.abs(2 * n - 1)
          ht += o.w * (1 - d) * (1 - d)
          ck += o.w * (1 - smooth(d / 0.16))
        }
        hf[y * h + x] = ht
        cr[y * h + x] = ck
      }
    }
    const Bw = worleyMake(34, df.sig * 0.22, rnd)
    const kk = df.sig < 0.2 ? 6 : df.sig > 0.3 ? 17 : 15
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < h; x++) {
        const xl = (x + h - 1) % h
        const xr = (x + 1) % h
        const yu = (y + h - 1) % h
        const yd = (y + 1) % h
        let gx = (hf[y * h + xr] - hf[y * h + xl]) * 0.5 * kk
        let gy = (hf[yd * h + x] - hf[yu * h + x]) * 0.5 * kk
        worley(Bw, ((x + 0.5) / h) * Bw.G, ((y + 0.5) / h) * Bw.G)
        gx += WO.gx
        gy += WO.gy
        const toneB = WO.tone
        const dk = Math.min(1, cr[y * h + x] * 0.55) * df.crease
        const sh = (1 + (toneB - 0.5) * df.tone * 2) * (1 - dk) * (1 + 0.08 * (gx * 0.5 - gy * 0.7))
        const il = 1 / Math.sqrt(gx * gx + gy * gy + 1)
        const i = ((oy + y) * S + ox + x) * 4
        C.d[i] = byte(df.c[0] * sh)
        C.d[i + 1] = byte(df.c[1] * sh)
        C.d[i + 2] = byte(df.c[2] * sh)
        C.d[i + 3] = 255
        N.d[i] = byte((-gx * il * 0.5 + 0.5) * 255)
        N.d[i + 1] = byte((gy * il * 0.5 + 0.5) * 255)
        N.d[i + 2] = byte((il * 0.5 + 0.5) * 255)
        N.d[i + 3] = 255
        M.d[i] = 0
        M.d[i + 1] = byte((df.rough * (0.85 + 0.3 * toneB) + dk * 0.3) * 255)
        M.d[i + 2] = byte(df.metal * 255)
        M.d[i + 3] = 255
      }
    }
  })
  flush(C)
  flush(N)
  flush(M)
  return { c: C.cv, n: N.cv, m: M.cv }
}

/** 2x2 atlas: brushed aluminium, white louvre radiator, dark anodised plate, carbon weave. */
function paintStruct(S) {
  const C = img(S)
  const N = img(S)
  const M = img(S)
  const h = S / 2
  const rnd = rng32(7)
  const px = (ox, oy, x, y, r, g, b, nx, ny, ro, me) => {
    const i = ((oy + y) * S + ox + x) * 4
    C.d[i] = byte(r)
    C.d[i + 1] = byte(g)
    C.d[i + 2] = byte(b)
    C.d[i + 3] = 255
    const l = 1 / Math.sqrt(nx * nx + ny * ny + 1)
    N.d[i] = byte((nx * l * 0.5 + 0.5) * 255)
    N.d[i + 1] = byte((ny * l * 0.5 + 0.5) * 255)
    N.d[i + 2] = byte((l * 0.5 + 0.5) * 255)
    N.d[i + 3] = 255
    M.d[i] = 0
    M.d[i + 1] = byte(ro * 255)
    M.d[i + 2] = byte(me * 255)
    M.d[i + 3] = 255
  }
  // tile 0 brushed aluminium
  {
    const streak = new Float32Array(h)
    let v = 0
    for (let y = 0; y < h; y++) {
      v = v * 0.55 + (rnd() - 0.5) * 0.9
      streak[y] = v
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < h; x++) {
        const n = rnd() - 0.5
        const sh = 1 + streak[y] * 0.1 + n * 0.05 + (x / h - 0.5) * 0.04
        px(0, 0, x, y, 178 * sh, 184 * sh, 194 * sh, n * 0.05, streak[y] * 0.2 + n * 0.08, 0.3 + streak[y] * 0.08, 1)
      }
    }
  }
  // tile 1 radiator with louvres, frame and screws
  {
    const pitch = 16
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < h; x++) {
        const n = rnd() - 0.5
        const border = 22
        const inFrame = x < border || y < border || x >= h - border || y >= h - border
        if (inFrame) {
          let s = 1 + n * 0.03
          let nx = 0
          let ny = 0
          const ed = Math.min(x, y, h - 1 - x, h - 1 - y)
          if (ed === border - 1) s *= 0.7
          if (ed === 0) s *= 0.8
          // screws every 64 px along the border
          const sx = ((x + 32) % 64) - 32
          const sy = ((y + 32) % 64) - 32
          const on = (x < border || x >= h - border) && Math.hypot(x < border ? x - 11 : x - (h - 11), sy) < 4.5
          const on2 = (y < border || y >= h - border) && Math.hypot(sx, y < border ? y - 11 : y - (h - 11)) < 4.5
          if (on || on2) {
            s *= 0.45
            nx = n * 0.4
          }
          px(h, 0, x, y, 218 * s, 220 * s, 224 * s, nx, ny, 0.5, 0.3)
        } else {
          const ph = (y - border) % pitch
          let s = 1 + n * 0.02
          let ny = 0
          let a = 1
          if (ph < 3) {
            a = 0.62
            ny = -0.8
          } else {
            s *= 1 - (ph - 3) * 0.006
            ny = ph < 9 ? 0.3 : 0.05
          }
          if (((x - border) % 120) < 2) a *= 0.72
          px(h, 0, x, y, 238 * s * a, 240 * s * a, 242 * s * a, 0, ny, 0.52 + (ph < 3 ? 0.2 : 0), 0.04)
        }
      }
    }
  }
  // tile 2 dark anodised equipment plate with a silver data plate (bars and fields, no text)
  {
    const pl = { x0: 0.14 * h, x1: 0.86 * h, y0: 0.3 * h, y1: 0.7 * h }
    const bars = []
    {
      let bx = pl.x0 + 14
      while (bx < pl.x0 + (pl.x1 - pl.x0) * 0.6) {
        const w = 2 + Math.floor(rnd() * 5)
        bars.push([bx, bx + w])
        bx += w + 2 + Math.floor(rnd() * 5)
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < h; x++) {
        const n = rnd() - 0.5
        let r = 32 + n * 8
        let g = 34 + n * 8
        let b = 42 + n * 9
        let ro = 0.52
        let me = 0.5
        let nx = n * 0.1
        let ny = n * 0.1
        const inPlate = x >= pl.x0 && x < pl.x1 && y >= pl.y0 && y < pl.y1
        if (inPlate) {
          r = 192 + n * 6
          g = 196 + n * 6
          b = 202 + n * 6
          ro = 0.34
          me = 0.92
          nx = ny = 0
          const edge = Math.min(x - pl.x0, pl.x1 - 1 - x, y - pl.y0, pl.y1 - 1 - y)
          if (edge < 3) {
            r *= 0.6
            g *= 0.6
            b *= 0.62
          }
          const lx = x - pl.x0
          const ly = y - pl.y0
          if (ly > 14 && ly < (pl.y1 - pl.y0) * 0.55) {
            for (const bb of bars) if (x >= bb[0] && x < bb[1]) { r = g = b = 22; ro = 0.6 }
          }
          const fx = lx - (pl.x1 - pl.x0) * 0.64
          if (fx > 0 && fx < (pl.x1 - pl.x0) * 0.32) {
            const row = Math.floor((ly - 14) / 30)
            if (row >= 0 && row < 5 && (ly - 14) % 30 < 14) {
              const k = Math.floor(fx / (3 + (row % 3) * 5))
              if (k % 2 === 0) { r = g = b = 26; ro = 0.6 }
            }
          }
          if (ly > (pl.y1 - pl.y0) * 0.7 && ly < (pl.y1 - pl.y0) * 0.86 && lx > 12 && lx < (pl.x1 - pl.x0) * 0.5) {
            r = 190; g = 36; b = 28; me = 0.1; ro = 0.6
          }
          for (const [cx, cy] of [[pl.x0 + 8, pl.y0 + 8], [pl.x1 - 8, pl.y0 + 8], [pl.x0 + 8, pl.y1 - 8], [pl.x1 - 8, pl.y1 - 8]]) {
            if (Math.hypot(x - cx, y - cy) < 3.5) { r = g = b = 90 }
          }
        } else {
          // connector pin row above the plate
          if (y > 0.14 * h && y < 0.2 * h && x > 0.2 * h && x < 0.8 * h) {
            const d = Math.hypot(((x - 0.2 * h) % 26) - 13, y - 0.17 * h)
            if (d < 5.5) { r = 210; g = 165; b = 70; me = 1; ro = 0.3 }
          }
          // grid of fasteners at the corners
          for (const [cx, cy] of [[14, 14], [h - 14, 14], [14, h - 14], [h - 14, h - 14]]) {
            if (Math.hypot(x - cx, y - cy) < 6) { r = g = b = 150; me = 1; ro = 0.35 }
          }
        }
        px(0, h, x, y, r, g, b, nx, ny, ro, me)
      }
    }
  }
  // tile 3 carbon twill weave
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < h; x++) {
      const a = ((x >> 3) + (y >> 3)) & 1
      const v = a ? (x & 7) / 7 : (y & 7) / 7
      const s = 0.55 + 0.9 * v
      px(h, h, x, y, 32 * s, 33 * s, 39 * s, a ? (v - 0.5) * 0.7 : 0, a ? 0 : (v - 0.5) * 0.7, 0.3 + (rnd() - 0.5) * 0.04, 0.15)
    }
  }
  flush(C)
  flush(N)
  flush(M)
  return { c: C.cv, n: N.cv, m: M.cv }
}

/** One solar panel: silver frame, 10 x 8 blue-black cells with cut corners, busbars, fingers. */
function paintCells(S) {
  const CC = img(S)
  const MC = img(S)
  const c = CC.ctx
  const m = MC.ctx
  c.fillStyle = 'rgb(180,186,198)'
  c.fillRect(0, 0, S, S)
  m.fillStyle = 'rgb(0,88,236)'
  m.fillRect(0, 0, S, S)
  const mg = 28
  c.fillStyle = 'rgb(44,48,58)'
  c.fillRect(mg, mg, S - 2 * mg, S - 2 * mg)
  m.fillStyle = 'rgb(0,150,150)'
  m.fillRect(mg, mg, S - 2 * mg, S - 2 * mg)
  const cols = 10
  const rows = 8
  const cw = (S - 2 * mg) / cols
  const ch = (S - 2 * mg) / rows
  const rnd = rng32(55)
  const gap = 3
  const oct = (x, y, w, hh, k) => {
    const p = new Path2D()
    p.moveTo(x + k, y)
    p.lineTo(x + w - k, y)
    p.lineTo(x + w, y + k)
    p.lineTo(x + w, y + hh - k)
    p.lineTo(x + w - k, y + hh)
    p.lineTo(x + k, y + hh)
    p.lineTo(x, y + hh - k)
    p.lineTo(x, y + k)
    p.closePath()
    return p
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = mg + i * cw + gap
      const y = mg + j * ch + gap
      const w = cw - 2 * gap
      const hh = ch - 2 * gap
      const p = oct(x, y, w, hh, 9)
      const t = rnd()
      const g = c.createLinearGradient(x, y, x + w * 0.4, y + hh)
      g.addColorStop(0, `rgb(${22 + t * 8},${36 + t * 12},${96 + t * 26})`)
      g.addColorStop(1, `rgb(${10 + t * 5},${17 + t * 7},${54 + t * 16})`)
      c.fillStyle = g
      c.fill(p)
      m.fillStyle = 'rgb(0,26,120)'
      m.fill(p)
      // faint AR coating streak
      const g2 = c.createLinearGradient(x, y, x + w, y + hh * 0.6)
      g2.addColorStop(0, 'rgba(70,110,220,0)')
      g2.addColorStop(0.5, 'rgba(70,110,220,0.14)')
      g2.addColorStop(1, 'rgba(70,110,220,0)')
      c.fillStyle = g2
      c.fill(p)
      // fingers
      c.fillStyle = 'rgba(120,150,230,0.045)'
      for (let f = 6; f < hh - 2; f += 6) c.fillRect(x + 3, y + f, w - 6, 1)
      // busbars
      for (const bx of [0.25, 0.5, 0.75]) {
        c.fillStyle = 'rgba(190,198,218,0.95)'
        c.fillRect(Math.round(x + w * bx) - 1, y + 2, 3, hh - 4)
        m.fillStyle = 'rgb(0,60,240)'
        m.fillRect(Math.round(x + w * bx) - 1, y + 2, 2.4, hh - 4)
      }
      // interconnect tabs between rows
      if (j < rows - 1) {
        c.fillStyle = 'rgb(170,176,190)'
        c.fillRect(x + w * 0.5 - 4, y + hh, 8, gap * 2)
      }
    }
  }
  c.strokeStyle = 'rgb(86,92,104)'
  c.lineWidth = 2
  c.strokeRect(mg - 1, mg - 1, S - 2 * mg + 2, S - 2 * mg + 2)
  for (const [fx, fy] of [[14, 14], [S - 14, 14], [14, S - 14], [S - 14, S - 14], [S / 2, 14], [S / 2, S - 14], [14, S / 2], [S - 14, S / 2]]) {
    c.fillStyle = 'rgb(226,230,238)'
    c.beginPath()
    c.arc(fx, fy, 5, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = 'rgb(90,96,108)'
    c.beginPath()
    c.arc(fx, fy, 2, 0, Math.PI * 2)
    c.fill()
  }
  return { c: CC.cv, m: MC.cv }
}

function paintDish() {
  const cv = document.createElement('canvas')
  cv.width = 512
  cv.height = 128
  const c = cv.getContext('2d')
  c.fillStyle = 'rgb(238,240,244)'
  c.fillRect(0, 0, 512, 128)
  c.fillStyle = 'rgba(70,78,96,0.22)'
  for (let k = 0; k < 24; k++) c.fillRect(Math.round((k / 24) * 512) - 1, 0, 2, 128)
  for (const v of [0.3, 0.55, 0.78]) {
    c.fillStyle = 'rgba(70,78,96,0.14)'
    c.fillRect(0, v * 128, 512, 1.5)
  }
  return cv
}

function paintSheen() {
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 64
  const c = cv.getContext('2d')
  c.fillStyle = '#000'
  c.fillRect(0, 0, 256, 64)
  c.save()
  c.transform(1, 0, -0.4, 1, 0.2 * 256, 0)
  const g = c.createLinearGradient(256 * 0.36, 0, 256 * 0.64, 0)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.5, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = g
  c.fillRect(-256, 0, 256 * 3, 64)
  c.restore()
  return cv
}

function paintAO() {
  const cv = document.createElement('canvas')
  cv.width = 64
  cv.height = 64
  const c = cv.getContext('2d')
  const g = c.createRadialGradient(32, 32, 4, 32, 32, 32)
  g.addColorStop(0, 'rgba(0,0,0,0.62)')
  g.addColorStop(0.55, 'rgba(0,0,0,0.3)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = g
  c.fillRect(0, 0, 64, 64)
  return cv
}

/** Half-float equirect: dark space, warm sun disk, blue Earth glow from below, thin limb band. */
function makeEnv(T) {
  const W = 256
  const H = 128
  const data = new Uint16Array(W * H * 4)
  const S = new T.Vector3(...SUN_DEF).normalize()
  const hf = T.DataUtils.toHalfFloat
  for (let j = 0; j < H; j++) {
    const lat = ((j + 0.5) / H - 0.5) * Math.PI
    const y = Math.sin(lat)
    const cl = Math.cos(lat)
    for (let i = 0; i < W; i++) {
      const lon = ((i + 0.5) / W - 0.5) * Math.PI * 2
      const x = cl * Math.cos(lon)
      const z = cl * Math.sin(lon)
      const d = x * S.x + y * S.y + z * S.z
      let r = 0.004
      let g = 0.005
      let b = 0.011
      if (y < 0.04) {
        const t = smooth((0.04 - y) / 1.04)
        const e = Math.pow(t, 0.6)
        const lit = Math.max(0, d) * e
        r += 0.04 * e + 0.4 * lit
        g += 0.1 * e + 0.26 * lit
        b += 0.26 * e + 0.1 * lit
      }
      if (y > 0) {
        const k = Math.pow(y, 0.6) * 0.16
        r += k * 0.7
        g += k * 0.85
        b += k * 1.1
      }
      const limb = Math.exp(-(((y + 0.015) / 0.055) ** 2))
      r += 0.2 * limb
      g += 0.5 * limb
      b += 1.0 * limb
      const ang = Math.acos(clamp(d, -1, 1))
      if (ang < rad(3.4)) {
        r += 70
        g += 62
        b += 48
      } else {
        const hh = Math.exp(-((ang / rad(9)) ** 2))
        const wide = Math.exp(-ang / rad(46))
        r += 7 * hh + 1.3 * wide
        g += 5.8 * hh + 1.05 * wide
        b += 4.2 * hh + 0.75 * wide
      }
      const k = (j * W + i) * 4
      data[k] = hf(r)
      data[k + 1] = hf(g)
      data[k + 2] = hf(b)
      data[k + 3] = hf(1)
    }
  }
  const tex = new T.DataTexture(data, W, H, T.RGBAFormat, T.HalfFloatType)
  tex.mapping = T.EquirectangularReflectionMapping
  tex.colorSpace = T.LinearSRGBColorSpace
  tex.minFilter = T.LinearFilter
  tex.magFilter = T.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

/* ------------------------------------------------------------------ geometry helpers */

function chamferGeo(T, w, h, d, c) {
  const H = [w / 2, h / 2, d / 2]
  const P = []
  const N = []
  const U = []
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const uvOf = (p, n) => {
    let a = 0
    if (Math.abs(n[1]) > Math.abs(n[a]) + 1e-6) a = 1
    if (Math.abs(n[2]) > Math.abs(n[a]) + 1e-6) a = 2
    const i = (a + 1) % 3
    const j = (a + 2) % 3
    return [p[i] / (2 * H[i]) + 0.5, p[j] / (2 * H[j]) + 0.5]
  }
  const tri = (a, b, cc, n) => {
    const e1 = sub(b, a)
    const e2 = sub(cc, a)
    const cx = e1[1] * e2[2] - e1[2] * e2[1]
    const cy = e1[2] * e2[0] - e1[0] * e2[2]
    const cz = e1[0] * e2[1] - e1[1] * e2[0]
    const o = cx * n[0] + cy * n[1] + cz * n[2] < 0 ? [a, cc, b] : [a, b, cc]
    for (const p of o) {
      P.push(p[0], p[1], p[2])
      N.push(n[0], n[1], n[2])
      U.push(...uvOf(p, n))
    }
  }
  const quad = (a, b, cc, dd, n) => {
    tri(a, b, cc, n)
    tri(a, cc, dd, n)
  }
  const mk = (...v) => v
  for (let a = 0; a < 3; a++) {
    const i = (a + 1) % 3
    const j = (a + 2) % 3
    for (const s of [-1, 1]) {
      const pt = (si, sj) => {
        const p = [0, 0, 0]
        p[a] = s * H[a]
        p[i] = si * (H[i] - c)
        p[j] = sj * (H[j] - c)
        return p
      }
      const n = [0, 0, 0]
      n[a] = s
      quad(pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1), n)
    }
  }
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 3; b++) {
      const e = 3 - a - b
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          const p = (se, onA) => {
            const q = [0, 0, 0]
            q[a] = onA ? sa * H[a] : sa * (H[a] - c)
            q[b] = onA ? sb * (H[b] - c) : sb * H[b]
            q[e] = se * (H[e] - c)
            return q
          }
          const n = [0, 0, 0]
          n[a] = sa * 0.7071
          n[b] = sb * 0.7071
          quad(p(-1, true), p(1, true), p(1, false), p(-1, false), n)
        }
      }
    }
  }
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const n = [sx * 0.5774, sy * 0.5774, sz * 0.5774]
        tri(mk(sx * H[0], sy * (H[1] - c), sz * (H[2] - c)), mk(sx * (H[0] - c), sy * H[1], sz * (H[2] - c)), mk(sx * (H[0] - c), sy * (H[1] - c), sz * H[2]), n)
      }
    }
  }
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3))
  g.setAttribute('normal', new T.Float32BufferAttribute(N, 3))
  g.setAttribute('uv', new T.Float32BufferAttribute(U, 2))
  return g
}

/** Revolved shell. strips: arrays of rings [r, y, nr, ny, v]. Winding auto-oriented from normals. */
function latheGeo(T, strips, segs) {
  const P = []
  const N = []
  const U = []
  const I = []
  let base = 0
  for (const ring of strips) {
    const cols = segs + 1
    for (const rg of ring) {
      for (let j = 0; j <= segs; j++) {
        const t = (j / segs) * Math.PI * 2
        const c = Math.cos(t)
        const s = Math.sin(t)
        P.push(rg[0] * c, rg[1], rg[0] * s)
        N.push(rg[2] * c, rg[3], rg[2] * s)
        U.push(j / segs, rg[4])
      }
    }
    // orientation check on the first quad
    const p = (k) => [P[(base + k) * 3], P[(base + k) * 3 + 1], P[(base + k) * 3 + 2]]
    const a = p(0)
    const b = p(cols)
    const cc = p(cols + 1)
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2 = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]]
    const cx = e1[1] * e2[2] - e1[2] * e2[1]
    const cy = e1[2] * e2[0] - e1[0] * e2[2]
    const cz = e1[0] * e2[1] - e1[1] * e2[0]
    const nn = [N[(base + 0) * 3] + N[(base + cols) * 3], N[(base + 0) * 3 + 1] + N[(base + cols) * 3 + 1], N[(base + 0) * 3 + 2] + N[(base + cols) * 3 + 2]]
    const flip = cx * nn[0] + cy * nn[1] + cz * nn[2] < 0
    for (let i = 0; i < ring.length - 1; i++) {
      for (let j = 0; j < segs; j++) {
        const A = base + i * cols + j
        const B = base + (i + 1) * cols + j
        const C = B + 1
        const D = A + 1
        if (flip) I.push(A, C, B, A, D, C)
        else I.push(A, B, C, A, C, D)
      }
    }
    base += ring.length * cols
  }
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3))
  g.setAttribute('normal', new T.Float32BufferAttribute(N, 3))
  g.setAttribute('uv', new T.Float32BufferAttribute(U, 2))
  g.setIndex(I)
  return g
}

function profNormals(pts) {
  const out = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const tr = b[0] - a[0]
    const ty = b[1] - a[1]
    const l = Math.hypot(tr, ty) || 1
    out.push([ty / l, -tr / l])
  }
  return out
}

/* ------------------------------------------------------------------ the build */

export function buildPbrSat(T, rig, own) {
  const { bodyG, wingPivot, dishPitch } = rig
  const V = (x, y, z) => new T.Vector3(x, y, z)
  const track = (o) => {
    own.push(o)
    return o
  }

  // textures
  const foil = paintFoil(1024)
  const stru = paintStruct(1024)
  const cell = paintCells(1024)
  const dishCv = paintDish()
  const mkTex = (cv, srgb, wrap) => {
    const t = track(new T.CanvasTexture(cv))
    t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace
    t.anisotropy = 8
    if (wrap) {
      t.wrapS = T.RepeatWrapping
      t.wrapT = T.RepeatWrapping
    }
    return t
  }
  const tx = {
    foilC: mkTex(foil.c, true),
    foilN: mkTex(foil.n, false),
    foilM: mkTex(foil.m, false),
    stC: mkTex(stru.c, true),
    stN: mkTex(stru.n, false),
    stM: mkTex(stru.m, false),
    ceC: mkTex(cell.c, true),
    ceM: mkTex(cell.m, false),
    dish: mkTex(dishCv, true, true),
    sheen: mkTex(paintSheen(), true),
    ao: mkTex(paintAO(), true),
  }
  tx.sheen.channel = 1
  const envTex = track(makeEnv(T))

  // materials
  const base = {}
  const phys = (key, o) => {
    const m = track(new T.MeshPhysicalMaterial({ envMap: envTex, ...o }))
    base[key] = m.envMapIntensity
    m.userData.envKey = key
    return m
  }
  const M = {
    foil: phys('foil', {
      map: tx.foilC, normalMap: tx.foilN, normalScale: new T.Vector2(1.1, 1.1), roughnessMap: tx.foilM, metalnessMap: tx.foilM,
      roughness: 1, metalness: 1, vertexColors: true, envMapIntensity: 1.5, clearcoat: 0.2, clearcoatRoughness: 0.3,
    }),
    struct: phys('struct', {
      map: tx.stC, normalMap: tx.stN, roughnessMap: tx.stM, metalnessMap: tx.stM, roughness: 1, metalness: 1,
      vertexColors: true, envMapIntensity: 1.3,
    }),
    cell: phys('cell', {
      map: tx.ceC, roughnessMap: tx.ceM, metalnessMap: tx.ceM, roughness: 1, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.05,
      envMapIntensity: 2.4, emissive: 0x9fb4ff, emissiveMap: tx.sheen, emissiveIntensity: 0,
    }),
    dish: phys('dish', {
      map: tx.dish, vertexColors: true, roughness: 0.36, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 1.3,
    }),
    glass: phys('glass', {
      color: 0x04070f, roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 1, iridescenceIOR: 1.4,
      iridescenceThicknessRange: [180, 480], envMapIntensity: 2.2,
    }),
    rim: track(new T.MeshBasicMaterial({ color: 0x5fe6ff, toneMapped: false })),
    ao: track(new T.MeshBasicMaterial({ color: 0x000000, map: tx.ao, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
  }
  M.cell.color.setScalar(1)
  M.cell.emissiveMap.offset.x = 0

  /* geometry buckets */
  class Bucket {
    constructor() {
      this.p = []
      this.n = []
      this.u = []
      this.u1 = []
      this.c = []
      this.i = []
    }
    add(g, m, o = {}) {
      const pa = g.attributes.position
      const na = g.attributes.normal
      const ua = g.attributes.uv
      const ca = g.attributes.color
      const off = this.p.length / 3
      const nm = new T.Matrix3().getNormalMatrix(m)
      const v = new T.Vector3()
      const n = new T.Vector3()
      const tint = o.tint || [1, 1, 1]
      for (let k = 0; k < pa.count; k++) {
        v.fromBufferAttribute(pa, k).applyMatrix4(m)
        n.fromBufferAttribute(na, k).applyMatrix3(nm).normalize()
        this.p.push(v.x, v.y, v.z)
        this.n.push(n.x, n.y, n.z)
        const u = ua ? ua.getX(k) : 0
        const w = ua ? ua.getY(k) : 0
        if (o.rect) this.u.push(o.rect[0] + u * o.rect[2], o.rect[1] + w * o.rect[3])
        else this.u.push(u, w)
        if (o.uv1) this.u1.push(...o.uv1(v))
        else this.u1.push(0, 0)
        const f = ca ? ca.getX(k) : 1
        this.c.push(tint[0] * f, tint[1] * f, tint[2] * f)
      }
      if (g.index) for (let k = 0; k < g.index.count; k++) this.i.push(g.index.getX(k) + off)
      else for (let k = 0; k < pa.count; k++) this.i.push(off + k)
      g.dispose()
    }
    mesh(material, parent) {
      if (!this.p.length) return null
      const g = track(new T.BufferGeometry())
      g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3))
      g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3))
      g.setAttribute('uv', new T.Float32BufferAttribute(this.u, 2))
      g.setAttribute('uv1', new T.Float32BufferAttribute(this.u1, 2))
      g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3))
      g.setIndex(this.i)
      const m = new T.Mesh(g, material)
      m.frustumCulled = false
      parent.add(m)
      return m
    }
  }
  const B = {
    foil: new Bucket(), bs: new Bucket(), rim: new Bucket(), glass: new Bucket(), ao: new Bucket(),
    ws: new Bucket(), wc: new Bucket(), ds: new Bucket(), dd: new Bucket(),
  }

  /* placement helpers */
  const mat = (pos, eul = [0, 0, 0]) => new T.Matrix4().compose(V(...pos), new T.Quaternion().setFromEuler(new T.Euler(...eul)), V(1, 1, 1))
  const axisM = (a, b) => {
    const A = V(...a)
    const d = V(...b).sub(A)
    const len = d.length()
    const q = new T.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize())
    return { m: new T.Matrix4().compose(A.clone().add(V(...b)).multiplyScalar(0.5), q, V(1, 1, 1)), len }
  }
  const basisM = (pos, ex, ey, ez) => new T.Matrix4().makeBasis(V(...ex), V(...ey), V(...ez)).setPosition(V(...pos))
  const tile = (st, i) => {
    // atlas rect for tile i (0 tl, 1 tr, 2 bl, 3 br), canvas top = v 1; small gutter against mip bleed
    const ox = (i % 2) * 0.5
    const oy = 0.5 - (i >> 1) * 0.5
    return [ox + 0.012, oy + 0.012, 0.476, 0.476]
  }
  const rect = (st, i, su = 1, sv = 1, rnd = null) => {
    const r = tile(st, i)
    const w = r[2] * su
    const h = r[3] * sv
    const jx = rnd ? rnd() * (r[2] - w) : 0
    const jy = rnd ? rnd() * (r[3] - h) : 0
    return [r[0] + jx, r[1] + jy, w, h]
  }
  const T_ = { alu: 0, rad: 1, dark: 2, carb: 3 }
  const box = (bk, dims, pos, o = {}) => {
    const g = o.c ? chamferGeo(T, dims[0], dims[1], dims[2], o.c) : new T.BoxGeometry(...dims).toNonIndexed()
    bk.add(g, o.m || mat(pos, o.eul), { rect: o.rect === undefined ? rect(0, o.tile ?? 0) : o.rect, tint: o.tint })
  }
  const cyl = (bk, a, b, rt, rb, seg, o = {}) => {
    const { m, len } = axisM(a, b)
    bk.add(new T.CylinderGeometry(rt, rb, len, seg, 1, !!o.open).toNonIndexed(), m, { rect: o.rect === undefined ? rect(0, o.tile ?? 0) : o.rect, tint: o.tint })
  }
  const sph = (bk, r, pos, o = {}) => {
    bk.add(new T.SphereGeometry(r, 10, 7).toNonIndexed(), mat(pos), { rect: rect(0, o.tile ?? 0), tint: o.tint })
  }
  const bolt = (bk, pos, dir, r = 0.011, hgt = 0.007, tint = [0.8, 0.82, 0.86]) => {
    const e = [pos[0] + dir[0] * hgt, pos[1] + dir[1] * hgt, pos[2] + dir[2] * hgt]
    cyl(bk, pos, e, r, r, 6, { tint })
  }
  const ao = (pos, ex, ey, w, h) => {
    const ez = V(...ex).cross(V(...ey)).toArray()
    B.ao.add(new T.PlaneGeometry(w, h), basisM(pos, ex, ey, ez), {})
  }
  const quad = (bk, pos, ex, ey, w, h, o = {}) => {
    const ez = V(...ex).cross(V(...ey)).toArray()
    bk.add(new T.PlaneGeometry(w, h), basisM(pos, ex, ey, ez), o)
  }

  const rnd = rng32(2024)
  const tintOf = (k, a = 0.12) => {
    const f = 1 + (rnd() - 0.5) * a * 2
    return [k * f, k * f, k * f]
  }

  /* ---------------------------------------------------------------- bus */
  // core, rails and corner blocks
  box(B.bs, [0.98, 0.78, 0.78], [0, 0, 0], { c: 0.02, tile: T_.dark, tint: [0.7, 0.7, 0.74] })
  const R = 0.38
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) box(B.bs, [1.0, 0.04, 0.04], [0, sy * R, sz * R], { tile: T_.alu, tint: [0.7, 0.7, 0.74] })
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) box(B.bs, [0.04, 0.8, 0.04], [sx * 0.48, 0, sz * R], { tile: T_.alu, tint: [0.9, 0.9, 0.94] })
    for (const sy of [-1, 1]) box(B.bs, [0.04, 0.04, 0.8], [sx * 0.48, sy * R, 0], { tile: T_.alu, tint: [0.9, 0.9, 0.94] })
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) box(B.bs, [0.055, 0.055, 0.055], [sx * 0.48, sy * R, sz * R], { c: 0.01, tile: T_.alu, tint: [0.78, 0.8, 0.86] })
  // rail bolts
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) for (const x of [-0.26, 0.1, 0.34]) bolt(B.bs, [x, sy * R, sz * 0.4], [0, 0, sz])
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [-0.18, 0.18]) bolt(B.bs, [sx * 0.5, sy * R, z], [sx, 0, 0])

  // MLI panels on the four side faces: pillows with seams and tape
  const FACES = [
    { n: [0, 0, 1], ex: [1, 0, 0], ey: [0, 1, 0], off: 0.392, cols: [-0.455, -0.12, 0.18, 0.455], rows: [-0.355, -0.02, 0.355], kinds: ['g', 's', 'g', 'b', 'g', 'r'] },
    { n: [0, 0, -1], ex: [-1, 0, 0], ey: [0, 1, 0], off: 0.392, cols: [-0.455, -0.05, 0.25, 0.455], rows: [-0.355, 0.08, 0.355], kinds: ['g', 'g', 's', 's', 'b', 'g'] },
    { n: [1, 0, 0], ex: [0, 0, -1], ey: [0, 1, 0], off: 0.492, cols: [-0.355, 0.0, 0.355], rows: [-0.355, 0.12, 0.355], kinds: ['g', 's', 'e', 'g'] },
    { n: [-1, 0, 0], ex: [0, 0, 1], ey: [0, 1, 0], off: 0.492, cols: [-0.355, 0.0, 0.355], rows: [-0.355, -0.08, 0.355], kinds: ['s', 'g', 'g', 'b'] },
  ]
  const KIND_TILE = { g: 0, s: 1, b: 2, w: 3 }
  const gap = 0.012
  const prng = rng32(88)
  for (const f of FACES) {
    const nv = V(...f.n)
    const ex = V(...f.ex)
    const ey = V(...f.ey)
    let ki = 0
    for (let ri = 0; ri < f.rows.length - 1; ri++) {
      for (let ci = 0; ci < f.cols.length - 1; ci++) {
        const kind = f.kinds[ki++]
        const u0 = f.cols[ci]
        const u1 = f.cols[ci + 1]
        const v0 = f.rows[ri]
        const v1 = f.rows[ri + 1]
        const w = u1 - u0 - gap
        const h = v1 - v0 - gap
        const uc = (u0 + u1) / 2
        const vc = (v0 + v1) / 2
        const c0 = nv.clone().multiplyScalar(f.off).addScaledVector(ex, uc).addScaledVector(ey, vc)
        if (kind === 'r' || kind === 'e') {
          const X = ex
          const Y = nv
          const Z = X.clone().cross(Y)
          box(B.bs, [w, 0.016, h], null, {
            c: 0.004, tile: kind === 'r' ? T_.rad : T_.dark, tint: [1, 1, 1],
            m: new T.Matrix4().makeBasis(X, Y, Z).setPosition(c0.clone().addScaledVector(nv, 0.008)),
          })
        } else {
          // pillow
          const bulge = 0.016 + prng() * 0.008
          const g = new T.PlaneGeometry(w, h, 6, 6)
          const pa = g.attributes.position
          const col = []
          for (let k = 0; k < pa.count; k++) {
            const uu = pa.getX(k) / w + 0.5
            const vv = pa.getY(k) / h + 0.5
            const e = Math.max(0, Math.sin(Math.PI * uu) * Math.sin(Math.PI * vv))
            pa.setZ(k, bulge * Math.pow(e, 0.75) + 0.004)
            const a = clamp(Math.pow(Math.min(1, e * 2.4), 0.55), 0, 1)
            col.push(0.5 + 0.5 * a)
          }
          g.computeVertexNormals()
          const ez = ex.clone().cross(ey)
          const kt = KIND_TILE[kind]
          const su = clamp(w / 0.5, 0.3, 1)
          const sv = clamp(h / 0.5, 0.3, 1)
          const tn = 0.92 + prng() * 0.16
          g.setAttribute('color', new T.Float32BufferAttribute(Array.from({ length: pa.count }, (_, k) => col[k]), 1))
          B.foil.add(g, new T.Matrix4().makeBasis(ex, ey, ez).setPosition(c0), { rect: rect(0, kt, su, sv, prng), tint: [tn, tn, tn] })
        }
      }
    }
    // tape along interior seams
    const tapeCols = [[0.88, 0.5, 0.18], [0.78, 0.8, 0.84]]
    const spanU = f.cols[f.cols.length - 1] - f.cols[0]
    const spanV = f.rows[f.rows.length - 1] - f.rows[0]
    for (let ci = 1; ci < f.cols.length - 1; ci++) {
      const c0 = nv.clone().multiplyScalar(f.off + 0.0065).addScaledVector(ex, f.cols[ci]).addScaledVector(ey, (f.rows[0] + f.rows[f.rows.length - 1]) / 2)
      quad(B.bs, c0.toArray(), f.ey, f.ex.map((v) => -v), spanV - 0.01, 0.017, { rect: rect(0, 0, 0.1, 0.05), tint: tapeCols[ci % 2] })
    }
    for (let ri = 1; ri < f.rows.length - 1; ri++) {
      const c0 = nv.clone().multiplyScalar(f.off + 0.0065).addScaledVector(ey, f.rows[ri]).addScaledVector(ex, (f.cols[0] + f.cols[f.cols.length - 1]) / 2)
      quad(B.bs, c0.toArray(), f.ex, f.ey, spanU - 0.01, 0.017, { rect: rect(0, 0, 0.1, 0.05), tint: tapeCols[(ri + 1) % 2] })
    }
  }

  // top deck: louvre radiator and equipment
  box(B.bs, [0.94, 0.016, 0.74], [0, 0.4, 0], { c: 0.004, tile: T_.rad, tint: [0.62, 0.62, 0.66] })
  box(B.bs, [0.3, 0.1, 0.26], [0.22, 0.463, 0.15], { c: 0.012, tile: T_.dark })
  box(B.bs, [0.26, 0.012, 0.22], [0.22, 0.519, 0.15], { c: 0.004, tile: T_.rad, tint: [0.7, 0.7, 0.74] })
  box(B.bs, [0.16, 0.08, 0.14], [0.28, 0.449, -0.22], { c: 0.01, tile: T_.alu, tint: [0.9, 0.9, 0.94] })
  box(B.bs, [0.05, 0.03, 0.09], [0.28, 0.504, -0.22], { c: 0.006, tile: T_.dark })
  // propellant tank with domes and straps
  cyl(B.bs, [-0.05, 0.408, -0.18], [-0.05, 0.57, -0.18], 0.08, 0.08, 20, { tile: T_.alu, tint: [0.95, 0.95, 1] })
  cyl(B.bs, [-0.05, 0.57, -0.18], [-0.05, 0.61, -0.18], 0.03, 0.08, 20, { tile: T_.alu, tint: [0.95, 0.95, 1] })
  for (const y of [0.45, 0.53]) cyl(B.bs, [-0.05, y, -0.18], [-0.05, y + 0.012, -0.18], 0.085, 0.085, 20, { tile: T_.carb, tint: [1.4, 1.4, 1.5] })
  cyl(B.bs, [-0.05, 0.608, -0.18], [-0.05, 0.63, -0.18], 0.014, 0.014, 10, { tile: T_.alu })
  // reaction wheels and patch antenna
  for (const z of [-0.26, 0.26]) {
    cyl(B.bs, [-0.4, 0.408, z], [-0.4, 0.46, z], 0.06, 0.06, 18, { tile: T_.alu, tint: [0.9, 0.9, 0.94] })
    cyl(B.bs, [-0.4, 0.46, z], [-0.4, 0.468, z], 0.045, 0.045, 18, { tile: T_.alu, tint: [0.5, 0.5, 0.55] })
  }
  box(B.bs, [0.1, 0.01, 0.1], [-0.02, 0.417, 0.3], { c: 0.002, tile: T_.alu, tint: [1.1, 0.8, 0.4] })
  // sun sensors
  for (const [x, z] of [[-0.2, 0.34], [0.45, 0.02], [0.4, -0.3]]) cyl(B.bs, [x, 0.408, z], [x, 0.416, z], 0.014, 0.014, 12, { tile: T_.dark })
  // tripod struts and mast
  const mastTop = [-0.3, 0.62, 0]
  for (const s of [[-0.46, 0.41, 0.33], [-0.46, 0.41, -0.33], [-0.12, 0.41, 0.0]]) cyl(B.bs, s, mastTop, 0.008, 0.008, 6, { tile: T_.carb, tint: [1.5, 1.5, 1.6] })
  cyl(B.bs, [-0.3, 0.408, 0], [-0.3, 0.7, 0], 0.02, 0.02, 14, { tile: T_.alu })
  cyl(B.bs, [-0.3, 0.408, 0], [-0.3, 0.43, 0], 0.045, 0.03, 14, { tile: T_.alu, tint: [0.8, 0.8, 0.85] })
  cyl(B.bs, [-0.3, 0.7, 0], [GIMBAL[0], GIMBAL[1], 0], 0.038, 0.038, 18, { tile: T_.dark })
  for (const s of [-1, 1]) box(B.bs, [0.034, 0.06, 0.012], [GIMBAL[0], GIMBAL[1], s * 0.052], { c: 0.003, tile: T_.alu })
  cyl(B.bs, [GIMBAL[0], GIMBAL[1], -0.07], [GIMBAL[0], GIMBAL[1], 0.07], 0.014, 0.014, 10, { tile: T_.alu, tint: [0.7, 0.7, 0.75] })

  // star trackers on the top front edge, tilted 30 degrees outward
  for (const s of [-1, 1]) {
    const st = [0.37, 0.42, s * 0.27]
    const dir = [Math.sin(rad(30)), Math.cos(rad(30)), 0]
    const at = (k) => [st[0] + dir[0] * k, st[1] + dir[1] * k, st[2]]
    box(B.bs, [0.1, 0.02, 0.1], [0.37, 0.418, s * 0.27], { c: 0.004, tile: T_.alu, tint: [0.8, 0.8, 0.85] })
    cyl(B.bs, st, at(0.08), 0.05, 0.05, 18, { tile: T_.dark })
    cyl(B.bs, at(0.08), at(0.15), 0.07, 0.048, 18, { tile: T_.dark, tint: [0.7, 0.7, 0.75], open: true })
    cyl(B.bs, at(0.15), at(0.152), 0.072, 0.072, 18, { tile: T_.alu, tint: [0.5, 0.5, 0.55] })
    cyl(B.glass, at(0.082), at(0.086), 0.042, 0.042, 18, { rect: null })
    ao([0.37, 0.409, s * 0.27], [1, 0, 0], [0, 0, -1], 0.2, 0.2)
  }
  // thrusters on the rear face
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const y = sy * 0.27
      const z = sz * 0.27
      box(B.bs, [0.012, 0.07, 0.07], [-0.5, y, z], { c: 0.003, tile: T_.alu, tint: [0.75, 0.75, 0.8] })
      cyl(B.bs, [-0.57, y, z], [-0.5, y, z], 0.012, 0.03, 14, { tile: T_.alu, tint: [0.85, 0.85, 0.9] })
      cyl(B.bs, [-0.5705, y, z], [-0.568, y, z], 0.028, 0.028, 14, { tile: T_.dark, tint: [0.4, 0.4, 0.45] })
      ao([-0.51, y, z], [0, 0, 1], [0, 1, 0], 0.17, 0.17)
    }
  }
  // whip antenna boom 35 degrees back and up from the front top corner, plus a short UHF whip
  {
    const P0 = [0.5, 0.4, -0.4]
    const d = [-Math.cos(rad(35)), Math.sin(rad(35)), 0]
    const P1 = [P0[0] + d[0] * 1.1, P0[1] + d[1] * 1.1, P0[2]]
    cyl(B.bs, P0, [P0[0] + d[0] * 0.07, P0[1] + d[1] * 0.07, P0[2]], 0.024, 0.02, 12, { tile: T_.dark })
    cyl(B.bs, P0, P1, 0.0055, 0.0045, 6, { tile: T_.alu })
    sph(B.bs, 0.014, P1, { tile: T_.alu })
    const Q0 = [-0.44, 0.408, 0.33]
    const Q1 = [-0.58, 0.7, 0.4]
    cyl(B.bs, Q0, Q1, 0.0035, 0.003, 5, { tile: T_.alu })
  }
  // yoke booms, drive housings and root fittings
  for (const s of [-1, 1]) {
    cyl(B.bs, [0, 0, s * 0.4], [0, 0, s * 0.85], 0.025, 0.025, 14, { tile: T_.alu, tint: [0.85, 0.85, 0.9] })
    box(B.bs, [0.14, 0.12, 0.1], [0, 0, s * 0.47], { c: 0.012, tile: T_.dark })
    box(B.bs, [0.16, 0.01, 0.12], [0, 0.065, s * 0.47], { c: 0.002, tile: T_.alu, tint: [0.8, 0.8, 0.85] })
    cyl(B.bs, [0, 0.03, s * 0.54], [0, 0.03, s * 0.86], 0.006, 0.006, 6, { tile: T_.carb, tint: [1.5, 1.5, 1.6] })
    ao([0, 0, s * 0.417], [s, 0, 0], [0, 1, 0], 0.3, 0.3)
  }
  // nadir instrument: housing, flange, hood, lens, thread-coloured rim
  box(B.bs, [0.42, 0.18, 0.36], [0.12, -0.49, 0], { c: 0.014, tile: T_.dark, tint: [0.8, 0.8, 0.84] })
  box(B.bs, [0.36, 0.014, 0.3], [0.12, -0.587, 0], { c: 0.004, tile: T_.alu, tint: [0.45, 0.46, 0.5] })
  cyl(B.bs, [0.12, -0.592, 0], [0.12, -0.58, 0], 0.118, 0.118, 36, { tile: T_.dark, tint: [0.55, 0.55, 0.6] })
  box(B.bs, [0.02, 0.07, 0.36], [0.34, -0.615, 0], { c: 0.004, tile: T_.alu, tint: [0.7, 0.7, 0.75] })
  for (const [x, z] of [[-0.05, -0.15], [-0.05, 0.15], [0.29, -0.15], [0.29, 0.15]]) bolt(B.bs, [x, -0.594, z], [0, -1, 0], 0.01, 0.006)
  {
    // lens dome (concave looking glass, bulging out slightly) and barrel
    const ring = []
    const prof = []
    for (let k = 0; k <= 6; k++) {
      const r = (k / 6) * 0.1
      prof.push([r, -0.58 - 0.014 * (1 - (r / 0.1) ** 2) - 0.006])
    }
    const nrm = profNormals(prof)
    prof.forEach((p, k) => ring.push([p[0], p[1], nrm[k][0], nrm[k][1], k / 6]))
    // make the normals point downwards (outward from the body)
    for (const rg of ring) if (rg[3] > 0) { rg[2] *= -1; rg[3] *= -1 }
    B.glass.add(latheGeo(T, [ring], 36), mat([0.12, 0, 0]), {})
    // black recess behind the lens
    cyl(B.bs, [0.12, -0.5795, 0], [0.12, -0.5805, 0], 0.104, 0.104, 30, { tile: T_.dark, tint: [0.15, 0.15, 0.17] })
    // rim: thin emissive ring (RingGeometry faces +z, rotate to face -y)
    const rg = new T.RingGeometry(0.1, 0.116, 64)
    rg.rotateX(Math.PI / 2)
    rg.translate(0.12, -0.5935, 0)
    B.rim.add(rg, new T.Matrix4(), { rect: null })
    const rg2 = new T.RingGeometry(0.136, 0.14, 64)
    rg2.rotateX(Math.PI / 2)
    rg2.translate(0.12, -0.5935, 0)
    B.rim.add(rg2, new T.Matrix4(), { rect: null })
  }
  ao([0.12, -0.5815, 0], [1, 0, 0], [0, 0, 1], 0.52, 0.5)
  // labelled data plates (rectangles only)
  const dk = tile(0, T_.dark)
  const pr = [dk[0] + dk[2] * 0.14, dk[1] + dk[3] * 0.3, dk[2] * 0.72, dk[3] * 0.4]
  quad(B.bs, [0.05, 0.4095, -0.3], [1, 0, 0], [0, 0, -1], 0.1, 0.055, { rect: pr })
  quad(B.bs, [0.1, -0.45, 0.1815], [1, 0, 0], [0, 1, 0], 0.09, 0.05, { rect: pr })
  quad(B.bs, [0.1, -0.45, -0.1815], [-1, 0, 0], [0, 1, 0], 0.09, 0.05, { rect: pr })
  quad(B.bs, [-0.12, 0.4095, 0.3], [1, 0, 0], [0, 0, -1], 0.07, 0.04, { rect: pr })
  // top deck AO decals
  ao([0.22, 0.409, 0.15], [1, 0, 0], [0, 0, -1], 0.46, 0.42)
  ao([0.28, 0.409, -0.22], [1, 0, 0], [0, 0, -1], 0.26, 0.24)
  ao([-0.05, 0.409, -0.18], [1, 0, 0], [0, 0, -1], 0.32, 0.32)
  ao([-0.4, 0.409, 0.26], [1, 0, 0], [0, 0, -1], 0.22, 0.22)
  ao([-0.4, 0.409, -0.26], [1, 0, 0], [0, 0, -1], 0.22, 0.22)
  ao([-0.3, 0.409, 0], [1, 0, 0], [0, 0, -1], 0.2, 0.2)

  /* ---------------------------------------------------------------- wings (in the wing pivot) */
  const sheenUv = (v) => [(Math.abs(v.z) - 0.85) / 1.92, v.x / 0.7 + 0.5]
  for (const s of [-1, 1]) {
    // mast rod and SADA ring
    cyl(B.ws, [0, -0.016, s * 0.85], [0, -0.016, s * 2.77], 0.008, 0.008, 8, { tile: T_.alu })
    cyl(B.ws, [0, 0, s * 0.82], [0, 0, s * 0.86], 0.052, 0.052, 20, { tile: T_.dark, tint: [0.8, 0.8, 0.85] })
    for (let i = 0; i < 3; i++) {
      const z = s * (0.85 + 0.31 + i * 0.65)
      const pw = 0.7
      const pd = 0.62
      // substrate
      box(B.ws, [pw, 0.01, pd], [0, 0, z], { tile: T_.alu, tint: [0.55, 0.57, 0.62] })
      // cell sheet (top, +y), uv u along x, v along z
      const cg = new T.PlaneGeometry(pw, pd)
      cg.rotateX(-Math.PI / 2)
      cg.translate(0, 0.0056, z)
      B.wc.add(cg, new T.Matrix4(), { uv1: sheenUv })
      // raised frame bars
      for (const e of [-1, 1]) {
        box(B.ws, [pw, 0.011, 0.014], [0, 0.0045, z + e * (pd / 2 - 0.007)], { tile: T_.alu, tint: [1, 1, 1] })
        box(B.ws, [0.014, 0.011, pd], [e * (pw / 2 - 0.007), 0.0045, z], { tile: T_.alu, tint: [1, 1, 1] })
      }
      // hinge barrels between panels and yoke arms
      if (i < 2) {
        const zh = z + s * (pd / 2 + 0.015)
        for (const x of [-0.24, 0.24]) {
          cyl(B.ws, [x - 0.06, 0.002, zh], [x + 0.06, 0.002, zh], 0.014, 0.014, 12, { tile: T_.alu, tint: [0.8, 0.8, 0.86] })
          box(B.ws, [0.05, 0.008, 0.04], [x, 0.0, zh], { tile: T_.dark })
        }
        cyl(B.ws, [-0.3, 0.0, zh], [0.3, 0.0, zh], 0.005, 0.005, 6, { tile: T_.carb, tint: [1.5, 1.5, 1.6] })
      }
    }
    // root bracket
    box(B.ws, [0.18, 0.02, 0.04], [0, -0.012, s * 0.88], { c: 0.004, tile: T_.alu, tint: [0.75, 0.75, 0.8] })
  }

  /* ---------------------------------------------------------------- dish (in the dish frame, axis +y) */
  {
    const f = (DISH_R * DISH_R) / (4 * DISH_DEPTH)
    const yIn = (r) => 0.05 + (r * r) / (4 * f)
    const n = 8
    const outer = []
    const inner = []
    for (let k = 0; k <= n; k++) {
      const r = (k / n) * DISH_R
      const sl = r / (2 * f)
      const l = Math.hypot(sl, 1)
      outer.push([r, yIn(r) - DISH_T, sl / l, -1 / l, k / n])
      inner.push([r, yIn(r), -sl / l, 1 / l, k / n])
    }
    inner.reverse()
    const lip = [
      [DISH_R, yIn(DISH_R) - DISH_T, 1, 0, 1],
      [DISH_R, yIn(DISH_R), 1, 0, 1],
    ]
    const g = latheGeo(T, [outer, lip, inner], 40)
    const cols = []
    const pa = g.attributes.position
    const nv = g.attributes.normal
    for (let k = 0; k < pa.count; k++) cols.push(nv.getY(k) > 0.2 ? 0.8 : 1)
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 1))
    B.dd.add(g, new T.Matrix4(), {})
    cyl(B.ds, [0, 0, 0], [0, 0.05, 0], 0.028, 0.028, 14, { tile: T_.alu })
    // back ribs
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.2
      const p = (r) => [Math.cos(a) * r, yIn(r) - DISH_T - 0.005, Math.sin(a) * r]
      cyl(B.ds, p(0.03), p(0.23), 0.005, 0.005, 5, { tile: T_.alu, tint: [0.9, 0.9, 0.95] })
    }
    cyl(B.ds, [0, 0.05 - 0.004, 0], [0, 0.07, 0], 0.05, 0.05, 18, { tile: T_.alu, tint: [0.9, 0.9, 0.95] })
    // feed struts, horn and sub-flange
    const yFeed = 0.05 + DISH_FOCAL_Y
    for (let k = 0; k < 3; k++) {
      const a = rad(90 + k * 120)
      cyl(B.ds, [Math.cos(a) * 0.26, 0.05 + 0.07, Math.sin(a) * 0.26], [0, yFeed, 0], 0.006, 0.006, 6, { tile: T_.alu, tint: [0.95, 0.95, 1] })
    }
    cyl(B.ds, [0, yFeed - 0.04, 0], [0, yFeed + 0.012, 0], 0.025, 0.009, 14, { tile: T_.alu })
    cyl(B.ds, [0, yFeed - 0.041, 0], [0, yFeed - 0.037, 0], 0.021, 0.021, 14, { tile: T_.dark, tint: [0.2, 0.2, 0.22] })
    cyl(B.ds, [0, yFeed - 0.006, 0], [0, yFeed - 0.002, 0], 0.033, 0.033, 14, { tile: T_.dark, tint: [0.8, 0.8, 0.85] })
  }

  /* ---------------------------------------------------------------- meshes */
  const meshes = [
    B.foil.mesh(M.foil, bodyG),
    B.bs.mesh(M.struct, bodyG),
    B.rim.mesh(M.rim, bodyG),
    B.glass.mesh(M.glass, bodyG),
    B.ao.mesh(M.ao, bodyG),
    B.ws.mesh(M.struct, wingPivot),
    B.wc.mesh(M.cell, wingPivot),
    B.ds.mesh(M.struct, dishPitch),
    B.dd.mesh(M.dish, dishPitch),
  ].filter(Boolean)
  meshes[4].renderOrder = 2
  Object.values(M).forEach((m) => {
    if (m.userData?.envKey) m.envMapIntensity = base[m.userData.envKey]
  })

  const state = { exposure: 1 }
  const sunQ = new T.Quaternion()
  const defSun = new T.Vector3(...SUN_DEF).normalize()
  const api = {
    setVisible(b) {
      for (const m of meshes) m.visible = b
    },
    setTheme(th) {
      if (th?.thread) M.rim.color.set(th.thread)
    },
    onPose({ cw = 1, amp = 0, t = 0 }) {
      M.cell.color.setScalar(0.55 + 0.45 * Math.max(0, cw))
      M.cell.emissiveIntensity = amp * 0.75
      tx.sheen.offset.x = 0.5 - t
    },
    /** Scales every PBR reflection (additive setter). 1 = authored. */
    setExposure(v) {
      state.exposure = v
      for (const m of Object.values(M)) if (m.userData?.envKey) m.envMapIntensity = base[m.userData.envKey] * v
    },
    /** Rotates the baked sun in the environment to point toward world direction `dir` (from the satellite to the sun). */
    setSunDir(dir) {
      sunQ.setFromUnitVectors(defSun, dir.clone().normalize())
      const e = new T.Euler().setFromQuaternion(sunQ)
      for (const m of Object.values(M)) if (m.userData?.envKey) m.envMapRotation.copy(e)
    },
    get envIntensity() {
      return state.exposure
    },
    set envIntensity(v) {
      api.setExposure(v)
    },
    envMap: envTex,
  }
  return api
}
