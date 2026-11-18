/**
 * Interactive 2D floor plan editor.
 *
 * Renders the shared geometry as SVG. Supports:
 * - Zoom and pan (mouse wheel + drag)
 * - Select walls / rooms / openings
 * - Draw new walls (click to place start/end points)
 * - Edit room names and types
 * - Add / move / delete openings
 * - Grid with snap
 * - Undo / redo via the geometry editor store
 * - Scale overlay (meters per pixel) for measurement
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useGeometryEditor } from '../../store/useGeometryEditor'
import { useFurnitureStore } from '../../store/useFurnitureStore'
import { useProjects } from '../../hooks/useProjects'
import type {
  FloorPlanGeometry, Wall, Room, Opening, Floor, Pt, RoomType,
} from '../../api/types'
import {
  dist, pointSegmentDist, polygonAreaAbs, polygonCentroid,
} from '../../utils/geometry'
import { Button } from '../common/Button'
import { Input } from '../common/Input'
import { Badge } from '../common/Badge'

const GRID_SIZE = 20
const SNAP_THRESHOLD = 12
const HANDLE_R = 5

type Tool = 'select' | 'draw-wall' | 'draw-opening' | 'pan'

interface SelectedElement {
  type: 'room' | 'wall' | 'opening' | 'floor'
  id: string
}

export function PlanEditor({ projectId }: { projectId: number }) {
  const { currentProject } = useAppStore()
  const appGeometry = useAppStore((s) => s.geometry)
  const { geometry, replaceGeometry, clearHistory } = useGeometryEditor()

  useEffect(() => {
    if (appGeometry && (!geometry || geometry !== appGeometry)) {
      replaceGeometry(appGeometry)
      clearHistory()
    }
  }, [appGeometry, geometry, replaceGeometry, clearHistory])

  if (!geometry || !currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted">
        No geometry loaded. Process a floor plan first.
      </div>
    )
  }

  return <PlanEditorInner projectId={projectId} />
}

function PlanEditorInner({ projectId }: { projectId: number }) {
  void projectId
  const { currentProject } = useAppStore()
  const { saveGeometry } = useProjects()
  const {
    geometry, setGeometry, selectedElement, setSelection,
    clearSelection, dirty, markSaved, pushState, undo, redo,
    canUndo, canRedo,
  } = useGeometryEditor()

  const floor: Floor = geometry!.floors[0]

  const furnitureInstances = useFurnitureStore((s) => s.instances)
  const furnitureAssets = useFurnitureStore((s) => s.assets)
  const selectFurniture = useFurnitureStore((s) => s.selectInstance)
  const selectedFurnitureId = useFurnitureStore((s) => s.selectedInstanceId)

  const [tool, setTool] = useState<Tool>('select')
  const [viewTransform, setViewTransform] = useState<{ sx: number; sy: number; tx: number; ty: number }>({
    sx: 1, sy: 1, tx: 0, ty: 0,
  })
  const [isPanning, setIsPanning] = useState(false)
  const [lastMouse, setLastMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [hoverElement, setHoverElement] = useState<SelectedElement | null>(null)
  const [drawStart, setDrawStart] = useState<Pt | null>(null)
  const [drawCurrent, setDrawCurrent] = useState<Pt | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)

  const toScreen = useCallback((p: Pt): [number, number] => {
    const { sx, sy, tx, ty } = viewTransform
    return [p[0] * sx + tx, p[1] * sy + ty]
  }, [viewTransform])

  const fromScreen = useCallback((x: number, y: number): Pt => {
    const { sx, sy, tx, ty } = viewTransform
    return [(x - tx) / sx, (y - ty) / sy]
  }, [viewTransform])

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const rect = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setViewTransform((t) => {
      const cx = (mx - t.tx) / t.sx
      const cy = (my - t.ty) / t.sy
      const nsx = t.sx * delta
      const nsy = t.sy * delta
      return { sx: nsx, sy: nsy, tx: mx - cx * nsx, ty: my - cy * nsy }
    })
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (tool === 'pan') {
      setIsPanning(true)
      setLastMouse({ x: e.clientX, y: e.clientY })
      return
    }
    const rect = svgRef.current!.getBoundingClientRect()
    const pt = fromScreen(e.clientX - rect.left, e.clientY - rect.top)

    if (tool === 'draw-wall') {
      if (!drawStart) {
        setDrawStart(pt)
        setDrawCurrent(pt)
      } else {
        completeWall(drawStart, pt)
        setDrawStart(null)
        setDrawCurrent(null)
      }
      return
    }

    const clicked = findElementAt(pt)
    if (clicked) {
      setSelection(clicked)
      setHoverElement(null)
    } else {
      clearSelection()
    }
  }, [tool, drawStart, fromScreen, setSelection, clearSelection])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setViewTransform((t) => ({
        sx: t.sx, sy: t.sy,
        tx: t.tx + (e.clientX - lastMouse.x),
        ty: t.ty + (e.clientY - lastMouse.y),
      }))
      setLastMouse({ x: e.clientX, y: e.clientY })
      return
    }
    const rect = svgRef.current!.getBoundingClientRect()
    const pt = fromScreen(e.clientX - rect.left, e.clientY - rect.top)
    setDrawCurrent(pt)

    const hovered = findElementAt(pt)
    setHoverElement(hovered ? { type: hovered.type as 'room' | 'wall' | 'opening', id: hovered.id } : null)
  }, [isPanning, lastMouse, fromScreen])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      clearSelection()
      setDrawStart(null)
      setDrawCurrent(null)
      setTool('select')
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement) {
      deleteSelected()
    }
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey && canUndo) {
      const g = undo()
      if (g) setGeometry(g)
    }
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey && canRedo) {
      const g = redo()
      if (g) setGeometry(g)
    }
  }, [clearSelection, selectedElement, canUndo, canRedo, undo, redo, setGeometry])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const mpp = geometry!.scale.meters_per_pixel ?? null

  const findElementAt = useCallback((pt: Pt): SelectedElement | null => {
    const tol = SNAP_THRESHOLD / Math.max(viewTransform.sx, 0.001)
    for (const op of floor.openings) {
      const wall = floor.walls.find((w) => w.id === op.wall_id)
      if (!wall) continue
      const d = pointSegmentDist(pt, wall.start, wall.end)
      if (d < tol) {
        return { type: 'opening', id: op.id }
      }
    }
    for (const w of floor.walls) {
      const d = pointSegmentDist(pt, w.start, w.end)
      if (d < tol) {
        return { type: 'wall', id: w.id }
      }
    }
    for (const r of floor.rooms) {
      for (const v of r.polygon) {
        if (dist(pt, v) < tol) {
          return { type: 'room', id: r.id }
        }
      }
    }
    return null
  }, [floor, viewTransform.sx])

  const completeWall = useCallback((p1: Pt, p2: Pt) => {
    if (dist(p1, p2) < 2) return
    const newWall: Wall = {
      id: `wall-${Date.now()}`,
      start: p1,
      end: p2,
      thickness: floor.wall_thickness,
      height: floor.wall_height,
      exterior: false,
      room_ids: [],
      source: 'manual',
      confidence: 1.0,
      length: dist(p1, p2),
    }
    const g = JSON.parse(JSON.stringify(geometry))
    const f = g.floors[0] as Floor
    f.walls.push(newWall)
    pushState(g)
    setGeometry(g)
  }, [geometry, floor, pushState, setGeometry])

  const deleteSelected = useCallback(() => {
    if (!selectedElement) return
    const g = JSON.parse(JSON.stringify(geometry))
    const f = g.floors[0] as Floor
    if (selectedElement.type === 'wall') {
      f.walls = f.walls.filter((w) => w.id !== selectedElement.id)
      f.openings = f.openings.filter((o) => o.wall_id !== selectedElement.id)
    } else if (selectedElement.type === 'opening') {
      f.openings = f.openings.filter((o) => o.id !== selectedElement.id)
    } else if (selectedElement.type === 'room') {
      f.rooms = f.rooms.filter((r) => r.id !== selectedElement.id)
    }
    pushState(g)
    setGeometry(g)
    clearSelection()
  }, [selectedElement, geometry, pushState, setGeometry, clearSelection])

  const updateWall = useCallback((wallId: string, updates: Partial<Wall>) => {
    const g = JSON.parse(JSON.stringify(geometry))
    const f = g.floors[0] as Floor
    const w = f.walls.find((w) => w.id === wallId)
    if (!w) return
    Object.assign(w, updates)
    w.length = dist(w.start, w.end)
    pushState(g)
    setGeometry(g)
  }, [geometry, pushState, setGeometry])

  const updateRoom = useCallback((roomId: string, updates: Partial<Room>) => {
    const g = JSON.parse(JSON.stringify(geometry)) as FloorPlanGeometry
    for (const f of g.floors) {
      const r = f.rooms.find((r: Room) => r.id === roomId)
      if (r) {
        Object.assign(r, updates)
        pushState(g)
        setGeometry(g)
        return
      }
    }
  }, [geometry, pushState, setGeometry])

  const save = async () => {
    if (!geometry) return
    try {
      await saveGeometry(currentProject!.id, geometry)
      markSaved()
    } catch (err) {
      console.error('Save failed', err)
    }
  }

  const contentWidth = 1200
  const contentHeight = 800
  const scaleText = mpp != null ? `1 px = ${mpp.toFixed(4)} m` : 'Scale unknown'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-line bg-card">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Button variant={tool === 'select' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTool('select')}>
              Select
            </Button>
            <Button variant={tool === 'draw-wall' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTool('draw-wall')}>
              Draw Wall
            </Button>
            <Button variant={tool === 'pan' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTool('pan')}>
              Pan
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="font-mono">{scaleText}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={!canUndo} onClick={() => { const g = undo(); if (g) setGeometry(g) }}>
            Undo
          </Button>
          <Button variant="ghost" size="sm" disabled={!canRedo} onClick={() => { const g = redo(); if (g) setGeometry(g) }}>
            Redo
          </Button>
          <Button variant="primary" size="sm" disabled={!dirty} onClick={save}>
            Save
          </Button>
        </div>
      </div>

      <div
        className="flex-1 relative bg-paper overflow-auto"
        onWheel={handleWheel as unknown as React.WheelEventHandler<HTMLDivElement>}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <svg
          ref={svgRef}
          className="block cursor-crosshair"
          width={contentWidth}
          height={contentHeight}
          viewBox={`0 0 ${contentWidth} ${contentHeight}`}
        >
          <defs>
            <pattern id="grid" x="0" y="0" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#dcd9cf" stroke-width="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Plan image overlay */}
          <image
            href={`/api/uploads/0/preview?page=0`}
            x={0} y={0} width={contentWidth} height={contentHeight}
            opacity={0.15}
            pointerEvents="none"
          />

          {/* Rooms */}
          {floor.rooms.map((room) => (
            <RoomShape
              key={room.id}
              room={room}
              mpp={mpp}
              toScreen={toScreen}
              selected={selectedElement?.type === 'room' && selectedElement.id === room.id}
              hovered={hoverElement?.type === 'room' && hoverElement.id === room.id}
              onUpdate={updateRoom}
              onSelect={() => setSelection({ type: 'room', id: room.id })}
            />
          ))}

          {/* Walls */}
          {floor.walls.map((wall) => (
            <WallShape
              key={wall.id}
              wall={wall}
              mpp={mpp}
              toScreen={toScreen}
              selected={selectedElement?.type === 'wall' && selectedElement.id === wall.id}
              hovered={hoverElement?.type === 'wall' && hoverElement.id === wall.id}
              onSelect={() => setSelection({ type: 'wall', id: wall.id })}
            />
          ))}

          {/* Openings */}
          {floor.openings.map((op) => (
            <OpeningShape
              key={op.id}
              opening={op}
              wall={floor.walls.find((w) => w.id === op.wall_id) ?? null}
              toScreen={toScreen}
              selected={selectedElement?.type === 'opening' && selectedElement.id === op.id}
              hovered={hoverElement?.type === 'opening' && hoverElement.id === op.id}
              onSelect={() => setSelection({ type: 'opening', id: op.id })}
            />
          ))}

                     {/* Furniture footprints */}
           {furnitureInstances.map((inst) => {
             const asset = furnitureAssets.get(inst.asset_id)
             if (!asset) return null
             const w = asset.width * inst.scale_x
             const d = asset.depth * inst.scale_z
             const cx = inst.pos_x
             const cy = inst.pos_z
             const yaw = inst.rot_y
             const cos = Math.cos(yaw)
             const sin = Math.sin(yaw)
             const corners: Pt[] = [
               [-w / 2, -d / 2],
               [w / 2, -d / 2],
               [w / 2, d / 2],
               [-w / 2, d / 2],
             ].map(([x, z]) => {
               const rx = x * cos - z * sin
               const rz = x * sin + z * cos
               return [cx + rx, cy + rz] as Pt
             })
             const screen = corners.map(toScreen)
             const isSelected = selectedFurnitureId === inst.id
             return (
               <g key={`furn-${inst.id}`} className="cursor-pointer" onMouseDown={(e) => { e.stopPropagation(); selectFurniture(inst.id) }}>
                 <polygon
                   points={screen.map((p) => p.join(',')).join(' ')}
                   fill={isSelected ? '#e2ecf1' : '#f0f0ea'}
                   stroke={isSelected ? '#2c5f7c' : '#a33a2c'}
                   stroke-width={isSelected ? 2 : 1}
                   fill-opacity={0.5}
                   pointerEvents="filled"
                 />
                 <text x={toScreen([cx, cy])[0]} y={toScreen([cx, cy])[1]} text-anchor="middle" font-size="8" fill="#1c1c1a" pointerEvents="none">
                   {asset.name}
                 </text>
               </g>
             )
           })}
          {tool === 'draw-wall' && drawStart && drawCurrent && (
            <g pointerEvents="none">
              <line
                x1={toScreen(drawStart)[0]}
                y1={toScreen(drawStart)[1]}
                x2={toScreen(drawCurrent)[0]}
                y2={toScreen(drawCurrent)[1]}
                stroke="#2c5f7c" stroke-width="2" stroke-dasharray="4 4"
              />
              <circle cx={toScreen(drawStart)[0]} cy={toScreen(drawStart)[1]} r={HANDLE_R} fill="#2c5f7c" />
              <circle cx={toScreen(drawCurrent)[0]} cy={toScreen(drawCurrent)[1]} r={HANDLE_R} fill="#2c5f7c" />
            </g>
          )}
        </svg>

        {tool === 'pan' && (
          <div className="absolute inset-0 bg-black/10 cursor-grabbing" />
        )}
      </div>

      {selectedElement && (
        <div className="w-64 border-l border-line bg-card p-4">
          <Inspector
            element={selectedElement}
            geometry={geometry!}
            onUpdateRoom={updateRoom}
            onUpdateWall={updateWall}
            onDelete={deleteSelected}
            mpp={mpp}
          />
        </div>
      )}
    </div>
  )
}

