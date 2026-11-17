/**
 * Standalone Transit Desert page. `?theme=light|dark` picks the look (default dark).
 * The runway is 200vh, so the whole animation plays out over exactly one viewport of scroll.
 */
import { mountTransit } from './mount.js'

const query = new URLSearchParams(location.search)
const theme = query.get('theme') === 'light' ? 'light' : 'dark'
document.documentElement.dataset.theme = theme

const stage = document.querySelector('#stage')
const hero = document.querySelector('#hero')

window.__APP_READY = false
mountTransit(stage, { runway: hero, theme, layout: query.get('layout') || 'auto' }).catch((error) => {
  window.__APP_ERROR = String(error && error.message ? error.message : error)
  console.error('[transit-desert] failed to start:', error)
})
window.__setTheme = (t) => {
  document.documentElement.dataset.theme = t
  window.__ENGINE?.setTheme(t)
}
