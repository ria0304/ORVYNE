import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export enum SceneType {
  ACTUAL_BATISSE = 'actual_batisse',
  GEOMETRY_DERIVED = 'geometry_derived',
  PLACEHOLDER = 'placeholder',
}

const mat = (color: number) => new THREE.MeshStandardMaterial({ color })

function baseRoom(group: THREE.Group, w = 10, d = 10) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0x2a2e37))
  floor.rotation.x = -Math.PI / 2
  group.add(floor)
}

export function createPlaceholderScene(): THREE.Group {
  const group = new THREE.Group()
  baseRoom(group)
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 0.3), mat(0x3d4a5e))
  wall.position.set(0, 1.5, -5)
  group.add(wall)
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), mat(0x6b7280))
  sphere.position.set(0, 0.5, 0)
  group.add(sphere)
  return group
}

export function createGeometryDerivedScene(rooms: any[]): THREE.Group {
  const group = new THREE.Group()
  baseRoom(group)
  const n = Math.max(rooms.length, 1)
  rooms.forEach((_room, i) => {
    const angle = (i / n) * Math.PI * 2
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 0.3), mat(0x3d4a5e))
    wall.position.set(Math.cos(angle) * 4, 1.25, Math.sin(angle) * 4)
    wall.rotation.y = -angle + Math.PI / 2
    group.add(wall)
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), mat(0xef476f))
    marker.position.set(Math.cos(angle) * 2.5, 0.5, Math.sin(angle) * 2.5)
    group.add(marker)
  })
  return group
}

export async function loadActualBatisseGLB(glbBase64: string): Promise<THREE.Group | null> {
  if (!glbBase64) return null
  let url = ''
  try {
    const bytes = Uint8Array.from(atob(glbBase64), c => c.charCodeAt(0))
    url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }))
    const gltf = await new GLTFLoader().loadAsync(url)
    return gltf.scene
  } catch (e) {
    console.error('Failed to load BATISSE GLB:', e)
    return null
  } finally {
    if (url) URL.revokeObjectURL(url)
  }
}

/** Where the player should start so the home is in front of them. */
export function spawnFor(model: THREE.Object3D | null): THREE.Vector3 {
  if (!model) return new THREE.Vector3(0, 0, 8)
  const box = new THREE.Box3().setFromObject(model)
  if (box.isEmpty()) return new THREE.Vector3(0, 0, 8)
  const c = box.getCenter(new THREE.Vector3())
  return new THREE.Vector3(c.x, 0, box.max.z + 3)
}

export function disposeObject(obj: THREE.Object3D) {
  obj.traverse(o => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const material = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(material)) material.forEach(x => x.dispose())
    else material?.dispose()
  })
}
