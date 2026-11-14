// The preset switcher for the /presets.html page.
//
// Deliberately not a lil-gui folder. lil-gui owns a single collapsible panel and
// adding a second one beside it means fighting its positioning, its z-index and
// its theme. This is a small, plain-DOM widget instead: no framework, one
// stylesheet block, and it can be dropped on any page that has a list of
// presets.
//
// The widget owns no state. It is told which preset is active and it reports
// clicks; the caller decides what actually happens. That keeps the "which look
// is on screen" answer in exactly one place.

const STYLE_ID = 'f1-preset-toggle-styles'

const CSS = `
.f1-preset-toggle {
  position: fixed;
  top: 18px;
  left: 18px;
  z-index: 10000;
  width: 210px;
  padding: 10px;
  border: 1px solid rgba(203, 166, 195, 0.22);
  border-radius: 8px;
  background: rgba(29, 23, 32, 0.86);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #cba6c3;
  font-family: Inter, Helvetica, Arial, sans-serif;
  font-size: 0.7rem;
  line-height: 1.3;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
}

.f1-preset-toggle__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  margin: 0 0 8px;
  padding: 0 2px;
  border: 0;
  background: none;
  color: #886593;
  font: inherit;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
}

.f1-preset-toggle__head:hover { color: #cba6c3; }

.f1-preset-toggle__chev {
  font-size: 0.6rem;
  transition: transform 160ms ease;
}

.f1-preset-toggle__head[aria-expanded="false"] .f1-preset-toggle__chev {
  transform: rotate(-90deg);
}

.f1-preset-toggle__body[hidden] { display: none; }

.f1-preset-toggle__btn {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  margin: 0 0 4px;
  padding: 7px 9px;
  border: 1px solid rgba(203, 166, 195, 0.16);
  border-radius: 5px;
  background: rgba(203, 166, 195, 0.04);
  color: #a0a0a2;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease, background-color 120ms ease;
}

.f1-preset-toggle__btn:hover {
  color: #cba6c3;
  border-color: rgba(203, 166, 195, 0.38);
}

.f1-preset-toggle__btn[aria-pressed="true"] {
  color: #1d1720;
  border-color: #cba6c3;
  background: #cba6c3;
}

.f1-preset-toggle__key {
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  opacity: 0.65;
}

.f1-preset-toggle__hint {
  margin: 8px 2px 0;
  color: #886593;
  font-size: 0.6rem;
  letter-spacing: 0.04em;
}

.f1-preset-toggle__hint kbd {
  padding: 1px 3px;
  border: 1px solid rgba(203, 166, 195, 0.28);
  border-radius: 3px;
  background: none;
  color: #cba6c3;
  font: inherit;
  font-size: 0.58rem;
}

@media (max-width: 600px) {
  .f1-preset-toggle {
    top: 10px;
    left: 10px;
    width: 168px;
    padding: 8px;
  }
}
`

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

export function createPresetToggle({
  presets,
  activeId,
  onChange,
  title = 'Animation',
  keyHint = true,
  mount = document.body,
} = {}) {
  if (!presets?.length) throw new Error('[F1 x Currents] toggle needs at least one preset')
  ensureStyles()

  let current = activeId || presets[0].id
  let collapsed = false

  const root = document.createElement('div')
  root.className = 'f1-preset-toggle'

  // The header is a real <button>, so Space/Enter and focus handling come for
  // free; a <div> with a click handler would need all of that re-implemented.
  const head = document.createElement('button')
  head.type = 'button'
  head.className = 'f1-preset-toggle__head'
  head.setAttribute('aria-expanded', 'true')
  head.title = 'Collapse / expand (H)'

  const headLabel = document.createElement('span')
  headLabel.textContent = title
  const chev = document.createElement('span')
  chev.className = 'f1-preset-toggle__chev'
  chev.textContent = '▾'
  chev.setAttribute('aria-hidden', 'true')
  head.append(headLabel, chev)

  const body = document.createElement('div')
  body.className = 'f1-preset-toggle__body'

  const buttons = new Map()
  presets.forEach((preset, i) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'f1-preset-toggle__btn'
    btn.dataset.presetId = preset.id
    btn.setAttribute('aria-pressed', String(preset.id === current))
    btn.title = `Show "${preset.label}"  (${i + 1})`

    const name = document.createElement('span')
    name.textContent = preset.label
    const key = document.createElement('span')
    key.className = 'f1-preset-toggle__key'
    key.textContent = String(i + 1)
    key.setAttribute('aria-hidden', 'true')
    btn.append(name, key)

    btn.addEventListener('click', (e) => {
      // Without this the click bubbles to the container and, on a future
      // restructure, could reach a row-level handler.
      e.stopPropagation()
      select(preset.id)
    })

    buttons.set(preset.id, btn)
    body.appendChild(btn)
  })

  if (keyHint) {
    const hint = document.createElement('p')
    hint.className = 'f1-preset-toggle__hint'
    hint.innerHTML =
      '<kbd>1</kbd>/<kbd>2</kbd> or <kbd>←</kbd><kbd>→</kbd> switch' +
      ' &nbsp;·&nbsp; <kbd>H</kbd> collapse'
    body.appendChild(hint)
  }

  root.append(head, body)
  mount.appendChild(root)

  function paint() {
    for (const [id, btn] of buttons) {
      btn.setAttribute('aria-pressed', String(id === current))
    }
  }

  function select(id, { notify = true } = {}) {
    if (!buttons.has(id)) return false
    const changed = id !== current
    current = id
    paint()
    if (changed && notify) onChange?.(id)
    return true
  }

  function toggleCollapsed() {
    collapsed = !collapsed
    body.hidden = collapsed
    head.setAttribute('aria-expanded', String(!collapsed))
  }

  head.addEventListener('click', toggleCollapsed)

  // Keyboard shortcuts. Suppressed whenever the event is already inside a form
  // control, so typing a value into a lil-gui number field can never trip a
  // preset switch.
  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const t = e.target
    if (t instanceof HTMLElement) {
      const tag = t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return
    }

    const index = presets.findIndex((p) => p.id === current)

    if (e.key >= '1' && e.key <= '9') {
      const target = presets[Number(e.key) - 1]
      if (target) { select(target.id); e.preventDefault() }
      return
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const step = e.key === 'ArrowRight' ? 1 : -1
      const next = presets[(index + step + presets.length) % presets.length]
      select(next.id)
      e.preventDefault()
      return
    }

    if (e.key === 'h' || e.key === 'H') {
      toggleCollapsed()
      e.preventDefault()
    }
  }

  window.addEventListener('keydown', onKeyDown)

  return {
    element: root,
    getActiveId: () => current,
    select,
    destroy() {
      window.removeEventListener('keydown', onKeyDown)
      root.remove()
    },
  }
}
