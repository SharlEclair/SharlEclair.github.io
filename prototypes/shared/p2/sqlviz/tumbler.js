/**
 * ?sql=tumbler  "Tumbler": a key cut from a sentence.
 * A line of plain English hangs in the air, its letter silhouette melts down into the cut edge of a brass key, the key
 * slides into a cutaway pin tumbler lock, one pin catches just off the shear line, the key is pulled back, a file
 * strokes the notch twice and brass dust drifts down, the key goes back in, the barrel turns and light comes through
 * a slit while "safety checks" sits engraved on the faceplate.
 *
 * Meaning: language becomes structure (sentence to key cut), the lock is the safety check that has to pass before
 * anything runs, the filed notch is the quiet self fix.
 *
 * SVG line art. Every frame is a pure function of progress() (scrubbing backward works). The static markup carries the
 * words (sentence, safety checks, caption) so a reduced motion visitor gets the finished frame: p = 1, nothing runs.
 * Copy comes from the sql-agent summary in shared/content.js; there are no numbers or scores anywhere.
 */
import { projects } from '../../content.js'

const CSS_HREF = new URL('./tumbler.css', import.meta.url).href
const SVG_NS = 'http://www.w3.org/2000/svg'

const SUMMARY = projects.find((p) => p.id === 'sql-agent').summary
const say = (s) => {
  if (!SUMMARY.includes(s)) console.warn('tumbler: phrase not found in content.js:', s)
  return s
}
const ASK = say('ask in plain English')
const FACE_TEXT = say('safety checks')
const BEATS = ['', say('an AI writes the database query'), say('diagnoses the error and fixes it itself'), say('safety checks review it before it runs')]
const BEAT_AT = [0.1, 0.52, 0.78]
const TITLE = 'A sentence cut into a key'

// ---------------------------------------------------------------------------------------------- geometry (viewBox units)
const W = 880
const H = 420
const GY = 266 // key axis (y of the blade centre)
const KX = 100 // key shoulder x at rest
const KL = 250 // blade length
const FACE = 376 // lock face x (the key shoulder lands here when fully inserted)
const S_IN = FACE - KX // slide distance, key fully inserted
const S_OUT = 100 // slide distance, key pulled back for filing
const SHEAR = 206
const REST = 274 // bottom of a key pin with nothing under it
const CH_TOP = 148 // top of the spring chambers
const PU = [34, 80, 126, 172, 218] // pin positions along the blade (5 pins)
const CUT = [8, 2, 14, 5, 11] // correct cut depths
const STUCK = 2 // the pin that catches
const SHORT = 6 // its cut starts this much too shallow, the file deepens it
const PX = PU.map((u) => FACE + u)
const LK = CUT.map((c) => 40 + c) // key pin lengths: top sits on the shear line when the cut is right
const DRV = 30 // driver pin length
const FX = 752 // faceplate centre
const FY = GY
const FS = 31 // sentence font size
const TX = KX
const TY = 104 // sentence baseline (world)
const BASE = TY - GY // sentence baseline in key space
const KEY_Y0 = BASE - 6 // where the key body forms (blade centre, key space) before it sinks onto its axis
const N = 100 // samples across the blade
const VB_Y = 64 // desktop crop: the drawing lives between y = 76 and y = 400
const VB_H = 344

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const seg = (p, a, b) => clamp((p - a) / (b - a))
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10) // smootherstep
const mix = (a, b, t) => a + (b - a) * t
const f1 = (n) => Math.round(n * 10) / 10
const f2 = (n) => Math.round(n * 100) / 100

/** Depth of the cuts under the blade (key space, 0 = highest edge). Pin STUCK starts too shallow and is filed. */
function depth(u, filed) {
  let d = 0
  for (let i = 0; i < PU.length; i += 1) {
    const c = CUT[i] - (i === STUCK ? SHORT * (1 - filed) : 0)
    const v = c - Math.max(0, Math.abs(u - PU[i]) - 7)
    if (v > d) d = v
  }
  return d
}
/** Top edge of the blade in key space (y, down is positive) with the leading bevel. */
function edge(u, filed) {
  if (u <= 226) return -20 + depth(u, filed)
  const e0 = -20 + depth(226, filed)
  return mix(e0, 10, clamp((u - 226) / 24))
}

function rng(seed) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}

