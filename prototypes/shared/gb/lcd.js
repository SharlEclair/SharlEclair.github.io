/**
 * The gameboy's LCD as a 160x144 canvas: a contact menu (up/down to select, A to open), a boot sequence, and a
 * hidden endless-runner ("STEGO DASH") started with START. Pure 2D canvas + pixfont, no three.js, so it also works
 * for the DOM fallback. The scene wraps `canvas` in a CanvasTexture and calls `update(dt)` every frame.
 *
 *   const lcd = createLcd({ items: [{ label, href }], palette: LCD_PALETTES.dmg, onOpen(item) {} })
 *   lcd.press('down' | 'up' | 'a' | 'b' | 'start' | 'left' | 'right')
 *   lcd.update(dt)  // -> true when the picture changed (re-upload the texture)
 */
import { drawText, measureText } from './pixfont.js'
import { SCREEN_W as W, SCREEN_H as H } from './layout.js'

const GY = 118
const BODY = [
  '....#.#.#.......',
  '...#######......',
  '..#########.###.',
  '#.############.#',
  '###############.',
  '.############...',
  '..##########....',
]
const LEGS = [['..##.....##.....', '..##.....##.....'], ['...##...##......', '....#...#.......']]

function hash(n, s) {
  const x = Math.sin(n * 127.1 + s * 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function createLcd({ items = [], palette = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'], onOpen, onMode, boot = true } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  g.imageSmoothingEnabled = false
  let pal = palette.slice()
  const rect = (x, y, w, h, c) => { g.fillStyle = pal[c]; g.fillRect(Math.round(x), Math.round(y), w, h) }
  const text = (s, x, y, c, k = 1) => drawText(g, s, x, y, pal[c], k)
  const sprite = (x, y, rows, c) => {
    g.fillStyle = pal[c]
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i += 1) if (row[i] === '#') g.fillRect(x + i, y + j, 1, 1) })
  }
  const check = (x, y, w, h, c0, c1) => {
    for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) { g.fillStyle = pal[(i + j) & 1 ? c1 : c0]; g.fillRect(x + i, y + j, 1, 1) }
  }

  const s = { mode: boot ? 'boot' : 'menu', index: 0, t: 0, dirty: true, flash: 0 }
  const game = { state: 'ready', y: 0, vy: 0, dist: 0, score: 0, best: 0, cacti: [], acc: 0 }
  const setMode = (m) => { s.mode = m; s.t = 0; s.dirty = true; onMode?.(m) }

  const resetGame = () => { Object.assign(game, { y: 0, vy: 0, dist: 0, score: 0, cacti: [{ x: W + 40, w: 9, h: 14 }] }) }
  resetGame()

  function stepGame() {
    const speed = Math.min(4.2, 2.2 + game.score / 500)
    game.dist += speed
    game.score = (game.dist / 8) | 0
    game.vy += 0.42
    game.y = Math.min(0, game.y + game.vy)
    if (game.y === 0) game.vy = 0
    for (const c of game.cacti) c.x -= speed
    if (game.cacti[0].x < -12) game.cacti.shift()
    const tail = game.cacti[game.cacti.length - 1]
    if (tail.x < W - 70 - hash(game.score, 9) * 80) {
      game.cacti.push({ x: W + 4, w: 7 + ((hash(game.score, 2) * 3) | 0) * 2, h: 10 + ((hash(game.score, 4) * 8) | 0) })
    }
    for (const c of game.cacti) {
      if (21 + 11 > c.x + 1 && 21 < c.x + c.w - 1 && GY + game.y > GY - c.h + 2) {
        game.best = Math.max(game.best, game.score)
        game.state = 'over'
        s.flash = 6
      }
    }
  }

  function drawMenu() {
    rect(0, 0, W, H, 3)
    rect(0, 0, W, 17, 0)
    text('CONTACT', 6, 5, 3, 1)
    text('ASHWIN PILLAI', W - 6 - measureText('ASHWIN PILLAI'), 5, 2, 1)
    items.forEach((it, i) => {
      const y = 28 + i * 25
      const on = i === s.index
      if (on) {
        rect(6, y - 5, W - 12, 19, 0)
        text('▶', 9, y, 3, 1)
        text(it.display ?? it.label, 20, y, 3, 1)
      } else {
        text(it.display ?? it.label, 20, y, 0, 1)
        rect(20, y + 9, measureText(it.display ?? it.label), 1, 1)
      }
    })
    rect(0, H - 17, W, 1, 1)
    text('UP DOWN  A OPEN', 6, H - 12, 0, 1)
    if (Math.floor(s.t * 1.6) % 2 === 0) text('START', W - 6 - measureText('START'), H - 12, 1, 1)
  }

  function drawBoot() {
    rect(0, 0, W, H, 3)
    const drop = Math.min(1, s.t / 0.9)
    const y = Math.round(-20 + (H / 2 - 14 + 20) * (1 - Math.pow(1 - drop, 3)))
    text('ASHWIN', W / 2 - measureText('ASHWIN', 2) / 2, y, 0, 2)
    if (s.t > 1.1) text('PILLAI', W / 2 - measureText('PILLAI', 1) / 2, y + 20, 1, 1)
    check(0, H - 6, W, 2, 0, 2)
  }

  function drawGame() {
    g.clearRect(0, 0, W, H)
    rect(0, 0, W, H, 3)
    for (let i = 0; i < 3; i += 1) {
      const cx = Math.round((((i * 71 - game.dist * 0.15) % 200) + 200) % 200) - 20
      check(cx, 26 + i * 11, 20, 3, 3, 2)
      check(cx + 4, 23 + i * 11, 10, 3, 3, 2)
    }
    rect(0, GY, W, 1, 0)
    for (let i = 0; i < 9; i += 1) rect(Math.round((((i * 37 - game.dist) % 170) + 170) % 170) - 5, GY + 3 + (i % 3) * 4, 2 + (i % 2) * 2, 1, 1)
    for (const c of game.cacti) {
      const x = Math.round(c.x)
      const mid = x + (c.w >> 1) - 1
      const top = GY - c.h
      rect(mid, top, 3, c.h, 0)
      rect(x, top + 4, 2, 5, 0); rect(x, top + 8, c.w >> 1, 2, 0)
      rect(x + c.w - 2, top + 2, 2, 5, 0); rect(mid + 2, top + 6, c.w >> 1, 2, 0)
    }
    const dy = GY - 9 + Math.round(game.y)
    sprite(18, dy, BODY, 0)
    rect(32, dy + 3, 1, 1, 3)
    sprite(18, dy + 7, LEGS[game.y < 0 || game.state !== 'run' ? 0 : (game.dist >> 3) & 1], 0)
    text(String(game.score).padStart(5, '0'), W - 34, 6, 0, 1)
    if (game.state === 'ready') {
      text('STEGO DASH', W / 2 - measureText('STEGO DASH', 2) / 2, 44, 0, 2)
      text('A: JUMP', W / 2 - measureText('A: JUMP') / 2, 70, 0, 1)
      text('B: BACK', W / 2 - measureText('B: BACK') / 2, 82, 1, 1)
    } else if (game.state === 'over') {
      text('GAME OVER', W / 2 - measureText('GAME OVER', 2) / 2, 44, 0, 2)
      text('A: RETRY  B: BACK', W / 2 - measureText('A: RETRY  B: BACK') / 2, 70, 0, 1)
      text('BEST ' + String(game.best).padStart(5, '0'), W / 2 - measureText('BEST 00000') / 2, 82, 1, 1)
    }
    if (s.flash > 0) { check(0, 0, W, H, 3, 2); s.flash -= 1 }
  }

  function draw() {
    if (s.mode === 'boot') drawBoot()
    else if (s.mode === 'game') drawGame()
    else drawMenu()
    s.dirty = false
  }
  draw()

  const api = {
    canvas,
    get mode() { return s.mode },
    get index() { return s.index },
    get items() { return items },
    setPalette(p) { pal = p.slice(); s.dirty = true },
    setItems(next) { items = next; s.dirty = true },
    press(btn) {
      if (s.mode === 'boot') { setMode('menu'); return }
      if (s.mode === 'menu') {
        if (btn === 'down') s.index = (s.index + 1) % items.length
        else if (btn === 'up') s.index = (s.index + items.length - 1) % items.length
        else if (btn === 'a') onOpen?.(items[s.index], s.index)
        else if (btn === 'start') { game.state = 'ready'; resetGame(); setMode('game') }
        s.dirty = true
      } else if (s.mode === 'game') {
        if (btn === 'b') { setMode('menu'); return }
        if (btn === 'a' || btn === 'up' || btn === 'start') {
          if (game.state !== 'run') { resetGame(); game.state = 'run' } else if (game.y === 0) game.vy = -5.3
        }
        s.dirty = true
      }
    },
    /** Advance timers; returns true when the picture changed. */
    update(dt, reduced = false) {
      s.t += dt
      if (s.mode === 'boot' && s.t > 2.4) setMode('menu')
      let changed = s.dirty
      if (s.mode === 'game') {
        game.acc += dt
        while (game.acc >= 1 / 30) { game.acc -= 1 / 30; if (game.state === 'run') stepGame() }
        changed = true
      } else if (s.mode === 'boot' || (s.mode === 'menu' && !reduced)) changed = true
      if (changed) draw()
      return changed
    },
    /** Replay the boot animation (when the console scrolls back into view). */
    reboot() { if (s.mode !== 'game') { s.index = 0; setMode('boot') } },
    /** Skip the boot animation (reduced motion, or when the console is already on). */
    wake() { if (s.mode === 'boot') setMode('menu') },
  }
  return api
}
