/**
 * Screen variants for the handheld LCD. Every module exports createScene({ THREE, renderer, size, look, palette })
 * (look 'lcd' = 160x144 target, 'full' = canvas) and returns a harness scene module with setPalette(name).
 *
 *   const name = pickVariant()                       // ?screen=name, falls back to defaultVariant
 *   const mod = await variants[name]()
 */
export const variants = {
  hands: () => import('./hands.js'),
  ribbons: () => import('./ribbons.js'),
  cubes: () => import('./cubes.js'),
  globe: () => import('./globe.js'),
  wall: () => import('./wall.js'),
  gyro: () => import('./gyro.js'),
  dice: () => import('./dice.js'),
  lattice: () => import('./lattice.js'),
}
export const variantNames = Object.keys(variants)
export const defaultVariant = 'cubes'

export function pickVariant(search = typeof location !== 'undefined' ? location.search : '') {
  const name = new URLSearchParams(search).get('screen')
  return name && Object.hasOwn(variants, name) ? name : defaultVariant
}
