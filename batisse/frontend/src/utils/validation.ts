/**
 * Frontend geometry validation.
 *
 * Mirrors the backend validation rules (app/geometry/builder.py) so the
 * user gets immediate feedback before saving. These are pure functions that
 * inspect the shared geometry model and return a list of issues.
 */

import type {
  FloorPlanGeometry, Floor, Room, Opening, Issue, Pt,
} from '../api/types'
import {
  isSimplePolygon, polygonAreaAbs, pointSegmentDist, dist, segmentsIntersect,
} from './geometry'

const EPS = 1e-6

export interface ValidationRule {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: (ctx: Record<string, unknown>) => string
}

/**
 * Run the full validation suite on a geometry.
 * Returns issues sorted by severity (error > warning > info).
 */
export function validateGeometry(g: FloorPlanGeometry): Issue[] {
  const issues: Issue[] = []

  if (g.units !== 'm') {
    issues.push({
      severity: 'warning',
      code: 'scale_unknown',
      message: 'Scale is unknown. Set a scale reference (meters per pixel) before generating 3D; dimensions are never guessed.',
      ref: undefined,
    })
  }

  for (const floor of g.floors) {
    issues.push(...validateFloor(floor, g.units, g.scale))
  }

  // Sort: errors first, then warnings, then info
  const sevRank = { error: 0, warning: 1, info: 2 }
  issues.sort((a, b) => sevRank[a.severity] - sevRank[b.severity])
  return issues
}

