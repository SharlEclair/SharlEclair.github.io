/**
 * The gameboy's LCD as a 160x144 canvas: a contact menu (up/down to select, A to open), a boot sequence, a dino
 * runner ("DINO DASH", START) and a hidden Konami snake (up up down down left right B A at the menu). Pure 2D canvas
 * + pixfont, no three.js, so it also works for the DOM fallback. The scene wraps `canvas` in a CanvasTexture and
 * calls `update(dt)` every frame.
 *
 *   const lcd = createLcd({ items: [{ label, href }], palette: LCD_PALETTES.dmg, onOpen(item) {}, onMode(mode) {} })
 *   lcd.press('down' | 'up' | 'a' | 'b' | 'start' | 'left' | 'right')
 *   lcd.tapAt(px, py, { confirm })  // a tap at LCD pixel coords: menu row select (confirm: needs a second tap to open)
 *   lcd.startGame()                 // jump straight into the dino game (the hero START button)
 *   lcd.startPip()                  // the Pip-Boy boot animation (three taps on the menu title strip, or `gb:pip`)
 *   lcd.mode  // 'boot' | 'menu' | 'game' | 'konami' | 'pip'
 *   lcd.inputAt  // performance.now() of the last press / tap (the scene's "facing" timer reads it)
 *
 * Window events: dispatches `gb:game` {detail:{state:'start'|'end'}} when the dino game starts / ends; listens for
 * `gb:say` {detail:{lines:[string,...], ms}}: an uppercase centred message (max 4 lines x 16 chars) over whatever the LCD
 * shows for ms milliseconds (a running dino game is paused meanwhile). The scene handles `gb:palette` (see scene.js).
 *   lcd.update(dt)  // -> true when the picture changed (re-upload the texture)
 */
import { drawText, measureText } from './pixfont.js'
import { SCREEN_W as W, SCREEN_H as H } from './layout.js'

