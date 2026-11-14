/**
 * Light / dark theme, shared by every variant.
 *
 * 1. Paste THEME_BOOT inline in <head> BEFORE the stylesheet, so the first paint is already in the
 *    right theme (no flash):
 *
 *      <script>(function(){try{var t=localStorage.getItem('portfolio-theme');if(t!=='light'&&t!=='dark')
 *      t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
 *      document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}})()</script>
 *
 * 2. Wire any button:
 *
 *      import { initThemeToggle } from '/shared/ui/theme.js'
 *      initThemeToggle(document.querySelector('[data-theme-toggle]'))
 *
 * The choice is initialised from prefers-color-scheme, follows the OS while the visitor has not
 * chosen, and is remembered once they have. `onChange(theme)` lets a variant react (for example to
 * retint a canvas).
 */
const KEY = 'portfolio-theme'

export function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function setTheme(theme, { persist = true } = {}) {
  const next = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  if (persist) {
    try { localStorage.setItem(KEY, next) } catch { /* private mode: the choice lasts for the page */ }
  }
  document.dispatchEvent(new CustomEvent('themechange', { detail: next }))
  return next
}

/**
 * @param {HTMLElement|null} button a real <button>; gets aria-pressed and an accessible label
 * @param {{ onChange?: (theme: 'light'|'dark') => void }} [options]
 */
export function initThemeToggle(button, { onChange } = {}) {
  const sync = () => {
    const theme = currentTheme()
    if (button) {
      button.setAttribute('aria-pressed', String(theme === 'dark'))
      button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')
      button.dataset.theme = theme
    }
    onChange?.(theme)
  }
  button?.addEventListener('click', () => {
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark')
    sync()
  })
  // Follow the OS until the visitor makes a choice of their own.
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener?.('change', (event) => {
    let stored = null
    try { stored = localStorage.getItem(KEY) } catch { /* ignore */ }
    if (stored !== 'light' && stored !== 'dark') {
      setTheme(event.matches ? 'dark' : 'light', { persist: false })
      sync()
    }
  })
  sync()
}
