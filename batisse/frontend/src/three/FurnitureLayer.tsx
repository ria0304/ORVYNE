import { Suspense, useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { useFurnitureStore } from '../store/useFurnitureStore'
import { api } from '../api/client'

interface FurnitureMeshProps {
  instanceId: number
  url: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  materialOverrides: Record<string, unknown> | null
  selected: boolean
  onSelect: (id: number) => void
  transformMode: 'translate' | 'rotate' | 'scale'
  onTransformEnd: (id: number, obj: THREE.Object3D) => void
}

function FurnitureMesh({ instanceId, url, position, rotation, scale, materialOverrides, selected, onSelect, transformMode, onTransformEnd }: FurnitureMeshProps) {
  const gltf = useGLTF(url)
  const groupRef = useRef<THREE.Group>(null)
  const controlsRef = useRef<any>(null)

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.set(...position)
      groupRef.current.rotation.set(...rotation)
      groupRef.current.scale.set(...scale)
    }
  }, [instanceId])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    const color = materialOverrides?.color as string | undefined
    if (color) {
      group.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh && mesh.material) {
          const m = mesh.material as THREE.MeshStandardMaterial
          if (m.color) m.color.set(color)
        }
      })
    }
  }, [materialOverrides])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const handler = (e: { value: boolean }) => {
      if (!e.value && groupRef.current) {
        onTransformEnd(instanceId, groupRef.current)
      }
    }
    controls.addEventListener('dragging-changed', handler)
    return () => controls.removeEventListener('dragging-changed', handler)
  }, [instanceId, onTransformEnd])

  return (
    <group
      ref={groupRef}
      userData={{ type: 'furniture', id: instanceId }}
      onClick={(e) => { e.stopPropagation(); onSelect(instanceId) }}
    >
      <primitive object={gltf.scene.clone()} />
      {selected && (
        <TransformControls
          ref={controlsRef}
          object={groupRef as React.RefObject<THREE.Object3D>}
          mode={transformMode}
          size={0.8}
        />
      )}
    </group>
  )
}

interface FurnitureLayerProps {
  transformMode: 'translate' | 'rotate' | 'scale'
  onTransformEnd: (id: number, obj: THREE.Object3D) => void
}

export function FurnitureLayer({ transformMode, onTransformEnd }: FurnitureLayerProps) {
  const instances = useFurnitureStore((s) => s.instances)
  const assets = useFurnitureStore((s) => s.assets)
  const selectedId = useFurnitureStore((s) => s.selectedInstanceId)
  const selectInstance = useFurnitureStore((s) => s.selectInstance)

  return (
    <>
      {instances.map((inst) => {
        const asset = assets.get(inst.asset_id)
        if (!asset || !asset.model_path) return null
        const url = api.furnitureModelUrl(asset.id)
        return (
          <Suspense key={inst.id} fallback={null}>
            <FurnitureMesh
              instanceId={inst.id}
              url={url}
              position={[inst.pos_x, inst.pos_y, inst.pos_z]}
              rotation={[inst.rot_x, inst.rot_y, inst.rot_z]}
              scale={[inst.scale_x, inst.scale_y, inst.scale_z]}
              materialOverrides={inst.material_overrides ?? null}
              selected={selectedId === inst.id}
              onSelect={selectInstance}
              transformMode={transformMode}
              onTransformEnd={onTransformEnd}
            />
          </Suspense>
        )
      })}
    </>
  )
}