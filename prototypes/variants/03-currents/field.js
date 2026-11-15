/**
 * Currents field: fine parallel streamlines on ONE 2D canvas that part around a chrome sphere and
 * loosen into coloured contours below it. DPR is fixed at 1, the loop stops when no "window" onto
 * the field is on screen or the tab is hidden, and reduced motion gets single still frames.
 *
 *   const field = createField(canvas, { target: () => state, windows: NodeList })
 *   state = { x, y, r, alpha, speed, color }   x/y are viewport fractions, the rest are 0..n scales
 */
const PALETTES = {
  dark: {
    a: '#cdbcff', b: '#7f55e0', red: '#ff3d3d', amber: '#ffb224', pulse: '#ffffff',
    spectrum: ['#ff3d3d', '#ffb224', '#2fe08f', '#6fe6f5', '#d2a8ff'],
    shadow: 'rgba(4,0,10,.6)', rim: '#5a4b86',
  },
  light: {
    a: '#3a1f6e', b: '#8468c9', red: '#d31c2c', amber: '#e08a00', pulse: '#12061f',
    spectrum: ['#c81e2b', '#b96f00', '#0f8a55', '#0b7f93', '#5b34b0'],
    shadow: 'rgba(40,14,72,.34)', rim: '#8d82a8',
  },
}

const smooth = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v))