/** ---------- Sub-components ---------- */

function RoomShape({ room, mpp, toScreen, selected, hovered, onUpdate, onSelect }: {
  room: Room; mpp: number | null; toScreen: (p: Pt) => [number, number];
  selected: boolean; hovered: boolean;
  onUpdate: (id: string, updates: Partial<Room>) => void;
  onSelect: () => void;
}) {
  const [editName, setEditName] = useState(room.name)
  const [isEditing, setIsEditing] = useState(false)

  const [screenPts, setScreenPts] = useState<[number, number][]>([])
  useEffect(() => {
    setScreenPts(room.polygon.map(toScreen))
  }, [room.polygon, toScreen])

  const fill = selected ? '#e2ecf1' : hovered ? '#f0f0ea' : '#fbfaf7'
  const stroke = selected ? '#2c5f7c' : hovered ? '#6c6b63' : '#dcd9cf'

  const centroid = polygonCentroid(room.polygon)
  const [cScreen] = centroid ? [toScreen(centroid)] : [[0, 0]]

  const areaM2 = mpp != null ? (polygonAreaAbs(room.polygon) * mpp * mpp) : null

  return (
    <g
      className="cursor-pointer"
      onMouseDown={(e) => { e.stopPropagation(); onSelect() }}
    >
      <polygon
        points={screenPts.map((p) => p.join(',')).join(' ')}
        fill={fill} stroke={stroke} stroke-width={selected ? 3 : 1.5}
        fill-opacity={0.6} pointerEvents="filled"
      />
      {isEditing && (
        <foreignObject x={cScreen[0] - 60} y={cScreen[1] - 12} width={120} height={24} pointerEvents="none">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={() => { onUpdate(room.id, { name: editName }); setIsEditing(false) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { onUpdate(room.id, { name: editName }); setIsEditing(false) } } }
            className="text-xs px-1 py-0.5"
          />
        </foreignObject>
      )}
      {!isEditing && (
        <text x={cScreen[0]} y={cScreen[1]} text-anchor="middle" font-size="10" fill="#1c1c1a" pointerEvents="none" font-weight="600">
          {room.name}
        </text>
      )}
      {areaM2 != null && (
        <text x={cScreen[0]} y={cScreen[1] + 14} text-anchor="middle" font-size="9" fill="#6c6b63" pointerEvents="none">
          {areaM2.toFixed(2)} m²
        </text>
      )}
      {room.polygon.map((p, i) => {
        const [x, y] = toScreen(p)
        return (
          <circle
            key={i}
            cx={x} cy={y} r={HANDLE_R} fill="#1c1c1a" stroke={fill} stroke-width={2}
            style={{ cursor: 'pointer' }}
            onMouseDown={(e) => { e.stopPropagation() }}
          />
        )
      })}
      <title>{room.name} ({room.room_type})</title>
    </g>
  )
}

