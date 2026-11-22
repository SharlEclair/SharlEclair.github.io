/**
 * Pip-Boy style boot animation for a 160x144 canvas.
 * drawPip(g, t) is a stateless function of t (seconds): it fully repaints the canvas on every call,
 * so scrubbing in any direction works. Everything is integer-aligned pixel art in phosphor green.
 *
 *   0.0-0.5  scan bar sweeps down, faint afterglow
 *   0.5-2.6  boot text types out, BOOTING bar fills
 *   2.6-3.1  vertical squeeze to a line, then the main screen expands from it
 *   3.1-5.4  main screen: tab bar, thumbs-up figure, HP/AP bars, slow scanline roll
 *   5.4-6.0  CRT power-off: squeeze to a line, shrink to a dot, fade
 */
import { drawText, measureText } from './pixfont.js'

export const PIP_W = 160
export const PIP_H = 144
export const PIP_DURATION = 6

const BR = '#7dffb0' // highlight
const HI = '#3dff8a' // bright phosphor
const MID = '#19b25a'
const DIM = '#0b5a2e'

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeIn = (p) => p * p
const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p))

/* ------------------------------------------------------------------ helpers */

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Cheap deterministic hash noise in [0,1]. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
/** Smoothly interpolated value noise: no hard steps, so no strobing. */
function smoothNoise(x) {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return hash(i) * (1 - u) + hash(i + 1) * u
}

/* ------------------------------------------------------------------ sprite */

// Vault Boy style thumbs-up figure, 36x56. Codes: 1 skin, 2 suit, 3 shade, 4 line (black), 5 highlight.
const SW = 36
const SH = 56
const SPRITE_COL = [null, HI, MID, DIM, '#000', BR]

