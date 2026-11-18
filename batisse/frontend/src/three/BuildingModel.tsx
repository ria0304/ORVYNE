/**
 * BuildingModel — procedural 3D reconstruction from the shared geometry model.
 *
 * Coordinate convention (consistent with the 2D editor):
 * - X: horizontal, right
 * - Z: horizontal, depth (plan +Y maps to 3D +Z)
 * - Y: vertical, up
 *
 * Walls are built as segmented extrusions: each wall is split at opening
 * positions so that doors and windows become actual geometric voids in the
 * wall solid, not decals applied on top.
 */

import * as THREE from 'three'
import { useMemo } from 'react'
import type { FloorPlanGeometry, Wall, Opening, Room } from '../api/types'
import { wallMaterial, floorMaterial, openingMaterial, slabMaterial } from './materials'
import { dist, wallNormal, normalize } from '../utils/geometry'
import { type EditorState } from '../store/useGeometryEditor'

type Selection = EditorState['selectedElement']

const HIGHLIGHT_COLOR = 0x2c5f7c

const EPS = 1e-4

/**
 * Split a wall into segments at each opening position.
 * Returns segments as [{start, end}, ...] covering the full wall minus openings.
 */
function segmentWall(wall: Wall, openings: Opening[]): { start: [number, number]; end: [number, number] }[] {
  const segLen = dist(wall.start, wall.end)
  if (segLen < EPS) return []

  const dir: [number, number] = normalize([
    (wall.end[0] - wall.start[0]) / segLen,
    (wall.end[1] - wall.start[1]) / segLen,
  ])

  // Collect opening intervals along the wall (offset from start, half-width)
  const intervals: { start: number; end: number }[] = []
  const wallOpenings = openings.filter((o) => o.wall_id === wall.id)
  for (const op of wallOpenings) {
    // Project opening position onto wall
    const offset = (op.position[0] - wall.start[0]) * dir[0] + (op.position[1] - wall.start[1]) * dir[1]
    const half = op.width / 2
    intervals.push({ start: Math.max(0, offset - half), end: Math.min(segLen, offset + half) })
  }

  // Sort and merge intervals
  intervals.sort((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = []
  for (const iv of intervals) {
    const last = merged[merged.length - 1]
    if (last && iv.start <= last.end + EPS) {
      last.end = Math.max(last.end, iv.end)
    } else {
      merged.push({ ...iv })
    }
  }

  // Build segments between intervals
  const segments: { start: [number, number]; end: [number, number] }[] = []
  let cursor = 0
  for (const iv of merged) {
    if (iv.start > cursor + EPS) {
      segments.push({
        start: [wall.start[0] + dir[0] * cursor, wall.start[1] + dir[1] * cursor],
        end: [wall.start[0] + dir[0] * iv.start, wall.start[1] + dir[1] * iv.start],
      })
    }
    cursor = iv.end
  }
  if (cursor < segLen - EPS) {
    segments.push({
      start: [wall.start[0] + dir[0] * cursor, wall.start[1] + dir[1] * cursor],
      end: wall.end,
    })
  }

  return segments
}

function buildWallMesh(wall: Wall, wallHeight: number, openings: Opening[]): THREE.Mesh[] {
  const segments = segmentWall(wall, openings)
  const meshes: THREE.Mesh[] = []

  for (const seg of segments) {
    const dir = [seg.end[0] - seg.start[0], seg.end[1] - seg.start[1]]
    const len = Math.hypot(dir[0], dir[1])
    if (len < EPS) continue
    const normal = wallNormal(seg.start, seg.end)

    const a = [seg.start[0] - normal[0] * wall.thickness / 2, seg.start[1] - normal[1] * wall.thickness / 2]
    const b = [seg.start[0] + normal[0] * wall.thickness / 2, seg.start[1] + normal[1] * wall.thickness / 2]
    const c = [seg.end[0] + normal[0] * wall.thickness / 2, seg.end[1] + normal[1] * wall.thickness / 2]
    const d = [seg.end[0] - normal[0] * wall.thickness / 2, seg.end[1] - normal[1] * wall.thickness / 2]

    const shape = new THREE.Shape()
    shape.moveTo(a[0], a[1])
    shape.lineTo(b[0], b[1])
    shape.lineTo(c[0], c[1])
    shape.lineTo(d[0], d[1])
    shape.closePath()

    const geo = new THREE.ExtrudeGeometry(shape, { depth: wallHeight, bevelEnabled: false })
    geo.translate(0, wallHeight / 2, 0)
    // Map shape X,Y to 3D X,Z
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))

    const mesh = new THREE.Mesh(geo, wall.color ? new THREE.MeshStandardMaterial({ color: new THREE.Color(wall.color), roughness: 0.85, metalness: 0.05 }) : wallMaterial())
    mesh.castShadow = true
    mesh.receiveShadow = true
    // Store wall id for selection
    mesh.userData = { type: 'wall', id: wall.id }
    meshes.push(mesh)
  }

  return meshes
}

