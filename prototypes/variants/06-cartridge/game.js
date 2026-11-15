/**
 * The contact console's easter egg: an original endless runner on the 4-shade LCD.
 * Loaded only when START is pressed. A plated little stegosaur jumps cacti.
 */
import { Lcd, hash } from './lcd.js'

const W = 160, H = 120, GY = 100
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

export function startGame(canvas, { onState } = {}) {
  const L = new Lcd(canvas, W, H)
  let state = 'ready', y = 0, vy = 0, dist = 0, score = 0, best = 0, cacti = [], id = 0, last = 0, acc = 0

  const reset = () => { y = 0; vy = 0; dist = 0; score = 0; cacti = [{ x: W + 40, w: 9, h: 14 }] }
  const set = (next) => { state = next; onState?.(state, score) }

  function step() {
    const speed = Math.min(4.2, 2.2 + score / 500)
    dist += speed
    score = (dist / 8) | 0
    vy += .42
    y = Math.min(0, y + vy)
    if (y === 0) vy = 0
    for (const c of cacti) c.x -= speed
    if (cacti[0].x < -12) cacti.shift()
    const tail = cacti[cacti.length - 1]
    if (tail.x < W - 70 - hash(score, 9) * 80) cacti.push({ x: W + 4, w: 7 + ((hash(score, 2) * 3) | 0) * 2, h: 10 + ((hash(score, 4) * 8) | 0) })
    for (const c of cacti) {
      if (21 + 11 > c.x + 1 && 21 < c.x + c.w - 1 && GY + y > GY - c.h + 2) { best = Math.max(best, score); set('over') }
    }
  }

  function draw() {
    L.b.fill(0)
    for (let i = 0; i < 3; i++) {
      const cx = Math.round((((i * 71 - dist * .15) % 200) + 200) % 200) - 20
      L.check(cx, 22 + i * 9, 18, 3, 1, 0); L.check(cx + 4, 19 + i * 9, 9, 3, 1, 0)
    }
    L.rect(0, GY, W, 1, 3)
    for (let i = 0; i < 9; i++) L.rect(Math.round((((i * 37 - dist) % 170) + 170) % 170) - 5, GY + 3 + (i % 3) * 3, 2 + (i % 2) * 2, 1, 2)
    for (const c of cacti) {
      const x = Math.round(c.x), mid = x + (c.w >> 1) - 1, top = GY - c.h
      L.rect(mid, top, 3, c.h, 3)
      L.rect(x, top + 4, 2, 5, 3); L.rect(x, top + 8, c.w >> 1, 2, 3)
      L.rect(x + c.w - 2, top + 2, 2, 5, 3); L.rect(mid + 2, top + 6, c.w >> 1, 2, 3)
    }
    const dy = GY - 9 + Math.round(y)
    L.sprite(18, dy, BODY, 3)
    L.px(32, dy + 3, 0)
    L.sprite(18, dy + 7, LEGS[y < 0 || state !== 'run' ? 0 : (dist >> 3) & 1], 3)
    L.text(W - 24, 5, String(score).padStart(5, '0'), 3)
    if (state === 'ready') {
      L.text(40, 40, 'STEGO DASH', 3, 2)
      L.text(34, 58, 'SPACE / TAP / A: JUMP', 3)
      L.text(54, 68, 'ESC / B: QUIT', 2)
    } else if (state === 'over') {
      L.text(44, 40, 'GAME OVER', 3, 2)
      L.text(46, 58, 'A: RETRY  B: QUIT', 3)
      L.text(62, 68, 'BEST ' + String(best).padStart(5, '0'), 2)
    }
    L.blit()
  }

  const tick = (t) => {
    id = requestAnimationFrame(tick)
    acc += Math.min(100, t - (last || t))
    last = t
    let moved = false
    while (acc >= 1000 / 30) { acc -= 1000 / 30; if (state === 'run') { step(); moved = true } }
    if (moved) draw()
  }

  reset()
  draw()
  id = requestAnimationFrame(tick)
  const onTheme = new MutationObserver(() => requestAnimationFrame(draw))
  onTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  return {
    jump() {
      if (state !== 'run') { reset(); set('run'); draw() } else if (y === 0) vy = -5.3
    },
    stop() { cancelAnimationFrame(id); onTheme.disconnect() },
  }
}
