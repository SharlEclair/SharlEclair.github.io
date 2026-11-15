import { initBar, $, $$ } from '/variants/06-cartridge/ui.js'
import { heroSky, sqlScene, reservoirScene } from '/variants/06-cartridge/lcd.js'
import { lazyF1, lazyTransit } from '/shared/lazy.js'

initBar()

const sky = $('[data-sky]')
if (sky) heroSky($('[data-sky-canvas]'), sky)
for (const canvas of $$('[data-scene]')) (canvas.dataset.scene === 'sql' ? sqlScene : reservoirScene)(canvas)

const f1 = $('[data-stage="f1"]')
if (f1) lazyF1(f1, { runway: f1.closest('.runway'), posterAlt: 'A Formula 1 car seen from above in a dark studio, ember-gold light on the bodywork.' })
const tr = $('[data-stage="transit"]')
if (tr) lazyTransit(tr, { runway: tr.closest('.runway'), posterAlt: 'A search spreading over a dark city street map, a glowing route in red and violet.' })

// Contact console: START opens the hidden runner; A / space / tap jump, B / Escape leave.
const start = $('[data-start]')
if (start) {
  const list = $('[data-list]')
  const screen = $('[data-game]')
  let game = null
  const leave = () => {
    game?.stop()
    game = null
    screen.hidden = true
    list.hidden = false
    start.setAttribute('aria-pressed', 'false')
  }
  const launch = async () => {
    if (game) return game.jump()
    const { startGame } = await import('/variants/06-cartridge/game.js')
    list.hidden = true
    screen.hidden = false
    start.setAttribute('aria-pressed', 'true')
    game = startGame(screen)
  }
  start.addEventListener('click', () => (game ? leave() : launch()))
  $('[data-a]').addEventListener('click', launch)
  $('[data-b]').addEventListener('click', leave)
  screen.addEventListener('pointerdown', () => game?.jump())
  addEventListener('keydown', (e) => {
    if (!game) return
    if (e.key === 'Escape') leave()
    else if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault()
      game.jump()
    }
  })
}