function buildRoomFloor(room: Room): THREE.Mesh | null {
  if (room.polygon.length < 3) return null
  const shape = new THREE.Shape()
  shape.moveTo(room.polygon[0][0], room.polygon[0][1])
  for (let i = 1; i < room.polygon.length; i++) {
    shape.lineTo(room.polygon[i][0], room.polygon[i][1])
  }
  shape.closePath()

  const geo = new THREE.ShapeGeometry(shape)
  geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))
  geo.translate(0, 0.001, 0)

  const mat = room.color
    ? new THREE.MeshStandardMaterial({ color: new THREE.Color(room.color), roughness: 0.9, metalness: 0.0 })
    : floorMaterial()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  mesh.userData = { type: 'room', id: room.id }
  return mesh
}

function buildOpeningMesh(op: Opening, wall: Wall): THREE.Mesh | null {
  // Visual frame around the opening (glass/door plane) — placed in the wall plane
  const segLen = dist(wall.start, wall.end)
  if (segLen < EPS) return null
  const dir: [number, number] = normalize([
    (wall.end[0] - wall.start[0]) / segLen,
    (wall.end[1] - wall.start[1]) / segLen,
  ])
  const normal = wallNormal(wall.start, wall.end)
  const center = op.position
  const halfW = op.width / 2

  const a = [
    center[0] - dir[0] * halfW + normal[0] * (wall.thickness / 2 + 0.002),
    center[1] - dir[1] * halfW + normal[1] * (wall.thickness / 2 + 0.002),
  ]
  const b = [
    center[0] + dir[0] * halfW + normal[0] * (wall.thickness / 2 + 0.002),
    center[1] + dir[1] * halfW + normal[1] * (wall.thickness / 2 + 0.002),
  ]
  const c = [b[0], b[1]]
  const d = [a[0], a[1]]

  const shape = new THREE.Shape()
  shape.moveTo(a[0], a[1])
  shape.lineTo(b[0], b[1])
  shape.lineTo(c[0], c[1])
  shape.lineTo(d[0], d[1])
  shape.closePath()

  const geo = new THREE.ShapeGeometry(shape)
  geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))
  geo.translate(0, op.sill_height, 0)

  const mesh = new THREE.Mesh(geo, openingMaterial())
  mesh.userData = { type: 'opening', id: op.id }
  return mesh
}

export function BuildingModel({ geometry, selectedElement, showWalls = true, showFloors = true }: { geometry: FloorPlanGeometry; selectedElement?: Selection; showWalls?: boolean; showFloors?: boolean }) {
  const group = useMemo(() => {
    const g = new THREE.Group()
    const floor = geometry.floors[0]
    const wallHeight = floor.wall_height
    const slabThickness = floor.slab_thickness

    // --- Footprint slabs ---
    for (const ring of floor.footprint) {
      if (ring.length < 3) continue
      const shape = new THREE.Shape()
      shape.moveTo(ring[0][0], ring[0][1])
      for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i][0], ring[i][1])
      shape.closePath()

      const geo = new THREE.ExtrudeGeometry(shape, { depth: slabThickness, bevelEnabled: false })
      geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      geo.translate(0, -slabThickness, 0)

      const mesh = new THREE.Mesh(geo, slabMaterial())
      mesh.receiveShadow = true
      g.add(mesh)
    }

    // --- Room floors ---
    if (showFloors) {
      for (const room of floor.rooms) {
        const mesh = buildRoomFloor(room)
        if (!mesh) continue
        if (selectedElement?.type === 'room' && room.id === selectedElement.id) {
          mesh.material = new THREE.MeshStandardMaterial({ color: HIGHLIGHT_COLOR, emissive: HIGHLIGHT_COLOR, emissiveIntensity: 0.5 })
        }
        g.add(mesh)
      }
    }

    // --- Walls (segmented for openings) ---
    if (showWalls) {
      for (const wall of floor.walls) {
        for (const mesh of buildWallMesh(wall, wallHeight, floor.openings)) {
          if (selectedElement?.type === 'wall' && wall.id === selectedElement.id) {
            mesh.material = new THREE.MeshStandardMaterial({ color: HIGHLIGHT_COLOR, emissive: HIGHLIGHT_COLOR, emissiveIntensity: 0.5 })
          }
          g.add(mesh)
        }
      }
    }

    // --- Openings (visual frames) ---
    for (const op of floor.openings) {
      if (!op.wall_id) continue
      const wall = floor.walls.find((w) => w.id === op.wall_id)
      if (!wall) continue
      const mesh = buildOpeningMesh(op, wall)
      if (!mesh) continue
      if (selectedElement?.type === 'opening' && op.id === selectedElement.id) {
        mesh.material = new THREE.MeshStandardMaterial({ color: HIGHLIGHT_COLOR, emissive: HIGHLIGHT_COLOR, emissiveIntensity: 0.8 })
      }
      g.add(mesh)
    }

    // --- Grid helper ---
    const grid = new THREE.GridHelper(40, 40, 0xdcd9cf, 0xdcd9cf)
    grid.material.transparent = true
    grid.material.opacity = 0.3
    grid.position.y = -0.01
    g.add(grid)

    return g
  }, [geometry, selectedElement, showWalls, showFloors])

  return <primitive object={group} />
}
