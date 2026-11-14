/**
 * The one mutable configuration singleton (docs/04 §1) and its lil-gui rig.
 *
 * Everything the animation can be tuned by lives here, is mutated in place, and is exposed to the
 * browser as `window.__CONFIG` (docs/07 §2) so a headless harness can inject a preset before a
 * capture. Nothing in this module reads the clock, the DOM, or the scroll position.
 *
 * Consumer contract, so the runtime never has to guess:
 *   cameraPoints[0..3] : docs/04 §2 - exactly four `THREE.Vector3` control points,
 *                        Start -> Mid-Ascent -> High-Angle -> Birdseye. Edited live by the GUI and
 *                        re-splined by src/scene/camera-rig.js the frame after they change.
 *   targetX/Y/Z        : docs/04 §3 - the camera lookAt target, never hardcoded at the call site.
 *   colours            : docs/05 §1 - the palette is closed; these five hexes are the only ones.
 */
import * as THREE from 'three';
import GUI from 'lil-gui';

/** docs/05 §1 (five) + §6 (water and land). Inventing a colour outside this object is a breach. */
export const PALETTE = Object.freeze({
  void: '#120510', // Background - near-black desert night with a plum cast (reference frame_0001)
  violet: '#7055D9', // Signature Violet - reserved for the Albert Park circuit
  street: '#B8431C', // Unvisited street network - dark crimson / burnt umber, drawn at ~5-10 %
  pulseCore: '#FFF8D6', // Winning path core - white-hot
  pulseAmber: '#FF9900', // Winning path glow - golden amber
  // --- the burning-paper-edge search (reference frames 0010-0040) ---
  frontierHot: '#FFF6CC', // newly relaxed edge - incandescent white-yellow
  frontierGold: '#FFB800', // the leading perimeter - vivid gold
  ember: '#7A2600', // visited interior - dim burnt-orange filigree
  flashWash: '#2E0E24', // completion flash - deep plum / magenta atmospheric wash
  plum: '#5A2850', // building / landmark lift under the ember light
  // docs/05 §6 - the ground. Both are NIGHT values, not daylight ones: at night a river is dark slate,
  // not blue, and a park is near-black green. They separate from the void (#151419) by tone and a slight
  // hue shift, which is what makes water readable without breaking the "computational atelier" palette.
  water: '#160B1C', // Water - dark plum slate
  land: '#120A0B' // Park / ground cover - near-black umber
});

/**
 * docs/11 - the search layer's per-frame debug report size. The probe returns every active frontier
 * node, and a busy middle of the search has ~90 open nodes; this bounds the array so a runaway
 * configuration cannot make a dense sweep expensive.
 */
export const MAX_FRONTIER_REPORT = 256;

/**
 * Upper bound on the search layer's own quad count, as a load-time budget (docs/11 §8): one quad per
 * traced node, one per SEGMENT of each examined road's real polyline, and one per path revision. The
 * current bake needs 491 + 3,258 + 148 = 3,897, so this is ~5x headroom for a longer corridor, and the
 * load fingerprint refuses to ship a layer that breaks it - an unnoticed trace growth would otherwise
 * become an unnoticed fill-cost regression.
 */
export const MAX_SEARCH_QUADS = 20000;

/**
 * docs/04 §2: four control points named for the shot they describe.
 * The baked scene is Y-up with metres as units: the anchor is (0, 0, 0), RMIT sits at z ≈ -2218 and
 * Albert Park at z ≈ +2148, so the flight runs from -z to +z while the camera climbs.
 *
 * These are the Step 2 values, left exactly as verified and deliberately NOT re-authored. The
 * framing problem was solved at the aim point instead of by moving the path (`config.guide`, Step 4),
 * so this spline still reproduces the camera positions the Step 2/3 harnesses recorded: a single
 * fixed `lookAt` point lost the pulse head in 15 of 21 sampled frames because the head travels 4.4 km
 * in z and 1.2 km in x during a 3 km climb, while `guide.amount = 0.95` frames it in 21 of 21
 * (HANDOFF.md §9, docs/08 §Plan changes).
 */
const CAMERA_POINT_SPEC = [
  { label: 'Start', xyz: [0, 55, -2950] }, // low, just past the RMIT end, looking down the route
  { label: 'Mid-Ascent', xyz: [520, 420, -1500] }, // rising over the CBD core
  { label: 'High-Angle', xyz: [980, 1250, 250] }, // east of the corridor, route below
  // Framing tweak (prototype): the original endpoint [-250, 2950, 2050] sat directly over the park, so
  // with a fixed aim the circuit fell under the bottom edge. The flight now carries on south and a
  // little higher so the final frame holds the whole route AND the circuit loop.
  { label: 'Birdseye', xyz: [-250, 3300, 4100] }
];

