/**
 * Pip-Boy (Fallout 4 style) boot animation for a 160x144 canvas.
 * drawPip(g, t) is a stateless function of t (seconds): it fully repaints the canvas on every call,
 * so scrubbing in any direction works. Everything is integer-aligned pixel art in phosphor green.
 *
 *   0.0-1.3  a dense wall of tiny debug text scrolls up and out of the top of the screen
 *   1.3-4.5  PIP-OS header and the boot lines type out, one after another, with a block cursor
 *   4.5-4.9  the text stack scrolls off the top
 *   4.9-5.7  Vault Boy, hands on hips, with INITIATING... beneath him
 *   5.7-7.5  his arm swings up into a thumbs up, which holds
 *   7.5-8.0  CRT power-off: squeeze to a line, shrink to a dot, fade
 */
import { drawText, measureText } from './pixfont.js'

export const PIP_W = 160
export const PIP_H = 144
export const PIP_DURATION = 8

const BR = '#7dffb0' // highlight
const HI = '#3dff8a' // bright phosphor
const MID = '#19b25a'
const DIM = '#0b5a2e'
const FAINT = '#12803f' // dim text that must stay readable under the scanlines

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

/* ------------------------------------------------------------------ tiny 3x5 font for the debug wall */

const TINY_RAW = {
  0: '111 101 101 101 111',
  1: '010 110 010 010 111',
  2: '111 001 111 100 111',
  3: '111 001 111 001 111',
  4: '101 101 111 001 001',
  5: '111 100 111 001 111',
  6: '111 100 111 101 111',
  7: '111 001 010 010 010',
  8: '111 101 111 101 111',
  9: '111 101 111 001 111',
  A: '010 101 111 101 101',
  B: '110 101 110 101 110',
  C: '011 100 100 100 011',
  D: '110 101 101 101 110',
  E: '111 100 110 100 111',
  F: '111 100 110 100 100',
  G: '011 100 101 101 011',
  H: '101 101 111 101 101',
  I: '111 010 010 010 111',
  J: '001 001 001 101 010',
  K: '101 101 110 101 101',
  L: '100 100 100 100 111',
  M: '101 111 111 101 101',
  N: '111 101 101 101 101',
  O: '010 101 101 101 010',
  P: '110 101 110 100 100',
  Q: '010 101 101 111 011',
  R: '110 101 110 101 101',
  S: '011 100 010 001 110',
  T: '111 010 010 010 010',
  U: '101 101 101 101 111',
  V: '101 101 101 101 010',
  W: '101 101 111 111 101',
  X: '101 101 010 101 101',
  Y: '101 101 010 010 010',
  Z: '111 001 010 100 111',
  '*': '101 010 111 010 101',
  '.': '000 000 000 000 010',
}
const TINY = {}
for (const [ch, rows] of Object.entries(TINY_RAW)) TINY[ch] = rows.split(' ').map((r) => parseInt(r, 2))

function drawTiny(g, text, x, y) {
  for (let i = 0; i < text.length; i += 1) {
    const rows = TINY[text[i]]
    if (!rows) continue
    const cx = x + i * 4
    for (let r = 0; r < 5; r += 1) {
      const bits = rows[r]
      if (bits & 4) g.fillRect(cx, y + r, 1, 1)
      if (bits & 2) g.fillRect(cx + 1, y + r, 1, 1)
      if (bits & 1) g.fillRect(cx + 2, y + r, 1, 1)
    }
  }
}

/* ------------------------------------------------------------------ debug wall */

const WALL_TOKENS = [
  '* 1 0 0x0000A4 0x0000000000000000 start memory discovery 0 0x0000A4',
  '0x0000000000000000 1 0 0x000014 0x0000000000000000 CPU0 starting cell relocation0 0x0000A4',
  'CPU0 launch EFI0 0x0000A4 0x0000000000000000 1 0 0x000009',
  '0x0000000000000E03D CPU0 starting EFI0',
]
const WALL_X = 8
const WALL_COLS = 36 // 36 chars * 4px = 144px, the same width as the typed text block
const WALL_LINES = 26
const WALL_PITCH = 6
const WALL_H = WALL_LINES * WALL_PITCH
const WALL_TOP0 = 64 // y of the first wall line at t = 0
const WALL_END_T = 1.25 // the wall's last line reaches the header row
const HDR_Y = 9 // y of the header row
const WALL_V = (WALL_TOP0 + WALL_H - HDR_Y) / WALL_END_T