// brass dust: a few motes that leave the notch while it is filed (pure function of p through their birth times)
const DUST = (() => {
  const r = rng(11)
  return Array.from({ length: 18 }, (_, k) => ({
    birth: 0.592 + 0.1 * (k / 17) + r() * 0.012,
    ox: (r() - 0.5) * 7, vx: (r() - 0.35) * 20, fall: 38 + r() * 40, sway: 1 + r() * 4, ph: r() * 6, rad: 0.7 + r() * 0.9,
  }))
})()

function ensureStyles(onReady) {
  let link = document.querySelector('link[data-tumbler-css]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = CSS_HREF
    link.dataset.tumblerCss = ''
    document.head.append(link)
  }
  if (link.sheet) onReady()
  else {
    link.addEventListener('load', onReady, { once: true })
    link.addEventListener('error', onReady, { once: true })
    setTimeout(onReady, 1500)
  }
}

// ---------------------------------------------------------------------------------------------- markup
function buildSvg(id) {
  const gapsAt = (y, x0, x1, half = 8) => {
    let d = `M${x0},${y}`
    for (const x of PX) d += `H${x - half}M${x + half},${y}`
    return `${d}H${x1}`
  }
  const SPRING = 'M0,0V2L-5,5L5,11L-5,17L5,23L-5,29L5,35L0,38V40'

  const voids = PX.map((x) => `<rect x="${x - 8}" y="${CH_TOP}" width="16" height="${SHEAR - CH_TOP}" fill="#000"/>`).join('')
  const defs = `<defs>
<pattern id="${id}h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="hatch-l" x1="0" y1="0" x2="0" y2="5"/></pattern>
<mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/><rect x="376" y="206" width="258" height="120" fill="#000"/>${voids}</mask>
<radialGradient id="${id}g" cx="50%" cy="50%" r="50%"><stop class="halo-stop" offset="0" style="stop-opacity:.55"/><stop class="halo-stop" offset=".45" style="stop-opacity:.16"/><stop class="halo-stop" offset="1" style="stop-opacity:0"/></radialGradient>
<linearGradient id="${id}br" x1="0" y1="0" x2="1" y2="0"><stop class="beam-stop" offset="0" style="stop-opacity:.95"/><stop class="beam-stop" offset=".5" style="stop-opacity:.38"/><stop class="beam-stop" offset="1" style="stop-opacity:0"/></linearGradient>
<linearGradient id="${id}bl" x1="1" y1="0" x2="0" y2="0"><stop class="beam-stop" offset="0" style="stop-opacity:.95"/><stop class="beam-stop" offset=".5" style="stop-opacity:.38"/><stop class="beam-stop" offset="1" style="stop-opacity:0"/></linearGradient>
<path id="${id}arc" d="M-49.5,0A49.5,49.5 0 0 1 49.5,0"/>
</defs>`

  // ---- the lock, as a section: hatched housing, plug, five pin chambers, driver pins and springs above the shear line
  const housing = 'M392,142Q392,134 400,134H638Q646,134 646,142V390Q646,398 638,398H400Q392,398 392,390Z'
  const housingIn = 'M397,143Q397,139 401,139H637Q641,139 641,143V389Q641,393 637,393H401Q397,393 397,389Z'
  const chambersUp = PX.map((x) => `M${x - 8},${SHEAR}V${CH_TOP}H${x + 8}V${SHEAR}`).join('')
  const plugOutline = `${gapsAt(SHEAR, FACE, 634)}M634,${SHEAR}V326M${FACE},326H634M${FACE},${SHEAR}V236L388,242M${FACE},296V326M${FACE},296L388,290`
  const chambersDown = PX.map((x) => `M${x - 8},${SHEAR}V242M${x + 8},${SHEAR}V242`).join('')
  const keyway = `${gapsAt(242, 388, 628)}M388,290H628M628,242V290`
  const springs = PX.map((x, i) => `<g data-spring="${i}" transform="translate(${x} ${CH_TOP})"><path class="spring" d="${SPRING}"/></g>`).join('')
  const drivers = PX.map((x, i) => {
    const t = REST - LK[i] - DRV
    return `<g data-drv="${i}"><path class="pin" d="M${x - 6},${t}H${x + 6}V${t + DRV}H${x - 6}Z"/></g>`
  }).join('')
  const keyPins = PX.map((x, i) => {
    const t = REST - LK[i]
    return `<g data-kp="${i}"><path class="pin" d="M${x - 6},${t}H${x + 6}V${REST - 6}L${x + 2.5},${REST}H${x - 2.5}L${x - 6},${REST - 6}Z"/></g>`
  }).join('')
  const sx = PX[STUCK]
  const shiver = `<g data-shiver opacity="0"><path class="shiver" d="M${sx - 12},${SHEAR - 8}q-3,5 0,10M${sx - 16.5},${SHEAR - 12}q-4.5,8 0,16M${sx + 12},${SHEAR - 8}q3,5 0,10M${sx + 16.5},${SHEAR - 12}q4.5,8 0,16"/></g>`
  const datum = `<g data-datum opacity=".8"><path class="ln datum" d="M322,${SHEAR}H${FACE - 4}M652,${SHEAR}H676"/><path d="M318,${SHEAR}l7,-3.4v6.8zM680,${SHEAR}l-7,-3.4v6.8z" fill="var(--tb-brass)"/></g>`

  const lock = `<g data-lock>
<rect x="392" y="134" width="254" height="264" fill="url(#${id}h)" mask="url(#${id}m)"/>
<path class="ln" d="${housing}"/><path class="ln dim" d="${housingIn}"/>
<path class="ln steel" d="${chambersUp}"/>
<path class="ln steel" d="${plugOutline}"/>
${springs}${drivers}${datum}${shiver}
<g data-turn><path class="ln steel" d="${chambersDown}"/><path class="ln steel" d="${keyway}"/>${keyPins}</g>
</g>`

  // ---- the faceplate: end view of the barrel, safety checks engraved around it, light behind it
  const ticks = Array.from({ length: 24 }, (_, k) => {
    const a = (k / 24) * Math.PI * 2
    const r0 = 66, r1 = k % 6 === 0 ? 70.5 : 68
    return `M${f2(Math.sin(a) * r0)},${f2(-Math.cos(a) * r0)}L${f2(Math.sin(a) * r1)},${f2(-Math.cos(a) * r1)}`
  }).join('')
  const face = `<g data-face transform="translate(${FX} ${FY})">
<circle r="150" fill="url(#${id}g)" data-halo opacity="0"/>
<g data-beams opacity="0"><path d="M44,-2.2L130,-12V12L44,2.2Z" fill="url(#${id}br)"/><path d="M-44,-2.2L-130,-12V12L-44,2.2Z" fill="url(#${id}bl)"/></g>
<circle class="ln" r="62"/><circle class="ln dim" r="58"/><path class="ln dim" d="${ticks}"/>
<text class="engrave" data-engrave text-anchor="middle"><textPath href="#${id}arc" startOffset="50%">${FACE_TEXT}</textPath></text>
<g data-plug><circle class="disc" r="41"/><circle class="ln dim" r="36.5"/>
<path class="ln hi" d="M0,-41V-33.5"/>
<rect class="slot" x="-3.6" y="-23.5" width="7.2" height="47" rx="1.2"/>
<rect class="slit" data-slit x="-.4" y="-23.5" width=".8" height="47" rx=".4" opacity="0"/></g>
</g>`

  // ---- the key (key space: shoulder at x = 0, axis y = 0, blade to +x)
  const bowTicks = Array.from({ length: 12 }, (_, k) => {
    const a = (k / 12) * Math.PI * 2
    return `M${f2(-40 + Math.cos(a) * 17)},${f2(Math.sin(a) * 17)}L${f2(-40 + Math.cos(a) * 21.5)},${f2(Math.sin(a) * 21.5)}`
  }).join('')
  const key = `<g data-key><g data-drop>
<path class="key-body" data-body d=""/>
<path class="key-edge" data-top d=""/>
<path class="ln dim" data-groove d="M12,10H222" opacity="0"/>
<g data-bow>
<circle class="ln user draw" data-draw pathLength="1" cx="-40" cy="0" r="30"/>
<circle class="ln user dim draw" data-draw pathLength="1" cx="-40" cy="0" r="25.5"/>
<circle class="ln user dim draw" data-draw pathLength="1" cx="-40" cy="0" r="17"/>
<circle class="ln user draw" data-draw pathLength="1" cx="-40" cy="0" r="8"/>
<path class="ln user dim draw" data-draw pathLength="1" d="${bowTicks}"/>
<path class="ln user draw key-fill" data-draw pathLength="1" d="M-13,-24H0V24H-13Z"/>
</g>
</g></g>`

  // ---- the file and the dust
  let teeth = ''
  for (let x = 13; x < 95; x += 3) teeth += `M${x},-3.4V3.4`
  const file = `<g data-file opacity="0"><g data-filebody><path class="file" d="M0,0L10,-4.2H96V4.2H10Z"/><path class="file-teeth" d="${teeth}"/><path class="file" d="M96,-3.6H101V3.6H96ZM101,-7Q101,-8 102,-8H132Q138,-8 138,-4V4Q138,8 132,8H102Q101,8 101,7Z"/></g></g>`
  const dust = `<g data-dust>${DUST.map(() => '<circle class="dust" r="1" opacity="0"/>').join('')}</g>`

  const sentence = `<text class="ask" data-ask x="${TX}" y="${TY}" font-size="${FS}" textLength="${KL}" lengthAdjust="spacing">${ASK}</text>`

  return `<svg class="tb-svg" viewBox="0 ${VB_Y} ${W} ${VB_H}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="${id}t" focusable="false">
<title id="${id}t">${TITLE}</title>
${defs}${face}${lock}${key}${file}${dust}${sentence}
</svg>`
}

