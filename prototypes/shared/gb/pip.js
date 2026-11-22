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
import { VW, VH, SWING_FPS, BODY_COL, FRAMES } from './pipvault.js'

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
const T_RAISE = 5.7 // the arm starts to drop, as in the reference
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

// Frames traced from the reference sequence (see pipvault.js): 2 bits per pixel, 0 off .. 3 bright.
const SW = VW
const SH = VH
const SPRITE_COL = [null, DIM, MID, HI]
const spriteCanvases = []
function getSprite(k) {
  if (spriteCanvases[k]) return spriteCanvases[k]
  const bin = atob(FRAMES[k])
  const c = makeCanvas(SW, SH)
  const s = c.getContext('2d')
  for (let i = 0; i < SW * SH; i += 1) {
    const v = (bin.charCodeAt(i >> 2) >> (6 - 2 * (i & 3))) & 3
    if (v) {
      s.fillStyle = SPRITE_COL[v]
      s.fillRect(i % SW, (i / SW) | 0, 1, 1)
    }
  }
  spriteCanvases[k] = c
  return c
}

const BOY_X = Math.round(PIP_W / 2 - BODY_COL)
const BOY_Y = 34
const INIT_W = 13 * 4 - 1

function drawBoy(g, t) {
  const lt = t - T_BOY
  // idle pose, then the reference swing: frame 5 is the last one before the arm drops
  const key = t < T_RAISE ? 0 : Math.min(FRAMES.length - 1, 6 + Math.floor((t - T_RAISE) * SWING_FPS))
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
