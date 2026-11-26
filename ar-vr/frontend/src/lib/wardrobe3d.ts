import * as THREE from 'three'
import type { WallCollider } from './collision'

/** A garment as stored in the user's WYA wardrobe. */
export interface WardrobeItem {
  item_id: string
  name?: string
  category?: string
  color?: string
  fabric?: string
  brand?: string
  image_url?: string
  wear_count?: number
  price?: number
  sustainability_score?: number
}

export type GarmentKind = 'top' | 'outer' | 'dress' | 'bottom' | 'skirt' | 'shoes' | 'bag' | 'accessory'

/** Where WYA categories end up: on a hanger (hanging kinds) or on the shelf. */
export function garmentKind(category = ''): GarmentKind {
  const c = category.toLowerCase()
  if (/(shoe|sneaker|boot|heel|sandal|loafer|flat)/.test(c)) return 'shoes'
  if (/(bag|purse|backpack|clutch|tote)/.test(c)) return 'bag'
  if (/(necklace|ring|earring|watch|bracelet|jewel|accessor|scarf|belt|hat|cap)/.test(c)) return 'accessory'
  if (/(dress|gown|jumpsuit|romper)/.test(c)) return 'dress'
  if (/skirt/.test(c)) return 'skirt'
  if (/(pant|jean|trouser|chino|short|legging|bottom|jogger)/.test(c)) return 'bottom'
  if (/(jacket|coat|blazer|outer|cardigan|hoodie|parka)/.test(c)) return 'outer'
  return 'top'
}

export const isHanging = (kind: GarmentKind) => kind === 'top' || kind === 'outer' || kind === 'dress' || kind === 'bottom' || kind === 'skirt'

const COLOR_WORDS: Record<string, number> = {
  white: 0xf3f3f0, ivory: 0xf0ead6, cream: 0xefe4c8, beige: 0xd8c7a3, tan: 0xc8a27a, khaki: 0xb8a878, brown: 0x7b5230,
  black: 0x24262b, grey: 0x8a8f98, gray: 0x8a8f98, charcoal: 0x40444c, silver: 0xb8bcc4, gold: 0xc9a227,
  red: 0xc0392b, burgundy: 0x6d1f2f, maroon: 0x6d1f2f, pink: 0xe88aa8, coral: 0xf08070, orange: 0xe67e22, mustard: 0xd1a21f, yellow: 0xe6c229,
  green: 0x2e8b57, olive: 0x6b7a3a, emerald: 0x1f8f5f, teal: 0x2a8a8a, blue: 0x3b6fd4, navy: 0x1f2f5a, denim: 0x4a6fa5, sky: 0x7fb2e5,
  purple: 0x7d4fb5, lavender: 0xb7a3de, violet: 0x7d4fb5,
}

export function colorFromName(name = ''): number {
  const n = name.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(n)) return parseInt(n.slice(1), 16)
  for (const word of n.split(/[^a-z]+/)) if (word && word in COLOR_WORDS) return COLOR_WORDS[word]
  return 0x9aa3b2
}

export interface WardrobeUnit {
  group: THREE.Group
  width: number
  depth: number
  hanging: number
  onShelf: number
  /** Pull the item forward (selected) or push everything back (null). */
  select(id: string | null): void
  dispose(): void
}

const DEPTH = 0.62
const HEIGHT = 2.3
const RAIL_Y = 1.95
const SHELF_Y = 0.55

const woodMat = () => new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 0.7 })
const metalMat = () => new THREE.MeshStandardMaterial({ color: 0xb9bec7, roughness: 0.35, metalness: 0.8 })

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}

function hanger(mat: THREE.Material, width: number): THREE.Group {
  const g = new THREE.Group()
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 8, 16, Math.PI * 1.5), mat)
  hook.position.set(0, -0.005, 0)
  g.add(hook)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), mat)
  neck.position.set(0, -0.06, 0)
  g.add(neck)
  for (const sign of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, width / 2 + 0.02, 8), mat)
    arm.rotation.z = Math.PI / 2 - sign * 0.28
    arm.position.set((sign * width) / 4, -0.1 - 0.03, 0)
    g.add(arm)
  }
  return g
}

