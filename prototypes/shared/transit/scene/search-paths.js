/**
 * The search layer (docs/11): a replay of one real A* execution over the baked drive graph.
 *
 * WHAT THIS IS
 * The animation used to draw six precomputed candidate routes, each advancing at its own rate. This
 * module draws the search that actually happened: every node A* discovered, every node it settled,
 * every road it examined, all read out of the baked trace (`src/data/astar-trace.js`, produced offline
 * by `scripts/astar_trace.py`).
 *
 * The browser is a *replayer*. It has no graph, no edge weights and no pathfinding: it owns a payload
 * of frame indices and a monotone clock. `u_progress` is search time, not distance along the route -
 * `phases()` maps it onto the recorded event sequence, and the last phase walks the predecessor chain
 * backwards from the goal.
 *
 * THE TWO GEOMETRIES, BUILT ONCE
 *   SearchNodes   one billboarded quad per touched node, carrying its arrival/settle frames and its
 *                 g and h. The shader decides per frame whether it is unexplored (collapsed outside
 *                 the clip volume), open (a frontier point) or settled (a dim persistent trace).
 *   SearchEdges   one flat ribbon per examined road, built here from the payload's node coordinates -
 *                 no edge geometry is baked twice, and no texture is needed to look a node up.
 *
 * Roads A* never looked at are drawn by the city's own `Roads` mesh, which is already on screen: the
 * subdued network the search happens inside is not this layer's job to redraw.
 *
 * Roads on the winning path are deliberately NOT in this layer (`onPath`), because the winner is the
 * amber `APath`; a violet search ribbon on top of it would paint the answer as if it were still being
 * searched.
 *
 * PER FRAME: UNIFORMS ONLY
 * Nothing is written to an attribute, geometry or material after load (docs/03 §1). `sync()` writes
 * `u_frame` and a handful of tunables, comparing each before mutating, so a steady frame allocates
 * nothing. Every per-node and per-road decision is a function of that one uniform and the frozen
 * attributes, which is what makes the picture a pure function of `u_progress` (docs/07 §1).
 */
import * as THREE from 'three';
import { MAX_FRONTIER_REPORT, MAX_SEARCH_QUADS } from '../config.js';
import { createSearchNodeMaterial } from '../shaders/searchNodeMaterial.js';
import { createSearchEdgeMaterial } from '../shaders/searchEdgeMaterial.js';
import { createRevisionMaterial } from '../shaders/revisionMaterial.js';
import { routeReplayState } from '../shaders/pulseMaterial.js';

/** Half-width of the ribbon quad's cross coordinate: vertices sit at -1 and +1. */
const CROSS = 1;

/**
 * The quad's six corners as (centre selector, side, corner) triples.
 *
 * A road is a rectangle between two points, and its cross coordinate runs +1 along one side and -1
 * along the other - the same way `APath` separates its two strips, so the ribbon is one primitive and
 * the fragment shader owns the softening. `centre` selects the start or the end of the road, `side`
 * selects which long edge, and `corner` is the billboard/interpolation coordinate.
 */
const QUAD_CORNERS = [
  [0, CROSS, -1, -1],
  [1, CROSS, 1, -1],
  [1, -CROSS, 1, 1],
  [0, CROSS, -1, -1],
  [1, -CROSS, 1, 1],
  [0, -CROSS, -1, 1]
];

/**
 * The replay's phase model. Pure, and exported so `window.__SEARCH_PROBE` and the harness evaluate the
 * shipping arithmetic rather than a re-derivation.
 *
 * @param {number} u `u_progress`, 0..1
 * @param {object} search the live `config.search` block
 * @returns {{ searchFrac: number, reveal: number, freeze: number, frozen: boolean, final: boolean }}
 *          `searchFrac` 0..1 across the recorded event sequence, `reveal` 1..0 during reconstruction,
 *          `freeze` 0..1 across the final window, `frozen` true once the goal has settled
 */