let wallCanvas = null
function getWall() {
  if (wallCanvas) return wallCanvas
  // word wrap the endlessly cycling tokens into fixed-width lines
  const words = []
  for (let k = 0; words.length < WALL_LINES * 12; k += 1) words.push(...WALL_TOKENS[k % WALL_TOKENS.length].toUpperCase().split(' '))
  const lines = []
  let cur = ''
  for (const w of words) {
    if (cur && cur.length + 1 + w.length > WALL_COLS) {
      lines.push(cur)
      cur = w
      if (lines.length === WALL_LINES) break
    } else cur = cur ? `${cur} ${w}` : w
  }
  const c = makeCanvas(WALL_COLS * 4, WALL_H)
  const s = c.getContext('2d')
  for (let i = 0; i < WALL_LINES; i += 1) {
    s.fillStyle = hash(i + 3) < 0.28 ? HI : MID
    drawTiny(s, lines[i] || '', 0, i * WALL_PITCH)
  }
  wallCanvas = c
  return c
}

/* ------------------------------------------------------------------ boot text */

const CPS = 70
const SEQ = [
  { s: '** PIP-OS(R) V7.1.0.8 **', row: 0, cps: 64, after: 0.12 },
  { s: 'COPYRIGHT 2075 ROBCO(R)', row: 2, after: 0.05 },
  { s: 'LOADER V1.1', row: 3, after: 0.05 },
  { s: 'EXEC VERSION 41.10', row: 4, after: 0.05 },
  { s: '64K RAM SYSTEM', row: 5, after: 0.05 },
  { s: '38911 BYTES FREE', row: 6, after: 0.05 },
  { s: 'NO HOLOTAPE FOUND', row: 7, after: 0.35 },
  { s: 'LOAD ROM(1): DEITRIX 303', row: 8, after: 0.4 },
]
const T_HDR = 1.3
const TEXT_X = 8
const LINE_H = 10
const SEQ_T = [] // start time of each line
const SEQ_END = [] // time the last char lands
let T_TYPED = T_HDR // when typing and lingering is over
{
  let tt = T_HDR
  for (const l of SEQ) {
    SEQ_T.push(tt)
    tt += l.s.length / (l.cps || CPS)
    SEQ_END.push(tt)
    tt += l.after
  }
  T_TYPED = tt
}
const SCROLL_DUR = 0.4
const T_BOY = T_TYPED + SCROLL_DUR
const T_RAISE = 5.7 // arm starts to swing
const RAISE_STEP = 0.07 // seconds per arm keyframe
const T_OFF = 7.5 // power-off starts

function drawStack(g, t) {
  const off = t > T_TYPED ? Math.round(easeIn(clamp01((t - T_TYPED) / SCROLL_DUR)) * 110) : 0
  let cx = TEXT_X
  let cy = HDR_Y
  let lastChar = T_HDR
  for (let i = 0; i < SEQ.length; i += 1) {
    if (t < SEQ_T[i]) break
    const l = SEQ[i]
    const n = Math.min(l.s.length, Math.floor((t - SEQ_T[i]) * (l.cps || CPS)) + 1)
    const y = HDR_Y + l.row * LINE_H
    const s = l.s.slice(0, n)
    drawText(g, s, TEXT_X, y - off, i === 0 ? BR : HI)
    cx = TEXT_X + measureText(s) + 1
    cy = y
    lastChar = Math.min(t, SEQ_END[i])
  }
  // block cursor: solid while typing, blinking when idle
  if (t >= WALL_END_T && (t - lastChar < 0.12 || Math.floor(t * 4) % 2 === 0)) {
    g.fillStyle = HI
    g.fillRect(cx, cy - off, 5, 7)
  }
}

function drawWall(g, t) {
  const top = Math.round(WALL_TOP0 - WALL_V * t)
  const bottom = top + WALL_H
  if (bottom > 0) g.drawImage(getWall(), 0, 0, WALL_COLS * 4, WALL_H, WALL_X, top, WALL_COLS * 4, WALL_H)
  // small blinking block cursor at the end of the wall
  if (t < WALL_END_T && bottom < PIP_H - 5 && Math.floor(t * 8) % 2 === 0) {
    g.fillStyle = HI
    g.fillRect(WALL_X, bottom, 3, 5)
  }
}

/* ------------------------------------------------------------------ vault boy */

// Codes: 1 skin, 2 suit, 3 shade, 4 line (black), 5 highlight.
const SW = 52
const SH = 58
const SPRITE_COL = [null, HI, MID, DIM, '#000', BR]
// left (viewer's) forearm angle in degrees about the elbow: 54 = hand on the hip, 262 = thumb up
const ARM_KEYS = [54, 105, 155, 210, 262]

