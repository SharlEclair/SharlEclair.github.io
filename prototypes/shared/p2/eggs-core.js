import '/shared/p2/eggs.css'
import { person } from '/shared/content.js'

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const first = String(person.name).split(' ')[0]
const say = (lines, ms = 3500) => window.dispatchEvent(new CustomEvent('gb:say', { detail: { lines, ms } }))
const palette = (name, ms = 6000) => window.dispatchEvent(new CustomEvent('gb:palette', { detail: { name, ms } }))

let toastEl, toastTimer
function toast(text, cls = '', ms = 4000) {
  if (!toastEl) {
    toastEl = document.createElement('div')
    toastEl.className = 'egg-toast'
    toastEl.setAttribute('role', 'status')
    toastEl.setAttribute('aria-live', 'polite')
    document.body.appendChild(toastEl)
  }
  clearTimeout(toastTimer)
  toastEl.className = 'egg-toast ' + cls
  toastEl.textContent = text
  void toastEl.offsetWidth
  toastEl.classList.add('on')
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms)
}

function fx(cls, ms) {
  if (reduced) return
  const el = document.createElement('div')
  el.className = 'egg-fx ' + cls
  el.setAttribute('aria-hidden', 'true')
  document.body.appendChild(el)
  setTimeout(() => el.remove(), ms)
}

function decode(target, plain) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ+/=#%&'
  const rnd = () => A[Math.floor(Math.random() * A.length)]
  let cipher = plain.replace(/./g, (c) => (c === ' ' ? ' ' : rnd()))
  toast(reduced ? plain : cipher, 'egg-cipher', reduced ? 4000 : 5200)
  if (reduced) return
  let i = 0
  const tick = setInterval(() => {
    while (i < plain.length && plain[i] === ' ') i++
    if (i >= plain.length) return clearInterval(tick)
    cipher = cipher.slice(0, i) + plain[i] + cipher.slice(i + 1)
    i++
    if (toastEl) toastEl.textContent = cipher
  }, 70)
  setTimeout(() => clearInterval(tick), 4000)
}

const CODES = {
  currents: () => { toast('Let It Happen', 'egg-currents'); say(['LET IT HAPPEN', 'CURRENTS']); fx('egg-wash', 4000) },
  box: () => toast('Box box, box box. Plan B.', 'egg-radio'),
  purple: () => toast('Purple sector', 'egg-purple'),
  prx: () => { toast('gg ez'); say(['GG EZ']); fx('egg-cross', 700) },
  zodiac: () => decode(null, 'SELECT killer FROM suspects WHERE alibi IS NULL'),
  mirror: () => { fx('egg-glitch', 1000); toast('Nosedive: 5.0 stars') },
  treat: () => toast('Treat yo self. Ship the pipeline.'),
  heisenberg: () => { toast('I am the one who orchestrates.'); setTimeout(() => toast('Better call ' + first), 2200) },
  vault: () => { toast('VAULT-TEC: PIP-BOY OK', 'egg-vault'); say(['VAULT-TEC', 'PIP-BOY OK']); palette('night') },
  lupus: () => toast('It is never lupus. It is the join.'),
  arcane: () => toast('Progress has a price', 'egg-arcane'),
  cook: () => toast('Mise en place: tools sharpened, data cleaned.'),
  plata: () => toast('Plata o plomo? Prod or staging.'),
  help: () => toast('currents box purple prx zodiac mirror treat saul vault lupus arcane cook plata', '', 6000),
}
const ALIAS = { valorant: 'prx', saul: 'heisenberg' }
const KEYS = [...Object.keys(CODES), ...Object.keys(ALIAS)]

let buf = ''
export function run(name) { (CODES[ALIAS[name] || name] || (() => {}))() }
export function key(ch) {
  buf = (buf + ch).slice(-24)
  const hit = KEYS.find((k) => buf.endsWith(k))
  if (hit) { buf = ''; run(hit) }
}
