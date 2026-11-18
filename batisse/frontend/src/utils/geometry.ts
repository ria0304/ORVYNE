/**
 * Coordinate transformation utilities for the unified 2D–3D geometry model.
 *
 * Convention:
 * - Plan (2D) space: +X right, +Y down (image coordinates), units in `px` or `m`.
 * - 3D space: +X right, +Y up, +Z toward viewer (plan +Y maps to 3D +Z).
 * - All vertical quantities (wall height, opening height, sill height, slab
 *   thickness, elevation) are always in meters.
 *
 * Scale is applied exactly once: pixel geometry -> meters via meters_per_pixel.
 */

import type { Pt, Scale, Units } from '../api/types'

const EPS = 1e-6

/**
 * Convert a plan coordinate (x, y) to a 3D coordinate (x, z).
 * Plan +Y maps to 3D +Z.
 */
export function planTo3D(p: Pt): [number, number] {
  return [p[0], p[1]]
}

/**
 * Convert a 3D horizontal coordinate (x, z) back to plan (x, y).
 */
export function plan3DToPlan(x: number, z: number): Pt {
  return [x, z]
}

/**
 * Convert pixel plan coordinates to meters using meters_per_pixel.
 * Returns null if scale is unknown.
 */
export function pxToMeters(
  value: number,
  scale: Scale | null,
): number | null {
  if (!scale || scale.meters_per_pixel == null) return null
  return value * scale.meters_per_pixel
}

/**
 * Convert meters to pixel plan coordinates.
 * Returns null if scale is unknown.
 */
export function metersToPx(
  value: number,
  scale: Scale | null,
): number | null {
  if (!scale || scale.meters_per_pixel == null) return null
  return value / scale.meters_per_pixel
}

/**
 * Apply scale to a single plan point. Returns null if scale unknown.
 */
export function scalePoint(
  p: Pt,
  scale: Scale | null,
): [number, number] | null {
  const mpp = scale?.meters_per_pixel
  if (mpp == null) return null
  return [p[0] * mpp, p[1] * mpp]
}

/**
 * Apply scale to all points in a polygon. Returns null if scale unknown.
 */
export function scalePolygon(
  poly: Pt[],
  scale: Scale | null,
): Pt[] | null {
  if (!scale || scale.meters_per_pixel == null) return null
  const mpp = scale.meters_per_pixel
  return poly.map(([x, y]) => [x * mpp, y * mpp])
}

/**
 * Compute the signed area of a polygon (shoelace formula).
 * Positive = counter-clockwise (in standard math coords).
 */
export function polygonArea(poly: Pt[]): number {
  let area = 0
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length
    area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1]
  }
  return area / 2
}

/**
 * Compute the absolute area of a polygon.
 */
export function polygonAreaAbs(poly: Pt[]): number {
  return Math.abs(polygonArea(poly))
}

/**
 * Compute bounding box of a polygon.
 */
export function polygonBounds(poly: Pt[]): {
  minX: number; minY: number; maxX: number; maxY: number
} | null {
  if (poly.length === 0) return null
  let minX = poly[0][0], minY = poly[0][1]
  let maxX = poly[0][0], maxY = poly[0][1]
  for (const [x, y] of poly) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Distance between two points.
 */
export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

/**
 * Distance from point p to segment ab.
 */
export function pointSegmentDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 < EPS) return dist(p, a)
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/**
 * Check if a point is inside a polygon (ray casting).
 */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
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
 * Check if two segments intersect (proper or improper).
 */
export function segmentsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  const dir = (p: Pt, q: Pt, r: Pt) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = dir(b1, b2, a1)
  const d2 = dir(b1, b2, a2)
  const d3 = dir(a1, a2, b1)
  const d4 = dir(a1, a2, b2)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  if (d1 === 0 && pointSegmentDist(a1, b1, b2) < EPS) return true
  if (d2 === 0 && pointSegmentDist(a2, b1, b2) < EPS) return true
  if (d3 === 0 && pointSegmentDist(b1, a1, a2) < EPS) return true
  if (d4 === 0 && pointSegmentDist(b2, a1, a2) < EPS) return true
  return false
}

/**
 * Check if a polygon is simple (no self-intersections).
 */
export function isSimplePolygon(poly: Pt[]): boolean {
  if (poly.length < 3) return false
  for (let i = 0; i < poly.length; i++) {
    for (let j = i + 1; j < poly.length; j++) {
      const a1 = poly[i]
      const a2 = poly[(i + 1) % poly.length]
      const b1 = poly[j]
      const b2 = poly[(j + 1) % poly.length]
      // skip adjacent edges
      if (i === j || (i + 1) % poly.length === j || i === (j + 1) % poly.length) continue
      if (segmentsIntersect(a1, a2, b1, b2)) return false
    }
  }
  return true
}

/**
 * Check if a polygon is closed (first == last) or implicitly closed.
 * We treat polygons as implicitly closed (last connects to first).
 */
export function isClosedPolygon(poly: Pt[]): boolean {
  return poly.length >= 3
}

/**
 * Compute the centroid of a polygon.
 */
export function polygonCentroid(poly: Pt[]): Pt | null {
  if (poly.length < 3) return null
  let cx = 0, cy = 0, area = 0
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length
    const cross = poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1]
    area += cross
    cx += (poly[i][0] + poly[j][0]) * cross
    cy += (poly[i][1] + poly[j][1]) * cross
  }
  if (Math.abs(area) < EPS) return null
  const factor = 1 / (3 * area)
  return [cx * factor, cy * factor]
}

/**
 * Offset a point along a direction vector.
 */
export function offsetPoint(p: Pt, dx: number, dy: number): Pt {
  return [p[0] + dx, p[1] + dy]
}

/**
 * Normalize a direction vector.
 */
export function normalize(v: [number, number]): [number, number] {
  const len = Math.hypot(v[0], v[1])
  if (len < EPS) return [0, 0]
  return [v[0] / len, v[1] / len]
}

/**
 * Get the unit normal of a wall segment (perpendicular, pointing right of dir).
 */
export function wallNormal(start: Pt, end: Pt): [number, number] {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const len = Math.hypot(dx, dy)
  if (len < EPS) return [0, 0]
  return [dy / len, -dx / len]
}

/**
 * Convert LengthUnit to meters multiplier.
 */
export function unitToMeters(unit: Units | LengthUnit): number {
  switch (unit) {
    case 'm': return 1.0
    case 'cm': return 0.01
    case 'mm': return 0.001
    case 'ft': return 0.3048
    case 'in': return 0.0254
    default: return 1.0
  }
}

export type LengthUnit = 'm' | 'cm' | 'mm' | 'ft' | 'in'