export const config = {
  palette: { ...PALETTE },

  buildings: {
    /**
     * Which building look ships (docs/05 §5). Both honour the same documented fade, the same single
     * draw call and the same `depthWrite: true` occlusion, so this is a look switch and nothing else.
     *   'void'  - the original flat fill: one `MeshBasicMaterial` colour at the progress-driven
     *             opacity (docs/03 §2 as originally written, kept selectable so the change is
     *             reversible from the GUI rather than only from git).
     *   'night' - the dark-city ShaderMaterial in `src/shaders/buildingsMaterial.js`: near-black
     *             masses with emissive windows, lit in the palette's Yellow-White and Amber.
     */
    look: 'night',
    /** 'void' look fill colour. Unused by 'night', which shades the mass instead of filling it. */
    color: PALETTE.violet,
    opacityNear: 0.8, // docs/03 §2: opacity at u_progress = 0.0
    opacityFar: 0.0, // ...and at u_progress = 1.0
    /**
     * docs/03 §2 window. Interpolating 0.8 -> 0.0 across the whole runway leaves the city almost
     * half faded by mid-flight, so the fade is held off until the drone is committed to the climb
     * and completes before the birdseye. At u = 1.0 the opacity is exactly `opacityFar` = 0.0 and
     * nothing in the render path ever raises it again, so the city cannot return.
     */
    fadeStart: 0.15,
    fadeEnd: 0.72,

    // --- 'night' look (docs/05 §5). Every colour below is a docs/05 §1 palette entry. ---
    /** Windowless side of a facade. Exactly the void, so a dark mass matches the sky it stands in. */
    massColor: PALETTE.void,
    /**
     * The body is `mix(massColor, liftColor, massLift)`. Both endpoints are palette entries and the
     * slider only blends between them, which is the same licence docs/05 §4 takes for the search
     * layer. It is needed at all because the void is also the clear colour: a body painted exactly
     * `#151419` would be invisible against the background it stands in front of.
     */
    liftColor: PALETTE.plum,
    massLift: 0.05,
    /** A lit window. The palette's own Yellow-White, as §1 assigns to the pulse head. */
    windowColor: PALETTE.pulseCore,
    /** The share of lit windows that go warm instead of cool (the palette's Amber). */
    warmColor: PALETTE.pulseAmber,
    warmMix: 0.4,
    /** Emissive gain on a lit pane. */
    windowLit: 1.05,
    /**
     * Fraction of windows that are lit at all. The rest read as dark glass - this is the parameter
     * that makes a facade read as "mostly empty offices at night" rather than a fairground, and it is
     * the single biggest lever on how close the city sits to the reference night basemap.
     */
    windowRatio: 0.2,
    /**
     * Storey height and window pitch in METRES, so a window is one physical size on every building
     * regardless of its footprint. These were tuned UP from 3.2 / 2.6 after looking at a render: at
     * the finer pitch the mid-distance buildings aliased into a moire of speckle rather than reading
     * as windows.
     */
    storeyHeight: 4.2,
    windowPitch: 5.0,
    /** Fraction of each cell left as wall, per axis. Clamped below 0.5 in the shader. */
    windowInset: 0.24,
    /** Flat mass term: 1.0 means an unlit wall shows the body colour unattenuated. */
    ambient: 1.0,
    /**
     * Direction of the facade-shading TERM. This is not a `THREE.DirectionalLight` (docs/05 §2 bans
     * light objects) - it is a `dot(normal, sunDir)` in the fragment shader and never enters the
     * scene graph. It is what facets the mass and stops the city reading as one flat silhouette.
     *
     * The Y component is deliberately small: at 0.72 the term lit every ROOF, and since a roof has no
     * windows it turned each building top into a bright violet lid. A near-horizontal direction shades
     * the walls and leaves the roofs dark, which is what the reference does.
     */
    sunDir: [0.8, 0.22, 0.45],
    sunStrength: 0.45,
    /** Aerial falloff in metres: windows fade between `airNear` and `airFar`. */
    airNear: 500,
    airFar: 3200,
    /**
     * How much of its window brightness a facade keeps at full distance. Kept low on purpose: a far
     * building should lose its windows and settle into a dark mass, both because that is what aerial
     * haze does and because it is the cheapest cure for distant window aliasing.
     */
    airFloor: 0.04,
    /**
     * Screen-space LOD on the window lattice, in PIXELS of a window cell. Below `windowLodNear` a
     * cell is smaller than a pixel and the window fades out; at `windowLodFull` it is fully drawn.
     *
     * This is the cure for distant window aliasing, and it is measured rather than assumed: before it
     * existed the mid-flight frames showed a distant speckle that read as noise rather than as
     * windows, and no amount of pitch tuning removed it because the problem is the sampling rate, not
     * the window size.
     */
    windowLodNear: 1.5,
    windowLodFull: 4.0,

    // --- Per-facade variation (docs/05 §5.4) -----------------------------------------------------
    /**
     * A global window grid with one global "fraction lit" reads as wallpaper, because every facade
     * gets the same phase, pitch, storey height and density. These terms give each FACADE (one wall
     * face, identified from its plane offset and normal in the shader - the payload ships no ids) its
     * own grid and its own occupancy. Every value below is a spread around the corresponding global
     * one, and 0 restores the uniform look exactly.
     */
    /** +/- fraction on `windowPitch`: two buildings do not share a window size. */
    pitchVariation: 0.12,
    /** +/- fraction on `storeyHeight`: a warehouse and an office have different floor-to-floor. */
    storeyVariation: 0.1,
    /**
     * +/- fraction on `windowRatio` per facade. This is the single most visible term: it is what puts a
     * bright tower and a dark warehouse in the same frame instead of an even film of lit rooms.
     */
    litSpread: 0.55,
    /** Share of STOREYS that go dark entirely, keyed on storey index + facade. */
    floorDarkShare: 0.18,
    /** +/- brightness on a single pane, so a lit floor is rooms, not a row of identical lamps. */
    paneVariation: 0.35,
    /** Brightness gradient inside one pane: >0 is a lit ceiling, <0 a lit sill. Clamped to +/-0.95. */
    paneGradient: 0.25,
    /**
     * +/- brightness on the building body per facade. Deliberately small: it is the difference
     * between two buildings of the same age, not a colour change, and the two visible walls of one
     * block can differ slightly, which reads as lighting.
     */
    massVariation: 0.08,
    /** Height of the retail band at the base of a facade, in metres. */
    groundFloorHeight: 5,
    /** Extra emission on that band: shopfronts stay lit when the offices above them are dark. */
    groundFloorGlow: 0.45
  },

  /**
   * docs/05 §6 - the ground layer: the Yarra, Albert Park Lake, the ponds, the parks and the Albert Park
   * circuit. ONE mesh, ONE draw call; the three layers are separated by the per-vertex `aLayer`
   * attribute the ETL baked (docs/01 §3), never by a primitive per layer.
   */
  ground: {
    /** Park / ground cover. Near-black green, so it separates from the void by tone, not by brightness. */
    landColor: PALETTE.land,
    /** Water: the Yarra, the lake and the ponds. */
    waterColor: PALETTE.water,
    /**
     * The circuit. Deliberately the palette's own Amber: the circuit is the DESTINATION, and amber is
     * the colour the project already gives to the answer, so the venue and the route agree.
     */
    circuitColor: PALETTE.violet,
    landAlpha: 0.85,
    waterAlpha: 0.95,
    /**
     * The circuit reads as a highlighted ring over the streets it is made of, so it is nearly opaque —
     * it has to sit ON the road strips (which are baked at y = 0.25 / 0.50) rather than beside them.
     */
    circuitAlpha: 0.0, // the baked circuit layer is degenerate; scene/circuit.js draws the real one
    /**
     * Layer ids. These MIRROR the bake (`scripts/bake_ground.py` LAYER_*) and are an ETL contract, not a
     * tunable: they are the per-vertex values already written into `src/data/ground.js`, so changing one
     * here would not relabel the geometry, it would make the shader select the wrong band. Deliberately
     * absent from the GUI for the same reason `search.viewportHeight` is.
     */
    layerPark: 0,
    layerWater: 1,
    layerCircuit: 2,
    /**
     * The ground does NOT fade to zero with the city. The finale is the arrival at Albert Park, so the
     * city dissolves and what is left is the lake and the circuit the flight was always heading for.
     */
    opacityNear: 1.0,
    opacityFar: 0.55,
    fadeStart: 0.25,
    fadeEnd: 0.9
  },

  /**
   * docs/05 §7 - real Melbourne landmarks as hero masses: the Arts Centre spire, the cathedrals, the
   * arenas, the library, the museum. Real OSM footprints at their real heights, baked beside the payload
   * by `scripts/bake_landmarks.py` -> `src/data/landmarks.js`.
   */
  landmarks: {
    /** Base of a landmark mass. The void, so the layer starts from the same darkness as the city. */
    baseColor: PALETTE.void,
    /**
     * Lifted toward the signature violet by MUCH more than the city's 0.035: that difference is what
     * makes a landmark read as a landmark instead of as another anonymous prism.
     */
    liftColor: PALETTE.plum,
    lift: 0.14,
    /** The top of a tall landmark brightens toward this, so a spire tip is the brightest thing here. */
    crownColor: PALETTE.pulseAmber,
    crownMix: 0.3,
    /** World height in metres over which the vertical gradient completes. */
    crownHeight: 60,
    /**
     * Wall and roof gains for the derivative face shading. Measured need, not decoration: at equal gains a
     * wide low landmark (the museum, an arena) renders as a FLAT slab, because its roof fills the frame
     * and nothing distinguishes it from its walls. Setting them apart is what gives the mass its form.
     */
    wallGain: 1.1,
    roofGain: 0.18,
    opacityNear: 1.0,
    opacityFar: 0.3,
    fadeStart: 0.2,
    fadeEnd: 0.85,

    /**
     * docs/05 §7.1 - the ONE procedural landmark: the Arts Centre spire. Every value here describes
     * the LOOK of a lofted surface of revolution whose shape is baked (`scripts/bake_landmarks.py`
     * SPIRE_PROFILE, measured off a reference photograph and anchored to the real 15 m podium roof and
     * the 162 m tip). Nothing in this block moves the geometry; the lattice and the light show are
     * carved in the shader, so the whole structure stays one mesh and one draw call.
     *
     * `lowColor`/`highColor` are the palette's Violet and Amber, `waveColor` its Yellow-White: the
     * light show cannot invent a hue (docs/05 §1).
     */
    spire: {
      /**
       * Colour at the skirt: the palette's Amber. The real structure is a whitish steel cage whose
       * flared skirt carries the lamps and a gold mesh, so the skirt is the warm end.
       */
      lowColor: PALETTE.pulseAmber,
      /** Colour of the mast and the needle: the palette's Yellow-White, i.e. steel under its own light. */
      highColor: PALETTE.pulseCore,
      /**
       * The travelling band's colour and the answer to "changing colours": the palette's Signature
       * Violet sweeps up the structure as the scroll advances, which is what the real spire's
       * programmable light show does - and it is the project's own colour doing it.
       */
      waveColor: PALETTE.frontierGold,
      /** Fraction of the height over which skirt colour becomes mast colour. */
      gradient: 0.35,
      /** Emission gain. The spire is lit from inside by its own lamps, so it reads at 4 km. */
      gain: 1.15,
      /** Vertical ribs around the shaft. */
      ribs: 16,
      ribWidth: 0.28,
      /** The diamond web, in metres of arc and height. */
      diamondPitch: 4.5,
      diamondWidth: 0.16,
      /** Horizontal rings, in metres of height. */
      ringPitch: 7.5,
      ringWidth: 0.18,
      /**
       * The dense net over the flared skirt, where the real structure carries its 14,000 lamps. Fine
       * enough that at distance it reads as a membrane and up close as a mesh.
       */
      netPitch: 0.9,
      netWidth: 0.06,
      /** Fraction of the spire's height below which the net is drawn. */
      netEnd: 0.32,
      /** The light show: a band of `waveColor` travelling UP the spire as `u_progress` advances. */
      waveCycles: 2.0,
      waveSpeed: 4.0,
      waveWidth: 0.12,
      waveGain: 0.85
    }
  },

  roads: {
    color: PALETTE.street, // docs/05 §1 core strip: Dim Amber, effectively opaque
    glowColor: PALETTE.ember, // the wider 16 m strip underneath
    /**
     * Base alpha of the glow strip. Low on purpose: 17.02% of the Roads glow region is covered
     * >= 2x by legitimately distinct streets (HANDOFF.md §7), and additive blending cannot
     * attenuate an overlap. This number *is* the blow-out control - the decision the user
     * authorized by the user (HANDOFF.md §10; docs/08 §Plan changes).
     */
    glowAlpha: 0.045,
    /**
     * Alpha of the 6 m core strip. The shader premultiplies and then blends additively, so the visible
     * weight is alpha squared: 0.3 puts the idle network at ~9 % - the reference's ultra-faint grid.
     */
    coreOpacity: 0.3
  },

  apath: {
    coreColor: PALETTE.pulseCore, // docs/05 §1 pulse head: Yellow-White
    amberColor: PALETTE.pulseAmber, // docs/05 §1 trail: Bright Amber
    glowColor: PALETTE.pulseAmber, // outer 26 m strip's bloom colour
    pulseWidth: 0.02, // half-width of the bright head, in arc-length (vUv.x) units, docs/03 §3
    trailOpacity: 1.9, // HDR gain of the white-hot core strip (bloom threshold is ~1.0)
    /**
     * The 26 m bloom strip's two shares, and they are what separate "explored" from "unexplored" on the
     * route. `glowBaseAlpha` is the faint background glow the UNEXPLORED route still carries - it exists so
     * the viewer can see where the route is going, and it was reduced from 0.1 because at 0.1 the whole
     * route read as pre-drawn before the search had reached it. `trailGlowAlpha` is what the EXPLORED route
     * carries: it is now the dominant term, so the bloom follows the pulse instead of anticipating it.
     */
    glowBaseAlpha: 0.0,
    trailGlowAlpha: 0.4,
    /** Extra HDR gain the route carries at the peak of the completion flash. */
    flashGain: 0.9
  },

/**
 * docs/11 - the search-trace replay.
 *
 * The animation replays one real A* execution that the ETL ran offline
 * (`scripts/astar_trace.py` -> `src/data/astar-trace.js`). `u_progress` is search time, NOT distance
 * along the final route: it maps onto the baked event sequence, the search freezes when the goal
 * settles, and the winner is reconstructed backwards from the goal over its recorded predecessor
 * chain. Nothing here selects, generates or interpolates a route.
 *
 * THERE IS NO PER-CANDIDATE TABLE. The old fields - `count`, `routeCount`, `poolOrder`,
 * `candidates[].rate/.hold/.delay`, `ribbonWidth`, `exploreEdge` - described precomputed candidate
 * routes revealed at different rates. They are removed rather than renamed: a "rate" or a "hold"
 * would be a claim about a search that does not have one. Every control below is a function of the
 * baked trace or a pure look tunable.
 */
search: {
  /**
   * `u` at which the replay reaches the recorded goal event. The whole search is compressed into this
   * window, and the remaining 1 - replayEnd is the reconstruction.
   *
   * It is NOT `goalSettledFrame / frameCount`. The trace's final event is the goal's own pop, so those
   * two coincide on this graph and the search would then occupy the entire scroll range - leaving no
   * runway at all for the predecessor-chain walk, which would be squeezed into the last frame. The
   * search converges at 0.86 and the reconstruction runs 0.86 -> 1.0.
   */
  replayEnd: 0.8,
  /**
   * u at which the replay STARTS (prototype tweak). With the camera's aim fixed (guide.amount = 0) the
   * first third of the flight looks over the city, away from where the search begins, so a replay that
   * started at u = 0 burned most of its fire off screen. Before this point the scene is the idle
   * network, the two endpoint glows and the circuit. 0 restores the original timing.
   */
  replayStart: 0.34,
  /** `u` at which the predecessor chain starts being revealed backwards from the goal. */
  freezeEnd: 0.8,
  /**
   * Floor on the reconstruction front, as a route arc-length fraction (docs/11 §9).
   *
   * The camera frames only the route's second half - measured on-screen window [0.47, 1.00] throughout
   * the finale - so a front that walked the recorded chain all the way to 0 carried the answer off
   * screen: the route measured 429 px at u = 0.9 and 0 px at u >= 0.95, leaving the reconstruction and
   * its discharge on route that was not drawn. This keeps the front inside the visible window.
   *
   * The disclosed cost: the answer is drawn as its visible second half rather than the whole polyline.
   * Set it to 0 to get the complete chain walk back at the price of an unlit finale.
   */
  minRouteReveal: 0,
  /**
   * The optimal-route wipe: how much of u the winner takes to run from the goal back to the start.
   * Short on purpose - the path is revealed as part of the flash, not as a second act.
   */
  wipeSpan: 0.05,
  /** How much of u the explored network takes to clear once the goal settles (near-instant). */
  clearSpan: 0.012,
  /**
   * How far AHEAD of `u_progress` the camera aims while the search runs, in `u` units.
   *
   * Until this existed the search's aim simply reused `config.guide.lead`, which meant the two could not
   * be tuned apart: the lead that frames the search well is not necessarily the lead that frames the
   * route, and the camera gates are the thing most easily broken by moving the aim. Defaults to the same
   * value `guide.lead` ships with, so the camera behaves exactly as verified until it is moved.
   */
  aimLead: 0.05,
  /** Height of the search layer. Clear of the roads core (y=0.50) and the route core (y=1.00). */
  y: 0.7,
  /** Half-width of an examined-road ribbon, in metres. */
  edgeWidth: 4.5,
  /** Screen-space floor on an examined road's half-width, in drawing-buffer pixels. */
  edgeMinPixels: 1.6,
  /** HDR gains of the three temperature bands of an examined road. */
  hotGain: 3.4,
  goldGain: 2.6,
  emberGain: 2.2,
  /**
   * The accumulated explored network. `trailAlpha` is an examined road's alpha right behind the
   * frontier being examined and `settledFade` is how much of it remains once the search has moved on,
   * so the explored region reads as a persistent trace that grows rather than a flash.
   */
  trailAlpha: 1.0,
  settledFade: 0.45,
  /**
   * Frontier band, expressed in EVENTS and converted to frames at load. A node is BRIGHTEST right after
   * it is discovered and decays across this band - it is the falloff, not a cull. The brief's "several
   * directions compete" is a property of the algorithm, not of an art choice, so every node the search
   * holds open is drawn (see `frontierFloor`).
   */
  frontierBandEvents: 26,
  /**
   * The floor a frontier point's brightness decays to, as a fraction of `dotAlpha`. Every node the
   * algorithm holds open is drawn - that is what "open" means - so this is what keeps a long-lived
   * candidate visible instead of hiding it. Measured before this existed: at `u = 0.5` the probe
   * reported 64 open nodes and the shader drew 6, because the band's `(1 - age)` reached exactly 0.
   */
  frontierFloor: 0.22,
  /** How long an examined road stays at full brightness, also in events. */
  examineHoldEvents: 110,
  /**
   * Path revisions (docs/11 §4.2b). A* re-parenting an already-discovered node onto a cheaper
   * connection is one of the algorithm's most characteristic behaviours and the one thing a static
   * route drawing cannot show, so each of the trace's revisions gets its own bright beam: flat for
   * 
evisionHoldEvents, then eased out over 
evisionFadeEvents, after which the ordinary explored
   * road keeps the corridor lit.
   */
  revisionHoldEvents: 10,
  revisionFadeEvents: 26,
  revisionAlpha: 0.9,
  /** White-hot amber: a revision is the search's own "this got better" signal (docs/05 §4). */
  revisionColour: PALETTE.frontierHot,
  /**
   * Frontier point profile, in METRES (world-sized, so it attenuates with distance on its own).
   * `dotCoreRadius` is the hot centre, `dotBeamRadius` the soft violet halo. `coreMix` blends the
   * core toward the palette's Yellow-White and stays below half way so the point remains
   * violet-dominated (docs/05 §4). The acceptance criterion is SCREEN-space and is measured by
   * `artifacts/search/frontier-footprint.mjs`.
   */
  dotCoreRadius: 2.6,
  dotBeamRadius: 8,
  coreMix: 0.9,
  dotAlpha: 1.3,
  /**
   * Screen-space floor on a frontier point's radius, in pixels of the drawing buffer. The metre
   * radius above is the right size while the drone is low, but the last third of the flight climbs to
   * a 3 km birdseye where an 11 m disc is under a pixel and the frontier would vanish. This floor is
   * what keeps the subject legible at every altitude; the metre radius wins whenever it is larger.
   */
  minPixelRadius: 3,
  /**
   * Drawing-buffer height in pixels, written by the render path on every resize (src/engine.js).
   * It is the other half of the metres-per-pixel conversion above; it is NOT a user tunable and is
   * deliberately absent from the GUI.
   */
  viewportHeight: 800,
  /** Alpha of a settled node's persistent trace, as a fraction of a frontier point's. */
  settledAlpha: 0.05,
  /**
   * How much a better `f` brightens a frontier point: the frame's live best `f` is the brightest, and
   * a node `priorityRange` metres worse sits at 1. This is the one place `f` drives the picture, which
   * is what makes the search look goal-directed rather than uniform.
   */
  priorityBoost: 2.2,
  priorityRange: 900,
  /** Once the reconstruction starts, the explored network steps back to this share of its alpha. */
  settleFactor: 0.7,
  /** Venue colour: violet reads as the search layer against the amber/white solution (docs/05 §3). */
  colour: PALETTE.frontierGold,
  coreColour: PALETTE.frontierHot,
  emberColour: PALETTE.ember,
  /**
   * The discharge on the route (docs/03 §5). It rides the reconstructed part of the route and travels
   * backwards along it, so the strike and the reconstruction are the same gesture.
   */
  flashStart: 0.8,
  flashSpan: 0.13,
  flashPeak: 1.0,
  flickers: 3,
  residual: 0.3
},

  camera: {
    fov: 50,
    near: 5,
    far: 20000 // the AOI is ~5.6 km across and the birdseye sits 3 km up
  },

  /**
   * docs/04 §3 - where the camera looks.
   *
   * `targetX/Y/Z` remains the manually art-directed aim point that the GUI edits. `guide` blends
   * that aim point toward the route's own centreline near `u_progress`, which is what keeps the pulse
   * in shot: the head travels 4.4 km in z and 1.2 km in x while the camera climbs only 3 km, so a
   * single fixed aim point loses it for most of the flight (measured: the head was inside the frame
   * in just 6 of 21 sampled frames). `amount = 0` reproduces the fixed-target behaviour exactly.
   *
   * This is still one value per frame derived from `u_progress` - no clock, no extra state - and the
   * route samples come from the baked GLB, not from a hand-authored curve.
   */
  guide: {
    /** 0 = pure targetX/Y/Z, 1 = aim at the route point at `u_progress + lead`. */
    amount: 0,
    /**
     * Aim this far ahead of the pulse, in u units, so the head sits low in the frame - and, as
     * measured while fixing the trajectory shake, so the view axis stops grazing the world up axis.
     *
     * At `lead = 0` the High-Angle -> Birdseye leg passes within 1.08 deg of nadir with the aim only
     * 37.9 m off the camera's ground track, which leaves `lookAt`'s roll hypersensitive: up to
     * 1.53 deg of image rotation per PIXEL of scroll (a ~30-74 deg whip per 100 px wheel notch), even
     * with the aim interpolated. Aiming ahead raises the tilt and cuts the rate roughly 4x. Measured
     * 0.05: 0.37 deg/px and 34 deg per notch, with the pulse head still >= 240 px inside every frame
     * (docs/10 §7 F2; the value sits inside the measured viable window 0.04-0.06).
     */
    lead: 0.05
  },

  /** docs/04 §2 - the four control points, as live `THREE.Vector3` instances. */
  cameraPoints: CAMERA_POINT_SPEC.map((spec) => new THREE.Vector3(...spec.xyz)),

  /** docs/04 §3 - lookAt target (the zero-centre anchor, as verified in Step 2). */
  targetX: 0,
  targetY: 0,
  targetZ: 0,

  /**
   * Finale framing (prototype tweak, guide.amount stays 0): the fixed aim eases south across the last
   * part of the flight so the final frame holds the whole route AND the circuit. Set aimZ to targetZ
   * to switch it off.
   */
  finale: { aimZ: 1750, start: 0.56, end: 0.96 },

  /**
   * The Albert Park circuit (scene/circuit.js): the real track centreline, rebuilt from the cached OSM
   * data, drawn as a glowing ribbon plus a vertical light curtain so it reads topographically from a
   * low angle and as a neon loop from the birdseye.
   */
  circuit: {
    colour: PALETTE.violet,
    hotColour: '#B7A2FF',
    halfWidth: 9,
    /** Height of the light curtain, in metres. */
    wallHeight: 26,
    /** HDR gain at rest, and at full reveal. */
    gainNear: 0.3,
    gainFar: 0.95,
    revealStart: 0.42,
    revealEnd: 0.8,
    /** The lapping light: laps completed across the whole scroll, and its HDR gain. */
    laps: 5,
    chaseGain: 2.0,
    chaseWidth: 0.045,
    minPixels: 1.1
  },

  /** Start and destination markers: soft radial amber-gold point glows (reference frame_0001). */
  endpoints: {
    colour: PALETTE.frontierGold,
    coreColour: PALETTE.frontierHot,
    pixelRadius: 26,
    gain: 2.4
  },

  /** HDR post-processing (post.js): bloom + the completion flash's plum wash + grade. */
  post: {
    bloomStrength: 0.7,
    bloomRadius: 0.62,
    bloomThreshold: 0.92,
    /** Extra bloom strength at the peak of the flash. */
    flashBloom: 0.55,
    /** Peak of the plum wash. The reference's is roughly double this; the brief asks for a calmer flash. */
    flashWash: 1.15,
    washColour: PALETTE.flashWash,
    exposure: 1.0,
    vignette: 0.42
  }
};

