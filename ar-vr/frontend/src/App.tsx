import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const BASE_URL: string = (import.meta as any).env?.VITE_API_URL || 'http://127.0.0.1:8001'
const USER_ID = 'user-123'

// ─── API helper ───
async function api(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

const qs = (params: Record<string, string>) => '?' + new URLSearchParams(params).toString()

// ─── Toast ───
function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((msg: string, timeout = 4000) => {
    setMessage(msg)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), timeout)
  }, [])
  return { message, show }
}
// WYA Wardrobe browsing
  const browseWyaWardrobe = async () => {
    try {
      const wardrobe = await api("/api/wardrobe/browse", { method: "POST", body: JSON.stringify({ user_id: USER_ID }) })
      if (wardrobe.items && wardrobe.items.length > 0) {
        const itemsText = wardrobe.items
          .slice(0, 5)
          .map((item: any) => item.item_name ?? item.name ?? "Item")
          .join(", ")
        toast(`Wardrobe loaded with: ${itemsText}`)
      } else {
        toast("Wardrobe loaded")
      }
    } catch (error) {
      toast("Failed to load wardrobe")
      console.error("WARDROBE ERROR:", error)
    }
  }


// ─── Scene types ───
enum SceneType {
  ACTUAL_BATISSE = 'actual_batisse',
  GEOMETRY_DERIVED = 'geometry_derived',
  PLACEHOLDER = 'placeholder',
}


// ─── Player Controller ──────────────────────────────────────────────────────
function usePlayerController(
  camera: THREE.PerspectiveCamera,
  options: { canJump: boolean; canSprint: boolean; canCrouch: boolean }
) {
  const [state, setState] = React.useState<{
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    jump: boolean
    sprint: boolean
    crouch: boolean
  }>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    crouch: false,
  })

  const velocity = React.useRef(0)
  const position = React.useRef(new THREE.Vector3(0, 1.6, 0))
  const direction = React.useRef(new THREE.Vector3(0, 0, -1))
  const onGround = React.useRef(true)
  const jumpRequested = React.useRef(false)

  // Keyboard handling
  React.useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': setState(s => ({ ...s, forward: true }))
        case 'KeyS': setState(s => ({ ...s, backward: true }))
        case 'KeyA': setState(s => ({ ...s, left: true }))
        case 'KeyD': setState(s => ({ ...s, right: true }))
        case 'Space': if (options.canJump) setState(s => ({ ...s, jump: true }))
        case 'ShiftLeft': if (options.canSprint) setState(s => ({ ...s, sprint: true }))
        case 'ControlLeft': if (options.canCrouch) setState(s => ({ ...s, crouch: true }))
      }
    }
const keyup = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': setKeys(s => ({ ...s, forward: false }))
        case 'KeyS': setKeys(s => ({ ...s, backward: false }))
        case 'KeyA': setKeys(s => ({ ...s, left: false }))
        case 'KeyD': setKeys(s => ({ ...s, right: false }))
        case 'Space': setKeys(s => ({ ...s, jump: false }))
        case 'ShiftLeft': setKeys(s => ({ ...s, sprint: false }))
        case 'ControlLeft': setKeys(s => ({ ...s, crouch: false }))
      }
      // Door interaction: E key release
      if (e.code === 'KeyE' && currentRoom) {
        handleDoorInteraction(currentRoom, 'front')
      }
      // Furniture interaction: E key release when not in a room
      if (e.code === 'KeyE' && !currentRoom && roomFurniture.length > 0) {
        const playerCenter = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z)
        const nearestFurniture = roomFurniture.reduce((nearest, furn) => {
          const furnCenter = furn.mesh.position.clone()
          const distance = playerCenter.distanceTo(furnCenter)
          return distance < (nearest ? nearest.distance : Infinity) ? { mesh: furn.mesh, distance: distance, type: furn.type, rotatable: furn.rotatable !== false } : nearest
        }, null)
        if (nearestFurniture) {
          switch (nearestFurniture.type) {
            case 'sofa':
              toast('Press E to sit')
              break
            case 'bed':
              toast('Press E to rest')
              break
            case 'wardrobe':
              // Open WYA wardrobe browsing
              toast('Opening wardrobe...')
              browseWyaWardrobe()
              break
            case 'counter':
              toast('Press E to interact')
              break
            case 'display case':
              toast('Press E to open jewellery studio')
              break
            case 'jewellery-studio':
              toast('Opening jewellery studio...')
              generateJewelleryDesign()
              break
            case 'fitting-room':
              toast('Opening fitting studio...')
              tryOnGarment()
              break
            case 'lamp':
            case 'table':
              // Toggle furniture selection/placement mode
              setSelectedFurniture(prev => prev === nearestFurniture.type ? null : nearestFurniture.type)
              break
            case 'plant':
              toast('Watering plant')
              break
            case 'painting':
              toast('Admiring artwork')
              break
            default:
              toast('Interact with object')
          }
        }              toast('Interact with object')
          }
        }
      }
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
    }
  }, [options.canJump, options.canSprint, options.canCrouch])

  // Mouse look
  React.useEffect(() => {
    const mouseMove = (e: MouseEvent) => {
      // Update camera rotation based on mouse delta
    }
    const mount = document.getElementById('three-viewer')
    if (mount) {
      mount.addEventListener('mousemove', mouseMove)
    }
    return () => mouseRef.current && mouseRef.current.removeEventListener('mousemove', mouseMove)
  }, [])n

  // Physics and movement
  React.useEffect(() => {
    const speed = state.sprint ? 7 : state.crouch ? 2 : 4
    // Calculate movement direction
    const moveX = (state.forward ? 1 : -1) * speed * 0.016 + (state.left ? -1 : state.right ? 1 : 0) * speed * 0.016
    const moveZ = (state.forward ? 1 : -1) * speed * 0.016
    position.current.x += moveX
    position.current.z += moveZ
    
    // Jump physics
    if (state.jump && onGround.current) {
      velocity.current = 5
      onGround.current = false
    }
    velocity.current += -9.8 * 0.016 // gravity
    position.current.y += velocity.current * 0.016
    
    // Ground check
    if (position.current.y < 0) {
      position.current.y = 0
      velocity.current = 0
      onGround.current = true
    }
    
    camera.position.copy(position.current)
  }, [state, camera, options])

  return { state, position: position.current, onGround }
}
const mat = (color: number) => new THREE.MeshStandardMaterial({ color })