export function createField(canvas, { target, windows = [], reduced = false } = {}) {
  const ctx = canvas.getContext('2d', { alpha: true })
  let W = 0, H = 0, step = 10, gap = 10
  let rows = 0
  let re2, amp, s1, c1, s2, c2
  const cur = { ...target() }
  let time = 0, last = 0, raf = 0, onScreen = true, cost = 0, frames = 0
  const pulses = Array.from({ length: 9 }, (_, i) => ({ j: (i * 37) % 23 - 11, off: (i * 0.377) % 1, v: 0.5 + ((i * 0.61) % 1) * 0.7 }))

  function resize() {
    W = canvas.width = Math.max(1, window.innerWidth)
    H = canvas.height = Math.max(1, window.innerHeight)
    alloc()
  }
  function alloc() {
    rows = Math.ceil(H / step) + 2
    re2 = new Float32Array(rows); amp = new Float32Array(rows)
    s1 = new Float32Array(rows); c1 = new Float32Array(rows)
    s2 = new Float32Array(rows); c2 = new Float32Array(rows)
  }

  function draw() {
    const pal = PALETTES[document.documentElement.dataset.theme === 'light' ? 'light' : 'dark']
    const R = Math.min(96, Math.max(38, Math.min(W, H) * 0.09)) * cur.r
    const cx = cur.x * W, cy = cur.y * H
    const A = Math.min(26, W * 0.03)
    const k1 = 0.011, k2 = 0.027
    ctx.clearRect(0, 0, W, H)
    if (cur.alpha < 0.01) return

    // Per-row terms: the teardrop the lines part around, and the wobble that loosens them below it.
    for (let r = 0; r < rows; r++) {
      const y = r * step, dy = y - cy
      const sigma = dy < 0 ? 1.7 * R : 1.02 * R
      const e = 1.2 * R * Math.exp(-(dy * dy) / (2 * sigma * sigma))
      re2[r] = e * e
      amp[r] = A * smooth((dy - 1.25 * R) / (H * 0.3))
      s1[r] = Math.sin(k1 * y - time); c1[r] = Math.cos(k1 * y - time)
      s2[r] = Math.sin(k2 * y - time * 1.6); c2[r] = Math.cos(k2 * y - time * 1.6)
    }
    const jMin = Math.floor((-cx - 40) / gap), jMax = Math.ceil((W - cx + 40) / gap)
    const trace = (j, from) => {
      const dx = (j + 0.5) * gap, sign = dx < 0 ? -1 : 1, d2 = dx * dx
      const ph = j * 0.31 + 1.6 * Math.sin(j * 0.19)
      const sb = Math.sin(ph), cb = Math.cos(ph), sb2 = Math.sin(ph * 1.9), cb2 = Math.cos(ph * 1.9)
      for (let r = from; r < rows; r++) {
        const x = cx + sign * Math.sqrt(d2 + re2[r]) + amp[r] * (s1[r] * cb + c1[r] * sb + 0.4 * (s2[r] * cb2 + c2[r] * sb2))
        if (r === from) ctx.moveTo(x, r * step); else ctx.lineTo(x, r * step)
      }
    }

    // Pass 1: every line, two tints, two paths.
    ctx.lineJoin = 'round'
    ctx.globalAlpha = cur.alpha
    for (let tint = 0; tint < 2; tint++) {
      ctx.beginPath()
      for (let j = jMin; j <= jMax; j++) {
        if (j === -1 || j === 0 || (j & 1) !== tint) continue
        trace(j, 0)
      }
      ctx.strokeStyle = tint ? pal.b : pal.a
      ctx.lineWidth = tint ? 1.1 : 1.5
      ctx.stroke()
    }

    // Pass 2: below the sphere the same lines pick up the stripe spectrum, in bands of three.
    const from = Math.max(0, Math.floor((cy + 1.1 * R) / step))
    if (cur.color > 0.02 && from < rows - 1) {
      const y0 = from * step, y1 = y0 + H * 0.26
      ctx.lineWidth = 1.7
      for (let b = 0; b < 5; b++) {
        ctx.beginPath()
        for (let j = jMin; j <= jMax; j++) {
          if (j === -1 || j === 0 || ((Math.floor(j / 3) % 5) + 5) % 5 !== b) continue
          trace(j, from)
        }
        const g = ctx.createLinearGradient(0, y0, 0, y1)
        g.addColorStop(0, pal.spectrum[b] + '00'); g.addColorStop(1, pal.spectrum[b])
        ctx.strokeStyle = g
        ctx.globalAlpha = cur.alpha * Math.min(1, cur.color)
        ctx.stroke()
      }
    }

    // A few brighter pulses travelling down single lines: the only motion above the sphere.
    if (!reduced && cur.speed > 0.2) {
      ctx.beginPath()
      for (const p of pulses) {
        const j = p.j < 0 ? p.j - 1 : p.j + 1
        const dx = (j + 0.5) * gap, sign = dx < 0 ? -1 : 1
        const head = ((time * 0.09 * p.v + p.off) % 1.2) * H
        const r0 = Math.max(0, Math.floor((head - 70) / step)), r1 = Math.min(rows - 1, Math.floor(head / step))
        for (let r = r0; r <= r1; r++) {
          const x = cx + sign * Math.sqrt(dx * dx + re2[r])
          if (r === r0) ctx.moveTo(x, r * step); else ctx.lineTo(x, r * step)
        }
      }
      ctx.globalAlpha = cur.alpha * 0.9
      ctx.strokeStyle = pal.pulse
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // The red focal stripe down the axis: it swells into the teardrop that holds the sphere.
    ctx.globalAlpha = Math.min(1, cur.alpha * 1.25)
    ctx.beginPath()
    for (let r = 0; r < rows; r++) {
      const x = cx - Math.sqrt(gap * gap * 0.72 + re2[r]) + amp[r] * (s1[r] + 0.4 * s2[r])
      if (r === 0) ctx.moveTo(x, 0); else ctx.lineTo(x, r * step)
    }
    for (let r = rows - 1; r >= 0; r--) {
      ctx.lineTo(cx + Math.sqrt(gap * gap * 0.72 + re2[r]) + amp[r] * (s1[r] + 0.4 * s2[r]), r * step)
    }
    ctx.closePath()
    const stripe = ctx.createLinearGradient(0, cy + R, 0, cy + R + H * 0.34)
    stripe.addColorStop(0, pal.red); stripe.addColorStop(1, pal.amber)
    ctx.fillStyle = stripe
    ctx.fill()

    // Chrome sphere.
    ctx.globalAlpha = Math.min(1, cur.alpha * 1.6)
    let g = ctx.createRadialGradient(cx + R * 0.18, cy + R * 0.42, R * 0.3, cx + R * 0.18, cy + R * 0.42, R * 1.45)
    g.addColorStop(0, pal.shadow); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(cx + R * 0.18, cy + R * 0.42, R * 1.45, 0, 6.2832); ctx.fill()
    g = ctx.createRadialGradient(cx - R * 0.36, cy - R * 0.42, R * 0.04, cx - R * 0.1, cy - R * 0.1, R * 1.12)
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.16, '#dcd8e6'); g.addColorStop(0.46, '#77728a')
    g.addColorStop(0.8, '#17131f'); g.addColorStop(1, pal.rim)
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.fill()
    ctx.save()
    ctx.clip()
    g = ctx.createRadialGradient(cx, cy - R * 1.15, 0, cx, cy - R * 1.15, R * 0.95)
    g.addColorStop(0, pal.red + 'cc'); g.addColorStop(1, pal.red + '00')
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, 2 * R, R)
    g = ctx.createRadialGradient(cx + R * 0.2, cy + R * 1.2, 0, cx + R * 0.2, cy + R * 1.2, R * 0.9)
    g.addColorStop(0, pal.amber + 'aa'); g.addColorStop(1, pal.amber + '00')
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy, 2 * R, R)
    ctx.restore()
    ctx.globalAlpha = 1
  }

  function settle(dt) {
    const t = target(), f = dt === Infinity ? 1 : 1 - Math.exp(-dt * 5.5)
    for (const key in cur) cur[key] += (t[key] - cur[key]) * f
  }

  function frame(now) {
    raf = 0
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
    last = now
    settle(dt)
    time += dt * cur.speed
    const t0 = performance.now()
    draw()
    // Self-governing budget: if drawing averages over 5 ms, halve the vertical resolution, then thin the lines.
    cost += performance.now() - t0
    if (++frames === 45) {
      if (cost / frames > 5 && step < 20) { step += 5; if (step > 15) gap = 13; alloc() }
      cost = 0; frames = 0
    }
    play()
  }
  function play() {
    if (reduced || raf || !onScreen || document.hidden) return
    raf = requestAnimationFrame(frame)
  }
  function still() { settle(Infinity); draw() }

  const seen = new Set()
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? seen.add(e.target) : seen.delete(e.target)
    onScreen = seen.size > 0
    last = performance.now()
    reduced ? still() : play()
  })
  for (const el of windows) io.observe(el)
  document.addEventListener('visibilitychange', () => { last = performance.now(); play() })
  document.addEventListener('themechange', () => { if (reduced || !raf) draw() })
  let resizeQueued = false
  window.addEventListener('resize', () => {
    if (resizeQueued) return
    resizeQueued = true
    requestAnimationFrame(() => { resizeQueued = false; resize(); if (reduced || !raf) still() })
  })

  resize()
  still()
  play()
  return { still }
}
