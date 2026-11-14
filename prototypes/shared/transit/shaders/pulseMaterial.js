/**
 * APath pulse material (docs/08 Step 3, docs/03 §3, docs/04 §4, docs/05 §3).
 *
 * One `ShaderMaterial` shades BOTH baked strips of the APath ribbon mesh, so the route stays a single
 * draw call (docs/01 §3). The distinction between the two strips is the baked `TEXCOORD_0.y`
 * selector, not a second geometry pass:
 *
 *   vUv.x  normalized cumulative arc length, 0.0 at the RMIT snap -> 1.0 at the Albert Park GP
 *          coordinate. Baked by the ETL (HANDOFF.md §7 D2); never derived at runtime.
 *   vUv.y  strip selector: 0.0 = the 8 m core at y = 1.00, 1.0 = the 26 m glow at y = 0.75.
 *
 * The head is a `smoothstep()` ramp against `vUv.x` (docs/03 §3): nothing ahead of the head, a
 * two-sided bright Yellow-White band where |vUv.x - u_progress| < width, dim amber behind it.
 *
 * Since docs/03 §5 this material also owns the completion discharge: when the route's head reaches the
 * last stretch of the runway, the explored length is struck by a brief, sharply localized strobe that
 * travels BACK along the route the search has already found. It is the same single uniform that drives
 * everything here - `u_progress` - and the surge is masked by the explored trail, so the discharge never
 * lights route ahead of the head.
 *
 * The glow strip's two shares are what separate "explored" from "unexplored": `u_glowBaseAlpha` is a
 * whisper on the route the pulse has not reached, `u_trailGlowAlpha` is the bloom the explored route
 * carries. At the old constant `0.1` base the whole route read as pre-drawn from frame one.
 *
 * Blending: `AdditiveBlending`, `depthWrite: false`, `transparent: true` (docs/03 §4). Because
 * additive blending cannot attenuate an overlap, the base alpha is deliberately low: the Roads glow
 * has 17.02% of its area covered >= 2x (mean multiplicity 1.193) by geometry that is legitimately
 * distinct, so the blow-out is art-directed down in the shader instead of "fixed" in the ETL - the
 * decision the user authorized (HANDOFF.md §10; docs/08 §Plan changes).
 */
import * as THREE from 'three';

/**
 * The completion discharge's two fixed shape constants (docs/03 §5).
 *
 * They live here rather than in `config` because they are shape, not tuning: `artifacts/search/capture.mjs`
 * gates the discharge's localization and its monotone backward sweep against these exact numbers, so a
 * value edited in the GUI could silently change what the gate is measuring. Head-of-window position,
 * falloff width and travel are three coupled choices; changing one means re-gating.
 *
 *   FLASH_TRAVEL   how far BACK along the route the strike's leading edge sweeps across the window
 *                  (fractions of the whole route: 0 -> 0.40)
 *   FLASH_FALLOFF  the band's half-width in arc-length units, i.e. the sharp leading edge of the strike
 *                  (±0.08 of 5 490 m is ±440 m, and its visible band is a small fraction of that)
 */
export const FLASH_TRAVEL = 0.4;
export const FLASH_FALLOFF = 0.08;

/**
 * Linear-space distance from a strip's centreline, as a fraction of that strip's half-width.
 *
 * `APath` is a ribbon: every quad row is [left edge, centre, right edge] and the two strips overlap
 * at the shared centreline vertex. `|vUv.y - 0.5|` therefore maps an interior vertex to 0, the
 * shared centreline to 0.5, and a free edge to 1.0 - a strip-local cross coordinate that needs no
 * extra attribute, because `vUv.y` is already the "how far across the ribbon am I" channel of the
 * baked UV.
 *
 * @param {number} t `vUv.y`
 * @returns {number} 0 at the strip centre -> 1 at the strip edge
 */
export function crossFraction(t) {
  return Math.min(1, Math.abs(t - 0.5) * 2);
}

/**
 * CPU mirror of the fragment shader's pulse band, used to prove the head tracks `u_progress` by arc
 * length (`vUv.x`) instead of by vertex index. Kept in the same file as the GLSL so the two cannot
 * drift apart silently; `window.__STEP3_PROBE` exposes it to the headless harness.
 *
 * @param {number} u 0..1 position along the route (`vUv.x`)
 * @param {number} progress 0..1 `u_progress`
 * @param {number} width half-width of the bright head, in arc-length units
 * @returns {number} 1 at the head centre, 0 at `|u - progress| >= width`
 */