function garmentBody(kind: GarmentKind, cloth: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  const top = -0.12 // just below the hanger shoulders
  if (kind === 'top' || kind === 'outer') {
    const outer = kind === 'outer'
    const w = outer ? 0.5 : 0.4, h = outer ? 0.78 : 0.58
    g.add(box(w, h, outer ? 0.09 : 0.06, cloth, 0, top - h / 2, 0))
    for (const s of [-1, 1]) {
      const sl = outer ? 0.55 : 0.2
      const sleeve = box(0.11, sl, 0.07, cloth, s * (w / 2 + 0.03), top - sl / 2 - 0.02, 0)
      sleeve.rotation.z = -s * 0.1
      g.add(sleeve)
    }
  } else if (kind === 'dress') {
    const bodice = box(0.3, 0.3, 0.06, cloth, 0, top - 0.15, 0)
    g.add(bodice)
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 0.75, 20), cloth)
    skirt.scale.z = 0.3
    skirt.position.set(0, top - 0.3 - 0.375, 0)
    g.add(skirt)
  } else if (kind === 'skirt') {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, 0.5, 20), cloth)
    skirt.scale.z = 0.3
    skirt.position.set(0, top - 0.25, 0)
    g.add(skirt)
  } else {
    // trousers folded over the bar: two hanging legs
    for (const s of [-1, 1]) g.add(box(0.15, 0.85, 0.07, cloth, s * 0.09, top - 0.425, 0))
    g.add(box(0.36, 0.06, 0.07, cloth, 0, top - 0.03, 0))
  }
  return g
}

function shelfItem(kind: GarmentKind, color: number): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2b2f, roughness: 0.8 })
  if (kind === 'shoes') {
    for (const s of [-1, 1]) {
      const shoe = new THREE.Group()
      shoe.add(box(0.1, 0.03, 0.28, dark, 0, 0.015, 0))
      shoe.add(box(0.095, 0.07, 0.2, mat, 0, 0.065, 0.03))
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), mat)
      toe.scale.set(1, 0.7, 1.1)
      toe.position.set(0, 0.06, -0.09)
      shoe.add(toe)
      shoe.position.x = s * 0.07
      g.add(shoe)
    }
  } else if (kind === 'bag') {
    g.add(box(0.28, 0.2, 0.12, mat, 0, 0.1, 0))
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.008, 8, 16, Math.PI), dark)
    handle.position.set(0, 0.2, 0)
    g.add(handle)
  } else {
    g.add(box(0.12, 0.05, 0.12, mat, 0, 0.025, 0))
  }
  return g
}

function labelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 96
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(15,23,42,0.88)'
  ctx.fillRect(0, 0, 512, 96)
  ctx.strokeStyle = '#60a5fa'
  ctx.lineWidth = 4
  ctx.strokeRect(2, 2, 508, 92)
  ctx.fillStyle = '#e0e7ff'
  ctx.font = 'bold 40px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text.length > 24 ? text.slice(0, 23) + '…' : text, 256, 50)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }))
  sprite.scale.set(0.7, 0.13, 1)
  sprite.renderOrder = 10
  return sprite
}

/**
 * Build a wardrobe with every WYA item in it: clothes on hangers along the rail,
 * shoes / bags / accessories on the shelf. Local frame: +X along the rail,
 * +Z toward the open front, y = 0 on the floor, the back panel at z = 0.
 */