// ---------------------------------------------------------------------------------------------- mount
export function mount(el, { theme, reduced = false, progress } = {}) {
  const id = `tb${Math.random().toString(36).slice(2, 7)}`
  const root = document.createElement('div')
  root.className = 'tb'
  root.setAttribute('role', 'figure')
  root.setAttribute('aria-label', `${ASK}: the sentence is cut into a brass key. The key goes into a lock, one pin catches and is filed, then the barrel turns and light comes through. ${BEATS[3]}.`)
  const setThemeAttr = (t) => {
    if (t === 'light' || t === 'dark') root.dataset.tbTheme = t
    else delete root.dataset.tbTheme
  }
  setThemeAttr(theme)
  root.style.visibility = 'hidden'
  root.innerHTML = `${buildSvg(id)}<p class="tb-cap"><span class="tb-ask" data-ask-cap>${ASK}</span><span class="tb-beat" data-beat>${BEATS[3]}</span></p>`
  el.replaceChildren(root)
  const svg = root.querySelector('svg')
  const q = (s) => svg.querySelector(s)
  const qa = (s) => [...svg.querySelectorAll(s)]
  const R = {
    key: q('[data-key]'), drop: q('[data-drop]'), body: q('[data-body]'), top: q('[data-top]'), groove: q('[data-groove]'), bow: qa('[data-draw]'),
    ask: q('[data-ask]'), lock: q('[data-lock]'), turn: q('[data-turn]'), datum: q('[data-datum]'), shiver: q('[data-shiver]'),
    drv: PX.map((_, i) => q(`[data-drv="${i}"]`)), kp: PX.map((_, i) => q(`[data-kp="${i}"]`)), spring: PX.map((_, i) => q(`[data-spring="${i}"]`)),
    face: q('[data-face]'), plug: q('[data-plug]'), slit: q('[data-slit]'), halo: q('[data-halo]'), beams: q('[data-beams]'), engrave: q('[data-engrave]'),
    file: q('[data-file]'), fileBody: q('[data-filebody]'), dust: qa('[data-dust] circle'),
    cap: root.querySelector('[data-ask-cap]'), beat: root.querySelector('[data-beat]'),
  }

  // sentence silhouette (ink height above the baseline per blade sample) and per letter extents, measured from the text
  const U = Array.from({ length: N + 1 }, (_, j) => (KL * j) / N)
  const topH = new Array(N + 1).fill(0)
  let letters = []
  const classify = (ch) => (ch === ' ' ? 0 : /[A-Zbdfhklt]/.test(ch) ? 0.7 : /[ij]/.test(ch) ? 0.62 : 0.46)
  function measure() {
    const n = ASK.length
    let ext = []
    try {
      for (let k = 0; k < n; k += 1) ext.push([R.ask.getStartPositionOfChar(k).x - TX, R.ask.getEndPositionOfChar(k).x - TX])
      if (!ext.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b)) || ext[n - 1][1] < KL * 0.5) throw new Error('bad extents')
    } catch {
      ext = Array.from({ length: n }, (_, k) => [(KL * k) / n, (KL * (k + 1)) / n])
    }
    letters = ext.map(([a, b], k) => ({ a, b, c: (a + b) / 2, h: classify(ASK[k]) * FS }))
    for (let j = 0; j <= N; j += 1) {
      const l = letters.find((L) => U[j] >= L.a && U[j] < L.b)
      topH[j] = l ? l.h : 0
    }
  }
  measure()

  // ------------------------------------------------------------------------------------------ small helpers
  const put = (node, k, v) => {
    const c = (node._c ||= {})
    if (c[k] === v) return
    c[k] = v
    if (k === 'text') node.textContent = v
    else node.setAttribute(k, v)
  }
  const op = (node, v) => put(node, 'opacity', String(f2(clamp(v))))

  // ------------------------------------------------------------------------------------------ the frame
  let narrow = false
  let lastP = -1

  function setView(p) {
    const box = narrow ? svg.getBoundingClientRect() : null
    if (!box || !box.width || !box.height) { put(svg, 'viewBox', `0 ${VB_Y} ${W} ${VB_H}`); return }
    const a = box.width / box.height
    const e1 = ease(seg(p, 0.24, 0.34))
    const e2 = ease(seg(p, 0.84, 0.93))
    let cx = mix(195, 482, e1), w = mix(350, 400, e1), cy = 262
    cx -= 82 * (ease(seg(p, 0.5, 0.58)) - ease(seg(p, 0.72, 0.8))) // look left while the key is out and being filed
    cx = mix(cx, 748, e2); w = mix(w, 250, e2); cy = mix(cy, FY, e2)
    const h = w / a
    put(svg, 'viewBox', `${f1(cx - w / 2)} ${f1(cy - h / 2)} ${f1(w)} ${f1(h)}`)
  }

  function render(p) {
    const E = (a, b) => ease(seg(p, a, b))

    // key travel, filing and the turn: the whole story is these three numbers
    const s = S_IN * E(0.26, 0.4) - (S_IN - S_OUT) * E(0.5, 0.57) + (S_IN - S_OUT) * E(0.73, 0.8)
    const filed = 0.5 * E(0.585, 0.625) + 0.5 * E(0.63, 0.67)
    const turn = E(0.8, 0.9)
    const sc = Math.max(0.15, Math.cos((turn * Math.PI) / 2))
    const open = E(0.875, 0.97)
    const gx = KX + s

    // ---- the sentence becomes the key in three calm phases:
    //   1 the letters dissolve into their blocky silhouette (a skyline of ink heights), 2 that skyline settles in place
    //   into the cut edge with a short left to right ripple, 3 the finished key sinks as one body onto its axis
    const strip = E(0.02, 0.07)
    const drop = E(0.17, 0.25)
    let dTop = '', dBot = ''
    for (let j = 0; j <= N; j += 1) {
      const a = 0.085 + 0.03 * (j / N)
      const m = ease(seg(p, a, a + 0.05))
      const yt = BASE - topH[j] - KEY_Y0
      const y = mix(yt, edge(U[j], filed), m)
      const yb = mix(BASE + 6 - KEY_Y0, 20, m)
      dTop += `${j ? 'L' : 'M'}${f1(U[j])},${f1(y)}`
      dBot = `L${f1(U[j])},${f1(yb)}${dBot}`
    }
    put(R.top, 'd', dTop)
    put(R.body, 'd', `${dTop}${dBot}Z`)
    op(R.body, strip)
    op(R.top, strip)
    op(R.groove, E(0.2, 0.26))
    put(R.drop, 'transform', `translate(0 ${f1(KEY_Y0 * (1 - drop))})`)

    put(R.ask, 'y', f1(TY - (1 - E(0, 0.06)) * 5 + 7 * E(0.07, 0.12)))
    op(R.ask, 1 - E(0.07, 0.12))

    // ---- the bow draws itself on as the key sinks
    const bow = E(0.15, 0.26)
    for (const n of R.bow) {
      put(n, 'stroke-dasharray', bow >= 1 ? 'none' : '1 1')
      put(n, 'stroke-dashoffset', f2(1 - bow))
      op(n, bow > 0.002 ? 1 : 0)
    }
    put(R.key, 'transform', `translate(${f1(gx)} ${GY}) scale(1 ${f2(sc)})`)

    // ---- the lock: quiet at first, fully drawn once the key arrives
    op(R.lock, mix(0.55, 1, E(0.2, 0.3)))
    put(R.turn, 'transform', `translate(0 ${GY}) scale(1 ${f2(sc)}) translate(0 ${-GY})`)

    // pins ride the cut edge under them; the caught pin sits just above the shear line and shivers
    const shake = seg(p, 0.405, 0.5)
    const env = Math.sin(Math.PI * shake)
    const jitter = Math.sin(p * 3100) * 1.1 * env
    for (let i = 0; i < PX.length; i += 1) {
      const u = PX[i] - gx
      const yb = u >= 0 && u <= KL ? Math.min(REST, GY + edge(u, filed)) : REST
      const dy = yb - REST + (i === STUCK ? jitter : 0)
      put(R.kp[i], 'transform', `translate(0 ${f2(dy)})`)
      put(R.drv[i], 'transform', `translate(0 ${f2(dy)})`)
      const len = REST - LK[i] - DRV + dy - CH_TOP
      put(R.spring[i], 'transform', `translate(${PX[i]} ${CH_TOP}) scale(1 ${f2(len / 40)})`)
    }
    op(R.shiver, env * (p < 0.5 ? 1 : 0))

    // ---- the file: two strokes on one notch, then a little brass dust
    const stroke = Math.sin(Math.PI * seg(p, 0.585, 0.625)) + Math.sin(Math.PI * seg(p, 0.63, 0.67))
    const fileIn = E(0.56, 0.58) * (1 - E(0.68, 0.7))
    const nx = KX + S_OUT + PU[STUCK]
    const ny = GY + edge(PU[STUCK], filed)
    op(R.file, fileIn)
    put(R.file, 'transform', `translate(${f1(nx)} ${f1(ny + 0.4)}) rotate(-146)`)
    put(R.fileBody, 'transform', `translate(${f1(22 * (1 - stroke) + 4)} 0)`)
    DUST.forEach((d, k) => {
      const t = (p - d.birth) / 0.1
      const c = R.dust[k]
      if (t <= 0 || t >= 1) { op(c, 0); return }
      put(c, 'cx', f1(nx + d.ox + d.vx * t + Math.sin(t * 6 + d.ph) * d.sway * t))
      put(c, 'cy', f1(ny + 1 + d.fall * (0.55 * t + 0.45 * t * t)))
      put(c, 'r', f2(d.rad))
      op(c, Math.pow(Math.sin(Math.PI * t), 0.8) * 0.9)
    })

    // ---- the faceplate and the light
    const faceVis = mix(0.42, 1, E(0.26, 0.34))
    op(R.face, faceVis)
    const tryDeg = 3.6 * Math.sin(Math.PI * seg(p, 0.43, 0.495)) * (0.8 + 0.2 * Math.sin(p * 3100))
    put(R.plug, 'transform', `rotate(${f2(tryDeg + 90 * turn)})`)
    const w = mix(0.8, 7.2, open)
    put(R.slit, 'width', f2(w))
    put(R.slit, 'x', f2(-w / 2))
    op(R.slit, open)
    op(R.halo, open)
    op(R.beams, open)
    op(R.engrave, mix(0.78, 1, open))

    // ---- caption: the sentence stays once it has melted into the key
    R.cap.style.opacity = f2(E(0.22, 0.28))
    const bi = p < BEAT_AT[0] ? 0 : p < BEAT_AT[1] ? 1 : p < BEAT_AT[2] ? 2 : 3
    put(R.beat, 'text', BEATS[bi])
    const near = Math.min(...BEAT_AT.map((b) => Math.abs(p - b)))
    R.beat.style.opacity = f2(clamp(near / 0.02))

    setView(p)
  }

  // ------------------------------------------------------------------------------------------ lifecycle
  let on = false
  let raf = 0
  function frame() {
    const p = reduced ? 1 : progress ? progress() : 1
    if (Math.abs(p - lastP) > 1e-4) { lastP = p; render(p) }
  }
  function tick() {
    raf = 0
    if (!on) return
    frame()
    raf = requestAnimationFrame(tick)
  }
  function setOn(v) {
    if (on === v) return
    on = v
    if (on && !raf && !reduced) raf = requestAnimationFrame(tick)
  }

  function decide() {
    const n = root.clientWidth > 0 && root.clientWidth < 600
    if (n !== narrow) narrow = n
    lastP = -1
    frame()
  }
  decide()

  let io = null
  if (!reduced) {
    io = new IntersectionObserver((entries) => { for (const e of entries) setOn(e.isIntersecting) }, { rootMargin: '10% 0px' })
    io.observe(root)
  }
  ensureStyles(() => { root.style.visibility = ''; measure(); lastP = -1; frame() })
  const ro = new ResizeObserver(decide)
  ro.observe(root)
  const onFonts = () => { measure(); lastP = -1; frame() }
  document.fonts?.ready.then(onFonts)
  document.fonts?.addEventListener?.('loadingdone', onFonts)

  return {
    setTheme(t) { setThemeAttr(t) }, // every colour is a CSS token flipped by data-tb-theme or html[data-theme]
    dispose() {
      on = false
      cancelAnimationFrame(raf)
      raf = 0
      io?.disconnect()
      ro.disconnect()
      document.fonts?.removeEventListener?.('loadingdone', onFonts)
      root.remove()
    },
  }
}
