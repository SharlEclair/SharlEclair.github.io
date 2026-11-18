// Click-and-drag orbit input for the stage. Pointer events with touch-action: pan-y, so vertical swipes
// still scroll the page; the orbit only starts after a horizontal-dominant drag and is captured then.
// Yaw/pitch targets are clamped by the rig (+-18 / +-8 degrees) and spring back on release.
export function attachOrbit(el, setTarget) {
  const prevTouch = el.style.touchAction
  el.style.touchAction = 'pan-y'
  let id = null
  let sx = 0
  let sy = 0
  let active = false

  const reset = () => {
    if (active) try { el.releasePointerCapture(id) } catch {}
    id = null
    active = false
    el.style.userSelect = ''
    setTarget(0, 0, false)
  }
  const down = (e) => {
    if (id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return
    id = e.pointerId
    sx = e.clientX
    sy = e.clientY
  }
  const move = (e) => {
    if (e.pointerId !== id) return
    let dx = e.clientX - sx
    let dy = e.clientY - sy
    if (!active) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.3) return
      active = true
      sx = e.clientX
      sy = e.clientY
      dx = dy = 0
      try { el.setPointerCapture(id) } catch {}
      el.style.userSelect = 'none'
    }
    setTarget(-dx * 0.1, dy * 0.05, true)
  }
  const up = (e) => {
    if (e.pointerId === id) reset()
  }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
    reset()
    el.style.touchAction = prevTouch
  }
}
