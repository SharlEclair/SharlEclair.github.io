/**
 * 'hands': the existing Creation scene (two hands reaching across clouds) made selectable as a screen variant.
 * Adds the palette-by-name option and a live setPalette(name) like the other variants.
 */
import { createScene as createHeroScene } from '../hero/scene.js'
import { paletteColors } from '../../dither/pass.js'

export async function createScene(options = {}) {
  const { palette, ...rest } = options
  const lcd = (options.look ?? 'full') === 'lcd'
  const inner = await createHeroScene({ ...rest, ...(lcd ? { palette: paletteColors(palette ?? 'dmg') } : palette && typeof palette !== 'string' ? { palette } : {}) })
  return {
    ...inner,
    setPalette(name) { if (lcd) inner.pass.setPalette(paletteColors(name)) },
  }
}
export { beats } from '../hero/scene.js'
