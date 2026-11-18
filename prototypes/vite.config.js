import { defineConfig } from 'vite'
import { readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// One dev server, many pages:
//   /                         the prototype switcher
//   /anim/transit.html        the upgraded Transit Desert animation, standalone
//   /anim/f1.html             the upgraded F1 x Currents animation, standalone
//   /variants/<id>/           one design mockup per folder (plus optional projects.html)
//
// In dev every .html under the root is served as-is. For `vite build` the inputs
// are discovered here so a new variant folder needs no config edit.
const root = fileURLToPath(new URL('.', import.meta.url))

function htmlInputs() {
  const inputs = { index: join(root, 'index.html') }
  const animDir = join(root, 'anim')
  if (existsSync(animDir)) {
    for (const file of readdirSync(animDir)) {
      if (file.endsWith('.html')) {
        inputs[`anim-${file.replace(/\.html$/, '')}`] = join(animDir, file)
      }
    }
  }
  const variants = join(root, 'variants')
  if (existsSync(variants)) {
    for (const dir of readdirSync(variants, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      for (const file of readdirSync(join(variants, dir.name))) {
        if (file.endsWith('.html')) {
          inputs[`${dir.name}-${file.replace(/\.html$/, '')}`] = join(variants, dir.name, file)
        }
      }
    }
  }
  return inputs
}

export default defineConfig({
  root,
  appType: 'mpa',
  server: { host: '127.0.0.1' },
  build: { rollupOptions: { input: htmlInputs() } },
})
