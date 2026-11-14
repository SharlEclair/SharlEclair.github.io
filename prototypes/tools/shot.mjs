/**
 * Headless screenshot helper for the prototypes (uses the system Edge/Chrome via puppeteer-core).
 *
 *   node tools/shot.mjs <url> <out.png|jpg> [--w=1440] [--h=900] [--scroll=0.5 | --y=1200]
 *                        [--progress=0.6] [--wait=1500] [--full] [--mobile] [--reduced]
 *                        [--eval="js expression"] [--sheet=0,0.25,0.5,0.75,1]
 *
 *   --scroll=F     scroll to F x (document height - viewport) before the capture
 *   --y=PX         scroll to an absolute offset
 *   --progress=U   call window.__TEST_SET_PROGRESS(U) (the standalone animation pages)
 *   --sheet=a,b,c  capture one frame per scroll fraction and write <out>-0.png, <out>-1.png, ...
 *   --full         full-page capture instead of the viewport
 *   --reduced      emulate prefers-reduced-motion: reduce
 *
 * Prints console errors and page errors, so a broken page is visible without opening a browser.
 * Headless Chromium has no GPU here (SwiftShader): judge composition and correctness from these, never
 * frame rate.
 */
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'

const args = process.argv.slice(2)
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...v] = a.slice(2).split('=')
    return [k, v.length ? v.join('=') : true]
  })
)
const [url, out] = args.filter((a) => !a.startsWith('--'))
if (!url || !out) {
  console.error('usage: node tools/shot.mjs <url> <out> [flags]')
  process.exit(2)
}

const candidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]
const executablePath = candidates.find((p) => existsSync(p))
if (!executablePath) {
  console.error('no Chrome or Edge found')
  process.exit(2)
}

const width = Number(flags.w ?? (flags.mobile ? 390 : 1440))
const height = Number(flags.h ?? (flags.mobile ? 844 : 900))
const wait = Number(flags.wait ?? 1500)

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: Boolean(flags.mobile), hasTouch: Boolean(flags.mobile) })
if (flags.reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])

const problems = []
page.on('console', (m) => { if (m.type() === 'error') problems.push('console.error: ' + m.text().slice(0, 400)) })
page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 400)))
page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url().slice(0, 200)))

await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch((e) => problems.push('goto: ' + e.message))
await new Promise((r) => setTimeout(r, wait))

async function position(fraction) {
  if (flags.progress !== undefined && fraction === null) {
    await page.evaluate((u) => window.__TEST_SET_PROGRESS?.(u), Number(flags.progress))
  }
  if (fraction !== null) {
    await page.evaluate((f) => window.scrollTo({ top: f * (document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }), fraction)
  } else if (flags.y !== undefined) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Number(flags.y))
  } else if (flags.scroll !== undefined) {
    await page.evaluate((f) => window.scrollTo({ top: f * (document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }), Number(flags.scroll))
  }
  await new Promise((r) => setTimeout(r, Math.max(600, wait / 2)))
}

if (flags.eval) {
  const result = await page.evaluate(String(flags.eval)).catch((e) => 'eval failed: ' + e.message)
  console.log('eval:', JSON.stringify(result))
  await new Promise((r) => setTimeout(r, 400))
}

if (flags.sheet) {
  const fractions = String(flags.sheet).split(',').map(Number)
  const dot = out.lastIndexOf('.')
  for (let i = 0; i < fractions.length; i += 1) {
    await position(fractions[i])
    await page.screenshot({ path: `${out.slice(0, dot)}-${i}${out.slice(dot)}` })
  }
} else {
  await position(null)
  await page.screenshot({ path: out, fullPage: Boolean(flags.full) })
}

const metrics = await page.evaluate(() => ({
  scrollHeight: document.documentElement.scrollHeight,
  horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  title: document.title,
}))
console.log(JSON.stringify({ out, ...metrics, problems: problems.slice(0, 12) }))
await browser.close()