function WallShape({ wall, mpp, toScreen, selected, hovered, onSelect }: {
  wall: Wall; mpp: number | null; toScreen: (p: Pt) => [number, number];
  selected: boolean; hovered: boolean;
  onSelect: () => void;
}) {
  const [s1, s2] = [toScreen(wall.start), toScreen(wall.end)]
  const lengthM = mpp != null ? wall.length * mpp : null

  const stroke = selected ? '#2c5f7c' : hovered ? '#a33a2c' : wall.exterior ? '#1c1c1a' : '#6c6b63'

  return (
    <g className="cursor-pointer" onMouseDown={(e) => { e.stopPropagation(); onSelect() }}>
      <line
        x1={s1[0]} y1={s1[1]} x2={s2[0]} y2={s2[1]}
        stroke={stroke} stroke-width={Math.max(selected ? 4 : wall.thickness * (mpp ?? 1) * 0.8, 1)}
        stroke-linecap="round" pointerEvents="stroke"
      />
      <circle cx={s1[0]} cy={s1[1]} r={HANDLE_R} fill={stroke} stroke="#fff" stroke-width={1.5} style={{ cursor: 'pointer' }} />
      <circle cx={s2[0]} cy={s2[1]} r={HANDLE_R} fill={stroke} stroke="#fff" stroke-width={1.5} style={{ cursor: 'pointer' }} />
      <text x={(s1[0] + s2[0]) / 2} y={(s1[1] + s2[1]) / 2 - 6} text-anchor="middle" font-size="9" fill="#6c6b63" pointerEvents="none">
        {lengthM != null ? lengthM.toFixed(2) + ' m' : wall.length.toFixed(0) + ' px'}
      </text>
      <title>{wall.exterior ? 'Exterior' : 'Interior'} wall</title>
    </g>
  )
}

