/**
 * ?sql=barrel  "ASCII Barrel": the database icon (three stacked disc platters) as a rotating ASCII sculpture on a
 * canvas 2D grid. The angle around the barrel picks the character from the query string itself, lighting only picks
 * one of four LCD shades, so turning the barrel scrolls the SQL around it. The `tools` band goes red, scrambles and a
 * crack of / \ | splits the middle platter; a scan ring then travels down the barrel and rewrites the band as `stack`.
 *
 * Canvas 2D only (no WebGL): analytic ray vs cylinder per cell, a glyph atlas built once per theme / size, drawImage
 * per cell. Draws only when scroll progress or the pointer changes; no idle loop.
 */
const QUERY = "SELECT title FROM projects WHERE list_contains(tools, 'DuckDB');"
const BAD = 'tools'
const FIX = 'stack'
const SCRAMBLE = '?#%!'
const CRACK = '/\\|'
const L = QUERY.length
const BAND0 = QUERY.indexOf(BAD)
const BAND1 = BAND0 + BAD.length
const TAU = Math.PI * 2

// geometry (barrel space: axis = y, radius 1)
const HALF = 0.8
const GAP = 0.16 // about 1.3 cell rows at desktop scale (the brief's 0.04 would fall between rows)
const PLATTER = (2 * HALF - 2 * GAP) / 3
const RIM = 0.05
const TILT0 = (24 * Math.PI) / 180
const LIGHT = (() => { const x = -0.78, y = 0.35, z = 0.52, n = Math.hypot(x, y, z); return [x / n, y / n, z / n] })()
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)
const SHADE_MIX = [0.22, 0.44, 0.72, 1]
const BG_MIX = [0.09, 0.16, 0.27]
const ROWS_PER_COLOUR = 7 // 4 lcd shades + 3 faint background levels

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const hash = (a, b, c = 0) => {
  let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263) ^ Math.imul(c + 13, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

let cssLoaded = false
function loadCss() {
  if (cssLoaded || document.querySelector('link[data-barrel-css]')) { cssLoaded = true; return }
  cssLoaded = true
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = new URL('./barrel.css', import.meta.url).href
  link.dataset.barrelCss = ''
  document.head.appendChild(link)
}

function parseColour(css) {
  const n = (css.match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number)
  if (n.length < 3) return [128, 128, 128]
  return css.startsWith('color(') ? [n[0] * 255, n[1] * 255, n[2] * 255] : [n[0], n[1], n[2]]
}

// glyph set: the query (spaces drawn as middle dots), the fix, the scramble, the crack, two background marks
const DISPLAY = QUERY.replace(/ /g, '·')
const GLYPHS = [...new Set([...DISPLAY, ...FIX, ...SCRAMBLE, ...CRACK, '+'])]
const NG = GLYPHS.length
const GI = new Map(GLYPHS.map((g, i) => [g, i]))
const queryGI = [...DISPLAY].map((g) => GI.get(g))
const fixGI = [...FIX].map((g) => GI.get(g))
const scrGI = [...SCRAMBLE].map((g) => GI.get(g))
const crackGI = [...CRACK].map((g) => GI.get(g))
const DOT = GI.get('·')
const PLUS = GI.get('+')
const UNDER = GI.get('_')
const BAND_CENTRE = ((BAND0 + BAND1) / 2 / L) * TAU

export function mount(el, { runway, theme, reduced = false, progress } = {}) {
  loadCss()
  const doc = el.ownerDocument
  const interactive = !reduced && matchMedia('(hover: hover) and (pointer: fine)').matches
  const phoneMq = matchMedia('(max-width: 760px)')

  // ---------------------------------------------------------------- DOM
  const root = doc.createElement('div')
  root.className = 'bl-root'
  root.dataset.state = 'run'
  root.dataset.fixed = '0'
  root.dataset.score = '0'
  if (interactive) root.dataset.live = '1'
  root.innerHTML =
    '<div class="bl-glow" aria-hidden="true"></div>' +
    '<canvas class="bl-cv" aria-hidden="true"></canvas>' +
    '<div class="bl-hud">' +
    '<p class="bl-query">SELECT title FROM projects WHERE list_contains(<span class="bl-tok">tools</span>, \'DuckDB\');</p>' +
    '<p class="bl-status"></p>' +
    '<p class="bl-score">Correct, after self-healing  <b>10 / 10</b></p>' +
    '<p class="bl-cap">Illustration: a query on this page\'s own content. Scores are from the project\'s test set.</p>' +
    '</div>' +
    '<span class="bl-probe" aria-hidden="true"></span>'
  el.appendChild(root)
  const cv = root.querySelector('.bl-cv')
  const ctx = cv.getContext('2d')
  const hudStatus = root.querySelector('.bl-status')
  const tok = root.querySelector('.bl-tok')
  const probe = root.querySelector('.bl-probe')

  // ---------------------------------------------------------------- layout + atlas
  let cols = 96, rows = 48, cwD = 9, chD = 16, dpr = 1
  let U = 100, cx0 = 48, cy0 = 12
  let bgG = new Uint8Array(0), bgRow = new Uint8Array(0), bgOn = new Uint8Array(0)
  let atlas = null
  let bgLayer = null
  let bgStale = true
  let bx0 = 0, bx1 = 0, by0 = 0, by1 = 0 // the cells the barrel can touch; everything else is a static layer
  let colours = null
  let layoutKey = ''

  function readColours() {
    const get = (name) => { probe.style.color = `var(${name})`; return parseColour(getComputedStyle(probe).color) }
    const c = { stage: get('--stage'), on: get('--on-stage'), err: get('--stage-err'), acc: get('--stage-accent') }
    return c
  }
  const mix = (c, s, a) => `rgb(${Math.round(c[0] * a + s[0] * (1 - a))},${Math.round(c[1] * a + s[1] * (1 - a))},${Math.round(c[2] * a + s[2] * (1 - a))})`

  function buildAtlas() {
    colours = readColours()
    const family = getComputedStyle(probe).fontFamily || 'monospace'
    atlas = atlas || doc.createElement('canvas')
    atlas.width = NG * cwD
    atlas.height = 3 * ROWS_PER_COLOUR * chD
    const a = atlas.getContext('2d')
    a.clearRect(0, 0, atlas.width, atlas.height)
    a.font = `500 ${(14 / 9) * cwD}px ${family}`
    a.textAlign = 'center'
    a.textBaseline = 'middle'
    bgStale = true
    const lum = (colours.stage[0] * 0.2126 + colours.stage[1] * 0.7152 + colours.stage[2] * 0.0722) / 255
    const bgGain = lum > 0.5 ? 0.42 : 1
    const base = [colours.on, colours.err, colours.acc]
    for (let col = 0; col < 3; col += 1) {
      for (let s = 0; s < ROWS_PER_COLOUR; s += 1) {
        if (s >= 4 && col > 0) continue
        a.fillStyle = mix(base[col], colours.stage, s < 4 ? SHADE_MIX[s] : BG_MIX[s - 4] * bgGain)
        const y = (col * ROWS_PER_COLOUR + s) * chD + chD * 0.54
        for (let g = 0; g < NG; g += 1) a.fillText(GLYPHS[g], g * cwD + cwD / 2, y)
      }
    }
  }

  function layout() {
    const W = el.clientWidth, H = el.clientHeight
    if (!W || !H) return false
    const phone = phoneMq.matches
    cols = phone ? 52 : 96
    rows = phone ? 30 : 48
    dpr = Math.min(2, window.devicePixelRatio || 1)
    const pad = clamp(0.04 * innerWidth, 17.6, 56)
    const availW = phone ? W - 2 * pad : 0.6 * W
    let cw = Math.min(9, availW / cols)
    cw = Math.min(cw, ((H * (phone ? 0.46 : 0.9)) / rows) * (9 / 16))
    cwD = Math.max(4, Math.round(cw * dpr))
    if ((cols * cwD) / dpr > availW + 12) cwD -= 1
    chD = Math.round((cwD * 16) / 9)
    const cssW = (cols * cwD) / dpr, cssH = (rows * chD) / dpr
    const topRow = phone ? 1.5 : 4
    const barrelRows = phone ? 17 : 19
    const left = phone ? (W - cssW) / 2 : W * 0.4 + (W * 0.6 - cssW) / 2
    const top = phone ? 4 : Math.max(40, H * 0.165 - (topRow * chD) / dpr)

    const key = [cols, rows, cwD, chD, dpr].join('|')
    if (key !== layoutKey) {
      layoutKey = key
      cv.width = cols * cwD
      cv.height = rows * chD
      buildAtlas()
    }
    cv.style.width = `${cssW}px`
    cv.style.height = `${cssH}px`
    cv.style.left = `${left}px`
    cv.style.top = `${top}px`

    U = (barrelRows * chD) / (1.6 * Math.cos(TILT0) + 2 * Math.sin(TILT0))
    cx0 = cols / 2
    cy0 = topRow + barrelRows / 2

    // background field: a faint LED grid that blooms around the barrel (ordered dither, no per-frame cost)
    bgG = new Uint8Array(cols * rows)
    bgRow = new Uint8Array(cols * rows)
    bgOn = new Uint8Array(cols * rows)
    const hudRow = topRow + barrelRows + 1.4 // no dots behind the HUD text
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const dx = ((c + 0.5 - cx0) * cwD) / U, dy = ((r + 0.5 - cy0) * chD) / U
        const v = clamp(1 - Math.hypot(dx * 0.9, dy * 1.05) / 2.2)
        // ordered dither: dense near the barrel, a sparse faint scatter far away, never a hard edge
        const lvl = Math.min(2, Math.floor(v * 3.4 + BAYER[(r & 3) * 4 + (c & 3)] * 0.8 - 0.7))
        bgRow[r * cols + c] = 4 + Math.max(0, lvl)
        bgG[r * cols + c] = lvl > 0 ? PLUS : DOT
        bgOn[r * cols + c] = lvl >= 0 && v > 0.12 && r < hudRow ? 1 : 0
      }
    }

    const hudTop = top + ((topRow + barrelRows + 2.2) * chD) / dpr
    root.style.setProperty('--bl-hud-top', `${hudTop}px`)
    root.style.setProperty('--bl-hud-cx', `${left + cssW / 2}px`)
    root.style.setProperty('--bl-hud-w', `${Math.max(280, Math.min(528, cssW))}px`)
    const gr = ((2.9 * U) / dpr)
    root.style.setProperty('--bl-gx', `${left + (cx0 * cwD) / dpr}px`)
    root.style.setProperty('--bl-gy', `${top + (cy0 * chD) / dpr}px`)
    root.style.setProperty('--bl-gr', `${gr}px`)
    bx0 = Math.max(0, Math.floor(cx0 - (1.12 * U) / cwD)); bx1 = Math.min(cols - 1, Math.ceil(cx0 + (1.12 * U) / cwD))
    by0 = Math.max(0, Math.floor(cy0 - (1.3 * U) / chD)); by1 = Math.min(rows - 1, Math.ceil(cy0 + (1.3 * U) / chD))
    if (bgStale || !bgLayer) buildBg()
    return true
  }

  // the faint LED field outside the barrel's cells, drawn once per size / theme and blitted in one call per frame
  function buildBg() {
    bgStale = false
    bgLayer = bgLayer || doc.createElement('canvas')
    bgLayer.width = cols * cwD
    bgLayer.height = rows * chD
    const b = bgLayer.getContext('2d')
    b.clearRect(0, 0, bgLayer.width, bgLayer.height)
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (c >= bx0 && c <= bx1 && r >= by0 && r <= by1) continue
        if (!bgOn[r * cols + c]) continue
        b.drawImage(atlas, bgG[r * cols + c] * cwD, bgRow[r * cols + c] * chD, cwD, chD, c * cwD, r * chD, cwD, chD)
      }
    }
  }

  // ---------------------------------------------------------------- state
  let ptTx = 0, ptTy = 0, ptX = 0, ptY = 0 // pointer target / damped, -1..1
  let spin = 0, spinVel = 0, dragging = false
  let lastP = -1
  let onScreen = false
  let raf = 0
  let dirty = true
  let lastT = 0
  let disposed = false

  function hud(p) {
    const state = p < 0.25 ? 'run' : p < 0.4 ? 'err' : p < 0.75 ? 'heal' : 'ok'
    if (root.dataset.state !== state) {
      root.dataset.state = state
      hudStatus.textContent =
        state === 'run' ? '● RUNNING' : state === 'err' ? '✕ ERROR  column "tools" not found' : state === 'heal' ? '↻ SELF-HEALING' : '✓ CORRECT  4 rows'
    }
    const fixed = p >= 0.4 + 0.35 * 0.5 ? '1' : '0'
    if (root.dataset.fixed !== fixed) { root.dataset.fixed = fixed; tok.textContent = fixed === '1' ? FIX : BAD }
    const score = p >= 0.88 ? '1' : '0'
    if (root.dataset.score !== score) root.dataset.score = score
  }

  // ---------------------------------------------------------------- draw
  let lastMs = 0
  function draw(p, yaw, tilt) {
    const t0 = performance.now()
    const ct = Math.cos(tilt), st = Math.sin(tilt)
    const e = sm(0.25, 0.4, p) // error amount: cells flip one by one as it rises
    const heal = p >= 0.4
    const w = clamp((p - 0.4) / 0.35)
    const k = Math.floor(w * 48)
    const yTop = HALF + 0.06, yBot = -HALF - 0.12
    const yRing = heal ? yTop - (k * (yTop - yBot)) / 48 : 9
    const ringOn = heal && w < 1
    const ringHalf = (0.62 * chD) / U / ct
    const step8 = Math.floor(p * 56) & 7
    const crackW = 0.75 * e
    const dt = ct * ct
    const lx = LIGHT[0], ly = LIGHT[1], lz = LIGHT[2]

    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.drawImage(bgLayer, 0, 0)
    for (let r = by0; r <= by1; r += 1) {
      const sy = (-(r + 0.5 - cy0) * chD) / U
      const oy = sy * ct + 5 * st, oz = -sy * st + 5 * ct
      for (let c = bx0; c <= bx1; c += 1) {
        let gi = bgG[r * cols + c], row = bgRow[r * cols + c]
        {
          const sx = ((c + 0.5 - cx0) * cwD) / U
          let x = 0, z = 0, y = 0, cap = false, hit = false
          // top cap first (the nearer surface whenever the ray lands inside the disc)
          const tc = (HALF - oy) / -st
          const zc = oz - ct * tc
          if (sx * sx + zc * zc <= 1) { x = sx; z = zc; y = HALF; cap = true; hit = true }
          else {
            const b = -oz * ct, cc = sx * sx + oz * oz - 1, disc = b * b - dt * cc
            if (disc >= 0) {
              const ts = (-b - Math.sqrt(disc)) / dt
              y = oy - st * ts
              if (y <= HALF && y >= -HALF) { x = sx; z = oz - ct * ts; hit = true }
            }
          }
          let within = 0, plat = 0, gap = false
          if (hit && !cap) {
            const yt = HALF - y
            plat = Math.min(2, Math.floor(yt / (PLATTER + GAP)))
            within = yt - plat * (PLATTER + GAP)
            if (within > PLATTER) gap = true // the groove between two platters
          }
          if (hit && gap) {
            // the groove: a dim line of underscores (a glyph from the query) so the three platters read as a stack
            gi = UNDER
            row = 1
            if (ringOn && Math.abs(y - yRing) < ringHalf) { gi = PLUS; row = 3 }
          } else if (hit) {
            const phi = Math.atan2(x, z) - yaw
            let f = phi / TAU
            f -= Math.floor(f)
            const idx = Math.min(L - 1, (f * L) | 0)
            // lighting only picks the shade
            const lam = cap ? (x * x + z * z > 0.74 ? 0.95 : 0.5) : 0.04 + Math.max(0, x * lx + z * lz)
            let shade = lam + (BAYER[(r & 3) * 4 + (c & 3)] - 0.5) * 0.16
            shade = shade > 0.64 ? 3 : shade > 0.4 ? 2 : shade > 0.15 ? 1 : 0
            if (!cap) {
              if (within < RIM && shade < 3) shade += 1
              else if (within > PLATTER - RIM && shade > 0) shade -= 1
            }
            gi = queryGI[idx]
            let col = 0
            const resolved = heal && y > yRing
            if (idx >= BAND0 && idx < BAND1) {
              if (resolved) { gi = fixGI[idx - BAND0]; col = 2; shade = ringOn && y - yRing < 4 * ringHalf ? 3 : Math.max(shade, 2) }
              else if (e > 0 && hash(c, r) < e) {
                col = 1
                if (shade < 2) shade = 2
                if (e > 0.12 || hash(c, r, 5) < e * 8) gi = scrGI[(hash(c, r, step8 + 1) * 4) | 0]
              }
            }
            // the crack across the middle platter: a seam of / \ | that grows from the band outwards
            if (!cap && plat === 1 && crackW > 0 && !resolved) {
              let d = phi - BAND_CENTRE
              d -= TAU * Math.round(d / TAU)
              if (Math.abs(d) <= crackW) {
                const u = (d + 0.75) / 0.17
                const k0 = Math.floor(u), fr = u - k0
                const v0 = hash(k0, 3) * 2 - 1, v1 = hash(k0 + 1, 3) * 2 - 1
                const target = PLATTER / 2 + (v0 + (v1 - v0) * fr) * 0.17
                if (Math.abs(within - target) < 0.09) {
                  const dv = (v1 - v0) * 0.17
                  gi = crackGI[Math.abs(dv) > 0.17 ? 2 : dv > 0 ? 0 : 1]
                  col = 1
                  shade = 3
                }
              }
            }
            // the scan ring: accent light across the whole barrel at the current row
            if (ringOn && Math.abs(y - yRing) < ringHalf) { col = 0; shade = 3; gi = PLUS }
            row = col * ROWS_PER_COLOUR + shade
          }
        }
        if (row < 4 || row > 6 || bgOn[r * cols + c]) ctx.drawImage(atlas, gi * cwD, row * chD, cwD, chD, c * cwD, r * chD, cwD, chD)
      }
    }
    lastMs = performance.now() - t0
    root.__ms = lastMs
  }

  // ---------------------------------------------------------------- loop
  const story = (p) => ((50 * sm(0, 0.25, p) + 70 * sm(0.75, 0.88, p)) * Math.PI) / 180

  function frame(now) {
    raf = 0
    if (disposed || !onScreen) return
    const dt = clamp((now - lastT) / 1000 || 0.016, 0.001, 0.05)
    lastT = now
    const p = progress ? progress() : 1
    let moving = Math.abs(p - lastP) > 1e-5
    // pointer + spin dynamics (desktop only)
    if (interactive) {
      const nx = damp(ptX, ptTx, 6, dt), ny = damp(ptY, ptTy, 6, dt)
      const px = Math.abs(nx - ptTx) < 1e-3 ? ptTx : nx
      const py = Math.abs(ny - ptTy) < 1e-3 ? ptTy : ny
      if (px !== ptX || py !== ptY) moving = true
      ptX = px
      ptY = py
      if (!dragging) {
        if (Math.abs(spinVel) > 0.03) {
          spin += spinVel * dt
          spinVel *= Math.exp(-5 * dt)
          moving = true
        } else {
          spinVel = 0
          const home = TAU * Math.round(spin / TAU)
          if (Math.abs(spin - home) > 4e-3) { spin = damp(spin, home, 5, dt); moving = true } else if (spin !== home) { spin = home; moving = true }
        }
      } else moving = true
    }
    if (moving || dirty) {
      lastP = p
      dirty = false
      const yaw = story(p) + ptX * ((35 * Math.PI) / 180) + spin
      const tilt = TILT0 + ptY * ((8 * Math.PI) / 180)
      hud(p)
      draw(p, yaw, tilt)
    }
    if (moving) kick()
  }
  function kick() {
    if (!raf && onScreen && !disposed && !reduced) raf = requestAnimationFrame(frame)
  }

  // reduced motion: one static frame at p = 1
  function drawStatic() {
    hud(1)
    draw(1, story(1), TILT0)
  }

  function relayout() {
    if (!layout()) return
    if (reduced) drawStatic()
    else { dirty = true; kick() }
  }

  // ---------------------------------------------------------------- theme
  let themeSig = ''
  function setTheme() {
    probe.style.color = 'var(--stage)'
    const sig = ['--stage', '--on-stage', '--stage-err', '--stage-accent'].map((n) => { probe.style.color = `var(${n})`; return getComputedStyle(probe).color }).join('|')
    if (sig === themeSig && atlas) return
    themeSig = sig
    if (!layout()) return
    buildAtlas()
    buildBg()
    if (reduced) drawStatic()
    else { dirty = true; kick() }
  }
  const onThemeChange = () => setTheme()
  doc.addEventListener('themechange', onThemeChange)

  // ---------------------------------------------------------------- input
  const centreOf = () => {
    const r = cv.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.3, hw: Math.max(220, r.width * 0.5), hh: Math.max(180, r.height * 0.5) }
  }
  let lastX = 0, lastMoveT = 0
  const onMove = (ev) => {
    if (!onScreen || ev.pointerType === 'touch') return
    const c = centreOf()
    ptTx = clamp((ev.clientX - c.x) / c.hw, -1, 1)
    ptTy = clamp((ev.clientY - c.y) / c.hh, -1, 1)
    if (dragging) {
      const dx = ev.clientX - lastX
      const now = performance.now()
      const dts = Math.max(0.008, (now - lastMoveT) / 1000)
      spin += dx * 0.012
      spinVel = clamp(0.6 * spinVel + 0.4 * ((dx * 0.012) / dts), -14, 14)
      lastX = ev.clientX
      lastMoveT = now
    }
    kick()
  }
  const onDown = (ev) => {
    if (ev.pointerType === 'touch' || ev.button !== 0) return
    dragging = true
    root.dataset.drag = '1'
    lastX = ev.clientX
    lastMoveT = performance.now()
    spinVel = 0
    try { cv.setPointerCapture(ev.pointerId) } catch { /* ignore */ }
    kick()
  }
  const onUp = () => {
    if (!dragging) return
    dragging = false
    delete root.dataset.drag
    if (performance.now() - lastMoveT > 90) spinVel = 0
    kick()
  }
  const onLeave = () => { ptTx = 0; ptTy = 0; kick() }
  if (interactive) {
    window.addEventListener('pointermove', onMove, { passive: true })
    cv.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    doc.documentElement.addEventListener('pointerleave', onLeave)
  }
  const onScroll = () => kick()
  if (!reduced) window.addEventListener('scroll', onScroll, { passive: true })

  // ---------------------------------------------------------------- lifecycle
  const ro = new ResizeObserver(() => relayout())
  ro.observe(el)
  const onDpr = () => relayout()
  window.addEventListener('resize', onDpr)
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((en) => en.isIntersecting)
    if (onScreen) { dirty = true; lastT = performance.now(); kick() }
  })
  io.observe(runway || el)
  doc.fonts?.ready.then(() => { if (!disposed && layoutKey) { buildAtlas(); buildBg(); if (reduced) drawStatic(); else { dirty = true; kick() } } })

  hudStatus.textContent = '● RUNNING'
  setTheme()
  if (!layoutKey) layout()
  if (reduced) { onScreen = true; drawStatic() }

  root.__bench = (n = 60) => {
    const t0 = performance.now()
    for (let i = 0; i < n; i += 1) draw(0.5 + (i % 10) * 0.04, story(0.5), TILT0)
    return (performance.now() - t0) / n
  }

  return {
    setTheme: () => setTheme(),
    dispose() {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      doc.removeEventListener('themechange', onThemeChange)
      window.removeEventListener('resize', onDpr)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      doc.documentElement.removeEventListener('pointerleave', onLeave)
      root.remove()
    },
  }
}
