import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

interface ModelPreviewProps {
  url: string
  onDimensions?: (dims: { width: number; height: number; depth: number }) => void
  className?: string
}

function Model({ url, onDimensions }: { url: string; onDimensions?: (d: { width: number; height: number; depth: number }) => void }) {
  const gltf = useGLTF(url)
  const reported = useRef(false)
  useEffect(() => {
    if (reported.current) return
    const box = new THREE.Box3().setFromObject(gltf.scene)
    const size = box.getSize(new THREE.Vector3())
    if (onDimensions) onDimensions({ width: size.x, height: size.y, depth: size.z })
    reported.current = true
  }, [gltf.scene, onDimensions])
  return <primitive object={gltf.scene} />
}

export function ModelPreview({ url, onDimensions, className }: ModelPreviewProps) {
  return (
    <div className={`relative bg-paper rounded-sm border border-line overflow-hidden ${className ?? 'h-64'}`}>
      <Canvas camera={{ position: [2, 2, 2], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <Suspense fallback={null}>
          <Model url={url} onDimensions={onDimensions} />
        </Suspense>
        <OrbitControls makeDefault enableDamping />
        <gridHelper args={[4, 4, 0xdcd9cf, 0xe8e6de]} />
      </Canvas>
    </div>
  )
}

// Preload helper not strictly needed; drei caches by URL.