function buildSprite() {
  const px = Array.from({ length: SH }, () => new Array(SW).fill(0))
  const get = (x, y) => (x < 0 || y < 0 || x >= SW || y >= SH ? 0 : px[y][x])
  const ell = (cx, cy, rx, ry) => (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1
  const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1
  const paint = (mask, col, outline = true) => {
    const m = []
    for (let y = -1; y <= SH; y += 1) for (let x = -1; x <= SW; x += 1) if (mask(x, y)) m.push([x, y])
    if (outline) {
      const set = new Set(m.map(([x, y]) => y * 100 + x))
      for (let y = 0; y < SH; y += 1)
        for (let x = 0; x < SW; x += 1)
          if (px[y][x] && !set.has(y * 100 + x)) {
            if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => set.has((y + dy) * 100 + x + dx))) px[y][x] = 4
          }
    }
    for (const [x, y] of m) if (x >= 0 && y >= 0 && x < SW && y < SH) px[y][x] = col
  }
  const dot = (x, y, col) => {
    if (x >= 0 && y >= 0 && x < SW && y < SH) px[y][x] = col
  }
  const row = (y, x0, x1, col) => {
    for (let x = x0; x <= x1; x += 1) dot(x, y, col)
  }

  // legs and boots
  paint(rect(8, 44, 14, 52), 2)
  paint(rect(18, 44, 24, 52), 2)
  paint(rect(6, 53, 15, 55), 3)
  paint(rect(17, 53, 26, 55), 3)
  // torso
  paint((x, y) => y >= 27 && y <= 45 && x >= 7 + (y > 39 ? 1 : 0) && x <= 25 - (y > 39 ? 1 : 0), 2)
  // hanging arm and fist (viewer's left)
  paint(rect(1, 29, 6, 40), 2)
  paint((x, y) => x >= 1 && x <= 6 && y >= 41 && y <= 46 && !((x === 1 || x === 6) && y === 46), 1)
  row(41, 1, 6, 5) // cuff
  // neck
  paint(rect(13, 23, 19, 28), 1)
  // right arm: upper arm, sleeve, cuff
  paint(rect(24, 29, 29, 34), 2, false)
  paint(rect(28, 25, 34, 33), 2, false)
  row(25, 28, 34, 5) // cuff
  // head, ear
  paint(ell(16, 13, 11.2, 11), 1)
  paint(ell(4.8, 14, 1.8, 2.6), 1)
  // fist and thumb
  paint((x, y) => x >= 28 && x <= 35 && y >= 15 && y <= 24 && !((x === 28 || x === 35) && (y === 15 || y === 24)), 1)
  paint((x, y) => x >= 29 && x <= 32 && y >= 7 && y <= 16 && !((x === 29 || x === 32) && y === 7), 1)
  // fingers (black creases) and thumb highlight
  row(18, 31, 34, 4)
  row(20, 31, 34, 4)
  row(22, 31, 34, 4)
  dot(30, 9, 5)
  dot(30, 10, 5)
  // vault suit details: V collar, belt, buckle, stripes
  for (let i = 0; i < 5; i += 1) row(27 + i, 12 + i, 20 - i, 5)
  row(40, 8, 24, 3)
  row(41, 8, 24, 3)
  dot(15, 40, 5)
  dot(16, 40, 5)
  dot(15, 41, 5)
  dot(16, 41, 5)
  row(33, 8, 24, 3)
  // hair: cap on the head with a left sideburn and a swooping quiff to the right
  const cap = (x, y) => ell(16, 13, 11.2, 11)(x, y) && y < 6 + (x < 14 ? Math.floor((14 - x) * 0.55) : 0)
  const quiff = ell(21, 3.6, 7.5, 3.4)
  paint((x, y) => cap(x, y) || quiff(x, y), 2)
  row(2, 25, 27, 2)
  row(3, 27, 29, 2)
  dot(29, 4, 2)
  row(3, 13, 21, 5) // gloss
  row(4, 11, 12, 5)
  row(1, 17, 22, 2)
  // brows
  row(9, 11, 14, 4)
  row(9, 18, 21, 4)
  dot(10, 10, 4)
  dot(22, 10, 4)
  // eyes: tall black ovals with a glint
  for (const ex of [12, 19]) {
    for (let y = 11; y <= 14; y += 1) {
      dot(ex, y, 4)
      dot(ex + 1, y, 4)
    }
    dot(ex, 11, 5)
  }
  // nose
  dot(16, 15, 3)
  dot(17, 15, 3)
  // big grin with teeth
  row(17, 10, 22, 4)
  row(18, 10, 22, 4)
  row(18, 11, 21, 5)
  row(19, 11, 21, 4)
  dot(9, 17, 3)
  dot(23, 17, 3)
  // cheek blush
  dot(9, 15, 2)
  dot(23, 15, 2)
  return px
}

let spriteCanvas = null
function getSprite() {
  if (spriteCanvas) return spriteCanvas
  const px = buildSprite()
  const c = makeCanvas(SW, SH)
  const s = c.getContext('2d')
  for (let y = 0; y < SH; y += 1)
    for (let x = 0; x < SW; x += 1) {
      const col = SPRITE_COL[px[y][x]]
      if (col) {
        s.fillStyle = col
        s.fillRect(x, y, 1, 1)
      }
    }
  spriteCanvas = c
  return c
}

/* ------------------------------------------------------------------ scenes */

const BOOT_LINES = [
  'PIP-OS(R) V7.1.0.8',
  'COPYRIGHT 2075 ROBCO(R)',
  'LOADER V1.1',
  'EXEC VERSION 41.10',
  '64KB RAM SYSTEM',
  '38911 BYTES FREE',
  'NO HOLOTAPE',
]
const CPS = 110 // typing speed
const LINE_GAP = 0.04
const TEXT_X = 6
const TEXT_Y = 8
const LINE_H = 9
const BOOT_T0 = 0.55
// Cumulative start time of each line, then BOOTING.
const LINE_START = []
{
  let tt = BOOT_T0
  for (const l of BOOT_LINES) {
    LINE_START.push(tt)
    tt += l.length / CPS + LINE_GAP
  }
  LINE_START.push(tt) // BOOTING
}
const BOOTING_START = LINE_START[BOOT_LINES.length]
const BAR_T0 = BOOTING_START + 7 / CPS + 0.05
const BAR_T1 = 2.58
const BAR_BLOCKS = 28

