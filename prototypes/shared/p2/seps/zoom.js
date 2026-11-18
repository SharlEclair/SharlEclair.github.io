/**
 * ?sep=zoom "Zoom Levels": the next section heading resolves through 1-bit Bayer-dithered steps (like map tiles
 * sharpening), driven purely by its scroll position, then the real serif text takes over.
 * p = 0 at the h2 top on the viewport bottom, p = 1 at its top at 55% of the viewport (45vh of scroll).
 * Steps: p<.2 1/32, <.4 1/16, <.6 1/8, <.8 1/4, <1 1/2, >=1 real text.
 */
const SCALES = [32, 16, 8, 4, 2]
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const SPAN = 0.45

if (!document.querySelector('link[data-zoom-css]')) {
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = new URL('./zoom.css', import.meta.url).href
  l.dataset.zoomCss = ''
  document.head.append(l)
}

const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, w), height: Math.max(1, h) })

export function mount(el, { reduced } = {}) {
  const h2 = el.nextElementSibling?.querySelector('h2')
  if (!h2 || reduced || matchMedia('(forced-colors: active)').matches) return
  const label = h2.textContent.trim() // captured before the tag is appended
  let dead = false, cv, tag, steps = [], cur = -1, raf = 0, textW = 0

  const cleanup = () => {
    dead = true
    cancelAnimationFrame(raf)
    removeEventListener('scroll', onScroll)
    removeEventListener('resize', build)
    mo.disconnect()
    cv?.remove(); tag?.remove()
    h2.classList.remove('zoom-h', 'is-resolving')
  }

  function build() {
    if (dead) return
    cancelAnimationFrame(raf)
    for (const f of document.fonts) if (f.status === 'error') return cleanup()
    h2.classList.remove('is-resolving')
    const cs = getComputedStyle(h2)
    const w = h2.clientWidth, h = h2.clientHeight, lh = parseFloat(cs.lineHeight)
    if (!w || !h || h > lh * 1.5) { cur = -1; cv && (cv.style.display = 'none'); return }
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const text = cs.textTransform === 'uppercase' ? label.toUpperCase() : label
    const src = mk(Math.round(w * dpr), Math.round(h * dpr))
    const c = src.getContext('2d')
    c.scale(dpr, dpr)
    c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    c.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing
    c.textBaseline = 'alphabetic'
    const m = c.measureText(text)
    textW = m.width
    const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent
    c.fillStyle = '#000'
    c.fillText(text, 0, (h - (asc + desc)) / 2 + asc)
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || cs.color
    const probe = mk(1, 1).getContext('2d'); probe.fillStyle = fg
    probe.fillRect(0, 0, 1, 1)
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data

    steps = SCALES.map((k) => {
      const tw = Math.max(1, Math.round(w / k)), th = Math.max(1, Math.round(h / k)) // CSS px: same look at any dpr
      let from = src
      while (from.width > tw * 2 || from.height > th * 2) { // halve progressively: a box-ish filter, not aliased
        const n = mk(Math.max(tw, Math.ceil(from.width / 2)), Math.max(th, Math.ceil(from.height / 2)))
        const x = n.getContext('2d'); x.imageSmoothingQuality = 'high'
        x.drawImage(from, 0, 0, n.width, n.height); from = n
      }
      const out = mk(tw, th), ox = out.getContext('2d')
      ox.imageSmoothingQuality = 'high'
      ox.drawImage(from, 0, 0, tw, th)
      const img = ox.getImageData(0, 0, tw, th), d = img.data
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const i = (y * tw + x) * 4
        const on = d[i + 3] / 255 > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = on ? 255 : 0
      }
      ox.putImageData(img, 0, 0)
      return out
    })

    if (!cv) {
      cv = document.createElement('canvas'); cv.className = 'zoom-cv'; cv.setAttribute('aria-hidden', 'true')
      tag = document.createElement('span'); tag.className = 'zoom-tag'; tag.setAttribute('aria-hidden', 'true')
      h2.append(cv, tag)
    }
    cv.style.display = ''
    cv.style.width = w + 'px'; cv.style.height = h + 'px'
    tag.style.left = Math.ceil(textW + 14) + 'px'
    cur = -1
    update()
  }

  function stepNow() {
    const vh = innerHeight
    const p = (vh - h2.getBoundingClientRect().top) / (vh * SPAN)
    return p >= 1 ? 5 : Math.max(0, Math.floor(p / 0.2))
  }

  function update() {
    raf = 0
    if (dead || !steps.length || !cv || cv.style.display === 'none') return
    const s = stepNow()
    if (s === cur) return
    cur = s
    if (s >= 5) { h2.classList.remove('is-resolving'); return }
    const src = steps[s]
    cv.width = src.width; cv.height = src.height
    cv.getContext('2d').drawImage(src, 0, 0)
    tag.textContent = 'Z' + (s + 1)
    h2.classList.add('is-resolving')
  }

  function onScroll() { if (!raf) raf = requestAnimationFrame(update) }

  h2.classList.add('zoom-h')
  const mo = new MutationObserver(() => build())
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('resize', build)
  document.fonts.ready.then(build)
  return cleanup
}