/**
 * Mount the live control panel. The GUI mutates `config` in place; no callbacks are needed because
 * the render path re-reads config every frame and re-splines the camera only when it changed.
 *
 * @param {typeof config} target the singleton to drive
 * @returns {GUI} the panel, so callers can destroy it in tests
 */
export function createGui(target = config) {
  const gui = new GUI({ title: 'Transit Desert' });

  const palette = gui.addFolder('palette (docs/05)');
  palette.addColor(target.palette, 'void').name('void / background');
  palette.addColor(target.palette, 'violet').name('violet / signature');
  palette.addColor(target.palette, 'street').name('street / inactive');
  palette.addColor(target.palette, 'pulseCore').name('pulse core');
  palette.addColor(target.palette, 'pulseAmber').name('pulse amber');
  // docs/05 §6 - the ground's two additions to the palette. Kept in this folder with the rest so the
  // closed-set rule stays visible: there are still only these seven, and nothing samples a colour
  // from anywhere else.
  palette.addColor(target.palette, 'water').name('water (docs/05 §6)');
  palette.addColor(target.palette, 'land').name('land / park (docs/05 §6)');

  const buildings = gui.addFolder('buildings');
  // The look switch (docs/05 §5). Switching between 'night' and 'void' only swaps which material the
  // Buildings mesh carries; both keep the same fade, the same draw call and the same occlusion.
  buildings.add(target.buildings, 'look', ['night', 'void']).name('look (docs/05 §5)');
  buildings.add(target.buildings, 'opacityNear', 0, 1, 0.01).name('opacity @ u=0');
  buildings.add(target.buildings, 'opacityFar', 0, 1, 0.01).name('opacity @ u=1');
  buildings.add(target.buildings, 'fadeStart', 0, 1, 0.01).name('fade start (u)');
  buildings.add(target.buildings, 'fadeEnd', 0, 1, 0.01).name('fade end (u)');
  const night = buildings.addFolder('night look');
  // 'void' look only: the flat fill colour, still a palette entry.
  const voidFill = night.addColor(target.buildings, 'color').name('flat fill (void look)');
  voidFill.domElement.title =
    'The original MeshBasicMaterial fill. Only used when look is set to "void"; the night look shades the mass instead of filling it.';
  night.addColor(target.buildings, 'massColor').name('mass (unlit wall)');
  night.addColor(target.buildings, 'liftColor').name('mass lift toward');
  night.add(target.buildings, 'massLift', 0, 1, 0.01).name('mass lift');
  night.addColor(target.buildings, 'windowColor').name('window (cool)');
  night.addColor(target.buildings, 'warmColor').name('window (warm)');
  night.add(target.buildings, 'warmMix', 0, 1, 0.01).name('warm share');
  night.add(target.buildings, 'windowLit', 0, 3, 0.05).name('window gain');
  night.add(target.buildings, 'windowRatio', 0, 1, 0.01).name('windows lit');
  night.add(target.buildings, 'storeyHeight', 1, 8, 0.1).name('storey height (m)');
  night.add(target.buildings, 'windowPitch', 0.8, 8, 0.1).name('window pitch (m)');
  night.add(target.buildings, 'windowInset', 0, 0.45, 0.01).name('window inset');
  night.add(target.buildings, 'ambient', 0, 2, 0.05).name('ambient mass');
  night.add(target.buildings, 'sunStrength', 0, 2, 0.05).name('facade shading');
  night.add(target.buildings, 'airNear', 100, 4000, 10).name('haze near (m)');
  night.add(target.buildings, 'airFar', 500, 8000, 10).name('haze far (m)');
  night.add(target.buildings, 'airFloor', 0, 1, 0.01).name('haze floor');
  night.add(target.buildings, 'windowLodNear', 0, 8, 0.1).name('window LOD off (px)');
  night.add(target.buildings, 'windowLodFull', 0, 12, 0.1).name('window LOD full (px)');
  // docs/05 §5.4 - the terms that make one facade differ from the next. All spreads around the
  // globals above, so 0 on every one of them restores the uniform lattice.
  const variation = night.addFolder('per-facade variation');
  variation.add(target.buildings, 'pitchVariation', 0, 0.85, 0.01).name('window pitch +/-');
  variation.add(target.buildings, 'storeyVariation', 0, 0.85, 0.01).name('storey height +/-');
  variation.add(target.buildings, 'litSpread', 0, 1, 0.01).name('lit share +/-');
  variation.add(target.buildings, 'floorDarkShare', 0, 1, 0.01).name('dark storeys');
  variation.add(target.buildings, 'paneVariation', 0, 0.95, 0.01).name('pane brightness +/-');
  variation.add(target.buildings, 'paneGradient', -0.95, 0.95, 0.01).name('pane gradient');
  variation.add(target.buildings, 'massVariation', 0, 0.9, 0.01).name('body tone +/-');
  variation.add(target.buildings, 'groundFloorHeight', 0.5, 20, 0.5).name('retail band (m)');
  variation.add(target.buildings, 'groundFloorGlow', 0, 2, 0.05).name('retail glow');
  variation.close();
  night.close();
  buildings.close();

  const ground = gui.addFolder('ground (docs/05 §6)');
  ground.addColor(target.ground, 'landColor').name('park colour');
  ground.addColor(target.ground, 'waterColor').name('water colour');
  ground.addColor(target.ground, 'circuitColor').name('circuit colour');
  ground.add(target.ground, 'landAlpha', 0, 1, 0.01).name('park alpha');
  ground.add(target.ground, 'waterAlpha', 0, 1, 0.01).name('water alpha');
  ground.add(target.ground, 'circuitAlpha', 0, 1, 0.01).name('circuit alpha');
  // The ground fade is its own curve on purpose: it must NOT reach zero, because the finale is the
  // arrival at the lake and the circuit (docs/05 §6).
  ground.add(target.ground, 'opacityNear', 0, 1, 0.01).name('fade @ u=0');
  ground.add(target.ground, 'opacityFar', 0, 1, 0.01).name('fade @ u=1');
  ground.add(target.ground, 'fadeStart', 0, 1, 0.01).name('fade start (u)');
  ground.add(target.ground, 'fadeEnd', 0, 1, 0.01).name('fade end (u)');
  ground.close();

  const landmarksFolder = gui.addFolder('landmarks (docs/05 §7)');
  landmarksFolder.addColor(target.landmarks, 'baseColor').name('base colour');
  landmarksFolder.addColor(target.landmarks, 'liftColor').name('lift toward');
  landmarksFolder.add(target.landmarks, 'lift', 0, 1, 0.01).name('lift');
  landmarksFolder.addColor(target.landmarks, 'crownColor').name('crown colour');
  landmarksFolder.add(target.landmarks, 'crownMix', 0, 1, 0.01).name('crown mix');
  landmarksFolder.add(target.landmarks, 'crownHeight', 5, 200, 1).name('crown height (m)');
  landmarksFolder.add(target.landmarks, 'wallGain', 0, 2, 0.05).name('wall gain');
  landmarksFolder.add(target.landmarks, 'roofGain', 0, 2, 0.05).name('roof gain');
  landmarksFolder.add(target.landmarks, 'opacityNear', 0, 1, 0.01).name('fade @ u=0');
  landmarksFolder.add(target.landmarks, 'opacityFar', 0, 1, 0.01).name('fade @ u=1');
  landmarksFolder.add(target.landmarks, 'fadeStart', 0, 1, 0.01).name('fade start (u)');
  landmarksFolder.add(target.landmarks, 'fadeEnd', 0, 1, 0.01).name('fade end (u)');
  // docs/05 §7.1 - the procedural spire's look. The profile itself is baked and deliberately absent:
  // a control here can only carve the lattice or paint the light show, never move the geometry.
  const spireFolder = landmarksFolder.addFolder('spire (procedural, docs/05 §7.1)');
  spireFolder.addColor(target.landmarks.spire, 'lowColor').name('skirt colour');
  spireFolder.addColor(target.landmarks.spire, 'highColor').name('needle colour');
  spireFolder.addColor(target.landmarks.spire, 'waveColor').name('light-show colour');
  spireFolder.add(target.landmarks.spire, 'gradient', 0.05, 1.5, 0.01).name('gradient height');
  spireFolder.add(target.landmarks.spire, 'gain', 0, 4, 0.05).name('emission gain');
  spireFolder.add(target.landmarks.spire, 'ribs', 3, 64, 1).name('ribs');
  spireFolder.add(target.landmarks.spire, 'ribWidth', 0, 2, 0.01).name('rib width (m)');
  spireFolder.add(target.landmarks.spire, 'diamondPitch', 0.2, 12, 0.05).name('web pitch (m)');
  spireFolder.add(target.landmarks.spire, 'diamondWidth', 0, 1, 0.01).name('web width (m)');
  spireFolder.add(target.landmarks.spire, 'ringPitch', 0.5, 24, 0.1).name('ring pitch (m)');
  spireFolder.add(target.landmarks.spire, 'ringWidth', 0, 1, 0.01).name('ring width (m)');
  spireFolder.add(target.landmarks.spire, 'netPitch', 0.15, 3, 0.01).name('net pitch (m)');
  spireFolder.add(target.landmarks.spire, 'netWidth', 0, 0.6, 0.005).name('net width (m)');
  spireFolder.add(target.landmarks.spire, 'netEnd', 0, 1, 0.01).name('net height (fraction)');
  spireFolder.add(target.landmarks.spire, 'waveCycles', 0.25, 12, 0.05).name('light bands');
  spireFolder.add(target.landmarks.spire, 'waveSpeed', 0, 8, 0.05).name('light travel (per u)');
  spireFolder.add(target.landmarks.spire, 'waveWidth', 0.01, 0.6, 0.005).name('light band width');
  spireFolder.add(target.landmarks.spire, 'waveGain', 0, 1, 0.01).name('light mix');
  spireFolder.close();
  landmarksFolder.close();

  const roads = gui.addFolder('roads');
  roads.addColor(target.roads, 'color').name('core colour');
  roads.addColor(target.roads, 'glowColor').name('glow colour');
  roads.add(target.roads, 'coreOpacity', 0, 1, 0.01).name('core alpha');
  roads.add(target.roads, 'glowAlpha', 0, 0.5, 0.005).name('glow alpha (blow-out)');

  const apath = gui.addFolder('A* path');
  apath.addColor(target.apath, 'coreColor').name('pulse head colour');
  apath.addColor(target.apath, 'amberColor').name('trail colour');
  apath.addColor(target.apath, 'glowColor').name('bloom colour');
  apath.add(target.apath, 'pulseWidth', 0.002, 0.2, 0.001).name('pulse half-width');
  apath.add(target.apath, 'trailOpacity', 0, 6, 0.01).name('trail alpha (core)');
  apath.add(target.apath, 'glowBaseAlpha', 0, 0.5, 0.005).name('bloom base alpha');
  apath.add(target.apath, 'trailGlowAlpha', 0, 2, 0.005).name('trail alpha (glow)');

  const search = gui.addFolder('A* search replay (docs/11)');
  search.add(target.search, 'replayEnd', 0, 1, 0.005).name('replay end (u, goal settled)');
  search.add(target.search, 'freezeEnd', 0, 1, 0.005).name('freeze end (u, reconstruction)');
  search.add(target.search, 'minRouteReveal', 0, 1, 0.01).name('route reveal floor');
  search.add(target.search, 'settleFactor', 0, 1, 0.01).name('explored dim (final phase)');
  search.add(target.search, 'frontierBandEvents', 1, 200, 1).name('frontier band (events)');
  search.add(target.search, 'frontierFloor', 0, 1, 0.01).name('frontier floor (min alpha)');
  search.add(target.search, 'revisionHoldEvents', 1, 100, 1).name('revision hold (events)');
  search.add(target.search, 'revisionFadeEvents', 1, 200, 1).name('revision fade (events)');
  search.add(target.search, 'revisionAlpha', 0, 2, 0.05).name('revision alpha');
  search.add(target.search, 'examineHoldEvents', 1, 200, 1).name('road exam hold (events)');
  search.add(target.search, 'edgeWidth', 1, 12, 0.5).name('road ribbon half-width (m)');
  search.add(target.search, 'trailAlpha', 0, 1, 0.01).name('examined road alpha');
  search.add(target.search, 'settledFade', 0, 1, 0.01).name('settled road fade');
  search.add(target.search, 'settledAlpha', 0, 1, 0.01).name('settled node alpha');
  search.add(target.search, 'priorityBoost', 0, 6, 0.05).name('priority boost (lower f)');
  search.add(target.search, 'priorityRange', 50, 4000, 10).name('priority range (m of f)');
  search.add(target.search, 'dotBeamRadius', 4, 60, 0.5).name('frontier beam radius (m)');
  search.add(target.search, 'dotCoreRadius', 0.5, 12, 0.25).name('frontier core radius (m)');
  search.add(target.search, 'coreMix', 0, 1, 0.01).name('frontier core mix (white)');
  search.add(target.search, 'dotAlpha', 0, 6, 0.05).name('frontier alpha');
  search.add(target.search, 'minPixelRadius', 0, 16, 0.5).name('frontier pixel floor (px)');
  search.add(target.search, 'y', 0.55, 2, 0.05).name('height (m)');
  // The two colours the layer actually paints with, separately controllable: `colour` is the search's
  // own violet (examined roads + settled trace + frontier points) and `revisionColour` is the
  // Yellow-White the cheaper-path revisions flash in. `coreColour` is the hot centre inside a frontier
  // point, blended in by `coreMix` - which is why `coreMix` is a control and not a hardcoded constant.
  search.addColor(target.search, 'colour').name('search colour');
  search.addColor(target.search, 'coreColour').name('frontier core colour');
  search.addColor(target.search, 'revisionColour').name('revision beam colour');
  const aimLead = search.add(target.search, 'aimLead', -0.2, 0.2, 0.005).name('aim lead (u)');
  // Moving the aim is what the camera gate is most sensitive to: `lead = 0` reintroduces the near-nadir
  // grazing that made the view axis roll-sensitive, and a large lead aims into empty sky. The control is
  // here because it changes what is ON SCREEN, but the tooltip says what it costs.
  aimLead.domElement.title =
    'How far ahead of the replay the camera aims. The verified value is 0.05; 0 reintroduces the near-nadir roll sensitivity documented in docs/10, and a large value aims at empty sky (npm run verify:camera gates this).';
  search.close();

  const strobe = gui.addFolder('discharge (docs/03 §5)');
  strobe.add(target.search, 'flashStart', 0.5, 1, 0.005).name('flash start (u)');
  strobe.add(target.search, 'flashSpan', 0.01, 0.3, 0.005).name('flash span (u)');
  strobe.add(target.search, 'flashPeak', 0, 4, 0.05).name('flash peak');
  strobe.add(target.search, 'flickers', 1, 6, 1).name('strobe flickers');
  strobe.add(target.search, 'residual', 0, 0.6, 0.01).name('flash residual');
  strobe.close();

  const camera = gui.addFolder('camera');
  camera.add(target.camera, 'fov', 10, 100, 1).name('fov');
  camera.add(target.camera, 'near', 0.1, 500, 0.1).name('near');
  camera.add(target.camera, 'far', 1000, 60000, 100).name('far');
  target.cameraPoints.forEach((point, index) => {
    const folder = camera.addFolder(`${index} · ${CAMERA_POINT_SPEC[index].label}`);
    folder.add(point, 'x', -4000, 4000, 1).name('x');
    folder.add(point, 'y', 0, 6000, 1).name('y');
    folder.add(point, 'z', -4000, 4000, 1).name('z');
  });

  const lookAt = gui.addFolder('lookAt (docs/04 §3)');
  lookAt.add(target, 'targetX', -3000, 3000, 1).name('targetX');
  lookAt.add(target, 'targetY', -500, 3000, 1).name('targetY');
  lookAt.add(target, 'targetZ', -3000, 3000, 1).name('targetZ');
  lookAt.add(target.guide, 'amount', 0, 1, 0.01).name('follow route');
  lookAt.add(target.guide, 'lead', -0.2, 0.2, 0.005).name('follow lead (u)');

  const ember = gui.addFolder('burning edge + flash');
  ember.add(target.search, 'hotGain', 0, 8, 0.05).name('frontier white-hot gain');
  ember.add(target.search, 'goldGain', 0, 6, 0.05).name('frontier gold gain');
  ember.add(target.search, 'emberGain', 0, 3, 0.05).name('visited ember gain');
  ember.add(target.search, 'edgeMinPixels', 0, 3, 0.05).name('edge pixel floor');
  ember.add(target.search, 'wipeSpan', 0.005, 0.2, 0.005).name('route wipe span (u)');
  ember.add(target.search, 'clearSpan', 0.001, 0.1, 0.001).name('grid clear span (u)');
  ember.add(target.apath, 'flashGain', 0, 4, 0.05).name('route flash gain');
  ember.add(target.post, 'bloomStrength', 0, 3, 0.01).name('bloom strength');
  ember.add(target.post, 'bloomRadius', 0, 1.2, 0.01).name('bloom radius');
  ember.add(target.post, 'bloomThreshold', 0, 2, 0.01).name('bloom threshold');
  ember.add(target.post, 'flashBloom', 0, 2, 0.01).name('flash bloom lift');
  ember.add(target.post, 'flashWash', 0, 4, 0.01).name('flash plum wash');
  ember.add(target.post, 'vignette', 0, 1, 0.01).name('vignette');
  ember.add(target.post, 'exposure', 0.2, 2.5, 0.01).name('exposure');

  const circuit = gui.addFolder('Albert Park circuit');
  circuit.addColor(target.circuit, 'colour').name('colour');
  circuit.add(target.circuit, 'gainNear', 0, 4, 0.05).name('gain (early)');
  circuit.add(target.circuit, 'gainFar', 0, 6, 0.05).name('gain (finale)');
  circuit.add(target.circuit, 'wallHeight', 0, 120, 1).name('curtain height (m)');
  circuit.add(target.circuit, 'laps', 0, 20, 0.5).name('chase laps');
  circuit.add(target.circuit, 'chaseGain', 0, 8, 0.1).name('chase gain');

  return gui;
}
