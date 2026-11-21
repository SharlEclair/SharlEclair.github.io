/**
 * Glossy "gel" material for the blue on/off pill and (optionally) the A / B caps (variants: shared/gb/variants.js).
 * Reference: translucent gel pills, deep colour at the top running to a pale inner glow at the bottom, a soft highlight
 * band along the top, and a lit rim. One MeshPhysicalMaterial (clearcoat, a little sheen, transmission stays 0 so the
 * scene gets no extra render pass) whose colour and glow come from a vertical gradient computed in the fragment
 * shader from the part's own local position. All the per-part differences are uniforms, so the one shader program is
 * shared by every gel part.
 */

/** Looks: `top` deep colour, `bot` pale inner glow, `rim` fresnel edge, `glow` emissive amount, `sheen` highlight strength. */
export const GEL_LOOKS = {
  pill: { top: 0x0a2fd6, bot: 0x5cc4ff, rim: 0xbfeaff, glow: 0.55, sheen: 0.7, rough: 0.2 },
  cap: { top: 0xc41e08, bot: 0xff6a30, rim: 0xffb08a, glow: 0.4, sheen: 0.45, rough: 0.26 },
}

/**
 * @param geometry the part's geometry (its bounding box sets the gradient range; local +y is up on the console face)
 * @param look one of GEL_LOOKS
 */
export function makeGelMaterial(THREE, geometry, look, envIntensity = 1) {
  geometry.computeBoundingBox()
  const bb = geometry.boundingBox
  const U = {
    uGelC: { value: new THREE.Vector2((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2) },
    uGelR: { value: new THREE.Vector2(Math.max(1e-4, (bb.max.x - bb.min.x) / 2), Math.max(1e-4, (bb.max.y - bb.min.y) / 2)) },
    uGelTop: { value: new THREE.Color(look.top) },
    uGelBot: { value: new THREE.Color(look.bot) },
    uGelRim: { value: new THREE.Color(look.rim) },
    uGelGlow: { value: look.glow },
    uGelSheen: { value: look.sheen },
  }
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: look.rough, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
    sheen: 0.6, sheenRoughness: 0.35, sheenColor: new THREE.Color(look.rim), envMapIntensity: 0.9 * envIntensity,
  })
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', 'varying vec3 vGelP;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGelP = position;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', 'varying vec3 vGelP;\nuniform vec2 uGelC, uGelR;\nuniform vec3 uGelTop, uGelBot, uGelRim;\nuniform float uGelGlow, uGelSheen;\n#include <common>')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec2 gn = (vGelP.xy - uGelC) / uGelR;
         float gt = clamp(gn.y * 0.5 + 0.5, 0.0, 1.0);
         vec3 gelCol = mix(uGelBot, uGelTop, smoothstep(0.1, 0.95, gt));
         diffuseColor.rgb = gelCol;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float gNdv = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
         float gFr = pow(1.0 - gNdv, 2.4);
         // inner glow pools toward the bottom edge and the rim; deeper colour stays up top
         totalEmissiveRadiance += uGelGlow * gelCol * (0.25 + 0.6 * (1.0 - gt) + 0.7 * gFr);
         totalEmissiveRadiance += uGelGlow * uGelRim * gFr * 0.5;
         // soft highlight band along the top, fading toward the rounded ends
         float gBand = smoothstep(0.5, 0.78, gt) * (1.0 - smoothstep(0.8, 0.98, gt));
         float gEnd = 1.0 - smoothstep(0.55, 0.95, abs(gn.x));
         totalEmissiveRadiance += uGelRim * uGelSheen * gBand * gEnd * 0.6;`,
      )
  }
  m.customProgramCacheKey = () => 'gb-gel'
  m.userData.gel = U // live handles for the tuner (colours, glow, sheen)
  return m
}
