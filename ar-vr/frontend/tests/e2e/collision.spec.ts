import { test, expect } from '@playwright/test'
import * as THREE from 'three'
import { PLAYER_RADIUS, resolveCollisions, type WallCollider } from '../../src/lib/collision'

// A wall along x from 0..4 at z = 0, 0.15 m thick.
const wall: WallCollider = { ax: 0, az: 0, bx: 4, bz: 0, r: 0.075 }

test.describe('wall collision (pure maths, no browser)', () => {
  test('walking into a wall is stopped at the player radius', () => {
    const p = new THREE.Vector3(2, 0, 0.1) // inside the wall
    resolveCollisions(p, [wall])
    expect(p.z).toBeGreaterThanOrEqual(PLAYER_RADIUS + wall.r - 1e-6)
    expect(p.x).toBeCloseTo(2, 5) // pushed straight out, not sideways
  })

  test('standing clear of the wall is left alone', () => {
    const p = new THREE.Vector3(2, 0, 1)
    resolveCollisions(p, [wall])
    expect(p.z).toBe(1)
  })

  test('a doorway gap lets the player through', () => {
    const left: WallCollider = { ax: 0, az: 0, bx: 1.5, bz: 0, r: 0.075 }
    const right: WallCollider = { ax: 2.5, az: 0, bx: 4, bz: 0, r: 0.075 }
    const p = new THREE.Vector3(2, 0, 0) // standing in the 1 m opening
    resolveCollisions(p, [left, right])
    expect(p.x).toBe(2)
    expect(p.z).toBe(0)
  })

  test('a corner pushes the player out of both walls', () => {
    const a: WallCollider = { ax: 0, az: 0, bx: 4, bz: 0, r: 0.075 }
    const b: WallCollider = { ax: 0, az: 0, bx: 0, bz: 4, r: 0.075 }
    const p = new THREE.Vector3(0.05, 0, 0.05)
    resolveCollisions(p, [a, b])
    expect(p.x).toBeGreaterThanOrEqual(PLAYER_RADIUS + 0.075 - 1e-3)
    expect(p.z).toBeGreaterThanOrEqual(PLAYER_RADIUS + 0.075 - 1e-3)
  })
})