function drawBoot(g, t) {
  g.fillStyle = '#000'
  g.fillRect(0, 0, PIP_W, PIP_H)
  const all = BOOT_LINES.concat(['BOOTING'])
  let cursorX = TEXT_X
  let cursorY = TEXT_Y
  for (let i = 0; i < all.length; i += 1) {
    const typed = Math.min(all[i].length, Math.floor((t - LINE_START[i]) * CPS) + 1)
    if (t < LINE_START[i] || typed <= 0) break
    const y = TEXT_Y + i * LINE_H + (i === all.length - 1 ? 4 : 0)
    const s = all[i].slice(0, typed)
    drawText(g, s, TEXT_X, y, i === all.length - 1 ? BR : HI)
    cursorX = TEXT_X + measureText(s) + 1
    cursorY = y
  }
  // progress bar under BOOTING
  const by = TEXT_Y + BOOT_LINES.length * LINE_H + 4 + LINE_H + 1
  if (t >= BAR_T0) {
    g.fillStyle = MID
    g.fillRect(TEXT_X, by, 148, 1)
    g.fillRect(TEXT_X, by + 9, 148, 1)
    g.fillRect(TEXT_X, by, 1, 10)
    g.fillRect(TEXT_X + 147, by, 1, 10)
    const filled = Math.floor(clamp01((t - BAR_T0) / (BAR_T1 - BAR_T0)) * BAR_BLOCKS)
    g.fillStyle = HI
    for (let i = 0; i < filled; i += 1) g.fillRect(TEXT_X + 3 + i * 5, by + 2, 4, 6)
  }
  // block cursor: solid while typing, blinking when idle
  const typingDone = t >= BOOTING_START + 7 / CPS
  if (t < BAR_T1 && (!typingDone || Math.floor(t * 5) % 2 === 0)) {
    g.fillStyle = HI
    g.fillRect(cursorX, cursorY, 5, 7)
  }
}

const TABS = ['STAT', 'INV', 'DATA', 'MAP', 'RADIO']

function segBar(g, x, y, w, blocks, filled, pulse) {
  g.fillStyle = MID
  g.fillRect(x, y, w, 1)
  g.fillRect(x, y + 8, w, 1)
  g.fillRect(x, y, 1, 9)
  g.fillRect(x + w - 1, y, 1, 9)
  for (let i = 0; i < blocks; i += 1) {
    if (i >= filled) {
      g.fillStyle = DIM
      g.fillRect(x + 3 + i * 4, y + 3, 3, 3)
    } else {
      g.fillStyle = pulse && i === filled - 1 ? MID : HI
      g.fillRect(x + 3 + i * 4, y + 2, 3, 5)
    }
  }
}

