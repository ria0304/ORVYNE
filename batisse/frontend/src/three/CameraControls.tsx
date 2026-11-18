import { OrbitControls } from '@react-three/drei'

export function CameraControls() {
  return (
    <OrbitControls
      makeDefault={true}
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      minDistance={4}
      maxDistance={60}
      target={[0, 0, 0]}
    />
  )
}