const GY = 118
// A 16 x 16 pixel dinosaur facing right: 14 rows of body + 2 rows of legs (two running frames, one jump frame)
const BODY = [
  '..........#######.',
  '.........#########',
  '.........##.######',
  '.........#########',
  '.........#########',
  '.........#####....',
  '#........#####....',
  '#.......######..#.',
  '##.....#########..',
  '###...###########.',
  '.###############..',
  '..#############...',
  '...###########....',
  '....#########.....',
]
// Running frames swap which leg is planted (the other is lifted, so the two read clearly even at 16 px); the third stands
// (also the jump frame). The run cycle is stepped by a fixed tick counter (game.run), not by distance, so the cadence is steady.
const LEGS = [
  ['....###...###....', '....###...........'],
  ['....###...###....', '..........###.....'],
  ['....###...###....', '....##.....##.....'],
]
const RUN_TICKS = 4 // game ticks (30 per second) per leg frame: 7.5 steps per second
const DINO_X = 14
const DINO_H = 16
const SEQ = ['up', 'up', 'down', 'down', 'left', 'right', 'b', 'a']
// Konami snake field
const SN = { c: 6, cols: 26, rows: 20, ox: 2, oy: 22 }
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

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

  const s = { mode: boot ? 'boot' : 'menu', index: 0, t: 0, dirty: true, flash: 0, armed: -1, seq: [] }
  const game = { state: 'ready', y: 0, vy: 0, dist: 0, run: 0, score: 0, best: 0, cacti: [], acc: 0 }
  const setMode = (m) => {
    const was = s.mode
    s.mode = m; s.t = 0; s.dirty = true; onMode?.(m)
    if (typeof window !== 'undefined' && (m === 'game') !== (was === 'game')) window.dispatchEvent(new CustomEvent('gb:game', { detail: { state: m === 'game' ? 'start' : 'end' } }))
  }

  const snake = { state: 'splash', body: [], dir: 'right', queue: [], food: [0, 0], score: 0, acc: 0, seed: 1 }
  const rnd = () => { snake.seed = (snake.seed * 16807) % 2147483647; return snake.seed / 2147483647 }
  const placeFood = () => {
    for (let n = 0; n < 200; n += 1) {
      const f = [(rnd() * SN.cols) | 0, (rnd() * SN.rows) | 0]
      if (!snake.body.some((b) => b[0] === f[0] && b[1] === f[1])) { snake.food = f; return }
    }
  }
  const resetSnake = (state = 'run') => {
    snake.body = [[8, 10], [7, 10], [6, 10]]
    snake.dir = 'right'; snake.queue = []; snake.score = 0; snake.acc = 0; snake.state = state
    placeFood()
  }
  function stepSnake() {
    if (snake.queue.length) snake.dir = snake.queue.shift()
    const [dx, dy] = DIRS[snake.dir]
    const h = snake.body[0]
    const n = [h[0] + dx, h[1] + dy]
    const eat = n[0] === snake.food[0] && n[1] === snake.food[1]
    const hitSelf = (eat ? snake.body : snake.body.slice(0, -1)).some((b) => b[0] === n[0] && b[1] === n[1])
    if (n[0] < 0 || n[1] < 0 || n[0] >= SN.cols || n[1] >= SN.rows || hitSelf) { snake.state = 'over'; s.flash = 6; return }
    snake.body.unshift(n)
    if (eat) { snake.score += 1; placeFood() } else snake.body.pop()
  }

  const resetGame = () => { Object.assign(game, { y: 0, vy: 0, dist: 0, run: 0, score: 0, cacti: [{ x: W + 40, w: 9, h: 14 }] }) }
  resetGame()

  function stepGame() {
    const speed = Math.min(4.2, 2.2 + game.score / 500)
    game.dist += speed
    game.run += 1
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
      if (DINO_X + 14 > c.x + 1 && DINO_X + 3 < c.x + c.w - 1 && GY + game.y > GY - c.h + 3) {
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
    const dy = GY - DINO_H + Math.round(game.y)
    sprite(DINO_X, dy, BODY, 0)
    rect(DINO_X + 12, dy + 2, 1, 1, 3)
    const frame = game.y < 0 ? 2 : game.state !== 'run' ? 0 : Math.floor(game.run / RUN_TICKS) & 1
    sprite(DINO_X, dy + 14, LEGS[frame], 0)
    text(String(game.score).padStart(5, '0'), W - 34, 6, 0, 1)
    if (game.state === 'ready') {
      text('DINO DASH', W / 2 - measureText('DINO DASH', 2) / 2, 44, 0, 2)
      text('A: JUMP', W / 2 - measureText('A: JUMP') / 2, 70, 0, 1)
      text('B: BACK', W / 2 - measureText('B: BACK') / 2, 82, 1, 1)
    } else if (game.state === 'over') {
      text('GAME OVER', W / 2 - measureText('GAME OVER', 2) / 2, 44, 0, 2)
      text('A: RETRY  B: BACK', W / 2 - measureText('A: RETRY  B: BACK') / 2, 70, 0, 1)
      text('BEST ' + String(game.best).padStart(5, '0'), W / 2 - measureText('BEST 00000') / 2, 82, 1, 1)
    }
    if (s.flash > 0) { check(0, 0, W, H, 3, 2); s.flash -= 1 }
  }

  function drawSnake() {
    rect(0, 0, W, H, 3)
    rect(0, 0, W, 17, 0)
    text('KONAMI', 6, 5, 3, 1)
    const sc = 'SCORE ' + snake.score
    text(sc, W - 6 - measureText(sc), 5, 3, 1)
    rect(SN.ox - 1, SN.oy - 1, SN.cols * SN.c + 2, SN.rows * SN.c + 2, 0)
    rect(SN.ox, SN.oy, SN.cols * SN.c, SN.rows * SN.c, 3)
    const cell = (x, y, c, inset = 0) => rect(SN.ox + x * SN.c + inset, SN.oy + y * SN.c + inset, SN.c - inset * 2, SN.c - inset * 2, c)
    if (snake.state !== 'splash') {
      cell(snake.food[0], snake.food[1], 0, 1)
      cell(snake.food[0], snake.food[1], 3, 2)
      snake.body.forEach((b, i) => cell(b[0], b[1], i === 0 ? 0 : 1, i === 0 ? 0 : 1))
    }
    if (snake.state === 'splash') {
      rect(20, 52, W - 40, 40, 0)
      text('KONAMI', W / 2 - measureText('KONAMI', 3) / 2, 62, 3, 3)
    } else if (snake.state === 'over') {
      rect(14, 46, W - 28, 52, 0)
      text('GAME OVER', W / 2 - measureText('GAME OVER', 2) / 2, 54, 3, 2)
      const s2 = 'SCORE ' + snake.score
      text(s2, W / 2 - measureText(s2) / 2, 78, 3, 1)
    }
    if (s.flash > 0) { check(0, 0, W, H, 3, 2); s.flash -= 1 }
  }

  // Card overlay (the page's Cartridge Swap separator): a static, scroll-driven card that sits over every other mode.
  //   card = { head, tag, rows: [title], n: visible row count, splash: [line, line] | null, dissolve: 0..1, to: '#rrggbb' }
  // Nothing is drawn but the ground until a header is wanted (n > 0); `dissolve` is a 4x4 Bayer wipe to the palette colour
  // nearest `to`, so the last frame of a dive can match the page behind it.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
  function wrapTitle(t, max = 148) {
    const lines = []
    let cur = ''
    for (const w of String(t).split(' ')) {
      const next = cur ? `${cur} ${w}` : w
      if (cur && measureText(next) > max) { lines.push(cur); cur = w } else cur = next
    }
    if (cur) lines.push(cur)
    return lines
  }
  function drawCard(c) {
    rect(0, 0, W, H, 3)
    if (c.splash) {
      text(c.splash[0], W / 2 - measureText(c.splash[0], 2) / 2, 52, 0, 2)
      if (c.splash[1]) text(c.splash[1], W / 2 - measureText(c.splash[1]) / 2, 72, 1, 1)
    } else if (c.n > 0) {
      rect(0, 0, W, 17, 0)
      text(c.head, 6, 5, 3, 1)
      if (c.tag) text(c.tag, W - 6 - measureText(c.tag), 5, 2, 1)
      let y = 26
      c.rows.slice(0, c.n).forEach((title, i) => {
        const lines = wrapTitle(title)
        const hh = lines.length * 8 + 4
        const on = i === c.n - 1
        if (on) rect(3, y - 3, W - 6, hh + 2, 0)
        lines.forEach((ln, j) => text(ln, 6, y + j * 8, on ? 3 : 0, 1))
        if (!on) rect(6, y + hh - 2, W - 12, 1, 1)
        y += hh + 9
      })
    }
    if (c.dissolve > 0) {
      const to = c.to?.match(/^#?([0-9a-f]{6})$/i)?.[1]
      const rgb = to ? [0, 2, 4].map((i) => parseInt(to.slice(i, i + 2), 16)) : null
      let idx = 0
      if (rgb) {
        let best = 1e9
        pal.forEach((p, i) => { const n = parseInt(p.slice(1), 16); const d = [16, 8, 0].reduce((a, sh, j) => a + (((n >> sh) & 255) - rgb[j]) ** 2, 0); if (d < best) { best = d; idx = i } })
      }
      g.fillStyle = pal[idx]
      if (c.dissolve >= 1) g.fillRect(0, 0, W, H)
      else for (let yy = 0; yy < H; yy += 1) for (let xx = 0; xx < W; xx += 1) if (BAYER[(xx & 3) + (yy & 3) * 4] < c.dissolve * 16) g.fillRect(xx, yy, 1, 1)
    }
  }

  function drawSay(lines) {
    const rows = lines.slice(0, 4)
    const hh = rows.length * 10 + 10
    const y0 = Math.round((H - hh) / 2)
    rect(10, y0 - 1, W - 20, hh + 2, 3)
    rect(12, y0 + 1, W - 24, hh - 2, 0)
    rows.forEach((ln, i) => text(ln, W / 2 - measureText(ln) / 2, y0 + 6 + i * 10, 3, 1))
  }
  // Pip-Boy boot (shared/gb/pip.js, loaded on first use): fixed green-on-black, ignores the LCD palette
  let pip = null
  const loadPip = () => import('./pip.js').then((m) => { pip = m; s.dirty = true })
  const endPip = () => setMode(s.pipFrom === 'boot' || !s.pipFrom ? 'menu' : s.pipFrom)
  function drawPipMode() {
    if (pip) pip.drawPip(g, s.t)
    else { g.fillStyle = '#000'; g.fillRect(0, 0, W, H) }
  }
  function draw() {
    if (s.card) drawCard(s.card)
    else if (s.mode === 'pip') drawPipMode()
    else if (s.mode === 'boot') drawBoot()
    else if (s.mode === 'game') drawGame()
    else if (s.mode === 'konami') drawSnake()
    else drawMenu()
    if (s.say) drawSay(s.say.lines)
    s.dirty = false
  }
  draw()

  if (typeof window !== 'undefined') {
    window.addEventListener('gb:say', (e) => {
      const lines = (e.detail?.lines ?? []).slice(0, 4).map((l) => String(l).toUpperCase().slice(0, 16))
      if (!lines.length) return
      s.say = { lines, left: Math.max(0, Number(e.detail.ms) || 2500) / 1000 }
      s.dirty = true
    })
  }

  const api = {
    canvas,
    get mode() { return s.mode },
    get index() { return s.index },
    get items() { return items },
    inputAt: 0,
    setPalette(p) { pal = p.slice(); s.dirty = true },
    setItems(next) { items = next; s.dirty = true },
    /** The Pip-Boy boot animation (about 6 s); any press or tap skips it. Not while a game is running. */
    startPip() {
      if (s.mode === 'game' || s.mode === 'konami' || s.mode === 'pip') return
      s.pipFrom = s.mode
      api.inputAt = performance.now()
      setMode('pip')
      loadPip()
    },
    press(btn) {
      s.armed = -1
      api.inputAt = performance.now()
      if (s.mode === 'pip') { endPip(); return }
      if (s.mode === 'boot') { setMode('menu'); return }
      if (s.mode === 'menu') {
        s.seq.push(btn)
        if (s.seq.length > SEQ.length) s.seq.shift()
        if (s.seq.length === SEQ.length && SEQ.every((k, i) => k === s.seq[i])) {
          // the final A of the code must not open the selected link
          s.seq = []
          resetSnake('splash')
          setMode('konami')
          return
        }
        if (btn === 'down') s.index = (s.index + 1) % items.length
        else if (btn === 'up') s.index = (s.index + items.length - 1) % items.length
        else if (btn === 'a') onOpen?.(items[s.index], s.index)
        else if (btn === 'start') api.startGame()
        s.dirty = true
      } else if (s.mode === 'game') {
        if (btn === 'b') { setMode('menu'); return }
        if (btn === 'a' || btn === 'up' || btn === 'start') {
          if (game.state !== 'run') { resetGame(); game.state = 'run' } else if (game.y === 0) game.vy = -5.3
        }
        s.dirty = true
      } else if (s.mode === 'konami') {
        if (btn === 'b') { setMode('menu'); return }
        if (DIRS[btn] && snake.state === 'run') {
          const last = snake.queue.length ? snake.queue[snake.queue.length - 1] : snake.dir
          const [lx, ly] = DIRS[last]
          const [nx, ny] = DIRS[btn]
          if ((nx + lx !== 0 || ny + ly !== 0) && snake.queue.length < 2) snake.queue.push(btn)
        } else if (btn === 'a' && snake.state === 'over') resetSnake('run')
        s.dirty = true
      }
    },
    /** Register a tap; true on the third within 900 ms (and resets). */
    tripleTap() {
      const now = performance.now()
      s.taps = (s.taps ?? []).filter((t) => now - t < 900)
      s.taps.push(now)
      if (s.taps.length < 3) return false
      s.taps = []
      return true
    },
    /** Jump straight into the dino game's title screen from any mode (the hero START). */
    startGame() { game.state = 'ready'; resetGame(); s.seq = []; setMode('game') },
    /**
     * A tap at LCD pixel coordinates (0..160, 0..144). Menu: select the row under the tap; with `confirm` (touch) it
     * opens only when that row was already selected by an earlier tap, otherwise a click opens straight away. Game:
     * jump. Boot: skip. The START label at the bottom right launches the dino game.
     */
    tapAt(px, py, { confirm = false } = {}) {
      api.inputAt = performance.now()
      if (s.mode === 'pip') { endPip(); return }
      if (s.mode === 'boot') { setMode('menu'); return }
      if (s.mode === 'menu') {
        s.seq = []
        // three quick taps on the title strip: the Pip-Boy (the rows below open links, so they cannot carry it)
        if (py < 20) { if (api.tripleTap()) api.startPip(); return }
        if (py >= H - 17 && px > W - 70) { api.press('start'); return }
        const i = Math.floor((py - 20) / 25)
        if (py < 20 || i < 0 || i >= items.length) return
        const opened = s.index === i && (!confirm || s.armed === i)
        s.index = i
        s.dirty = true
        if (opened) { s.armed = -1; onOpen?.(items[i], i) } else s.armed = i
      } else if (s.mode === 'game' || s.mode === 'konami') {
        api.press('a')
      }
    },
    /** Advance timers; returns true when the picture changed. */
    /** Show (or with null clear) the static card overlay; redraws only when it actually changed. */
    setCard(c) {
      const next = c ? { ...c, dissolve: Math.round((c.dissolve || 0) * 8) / 8 } : null
      const key = next ? `${next.n}|${next.dissolve}|${next.splash ?? ''}|${next.to}|${pal.join()}` : ''
      if (key === s.cardKey) return
      s.cardKey = key
      s.card = next
      s.dirty = true
    },
    update(dt, reduced = false) {
      s.t += dt
      if (s.say && (s.say.left -= dt) <= 0) { s.say = null; s.dirty = true }
      if (s.card) { if (!s.dirty) return false; draw(); return true }
      if (s.mode === 'boot' && s.t > 2.4) setMode('menu')
      let changed = s.dirty
      if (s.mode === 'pip') {
        if (pip && s.t > pip.PIP_DURATION) endPip()
        else {
          if (reduced && s.t < 3.8) { s.t = 3.8; s.dirty = true } // reduced motion: hold the finished main screen
          changed = !reduced || s.dirty
        }
      } else if (s.mode === 'game') {
        game.acc += dt
        while (game.acc >= 1 / 30) { game.acc -= 1 / 30; if (game.state === 'run' && !s.say) stepGame() }
        changed = true
      } else if (s.mode === 'konami') {
        if (snake.state === 'splash' && s.t > 1.2) { resetSnake('run'); s.dirty = true }
        snake.acc += dt
        const every = Math.max(0.07, 0.14 - snake.score * 0.003)
        while (snake.acc >= every) { snake.acc -= every; if (snake.state === 'run') stepSnake() }
        changed = true
      } else if (s.mode === 'boot' || (s.mode === 'menu' && !reduced)) changed = true
      if (changed) draw()
      return changed
    },
    /** Replay the boot animation (when the console scrolls back into view). */
    reboot() { if (s.mode !== 'game' && s.mode !== 'konami' && s.mode !== 'pip') { s.index = 0; setMode('boot') } },
    /** Skip the boot animation (reduced motion, or when the console is already on). */
    wake() { if (s.mode === 'boot') setMode('menu') },
  }
  return api
}