function drawMain(g, t) {
  g.fillStyle = '#000'
  g.fillRect(0, 0, PIP_W, PIP_H)
  const lt = t - 3.1
  // frame
  g.fillStyle = MID
  g.fillRect(3, 2, 154, 1)
  g.fillRect(3, 141, 154, 1)
  g.fillRect(2, 3, 1, 138)
  g.fillRect(157, 3, 1, 138)
  // tab bar
  let x = 9
  const ty = 6
  g.fillStyle = MID
  g.fillRect(5, 19, 150, 1)
  for (let i = 0; i < TABS.length; i += 1) {
    const w = measureText(TABS[i]) + 4
    if (i === 0) {
      g.fillStyle = HI
      g.fillRect(x, ty, w, 11)
      drawText(g, TABS[i], x + 2, ty + 2, '#000')
      g.fillStyle = HI
      g.fillRect(x, 19, w, 1)
    } else {
      drawText(g, TABS[i], x + 2, ty + 2, MID)
    }
    x += w + 3
  }
  // side rulers
  for (let y = 26; y <= 116; y += 6) {
    const major = (y - 26) % 18 === 0
    g.fillStyle = major ? MID : DIM
    g.fillRect(6, y, major ? 5 : 3, 1)
    g.fillRect(major ? 149 : 151, y, major ? 5 : 3, 1)
  }
  // figure with idle bob
  const bob = Math.round(Math.sin(lt * 2.4) * 1)
  const sx = 62
  const sy = 42 + bob
  const reveal = clamp01((lt - 0.05) / 0.35)
  const rows = Math.ceil(reveal * SH)
  // ground shadow
  g.fillStyle = DIM
  g.fillRect(52, 100, 56, 1)
  g.fillRect(58, 101, 44, 1)
  g.fillStyle = MID
  g.fillRect(64, 100, 32, 1)
  if (rows > 0) {
    g.drawImage(getSprite(), 0, 0, SW, rows, sx, sy, SW, rows)
    if (reveal < 1) {
      g.fillStyle = BR
      g.fillRect(sx - 4, sy + rows - 1, SW + 8, 1)
    }
  }
  // status line
  g.fillStyle = MID
  g.fillRect(5, 122, 150, 1)
  const hpFill = Math.round(12 * clamp01((lt - 0.2) / 0.5) * 0.85)
  const apFill = Math.round(12 * clamp01((lt - 0.3) / 0.5) * 0.7)
  drawText(g, 'HP', 8, 128, HI)
  segBar(g, 21, 127, 55, 12, hpFill, false)
  drawText(g, 'AP', 84, 128, HI)
  segBar(g, 97, 127, 55, 12, apFill, lt > 1.2 && Math.floor(lt * 1.6) % 2 === 0)
}

/* ------------------------------------------------------------------ CRT passes */

function scanlines(g) {
  g.fillStyle = 'rgba(0,0,0,0.25)'
  for (let y = 1; y < PIP_H; y += 2) g.fillRect(0, y, PIP_W, 1)
}

