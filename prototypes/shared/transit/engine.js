/**
 * Engine (docs/08 Step 4): owns the renderer, the scene, the camera spline, the single render path
 * and the docs/07 Â§2 test hooks.
 *
 * The whole runtime is one function of one scalar. `renderAt(progress)` is the only thing that ever
 * draws; the rAF loop does nothing but read the scroll-derived progress and call it, so there is no
 * second clock, no elapsed-time term and no state a replay could inherit (docs/03 Â§1).
 *
 * Determinism checklist (docs/08 Step 2, still load-bearing in Step 5):
 *   - `setPixelRatio(1)`, explicit canvas size, `antialias: false`
 *   - `toneMapping = NoToneMapping`, default sRGB output, clear colour = docs/05 void
 *   - no Date.now / performance.now / Math.random / setTimeout-driven animation
 *   - nothing renders before the GLB is loaded, so frame 1 already contains the city (docs/07 Â§1);
 *     the search layer (docs/03 Â§5) is built from the loaded centreline in the same window, so frame 1
 *     contains it too
 *   - per frame the module writes uniforms and opacity only: no geometry, material, attribute,
 *     matrix or vector is allocated inside the loop. The search layer obeys this with static geometry
 *     and per-vertex schedule attributes: its frontiers move inside the shader, never in JS.
 */
import * as THREE from 'three';
import { config, createGui } from './config.js';
import { createCity } from './scene/city.js';
import { createGround } from './scene/ground.js';
import { createLandmarks } from './scene/landmarks.js';
import { createCameraRig } from './scene/camera-rig.js';
import { createSearchLayer } from './scene/search-paths.js';
import { astarTrace } from './data/astar-trace.js';
import {
  flashBandResponse,
  flashStrike,
  flashWavePeak,
  flashWavePeakAt,
  routeGlowResponse,
  routeReplayState
} from './shaders/pulseMaterial.js';
import { createProgress, observeVisibility } from './scroll.js';
import { ROAD_CORE_Y, ROAD_GLOW_Y } from './scene/roads-material.js';

/**
 * Baked geometry facts this module checks its own inputs against. These are ETL outputs
 * (HANDOFF.md Â§5), not tunables, so they live here rather than in the config singleton.
 *
 * Read straight off the written GLB, never off the in-memory mesh (HANDOFF.md G15 - trimesh's glTF
 * writer rewrites V as 1 - v on export, so only the file is trustworthy):
 *
 *   uv.y === 0.0  ->  the 8 m core strip at y = 1.00   (1028 vertices)
 *   uv.y === 1.0  ->  the 26 m glow strip at y = 0.75  (1440 vertices)
 *
 * The two are identified by the geometry they actually carry, not by trusting a label: the glow
 * ribbon is the wider one and carries the mitre patches, so it is the larger, lower vertex set.
 */
const BAKED = {
  core: { v: 0, y: 1, width: 8, vertices: 1028 },
  glow: { v: 1, y: 0.75, width: 26, vertices: 1440 },
  /** Roads' two strips, distinguished only by baked height (Roads carries no UVs). */
  roadGlowY: ROAD_GLOW_Y,
  roadCoreY: ROAD_CORE_Y,
  /**
   * The two APath strips are concentric ribbons of different widths: both are centred on the route,
   * so their bounding-box centres must coincide to within a metre or two (the mitre patches make the
   * wider strip's box very slightly larger). A swapped pair would still be concentric, which is why
   * the width ranking above - not this - is what decides the strip assignment.
   */
  stripCentreTolerance: 8
};

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {number} drawn triangles, read from the index buffer (glTF always ships indexed TRIS)
 */
function triangleCount(geometry) {
  const index = geometry.getIndex();
  return index ? index.count / 3 : geometry.getAttribute('position').count / 3;
}

/**
 * Summarize a vertex bundle: the heights it occupies and its planar extent.
 *
 * @param {THREE.BufferAttribute} position
 * @param {number[]} vertexIndices
 * @returns {object|null} null when the bundle is empty
 */
function bundleSummary(position, vertexIndices) {
  if (vertexIndices.length === 0) {
    return null;
  }
  const yValues = new Set();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const index of vertexIndices) {
    minX = Math.min(minX, position.getX(index));
    maxX = Math.max(maxX, position.getX(index));
    minZ = Math.min(minZ, position.getZ(index));
    maxZ = Math.max(maxZ, position.getZ(index));
    yValues.add(position.getY(index));
  }
  return { minX, maxX, minZ, maxZ, yValues: [...yValues] };
}

