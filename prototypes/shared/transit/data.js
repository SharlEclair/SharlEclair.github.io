/**
 * Map data for the scene, prepared once from the baked assets:
 *
 *   public/scene.glb          Buildings, Roads (ribbons), APath (the answer's ribbon)
 *   data/astar-trace.js       the recorded A* execution (nodes with arrival frames, examined edges)
 *   data/ground.js            parks and water, triangulated
 *   data/circuit.js           Albert Park circuit centrelines
 *
 * World frame: Y-up metres, x east, z south (so a trace coordinate [x, y] lives at world (x, -y)).
 * Time is normalised so that 1 = the frame the goal settled.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { astarTrace } from './data/astar-trace.js'
import { ground } from './data/ground.js'
import { circuit } from './data/circuit.js'

const ASSET_URL = `${import.meta.env?.BASE_URL ?? '/'}scene.glb`

/** The field texture covers this world rectangle (metres). */
export const FIELD = { x0: -1100, x1: 1100, z0: -2900, z1: 2900, nx: 176, nz: 464 }
/** The drawn map fades out toward this world rectangle, so the data never ends in a hard edge. */
export const MAP_BOUNDS = { x: 1000, z: 2750 }

const TIME_SCALE = astarTrace.winner.goalSettledFrame

function roadSegments(roads) {
  const p = roads.geometry.getAttribute('position')
  const out = []
  for (let q = 0; q + 3 < p.count; q += 4) {
    if (Math.abs(p.getY(q) - 0.5) > 1e-3) continue
    // Each core quad is two cross-edges (0,1) and (2,3) of the ribbon; the centreline joins their midpoints.
    out.push(
      (p.getX(q) + p.getX(q + 1)) / 2,
      (p.getZ(q) + p.getZ(q + 1)) / 2,
      (p.getX(q + 2) + p.getX(q + 3)) / 2,
      (p.getZ(q + 2) + p.getZ(q + 3)) / 2
    )
  }
  return new Float32Array(out)
}

function routePolyline(apath) {
  const p = apath.geometry.getAttribute('position')
  const uv = apath.geometry.getAttribute('uv')
  const byU = new Map()
  for (let i = 0; i < uv.count; i += 1) {
    if (uv.getY(i) >= 0.5) continue // the 8 m core strip only
    const u = uv.getX(i)
    if (!byU.has(u)) byU.set(u, [])
    byU.get(u).push(i)
  }
  const pts = []
  for (const [u, ix] of byU) {
    const a = ix[0]
    const b = ix.length > 1 ? ix[1] : ix[0]
    pts.push([u, (p.getX(a) + p.getX(b)) / 2, (p.getZ(a) + p.getZ(b)) / 2])
  }
  pts.sort((a, b) => a[0] - b[0])
  return pts
}

/** Segments as [ax, az, bx, bz] + per-segment data [d0, d1]. */
function packSegments(list) {
  const seg = new Float32Array(list.length * 4)
  const dat = new Float32Array(list.length * 2)
  list.forEach((s, i) => {
    seg.set(s.slice(0, 4), i * 4)
    dat[i * 2] = s[4]
    dat[i * 2 + 1] = s[5]
  })
  return { seg, dat, count: list.length }
}

function exploredEdges() {
  const e = astarTrace.edges
  const list = []
  let offset = 0
  for (let i = 0; i < e.a.length; i += 1) {
    const n = e.pointCounts[i]
    const t = e.examFrame[i] / TIME_SCALE
    for (let k = 0; k + 1 < n; k += 1) {
      const ax = e.coords[(offset + k) * 2]
      const az = -e.coords[(offset + k) * 2 + 1]
      const bx = e.coords[(offset + k + 1) * 2]
      const bz = -e.coords[(offset + k + 1) * 2 + 1]
      list.push([ax, az, bx, bz, t, e.onPath[i]])
    }
    offset += n
  }
  return packSegments(list)
}

function circuitSegments() {
  const list = []
  for (const line of circuit.polylines) {
    for (let k = 0; k + 1 < line.length; k += 1) {
      list.push([line[k][0], line[k][1], line[k + 1][0], line[k + 1][1], 0, 0])
    }
  }
  return packSegments(list)
}