function OpeningShape({ opening, wall, toScreen, selected, hovered, onSelect }: {
  opening: Opening; wall: Wall | null; toScreen: (p: Pt) => [number, number];
  selected: boolean; hovered: boolean;
  onSelect: () => void;
}) {
  if (!wall) return null
  const segLen = dist(wall.start, wall.end)
  const dir: [number, number] = segLen > 0 ? [(wall.end[0] - wall.start[0]) / segLen, (wall.end[1] - wall.start[1]) / segLen] : [1, 0]
  const [sPos] = [toScreen(opening.position)]
  const halfW = opening.width / 2
  const a = [opening.position[0] - dir[0] * halfW, opening.position[1] - dir[1] * halfW]
  const b = [opening.position[0] + dir[0] * halfW, opening.position[1] + dir[1] * halfW]
  const [sa, sb] = [toScreen(a as Pt), toScreen(b as Pt)]

  const stroke = selected ? '#2c5f7c' : hovered ? '#a33a2c' : opening.type === 'door' ? '#3d7a4f' : '#2c5f7c'

  return (
    <g className="cursor-pointer" onMouseDown={(e) => { e.stopPropagation(); onSelect() }}>
      <line
        x1={sa[0]} y1={sa[1]} x2={sb[0]} y2={sb[1]}
        stroke={stroke} stroke-width={selected ? 5 : 3} stroke-linecap="round" pointerEvents="stroke"
      />
      <circle cx={sPos[0]} cy={sPos[1]} r={HANDLE_R} fill={stroke} stroke="#fff" stroke-width={1.5} style={{ cursor: 'pointer' }} />
      <text x={sPos[0]} y={sPos[1] - 8} text-anchor="middle" font-size="8" fill="#6c6b63" pointerEvents="none">
        {opening.type === 'door' ? 'Door' : 'Window'}
      </text>
      <title>{opening.type} on wall {wall.id}</title>
    </g>
  )
}

