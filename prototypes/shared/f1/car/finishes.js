// The three looks for the car's surface, applied by src/car/loader.js.
//
// These are STARTING POINTS, not fixed styles: picking one writes its numbers
// into the editable `car.roughness` / `metalness` / `clearcoat` / ... sliders, so
// you choose a look and then tune it by hand. That is why the values live here
// and are copied into the config, rather than being switched on at render time.
//
// The numbers are chosen to read correctly against the room environment used for
// reflections (see car/loader.js) -- metalness near 1 with no environment map
// renders black, so these only make sense with one.
//
// THEY ARE TUNED BY MEASUREMENT, not by eye. The body colour is #151419, i.e.
// deliberately near-black, and a metallic surface shows its ENVIRONMENT rather
// than its base colour -- so metalness and envMapIntensity control how bright the
// car actually looks, and a plausible-looking 1.35 washes it out to chrome
// (measured: mean luminance 99 with highlights clipped at 255, against 37 for the
// matte finish). The values below were adjusted until each preset sat in its
// intended band while keeping the highlights inside range; `finish-probe.html`
// prints the table if you want to retune.
//
// Bands, measured over the car's own pixels: matte ~40-55, obsidian ~55-75,
// glossy ~75-95. Chrome is anything over ~150.
export const FINISHES = {
  // Near-black, glass-smooth, strongly reflective. The F1-car-as-jewel look:
  // silhouette comes from the reflections sliding across the body, so it reads
  // best against the bright line field.
  obsidian: {
    label: 'Obsidian',
    roughness: 0.10,
    metalness: 0.45,
    clearcoat: 0.85,
    clearcoatRoughness: 0.04,
    envMapIntensity: 0.55,
  },

  // Brushed dark metal. Broad, soft highlights; no tight specular. The least
  // distracting of the three against a busy line field.
  matte: {
    label: 'Matte metallic',
    roughness: 0.65,
    metalness: 0.70,
    clearcoat: 0.0,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.40,
  },

  // Polished automotive paint over metal -- the classic car-commercial finish.
  // Sharp env reflections plus a clear coat on top.
  glossy: {
    label: 'Glossy metallic',
    roughness: 0.22,
    metalness: 0.60,
    clearcoat: 0.85,
    clearcoatRoughness: 0.06,
    envMapIntensity: 0.75,
  },
}

export const FINISH_NAMES = Object.keys(FINISHES)

export const DEFAULT_FINISH = 'obsidian'