export function phases(u, search) {
  const clamped = Number.isFinite(u) ? Math.min(1, Math.max(0, u)) : 0;
  const end = Math.min(Math.max(search.replayEnd, 1e-6), 1);
  const freezeStart = Math.min(Math.max(search.freezeEnd, end), 1);
  const searchFrac = Math.min(clamped / end, 1);
  const frozen = clamped >= end;
  const final = clamped >= freezeStart;
  const span = Math.max(1 - freezeStart, 1e-6);
  const freeze = Math.min(Math.max((clamped - freezeStart) / span, 0), 1);
  return { searchFrac, reveal: 1 - freeze, freeze, frozen, final };
}

/**
 * How near a frontier point's priority is to the live best, as a brightness gain in `1..1+boost`.
 * Lower `f` is brighter, which is the one place the recorded cost drives the picture.
 */
export function priorityGain(f, bestF, search) {
  if (!Number.isFinite(f) || !Number.isFinite(bestF)) {
    return 1;
  }
  const range = Math.max(search.priorityRange, 1e-6);
  const worse = Math.min(Math.max((f - bestF) / range, 0), 1);
  return 1 + Math.max(search.priorityBoost, 0) * (1 - worse);
}

/** A frontier point's alpha at a node's own arrival frame: active while inside the frontier band. */
export function frontierResponse(delta, band, search) {
  if (!Number.isFinite(delta) || delta < 0) {
    return 0;
  }
  const width = Math.max(band, 1e-6);
  return search.dotAlpha * (1 - Math.min(Math.max(delta / width, 0), 1));
}

/** A settled node's trace alpha: strongest right after the pop, easing to `settledAlpha`. */
export function settledResponse(delta, band, search) {
  if (!Number.isFinite(delta) || delta < 0) {
    return 0;
  }
  const width = Math.max(band, 1e-6);
  const t = Math.min(Math.max(delta / width, 0), 1);
  return search.dotAlpha * (search.settledAlpha + (1 - search.settledAlpha) * (1 - t));
}

/** An examined road's alpha: full while A* is working on it, easing to `settledFade` afterwards. */
export function edgeResponse(delta, hold, search) {
  if (!Number.isFinite(delta) || delta < 0) {
    return 0;
  }
  const width = Math.max(hold, 1e-6);
  const t = Math.min(Math.max(delta / width, 0), 1);
  return search.trailAlpha * (1 + (search.settledFade - 1) * t);
}

/**
 * Load-time validation of the payload. A missing field, a broken index or a truncated reveal timeline
 * is a hard failure: a partially valid trace would animate as a plausible lie.
 *
 * @param {object} trace the generated `astarTrace` module
 * @returns {{ warnings: string[], checks: object }} the fingerprint recorded in `window.__GEO`
 */
export function auditTrace(trace) {
  const warnings = [];
  const checks = {
    schema: trace.schema,
    nodeCount: trace.nodes.ids.length,
    edgeCount: trace.edges.a.length,
    eventCount: trace.eventCount,
    frameCount: trace.frameCount,
    pathNodes: trace.finalPath.nodes.length,
    sourceNode: trace.sourceNode,
    goalNode: trace.goalNode,
    goalSettledFrame: trace.winner.goalSettledFrame,
    revealScale: trace.revealScale,
    framesPerEvent: trace.framesPerEvent
  };
  const nodeFields = [
    'ids',
    'coords',
    'h',
    'arrivalFrame',
    'settleFrame',
    'gM',
    'parent'
  ];
  for (const field of nodeFields) {
    if (trace.nodes[field].length !== trace.nodes.ids.length) {
      warnings.push(`nodes.${field} has ${trace.nodes[field].length} entries, expected ${trace.nodes.ids.length}`);
    }
  }
  for (const field of ['a', 'b', 'examFrame', 'onPath']) {
    if (trace.edges[field].length !== trace.edges.a.length) {
      warnings.push(`edges.${field} has ${trace.edges[field].length} entries, expected ${trace.edges.a.length}`);
    }
  }
  if (trace.finalPath.reveal.length < trace.finalPath.nodes.length) {
    warnings.push('finalPath.reveal is shorter than finalPath.nodes');
  }
  if (trace.finalPath.reveal[trace.finalPath.reveal.length - 1] !== trace.revealScale) {
    warnings.push('finalPath.reveal does not end at revealScale, so the reconstruction stops short');
  }
  if (trace.winner.goalSettledFrame >= trace.frameCount) {
    warnings.push('winner.goalSettledFrame is not inside the frame timeline');
  }
  for (let index = 0; index < trace.edges.a.length; index += 1) {
    const a = trace.edges.a[index];
    const b = trace.edges.b[index];
    if (!(a >= 0 && a < trace.nodes.ids.length && b >= 0 && b < trace.nodes.ids.length)) {
      warnings.push(`edges[${index}] references a node outside the payload`);
      break;
    }
  }
  return { warnings, checks };
}

