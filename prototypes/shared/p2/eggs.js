// Easter eggs: tiny loader. The core + css load on the first letter key or egg click.
// Type `help` anywhere (outside inputs) to list the codes.
let core = null
const load = () => core || (core = import('/shared/p2/eggs-core.js'))
const typing = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

export function initEggs() {
  console.info('eggs: type help')
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || e.key.length !== 1 || !/[a-z]/i.test(e.key)) return
    load().then((m) => m.key(e.key.toLowerCase()))
  })
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('#f1-pitwall h3, #f1-pitwall canvas, #sql-agent')
    if (!t) return
    const sql = !!t.closest('#sql-agent')
    if (sql ? e.detail >= 3 : e.detail === 1 && !e.target.closest('a,button')) load().then((m) => m.run(sql ? 'zodiac' : 'box'))
  })
}
