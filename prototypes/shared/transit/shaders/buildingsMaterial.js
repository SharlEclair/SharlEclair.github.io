/**
 * Buildings material - the "night city" look (docs/05 §5).
 *
 * WHY THIS EXISTS
 * The original city is a flat violet `MeshBasicMaterial` fill (docs/03 §2): one colour, one
 * opacity. It reads as a solid mass and nothing else. This material keeps the same single draw
 * call, the same geometry and the same `transparent` + `depthWrite: true` behaviour, but shades the
 * mass instead of filling it: near-black building bodies with emissive window grids, lit in the
 * palette's own Yellow-White and Amber. It is the "dark city, lit from inside" look - no map labels,
 * no lighting objects, no textures, no extra draw calls.
 *
 * NO NORMAL ATTRIBUTE, SO THE FACE NORMAL IS RECOVERED IN THE SHADER
 * `public/scene.glb` ships POSITION only (docs/02 §4, verified), so there is no NORMAL to read.
 * `cross(dFdx(worldPos), dFdy(worldPos))` is the geometric face normal, and an extruded footprint is
 * planar per face, so the derivative is exact rather than an approximation. Three r186 is WebGL2-only
 * and carries no derivatives plumbing (`extensions.derivatives` no longer exists in the build),
 * which is correct: WebGL2 enables `GL_OES_standard_derivatives` implicitly for GLSL ES 1.00.
 *
 * THE NaN TRAP (docs/03 §3: "a single NaN vertex makes the GPU discard the entire draw call")
 * A horizontal roof face has `n = (0, 1, 0)`, so `cross(n, up)` is the ZERO vector and normalising
 * it hands a NaN to every term downstream. The tangent is therefore length-guarded, and windows are
 * gated off roofs by `wall`, so the guard is never load-bearing for the look - only for correctness.
 *
 * COLORS COME FROM THE PALETTE, NOT FROM A MIXER
 * Every colour here is a docs/05 §1 entry. The building BODY is `mix(void, violet, massLift)`: both
 * endpoints are palette entries and the slider only blends between them, which is the same licence
 * docs/05 §4 already takes for the search layer ("borrows the palette's own Signature Glow Violet at
 * low alpha"). The lift exists because the void is also the clear colour - a body painted exactly
 * `#151419` would be invisible against the background it stands in front of.
 *
 * DETERMINISM (docs/03 §1)
 * `hash13` is a pure function of world position. There is no clock, no seed and no `Math.random`;
 * the same fragment renders the same window on every machine, and per frame this material's `sync`
 * writes uniforms only.
 *
 * WHY A LATTICE IS NOT ENOUGH, AND WHAT A FACADE ID BUYS (docs/05 §5.4)
 * A single world-aligned grid with one global "fraction of windows lit" reads as wallpaper: every
 * building gets the same grid phase, the same window size, the same storey height and the same
 * density of lit panes, so the city is uniform at exactly the scale the eye is best at noticing.
 * The fix is an identity for the surface being shaded. The payload ships POSITION only, so the id
 * has to come out of what a fragment knows: its world position and its face normal. For a planar
 * extruded wall those give the plane offset and the normal direction, which is a FACADE id - one per
 * wall face, not one per building, and a facade is exactly the granularity a window grid lives at.
 * From that id the shader derives a per-facade column phase, window pitch, storey height, lit share,
 * warm/cool bias and body tone, and then, inside the facade, a per-storey occupancy and a per-pane
 * brightness. Two consequences are deliberate: party walls between terraces share a facade id (they
 * are drawn as one continuous face anyway), and the two visible walls of one block can differ in
 * body tone by the `massVariation` term - which reads as lighting, which is what a facade identity
 * cannot distinguish from the data available.
 */
import * as THREE from 'three';

/**
 * @param {typeof import('../config.js').config} config the live singleton
 * @returns {{ material: THREE.ShaderMaterial, uniforms: Record<string, THREE.IUniform>,
 *            sync: (next: typeof config) => void, setOpacity: (value: number) => void }}
 */