/**
 * Ordered centreline of the route, recovered from the baked GLB.
 *
 * Each core quad row contributes two vertices: the two EDGES of the 8 m-wide core ribbon, measured
 * 8.0000 m apart (p50 8.000001, max 8.001259) and centred on the route, so their midpoint equals the
 * row's centroid to 1.2e-7 m. Averaging the first two vertices of a u-group therefore recovers the
 * exact line the pulse head rides on. (An earlier revision of this comment called the second vertex
 * "the centreline"; it is not, and code written to match that comment would offset the aim by 4 m -
 * docs/10 Â§8.1.) Read from the file, never re-derived from a hand-authored curve.
 *
 * @param {THREE.BufferGeometry} geometry APath geometry (POSITION + TEXCOORD_0)
 * @returns {Float64Array[]} `[u, x, y, z]` tuples, sorted by u
 */
function buildRouteCentreline(geometry) {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const byU = new Map();
  for (let index = 0; index < uv.count; index += 1) {
    if (uv.getY(index) >= 0.5) {
      continue; // core strip only (the baked v selector is 0 for the 8 m core)
    }
    const u = uv.getX(index);
    if (!byU.has(u)) {
      byU.set(u, []);
    }
    byU.get(u).push(index);
  }
  const samples = [];
  for (const [u, indices] of byU) {
    const a = indices[0];
    const b = indices.length > 1 ? indices[1] : indices[0];
    samples.push([
      u,
      (position.getX(a) + position.getX(b)) / 2,
      (position.getY(a) + position.getY(b)) / 2,
      (position.getZ(a) + position.getZ(b)) / 2
    ]);
  }
  samples.sort((a, b) => a[0] - b[0]);
  return samples;
}

/**
 * Build a self-describing fingerprint of the loaded geometry.
 *
 * The ribbons are raw `BufferGeometry` produced by the ETL, so this reads the real `position`, `uv`
 * and index accessors instead of trusting a comment: the pulse maths depends on `vUv.x` being the
 * baked arc length and `vUv.y` being the strip selector, and the road shader depends on the two
 * baked heights, so all four facts are asserted here and any disagreement becomes a loud warning.
 *
 * @param {Record<string, THREE.Mesh>} objects
 * @returns {object} JSON-safe evidence, also exposed as `window.__GEO`
 */