function baseRoom(group: THREE.Group, w = 10, d = 10) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0x2a2e37))
  floor.rotation.x = -Math.PI / 2
  group.add(floor)
}

function createPlaceholderScene(): THREE.Group {
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

function createGeometryDerivedScene(rooms: any[]): THREE.Group {
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

async function loadActualBatisseGLB(glbBase64: string): Promise<THREE.Group | null> {
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

// ─── Three.js viewer ───
function ThreeViewer({ model, meshUrl }: { model: THREE.Object3D | null; meshUrl?: string }) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !model) return
    const width = mount.clientWidth || 600
    const height = 400

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0e17)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 0.9)
    dir.position.set(5, 8, 5)
    scene.add(dir)
    
    // Add furniture to the scene
    if (roomFurniture && roomFurniture.length > 0) {
      roomFurniture.forEach((furn: any) => {
        scene.add(furn.mesh)
      })
    }
    
    scene.add(model)

    // Load VELARIS 3D mesh if URL provided
    let gltfLoader: GLTFLoader | null = null
    let loadedMesh: THREE.Object3D | null = null
    if (meshUrl) {
      gltfLoader = new GLTFLoader()
      gltfLoader.load(
        meshUrl,
        (gltf) => {
          loadedMesh = gltf.scene
          scene.add(loadedMesh)
          // Adjust camera to include both model and mesh
          const combined = new THREE.Object3D()
          combined.add(loadedMesh, model)
          const box = new THREE.Box3().setFromObject(combined)
          const center = box.getCenter(new THREE.Vector3())
          const size = box.getSize(new THREE.Vector3())
          const dist = Math.max(size.x, size.y, size.z, 4) * 1.4
          camera.position.set(center.x + dist, center.y + dist * 0.8, center.z + dist)
          camera.lookAt(center)
        },
        undefined,
        (error) => {
          console.error('Failed to load VELARIS mesh:', error)
        }
      )
    }

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const dist = Math.max(size.x, size.y, size.z, 4) * 1.4
    camera.position.set(center.x + dist, center.y + dist * 0.8, center.z + dist)
    camera.lookAt(center)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(center)
    controls.update()

    let raf = 0
    const animate = () => {
      raf = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      controls.dispose()
      scene.remove(model)
      if (loadedMesh && gltfLoader) {
        scene.remove(loadedMesh)
      }
      // Remove furniture from scene
      if (roomFurniture && roomFurniture.length > 0) {
        roomFurniture.forEach((furn: any) => {
          scene.remove(furn.mesh)
        })
      }
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [model, meshUrl, roomFurniture])

  return <div ref={mountRef} style={{ width: '100%', height: 400, borderRadius: 8, overflow: 'hidden' }} />
}

// ─── Shared UI ───
const cardStyle: CSSProperties = {
  padding: '2rem',
  background: 'rgba(15, 23, 42, 0.8)',
  borderRadius: 12,
  marginBottom: '1rem',
}

