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

/**
 * Street class for the glow look: 1 = through street, 0 = the rest. Segments are chained across
 * junctions wherever they continue within ~25 degrees of straight; a chain that runs long is an artery.
 * The default look never reads it.
 */
function classifyRoads(flat, share = 0.32) {
  const n = flat.length / 4
  const parent = Int32Array.from({ length: n }, (_, i) => i)
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]]
    return i
  }
  const ends = new Map()
  const len = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    const ax = flat[i * 4], az = flat[i * 4 + 1], bx = flat[i * 4 + 2], bz = flat[i * 4 + 3]
    len[i] = Math.hypot(bx - ax, bz - az)
    for (const [x, z, ox, oz] of [[ax, az, bx, bz], [bx, bz, ax, az]]) {
      const key = `${Math.round(x * 2)},${Math.round(z * 2)}`
      const d = Math.hypot(ox - x, oz - z) || 1
      if (!ends.has(key)) ends.set(key, [])
      ends.get(key).push({ i, dx: (ox - x) / d, dz: (oz - z) / d })
    }
  }
  for (const list of ends.values()) {
    const used = new Set()
    for (let a = 0; a < list.length; a += 1) {
      let best = -1
      let bestDot = -0.906
      for (let b = 0; b < list.length; b += 1) {
        if (b === a || used.has(b) || list[a].i === list[b].i) continue
        const dot = list[a].dx * list[b].dx + list[a].dz * list[b].dz
        if (dot < bestDot) { bestDot = dot; best = b }
      }
      if (best >= 0 && !used.has(a)) {
        used.add(a)
        used.add(best)
        parent[find(list[a].i)] = find(list[best].i)
      }
    }
  }
  const total = new Float32Array(n)
  for (let i = 0; i < n; i += 1) total[find(i)] += len[i]
  const per = Array.from({ length: n }, (_, i) => total[find(i)])
  const cut = [...per].sort((a, b) => a - b)[Math.floor(n * (1 - share))]
  return per.map((t) => (t >= cut ? 1 : 0))
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
  // Exact, but pruned: nodes sorted by arrival time let the min-search stop once arrival alone beats `best`,
  // and a 120 m bucket grid finds the nearest node by ring search instead of scanning all of them.
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => nts[a] - nts[b])
  const CELL = 120
  const gw = Math.ceil((x1 - x0) / CELL) + 1
  const gh = Math.ceil((z1 - z0) / CELL) + 1
  const buckets = Array.from({ length: gw * gh }, () => [])
  for (let k = 0; k < n; k += 1) {
    const gx = Math.min(gw - 1, Math.max(0, Math.floor((nxs[k] - x0) / CELL)))
    const gz = Math.min(gh - 1, Math.max(0, Math.floor((nzs[k] - z0) / CELL)))
    buckets[gz * gw + gx].push(k)
  }
  const data = new Uint16Array(nx * nz * 2)
  for (let j = 0; j < nz; j += 1) {
    const z = z0 + ((j + 0.5) / nz) * (z1 - z0)
    for (let i = 0; i < nx; i += 1) {
      const x = x0 + ((i + 0.5) / nx) * (x1 - x0)
      let best = 9
      for (let q = 0; q < n; q += 1) {
        const k = order[q]
        if (nts[k] >= best) break
        const dx = x - nxs[k]
        const dz = z - nzs[k]
        const t = nts[k] + Math.sqrt(dx * dx + dz * dz) * pace
        if (t < best) best = t
      }
      let near2 = 2000 * 2000
      const cx = Math.floor((x - x0) / CELL)
      const cz = Math.floor((z - z0) / CELL)
      for (let r = 0; r <= 17; r += 1) {
        // every node in ring r is at least (r - 1) * CELL away
        const lo = (r - 1) * CELL
        if (r > 0 && lo * lo > near2) break
        for (let gz = cz - r; gz <= cz + r; gz += 1) {
          if (gz < 0 || gz >= gh) continue
          const edge = gz === cz - r || gz === cz + r
          for (let gx = cx - r; gx <= cx + r; gx += edge ? 1 : 2 * r || 1) {
            if (gx < 0 || gx >= gw) continue
            const b = buckets[gz * gw + gx]
            for (let m = 0; m < b.length; m += 1) {
              const dx = x - nxs[b[m]]
              const dz = z - nzs[b[m]]
              const d2 = dx * dx + dz * dz
              if (d2 < near2) near2 = d2
            }
          }
        }
      }
      const o = (j * nx + i) * 2
      data[o] = THREE.DataUtils.toHalfFloat(best)
      data[o + 1] = THREE.DataUtils.toHalfFloat(Math.sqrt(near2))
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

/**
 * Slim the baked building mesh. At poster scale a short block (under ~8 m, which the shader halves again)
 * is a roof speck: its walls are sub-pixel, so keep only roofs for it. Taller walls stay, undersides go
 * everywhere (never seen), and vertices are welded.
 */
const WALL_MIN_H = 8
function slimBuildings(src) {
  const pos = src.getAttribute('position').array
  const idx = src.index.array
  const outPos = []
  const outIdx = []
  const remap = new Map()
  const put = (vi) => {
    const x = pos[vi * 3]
    const y = pos[vi * 3 + 1]
    const z = pos[vi * 3 + 2]
    const k = `${Math.round(x * 20)},${Math.round(y * 20)},${Math.round(z * 20)}`
    let v = remap.get(k)
    if (v === undefined) {
      v = outPos.length / 3
      remap.set(k, v)
      outPos.push(x, y, z)
    }
    return v
  }
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3
    const b = idx[i + 1] * 3
    const c = idx[i + 2] * 3
    // geometric normal of the triangle, y component
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    const roof = Math.abs(ny / len) > 0.6
    if (roof) {
      if (pos[a + 1] < 0.01 && pos[b + 1] < 0.01 && pos[c + 1] < 0.01) continue // underside
    } else if (Math.max(pos[a + 1], pos[b + 1], pos[c + 1]) < WALL_MIN_H) {
      continue
    }
    outIdx.push(put(idx[i]), put(idx[i + 1]), put(idx[i + 2]))
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3))
  g.setIndex(new THREE.Uint32BufferAttribute(outIdx, 1))
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
      const klass = classifyRoads(flat)
      const list = []
      for (let i = 0; i < flat.length; i += 4) list.push([flat[i], flat[i + 1], flat[i + 2], flat[i + 3], klass[i / 4], 0])
      return list
    })()
  )

  const route = routePolyline(get('APath'))
  const routeList = []
  for (let i = 0; i + 1 < route.length; i += 1) {
    routeList.push([route[i][1], route[i][2], route[i + 1][1], route[i + 1][2], route[i][0], route[i + 1][0]])
  }

  const buildings = slimBuildings(get('Buildings').geometry)

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
    keyPoints: key,
    // for the HUD of the iso look: nodes reached, in arrival order (0..1 search time), and the route length
    nodeTimes: Float32Array.from(astarTrace.nodes.arrivalFrame, (f) => f / TIME_SCALE).sort(),
    routeLengthM: astarTrace.winner.lengthM,
    nodeTotal: astarTrace.nodeCount
  }
}
