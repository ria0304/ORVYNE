import type * as THREE from 'three'

/** A solid wall piece in plan space (x, z) with half-thickness `r`. */
export interface WallCollider {
  ax: number
  az: number
  bx: number
  bz: number
  r: number
}

export const PLAYER_RADIUS = 0.3

/**
 * Push a circle (the player) out of every wall piece it overlaps.
 * Mutates `pos`. A few passes settle corners where two walls meet.
 * Door and window-above gaps are simply absent from `colliders`, so openings stay walkable.
 */
export function resolveCollisions(pos: THREE.Vector3, colliders: readonly WallCollider[], radius = PLAYER_RADIUS): void {
  if (!colliders.length) return
  for (let pass = 0; pass < 3; pass++) {
    let moved = false
    for (const c of colliders) {
      const dx = c.bx - c.ax, dz = c.bz - c.az
      const lenSq = dx * dx + dz * dz
      const t = lenSq > 0 ? Math.max(0, Math.min(1, ((pos.x - c.ax) * dx + (pos.z - c.az) * dz) / lenSq)) : 0
      const qx = c.ax + dx * t, qz = c.az + dz * t
      let nx = pos.x - qx, nz = pos.z - qz
      const dist = Math.hypot(nx, nz)
      const min = radius + c.r
      if (dist >= min) continue
      if (dist < 1e-6) {
        // exactly on the wall line: step out along the wall normal
        const len = Math.sqrt(lenSq) || 1
        nx = -dz / len
        nz = dx / len
      } else {
        nx /= dist
        nz /= dist
      }
      const push = min - Math.max(dist, 0)
      pos.x += nx * push
      pos.z += nz * push
      moved = true
    }
    if (!moved) break
  }
}
