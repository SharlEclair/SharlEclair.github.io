/**
 * Standalone test page for a scene module: a tall runway with a sticky full-window stage.
 * Real scrolling works, and so do the hooks the screenshot tools use.
 *
 *   <script type="module">
 *     import { runStandalone } from '/shared/gl/standalone.js'
 *     runStandalone(() => import('/shared/scenes/harvest/scene.js'), { scene: { look: 'full' }, runway: 500 })
 *   </script>
 *
 *   node tools/shot.mjs http://127.0.0.1:5310/anim/harvest.html out.png --progress=0.4 --wait=2500
 *
 * Hooks: window.__APP_READY, window.__TEST_SET_PROGRESS(v), window.__TEST_SET_POINTER(x, y), window.__HARNESS,
 * window.__SCENE (the scene module), window.__BEATS (scene.beats, if any).
 * A caption overlay shows the current beat so the story can be judged from screenshots.
 */
export async function runStandalone(importer, { scene = {}, runway = 500, harness = {}, background = '#000' } = {}) {
  const style = document.createElement('style')
  style.textContent = `html,body{margin:0;background:${background};color:#eee;font:14px/1.4 ui-monospace,Menlo,Consolas,monospace}
  .runway{position:relative;height:${runway}vh}.stage{position:sticky;top:0;height:100vh;overflow:hidden}
  .beat{position:fixed;left:16px;bottom:16px;max-width:420px;padding:10px 12px;background:rgba(0,0,0,.7);border:1px solid #fff4;pointer-events:none;z-index:5}
  .beat b{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9fd}`
  document.head.appendChild(style)
  const section = document.createElement('div')
  section.className = 'runway'
  const stage = document.createElement('div')
  stage.className = 'stage'
  section.appendChild(stage)
  document.body.appendChild(section)
  const caption = document.createElement('div')
  caption.className = 'beat'
  caption.hidden = true
  document.body.appendChild(caption)

  try {
    const [{ createHarness }, mod] = await Promise.all([import('/shared/gl/harness.js'), importer()])
    const h = createHarness(stage, { runway: section, ...harness })
    const instance = await mod.createScene({ THREE: h.THREE, renderer: h.renderer, size: h.size, ...scene })
    h.add(instance)
    h.start()
    window.__HARNESS = h
    window.__SCENE = instance
    window.__BEATS = instance.beats ?? []
    window.__TEST_SET_PROGRESS = (v) => h.setProgress(v)
    window.__TEST_SET_POINTER = (x, y) => h.setPointer(x, y)
    if (instance.beats?.length) {
      const tick = () => {
        const p = h.progress
        let beat = instance.beats[0]
        for (const b of instance.beats) if (p >= b.at) beat = b
        caption.hidden = false
        caption.innerHTML = `<b>${beat.id ?? ''} ${Math.round(p * 100)}%</b>${beat.title ?? ''}<br>${beat.text ?? ''}`
        requestAnimationFrame(tick)
      }
      tick()
    }
    window.__APP_READY = true
  } catch (error) {
    console.error(error)
    window.__APP_ERROR = String(error)
  }
}