function Inspector({ element, geometry, onUpdateRoom, onUpdateWall, onDelete, mpp }: {
  element: SelectedElement
  geometry: FloorPlanGeometry
  onUpdateRoom: (id: string, updates: Partial<Room>) => void
  onUpdateWall: (id: string, updates: Partial<Wall>) => void
  onDelete: () => void
  mpp: number | null
}) {
  const floor = geometry.floors[0]
  const room = element.type === 'room' ? floor.rooms.find((r) => r.id === element.id) : undefined
  const wall = element.type === 'wall' ? floor.walls.find((w) => w.id === element.id) : undefined
  const op = element.type === 'opening' ? floor.openings.find((o) => o.id === element.id) : undefined
  const target = room ?? wall ?? op
  if (!target) return null

  const label = element.type === 'room' ? 'Room' : element.type === 'wall' ? 'Wall' : 'Opening'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-line">
        <span className="font-medium text-ink">{label}</span>
        <Badge variant="info">{target.source}</Badge>
      </div>
      {element.type === 'room' && room && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Name</span>
            <Input value={room.name} onChange={(e) => onUpdateRoom(room.id, { name: e.target.value })} className="w-32" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Type</span>
            <select value={room.room_type} onChange={(e) => onUpdateRoom(room.id, { room_type: e.target.value as RoomType })} className="w-32 text-xs border border-line rounded-sm bg-card px-2 py-1">
              {ROOM_TYPES_LIST.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Area</span>
            <span className="font-mono text-xs">{mpp != null ? (polygonAreaAbs(room.polygon) * mpp * mpp).toFixed(2) + ' m²' : room.area.toFixed(2) + ' px²'}</span>
          </div>
        </>
      )}
      {element.type === 'wall' && wall && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Thickness</span>
            <Input value={wall.thickness.toString()} onChange={(e) => onUpdateWall(wall.id, { thickness: parseFloat(e.target.value) || 0.15 })} className="w-24" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Height (m)</span>
            <Input value={wall.height.toString()} onChange={(e) => onUpdateWall(wall.id, { height: parseFloat(e.target.value) || 2.7 })} className="w-24" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Length</span>
            <span className="font-mono text-xs">{mpp != null ? (wall.length * mpp).toFixed(2) + ' m' : wall.length.toFixed(2) + ' px'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Exterior</span>
            <input type="checkbox" checked={wall.exterior} onChange={(e) => onUpdateWall(wall.id, { exterior: e.target.checked })} className="form-checkbox" />
          </div>
        </>
      )}
      {element.type === 'opening' && op && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Type</span>
            <span className="text-xs text-muted">{op.type}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Width</span>
            <Input value={op.width.toString()} onChange={() => {}} className="w-24" disabled />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Height (m)</span>
            <Input value={op.height.toString()} onChange={() => {}} className="w-24" disabled />
          </div>
        </>
      )}
      <Button variant="danger" size="sm" onClick={onDelete} className="w-full">
        Delete {label.toLowerCase()}
      </Button>
    </div>
  )
}

const ROOM_TYPES_LIST: RoomType[] = [
  'living', 'bedroom', 'kitchen', 'bathroom', 'dining', 'hallway', 'balcony', 'utility', 'storage', 'other',
]