/**
 * Travel-time field: for every texel the earliest moment the search could have reached it,
 * min over reached nodes of (arrival + distance * pace), plus the distance to the nearest reached node.
 * Stored as half-float RG (R = time, G = metres to the nearest node).
 */
function buildField() {
  const { x0, x1, z0, z1, nx, nz } = FIELD
  const nodes = astarTrace.nodes
  const n = nodes.coords.length
  const nxs = new Float32Array(n)
  const nzs = new Float32Array(n)
  const nts = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    nxs[i] = nodes.coords[i][0]
    nzs[i] = -nodes.coords[i][1]
    nts[i] = nodes.arrivalFrame[i] / TIME_SCALE
  }
  const pace = 1 / 2600 // normalised time per metre
  const data = new Uint16Array(nx * nz * 2)
  for (let j = 0; j < nz; j += 1) {
    const z = z0 + ((j + 0.5) / nz) * (z1 - z0)
    for (let i = 0; i < nx; i += 1) {
      const x = x0 + ((i + 0.5) / nx) * (x1 - x0)
      let best = 9
      let near = 1e5
      for (let k = 0; k < n; k += 1) {
        const dx = x - nxs[k]
        const dz = z - nzs[k]
        const d = Math.sqrt(dx * dx + dz * dz)
        const t = nts[k] + d * pace
        if (t < best) best = t
        if (d < near) near = d
      }
      const o = (j * nx + i) * 2
      data[o] = THREE.DataUtils.toHalfFloat(best)
      data[o + 1] = THREE.DataUtils.toHalfFloat(Math.min(near, 2000))
    }
  }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RGFormat, THREE.HalfFloatType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

function groundGeometry() {
  const { position, layer, count } = ground.vertices
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    pos[i * 3] = position[i * 3]
    pos[i * 3 + 1] = 0
    pos[i * 3 + 2] = position[i * 3 + 2]
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  // aLayer: 0 park, 1 water. The baked circuit surface (2) is drawn from its centrelines instead.
  const keep = []
  for (let i = 0; i < count; i += 3) {
    if (layer[i] < 1.5) keep.push(i, i + 1, i + 2)
  }
  const kp = new Float32Array(keep.length * 3)
  const kl = new Float32Array(keep.length)
  keep.forEach((src, i) => {
    kp.set(pos.subarray(src * 3, src * 3 + 3), i * 3)
    kl[i] = layer[src]
  })
  g.setAttribute('position', new THREE.BufferAttribute(kp, 3))
  g.setAttribute('aLayer', new THREE.BufferAttribute(kl, 1))
  return g
}

export async function loadMapData() {
  const gltf = await new GLTFLoader().loadAsync(ASSET_URL)
  const get = (name) => {
    const o = gltf.scene.getObjectByName(name)
    if (!o || !o.isMesh) throw new Error(`scene.glb is missing "${name}"`)
    return o
  }
  const roads = packSegments(
    (() => {
      const flat = roadSegments(get('Roads'))
      const list = []
      for (let i = 0; i < flat.length; i += 4) list.push([flat[i], flat[i + 1], flat[i + 2], flat[i + 3], 0, 0])
      return list
    })()
  )

  const route = routePolyline(get('APath'))
  const routeList = []
  for (let i = 0; i + 1 < route.length; i += 1) {
    routeList.push([route[i][1], route[i][2], route[i + 1][1], route[i + 1][2], route[i][0], route[i + 1][0]])
  }

  const buildings = get('Buildings').geometry
  for (const name of Object.keys(buildings.attributes)) {
    if (name !== 'position') buildings.deleteAttribute(name)
  }

  const circ = circuitSegments()
  const key = []
  for (const r of route) key.push([r[1], r[2]])
  for (const line of circuit.polylines) for (const p of line) key.push([p[0], p[1]])

  return {
    roads,
    route: packSegments(routeList),
    routeStart: [route[0][1], route[0][2]],
    routeEnd: [route[route.length - 1][1], route[route.length - 1][2]],
    explored: exploredEdges(),
    circuit: circ,
    circuitCentre: circuit.centre,
    field: buildField(),
    ground: groundGeometry(),
    buildings,
    keyPoints: key
  }
}
