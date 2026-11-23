import * as THREE from 'three'

export type FurnitureType =
  | 'sofa' | 'coffee table' | 'bed' | 'nightstand' | 'counter' | 'vanity' | 'wardrobe'
  | 'fitting-room' | 'lamp' | 'plant' | 'rug' | 'table' | 'painting' | 'display case'

export interface FurnitureItem {
  id: string
  type: FurnitureType
  mesh: THREE.Mesh
  roomId: string
  rotatable: boolean
}

type Spec =
  | { shape: 'box'; size: [number, number, number]; color: number; rotatable?: boolean }
  | { shape: 'sphere'; radius: number; color: number; rotatable?: boolean }
  | { shape: 'plane'; size: [number, number]; color: number; flat?: boolean; rotatable?: boolean }

export const FURNITURE_SPECS: Record<FurnitureType, Spec> = {
  sofa: { shape: 'box', size: [4, 1, 2], color: 0x4a4e69 },
  'coffee table': { shape: 'box', size: [1.5, 0.5, 1.5], color: 0x7a8ba0 },
  bed: { shape: 'box', size: [4, 2, 2], color: 0x5a3e4f },
  nightstand: { shape: 'box', size: [1.5, 1.5, 1.5], color: 0x5a3e4f },
  counter: { shape: 'box', size: [3, 0.5, 0.5], color: 0x6b5b96 },
  vanity: { shape: 'box', size: [2, 0.8, 0.5], color: 0x7a8b9e },
  wardrobe: { shape: 'box', size: [2, 2.5, 0.5], color: 0x4a3b5e },
  'fitting-room': { shape: 'box', size: [2, 2.5, 0.5], color: 0xfab1a0 },
  lamp: { shape: 'box', size: [0.5, 1.5, 0.5], color: 0xffa500, rotatable: true },
  plant: { shape: 'sphere', radius: 0.3, color: 0x228b22 },
  rug: { shape: 'plane', size: [3, 2], color: 0xdc143c, flat: true },
  table: { shape: 'box', size: [1.5, 0.5, 1.5], color: 0x8b4513, rotatable: true },
  painting: { shape: 'plane', size: [1, 1.5], color: 0x2f4f4f },
  'display case': { shape: 'box', size: [2, 1, 1], color: 0xd4af37 },
}

/** Emoji used by the hotbar. */
export const FURNITURE_ICONS: Record<FurnitureType, string> = {
  sofa: '🛋️', 'coffee table': '☕', bed: '🛏️', nightstand: '🗄️', counter: '🍳', vanity: '🪞',
  wardrobe: '👗', 'fitting-room': '🚪', lamp: '💡', plant: '🪴', rug: '🟥', table: '🪑',
  painting: '🖼️', 'display case': '💎',
}

let nextId = 0

export function createFurniture(
  type: FurnitureType,
  position: [number, number, number],
  roomId = 'free',
): FurnitureItem {
  const spec = FURNITURE_SPECS[type]
  const material = new THREE.MeshStandardMaterial({
    color: spec.color,
    side: spec.shape === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
  })
  let geometry: THREE.BufferGeometry
  if (spec.shape === 'box') geometry = new THREE.BoxGeometry(...spec.size)
  else if (spec.shape === 'sphere') geometry = new THREE.SphereGeometry(spec.radius, 16, 16)
  else geometry = new THREE.PlaneGeometry(...spec.size)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(...position)
  if (spec.shape === 'plane' && spec.flat) mesh.rotation.x = -Math.PI / 2
  mesh.userData.furnitureType = type
  return { id: `furn-${nextId++}`, type, mesh, roomId, rotatable: !!spec.rotatable }
}

interface RoomRule {
  keywords: string[]
  items: Array<[FurnitureType, [number, number, number]]>
}

const ROOM_RULES: RoomRule[] = [
  { keywords: ['living', 'sitting'], items: [['sofa', [-2, 0.5, -2]], ['coffee table', [0, 0.25, 0]], ['rug', [0, 0.01, 0]], ['table', [2.5, 0.25, 2]]] },
  { keywords: ['bed'], items: [['bed', [0, 1, 0]], ['nightstand', [-3, 0.75, 2]], ['lamp', [0.5, 1.75, 0.5]], ['plant', [-0.5, 0.3, -0.5]], ['painting', [0, 1.5, 0.5]]] },
  { keywords: ['kitchen', 'cook'], items: [['counter', [0, 0.25, -3]]] },
  { keywords: ['bath'], items: [['vanity', [0, 0.4, -2]]] },
  { keywords: ['wardrobe', 'closet'], items: [['wardrobe', [-3, 1.25, 0]]] },
  { keywords: ['fitting', 'tryon', 'try-on'], items: [['fitting-room', [0, 1.25, 0]]] },
  { keywords: ['jewel', 'studio', 'boutique'], items: [['display case', [0, 0.5, 0]]] },
]

/** Build furniture for each room from its name/function. */
export function buildFurnitureForRooms(rooms: any[]): FurnitureItem[] {
  const out: FurnitureItem[] = []
  const n = rooms.length
  rooms.forEach((room, i) => {
    const roomId = String(room?.room_id ?? i)
    const name = `${room?.room_name ?? ''} ${room?.room_function ?? ''}`.toLowerCase()
    const angle = (i / Math.max(n, 1)) * Math.PI * 2
    const [ox, oz] = n > 1 ? [Math.cos(angle) * 2.5, Math.sin(angle) * 2.5] : [0, 0]
    for (const rule of ROOM_RULES) {
      if (!rule.keywords.some(k => name.includes(k))) continue
      for (const [type, [x, y, z]] of rule.items) {
        out.push(createFurniture(type, [x + ox, y, z + oz], roomId))
      }
    }
  })
  return out
}

export function nearestFurniture(
  position: THREE.Vector3,
  items: FurnitureItem[],
  maxDistance = 3,
): { item: FurnitureItem; distance: number } | null {
  let best: { item: FurnitureItem; distance: number } | null = null
  for (const item of items) {
    const d = Math.hypot(item.mesh.position.x - position.x, item.mesh.position.z - position.z)
    if (d <= maxDistance && (!best || d < best.distance)) best = { item, distance: d }
  }
  return best
}

export function disposeFurniture(items: FurnitureItem[]) {
  for (const { mesh } of items) {
    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
  }
}

/** Y coordinate that rests a freshly placed item on the floor (paintings hang at eye level). */
export function restingY(type: FurnitureType): number {
  const spec = FURNITURE_SPECS[type]
  if (spec.shape === 'box') return spec.size[1] / 2
  if (spec.shape === 'sphere') return spec.radius
  return spec.flat ? 0.01 : 1.5
}