function vignette(g) {
  const N = 14
  for (let i = 0; i < N; i += 1) {
    const a = 0.45 * (1 - i / N) ** 2
    g.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`
    g.fillRect(i, i, PIP_W - i * 2, 1)
    g.fillRect(i, PIP_H - 1 - i, PIP_W - i * 2, 1)
    g.fillRect(i, i + 1, 1, PIP_H - i * 2 - 2)
    g.fillRect(PIP_W - 1 - i, i + 1, 1, PIP_H - i * 2 - 2)
  }
  // rounded screen corners
  g.fillStyle = '#000'
  const c = [3, 1, 1]
  for (let r = 0; r < c.length; r += 1) {
    g.fillRect(0, r, c[r], 1)
    g.fillRect(PIP_W - c[r], r, c[r], 1)
    g.fillRect(0, PIP_H - 1 - r, c[r], 1)
    g.fillRect(PIP_W - c[r], PIP_H - 1 - r, c[r], 1)
  }
}

/** Slow soft brightness band rolling down the screen. */
function scanRoll(g, t) {
  const y0 = Math.floor(((t * 0.45) % 1.4) * (PIP_H + 40)) - 40
  for (let i = 0; i < 28; i += 2) {
    const a = 0.05 * Math.sin((i / 28) * Math.PI)
    g.fillStyle = `rgba(61,255,138,${a.toFixed(3)})`
    g.fillRect(0, y0 + i, PIP_W, 2)
  }
}

let offCanvas = null
function getOff() {
  if (!offCanvas) offCanvas = makeCanvas(PIP_W, PIP_H)
  const o = offCanvas.getContext('2d')
  o.imageSmoothingEnabled = false
  return o
}

/** Blit `src` vertically squeezed around the centre line. */
function blitSqueeze(g, src, sy) {
  const h = Math.max(1, Math.round(PIP_H * sy))
  const y0 = Math.round(PIP_H / 2 - h / 2)
  // smoothing on only here: averaging rows keeps a squeezed picture from aliasing into noise
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  g.drawImage(src, 0, 0, PIP_W, PIP_H, 0, y0, PIP_W, h)
  g.imageSmoothingEnabled = false
  if (h < 40) {
    // the squeezed picture glows as a line
    const a = (1 - h / 40) * 0.55
    g.fillStyle = `rgba(125,255,176,${a.toFixed(3)})`
    g.fillRect(0, y0, PIP_W, h)
  }
}

/* ------------------------------------------------------------------ main entry */

export function drawPip(g, t) {
  g.imageSmoothingEnabled = false
  g.globalAlpha = 1
  g.fillStyle = '#000'
  g.fillRect(0, 0, PIP_W, PIP_H)
  if (t < 0) t = 0
  if (t >= PIP_DURATION) return

  if (t < BOOT_T0) {
    // scan bar with afterglow
    const p = clamp01(t / 0.5)
    const bar = Math.floor(p * (PIP_H + 6)) - 3
    for (let y = 0; y < PIP_H; y += 1) {
      if (y > bar) continue
      const a = 0.2 * Math.exp(-(bar - y) / 46) * (1 - clamp01((t - 0.3) / 0.25))
      if (a < 0.01) continue
      g.fillStyle = `rgba(25,178,90,${a.toFixed(3)})`
      g.fillRect(0, y, PIP_W, 1)
    }
    const bandA = [[-2, 0.3, HI], [-1, 0.6, HI], [0, 1, BR], [1, 0.55, HI], [2, 0.25, MID]]
    for (const [dy, a, col] of bandA) {
      const y = bar + dy
      if (y < 0 || y >= PIP_H) continue
      g.globalAlpha = a
      g.fillStyle = col
      g.fillRect(0, y, PIP_W, 1)
    }
    g.globalAlpha = 1
  } else if (t < 2.6) {
    // faint afterglow still fading as text starts
    const fade = 0.2 * (1 - clamp01((t - 0.5) / 0.25))
    if (fade > 0.01) {
      g.fillStyle = `rgba(25,178,90,${(fade * 0.5).toFixed(3)})`
      g.fillRect(0, 0, PIP_W, PIP_H)
    }
    drawBoot(g, t)
  } else if (t < 3.1) {
    const o = getOff()
    if (t < 2.85) {
      drawBoot(o, 2.6)
      blitSqueeze(g, offCanvas, 1 - 0.985 * easeIn((t - 2.6) / 0.25))
    } else if (t < 2.95) {
      g.fillStyle = BR
      g.fillRect(0, 71, PIP_W, 2)
    } else {
      drawMain(o, 3.1)
      blitSqueeze(g, offCanvas, 0.015 + 0.985 * easeInOut((t - 2.95) / 0.15))
    }
  } else if (t < 5.4) {
    drawMain(g, t)
    scanRoll(g, t)
  } else {
    // CRT power-off
    const o = getOff()
    drawMain(o, 5.4)
    if (t < 5.75) {
      blitSqueeze(g, offCanvas, 1 - 0.985 * easeIn((t - 5.4) / 0.35))
    } else if (t < 5.9) {
      const p = easeInOut((t - 5.75) / 0.15)
      const w = Math.max(4, Math.round(PIP_W * (1 - p)))
      g.fillStyle = BR
      g.fillRect(Math.round((PIP_W - w) / 2), 71, w, 2)
      g.fillStyle = `rgba(61,255,138,${(0.35 * (1 - p)).toFixed(3)})`
      g.fillRect(Math.round((PIP_W - w) / 2) - 6, 70, w + 12, 4)
    } else {
      const a = 1 - clamp01((t - 5.9) / 0.1)
      g.fillStyle = `rgba(125,255,176,${a.toFixed(3)})`
      g.fillRect(78, 71, 4, 2)
      g.fillStyle = `rgba(61,255,138,${(a * 0.3).toFixed(3)})`
      g.fillRect(76, 70, 8, 4)
    }
  }

  // gentle CRT flicker: a very small smooth dip in brightness
  if (t < 5.4) {
    const f = 0.025 + 0.045 * smoothNoise(t * 9)
    g.fillStyle = `rgba(0,0,0,${f.toFixed(3)})`
    g.fillRect(0, 0, PIP_W, PIP_H)
  }
  scanlines(g)
  vignette(g)
}