function buildSprite(key) {
  const px = Array.from({ length: SH }, () => new Array(SW).fill(0))
  const ell = (cx, cy, rx, ry) => (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1
  const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1
  const cap = (x0, y0, x1, y1, r) => {
    const dx = x1 - x0
    const dy = y1 - y0
    const l2 = dx * dx + dy * dy || 1
    return (x, y) => {
      const u = clamp01(((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / l2)
      return (x + 0.5 - (x0 + u * dx)) ** 2 + (y + 0.5 - (y0 + u * dy)) ** 2 <= r * r
    }
  }
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
  const CX = 26 // body centre column

  // legs, apart a little, and boots
  paint(rect(CX - 7, 44, CX - 2, 55), 2)
  paint(rect(CX + 1, 44, CX + 6, 55), 2)
  paint(rect(CX - 9, 55, CX - 2, 57), 3)
  paint(rect(CX + 1, 55, CX + 8, 57), 3)
  // torso
  paint((x, y) => y >= 26 && y <= 46 && x >= CX - 9 + (y > 42 ? 1 : 0) && x <= CX + 9 - (y > 42 ? 1 : 0), 2)
  // right arm (viewer's right): hand on the hip
  paint(cap(CX + 8, 30, CX + 17, 37, 3.1), 2)
  paint(cap(CX + 17, 37, CX + 11, 44, 2.9), 2)
  paint(ell(CX + 10.5, 44.5, 3.2, 2.8), 1)
  // left arm: upper arm, forearm swinging about the elbow, hand
  const E = [CX - 15, 37]
  paint(cap(CX - 8, 30, E[0], E[1], 3.1), 2)
  const th = (ARM_KEYS[key] * Math.PI) / 180
  const len = key === 0 ? 9.2 : 9.5
  const dx = Math.cos(th)
  const dy = Math.sin(th)
  paint(cap(E[0], E[1], E[0] + dx * len * 0.6, E[1] + dy * len * 0.6, 3), 2)
  const hx = E[0] + dx * len
  const hy = E[1] + dy * len
  const rhx = Math.round(hx)
  const rhy = Math.round(hy)
  if (key === 4) {
    paint(cap(hx, hy - 2, hx, hy - 8, 1.5), 1) // thumb
    paint(ell(hx, hy, 3.4, 3.2), 1) // fist
    row(rhy - 1, rhx - 1, rhx + 2, 4) // finger creases
    row(rhy + 1, rhx - 1, rhx + 2, 4)
    dot(rhx - 1, rhy - 9, 5)
    dot(rhx - 1, rhy - 8, 5)
  } else {
    paint(ell(hx, hy, 3.3, 3.1), 1)
    if (key === 0) {
      dot(rhx + 1, rhy, 4)
      dot(rhx + 1, rhy + 1, 4)
      dot(rhx, rhy + 2, 4)
    }
  }
  // neck
  paint(rect(CX - 2, 22, CX + 2, 27), 1)
  // head and ears
  paint(ell(CX, 12, 11, 11.5), 1)
  paint(ell(CX - 11.4, 14, 1.9, 3), 1)
  paint(ell(CX + 11.4, 14, 1.9, 3), 1)
  // suit details: V collar, zip, belt
  for (let i = 0; i < 6; i += 1) {
    dot(CX - 6 + i, 26 + i, 4)
    dot(CX + 6 - i, 26 + i, 4)
    dot(CX - 5 + i, 26 + i, 4)
    dot(CX + 5 - i, 26 + i, 4)
  }
  for (let y = 33; y < 41; y += 1) dot(CX, y, 4)
  row(41, CX - 8, CX + 8, 3)
  row(42, CX - 8, CX + 8, 3)
  row(43, CX - 8, CX + 8, 3)
  row(40, CX - 8, CX + 8, 4)
  row(44, CX - 7, CX + 7, 4)
  dot(CX - 1, 41, 5)
  dot(CX, 41, 5)
  dot(CX - 1, 42, 5)
  dot(CX, 42, 5)
  // hair: tall cap with sideburns and a swooping quiff
  const head = ell(CX, 12, 11, 11.5)
  const hair = (x, y) => head(x, y) && y < 7 + Math.max(0, Math.abs(x + 0.5 - CX) - 8) * 2.2
  paint((x, y) => hair(x, y) || ell(CX - 2, 3.4, 10.5, 4.4)(x, y) || ell(CX - 8, 2.6, 3.2, 3.2)(x, y), 2)
  row(2, CX - 8, CX - 3, 5) // gloss
  row(3, CX - 10, CX - 9, 5)
  row(4, CX - 2, CX + 6, 3) // hair shade
  for (let i = 0; i < 4; i += 1) {
    dot(CX + 3 + i, 2 + i, 4) // strand creases
    dot(CX + 6 + i, 2 + i, 4)
  }
  // brows
  row(6, CX - 6, CX - 3, 4)
  row(6, CX + 3, CX + 6, 4)
  dot(CX - 7, 7, 4)
  dot(CX + 7, 7, 4)
  // eyes: small tall ovals with a glint
  for (const ex of [CX - 5, CX + 3]) {
    for (let y = 9; y <= 12; y += 1) {
      dot(ex, y, 4)
      dot(ex + 1, y, 4)
    }
    dot(ex, 9, 5)
  }
  // nose
  dot(CX, 14, 3)
  dot(CX + 1, 14, 3)
  dot(CX + 1, 15, 3)
  // big grin with teeth
  dot(CX - 7, 16, 4)
  dot(CX + 7, 16, 4)
  row(17, CX - 6, CX + 6, 4)
  row(18, CX - 5, CX + 5, 5)
  row(19, CX - 5, CX + 5, 4)
  row(20, CX - 3, CX + 3, 4)
  return px
}

const spriteCanvases = []
function getSprite(key) {
  if (spriteCanvases[key]) return spriteCanvases[key]
  const px = buildSprite(key)
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
  spriteCanvases[key] = c
  return c
}

const BOY_X = (PIP_W - SW) / 2
const BOY_Y = 34
const INIT_W = 13 * 4 - 1

function drawBoy(g, t) {
  const lt = t - T_BOY
  const key = t < T_RAISE ? 0 : Math.min(ARM_KEYS.length - 1, Math.floor((t - T_RAISE) / RAISE_STEP) + 1)
  const reveal = clamp01(lt / 0.16)
  const rows = Math.ceil(reveal * SH)
  if (rows > 0) g.drawImage(getSprite(key), 0, 0, SW, rows, BOY_X, BOY_Y, SW, rows)
  const dots = 1 + (Math.floor(Math.max(0, lt) * 3.5) % 3)
  g.fillStyle = FAINT
  drawTiny(g, `INITIATING${'.'.repeat(dots)}`, Math.round((PIP_W - INIT_W) / 2), BOY_Y + SH + 8)
}

/* ------------------------------------------------------------------ scene */

function drawScene(g, t) {
  g.fillStyle = '#000'
  g.fillRect(0, 0, PIP_W, PIP_H)
  if (t < T_BOY) {
    if (t < WALL_END_T + 0.1) drawWall(g, t)
    drawStack(g, t)
  } else drawBoy(g, t)
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

  if (t < T_OFF) {
    drawScene(g, t)
    // gentle CRT flicker: a very small smooth dip in brightness
    const f = 0.025 + 0.045 * smoothNoise(t * 9)
    g.fillStyle = `rgba(0,0,0,${f.toFixed(3)})`
    g.fillRect(0, 0, PIP_W, PIP_H)
  } else {
    // CRT power-off: squeeze to a line, shrink to a dot, fade
    const o = getOff()
    drawScene(o, T_OFF - 0.001)
    const p = t - T_OFF
    if (p < 0.25) {
      blitSqueeze(g, offCanvas, 1 - 0.985 * easeIn(p / 0.25))
    } else if (p < 0.38) {
      const q = easeInOut((p - 0.25) / 0.13)
      const w = Math.max(4, Math.round(PIP_W * (1 - q)))
      g.fillStyle = BR
      g.fillRect(Math.round((PIP_W - w) / 2), 71, w, 2)
      g.fillStyle = `rgba(61,255,138,${(0.35 * (1 - q)).toFixed(3)})`
      g.fillRect(Math.round((PIP_W - w) / 2) - 6, 70, w + 12, 4)
    } else {
      const a = 1 - clamp01((p - 0.38) / 0.12)
      g.fillStyle = `rgba(125,255,176,${a.toFixed(3)})`
      g.fillRect(78, 71, 4, 2)
      g.fillStyle = `rgba(61,255,138,${(a * 0.3).toFixed(3)})`
      g.fillRect(76, 70, 8, 4)
    }
  }
  scanlines(g)
  vignette(g)
}
