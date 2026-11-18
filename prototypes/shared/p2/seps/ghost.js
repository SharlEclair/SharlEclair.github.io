/**
 * Ghost Lap separator. Slot 1: the real coursebook build (389.9 s before, 34.2 s after) raced like an F1 timing
 * graphic, driven purely by CSS scroll-driven animation (see ghost.css). Slot 2: a quiet hairline with the caption.
 * Without animation-timeline support or with reduced motion, both markers sit at the finish and the chip shows.
 */
const CSS_HREF = new URL('./ghost.css', import.meta.url).href

function ensureCss() {
  if (document.querySelector(`link[href="${CSS_HREF}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = CSS_HREF
  document.head.append(link)
}

const marker = (kind, long, short) => `
  <div class="gl-m ${kind}"><div class="gl-sq"></div>
    <div class="gl-lab"><span class="gl-name"><span class="l">${long}</span><span class="s">${short}</span></span><span class="gl-time"></span></div>
  </div>`

export function mount(el, { slot }) {
  ensureCss()
  const quiet = slot !== 1
  el.innerHTML = `<div class="gl${quiet ? ' quiet' : ''}">
    <div class="gl-track"><div class="gl-rule"></div><i class="gl-tick s"></i><i class="gl-tick f"></i>
      ${quiet ? '' : marker('ghost', 'Before', 'B') + marker('live', 'After', 'A')}
    </div>
    ${quiet ? '' : '<div class="gl-chip">11 times faster</div>'}
    <div class="gl-cap">Same coursebook build, timed.</div>
  </div>`
}