export function buildWardrobeUnit(items: WardrobeItem[], maxWidth = 3.2): WardrobeUnit {
  const group = new THREE.Group()
  const wood = woodMat()
  const metal = metalMat()
  const hangingItems = items.filter(i => isHanging(garmentKind(i.category)))
  const shelfItems = items.filter(i => !isHanging(garmentKind(i.category)))

  const width = Math.min(maxWidth, Math.max(1.2, hangingItems.length * 0.12 + 0.5, shelfItems.length * 0.3 + 0.5))

  // ── carcass: plinth, back, sides, top, base, shelves ──────────────────────
  const oak = new THREE.MeshStandardMaterial({ color: 0x9a7552, roughness: 0.6 })
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xb08a63, roughness: 0.55 })
  const warm = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffe2a0, emissiveIntensity: 1.2 })
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xcfe3f2, metalness: 0.95, roughness: 0.05 })
  group.add(box(width + 0.04, 0.1, DEPTH + 0.02, wood, 0, 0.05, DEPTH / 2))               // plinth
  group.add(box(width, HEIGHT - 0.1, 0.03, oak, 0, 0.1 + (HEIGHT - 0.1) / 2, 0.015))      // back
  for (const s of [-1, 1]) group.add(box(0.035, HEIGHT - 0.1, DEPTH, oak, (s * width) / 2, 0.1 + (HEIGHT - 0.1) / 2, DEPTH / 2)) // sides
  group.add(box(width + 0.06, 0.05, DEPTH + 0.03, wood, 0, HEIGHT, DEPTH / 2 + 0.005))     // top
  group.add(box(width, 0.04, DEPTH, oak, 0, 0.12, DEPTH / 2))                              // base
  group.add(box(width - 0.035, 0.03, DEPTH - 0.04, oak, 0, SHELF_Y, DEPTH / 2))            // shoe shelf
  group.add(box(width - 0.035, 0.03, DEPTH - 0.04, oak, 0, HEIGHT - 0.28, DEPTH / 2))      // hat shelf above the rail
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, width - 0.035, 12), metal)
  rail.rotation.z = Math.PI / 2
  rail.position.set(0, RAIL_Y, DEPTH / 2)
  group.add(rail)

  // storage boxes on the top shelf
  for (const [i, c] of [0xd9cdb8, 0xb9c4cf, 0xcab8a8].entries()) {
    const x = -width / 2 + 0.28 + i * 0.36
    if (x < width / 2 - 0.25) group.add(box(0.3, 0.18, 0.4, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }), x, HEIGHT - 0.28 + 0.105, DEPTH / 2))
  }

  // drawers under the shoe shelf, centred, with knobs
  const drawerW = Math.min(0.9, width - 0.3)
  for (let d = 0; d < 2; d++) {
    const y = 0.2 + d * 0.16
    group.add(box(drawerW, 0.14, 0.03, doorMat, 0, y + 0.07, DEPTH - 0.02))
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), metal)
    knob.position.set(0, y + 0.07, DEPTH + 0.005)
    group.add(knob)
  }

  // warm LED strip along the front of the top panel + a soft light inside
  group.add(box(width - 0.1, 0.012, 0.02, warm, 0, HEIGHT - 0.03, DEPTH - 0.06))
  const light = new THREE.PointLight(0xffe2b0, 0.9, 3.5, 1.6)
  light.position.set(0, HEIGHT - 0.2, DEPTH / 2 + 0.1)
  group.add(light)

  // two doors swung open against the sides; the right one carries a full-length mirror
  const doorH = HEIGHT - 0.2
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group()
    hinge.position.set((s * width) / 2, 0.1 + doorH / 2, DEPTH)
    hinge.rotation.y = s * -1.75      // ~100 degrees open
    const leaf = box(width / 2 - 0.01, doorH, 0.03, doorMat, (-s * (width / 2 - 0.01)) / 2, 0, 0)
    hinge.add(leaf)
    const handle = box(0.02, 0.22, 0.02, metal, -s * (width / 2 - 0.08), 0, 0.025)
    hinge.add(handle)
    if (s === 1) {
      const mirror = new THREE.Mesh(new THREE.PlaneGeometry(width / 2 - 0.12, doorH - 0.3), mirrorMat)
      mirror.position.set((-s * (width / 2 - 0.01)) / 2, 0, -0.017)
      mirror.rotation.y = Math.PI
      hinge.add(mirror)
    }
    group.add(hinge)
  }

  const entries = new Map<string, { node: THREE.Group; restZ: number; restRotY: number; item: WardrobeItem; height: number }>()

  // clothes on hangers
  const usable = width - 0.3
  const step = hangingItems.length > 1 ? Math.min(0.14, usable / (hangingItems.length - 1)) : 0
  const x0 = -((hangingItems.length - 1) * step) / 2
  hangingItems.forEach((item, i) => {
    const kind = garmentKind(item.category)
    const cloth = new THREE.MeshStandardMaterial({ color: colorFromName(item.color), roughness: 0.92, side: THREE.DoubleSide })
    const node = new THREE.Group()
    node.add(hanger(metal, kind === 'dress' || kind === 'top' || kind === 'outer' ? 0.42 : 0.34))
    node.add(garmentBody(kind, cloth))
    node.position.set(x0 + i * step, RAIL_Y, DEPTH / 2)
    node.rotation.y = Math.PI / 2 - 0.22 // hung side-on like a real wardrobe, slightly turned toward the viewer
    node.userData.wardrobeItemId = item.item_id
    node.traverse(o => (o.userData.wardrobeItemId = item.item_id))
    group.add(node)
    entries.set(item.item_id, { node, restZ: node.position.z, restRotY: node.rotation.y, item, height: 0.9 })
  })

  // shelf items
  const sStep = shelfItems.length > 1 ? Math.min(0.3, (width - 0.4) / (shelfItems.length - 1)) : 0
  const sx0 = -((shelfItems.length - 1) * sStep) / 2
  shelfItems.forEach((item, i) => {
    const node = shelfItem(garmentKind(item.category), colorFromName(item.color))
    node.position.set(sx0 + i * sStep, SHELF_Y + 0.015, DEPTH / 2)
    node.traverse(o => (o.userData.wardrobeItemId = item.item_id))
    node.userData.wardrobeItemId = item.item_id
    group.add(node)
    entries.set(item.item_id, { node, restZ: node.position.z, restRotY: node.rotation.y, item, height: 0.25 })
  })

  let label: THREE.Sprite | null = null
  const select = (id: string | null) => {
    for (const e of entries.values()) {
      e.node.position.z = e.restZ
      e.node.rotation.y = e.restRotY
      e.node.traverse(o => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
        if (m && 'emissive' in m && o.type === 'Mesh') m.emissive?.setHex(0x000000)
      })
    }
    if (label) {
      group.remove(label)
      ;(label.material as THREE.SpriteMaterial).map?.dispose()
      label.material.dispose()
      label = null
    }
    const hit = id ? entries.get(id) : undefined
    if (!hit) return
    hit.node.position.z = hit.restZ + 0.2   // pull toward the viewer
    hit.node.rotation.y = 0                 // face the front
    hit.node.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (m && 'emissive' in m && o.type === 'Mesh' && m.color.getHex() !== 0xb9bec7) {
        m.emissive.setHex(0x3b82f6)
        m.emissiveIntensity = 0.25
      }
    })
    label = labelSprite(hit.item.name ?? 'Item')
    label.position.set(hit.node.position.x, hit.node.position.y + (isHanging(garmentKind(hit.item.category)) ? 0.25 : 0.55), hit.node.position.z + 0.05)
    group.add(label)
  }

  const dispose = () => {
    select(null)
    group.traverse(o => {
      const m = o as THREE.Mesh
      m.geometry?.dispose?.()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach(x => x.dispose())
      else mat?.dispose?.()
    })
  }

  return { group, width, depth: DEPTH, hanging: hangingItems.length, onShelf: shelfItems.length, select, dispose }
}

export interface PlacementRoom {
  center: { x: number; z: number }
  width: number
  depth: number
}

/**
 * Stand the unit against the room's back (-z) wall, open side facing into the room.
 * Returns a collider for the open front so the player stands in front of it rather than inside.
 */
export function placeWardrobeUnit(unit: WardrobeUnit, room: PlacementRoom, wallInset = 0.12): WallCollider {
  const z = room.center.z - room.depth / 2 + wallInset
  unit.group.position.set(room.center.x, 0, z)
  unit.group.rotation.y = 0
  const fz = z + unit.depth + 0.02
  return { ax: room.center.x - unit.width / 2, az: fz, bx: room.center.x + unit.width / 2, bz: fz, r: 0.05 }
}

/** Pick the room for the wardrobe: the user's assigned one, else a bedroom/closet, else the first room. */
export function chooseWardrobeRoom<T extends { room_id: string; room_function?: string }>(
  rooms: T[],
  assignments: Record<string, string>,
): T | undefined {
  const assigned = rooms.find(r => /wardrobe/i.test(assignments[r.room_id] ?? ''))
  if (assigned) return assigned
  return rooms.find(r => /(closet|bedroom)/i.test(r.room_function ?? '')) ?? rooms[0]
}