export function createBuildingsMaterial(config) {
  const uniforms = {
    u_massColour: { value: new THREE.Color(config.buildings.massColor) },
    u_liftColour: { value: new THREE.Color(config.buildings.liftColor) },
    u_massLift: { value: config.buildings.massLift },
    u_windowColour: { value: new THREE.Color(config.buildings.windowColor) },
    u_warmColour: { value: new THREE.Color(config.buildings.warmColor) },
    u_windowLit: { value: config.buildings.windowLit },
    u_windowRatio: { value: config.buildings.windowRatio },
    u_warmMix: { value: config.buildings.warmMix },
    u_storeyHeight: { value: config.buildings.storeyHeight },
    u_windowPitch: { value: config.buildings.windowPitch },
    u_windowInset: { value: config.buildings.windowInset },
    u_ambient: { value: config.buildings.ambient },
    u_sunDir: { value: new THREE.Vector3().fromArray(config.buildings.sunDir).normalize() },
    u_sunStrength: { value: config.buildings.sunStrength },
    u_airNear: { value: config.buildings.airNear },
    u_airFar: { value: config.buildings.airFar },
    u_airFloor: { value: config.buildings.airFloor },
    u_windowLodNear: { value: config.buildings.windowLodNear },
    u_windowLodFull: { value: config.buildings.windowLodFull },
    // docs/05 §5.4 - the per-facade / per-storey / per-pane variation.
    u_pitchVariation: { value: config.buildings.pitchVariation },
    u_storeyVariation: { value: config.buildings.storeyVariation },
    u_litSpread: { value: config.buildings.litSpread },
    u_floorDarkShare: { value: config.buildings.floorDarkShare },
    u_paneVariation: { value: config.buildings.paneVariation },
    u_paneGradient: { value: config.buildings.paneGradient },
    u_massVariation: { value: config.buildings.massVariation },
    u_groundFloorHeight: { value: config.buildings.groundFloorHeight },
    u_groundFloorGlow: { value: config.buildings.groundFloorGlow },
    u_opacity: { value: config.buildings.opacityNear }
  };

  const material = new THREE.ShaderMaterial({
    name: 'BuildingsNight',
    uniforms,
    transparent: true,
    // Deliberately NOT additive, and depthWrite stays true: the city is an opaque occluder even at
    // opacity 0, which is the measured behaviour the search layer's `depthTest: false` was written
    // against (docs/03 §5 budget note; HANDOFF trap G32). Changing either would move the frames the
    // search layer draws on top of the invisible city.
    blending: THREE.NormalBlending,
    depthWrite: true,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 u_massColour;
      uniform vec3 u_liftColour;
      uniform float u_massLift;
      uniform vec3 u_windowColour;
      uniform vec3 u_warmColour;
      uniform float u_windowLit;
      uniform float u_windowRatio;
      uniform float u_warmMix;
      uniform float u_storeyHeight;
      uniform float u_windowPitch;
      uniform float u_windowInset;
      uniform float u_ambient;
      uniform vec3 u_sunDir;
      uniform float u_sunStrength;
      uniform float u_airNear;
      uniform float u_airFar;
      uniform float u_airFloor;
      uniform float u_windowLodNear;
      uniform float u_windowLodFull;
      uniform float u_pitchVariation;
      uniform float u_storeyVariation;
      uniform float u_litSpread;
      uniform float u_floorDarkShare;
      uniform float u_paneVariation;
      uniform float u_paneGradient;
      uniform float u_massVariation;
      uniform float u_groundFloorHeight;
      uniform float u_groundFloorGlow;
      uniform float u_opacity;

      varying vec3 vWorld;

      // Pure positional hash. Deterministic across machines, and it needs no seed because the input
      // is already the window's own world cell.
      float hash13(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
      }

      void main() {
        // The face normal, recovered from screen-space derivatives because the payload ships no
        // NORMAL attribute. Exact for a planar face, which every extruded footprint wall is.
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));

        // 1.0 on a vertical wall, 0.0 on a roof. Also the guard that keeps the tangent below away
        // from the degenerate horizontal case.
        float wall = 1.0 - smoothstep(0.35, 0.70, abs(n.y));

        vec3 t = cross(n, vec3(0.0, 1.0, 0.0));
        float tl = length(t);
        // Zero-length guard: a roof face reaches here with tl == 0 and would otherwise divide to NaN.
        vec3 tangent = tl > 1e-4 ? t / tl : vec3(1.0, 0.0, 0.0);

        // FACADE IDENTITY (docs/05 §5.4). The wall's plane offset and the quantised normal direction
        // are constant across one wall face and differ between faces, which is the granularity a
        // window grid lives at. Half-metre quantisation of the offset tolerates the millimetre rounding
        // of the bake without merging neighbours.
        float planeOffset = dot(vWorld, n);
        vec3 facadeSeed = vec3(floor(planeOffset * 2.0), floor(n.x * 3.0 + 7.0), floor(n.z * 3.0 + 11.0));
        float facadeHash = hash13(facadeSeed);

        // A facade has its own window pitch, its own storey height and its own column phase, so two
        // buildings never share a grid. All three are in PHYSICAL units, so a window stays window-sized.
        float facadePitch = u_windowPitch * mix(1.0 - u_pitchVariation, 1.0 + u_pitchVariation,
                                                hash13(facadeSeed + 3.7));
        float facadeStorey = u_storeyHeight * mix(1.0 - u_storeyVariation, 1.0 + u_storeyVariation,
                                                  hash13(facadeSeed + 9.1));
        float phase = hash13(facadeSeed + 21.3) * 4.0;

        vec2 cell = vec2(dot(vWorld, tangent) / max(facadePitch, 0.5) + phase, vWorld.y / max(facadeStorey, 1.0));
        vec2 f = fract(cell);
        float lo = u_windowInset;
        float hi = 1.0 - u_windowInset;

        // SOFT PANE EDGES. A hard step() on a sub-pixel cell is the speckle the LOD fade was written
        // to avoid, and even at full LOD an aliased mullion reads as a jagged line rather than a
        // window. The derivative of the cell index gives one pixel in cell units, which is what the
        // smoothstep uses - the same machinery the face normal already pays for.
        vec2 aa = fwidth(cell);
        float paneX = smoothstep(lo - aa.x, lo + aa.x, f.x) * (1.0 - smoothstep(hi - aa.x, hi + aa.x, f.x));
        float paneY = smoothstep(lo - aa.y, lo + aa.y, f.y) * (1.0 - smoothstep(hi - aa.y, hi + aa.y, f.y));
        float pane = paneX * paneY;

        // Screen-space LOD. As a window cell shrinks toward a pixel it stops being a window and
        // becomes aliasing speckle on a distant facade, which is measurably what happened at the
        // first pitch this shipped with. fwidth(cell) is how fast the cell index changes per pixel,
        // so its reciprocal IS the cell's size in pixels. The max() guard keeps a zero derivative out
        // of the divide. (No backticks in here: this GLSL lives in a template literal - trap G26.)
        vec2 pixelsPerCell = 1.0 / max(fwidth(cell), vec2(1e-5));
        float cellPixels = min(pixelsPerCell.x, pixelsPerCell.y);
        float lod = smoothstep(u_windowLodNear, u_windowLodFull, cellPixels);

        // PER-FACADE LIT SHARE, and this is the term that stops the city reading as one texture: an
        // office tower at 0.6 and a warehouse at 0.08 are both correct, and the spread is a config
        // lever rather than a per-building table.
        float facadeRatio = clamp(u_windowRatio * mix(1.0 - u_litSpread, 1.0 + u_litSpread,
                                                      hash13(facadeSeed + 41.0)), 0.0, 1.0);
        // The ground floor is retail: brighter, and far more likely to be lit than the floors above.
        float ground = 1.0 - smoothstep(u_groundFloorHeight * 0.6, u_groundFloorHeight, vWorld.y);
        facadeRatio = mix(facadeRatio, clamp(facadeRatio + 0.5, 0.0, 1.0), ground * wall);

        vec2 cellId = floor(cell);
        // PER-STOREY OCCUPANCY: whole floors go dark, which is what an office building at night
        // actually looks like. Keyed on the storey index AND the facade, so the dark floors are not
        // the same storey on every building.
        float storeyOpen = 1.0 - step(hash13(vec3(cellId.y, facadeHash * 37.0, 5.3)), u_floorDarkShare);
        // PER-PANE brightness, so a lit floor is a row of rooms rather than a row of identical lamps.
        float paneGain = mix(1.0 - u_paneVariation, 1.0 + u_paneVariation, hash13(vec3(cellId, 7.7)));
        // A lit ceiling inside the pane: the top of a window is brighter than its sill.
        float paneGrad = mix(1.0 - u_paneGradient, 1.0 + u_paneGradient, f.y);

        float lit = step(1.0 - facadeRatio, hash13(vec3(cellId, facadeHash * 53.0)));
        float warm = step(1.0 - u_warmMix, hash13(vec3(cellId, 17.0) + facadeSeed));
        vec3 paneColour = mix(u_windowColour, u_warmColour, warm);
        float windows = pane * lit * storeyOpen * paneGain * paneGrad * wall * lod * u_windowLit;

        // A directional TERM, not a light: docs/05 §2 bans light objects, and this is arithmetic in
        // the fragment shader that never enters the scene graph. It is what gives the mass its
        // faceted read and stops the city from being a flat silhouette. The per-facade tone on top of
        // it is deliberately small - it is the difference between two buildings of the same age and
        // material, not a colour change.
        float sun = max(dot(n, normalize(u_sunDir)), 0.0);
        float massTone = mix(1.0 - u_massVariation, 1.0 + u_massVariation, hash13(facadeSeed + 57.1));
        vec3 mass = mix(u_massColour, u_liftColour, u_massLift) * (u_ambient + u_sunStrength * sun) * massTone;

        // Distance falloff so far facades lose their windows first, the way aerial haze reads.
        float air = 1.0 - smoothstep(u_airNear, u_airFar, length(cameraPosition - vWorld));
        windows *= mix(u_airFloor, 1.0, air);

        // A lit window is emissive, so it takes the same aerial falloff; the ground-floor band is a
        // wider, softer light and keeps a little of itself at distance. It is multiplied by the pane
        // mask (with a floor) so it reads as a row of lit shopfronts behind glass rather than as a
        // glowing ribbon painted across the base of every building.
        vec3 shopfront = paneColour * ground * u_groundFloorGlow * wall * (0.3 + 0.7 * pane)
          * mix(u_airFloor * 2.0, 1.0, air);
        vec3 colour = mass + paneColour * windows + shopfront;

        // Non-premultiplied alpha, matching the MeshBasicMaterial this replaces: Three's default
        // transparent blend is src * srcAlpha + dst * (1 - srcAlpha), so the colour must NOT be
        // pre-multiplied here or the city would darken as it fades instead of dissolving.
        gl_FragColor = vec4(colour, u_opacity);
        #include <colorspace_fragment>
      }
    `
  });

  const applied = {
    massColor: '',
    liftColor: '',
    massLift: Number.NaN,
    windowColor: '',
    warmColor: '',
    windowLit: Number.NaN,
    windowRatio: Number.NaN,
    warmMix: Number.NaN,
    storeyHeight: Number.NaN,
    windowPitch: Number.NaN,
    windowInset: Number.NaN,
    ambient: Number.NaN,
    sunDir: '',
    sunStrength: Number.NaN,
    airNear: Number.NaN,
    airFar: Number.NaN,
    airFloor: Number.NaN,
    windowLodNear: Number.NaN,
    windowLodFull: Number.NaN,
    pitchVariation: Number.NaN,
    storeyVariation: Number.NaN,
    litSpread: Number.NaN,
    floorDarkShare: Number.NaN,
    paneVariation: Number.NaN,
    paneGradient: Number.NaN,
    massVariation: Number.NaN,
    groundFloorHeight: Number.NaN,
    groundFloorGlow: Number.NaN
  };

  /**
   * Push config into the uniforms. Values are compared before assignment so a GUI drag or a CDP
   * preset injection still allocates nothing per frame (docs/08 Step 3 determinism checklist).
   *
   * @param {typeof config} next
   */
  function sync(next) {
    const b = next.buildings;

    if (applied.massColor !== b.massColor) {
      uniforms.u_massColour.value.set(b.massColor);
      applied.massColor = b.massColor;
    }
    if (applied.liftColor !== b.liftColor) {
      uniforms.u_liftColour.value.set(b.liftColor);
      applied.liftColor = b.liftColor;
    }
    if (applied.massLift !== b.massLift) {
      uniforms.u_massLift.value = b.massLift;
      applied.massLift = b.massLift;
    }
    if (applied.windowColor !== b.windowColor) {
      uniforms.u_windowColour.value.set(b.windowColor);
      applied.windowColor = b.windowColor;
    }
    if (applied.warmColor !== b.warmColor) {
      uniforms.u_warmColour.value.set(b.warmColor);
      applied.warmColor = b.warmColor;
    }
    if (applied.windowLit !== b.windowLit) {
      uniforms.u_windowLit.value = b.windowLit;
      applied.windowLit = b.windowLit;
    }
    if (applied.windowRatio !== b.windowRatio) {
      uniforms.u_windowRatio.value = b.windowRatio;
      applied.windowRatio = b.windowRatio;
    }
    if (applied.warmMix !== b.warmMix) {
      uniforms.u_warmMix.value = b.warmMix;
      applied.warmMix = b.warmMix;
    }
    if (applied.storeyHeight !== b.storeyHeight) {
      uniforms.u_storeyHeight.value = Math.max(b.storeyHeight, 0.1);
      applied.storeyHeight = b.storeyHeight;
    }
    if (applied.windowPitch !== b.windowPitch) {
      uniforms.u_windowPitch.value = Math.max(b.windowPitch, 0.1);
      applied.windowPitch = b.windowPitch;
    }
    if (applied.windowInset !== b.windowInset) {
      // Clamped below 0.5 so `lo < hi` can never invert and blank every window.
      uniforms.u_windowInset.value = Math.min(Math.max(b.windowInset, 0), 0.45);
      applied.windowInset = b.windowInset;
    }
    if (applied.ambient !== b.ambient) {
      uniforms.u_ambient.value = b.ambient;
      applied.ambient = b.ambient;
    }
    const sunDir = b.sunDir.join(',');
    if (applied.sunDir !== sunDir) {
      uniforms.u_sunDir.value.fromArray(b.sunDir).normalize();
      applied.sunDir = sunDir;
    }
    if (applied.sunStrength !== b.sunStrength) {
      uniforms.u_sunStrength.value = b.sunStrength;
      applied.sunStrength = b.sunStrength;
    }
    if (applied.airNear !== b.airNear) {
      uniforms.u_airNear.value = b.airNear;
      applied.airNear = b.airNear;
    }
    if (applied.airFar !== b.airFar) {
      uniforms.u_airFar.value = b.airFar;
      applied.airFar = b.airFar;
    }
    if (applied.airFloor !== b.airFloor) {
      uniforms.u_airFloor.value = b.airFloor;
      applied.airFloor = b.airFloor;
    }
    if (applied.windowLodNear !== b.windowLodNear) {
      uniforms.u_windowLodNear.value = b.windowLodNear;
      applied.windowLodNear = b.windowLodNear;
    }
    if (applied.windowLodFull !== b.windowLodFull) {
      // Kept above `windowLodNear` so the smoothstep can never invert and switch windows OFF up close.
      uniforms.u_windowLodFull.value = Math.max(b.windowLodFull, b.windowLodNear + 1e-3);
      applied.windowLodFull = b.windowLodFull;
    }
    if (applied.pitchVariation !== b.pitchVariation) {
      // Below 1.0 so a facade's pitch can never collapse to zero and divide the lattice to infinity.
      uniforms.u_pitchVariation.value = Math.min(Math.max(b.pitchVariation, 0), 0.85);
      applied.pitchVariation = b.pitchVariation;
    }
    if (applied.storeyVariation !== b.storeyVariation) {
      uniforms.u_storeyVariation.value = Math.min(Math.max(b.storeyVariation, 0), 0.85);
      applied.storeyVariation = b.storeyVariation;
    }
    if (applied.litSpread !== b.litSpread) {
      // A spread >= 1 would drive a facade's lit share negative; the shader clamps to [0, 1] anyway,
      // but the uniform is bounded here so the GUI cannot ask for a meaningless value.
      uniforms.u_litSpread.value = Math.min(Math.max(b.litSpread, 0), 1);
      applied.litSpread = b.litSpread;
    }
    if (applied.floorDarkShare !== b.floorDarkShare) {
      uniforms.u_floorDarkShare.value = Math.min(Math.max(b.floorDarkShare, 0), 1);
      applied.floorDarkShare = b.floorDarkShare;
    }
    if (applied.paneVariation !== b.paneVariation) {
      uniforms.u_paneVariation.value = Math.min(Math.max(b.paneVariation, 0), 0.95);
      applied.paneVariation = b.paneVariation;
    }
    if (applied.paneGradient !== b.paneGradient) {
      uniforms.u_paneGradient.value = Math.min(Math.max(b.paneGradient, 0), 0.95);
      applied.paneGradient = b.paneGradient;
    }
    if (applied.massVariation !== b.massVariation) {
      uniforms.u_massVariation.value = Math.min(Math.max(b.massVariation, 0), 0.9);
      applied.massVariation = b.massVariation;
    }
    if (applied.groundFloorHeight !== b.groundFloorHeight) {
      // Guarded above zero: the ground-floor band divides into the smoothstep's edges.
      uniforms.u_groundFloorHeight.value = Math.max(b.groundFloorHeight, 0.5);
      applied.groundFloorHeight = b.groundFloorHeight;
    }
    if (applied.groundFloorGlow !== b.groundFloorGlow) {
      uniforms.u_groundFloorGlow.value = b.groundFloorGlow;
      applied.groundFloorGlow = b.groundFloorGlow;
    }
  }

  /**
   * The fade, written by the render path every frame (docs/03 §2). Kept separate from `sync` because
   * it is progress-driven, not config-driven.
   *
   * The value is mirrored onto `material.opacity`. A `ShaderMaterial` has no `opacity` of its own,
   * and this fade is a documented observable that `artifacts/step2/capture.mjs` and
   * `artifacts/step3/capture.mjs` read back off the material - so a look change must not be able to
   * make the fade invisible to an audit. It is informational only; the render itself reads the
   * uniform.
   *
   * @param {number} value opacity at the current `u_progress`
   */
  function setOpacity(value) {
    uniforms.u_opacity.value = value;
    material.opacity = value;
  }

  return { material, uniforms, sync, setOpacity };
}
