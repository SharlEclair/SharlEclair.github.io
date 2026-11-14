/**
 * Contact sheet of a standalone animation page across progress values (system Chrome, SwiftShader).
 *
 *   node tools/sheet.mjs transit out.jpg 0,0.2,0.5,0.8,1 [--w=1000] [--h=620] [--cols=2]
 *   node tools/sheet.mjs f1 out.jpg 0,0.5,1
 *
 * Needs ImageMagick (`magick`) on PATH for the montage step.
 */
import puppeteer from 'puppeteer-core'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')))
const [which, out, list] = args.filter((a) => !a.startsWith('--'))
const values = list.split(',').map(Number)
const width = Number(flags.w ?? 1000)
const height = Number(flags.h ?? 620)
const base = flags.base ?? 'http://127.0.0.1:5310'

const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setViewport({ width, height, deviceScaleFactor: 1 })
const problems = []
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => problems.push(String(e).slice(0, 300)))
await page.goto(`${base}/anim/${which}.html`, { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => window.__APP_READY === true || window.__F1_READY === true || window.__APP_ERROR, { timeout: 90000 }).catch(() => problems.push('ready timeout'))
await page.addStyleTag({ content: '.lil-gui{display:none!important}' })

const dir = mkdtempSync(join(tmpdir(), 'sheet-'))
const files = []
for (let i = 0; i < values.length; i += 1) {
  await page.evaluate((v) => window.__TEST_SET_PROGRESS(v), values[i])
  await new Promise((r) => setTimeout(r, which === 'f1' ? 900 : 250))
  const file = join(dir, `f${String(i).padStart(2, '0')}.png`)
  await page.screenshot({ path: file })
  files.push(file)
}
await browser.close()
const cols = Number(flags.cols ?? 2)
const cell = Number(flags.cell ?? 780)
execFileSync('magick', ['montage', ...files, '-tile', `${cols}x`, '-geometry', `${cell}x+3+3`, '-background', '#333', '-quality', '82', out])
console.log(JSON.stringify({ out, frames: values, problems: problems.slice(0, 8) }))