function fingerprint(objects) {
  const apathGeometry = objects.APath.geometry;
  const uv = apathGeometry.getAttribute('uv');
  const apathPosition = apathGeometry.getAttribute('position');
  const roadsPosition = objects.Roads.geometry.getAttribute('position');

  const evidence = {
    attributes: {
      APath: Object.keys(apathGeometry.attributes),
      Roads: Object.keys(objects.Roads.geometry.attributes),
      Buildings: Object.keys(objects.Buildings.geometry.attributes)
    },
    vertices: {
      Buildings: objects.Buildings.geometry.getAttribute('position').count,
      Roads: roadsPosition.count,
      APath: apathPosition.count
    },
    triangles: {
      Buildings: triangleCount(objects.Buildings.geometry),
      Roads: triangleCount(objects.Roads.geometry),
      APath: triangleCount(apathGeometry)
    },
    uRange: null,
    distinctU: null,
    vValues: null,
    strips: { core: null, glow: null },
    stripsCorrectlyAssigned: false,
    uvCountMatchesPosition: false,
    xSpanDifference: null,
    stripCentreOffset: null,
    roadsYRange: null,
    roadsVerticesPerStrip: null,
    warnings: []
  };

  if (uv) {
    evidence.uvCountMatchesPosition = uv.count === apathPosition.count;
    let minU = Infinity;
    let maxU = -Infinity;
    const distinctU = new Set();
    const distinctV = new Set();
    const perV = new Map();
    for (let index = 0; index < uv.count; index += 1) {
      const u = uv.getX(index);
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      distinctU.add(u);
      const v = uv.getY(index);
      distinctV.add(Number(v.toFixed(4)));
      if (!perV.has(v)) {
        perV.set(v, []);
      }
      perV.get(v).push(index);
    }
    evidence.uRange = { min: minU, max: maxU };
    evidence.distinctU = distinctU.size;
    evidence.vValues = [...distinctV].sort((a, b) => a - b);

    // Name each bundle by the geometry it actually carries (its baked height), then check the width
    // ranking against the roles the shader assigns: core narrow, glow wide.
    for (const [v, indices] of perV) {
      const summary = bundleSummary(apathPosition, indices);
      const single = summary.yValues.length === 1;
      const height = summary.yValues[0];
      const role = single && Math.abs(height - BAKED.core.y) < 1e-6
        ? 'core'
        : single && Math.abs(height - BAKED.glow.y) < 1e-6
          ? 'glow'
          : null;
      if (!role) {
        evidence.warnings.push(`APath v=${v} carries unexpected heights ${summary.yValues.join('/')}`);
        continue;
      }
      evidence.strips[role] = {
        v,
        y: height,
        vertices: indices.length,
        plannedVertices: BAKED[role].vertices,
        plannedWidth: BAKED[role].width,
        xSpan: summary.maxX - summary.minX,
        zSpan: summary.maxZ - summary.minZ,
        minZ: summary.minZ,
        maxZ: summary.maxZ,
        minX: summary.minX,
        maxX: summary.maxX
      };
    }

    const core = evidence.strips.core;
    const glow = evidence.strips.glow;
    if (core && glow) {
      evidence.xSpanDifference = glow.xSpan - core.xSpan;
      // The wider ribbon must be the one the shader treats as the glow (the higher vUv.y).
      evidence.stripsCorrectlyAssigned = glow.xSpan > core.xSpan && glow.v > core.v;
      if (!evidence.stripsCorrectlyAssigned) {
        evidence.warnings.push(
          `APath strips look inverted: core xSpan ${core.xSpan} at v=${core.v}, glow xSpan ${glow.xSpan} at v=${glow.v}`
        );
      }
      // Both strips are concentric ribbons around the same route, so their bounding-box centres
      // must agree. A ribbon that drifted off the route would show here.
      const centreX = Math.abs((core.minX + core.maxX) / 2 - (glow.minX + glow.maxX) / 2);
      const centreZ = Math.abs((core.minZ + core.maxZ) / 2 - (glow.minZ + glow.maxZ) / 2);
      evidence.stripCentreOffset = { x: centreX, z: centreZ };
      if (centreX > BAKED.stripCentreTolerance || centreZ > BAKED.stripCentreTolerance) {
        evidence.warnings.push(
          `APath strip centres disagree by (${centreX.toFixed(2)}, ${centreZ.toFixed(2)}) m`
        );
      }
    }
  }

  let minY = Infinity;
  let maxY = -Infinity;
  const roadVerticesPerStrip = {};
  for (let index = 0; index < roadsPosition.count; index += 1) {
    const y = roadsPosition.getY(index);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    roadVerticesPerStrip[y] = (roadVerticesPerStrip[y] || 0) + 1;
  }
  evidence.roadsYRange = { min: minY, max: maxY };
  evidence.roadsVerticesPerStrip = roadVerticesPerStrip;
  if (minY !== BAKED.roadGlowY || maxY !== BAKED.roadCoreY) {
    evidence.warnings.push(
      `Roads strip heights ${minY}/${maxY} do not match the baked ${BAKED.roadGlowY}/${BAKED.roadCoreY}`
    );
  }

  if (evidence.warnings.length > 0) {
    console.warn('[transit-desert] geometry fingerprint warnings:', evidence.warnings);
  }
  return evidence;
}

/**
 * Boot the engine against an existing canvas/stage/hero triple.
 *
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas
 * @param {HTMLElement} options.stage the element whose size defines the drawing buffer
 * @param {HTMLElement} options.hero the scroll runway that maps scrollY to u_progress (docs/06 Â§1)
 * @param {HTMLElement} [options.hudProgress] readout element, written only when its text changes
 * @returns {Promise<object>} the engine handle, with the docs/07 Â§2 hooks already installed
 */