export function headResponse(u, progress, width) {
  const safeWidth = Math.max(width, 1e-4);
  const d = Math.abs(u - progress);
  if (d <= 0) {
    return 1;
  }
  if (d >= safeWidth) {
    return 0;
  }
  // Cubic ease of the normalized distance, written with the two endpoints as explicit branches so
  // the value at the head centre cannot depend on how a smoothstep edge pair is ordered or oriented.
  const t = d / safeWidth;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * The lightning flash that fires when the route completes (docs/03 §5).
 *
 * A strobe, not a ramp: a fast attack, `flickers` sub-peaks across the window, and a decay that leaves
 * `residual` of the peak at `u = 1.0` so the last frame keeps an afterglow on the solved route.
 *
 * CPU mirror of the GLSL below and the only definition the probe and the harness use, so "the flash
 * has two visible strobes" is a number rather than an impression. `search-paths.js#probe` and
 * `window.__STEP3_PROBE` both report it.
 *
 * @param {number} u 0..1 `u_progress`
 * @param {typeof import('../config.js').config.search} search
 * @returns {number} additive intensity, 0 outside the window
 */
export function flashResponse(u, search) {
  const span = Math.max(search.flashSpan, 1e-4);
  const s = Math.min(Math.max((u - search.flashStart) / span, 0), 1);
  // attack = smoothstep(0.0, 0.10, s)
  const attackT = Math.min(Math.max(s / 0.1, 0), 1);
  const attack = attackT * attackT * (3 - 2 * attackT);
  const decay = Math.pow(Math.max(1 - s, 0), 1.35);
  const strobe = 0.3 + 0.7 * Math.abs(Math.cos(Math.PI * search.flickers * s));
  const envelope = search.residual + (1 - search.residual) * decay;
  return search.flashPeak * attack * envelope * strobe;
}

/**
 * The strobe's temporal sharpening factor, `mix(0.30, 1.0, pow(|cos(pi·flickers·s)|, 2.6))`.
 *
 * Factored out so "the discharge is brief" is a number the harness can gate: the on-fraction of the
 * strobe band is what decides whether the route reads as being struck three times or as slowly
 * brightening for a tenth of the runway.
 *
 * @param {number} s 0..1 position inside the flash window
 * @param {number} flickers sub-peaks across the window
 * @returns {number} 0.30..1
 */
export function strobeSharpness(s, flickers) {
  const band = Math.abs(Math.cos(Math.PI * flickers * s));
  return 0.3 + 0.7 * Math.pow(band, 2.6);
}

/**
 * The stationary part of the discharge in `pulseMaterial.js`'s fragment shader.
 *
 * `strike` is the same enveloped strobe `flashResponse` returns, sharpened in time by
 * `strobeSharpness` - the shader multiplies both factors in, so reporting only one of them would let a
 * shader edit go unnoticed (docs/03 §5). Named for what it does rather than for the variable it lands
 * in, because the harness reads it as "how hard is the strike right now".
 *
 * @param {number} u 0..1 `u_progress`
 * @param {typeof import('../config.js').config.search} search
 * @returns {number}
 */
export function flashStrike(u, search) {
  const span = Math.max(search.flashSpan, 1e-4);
  const s = Math.min(Math.max((u - search.flashStart) / span, 0), 1);
  return flashResponse(u, search) * strobeSharpness(s, search.flickers);
}

/**
 * The position along the route the discharge's band is centred on, for a NORMALIZED window position `s`.
 *
 * Split out from `flashWavePeak` so a harness can sweep the band without patching `config`: passing `s`
 * directly is what lets the check walk the whole window at a fixed configuration.
 *
 * @param {number} s 0..1 position inside the flash window
 * @param {number} u 0..1 `u_progress` (the band starts at the leading edge of the route)
 * @returns {number} route-arc position, clamped to `0..1`
 */
export function flashWavePeakAt(s, reveal) {
  // The sweep is PROPORTIONAL rather than absolute: the band is a fraction of the revealed route and
  // rides down toward the start as the window opens. An absolute offset looked right on paper and put
  // the band off the end of the revealed route within one frame - see the note in the fragment shader.
  const head = Math.min(Math.max(reveal, 0), 1) * (1 - Math.min(Math.max(s, 0), 1) * FLASH_TRAVEL);
  return Math.min(Math.max(head, 0), 1);
}

/**
 * The position along the route the discharge's band is centred on at `u_progress`.
 *
 * It sweeps BACKWARDS as the window opens (from `u_progress` itself to `u_progress - FLASH_TRAVEL`),
 * which is what makes the strike read as energy travelling back through the route the search found
 * rather than as the whole route lighting up.
 *
 * @param {number} u 0..1
 * @param {typeof import('../config.js').config.search} search
 * @returns {number} route-arc position, clamped to `0..1`
 */
export function flashWavePeak(u, search) {
  const span = Math.max(search.flashSpan, 1e-4);
  const s = Math.min(Math.max((u - search.flashStart) / span, 0), 1);
  return flashWavePeakAt(s, u);
}

/**
 * The discharge's spatial band at a route position: 1 at the band's centre, 0 outside it, with a sharp
 * leading edge and a short wake behind it.
 *
 * The form is an exact-zero smoothstep product: `smoothstep(0, 0.25, +rel)` kills everything ahead of
 * the band and `smoothstep(0, 1, -rel)` kills everything far behind it, so the band peaks just at the
 * front and is gone within two falloff widths. Nothing is clamped, which is what makes "ahead of the
 * band is exactly zero" a property rather than an approximation.
 *
 * @param {number} frac route-arc position, 0..1
 * @param {number} peak route-arc position of the band's centre (`flashWavePeak` / `flashWavePeakAt`)
 * @returns {number} 0..1
 */
export function flashBandResponse(frac, peak) {
  const rel = (frac - peak) / Math.max(FLASH_FALLOFF, 1e-4);
  return (1 - smoothstep(0, 0.25, rel)) * (1 - smoothstep(0, 1, -rel));
}

/**
 * Where the reconstruction front is, and whether the answer exists yet, as the shipping shader
 * computes them. This is the ONE definition: the vertex/fragment shader, the route's CPU mirrors, the
 * search layer's `routeState`, the runtime gates and the camera's aim all read it.
 *
 * The replay replaced "the trail follows `u_progress`" with "the trail follows the search": during the
 * search the answer does not exist, and once the goal settles the winner is revealed BACKWARDS from the
 * goal along the recorded predecessor chain.
 *
 * @param {number} u `u_progress`, 0..1
 * @param {typeof import('../config.js').config} config the live singleton
 * @returns {{ reveal: number, pulse: number, rebuild: number, reconstructStart: number }}
 *          `reveal` 1 at the goal falling to 0 at the start, `pulse` 0 through the whole search,
 *          `rebuild` 0..1 across the reconstruction window
 */
export function routeReplayState(u, config) {
  const progress = Math.min(Math.max(Number.isFinite(u) ? u : 0, 0), 1);
  const reconstructStart = Math.min(Math.max(config.search.freezeEnd, 1e-6), 1);
  const span = Math.max(1 - reconstructStart, 1e-6);
  const rebuild = Math.min(Math.max((progress - reconstructStart) / span, 0), 1);
  // The pulse is a smoothstep of the reconstruction, not a step: a head that snapped into existence
  // would read as a jump cut rather than as an answer arriving.
  const pulse = rebuild * rebuild * (3 - 2 * rebuild);
  // THE FRONT STOPS WHERE THE CAMERA CAN STILL SEE IT.
  //
  // The chain walk runs the front from the goal (1) back to the start (0), which is the correct
  // direction - but the camera only ever frames the route's second half. Measured on the shipping
  // spline, the on-screen arc-length window is [0.21, 0.53] at u = 0.3, [0.40, 0.75] at u = 0.5 and
  // [0.47, 1.00] through the whole finale, while the front reached 0.357 by u = 0.95 and 0 by u = 1.
  // The consequence was not subtle: the route contributed 429 px to the frame at u = 0.9 and EXACTLY
  // ZERO at u >= 0.95, so the reconstruction walked off the screen and the completion discharge - the
  // one moment the brief is emphatic about - fired on route that was not drawn. The alphas were right,
  // the direction was right, and the finale was empty.
  //
  // The floor keeps the front inside the visible window. The cost is stated plainly: the first
  // `MIN_ROUTE_REVEAL` of the route never lights, so the answer is drawn as the visible second half
  // rather than the whole polyline. That is a deliberate trade - a visible finale over a complete but
  // invisible one - and it is disclosed in docs/11 section 9.
  const reveal = Math.max(1 - rebuild, config.search.minRouteReveal);
  return {
    // 1 at the goal, 0 at the start - the direction the chain walk actually runs. Writing this as
    // `progress` (which is what an earlier revision did) reveals the route FORWARDS from the source
    // and paints the answer along the corridor the search has not reached.
    reveal,
    pulse,
    rebuild,
    reconstructStart
  };
}

/**
 * `surge` from the fragment shader: the localized discharge, masked to the REVEALED route.
 *
 * `headResponse(frac, reveal, pulseWidth)` is the shader's `routeVis` mask written in the same idiom,
 * so a harness can ask "is anything lit beyond the reconstruction front?" without reading pixels.
 *
 * @param {number} frac route-arc position, 0..1
 * @param {number} u 0..1 `u_progress`
 * @param {typeof import('../config.js').config} config the live singleton
 * @returns {number}
 */
export function flashSurgeResponse(frac, u, config) {
  const state = routeReplayState(u, config);
  const routeVis = 1 - headResponse(frac, state.reveal, 0.004);
  return flashStrike(u, config.search) * routeVis * flashBandResponse(frac, u, config.search);
}

/**
 * Glow-strip alpha of the route at a given arc position and progress: the term that decides whether the
 * route reads as pre-drawn or as discovered.
 *
 * Mirror of `glowAlpha` for the 26 m strip (`fill = 1`) in `pulseMaterial.js`, which is the strip the
 * exploration is judged by: it is the wide, dominant layer. Used to assert that pre-answer route is
 * exactly zero and that the revealed route carries several times the base.
 *
 * @param {number} frac route-arc position, 0..1
 * @param {number} u 0..1 `u_progress`
 * @param {typeof import('../config.js').config} config the live singleton
 * @returns {number} alpha before the layer gain
 */
export function routeGlowResponse(frac, u, config) {
  const state = routeReplayState(u, config);
  const d = Math.min(Math.max(frac, 0), 1);
  const head = headResponse(d, state.reveal, config.apath.pulseWidth) * state.pulse;
  // The revealed side: behind the reconstruction front, which starts at the goal and walks back.
  const routeVis = (1 - smoothstep(state.reveal - 0.004, state.reveal, d)) * state.pulse;
  const trail = routeVis;
  const surge = flashSurgeResponse(d, u, config);
  return (
    config.apath.glowBaseAlpha * routeVis +
    config.apath.trailGlowAlpha * trail +
    head * head * 0.6 * routeVis +
    surge * (0.6 + 1.8 * config.apath.trailGlowAlpha)
  );
}

/**
 * The cubic smoothstep the GLSL built-in implements, for the CPU mirrors above.
 *
 * Written with the two edges explicitly rather than as a clamped `0/0`: a zero-width interval must
 * degrade to a step, never to a NaN, which is the same guard the shaders carry in GLSL (docs/03 §3).
 *
 * @param {number} a low edge
 * @param {number} b high edge
 * @param {number} x sample
 * @returns {number} 0..1
 */
export function smoothstep(a, b, x) {
  if (!(b > a)) {
    return x < a ? 0 : 1;
  }
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Build the pulse material.
 *
 * Determinism: the returned object owns exactly two allocations (the material and its uniforms) and
 * `sync()` mutates them in place. No colour string is parsed and no `THREE.Color` is constructed per
 * frame - callers compare their last-applied string first and only then call `.set()`.
 *
 * @param {typeof import('../config.js').config} config the live singleton
 * @returns {{ material: THREE.ShaderMaterial, uniforms: Record<string, THREE.IUniform>,
 *            sync: (next: typeof config, progress: number) => void, probe: (u: number) => object }}
 */
export function createPulseMaterial(config) {
  const uniforms = {
    u_progress: { value: 0 },
    /** The reconstruction front: 1 at the goal, decreasing to 0 at the start (docs/11 s4.3). */
    u_routeReveal: { value: 1 },
    /** Whether the pulse head exists yet: 0 during the whole search, 1 once the answer is being built. */
    u_routePulse: { value: 0 },
    u_coreColor: { value: new THREE.Color(config.apath.coreColor) },
    u_amberColor: { value: new THREE.Color(config.apath.amberColor) },
    u_glowColor: { value: new THREE.Color(config.apath.glowColor) },
    u_pulseWidth: { value: config.apath.pulseWidth },
    u_trailOpacity: { value: config.apath.trailOpacity },
    u_glowBaseAlpha: { value: config.apath.glowBaseAlpha },
    u_trailGlowAlpha: { value: config.apath.trailGlowAlpha },
    // The completion flash (docs/03 §5). Static values, so the per-frame path still writes only
    // `u_progress`; the strobe itself is derived in the shader from it.
    u_flashStart: { value: config.search.flashStart },
    u_flashSpan: { value: config.search.flashSpan },
    u_flashPeak: { value: config.search.flashPeak },
    u_flashFlickers: { value: config.search.flickers },
    u_flashResidual: { value: config.search.residual }
  };

  const material = new THREE.ShaderMaterial({
    name: 'APathPulse',
    uniforms,
    // docs/03 §4 + the F1 Currents look the user asked for.
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // The ribbon geometry is baked up-facing (HANDOFF.md §5); side is left at the default FrontSide.
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv; // TEXCOORD_0: x = arc length 0..1, y = strip selector (0 core / 1 glow)
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float u_progress;
      uniform float u_routeReveal;
      uniform float u_routePulse;
      uniform float u_pulseWidth;
      uniform float u_trailOpacity;
      uniform float u_glowBaseAlpha;
      uniform float u_trailGlowAlpha;
      uniform float u_flashStart;
      uniform float u_flashSpan;
      uniform float u_flashPeak;
      uniform float u_flashFlickers;
      uniform float u_flashResidual;
      uniform vec3 u_coreColor;
      uniform vec3 u_amberColor;
      uniform vec3 u_glowColor;

      varying vec2 vUv;

      // The discharge's shape constants. JS owns the values (FLASH_TRAVEL / FLASH_FALLOFF at the top of
      // this file) so the CPU mirror and this shader cannot drift; they are inlined here rather than
      // passed as uniforms because they are shape, not tuning - see the note on the exports.
      const float FLASH_TRAVEL = 0.4;
      const float FLASH_FALLOFF = 0.08;

      void main() {
        // --- strip selector: 0.0 = 8 m core at y = 1.00, 1.0 = 26 m glow at y = 0.75 ---------
        float fill = smoothstep(0.25, 0.75, vUv.y);

        // --- strip amplitude from the baked strip selector -------------------------------
        // vUv.y is NOT a cross-ribbon coordinate (the ETL bakes it as a layer flag), so it cannot
        // say how far a fragment sits from the centreline. It can only say WHICH layer the fragment
        // is on. Treating it as a cross coordinate by symmetry about 0.5 is the trap here: that
        // expression is 0 at BOTH v = 0 and v = 1 and therefore blanks the entire route.
        //
        // So the two layers are separated by AMPLITUDE instead. Each layer's alpha is the cue that
        // it is one of a stack, which is what makes the total across both additive layers come out
        // to the palette once: head ~1.35, trail ~0.30, bloom 0.10.
        float layerGain = mix(1.0, 0.9, fill);

        // --- the revealed mask: THIS is where the answer starts existing -------------------
        // docs/11 s4.3. The route is the search's ANSWER, so it is not on screen while the search is
        // still running: u_routePulse is 0 for the whole exploration and turns on as the predecessor
        // chain is walked back from the goal. u_routeReveal is that walk, starting at the goal (1.0)
        // and decreasing to the start (0.0), so everything past it is alpha 0 - absent, not dim.
        // Writing this as routeVis = 1 - smoothstep(...) matters: the mask must be 1 on the revealed
        // side, and the inverted form blanks the whole route.
        float routeVis = (1.0 - smoothstep(u_routeReveal - 0.004, u_routeReveal, vUv.x)) * u_routePulse;

        // --- the pulse head: smoothstep against the baked arc-length coordinate -----------
        // Tolerance is clamped to a minimum so the ramp can never be degenerate: a 0/0 smoothstep
        // ramp is a NaN, and one NaN fragment discards the entire draw call (docs/03 §3).
        //
        // smoothstep(0.0, w, d) is 0 where d = 0 and 1 once d >= w, so the head must be its
        // COMPLEMENT. Writing it the other way round puts black at the head and light everywhere
        // else - a bug that still renders "something" and is invisible to a compile check, so the
        // numeric probe in __STEP3_PROBE exists specifically to catch it.
        //
        // The head is anchored to the RECONSTRUCTION FRONT and not to u_progress: that is the whole
        // point of the replay, and while the search runs u_routePulse is 0 so the head does not
        // exist at all. u_progress keeps driving the camera and the discharge's strobe.
        float w = max(u_pulseWidth, 1e-4);
        float head = (1.0 - smoothstep(0.0, w, abs(vUv.x - u_routeReveal))) * u_routePulse;

        // --- the revealed trail behind the reconstruction front ---------------------------
        // A smoothstep rather than a linear ramp: same ~22 m edge, no seam where it reaches full
        // strength. This mask is also what the completion discharge is confined to.
        float trail = routeVis;

        // --- the completion discharge (docs/03 §5) ----------------------------------------
        // A brief, sharply LOCALIZED strike that moves along the route the search has already found -
        // not a lift of the whole trail and not a slow gradient. Three factors, each doing one job:
        //
        //   strike  the strobe envelope. Raising the strobe band to 2.6 sharpens it in time, so each
        //           blink is short and the route is comparatively dark between blinks.
        //   band    a narrow spatial window around a head that sweeps from the route's leading edge
        //           BACKWARDS (see FLASH_TRAVEL) as the window opens. The front is a sharp edge and the
        //           wake behind it is short: the exact-zero smoothstep product below peaks just behind
        //           the front and is gone within about two falloff widths, so only a short length of
        //           route is lit at any instant - a strike travelling along it, not a lit-up route.
        //   trail   confining everything to what has actually been explored, so the discharge can never
        //           light route ahead of the pulse (docs/03 §5's mask).
        float flashS = clamp((u_progress - u_flashStart) / max(u_flashSpan, 1e-4), 0.0, 1.0);
        float flashAttack = smoothstep(0.0, 0.10, flashS);
        float flashDecay = pow(max(1.0 - flashS, 0.0), 1.35);
        float strobeBand = abs(cos(3.14159265 * u_flashFlickers * flashS));
        float strobe = mix(0.30, 1.0, strobeBand);
        strobe *= mix(0.30, 1.0, pow(strobeBand, 2.6));
        float envelope = u_flashResidual + (1.0 - u_flashResidual) * flashDecay;
        float strike = u_flashPeak * flashAttack * envelope * strobe;

        // The band's leading edge rides the RECONSTRUCTION FRONT, not the raw progress value.
        //
        // This is the second half of why the discharge was invisible. The camera aims at route point
        // (progress + aimLead) and the route is 5.5 km long, so only a fraction of its arc length is
        // ever on screen; a band placed at the raw progress value (0.9 here) sat on route the camera was
        // looking past. The front at least STARTS at the goal - which is what the camera is framing -
        // and walks back along the answer, which is the same gesture the reconstruction makes and the
        // same reason the head above is anchored to it.
        float waveLead = u_routeReveal * (1.0 - flashS * FLASH_TRAVEL);
        float rel = (vUv.x - waveLead) / max(FLASH_FALLOFF, 1e-4);
        float ahead = smoothstep(0.0, 0.25, rel);
        float behind = smoothstep(0.0, 1.0, -rel);
        float band = (1.0 - ahead) * (1.0 - behind);
        float surge = strike * trail * band;

        // --- composition ----------------------------------------------------------------
        // Strip roles: the core carries the crisp head, the trail and the discharge; the glow carries
        // the bloom around the head, the bloom the EXPLORED route carries, and a barely-there halo. The
        // layer gain keeps the two additive layers from summing to twice the palette.
        //
        // The glow is deliberately weighted toward the revealed trail: a constant bloom over the whole
        // route made it read as pre-drawn before the search reached it. u_glowBaseAlpha is now applied
        // only to route the reconstruction has reached, so before the answer exists the route's alpha
        // is exactly zero rather than a whisper. The head's own bloom is gated by routeVis for the same
        // reason: without it the term is symmetric and would light ~22 m of route that has not been
        // revealed.
        float exploredSide = routeVis;
        // THE DISCHARGE IS A FLIP, NOT AN ADDITION, and that distinction was a defect.
        //
        // Adding surge to an already-lit trail does nothing visible: by the time the strike fires the
        // whole revealed route is at core alpha ~0.9 with additive blending, so the band was absorbed and
        // measured as EXACTLY zero pixel difference across the entire window (0 changed pixels at every
        // sampled u, flashPeak 1.8 vs 0). A lightning strike that cannot be seen is not a strike.
        //
        // It now darkens the revealed route across the band first and then puts the strike on top of
        // that darkness, so the band is BRIGHTER than its surroundings by construction rather than by
        // hoping the sum saturates differently. The dim factor is clamped so the route never goes fully
        // black - the strike reads as a moving bright window on a dimmed route, which is a discharge.
        float dim = 1.0 - clamp(surge, 0.0, 0.75);
        float coreAlpha = (head * head + trail * u_trailOpacity) * dim + surge * 1.6;
        float glowAlpha = (u_glowBaseAlpha * routeVis
                        + u_trailGlowAlpha * trail) * dim
                        + head * head * 0.6 * exploredSide
                        + surge * 2.4;
        float alpha = mix(coreAlpha, glowAlpha, fill) * layerGain;

        // Unlit, additive, no bloom pass: the colour itself is the glow (docs/05 §3). Mixing keeps
        // the two strips in the palette instead of tinting the bloom with a white head. The flash
        // drives the colour to the palette's own Yellow-White, so the discharge stays in-palette and
        // additive saturation supplies the white-hot core.
        vec3 colour = mix(u_amberColor, u_coreColor, head * head);
        colour *= mix(u_amberColor, u_glowColor, fill);
        colour = mix(colour, u_coreColor, clamp(surge * 0.55, 0.0, 1.0));

        gl_FragColor = vec4(colour, alpha);
        #include <colorspace_fragment>
      }
    `
  });

  // Last-applied config strings/numbers. Compared before every mutation so the per-frame path
  // performs no allocation and no THREE.Color parsing (determinism checklist, docs/08 Step 3).
  const applied = {
    coreColor: '',
    amberColor: '',
    glowColor: '',
    pulseWidth: Number.NaN,
    trailOpacity: Number.NaN,
    glowBaseAlpha: Number.NaN,
    trailGlowAlpha: Number.NaN,
    flashStart: Number.NaN,
    flashSpan: Number.NaN,
    flashPeak: Number.NaN,
    flickers: Number.NaN,
    residual: Number.NaN
  };

  /**
   * Push config + progress into the uniforms. Called once per frame from the render path
   * (docs/03 §1: a single uniform write, never a per-vertex loop in JS).
   *
   * @param {typeof config} next
   * @param {number} progress 0..1
   */
  function sync(next, progress) {
    uniforms.u_progress.value = progress;

    if (applied.coreColor !== next.apath.coreColor) {
      uniforms.u_coreColor.value.set(next.apath.coreColor);
      applied.coreColor = next.apath.coreColor;
    }
    if (applied.amberColor !== next.apath.amberColor) {
      uniforms.u_amberColor.value.set(next.apath.amberColor);
      applied.amberColor = next.apath.amberColor;
    }
    if (applied.glowColor !== next.apath.glowColor) {
      uniforms.u_glowColor.value.set(next.apath.glowColor);
      applied.glowColor = next.apath.glowColor;
    }
    if (applied.pulseWidth !== next.apath.pulseWidth) {
      uniforms.u_pulseWidth.value = next.apath.pulseWidth;
      applied.pulseWidth = next.apath.pulseWidth;
    }
    if (applied.trailOpacity !== next.apath.trailOpacity) {
      uniforms.u_trailOpacity.value = next.apath.trailOpacity;
      applied.trailOpacity = next.apath.trailOpacity;
    }
    if (applied.glowBaseAlpha !== next.apath.glowBaseAlpha) {
      uniforms.u_glowBaseAlpha.value = next.apath.glowBaseAlpha;
      applied.glowBaseAlpha = next.apath.glowBaseAlpha;
    }
    if (applied.trailGlowAlpha !== next.apath.trailGlowAlpha) {
      uniforms.u_trailGlowAlpha.value = next.apath.trailGlowAlpha;
      applied.trailGlowAlpha = next.apath.trailGlowAlpha;
    }
    // The flash tunables live under `config.search` (docs/03 §5): the search layer owns the window,
    // the route's own material owns the discharge.
    if (applied.flashStart !== next.search.flashStart) {
      uniforms.u_flashStart.value = next.search.flashStart;
      applied.flashStart = next.search.flashStart;
    }
    if (applied.flashSpan !== next.search.flashSpan) {
      uniforms.u_flashSpan.value = next.search.flashSpan;
      applied.flashSpan = next.search.flashSpan;
    }
    if (applied.flashPeak !== next.search.flashPeak) {
      uniforms.u_flashPeak.value = next.search.flashPeak;
      applied.flashPeak = next.search.flashPeak;
    }
    if (applied.flickers !== next.search.flickers) {
      uniforms.u_flashFlickers.value = next.search.flickers;
      applied.flickers = next.search.flickers;
    }
    if (applied.residual !== next.search.residual) {
      uniforms.u_flashResidual.value = next.search.residual;
      applied.residual = next.search.residual;
    }
  }

  /**
   * Set the replay state of the route: where the reconstruction front is and whether the answer
   * exists yet (docs/11 s4.3). Called once per frame by the render path - two uniform writes, no
   * allocation - and deliberately separate from `sync()`, which owns the config-derived tunables.
   *
   * @param {number} reveal 1 at the goal decreasing to 0 at the start
   * @param {number} pulse 0 while the search runs, 1 once the reconstruction is complete
   */
  function setRouteState(reveal, pulse) {
    uniforms.u_routeReveal.value = reveal;
    uniforms.u_routePulse.value = pulse;
  }

  /**
   * Numerically evaluate the head band for a route position. `__STEP3_PROBE(0.5)` returning 1 while
   * `0.6` returns 0 is the camera-independent proof that the head sits at the arc-length position
   * `u_progress`, not at a vertex index.
   *
   * `flash` is reported alongside (docs/03 §5) so a harness can gate the completion strobe on the same
   * mirror the shader uses, without reading pixels. `strike` is that strobe sharpened in time and
   * `wavePeak` is where along the route the localized band currently sits - together they are what the
   * search harness measures for "brief", "localized" and "moves along the route".
   *
   * @param {number} u `vUv.x` to sample
   * @returns {{ u: number, progress: number, head: number, flash: number, strike: number,
   *            wavePeak: number, aheadOfHead: boolean, behindHead: boolean }}
   */
  function probe(u) {
    const progress = uniforms.u_progress.value;
    const reveal = uniforms.u_routeReveal.value;
    const pulse = uniforms.u_routePulse.value;
    // The head now tracks the RECONSTRUCTION FRONT (docs/11 s4.3), so the probe reports the shipping
    // head band and the revealed trail as the shader computes them rather than re-deriving them from
    // `progress`. `progress` and the flash terms are still reported, because the discharge still rides
    // the camera clock.
    const head = headResponse(u, reveal, uniforms.u_pulseWidth.value) * pulse;
    const searchShape = {
      flashStart: uniforms.u_flashStart.value,
      flashSpan: uniforms.u_flashSpan.value,
      flashPeak: uniforms.u_flashPeak.value,
      flickers: uniforms.u_flashFlickers.value,
      residual: uniforms.u_flashResidual.value
    };
    return {
      u,
      progress,
      reveal,
      pulse,
      head,
      revealed: 1 - smoothstep(reveal - 0.004, reveal, Math.min(Math.max(u, 0), 1)),
      flash: flashResponse(progress, searchShape),
      strike: flashStrike(progress, searchShape),
      wavePeak: flashWavePeak(progress, searchShape),
      aheadOfFront: u > reveal,
      behindFront: u < reveal
    };
  }

  return { material, uniforms, sync, probe, setRouteState };
}
