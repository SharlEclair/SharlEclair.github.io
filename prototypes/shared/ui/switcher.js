/**
 * Prototype-only chrome: a small pill that steps between variants and back to the switcher.
 * Include on every variant page with
 *   <script type="module" src="/shared/ui/switcher.js"></script>
 * It is not part of any design and is removed for the production build. Press "." to hide it.
 */
import { variants } from '/variants/manifest.js'

const match = location.pathname.match(/\/variants\/([^/]+)\//)
const index = match ? variants.findIndex((v) => v.id === match[1]) : -1
if (index >= 0) {
  const prev = variants[(index - 1 + variants.length) % variants.length]
  const next = variants[(index + 1) % variants.length]
  const host = document.createElement('div')
  host.setAttribute('data-prototype-switcher', '')
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `
    <style>
      :host{position:fixed;left:50%;top:10px;z-index:2147483000;transform:translateX(-50%);font:500 12px/1 ui-sans-serif,system-ui,sans-serif}
      nav{display:flex;align-items:center;gap:2px;padding:3px;border-radius:999px;background:rgba(20,20,22,.86);color:#f2f2f2;
        box-shadow:0 6px 24px -8px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.14);opacity:.55;transition:opacity .2s}
      nav:hover,nav:focus-within{opacity:1}
      a{color:inherit;text-decoration:none;padding:7px 10px;border-radius:999px;white-space:nowrap}
      a:hover,a:focus-visible{background:rgba(255,255,255,.16);outline:none}
      span{padding:0 8px;opacity:.75;white-space:nowrap}
      @media (max-width:560px){span{display:none}}
    </style>
    <nav aria-label="Prototype variants">
      <a href="/" title="All variants">All</a>
      <a href="/variants/${prev.id}/" title="${prev.name}" aria-label="Previous variant: ${prev.name}">&larr;</a>
      <span>${index + 1}/${variants.length} ${variants[index].name}</span>
      <a href="/variants/${next.id}/" title="${next.name}" aria-label="Next variant: ${next.name}">&rarr;</a>
    </nav>`
  document.body.appendChild(host)
  addEventListener('keydown', (event) => {
    if (event.key === '.' && !event.target.closest?.('input,textarea')) host.hidden = !host.hidden
  })
}
