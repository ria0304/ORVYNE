import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export enum SceneType {
  ACTUAL_BATISSE = 'actual_batisse',
  GEOMETRY_DERIVED = 'geometry_derived',
  PLACEHOLDER = 'placeholder',
}

const mat = (color: number) => new THREE.MeshStandardMaterial({ color })

function baseRoom(group: THREE.Group, w = 10, d = 10) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0x2a2e37))
  floor.rotation.x = -Math.PI / 2
  group.add(floor)
}

export function createPlaceholderScene(): THREE.Group {
  const group = new THREE.Group()
  baseRoom(group)
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 0.3), mat(0x3d4a5e))
  wall.position.set(0, 1.5, -5)
  group.add(wall)
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), mat(0x6b7280))
  sphere.position.set(0, 0.5, 0)
  group.add(sphere)
  return group
}

const ROOM_COLORS: Record<string, number> = {
  bedroom: 0x6b5b7b, living: 0x7a6a55, kitchen: 0x5f7a73, bathroom: 0x5b7a8a, dining: 0x7a5f55,
  hallway: 0x66625a, balcony: 0x5a7a5a, office: 0x5a6a7a, closet: 0x7a5a6a, other: 0x6b6f78,
}

type PlanPoint = [number, number]
type Hole = { from: number; to: number; sill: number; top: number }

/**
 * Build a walkable home from BATISSE's validated geometry (FloorPlanGeometry).
 * Plan (x, y) maps to world (x, z); metres. Walls are split around doors and
 * windows so rooms are actually connected. Returns null when the geometry is
 * not in metres (scale not yet confirmed), because the dimensions would be wrong.
 */
export function createHomeFromGeometry(geometry: any): { group: THREE.Group; rooms: any[] } | null {
  if (!geometry || geometry.units !== 'm' || !Array.isArray(geometry.floors) || !geometry.floors.length) return null
  const group = new THREE.Group()
  const rooms: any[] = []
  const wallMat = mat(0xd9d4cb)
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x7a5232 })
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9bd1ff, transparent: true, opacity: 0.35 })

  for (const floor of geometry.floors) {
    const y0 = Number(floor.elevation) || 0
    const wallH = Number(floor.wall_height) || 2.7

    for (const room of floor.rooms ?? []) {
      const pts: PlanPoint[] = (room.polygon ?? []).map((p: any) => [Number(p[0]), Number(p[1])] as PlanPoint)
      if (pts.length < 3) continue
      const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, -y)))
      const floorMesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshStandardMaterial({ color: room.color ? parseInt(String(room.color).replace('#', ''), 16) : ROOM_COLORS[room.room_type] ?? ROOM_COLORS.other, side: THREE.DoubleSide }),
      )
      floorMesh.rotation.x = -Math.PI / 2
      floorMesh.position.y = y0 + 0.01
      group.add(floorMesh)
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
      rooms.push({
        room_id: String(room.id), room_name: room.name, room_function: room.room_type,
        center: { x: (minX + maxX) / 2, z: (minY + maxY) / 2 }, width: maxX - minX, depth: maxY - minY,
      })
    }

    const wallById = new Map<string, any>((floor.walls ?? []).map((w: any) => [w.id, w]))
    const holesByWall = new Map<string, Hole[]>()
    for (const op of floor.openings ?? []) {
      const wall = wallById.get(op.wall_id)
      if (!wall) continue
      const [sx, sy] = wall.start, [ex, ey] = wall.end
      const len = Math.hypot(ex - sx, ey - sy) || 1
      const along = typeof op.offset === 'number'
        ? op.offset
        : ((op.position[0] - sx) * (ex - sx) + (op.position[1] - sy) * (ey - sy)) / len
      const from = Math.max(0, along - op.width / 2), to = Math.min(len, along + op.width / 2)
      const sill = Number(op.sill_height) || 0
      const list = holesByWall.get(wall.id) ?? []
      list.push({ from, to, sill, top: Math.min(wallH, sill + Number(op.height)) })
      holesByWall.set(wall.id, list)
      // door leaf / glass pane, set slightly inside the hole
      const pane = new THREE.Mesh(new THREE.BoxGeometry(to - from, Math.max(0.05, Math.min(wallH, sill + Number(op.height)) - sill), 0.03),
        op.type === 'window' ? glassMat : doorMat)
      const t = (from + to) / 2 / len
      pane.position.set(sx + (ex - sx) * t, y0 + sill + (Math.min(wallH, sill + Number(op.height)) - sill) / 2, sy + (ey - sy) * t)
      pane.rotation.y = -Math.atan2(ey - sy, ex - sx)
      if (op.type === 'window') group.add(pane)   // doors stay open so rooms connect
    }

    for (const wall of floor.walls ?? []) {
      const [sx, sy] = wall.start, [ex, ey] = wall.end
      const len = Math.hypot(ex - sx, ey - sy)
      if (len < 1e-6) continue
      const ang = -Math.atan2(ey - sy, ex - sx)
      const th = Number(wall.thickness) || 0.15
      const h = Number(wall.height) || wallH
      const piece = (a: number, b: number, bottom: number, top: number) => {
        if (b - a < 0.01 || top - bottom < 0.01) return
        const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, top - bottom, th), wallMat)
        const t = (a + b) / 2 / len
        m.position.set(sx + (ex - sx) * t, y0 + (bottom + top) / 2, sy + (ey - sy) * t)
        m.rotation.y = ang
        group.add(m)
      }
      const holes = (holesByWall.get(wall.id) ?? []).sort((p, q) => p.from - q.from)
      let cursor = 0
      for (const hole of holes) {
        piece(cursor, hole.from, 0, h)               // solid wall up to the opening
        if (hole.sill > 0.01) piece(hole.from, hole.to, 0, hole.sill)   // below a window
        piece(hole.from, hole.to, hole.top, h)       // above a door / window
        cursor = Math.max(cursor, hole.to)
      }
      piece(cursor, len, 0, h)
    }
  }

  if (!rooms.length) return null
  return { group, rooms }
}

export async function loadActualBatisseGLB(glbBase64: string): Promise<THREE.Group | null> {
  if (!glbBase64) return null
  let url = ''
  try {
    const bytes = Uint8Array.from(atob(glbBase64), c => c.charCodeAt(0))
    url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }))
    const gltf = await new GLTFLoader().loadAsync(url)
    return gltf.scene
  } catch (e) {
    console.error('Failed to load BATISSE GLB:', e)
    return null
  } finally {
    if (url) URL.revokeObjectURL(url)
  }
}

/** Where the player should start so the home is in front of them. */
export function spawnFor(model: THREE.Object3D | null): THREE.Vector3 {
  if (!model) return new THREE.Vector3(0, 0, 8)
  const box = new THREE.Box3().setFromObject(model)
  if (box.isEmpty()) return new THREE.Vector3(0, 0, 8)
  const c = box.getCenter(new THREE.Vector3())
  return new THREE.Vector3(c.x, 0, box.max.z + 3)
}

export function disposeObject(obj: THREE.Object3D) {
  obj.traverse(o => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const material = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(material)) material.forEach(x => x.dispose())
    else material?.dispose()
  })
}