/**
 * Build the search layer.
 *
 * @param {THREE.Scene} scene
 * @param {typeof import('../config.js').config} config the live singleton
 * @param {object} trace the generated `astarTrace` module
 * @returns {object} `{ objects, materials, sync, probe, mirror, fingerprint }`
 */
export function createSearchLayer(scene, config, trace) {
  const { warnings, checks } = auditTrace(trace);
  const nodeCount = trace.nodes.ids.length;
  const edgeCount = trace.edges.a.length;
  const framesPerEvent = trace.framesPerEvent;

  /** Shipping-frame position of a node: the anchored plane rotated into Y-up, one layer height. */
  function shipPosition(index, out) {
    const coord = trace.nodes.coords[index];
    out[0] = coord[0];
    out[1] = config.search.y;
    out[2] = -coord[1];
    return out;
  }

  // ------------------------------------------------------------------ SearchNodes
  const nodeCorners = new Float32Array(nodeCount * 6 * 2);
  const nodeCentre = new Float32Array(nodeCount * 6 * 3);
  const nodeArrival = new Float32Array(nodeCount * 6);
  const nodeSettle = new Float32Array(nodeCount * 6);
  const nodeCost = new Float32Array(nodeCount * 6 * 2);
  const point = [0, 0, 0];
  for (let index = 0; index < nodeCount; index += 1) {
    shipPosition(index, point);
    const g = trace.nodes.gM[index];
    const h = trace.nodes.h[index];
    for (let corner = 0; corner < 6; corner += 1) {
      const vertex = index * 6 + corner;
      nodeCorners[vertex * 2] = QUAD_CORNERS[corner][2];
      nodeCorners[vertex * 2 + 1] = QUAD_CORNERS[corner][3];
      nodeCentre[vertex * 3] = point[0];
      nodeCentre[vertex * 3 + 1] = point[1];
      nodeCentre[vertex * 3 + 2] = point[2];
      nodeArrival[vertex] = trace.nodes.arrivalFrame[index];
      nodeSettle[vertex] = trace.nodes.settleFrame[index];
      nodeCost[vertex * 2] = g;
      nodeCost[vertex * 2 + 1] = h;
    }
  }
  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodeCentre, 3));
  nodeGeometry.setAttribute('aCorner', new THREE.BufferAttribute(nodeCorners, 2));
  nodeGeometry.setAttribute('aArrival', new THREE.BufferAttribute(nodeArrival, 1));
  nodeGeometry.setAttribute('aSettle', new THREE.BufferAttribute(nodeSettle, 1));
  nodeGeometry.setAttribute('aCost', new THREE.BufferAttribute(nodeCost, 2));
  nodeGeometry.setDrawRange(0, nodeCount * 6);

  // ------------------------------------------------------------------ SearchEdges
  //
  // ONE QUAD PER SEGMENT OF EACH ROAD'S REAL POLYLINE, not one per road. This was the layer's most
  // visible defect: with only the two junction coordinates in hand, a curved street was drawn as a
  // straight chord across blocks - visibly wrong beside the city's own Roads mesh, which follows the
  // street. The payload now ships each examined road's digitised geometry (4,236 points, 3,502
  // segments), so the search draws the roads it is actually searching.
  const edgeSegmentCount = new Array(edgeCount).fill(0);
  let drawableSegments = 0;
  let skippedOnPath = 0;
  for (let index = 0; index < edgeCount; index += 1) {
    if (trace.edges.onPath[index] === 1) {
      // The winner's own roads are the amber route's job, not the search layer's (see the header).
      skippedOnPath += 1;
      continue;
    }
    edgeSegmentCount[index] = trace.edges.pointCounts[index] - 1;
    drawableSegments += edgeSegmentCount[index];
  }
  if (drawableSegments === 0) {
    warnings.push('no examined road is drawable - the search layer would show no roads');
  }

  const edgeCentreA = new Float32Array(drawableSegments * 6 * 3);
  const edgeCentreB = new Float32Array(drawableSegments * 6 * 3);
  const edgeSide = new Float32Array(drawableSegments * 6);
  const edgeCorner = new Float32Array(drawableSegments * 6 * 2);
  const edgeExam = new Float32Array(drawableSegments * 6);
  const start = [0, 0, 0];
  const end = [0, 0, 0];
  let segment = 0;
  /**
   * Walk position into the flattened `(x, y)` polyline array. Deliberately not named `point`: the node
   * loop above uses that for a ship-frame node position.
   */
  let edgePoint = 0;
  for (let index = 0; index < edgeCount; index += 1) {
    const points = trace.edges.pointCounts[index];
    const exam = trace.edges.examFrame[index];
    if (trace.edges.onPath[index] !== 1) {
      for (let step = 0; step < points - 1; step += 1) {
        // The polyline is a contiguous run of (x, y) pairs in the anchored plane; ship it Y-up.
        const ax = trace.edges.coords[(edgePoint + step) * 2];
        const ay = trace.edges.coords[(edgePoint + step) * 2 + 1];
        const bx = trace.edges.coords[(edgePoint + step + 1) * 2];
        const by = trace.edges.coords[(edgePoint + step + 1) * 2 + 1];
        start[0] = ax;
        start[1] = config.search.y;
        start[2] = -ay;
        end[0] = bx;
        end[1] = config.search.y;
        end[2] = -by;
        for (let corner = 0; corner < 6; corner += 1) {
          const vertex = segment * 6 + corner;
          const spec = QUAD_CORNERS[corner];
          const centre = spec[0] === 0 ? start : end;
          edgeCentreA[vertex * 3] = centre[0];
          edgeCentreA[vertex * 3 + 1] = centre[1];
          edgeCentreA[vertex * 3 + 2] = centre[2];
          // The SEGMENT's own direction, so the ribbon's width is perpendicular to the piece of road it
          // covers - which is what lets the polyline bend without the ribbon shearing.
          edgeCentreB[vertex * 3] = end[0] - start[0];
          edgeCentreB[vertex * 3 + 1] = end[1] - start[1];
          edgeCentreB[vertex * 3 + 2] = end[2] - start[2];
          edgeSide[vertex] = spec[1];
          edgeCorner[vertex * 2] = spec[2];
          edgeCorner[vertex * 2 + 1] = spec[3];
          edgeExam[vertex] = exam;
        }
        segment += 1;
      }
    }
    edgePoint += points;
  }
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgeCentreA, 3));
  edgeGeometry.setAttribute('aDirection', new THREE.BufferAttribute(edgeCentreB, 3));
  edgeGeometry.setAttribute('aSide', new THREE.BufferAttribute(edgeSide, 1));
  edgeGeometry.setAttribute('aCornerVec', new THREE.BufferAttribute(edgeCorner, 2));
  edgeGeometry.setAttribute('aExam', new THREE.BufferAttribute(edgeExam, 1));
  edgeGeometry.setDrawRange(0, drawableSegments * 6);
  const drawableEdges = edgeCount - skippedOnPath;

  // ------------------------------------------------------------------ SearchRevisions
  // The path revisions: the connections A* re-parented a node through. Their own draw call, because a
  // revision is a different EVENT from "this road was examined" (docs/11 §4.2b) - it is the algorithm
  // improving a tentative solution, and the brief asks for it to be visible rather than reported.
  const improvementCount = trace.improvements.a.length;
  const revisionCentre = new Float32Array(improvementCount * 6 * 3);
  const revisionDirection = new Float32Array(improvementCount * 6 * 3);
  const revisionSide = new Float32Array(improvementCount * 6);
  const revisionCorner = new Float32Array(improvementCount * 6 * 2);
  const revisionFrame = new Float32Array(improvementCount * 6);
  for (let index = 0; index < improvementCount; index += 1) {
    shipPosition(trace.improvements.a[index], start);
    shipPosition(trace.improvements.b[index], end);
    const frame = trace.improvements.frame[index];
    for (let corner = 0; corner < 6; corner += 1) {
      const vertex = index * 6 + corner;
      const spec = QUAD_CORNERS[corner];
      const centre = spec[0] === 0 ? start : end;
      revisionCentre[vertex * 3] = centre[0];
      revisionCentre[vertex * 3 + 1] = centre[1];
      revisionCentre[vertex * 3 + 2] = centre[2];
      revisionDirection[vertex * 3] = end[0] - start[0];
      revisionDirection[vertex * 3 + 1] = end[1] - start[1];
      revisionDirection[vertex * 3 + 2] = end[2] - start[2];
      revisionSide[vertex] = spec[1];
      revisionCorner[vertex * 2] = spec[2];
      revisionCorner[vertex * 2 + 1] = spec[3];
      revisionFrame[vertex] = frame;
    }
  }
  const revisionGeometry = new THREE.BufferGeometry();
  revisionGeometry.setAttribute('position', new THREE.BufferAttribute(revisionCentre, 3));
  revisionGeometry.setAttribute('aDirection', new THREE.BufferAttribute(revisionDirection, 3));
  revisionGeometry.setAttribute('aSide', new THREE.BufferAttribute(revisionSide, 1));
  revisionGeometry.setAttribute('aCornerVec', new THREE.BufferAttribute(revisionCorner, 2));
  revisionGeometry.setAttribute('aExam', new THREE.BufferAttribute(revisionFrame, 1));
  revisionGeometry.setDrawRange(0, improvementCount * 6);
  if (improvementCount === 0) {
    warnings.push('the trace records no cheaper-path revision - the revision layer would be empty');
  }

  const nodeMaterial = createSearchNodeMaterial(config);
  const edgeMaterial = createSearchEdgeMaterial(config);
  const revisionMaterial = createRevisionMaterial(config);

  const nodes = new THREE.Mesh(nodeGeometry, nodeMaterial.material);
  nodes.name = 'SearchNodes';
  // Frustum culling is off on the search meshes: their quads are built inside the vertex shader, so a
  // bounding sphere computed from the raw attribute data is not the sphere of what gets drawn, and the
  // shader's own cull (a vertex outside the clip volume) is the authoritative one. Letting the
  // renderer cull as well would make the layer vanish for whole stretches of the flight.
  nodes.frustumCulled = false;
  // docs/11 §4.1: the city fades to opacity 0 but keeps writing depth, so a ground-level search layer
  // would be occluded by an invisible city. The search is therefore drawn OVER the map; the amber
  // solution deliberately is not (HANDOFF §10). Explicit render order keeps the roads under the
  // points, and the revisions on top of both, without depth-testing any of them.
  nodes.renderOrder = 3;
  const edges = new THREE.Mesh(edgeGeometry, edgeMaterial.material);
  edges.name = 'SearchEdges';
  edges.frustumCulled = false;
  edges.renderOrder = 2;
  const revisions = new THREE.Mesh(revisionGeometry, revisionMaterial.material);
  revisions.name = 'SearchRevisions';
  revisions.frustumCulled = false;
  revisions.renderOrder = 4;
  scene.add(revisions);
  scene.add(edges);
  scene.add(nodes);

  // ------------------------------------------------------------------ per-frame CPU mirrors
  const hold = config.search.examineHoldEvents * framesPerEvent;
  const goalFrame = trace.winner.goalSettledFrame;
  const revealScale = trace.revealScale;
  const revealSteps = trace.finalPath.reveal;

  /**
   * The step at which the route's reveal fraction reaches `reveal`, found by binary search over the
   * baked monotone timeline (the ETL asserts monotonicity, so this is exact rather than approximate).
   * Step 0 is the start of the chain and the last step is the goal, so reveal 1 -> 0 walks the chain
   * backwards the way the brief's phase E describes.
   */
  function stepForReveal(reveal) {
    // Clamped at both ends before the search, not inside it: `reveal` is 1 everywhere before the
    // reconstruction begins and 0 when it completes, and an unclamped bracket would hand the caller
    // `revealSteps.length` - one past the chain.
    const target = reveal * revealScale;
    const last = revealSteps.length - 1;
    if (target <= revealSteps[0]) {
      return 0;
    }
    if (target >= revealSteps[last]) {
      return last;
    }
    let low = 0;
    let high = last;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (revealSteps[mid] >= target) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    return low;
  }

  // The expansion frames and their f values, shipped in search order: `bestF` at a frame is the f of
  // the most recently expanded node, which is exactly the best known f on the frontier.
  const expansionFrames = new Float32Array(trace.expansions.frame.length);
  const expansionF = new Float32Array(trace.expansions.frame.length);
  for (let index = 0; index < expansionFrames.length; index += 1) {
    expansionFrames[index] = trace.expansions.frame[index];
    expansionF[index] = trace.expansions.f[index];
  }
  function bestFrontierF(frame) {
    let low = 0;
    let high = expansionFrames.length - 1;
    let found = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (expansionFrames[mid] <= frame) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return expansionF[found] ?? 0;
  }

  /**
   * The route's replay state at a `u_progress`: where the reconstruction front is, and whether the
   * answer exists at all.
   *
   * This is the ONE definition of those two values. The route shader, `window.__SEARCH_PROBE`, the
   * camera's aim and the runtime gates all read it, so a harness can never disagree with the picture
   * about where the answer begins. `reveal` is 1 (the goal) at `freezeEnd` and falls to 0 (the start)
   * at `u = 1`; `pulse` is a smoothstep of the same window so the head eases in rather than appearing on
   * a jump cut. Before `freezeEnd` both are exactly 0 - the answer is ABSENT, not dim.
   *
   * @param {number} u `u_progress`, 0..1
   * @returns {{ reveal: number, pulse: number, step: number }}
   */
  function routeState(u) {
    // ONE definition, imported from the route material: reveal 1 -> 0 walking back from the goal, pulse
    // a smoothstep of the same window. The route shader, this probe, the camera aim and the runtime
    // gates all read it, so a harness can never disagree with the picture about where the answer begins.
    const state = routeReplayState(u, config);
    return { reveal: state.reveal, pulse: state.pulse, step: stepForReveal(state.reveal) };
  }

  let lastRouteState = routeState(0);

  /**
   * The shipping replay state at a `u_progress`. Pure: renders nothing, mutates nothing. This is what
   * `window.__SEARCH_PROBE` returns and what every runtime gate sweeps, so a mirror that disagreed
   * with the shader is caught numerically rather than by eye.
   *
   * @param {number} u `u_progress`, 0..1
   * @returns {object|null} JSON-safe state; null for a non-finite argument
   */
  function probe(u) {
    if (typeof u !== 'number' || !Number.isFinite(u)) {
      return null;
    }
    const phase = phases(u, config.search);
    const state = renderState(config, u);
    const frame = state.frame;
    const bestF = state.bestF;
    const route = routeState(u);

    let frontier = 0;
    let settled = 0;
    const active = [];
    for (let index = 0; index < nodeCount; index += 1) {
      const arrival = trace.nodes.arrivalFrame[index];
      if (arrival < 0 || frame < arrival) {
        continue;
      }
      const settle = trace.nodes.settleFrame[index];
      if (settle >= 0 && frame >= settle) {
        settled += 1;
        continue;
      }
      frontier += 1;
      if (active.length < MAX_FRONTIER_REPORT) {
        const g = trace.nodes.gM[index];
        const h = trace.nodes.h[index];
        active.push({
          node: index,
          arrival,
          g,
          h,
          f: g + h,
          gain: priorityGain(g + h, bestF, config.search),
          coord: trace.nodes.coords[index]
        });
      }
    }

    let visibleEdges = 0;
    let examining = 0;
    for (let index = 0; index < edgeCount; index += 1) {
      if (trace.edges.onPath[index] === 1) {
        continue;
      }
      const delta = frame - trace.edges.examFrame[index];
      if (delta < 0) {
        continue;
      }
      visibleEdges += 1;
      if (delta <= hold) {
        examining += 1;
      }
    }

    return {
      u,
      frame,
      searchFrac: phase.searchFrac,
      frozen: phase.frozen,
      final: phase.final,
      reveal: route.reveal,
      pulse: route.pulse,
      step: route.step,
      bestF: Number.isFinite(bestF) ? bestF : null,
      frontier,
      settled,
      visibleEdges,
      examining,
      goalFrame,
      goalReached: frame >= goalFrame,
      active: active.slice(0, 64)
    };
  }

  /**
   * The replay frame and live best priority for a `u_progress`. Shared by `probe` and `sync` so the
   * uniform the shader gets and the number a harness reads are the same arithmetic.
   */
  function renderState(next, progress) {
    const phase = phases(progress, next.search);
    const raw = Math.round(phase.searchFrac * goalFrame);
    const frame = Math.min(goalFrame, Math.max(0, raw));
    return { phase, frame, bestF: bestFrontierF(frame) };
  }

  /**
   * Push config + progress into the uniforms. Called once per frame from the render path.
   *
   * @param {typeof config} next the live config singleton
   * @param {number} progress `u_progress`, 0..1
   */
  function sync(next, progress) {
    const state = renderState(next, progress);
    lastRouteState = routeState(progress);
    nodeMaterial.sync(next, state.frame, state.phase, framesPerEvent, state.bestF);
    edgeMaterial.sync(next, state.frame, state.phase, framesPerEvent);
    revisionMaterial.sync(next, state.frame, framesPerEvent, state.phase);
  }

  const fingerprint = {
    checks: {
      ...checks,
      drawableEdges,
      // The budget counts every search quad, including the revision layer, because they all cost fill.
      skippedOnPath,
      /**
       * The number of winning roads the ribbon layer REFUSED to draw. The check that matters is that
       * this equals the trace's own on-path count and that none of them is in the drawable set, so the
       * layer cannot quietly paint the answer as if it were still being searched.
       */
      onPathEdges: skippedOnPath,
      nodeVertices: nodeCount * 6,
      improvementCount,
      improvementVertices: improvementCount * 6,
      // The edge buffer is one quad per SEGMENT of each drawable road's real polyline. `edgeSegments`
      // is what the draw range covers: an examined road whose own two endpoints the trace marks as the
      // winning path is excluded entirely.
      edgeVertices: drawableSegments * 6,
      edgeDrawVertices: drawableSegments * 6,
      edgeSegments: drawableSegments,
      triangles: (nodeCount + drawableSegments + improvementCount) * 2,
      quadBudget: MAX_SEARCH_QUADS,
      frontierBandEvents: config.search.frontierBandEvents,
      examineHoldEvents: config.search.examineHoldEvents,
      replayEnd: config.search.replayEnd,
      freezeEnd: config.search.freezeEnd
    },
    warnings
  };
  if (nodeCount + drawableSegments + improvementCount > MAX_SEARCH_QUADS) {
    warnings.push(
      `the trace needs ${nodeCount + drawableSegments + improvementCount} quads, ${MAX_SEARCH_QUADS} is the layer budget: `
        + 'raise MAX_SEARCH_QUADS deliberately rather than letting a bake blow the fill budget'
    );
  }

  return {
    objects: { nodes, edges, revisions },
    materials: {
      nodes: nodeMaterial.material,
      edges: edgeMaterial.material,
      revisions: revisionMaterial.material
    },
    sync,
    probe,
    fingerprint,
    /**
     * The route's replay state at a `u`, as of the last `sync()`. `routeState` is pure and is what a
     * harness calls; `routeStateNow` is what the render path already applied, so the engine can hand
     * the live uniforms to the route material without recomputing them.
     */
    routeState,
    routeStateNow: () => lastRouteState,
    mirror: {
      phases,
      priorityGain,
      frontierResponse,
      settledResponse,
      edgeResponse,
      stepForReveal,
      routeState,
      trace
    }
  };
}
