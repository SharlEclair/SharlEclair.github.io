// The box the scene renders into.
//
// The original read window.innerWidth / innerHeight in four places (renderer,
// camera, airflow ribbon thickness, scroll). That is only correct when the
// canvas is the whole window. Embedded in a page section it is not, so every
// reader takes its size from here and the renderer keeps it current.
export const viewport = {
  width: typeof window !== 'undefined' ? window.innerWidth : 1,
  height: typeof window !== 'undefined' ? window.innerHeight : 1,
  pixelRatio: 1,
}

const listeners = new Set()

export function setViewport(width, height, pixelRatio) {
  viewport.width = Math.max(1, width)
  viewport.height = Math.max(1, height)
  viewport.pixelRatio = pixelRatio
  for (const fn of listeners) fn(viewport)
}

export function onViewportChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