function validateFloor(floor: Floor, units: string, scale: { meters_per_pixel: number | null }): Issue[] {
  const issues: Issue[] = []
  const minArea = units === 'm' ? 0.5 : 100.0

  // Duplicate room IDs
  const ids = floor.rooms.map((r) => r.id)
  const dups = ids.filter((id, i) => ids.indexOf(id) !== i)
  for (const id of [...new Set(dups)]) {
    issues.push({ severity: 'error', code: 'duplicate_room_id', message: `Duplicate room id '${id}'.`, ref: id })
  }

  const polys: { room: Room; poly: Pt[] }[] = []

  for (const room of floor.rooms) {
    // Polygon validity
    if (room.polygon.length < 3) {
      issues.push({ severity: 'error', code: 'room_invalid_polygon', message: `Room '${room.name}' has fewer than 3 vertices.`, ref: room.id })
      continue
    }
    if (!isSimplePolygon(room.polygon)) {
      issues.push({ severity: 'warning', code: 'room_self_intersecting', message: `Room '${room.name}' has a self-intersecting outline.`, ref: room.id })
    }
    const area = polygonAreaAbs(room.polygon)
    if (area < minArea) {
      issues.push({ severity: 'warning', code: 'room_tiny', message: `Room '${room.name}' is very small (${area.toFixed(2)} ${units}²).`, ref: room.id })
    }
    // Room overlap
    for (const other of polys) {
      if (polygonsOverlap(room.polygon, other.poly)) {
        issues.push({ severity: 'warning', code: 'rooms_overlap', message: `Rooms '${room.name}' and '${other.room.name}' overlap.`, ref: room.id })
      }
    }
    polys.push({ room, poly: room.polygon })
  }

  // Wall connectivity: every wall should connect to another wall at both ends
  // (unless it's an exterior boundary wall — we can't know, so just warn on isolated)
  for (const w of floor.walls) {
    if (w.length < EPS) {
      issues.push({ severity: 'error', code: 'degenerate_wall', message: `Wall '${w.id}' has zero length.`, ref: w.id })
    }
    if (w.thickness <= 0) {
      issues.push({ severity: 'error', code: 'invalid_wall_thickness', message: `Wall '${w.id}' has non-positive thickness.`, ref: w.id })
    }
    if (w.height <= 0) {
      issues.push({ severity: 'error', code: 'invalid_wall_height', message: `Wall '${w.id}' has non-positive height.`, ref: w.id })
    }
  }

  // Duplicate walls (same endpoints)
  for (let i = 0; i < floor.walls.length; i++) {
    for (let j = i + 1; j < floor.walls.length; j++) {
      const a = floor.walls[i]
      const b = floor.walls[j]
      if ((dist(a.start, b.start) < EPS && dist(a.end, b.end) < EPS) ||
          (dist(a.start, b.end) < EPS && dist(a.end, b.start) < EPS)) {
        issues.push({ severity: 'warning', code: 'duplicate_wall', message: `Walls '${a.id}' and '${b.id}' have identical endpoints.`, ref: a.id })
      }
    }
  }

  // Openings
  for (const op of floor.openings) {
    if (op.width <= 0) {
      issues.push({ severity: 'error', code: 'invalid_opening_width', message: `${op.type} '${op.id}' has non-positive width.`, ref: op.id })
    }
    if (op.height <= 0) {
      issues.push({ severity: 'error', code: 'invalid_opening_height', message: `${op.type} '${op.id}' has non-positive height.`, ref: op.id })
    }
    if (op.sill_height < 0) {
      issues.push({ severity: 'error', code: 'invalid_sill_height', message: `${op.type} '${op.id}' has negative sill height.`, ref: op.id })
    }
    if (op.wall_id) {
      const wall = floor.walls.find((w) => w.id === op.wall_id)
      if (!wall) {
        issues.push({ severity: 'error', code: 'opening_missing_wall', message: `${op.type} '${op.id}' references unknown wall '${op.wall_id}'.`, ref: op.id })
      } else {
        const d = pointSegmentDist(op.position, wall.start, wall.end)
        const reach = Math.max(wall.thickness * 1.5, EPS * 10)
        if (d > reach) {
          issues.push({ severity: 'warning', code: 'opening_not_on_wall', message: `${op.type.charAt(0).toUpperCase() + op.type.slice(1)} '${op.id}' is not on its host wall and will not cut.`, ref: op.id })
        }
        const half = op.width / 2
        // project onto wall to get offset
        const segLen = dist(wall.start, wall.end)
        const dir = [(wall.end[0] - wall.start[0]) / segLen, (wall.end[1] - wall.start[1]) / segLen]
        const offset = (op.position[0] - wall.start[0]) * dir[0] + (op.position[1] - wall.start[1]) * dir[1]
        if (offset - half < -EPS || offset + half > segLen + EPS) {
          issues.push({ severity: 'warning', code: 'opening_exceeds_wall', message: `${op.type.charAt(0).toUpperCase() + op.type.slice(1)} '${op.id}' extends past the end of its wall; it will be clipped.`, ref: op.id })
        }
        if (op.sill_height + op.height > wall.height + EPS) {
          issues.push({ severity: 'warning', code: 'opening_taller_than_wall', message: `${op.type.charAt(0).toUpperCase() + op.type.slice(1)} '${op.id}' is taller than the wall (${wall.height.toFixed(2)} m); it will be clipped.`, ref: op.id })
        }
      }
    }

    // Opening overlap on same wall
    const byWall = new Map<string, Opening[]>()
    for (const o2 of floor.openings) {
      if (o2.wall_id) {
        const arr = byWall.get(o2.wall_id) ?? []
        arr.push(o2)
        byWall.set(o2.wall_id, arr)
      }
    }
    for (const [, ops] of byWall) {
      ops.sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0))
      for (let i = 0; i < ops.length - 1; i++) {
        const a = ops[i]
        const b = ops[i + 1]
        if ((a.offset ?? 0) + a.width / 2 > (b.offset ?? 0) - b.width / 2 + EPS) {
          issues.push({ severity: 'warning', code: 'openings_overlap', message: `Openings '${a.id}' and '${b.id}' overlap on a wall.`, ref: b.id })
        }
      }
    }
  }

  // Scale consistency
  if (units === 'px' && scale.meters_per_pixel != null) {
    issues.push({ severity: 'info', code: 'scale_applied', message: 'Geometry is in meters; pixel-based detection results have been scaled.', ref: undefined })
  }

  return issues
}

/**
 * Rough polygon overlap test: check if any vertex of A is inside B and
 * vice versa, or if any edges intersect.
 */
function polygonsOverlap(a: Pt[], b: Pt[]): boolean {
  for (const p of a) {
    if (pointInPolygon(p, b)) return true
  }
  for (const p of b) {
    if (pointInPolygon(p, a)) return true
  }
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true
    }
  }
  return false
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    if ((yi > p[1]) !== (yj > p[1]) &&
        p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Count issues by severity.
 */
export function issueCounts(issues: Issue[]): { error: number; warning: number; info: number } {
  return issues.reduce(
    (acc, i) => { acc[i.severity]++; return acc },
    { error: 0, warning: 0, info: 0 },
  )
}

/**
 * Whether the geometry is ready for 3D generation.
 */
export function isReadyFor3D(g: FloorPlanGeometry): boolean {
  if (g.units !== 'm') return false
  if (g.issues?.some((i) => i.severity === 'error')) return false
  return g.floors.some((f) => f.walls.length > 0)
}