export async function startEngine({ canvas, stage, hero, hudProgress }) {
  // ------------------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(1); // pinned: Step 5 baselines must be machine-stable
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(new THREE.Color(config.palette.void), 1);

  const scene = new THREE.Scene();
  const rig = createCameraRig(config);
  const progress = createProgress({ hero });
  createGui(config); // docs/04 Â§1: the live panel mutates the same singleton exposed as __CONFIG

  let city = null;
  /** The search layer (docs/03 Â§5): candidate routes + frontier points, built after the GLB resolves. */
  let search = null;
  /** The ground layer (docs/05 s6): water, parks and the circuit, from the generated module. */
  let ground = null;
  /** The landmark layer (docs/05 s7): real Melbourne landmarks as hero masses. */
  let landmarksLayer = null;
  let frameHandle = null;
  let currentProgress = 0;
  let hudText = '';
  /** Baked route centreline ([u, x, y, z] tuples); filled once the GLB resolves. */
  let routeCentre = [];
  /** Aim point scratch, reused every frame so the render path allocates nothing. */
  const aimScratch = new THREE.Vector3();
  /**
   * Route-point scratches. Deliberately NOT `aimScratch`: `aimFor()` builds the blended aim in
   * `aimScratch`, so a shared scratch would alias the aim with the route point it was built from.
   */
  const routeScratch = new THREE.Vector3();
  const headScratch = new THREE.Vector3();
  /** Probe-only scratch: the probe restores the live camera from these, so it leaves no trace. */
  const probePosition = new THREE.Vector3();
  const probeQuaternion = new THREE.Quaternion();
  /**
   * Whether the sticky stage is currently intersecting the viewport (docs/06 Â§2). Used to decide
   * when the runway may be re-measured - see `resize()`.
   */
  let stageVisible = true;

  /**
   * Size the drawing buffer and camera to the sticky stage. Called on load and on resize.
   *
   * The runway length is deliberately NOT re-measured here. `progress.measure()` derives `range` from
   * the live `innerHeight`, so a browser toolbar appearing (or a window drag) mid-scroll rescales
   * `u` in one frame and snaps the camera - measured at 52.8 deg for a 60 px rescale, docs/10 Â§5.
   * It is instead measured at boot, whenever the stage leaves the viewport, and on a resize that
   * lands while it is already off-screen: never while the animation is live on screen, which is the
   * only time a rescale can be seen. The renderer and camera aspect still react immediately, so
   * docs/06 Â§2's resize contract is unchanged.
   */
  function resize() {
    const width = stage.clientWidth || window.innerWidth;
    const height = stage.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    rig.setAspect(width / height);
    // The frontier point's screen-space floor needs the real drawing-buffer height (docs/11 Â§4.1).
    config.search.viewportHeight = renderer.domElement.height || height;
    if (!stageVisible) {
      progress.measure();
    }
  }

  /**
   * Point on the baked route at `wanted`, linearly interpolated between the two bracketing samples.
   *
   * This is where the route (and therefore the pulse head) actually is: the ETL lays one quad per
   * centreline segment and `vUv.x` is normalized cumulative arc length, so between two baked samples
   * the route is a straight line and a point at an intermediate `u` lies on it. Reading the point
   * this way is exact to the baked geometry rather than snapped to the nearest OSM graph node.
   *
   * Allocates nothing: writes into `out` and only touches scalars.
   *
   * @param {number} wanted `u` in 0..1
   * @param {THREE.Vector3} out receives the route point
   * @returns {THREE.Vector3|null} null when no centreline is loaded yet
   */
  function routePointAt(wanted, out) {
    if (routeCentre.length === 0) {
      return null;
    }
    const first = routeCentre[0];
    const last = routeCentre[routeCentre.length - 1];
    if (wanted <= first[0]) {
      return out.set(first[1], first[2], first[3]);
    }
    if (wanted >= last[0]) {
      return out.set(last[1], last[2], last[3]);
    }
    // Bracket the interval. 246 samples is a trivial scan, and this runs a handful of times per
    // frame at most, so there is nothing to gain from caching the bracket across calls.
    let hi = 1;
    while (hi < routeCentre.length && routeCentre[hi][0] < wanted) {
      hi += 1;
    }
    const a = routeCentre[hi - 1];
    const b = routeCentre[hi];
    const span = b[0] - a[0];
    const t = span > 0 ? (wanted - a[0]) / span : 0;
    return out.set(
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
      a[3] + (b[3] - a[3]) * t
    );
  }

  /**
   * Aim point for a frame: `config.targetX/Y/Z`, blended toward the search's own point of interest near
   * `u_progress` by `config.guide.amount` (docs/04 Â§3 - the target stays art-directed, this just keeps
   * the subject in shot). A fixed aim point loses the subject for most of a 4.4 km flight.
   *
   * WHAT THE POINT OF INTEREST IS, AND WHY IT IS NOT THE FRONTIER CENTROID (docs/11 Â§5): the guide
   * follows the SEARCH's own spatial progress along the baked route - `u_progress` while the search
   * runs, the reconstruction front once it begins - because that trajectory is smooth by construction.
   * Aiming at the live frontier centroid was tried and FAILED the camera-trajectory gate (G1/G2/G3:
   * 133.6 deg per 0.25 px of scroll, the head off screen for 627 of 1201 sampled frames): the frontier
   * set gains and loses nodes every event, so its centroid steps, and a stepped aim whips the camera.
   * The route's own line is the algorithm's subject too, and the camera contract is unchanged.
   *
   * The lead is `config.search.aimLead` - the search's own copy of the value `config.guide.lead` ships
   * with - so the search's framing can be tuned live without silently moving the route's.
   *
   * The route point is INTERPOLATED along the baked polyline (`routePointAt`), never snapped to the
   * nearest baked sample. Snapping made the aim a 246-level step function of `u_progress`: 9 of its
   * 245 switches rotated the camera more than 10 deg in a single scroll step (max 31.41 deg, 94.7 %
   * of it roll), which is the "shake at certain intervals" the user reported - docs/10 Â§2, Â§3.
   *
   * Allocates nothing: reuses `aimScratch` plus one route-point scratch, and only touches scalars.
   *
   * @param {number} value 0..1
   * @returns {THREE.Vector3|null} null when guiding is off, so the rig uses the config target alone
   */
  function aimFor(value) {
    const amount = config.guide.amount;
    if (!(amount > 0) || routeCentre.length === 0) {
      return null;
    }
    const wanted = Math.min(1, Math.max(0, value + config.search.aimLead));
    if (!Number.isFinite(wanted)) {
      // Degenerate input (a corrupted `lead`/`progress`): fall back to the art-directed target rather
      // than interpolating to NaN and aiming the camera at nothing. The nearest-sample lookup this
      // replaced degraded in the same direction by accident; here it is deliberate.
      return null;
    }
    const route = routePointAt(wanted, routeScratch);
    aimScratch.set(
      config.targetX + (route.x - config.targetX) * amount,
      config.targetY + (route.y - config.targetY) * amount,
      config.targetZ + (route.z - config.targetZ) * amount
    );
    return aimScratch;
  }

  /**
   * The single render path (docs/03 Â§1). Writes one progress uniform per material, updates the
   * camera, draws - nothing else. Safe to call before the GLB resolves (renders the void).
   *
   * @param {number} value 0..1
   */
  function renderAt(value) {
    currentProgress = value;
    rig.update(value, aimFor(value));
    if (search) {
      // The search layer is pumped FIRST because it owns the route's replay state (docs/11 §4.3):
      // where the reconstruction front is and whether the answer exists yet.
      search.sync(config, value); // the replay's two materials: uniforms only
    }
    // The route's reveal state, from the SAME function the search layer's probe and the runtime gates
    // read. `routeReplayState` is the one definition: reveal = 1 at the goal falling to 0 at the start,
    // pulse = 0 through the whole search. Passing anything else here - and an earlier revision passed
    // `u` itself, which reveals the route FORWARDS from the source - is the exact defect the runtime
    // gate's uniform-vs-mirror check (check D0) now fails on.
    const routeState = routeReplayState(value, config);
    if (city) {
      city.sync(config, value, routeState); // buildings fade + both shader materials' uniforms
    }
    if (ground) {
      ground.sync(config, value); // docs/05 §6: the water / park / circuit ground layer
    }
    if (landmarksLayer) {
      landmarksLayer.sync(config, value); // docs/05 §7: the landmark hero masses
    }
    renderer.render(scene, rig.camera);

    // DOM write only when the rendered text actually changes: keeps the loop layout-free.
    if (hudProgress) {
      const text = `u_progress ${value.toFixed(3)}`;
      if (text !== hudText) {
        hudText = text;
        hudProgress.textContent = text;
      }
    }
  }

  // ------------------------------------------------------------------------- the single loop
  function tick() {
    frameHandle = requestAnimationFrame(tick);
    renderAt(progress.read());
  }

  function startLoop() {
    if (frameHandle === null) {
      frameHandle = requestAnimationFrame(tick);
    }
  }

  function stopLoop() {
    if (frameHandle !== null) {
      cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }
  }

  // ------------------------------------------------------------------------- boot
  resize(); // size before the first render so frame 1 is already correct
  window.addEventListener('resize', () => {
    resize();
    if (frameHandle === null) {
      renderAt(progress.read()); // docs/06 Â§2: exactly one manual pass while paused
    }
  });

  try {
    city = await createCity(scene, config);
  } catch (error) {
    window.__APP_ERROR = String(error && error.message ? error.message : error);
    console.error('[transit-desert] scene.glb failed to load:', error);
    return { renderer, scene, rig, progress, city: null, search: null, renderAt, startLoop, stopLoop, resize };
  }

  const geo = fingerprint(city.objects);
  routeCentre = buildRouteCentreline(city.objects.APath.geometry);
  geo.routeCentreSamples = routeCentre.length;

  // docs/11: the search layer - the baked A* trace, replayed. Built here - after the GLB resolves and
  // before the first render - so frame 1 already contains the layer, exactly as it already contains the
  // city (docs/07 Â§1). Nothing is searched, pathfound or generated here: the trace IS the search, and
  // the runtime only maps `u_progress` onto it.
  search = createSearchLayer(scene, config, astarTrace);
  geo.search = search.fingerprint;
  geo.warnings.push(...search.fingerprint.warnings);

  // docs/05 §6: the ground. Built once, after the payload resolves and before the first render, so
  // frame 1 already contains the river and the circuit. It is a generated module beside the payload, not
  // a fourth object in `scene.glb`, which keeps that file byte-identical (docs/02 §4).
  ground = createGround(scene, config);
  geo.ground = ground.fingerprint;
  geo.warnings.push(...ground.fingerprint.warnings);

  // docs/05 §7: the landmarks. Same arrangement - a generated module beside the payload, built once
  // before the first render, so frame 1 already contains them.
  landmarksLayer = createLandmarks(scene, config);
  geo.landmarks = landmarksLayer.fingerprint;
  geo.warnings.push(...landmarksLayer.fingerprint.warnings);

  // docs/06 Â§2 gating. The initial state is visible, so the first render happens here.
  observeVisibility(stage, {
    onVisible: () => {
      stageVisible = true;
      startLoop();
      renderAt(progress.read());
    },
    onHidden: () => {
      stageVisible = false;
      stopLoop();
      // Off-screen is exactly when the runway may be re-measured: no rescale can be seen, and the
      // mapping is fresh again by the time the visitor scrolls back (docs/10 Â§7 F3).
      progress.measure();
    }
  });

  renderAt(progress.read());
  startLoop();

  // ------------------------------------------------------------------------- docs/07 Â§2 hooks
  const engine = {
    renderer,
    scene,
    rig,
    progress,
    city,
    search,
    renderAt,
    startLoop,
    stopLoop,
    resize,
    aimFor,
    geo
  };

  window.__ENGINE = engine;
  window.__RENDERER = renderer;
  window.__SCENE = scene;
  window.__CAMERA = rig.camera;
  window.__CITY = city.objects;
  window.__MATERIALS = city.materials;
  window.__GEO = geo;
  /** docs/11: the search layer's objects, materials and load-time fingerprint. */
  window.__SEARCH = {
    objects: search.objects,
    materials: search.materials,
    fingerprint: search.fingerprint,
    /**
     * Where the replay came from: the generated trace's provenance (source GLB hash, graph size, the
     * documented algorithm and tie-break order) and its size. Evidence can then state which bake
     * produced the animation instead of describing a hand-authorable table.
     */
    provenance: astarTrace.source,
    algorithm: astarTrace.algorithm,
    eventCount: astarTrace.eventCount,
    frameCount: astarTrace.frameCount,
    goalSettledFrame: astarTrace.winner.goalSettledFrame,
    finalPathNodes: astarTrace.finalPath.nodes.length
  };
  /**
   * docs/11 Â§7 the search layer's CPU mirrors of its own GLSL, plus the route's replay mirrors
   * (docs/07 Â§2). These are the shipping functions, not a harness-side re-derivation: the gates in
   * `artifacts/search/capture.mjs` run through them, so a mirror that disagreed with its shader would
   * be caught rather than duplicated.
   */
  window.__SEARCH_MIRRORS = {
    ...search.mirror,
    /** The route's replay split: the reconstruction front, the head and the discharge's strike. */
    routeReplayState,
    routeGlow: routeGlowResponse,
    flashStrike,
    flashWavePeak,
    flashWavePeakAt,
    flashBand: flashBandResponse
  };
  window.__STEP3 = {
    uniforms: {
      apath: city.shaders.apath.uniforms,
      roads: city.shaders.roads.uniforms
    },
    /** Strip selector / cross-fraction mapping the APath fragment shader applies to `vUv.y`. */
    crossFraction: (t) => Math.min(1, Math.abs(t - 0.5) * 2),
    /** Baked constants this module reasoned about, so a verifier can disagree with them. */
    baked: BAKED
  };

  /**
   * docs/07 Â§2: force a progress value, bypassing scroll, and render synchronously.
   * @param {number|null} value 0..1 to force, or null to hand control back to scroll
   */
  window.__TEST_SET_PROGRESS = (value) => {
    progress.setOverride(value);
    renderAt(progress.read());
    return {
      progress: currentProgress,
      frame: renderer.info.render.frame,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      camera: [rig.camera.position.x, rig.camera.position.y, rig.camera.position.z]
    };
  };

  /**
   * Camera-independent acceptance probe (docs/08 Step 3): evaluate the pulse band at a given route
   * position, using the same constants the fragment shader uses. `head === 1` at
   * `u === u_progress` is the proof that the head sits by arc length, not by vertex index.
   *
   * @param {number} u `vUv.x` to sample, 0..1
   * @returns {object} the CPU evaluation of the shader's band
   */
  window.__STEP3_PROBE = (u) => city.shaders.apath.probe(u);

  /**
   * Search-layer probe (docs/03 Â§5, docs/07 Â§2): every candidate's frontier fraction and world
   * position, the losers' dim factor and the completion flash at a given `u_progress`.
   *
   * Pure, like `__CAMERA_PROBE`: it renders nothing and mutates nothing, so a dense sweep over the
   * whole runway is affordable and calling it can never change what the next frame draws.
   *
   * @param {number} value `u_progress`, 0..1 (clamped)
   * @returns {object|null} JSON-safe search state; null for a non-finite argument
   */
  window.__SEARCH_PROBE = (value) => search.probe(value);

  /**
   * Trajectory probe (docs/10 Â§7 F5, the camera gate's hook). Reports the shipping camera state at a
   * given `u_progress` - position, orientation, the aim it used, the pulse head's own position, and
   * the view axis's tilt from vertical - WITHOUT drawing.
   *
   * It exists because the pixel harness cannot see a discontinuity: a still frame at a smooth `u`
   * looks identical whether or not the aim is a step function, and driving
   * `__TEST_SET_PROGRESS` through thousands of frames would starve the compositor (G27). This probe
   * renders nothing, so a dense sweep is cheap, and it restores the live camera before returning, so
   * calling it never changes what the next frame draws (docs/07 Â§1 determinism).
   *
   * @param {number} value `u_progress`, 0..1 (clamped)
   * @returns {object|null} JSON-safe camera state; null for a non-finite argument
   */
  window.__CAMERA_PROBE = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    const u = Math.min(1, Math.max(0, value));
    const camera = rig.camera;
    probePosition.copy(camera.position);
    probeQuaternion.copy(camera.quaternion);

    const aim = aimFor(u);
    rig.update(u, aim);
    const head = routePointAt(u, headScratch);

    const position = camera.position;
    const dx = (aim ? aim.x : config.targetX) - position.x;
    const dy = (aim ? aim.y : config.targetY) - position.y;
    const dz = (aim ? aim.z : config.targetZ) - position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const state = {
      u,
      position: [position.x, position.y, position.z],
      quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
      aim: aim ? [aim.x, aim.y, aim.z] : [config.targetX, config.targetY, config.targetZ],
      head: head ? [head.x, head.y, head.z] : null,
      tiltFromVerticalDeg: (Math.acos(Math.min(1, Math.abs(dy / distance))) * 180) / Math.PI
    };

    camera.position.copy(probePosition);
    camera.quaternion.copy(probeQuaternion);
    return state;
  };

  window.__APP_READY = true;
  return engine;
}