const buttonStyle = (color: string): CSSProperties => ({
  width: '100%',
  padding: '0.8rem',
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${color}`,
  borderRadius: 8,
  color: '#d1d9e1',
  fontWeight: 500,
  cursor: 'pointer',
  marginTop: '1rem',
})

function Card({ title, color, description, children }: { title: string; color: string; description: string; children?: ReactNode }) {
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color }}>{title}</h3>
      <p style={{ margin: '0 0 1rem 0', opacity: 0.8 }}>{description}</p>
      {children}
    </div>
  )
}

type Notify = (msg: string) => void

// ─── BATISSE ───
function BatissePage({ toast }: { toast: Notify }) {
  const [sceneType, setSceneType] = useState<SceneType>(SceneType.PLACEHOLDER)
  const [model, setModel] = useState<THREE.Object3D | null>(null)
  const [rooms, setRooms] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentRoom, setCurrentRoom] = useState<string | null>(null)
  const [homeConfig, setHomeConfig] = useState<'none' | 'loading' | 'generated' | 'error'>('none')
  const [homeConfig, setHomeConfig] = useState<'none' | 'loading' | 'generated' | 'error'>('none')
  const [roomFurniture, setRoomFurniture] = useState<any[]>([])
  const [homeGeometry, setHomeGeometry] = useState<any | null>(null)
  const [spawnPoint, setSpawnPoint] = React.useState(new THREE.Vector3(0, 1.6, 0))


const [playerPos, setPlayerPos] = React.useState(new THREE.Vector3(0, 1.6, 0))
  const [selectedFurniture, setSelectedFurniture] = React.useState<string | null>(null)
  const [isPlacing, setIsPlacing] = React.useState(false)
  const [placePosition, setPlacePosition] = React.useState(new THREE.Vector3(0, 0, 0))
  const [placeRotation, setPlaceRotation] = React.useState(0)
  const [isRotating, setIsRotating] = React.useState(false)
  const [playerPerspective, setPlayerPerspective] = React.useState<'first' | 'third'>('first')
  const [playerVelocity, setPlayerVelocity] = React.useState(new THREE.Vector3(0, 0, 0))
  const [isGrounded, setIsGrounded] = React.useState(true)
  const [isSprinting, setIsSprinting] = React.useState(false)
  const [isCrouching, setIsCrouching] = React.useState(false)

  // Keyboard state
  const keys = React.useState({
    forward: false, backward: false, left: false, right: false,
    jump: false, sprint: false, crouch: false,
  })[1]

  // F5 toggle for perspective
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F5') {
        setPlayerPerspective(prev => prev === 'first' ? 'third' : 'first')
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'F5') {}
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Personalised home generation
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setHomeConfig('loading')
        // Get geometry for project 1
        const data = await api('/api/batisse/projects/1/geometry')
        if (cancelled) return
        const roomList: any[] = data.rooms || []

        if (data.ready_for_3d && data.geometry) {
          try {
            // Export as GLB
            const glb = await api('/api/batisse/projects/1/geometry/export-glb', { method: 'POST' })
            const loaded = glb && glb.success !== false ? await loadActualBatisseGLB(glb.glb_base64 || '') : null
            if (cancelled) return
            if (loaded) {
              setHomeGeometry(loaded)
              setHomeConfig('generated')
              // Set spawn point outside the home (in front of the entrance)
              setSpawnPoint(new THREE.Vector3(0, 1.6, -10))
              return
            }
          } catch {
            /* fall through to geometry-derived */
          }
        }
        // Geometry-derived fallback
        setHomeGeometry(createGeometryDerivedScene(roomList))
        setHomeConfig('generated')
// Set room furniture based on room type
        const roomFurniture: any[] = []
        roomList.forEach((room: any) => {
          const roomId = String(room.room_id ?? 0)
          const roomName = (room.room_name ?? '').toLowerCase() || ''
          
          // Create furniture based on room function
          if (roomName.includes('living') || roomName.includes('sitting')) {
            // Living room furniture
            const sofa = new THREE.Mesh(
              new THREE.BoxGeometry(4, 1, 2),
              new THREE.MeshStandardMaterial({ color: 0x4a4e69 })
            )
            sofa.position.set(-2, 0.5, -2)
            roomFurniture.push({ type: 'sofa', mesh: sofa, roomId })
            
            const coffeeTable = new THREE.Mesh(
              new THREE.BoxGeometry(1.5, 0.5, 1.5),
              new THREE.MeshStandardMaterial({ color: 0x7a8ba0 })
            )
            coffeeTable.position.set(0, 0.25, 0)
            roomFurniture.push({ type: 'coffee table', mesh: coffeeTable, roomId })
          }
          
          if (roomName.includes('bedroom') || roomName.includes('bed')) {
            // Bedroom furniture
            const bed = new THREE.Mesh(
              new THREE.BoxGeometry(4, 2, 2),
              new THREE.MeshStandardMaterial({ color: 0x5a3e4f })
            )
            bed.position.set(0, 1, 0)
            roomFurniture.push({ type: 'bed', mesh: bed, roomId })
            
            const nightstand = new THREE.Mesh(
              new THREE.BoxGeometry(1.5, 1.5, 1.5),
              new THREE.MeshStandardMaterial({ color: 0x5a3e4f })
            )
            nightstand.position.set(-3, 0.75, 2)
            roomFurniture.push({ type: 'nightstand', mesh: nightstand, roomId })
          }
          
          if (roomName.includes('kitchen') || roomName.includes('cook')) {
            // Kitchen furniture
            const counter = new THREE.Mesh(
              new THREE.BoxGeometry(3, 0.5, 0.5),
              new THREE.MeshStandardMaterial({ color: 0x6b5b96 })
            )
            counter.position.set(0, 0.25, -3)
            roomFurniture.push({ type: 'counter', mesh: counter, roomId })
          }
          
          if (roomName.includes('bathroom') || roomName.includes('bath')) {
            // Bathroom furniture
            const vanity = new THREE.Mesh(
              new THREE.BoxGeometry(2, 0.8, 0.5),
              new THREE.MeshStandardMaterial({ color: 0x7a8b9e })
            )
            vanity.position.set(0, 0.4, -2)
            roomFurniture.push({ type: 'vanity', mesh: vanity, roomId })
          }
          
          if (roomName.includes('wardrobe') || roomName.includes('closet')) {
            // Wardrobe furniture
            const wardrobe = new THREE.Mesh(
              new THREE.BoxGeometry(2, 2.5, 0.5),
              new THREE.MeshStandardMaterial({ color: 0x4a3b5e })
            )
            wardrobe.position.set(-3, 1.25, 0)
            roomFurniture.push({ type: 'wardrobe', mesh: wardrobe, roomId })
          }
          
          
          if (roomName.includes('fitting') || roomName.includes('tryon')) {
            // Fitting room furniture
            const fittingMirror = new THREE.Mesh(
              new THREE.BoxGeometry(2, 2.5, 0.5),
              new THREE.MeshStandardMaterial({ color: 0xfab1a0 })
            )
            fittingMirror.position.set(0, 1.25, 0)
            roomFurniture.push({ type: 'fitting-room', mesh: fittingMirror, roomId })
          }
          
          // Decoration furniture types
          if (roomName.includes('bedroom')) {
            // Nightstand lamp
            const lamp = new THREE.Mesh(
              new THREE.BoxGeometry(0.5, 1.5, 0.5),
              new THREE.MeshStandardMaterial({ color: 0xffa500 })
            )
            lamp.position.set(0.5, 1.75, 0.5)
            roomFurniture.push({ type: 'lamp', mesh: lamp, roomId, rotatable: true })
            // Plant
            const plant = new THREE.Mesh(
              new THREE.SphereGeometry(0.3, 16, 16),
              new THREE.MeshStandardMaterial({ color: 0x228b22 })
            )
            plant.position.set(-0.5, 0.3, -0.5)
            roomFurniture.push({ type: 'plant', mesh: plant, roomId })
          }
          
          if (roomName.includes('living')) {
            // Rug
            const rug = new THREE.Mesh(
              new THREE.PlaneGeometry(3, 2),
              new THREE.MeshStandardMaterial({ color: 0xdc143c, side: DoubleSide })
            )
            rug.rotation.x = -Math.PI / 2
            rug.position.set(0, 0.01, 0)
            roomFurniture.push({ type: 'rug', mesh: rug, roomId })
            // Table
            const table = new THREE.Mesh(
              new THREE.BoxGeometry(1.5, 0.5, 1.5),
              new THREE.MeshStandardMaterial({ color: 0x8b4513 })
            )
            table.position.set(0, 0.25, 0)
            roomFurniture.push({ type: 'table', mesh: table, roomId, rotatable: true })
          }
          
          if (roomName.includes('bedroom')) {
            // Painting
            const painting = new THREE.Mesh(
              new THREE.PlaneGeometry(1, 1.5),
              new THREE.MeshStandardMaterial({ color: 0x2f4f4f, side: DoubleSide })
            )
            painting.position.set(0, 1.5, 0.5)
            roomFurniture.push({ type: 'painting', mesh: painting, roomId })
          }
            // Jewellery studio furniture
            const displayCase = new THREE.Mesh(
              new THREE.BoxGeometry(2, 1, 1),
              new THREE.MeshStandardMaterial({ color: 0xd4af37 })
            )
            displayCase.position.set(0, 0.5, 0)
            roomFurniture.push({ type: 'display case', mesh: displayCase, roomId })
          }
        })
        
        setRoomFurniture(roomFurniture)
        // Set spawn point outside geometry-derived home
        setSpawnPoint(new THREE.Vector3(0, 1.6, -8))
      } catch {
        if (cancelled) return
        setHomeConfig('error')
        setError('Failed to generate home')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])


// Mouse look effect
  React.useEffect(() => {
    const mount = document.getElementById('three-viewer')
    if (!mount) return
    const mouseMove = (e: MouseEvent) => {
      if (playerPerspective === 'first') {
        const sensitivity = 0.002
        playerPos.x -= e.movementX * sensitivity
        playerPos.z += e.movementY * sensitivity
      }
    }
    mount.addEventListener('mousemove', mouseMove)
    return () => mount.removeEventListener('mousemove', mouseMove)
  }, [playerPerspective])

  // Player movement and physics
  React.useEffect(() => {
    const speed = isSprinting ? 7 : isCrouching ? 2 : 4
    const dt = 0.016
    \n  // Calculate movement direction\n  const direction = new THREE.Vector3(0, 0, 0)
  \n  if (keys.forward) direction.z -= 1\n  if (keys.backward) direction.z += 1\n  if (keys.left) direction.x -= 1\n  if (keys.right) direction.x += 1
  \n  // Apply camera orientation for first-person movement\n  if (playerPerspective === 'first') {\n    const orientation = new THREE.Euler(0, playerPos.y, 0, 'YXZ')\n    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerPos.y)\n  }\n  direction.multiplyScalar(speed * dt)\n  position.current.add(direction)\n  \n  // Jump physics\n  if (keys.jump && onGround.current) {\n    velocity.current.y = 5\n    onGround.current = false\n  }\n  \n  // Gravity\n  velocity.current.y += -9.8 * dt\n  position.current.y += velocity.current.y * dt\n  \n  // Ground check\n  if (position.current.y < 0) {\n    position.current.y = 0\n    velocity.current.y = 0\n    setIsGrounded(true)\n  } else {\n    setIsGrounded(false)\n  }\n\n  // Sync playerPos state\n  setPlayerPos(position.current)\n  setIsSprinting(keys.sprint)\n  setIsCrouching(keys.crouch)\n}, [keys, isSprinting, isCrouching, onGround])

  // Door interaction handling
  const handleDoorInteraction = (roomId: string, doorSide: 'front' | 'back' | 'left' | 'right') => {
    api(`/api/navigation/set-room/${USER_ID}/${roomId}`, { method: 'POST' })
      .then(() => {
        setCurrentRoom(roomId)
        toast(`Moved to room ${roomId} via ${doorSide} door`)
        setLunaExpression('idle')
      })
      .catch(() => toast('Door navigation failed'))
  }

              >
                {room.room_name || room.room_function || `Room ${id}`}
              </button>
            )
          })}
        </div>
      )}
      {/* Door interaction hints */}
      {currentRoom && (
        <div style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', color: '#94a3b8', fontSize: '0.75rem', textAlign: 'center' }}>
          <span>Press <kbd>E</kbd> to enter {currentRoom}</span>
        </div>
      )}
      {/* HUD: hotbar and perspective indicator */}
      <Hotbar selectedSlot={selectedSlot} inventory={inventory} setInventory={setInventory} />
      <PerspectiveIndicator perspective={playerPerspective} />
      <button onClick={upload} disabled={loading} style={buttonStyle('#64a8d6')}>
        {loading ? 'Working…' : 'Upload Floor Plan →'}
      </button>
    </Card>
  )
}

// ─── Luna Companion ───
function LunaCompanion({ playerPos, playerPerspective, lunaState, setLunaState, toggleLunaFollowing, setLunaExpression }: {
  playerPos: THREE.Vector3
  playerPerspective: 'first' | 'third'
  lunaState: string
  setLunaState: React.Dispatch<React.SetStateAction<string>>
  toggleLunaFollowing: () => void
  setLunaExpression: (expression: string) => void
}) {
  // Luna's position follows the player
  const lunaPosition = React.useRef(new THREE.Vector3(playerPos.x, playerPos.y + 1, playerPos.z))

  // Update Luna's position to follow player
  React.useEffect(() => {
    lunaPosition.current.x = playerPos.x
    lunaPosition.current.y = playerPos.y + 1
    lunaPosition.current.z = playerPos.z
  }, [playerPos.x, playerPos.y, playerPos.z])

  // Update Luna state based on following toggled
  React.useEffect(() => {
    if (lunaState === 'following') {
      // Luna follows player - already handled by position update
    }
  }, [lunaState])

  // Luna expressions
  const expressions = ['idle', 'happy', 'thinking', 'walking']
  const expressionIndex = expressions.indexOf(lunaState) || 0

  // Change expression periodically when following
  React.useEffect(() => {
    const interval = setInterval(() => {
      const nextIndex = (expressionIndex + 1) % expressions.length
      setLunaExpression(expressions[nextIndex])
    }, 3000)
    return () => clearInterval(interval)
  }, [lunaState])

  // Luna 3D model
  const lunaMesh = React.useRef<THREE.Mesh | null>(null)

  React.useEffect(() => {
    const geometry = new THREE.SphereGeometry(0.5, 16, 16)
    const material = new THREE.MeshStandardMaterial({ color: 0x00ffcc })
    lunaMesh.current = new THREE.Mesh(geometry, material)
    lunaMesh.current.position.copy(lunaPosition.current)
  }, [])

  // Luna following behavior
  React.useEffect(() => {
    const animate = () => {
      if (lunaMesh.current) {
        // Smooth follow with slight lag
        lunaMesh.current.lerp(lunaPosition.current, 0.1)
        // Turn toward player
        lunaMesh.current.lookAt(playerPos)
      }
      requestAnimationFrame(animate)
    }
    animate()
  }, [lunaMesh, playerPos])

  return (
    <group ref={lunaMesh} style={{
      position: 'absolute',
      width: 100,
      height: 100,
      pointerEvents: 'none'
    }}>
      {/* Luna is rendered via Three.js in the scene */}
    </group>
  )
}

// ─── Exterior Environment ───
function ExteriorEnvironment() {
  // Sky and sunlight
  const sky = React.useRef<THREE.Group | null>(null)
  const sun = React.useRef<THREE.DirectionalLight | null>(null)

  React.useEffect(() => {
    // Create sky group
    sky.current = new THREE.Group()
    sky.current.name = 'exterior-environment'

    // Create sun
    sun.current = new THREE.DirectionalLight(0xffffff, 1.0)
    sun.current.position.set(50, 50, 50)
    sky.current.add(sun.current)

    // Create ambient light
    const ambient = new THREE.AmbientLight(0x404040, 0.5)
    sky.current.add(ambient)

    // Create ground plane
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({ color: 0x2a2e37 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = 0
    sky.current.add(ground)

    // Create moon group
    const moonGroup = new THREE.Group()
    moonGroup.name = 'moon-group'
    
    // Moon sphere
    const moonGeometry = new THREE.SphereGeometry(2, 16, 16)
    const moonMaterial = new THREE.MeshStandardMaterial({ color: 0xf0f0f0 })
    const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial)
    moonMesh.position.set(80, 50, 80)
    moonMesh.rotation.x = -Math.PI / 2
    moonGroup.add(moonMesh)
    
    // Moon glow
    const moonGlowGeometry = new THREE.SphereGeometry(2.2, 16, 16)
    const moonGlowMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xf0f0f0, 
      opacity: 0.6, 
      transparent: true 
    })
    const moonGlow = new THREE.Mesh(moonGlowGeometry, moonGlowMaterial)
    moonGroup.add(moonGlow)
    
    sky.current.add(moonGroup)

    return scene => {
      if (scene.getObjectByName('exterior-environment')) {
        scene.remove(scene.getObjectByName('exterior-environment'))
      }
    }
  }, [])

  // Time progression state - day/night cycle
  const [timeOfDay, setTimeOfDay] = React.useState(0) // 0-1, 0 = midnight, 0.5 = noon, 1 = sunset
  const [weather, setWeather] = React.useState<'clear' | 'rain' | 'cloudy'>('clear')
  const [rainAccumulator, setRainAccumulator] = React.useState(0)
  
  // Time progression effect - complete day/night cycle over 20 seconds
  React.useEffect(() => {
    let animationId = 0
    const startTime = performance.now()
    
    const animateTime = () => {
      const elapsed = performance.now() - startTime
      // Complete cycle every 20 seconds, going from 0 to 1 and back
      const cycle = (elapsed % 40000) / 20000
      if (cycle > 1) {
        setTimeOfDay(2 - cycle)
      } else {
        setTimeOfDay(cycle)
      }
      animationId = requestAnimationFrame(animateTime)
    }
    
    animationId = requestAnimationFrame(animateTime)
    return () => cancelAnimationFrame(animationId)
  }, [])
  
  // Weather effect - rain simulation
  React.useEffect(() => {
    let rainParticleCount = 0
    let rainInterval = 0
    
    const initRain = () => {
      if (weather !== 'rain') {
        // Clear existing rain
        if (rainInterval) {
          clearInterval(rainInterval)
          rainInterval = 0
        }
        rainParticleCount = 0
        return
      }
      
      if (rainParticleCount === 0) {
        // Create rain particles
        const rainGroup = new THREE.Group()
        rainGroup.name = 'rain-group'
        
        for (let i = 0; i < 200; i++) {
          const particle = new THREE.Mesh(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(
                Math.random() * 100 - 50,
                Math.random() * 100,
                Math.random() * 100
              )
            ]),
            new THREE.MeshBasicMaterial({ 
              color: 0x88c0d0, 
              size: 0.1 + Math.random() * 0.2 
            })
          )
          particle.position.set(
            Math.random() * 100 - 50,
            Math.random() * 200,
            Math.random() * 100 - 50
          )
          particle.userData.speed = 0.5 + Math.random() * 0.5
          particle.userData.length = 20 + Math.random() * 30
          rainGroup.add(particle)
        }
        
        // Add rain group to sky
        if (sky.current) {
          sky.current.add(rainGroup)
        }
        rainParticleCount = 200
      }
    }
    
    initRain()
    
    // Rain animation
    if (weather === 'rain') {
      rainInterval = setInterval(() => {
        if (!sky.current || rainParticleCount === 0) return
        
        const particles = sky.current.getObjectByName('rain-group')
        if (!particles) return
        
        particles.traverse((object: any) => {
          if (object.isMesh && object.userData.speed) {
            object.position.y -= object.userData.speed
            if (object.position.y < 0) {
              object.position.y = 200 + Math.random() * 50
              object.position.x = Math.random() * 100 - 50
              object.position.z = Math.random() * 100 - 50
            }
          }
        })
      }, 16)
    }
    
    return () => {
      if (rainInterval) clearInterval(rainInterval)
      if (sky.current) {
        const rainGroup = sky.current.getObjectByName('rain-group')
        if (rainGroup) sky.current.remove(rainGroup)
      }
    }
  }, [weather])
  
  // Interior lighting based on time of day
  React.useEffect(() => {
    const updateInteriorLighting = () => {
      if (!sky.current) return
      
      // Find or create interior light group
      let interiorGroup = sky.current.getObjectByName('interior-lighting')
      if (!interiorGroup) {
        interiorGroup = new THREE.Group()
        interiorGroup.name = 'interior-lighting'
        sky.current.add(interiorGroup)
      }
      
      // Adjust based on time of day
      // 0 = midnight (dark), 0.5 = noon (bright), 1 = sunset (golden)
      const t = timeOfDay
      
      // Sunset/sunrise golden hour effect
      const goldenHour = Math.sin(t * Math.PI * 2) > 0 ? Math.sin(t * Math.PI * 2) : 0
      const ambientIntensity = 0.3 + goldenHour * 0.4
      const sunIntensity = 1.0 + goldenHour * 0.5
      
      // Update ambient light
      const ambientLight = sky.current.getObjectByName('ambient-light')
      if (ambientLight) {
        ambientLight.intensity = ambientIntensity
      }
      
      // Update sun direction based on time
      const sunLight = sky.current.getObjectByName('sun-light')
      if (sunLight) {
        // Sun rises in east, sets in west (negative z direction)
        const angle = (t - 0.5) * Math.PI // -PI/2 to PI/2
        sunLight.position.set(Math.cos(angle) * 50, 50, Math.sin(angle) * 50)
        sunLight.intensity = sunIntensity
      }
      
      // Moon direction (opposite of sun)
      const moonLight = sky.current.getObjectByName('moon-light')
      if (moonLight) {
        const moonAngle = (t - 0.5) * Math.PI + Math.PI // opposite of sun
        moonLight.position.set(Math.cos(moonAngle) * 50, 50, Math.sin(moonAngle) * 50)
        moonLight.intensity = 0.5 * (1 - goldenHour)
      }
    }
    
    updateInteriorLighting()
  }, [timeOfDay])
  
  // Luna's time-aware behaviour
  React.useEffect(() => {
    const expressions = ['idle', 'sleepy', 'happy', 'thinking']
    
    const updateLunaExpression = () => {
      const hour = timeOfDay * 24
      
      if (hour >= 21 || hour < 6) {
        // Night time - sleepy
        setLunaExpression('sleepy')
      } else if (hour >= 6 && hour < 12) {
        // Morning - happy
        setLunaExpression('happy')
      } else if (hour >= 12 && hour < 18) {
        // Afternoon - thinking
        setLunaExpression('thinking')
      } else {
        // Evening - idle
        setLunaExpression('idle')
      }
    }
    
    updateLunaExpression()
  }, [timeOfDay, lunaState])
  
  // Add to scene when model is available
  React.useEffect(() => {
    const mount = document.getElementById('three-viewer')
    if (!mount || !model) return
    
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x87ceeb) // Sky blue

    // Add environment
    if (sky.current) {
      scene.add(sky.current)
    }

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 1000)
    camera.position.set(0, 2, 10)

    const rendererRef = renderer
    let raf = 0
    const animate = () => {
      raf = requestAnimationFrame(animate)
      rendererRef.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      rendererRef.dispose()
      if (rendererRef.domElement.parentNode === mount) {
        mount.removeChild(rendererRef.domElement)
      }
    }
  }, [model])

  return null
}

// ─── Avatar Customisation ───
function AvatarCustomisation({ 
  avatarType, 
  setAvatarType, 
  avatarColors, 
  setAvatarColors, 
  avatarProps,
  setAvatarProps 
 }: {
  avatarType: string
  setAvatarType: React.Dispatch<React.SetStateAction<string>>
  avatarColors: { primary: number; secondary: number }
  setAvatarColors: React.Dispatch<React.SetStateAction<{ primary: number; secondary: number }>}
  avatarProps: any
  setAvatarProps: React.Dispatch<React.SetStateAction<any>>
}) {
  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setAvatarType(e.target.value)
    setAvatarProps(prev => ({ ...prev, type: e.target.value }))
  }

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = parseInt(e.target.value.replace('#', ''), 16)
    setAvatarColors(prev => ({ ...prev, [e.target.name]: color }))
    setAvatarProps(prev => ({ ...prev, [e.target.name]: color }))
  }

  return (
    <Card title="Avatar Customisation" color="#6c5ce7" description="Customize your avatar appearance">
      <div style={{ padding: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e0e7ff' }}>Avatar Type</label>
        <select
          value={avatarType}
          onChange={handleTypeChange}
          style={{
            width: '100%',
            padding: '0.5rem',
            background: '#0f172a',
            border: '1px solid #3b3d4e',
            borderRadius: 6,
            color: '#e0e7ff',
            marginBottom: '1rem',
          }}
        >
          <option value="human">Human</option>
          <option value="elf">Elf</option>
          <option value="cat">Cat Person</option>
          <option value="dog">Dog Person</option>
        </select>

        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e0e7ff' }}>Primary Color</label>
        <input
          type="color"
          value="#" + avatarColors.primary.toString(16).padStart(6, '0')
          onChange={handleColorChange}
          name="primary"
          style={{
            width: '100%',
            height: '3rem',
            padding: '0',
            background: '#' + avatarColors.primary.toString(16).padStart(6, '0'),
            border: 'none',
            cursor: 'pointer',
          }}
        />
        <label style={{ display: 'block', marginBottom: '1rem', color: '#e0e7ff' }}>Secondary Color</label>
        <input
          type="color"
          value="#" + avatarColors.secondary.toString(16).padStart(6, '0')
          onChange={handleColorChange}
          name="secondary"
          style={{
            width: '100%',
            height: '3rem',
            padding: '0',
            background: '#' + avatarColors.secondary.toString(16).padStart(6, '0'),
            border: 'none',
            cursor: 'pointer',
          }}
        />

        {/* Avatar preview - simplified */}
        <div
          style={{
            width: 64,
            height: 64,
            background: 'rgba(255,255,255,0.1)',
            border: '2px solid #6c5ce7',
            borderRadius: 50,
            margin: '1rem auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#e0e7ff',
            fontSize: '1rem',
          }}
        >
          {avatarType === 'human' ? '👤' : avatarType === 'elf' ? '🧝' : '🐱'}
        </div>
      </div>
    </Card>
  )
}

// ─── WYA ───
function WyaPage({ toast }: { toast: Notify }) {
  return (
    <Card title="WYA — Wardrobe Intelligence" color="#10b981" description="Browse wardrobe items and get AI outfit recommendations.">
      <button
        style={buttonStyle('#22c55e')}
        onClick={() =>
          api(`/api/wardrobe/browse${qs({ user_id: USER_ID })}`, { method: 'POST' })
            .then(() => toast('Wardrobe loaded'))
            .catch(() => toast('Wardrobe browse failed'))
        }
      >
        Browse Wardrobe →
      </button>
      <button
        style={buttonStyle('#22c55e')}
        onClick={() =>
          api(`/api/wardrobe/outfit-recommendations${qs({ user_id: USER_ID, occasion: 'casual' })}`, { method: 'POST' })
            .then(() => toast('Recommendations loaded'))
            .catch(() => toast('Recommendations failed'))
        }
      >
        Get Outfit Recommendations →
      </button>
    </Card>
  )
}

// ─── TryOn ───
function TryOnPage({ toast }: { toast: Notify }) {
  return (
    <Card title="TryOn — Virtual Fitting Room" color="#f59e0b" description="Generate AI try-on previews for garments.">
      <button
        style={buttonStyle('#f59e0b')}
        onClick={() =>
          api(`/api/tryon/generate${qs({ garment_image_url: '/test.jpg', user_id: USER_ID })}`, {
            method: 'POST',
            body: JSON.stringify({}),
          })
            .then(() => toast('Try-on generated'))
            .catch(() => toast('Try-on failed'))
        }
      >
        Generate Try-On →
      </button>
    </Card>
  )
}

// ─── VELARIS ───
function VelarisPage({ toast }: { toast: Notify }) {
  return (
    <Card title="VELARIS — Jewellery Boutique" color="#8b5cf6" description="AI-generated jewellery designs and gifting advice.">
      <button
        style={buttonStyle('#a855f7')}
        onClick={() =>
          api('/api/jewellery/designs')
            .then(() => toast('Designs loaded'))
            .catch(() => toast('Failed to load designs'))
        }
      >
        List Designs →
      </button>
      <button
        style={buttonStyle('#a855f7')}
        onClick={() =>
          api('/api/jewellery/generate-design', {
            method: 'POST',
            body: JSON.stringify({ gemstone: 'diamond', metal: 'gold', occasion: 'gift' }),
          })
            .then(() => toast('Design generated'))
            .catch(() => toast('Design generation failed'))
        }
      >
        Generate Design →
      </button>
    </Card>
  )
}

// ─── Luna ───
function LunaPage({ toast }: { toast: Notify }) {
  const [input, setInput] = useState('I need an outfit for a summer wedding')
  const [reply, setReply] = useState<string | null>(null)

  const ask = () =>
    api(`/api/luna/chat${qs({ message: input, token: 'test-token' })}`, { method: 'POST' })
      .then(data => setReply(data.reply || data.response || JSON.stringify(data)))
      .catch(() => toast('Luna chat failed'))

  return (
    <Card title="luna-stylist — AI Fashion Chatbot" color="#ec4899" description="Chat with Luna for style advice and outfit suggestions.">
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '0.7rem', borderRadius: 8, border: '1px solid #ec4899', background: '#0f172a', color: '#e0e7ff' }}
      />
      <button style={buttonStyle('#ec4899')} onClick={ask}>
        Ask Luna →
      </button>
      {reply && <p style={{ marginTop: '1rem', color: '#f9a8d4' }}>{reply}</p>}
    </Card>
  )
}

// ─── App ───
const navItems = [
  { to: '/', label: 'Home' },
  { to: '/batisse', label: 'BATISSE' },
  { to: '/wardrobe', label: 'WYA' },
  { to: '/tryon', label: 'TryOn' },
  { to: '/jewellery', label: 'VELARIS' },
  { to: '/luna', label: 'Luna' },
]

// ─── HUD ───
function useHUD() {
  const [selectedSlot, setSelectedSlot] = React.useState(0)
  const [inventory, setInventory] = React.useState<Array<number | null>>(Array(9).fill(null))
  const [isPaused, setIsPaused] = React.useState(false)

  // Hotbar selection
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const slot = parseInt(e.key, 10)
      if (slot >= 1 && slot <= 9) {
        setSelectedSlot(slot - 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])n

  const togglePause = () => setIsPaused(prev => !prev)
  return { selectedSlot, inventory, setInventory, isPaused, togglePause }
}

// ─── In-world HUD ───
function Hotbar({ selectedSlot: slot, inventory, setInventory }: { selectedSlot: number; inventory: Array<number | null>; setInventory: React.Dispatch<React.SetStateAction<Array<number | null>>> }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        padding: '4px',
        background: 'rgba(15, 23, 42, 0.8)',
        borderRadius: 12,
        zIndex: 10,
      }}
    >
      {inventory.map((item, i) => (
        <div
          key={i}
          style={{
            width: 32,
            height: 32,
            background: i === slot ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
            border: `2px solid ${i === slot ? '#3b82f6' : 'transparent'}`,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#e0e7ff',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
          onClick={() => setSelectedSlot(i)}
        >
          {item !== null ? item : '▢'}
        </div>
      ))}
    </div>
  )
}

function PerspectiveIndicator({ perspective }: { perspective: 'first' | 'third' }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid #3b82f6',
        borderRadius: 6,
        padding: '0.5rem 1rem',
        color: '#e0e7ff',
        fontSize: '0.75rem',
        zIndex: 10,
      }}
    >
      {perspective === 'first' ? 'First-Person' : 'Third-Person'}
    </div>
}

export default function App() {
  const { message, show: toast } = useToast()
  const [avatarType, setAvatarType] = useState<'human' | 'elf' | 'cat' | 'dog'>('human')
  const [avatarColors, setAvatarColors] = useState({ primary: 0x6c5ce7, secondary: 0xa29bfe })
  const [avatarProps, setAvatarProps] = useState({ type: 'human', primary: 0x6c5ce7, secondary: 0xa29bfe })

  useEffect(() => {
    fetch(`${BASE_URL}/api/health`)
      .then(res => {
        if (!res.ok) throw new Error('unavailable')
      })
      .catch(() => toast('ORVYNE backend unavailable'))
  }, [toast])

  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#0a0e17', color: '#e0e7ff' }}>
        <nav
          style={{
            background: 'linear-gradient(180deg, #0f172a, #1e293b)',
            padding: '1rem 1.5rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', letterSpacing: 0.5 }}>ORVYNE</h2>
            <p style={{ margin: 0, opacity: 0.8, fontSize: '0.85rem' }}>Personal Virtual Home & Lifestyle Universe</p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                style={({ isActive }) => ({
                  color: isActive ? '#fff' : '#94a3b8',
                  background: isActive ? 'rgba(100,140,180,0.25)' : 'transparent',
                  textDecoration: 'none',
                  fontWeight: 500,
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <main style={{ maxWidth: 1200, margin: '2rem auto', padding: '0 1rem' }}>
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <h2 style={{ textAlign: 'center', margin: '2rem 0 0.5rem' }}>ORVYNE</h2>
                  <p style={{ textAlign: 'center', color: '#94a3b8' }}>Select a project from the navigation above.</p>
                </>
              }
            />
            <Route path="/batisse" element={<BatissePage toast={toast} />} />
            <Route path="/wardrobe" element={<WyaPage toast={toast} />} />
            <Route path="/tryon" element={<TryOnPage toast={toast} />} />
            <Route path="/jewellery" element={<VelarisPage toast={toast} />} />
            <Route path="/luna" element={<LunaPage toast={toast} />} />
          </Routes>
        </main>

        {message && (
          <div
            style={{
              position: 'fixed',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#1e293b',
              border: '1px solid #334155',
              padding: '0.75rem 1.25rem',
              borderRadius: 8,
              zIndex: 100,
            }}
          >
            {message}
          </div>
        )}
      </div>
    </BrowserRouter>
  )
}
