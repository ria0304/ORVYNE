/**
 * DollhouseViewer — Three.js canvas with orbit controls, view presets,
 * layer visibility, and bidirectional 2D↔3D element selection.
 *
 * The raycaster and useThree() live inside a Canvas child component
 * (ScenePointer) so React Three Fiber hooks are always used within Canvas.
 */

import { useState, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Grid, PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { BuildingModel } from './BuildingModel'
import { FurnitureLayer } from './FurnitureLayer'
import type { FloorPlanGeometry } from '../api/types'
import { useGeometryEditor, type EditorState } from '../store/useGeometryEditor'
import { useFurnitureStore } from '../store/useFurnitureStore'

type Selection = EditorState['selectedElement']

function ExportBridge({ onReady }: { onReady: (fn: () => void) => void }) {
  const { scene } = useThree()
  useEffect(() => {
    const fn = () => {
      const exporter = new GLTFExporter()
      exporter.parse(
        scene,
        (result) => {
          let blob: Blob
          if (result instanceof ArrayBuffer) {
            blob = new Blob([result], { type: 'model/gltf-binary' })
          } else {
            blob = new Blob([JSON.stringify(result)], { type: 'application/json' })
          }
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = result instanceof ArrayBuffer ? 'batisse-export.glb' : 'batisse-export.gltf'
          a.click()
          URL.revokeObjectURL(url)
        },
        (err) => console.error('Export failed', err),
        { binary: true },
      )
    }
    onReady(fn)
  }, [scene, onReady])
  return null
}

function ScenePointer() {
  const { camera, scene, raycaster, gl } = useThree()
  const { setSelection } = useGeometryEditor()
  const selectFurniture = useFurnitureStore((s) => s.selectInstance)

  useEffect(() => {
    const canvas = gl.domElement
    const handler = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
      const intersects = raycaster.intersectObjects(scene.children, true)

      for (const hit of intersects) {
        const mesh = hit.object as THREE.Mesh & { userData?: { type?: string; id?: string | number } }
        const { type, id } = mesh.userData ?? {}
        if (type === 'furniture') {
          selectFurniture(Number(id))
          return
        }
        if (type === 'room' || type === 'wall' || type === 'opening') {
          setSelection({ type, id: id as string } as Selection)
          return
        }
      }
      setSelection(null)
      selectFurniture(null)
    }

    canvas.addEventListener('pointerdown', handler)
    return () => canvas.removeEventListener('pointerdown', handler)
  }, [camera, scene, raycaster, gl, setSelection, selectFurniture])

  return null
}

function CameraPresetButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-sm border transition-colors ${
        active
          ? 'brand-gradient-bg text-white border-transparent'
          : 'text-ink border-line hover:bg-accent-soft'
      }`}
    >
      {label}
    </button>
  )
}

export function DollhouseViewer({
  geometry,
  furnitureTransformMode = 'translate',
  onFurnitureTransformEnd,
  showFurniture = true,
}: {
  geometry: FloorPlanGeometry
  furnitureTransformMode?: 'translate' | 'rotate' | 'scale'
  onFurnitureTransformEnd?: (id: number, obj: THREE.Object3D) => void
  showFurniture?: boolean
}) {
  const [showWalls, setShowWalls] = useState(true)
  const [showFloors, setShowFloors] = useState(true)
  const [showRoof, setShowRoof] = useState(false)
  const [viewMode, setViewMode] = useState<'perspective' | 'top'>('perspective')
  const [walkMode, setWalkMode] = useState(false)
  const [exportFn, setExportFn] = useState<(() => void) | null>(null)
  const { selectedElement } = useGeometryEditor()

  return (
    <div className="relative w-full h-full d3-scene">
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 bg-card/90 backdrop-blur p-3 rounded-sm border border-line">
        <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-wider font-medium">View</div>
        <CameraPresetButton
          label="Perspective"
          active={viewMode === 'perspective'}
          onClick={() => {
            setViewMode('perspective')
          }}
        />
        <CameraPresetButton
          label="Top"
          active={viewMode === 'top'}
          onClick={() => {
            setViewMode('top')
          }}
        />
        <CameraPresetButton
          label="Dollhouse"
          active={false}
          onClick={() => {
            setViewMode('perspective')
          }}
        />
        <CameraPresetButton
          label={walkMode ? 'Exit walk' : 'Walk'}
          active={walkMode}
          onClick={() => setWalkMode((w) => !w)}
        />
        <CameraPresetButton
          label="Export GLB"
          active={false}
          onClick={() => exportFn?.()}
        />
        <div className="border-t border-line pt-2 mt-2 flex items-center gap-2 text-xs text-muted uppercase tracking-wider font-medium">Layers</div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={showWalls} onChange={(e) => setShowWalls(e.target.checked)} className="form-checkbox" />
          <span>Walls</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={showFloors} onChange={(e) => setShowFloors(e.target.checked)} className="form-checkbox" />
          <span>Floors</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={showRoof} onChange={(e) => setShowRoof(e.target.checked)} className="form-checkbox" />
          <span>Roof</span>
        </label>
      </div>

      <Canvas
        camera={{ position: [10, 10, 10], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.35} />
        <pointLight position={[6, 10, 4]} intensity={50} distance={50} castShadow />
        <pointLight position={[-6, 8, -4]} intensity={35} distance={50} castShadow />
        <ContactShadows opacity={0.25} scale={10} blur={2} far={4} />
        {walkMode ? (
          <PointerLockControls />
        ) : (
          <OrbitControls
            makeDefault={true}
            minDistance={3}
            maxDistance={80}
            target={[0, 0, 0]}
          />
        )}
        <ScenePointer />
        <ExportBridge onReady={setExportFn} />
        <BuildingModel geometry={geometry} selectedElement={selectedElement} showWalls={showWalls} showFloors={showFloors} />
        {showFurniture && <FurnitureLayer transformMode={furnitureTransformMode} onTransformEnd={onFurnitureTransformEnd ?? (() => {})} />}
        <Grid args={[40, 40]} cellColor={0xdcd9cf} sectionColor={0xdcd9cf} />
      </Canvas>
    </div>
  )
}
