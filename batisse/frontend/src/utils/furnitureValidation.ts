import type { Issue } from '../api/types'
import type { FurnitureInstance } from '../api/types'
import type { FurnitureAsset } from '../api/types'
import type { FloorPlanGeometry } from '../api/types'

export interface FurnitureValidationContext {
  instances: FurnitureInstance[]
  assets: Map<number, FurnitureAsset>
  geometry: FloorPlanGeometry
}

export function validateFurniture(ctx: FurnitureValidationContext): Issue[] {
  const issues: Issue[] = []
  const floor = ctx.geometry.floors[0]
  const rooms = floor?.rooms ?? []
  const walls = floor?.walls ?? []
  const openings = floor?.openings ?? []

  // build room polygon lookup
  const roomById = new Map(rooms.map((r) => [r.id, r]))

  // overlap between instances (bounding boxes in XZ)
  const boxes = ctx.instances.map((inst) => {
    const asset = ctx.assets.get(inst.asset_id)
    const w = (asset?.width ?? 1) * inst.scale_x
    const d = (asset?.depth ?? 1) * inst.scale_z
    const cx = inst.pos_x
    const cz = inst.pos_z
    // rotate by rot_y (yaw) around vertical: approximate axis-aligned bbox (no rotation for simplicity)
    return { inst, minx: cx - w / 2, maxx: cx + w / 2, minz: cz - d / 2, maxz: cz + d / 2 }
  })

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.maxx > b.minx && b.maxx > a.minx && a.maxz > b.minz && b.maxz > a.minz) {
        issues.push({
          severity: 'warning',
          code: 'furniture_overlap',
          message: `Furniture instances ${a.inst.id} and ${b.inst.id} overlap.`,
          ref: String(b.inst.id),
        })
      }
    }
  }

  for (const inst of ctx.instances) {
    const asset = ctx.assets.get(inst.asset_id)
    const room = inst.room_id ? roomById.get(inst.room_id) : null

    // outside room
    if (room) {
      // check center inside polygon using pointInPolygon (import inline)
      if (!pointInPolygonSimple([inst.pos_x, inst.pos_z], room.polygon)) {
        issues.push({
          severity: 'warning',
          code: 'furniture_outside_room',
          message: `Furniture instance ${inst.id} is outside room '${room.name}'.`,
          ref: String(inst.id),
        })
      }
    }

    // wall intersection: check if bbox crosses any wall segment
    const w = (asset?.width ?? 1) * inst.scale_x
    const d = (asset?.depth ?? 1) * inst.scale_z
    const cx = inst.pos_x
    const cz = inst.pos_z
    for (const wall of walls) {
      // distance from wall segment to center; if less than half-extent treat as intersecting
      const dist = pointSegmentDist2D([cx, cz], wall.start, wall.end)
      const reach = Math.max(wall.thickness, 0.05) / 2 + Math.min(w, d) / 2
      if (dist < reach * 0.6) {
        issues.push({
          severity: 'warning',
          code: 'furniture_hits_wall',
          message: `Furniture instance ${inst.id} may intersect a wall.`,
          ref: String(inst.id),
        })
        break
      }
    }

    // door clearance
    for (const op of openings) {
      if (op.type !== 'door') continue
      if (!op.wall_id) continue
      const wall = walls.find((w) => w.id === op.wall_id)
      if (!wall) continue
      const dist = pointSegmentDist2D([cx, cz], wall.start, wall.end)
      // project onto wall
      const segLen = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
      if (segLen < 1e-9) continue
      const dir = [(wall.end[0] - wall.start[0]) / segLen, (wall.end[1] - wall.start[1]) / segLen]
      const offset = (cx - wall.start[0]) * dir[0] + (cz - wall.start[1]) * dir[1]
      const doorCenter = op.offset ?? offset
      if (Math.abs(offset - doorCenter) < (op.width / 2 + Math.min(w, d) / 2 + 0.3) && dist < 1.0) {
        issues.push({
          severity: 'warning',
          code: 'furniture_blocks_door',
          message: `Furniture instance ${inst.id} may block a doorway.`,
          ref: String(inst.id),
        })
        break
      }
    }

    // estimated dimensions warning
    if (!asset?.dimensions_confirmed) {
      issues.push({
        severity: 'info',
        code: 'furniture_dimensions_estimated',
        message: `Furniture instance ${inst.id} uses estimated dimensions; confirm in the asset library for reliable fit checks.`,
        ref: String(inst.id),
      })
    }
  }

  return issues
}

function pointInPolygonSimple(p: [number, number], poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function pointSegmentDist2D(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1])
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}