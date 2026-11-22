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
        case 'KeyW': setState(s => ({ ...s, forward: false }))
        case 'KeyS': setState(s => ({ ...s, backward: false }))
        case 'KeyA': setState(s => ({ ...s, left: false }))
        case 'KeyD': setState(s => ({ ...s, right: false }))
        case 'Space': setState(s => ({ ...s, jump: false }))
        case 'ShiftLeft': setState(s => ({ ...s, sprint: false }))
        case 'ControlLeft': setState(s => ({ ...s, crouch: false }))
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
function ThreeViewer({ model }: { model: THREE.Object3D | null }) {
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
    scene.add(model)

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
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [model])

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


  const [playerPos, setPlayerPos] = React.useState(new THREE.Vector3(0, 1.6, 0))
  const [playerPerspective, setPlayerPerspective] = React.useState<'first' | 'third'>('first')
  const [playerVelocity, setPlayerVelocity] = React.useState(0)
  const [isGrounded, setIsGrounded] = React.useState(true)
  const [isSprinting, setIsSprinting] = React.useState(false)
  const [isCrouching, setIsCrouching] = React.useState(false)

  // F5 toggle for perspective
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F5') {
        setPlayerPerspective(prev => prev === 'first' ? 'third' : 'first')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])n

  // Movement physics
  React.useEffect(() => {
    const speed = isSprinting ? 7 : isCrouching ? 2 : 4
    
    // Simple movement - in a full implementation, this would use camera direction
    if (playerPerspective === 'first') {
      // First-person: move relative to camera
      // ... movement logic
    } else {
      // Third-person: basic forward movement
      // ... movement logic
    }
    
    // Apply gravity
    playerVelocity.current += -0.98 * 0.016
    playerPos.y += playerVelocity.current * 0.016
    
    // Ground check
    if (playerPos.y < 0) {
      playerPos.y = 0
      playerVelocity.current = 0
      setIsGrounded(true)
    }
  }, [isSprinting, isCrouching])

  // Handle F5 press for perspective toggle
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F5') {
        setPlayerPerspective(prev => prev === 'first' ? 'third' : 'first')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])n  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api('/api/batisse/projects/1/geometry')
        if (cancelled) return
        const roomList: any[] = data.rooms || []
        setRooms(roomList)

        if (data.ready_for_3d && data.geometry) {
          try {
            const glb = await api('/api/batisse/projects/1/geometry/export-glb', { method: 'POST' })
            const loaded = glb && glb.success !== false ? await loadActualBatisseGLB(glb.glb_base64 || '') : null
            if (cancelled) return
            if (loaded) {
              setSceneType(SceneType.ACTUAL_BATISSE)
              setModel(loaded)
              return
            }
          } catch {
            /* fall through to geometry-derived */
          }
          setSceneType(SceneType.GEOMETRY_DERIVED)
          setModel(createGeometryDerivedScene(roomList))
        } else {
          setSceneType(SceneType.GEOMETRY_DERIVED)
          setModel(createGeometryDerivedScene(roomList))
        }
      } catch {
        if (cancelled) return
        setError('BATISSE backend unavailable — showing placeholder scene')
        setSceneType(SceneType.PLACEHOLDER)
        setModel(createPlaceholderScene())
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleRoomClick = (roomId: string) => {
    setCurrentRoom(roomId)
    api(`/api/navigation/set-room/${USER_ID}/${roomId}`, { method: 'POST' })
      .then(() => toast(`Moved to room ${roomId}`))
      .catch(() => toast('Navigation failed'))
  }

  const upload = () => {
    setLoading(true)
    api('/api/batisse/upload', {
      method: 'POST',
      body: JSON.stringify({ name: 'My Floor Plan', description: 'Uploaded from ORVYNE frontend' }),
    })
      .then(() => toast('Floor plan uploaded'))
      .catch(() => toast('BATISSE upload failed'))
      .finally(() => setLoading(false))
  }

  return (
    <Card title="BATISSE — Floor Plan & 3D Home" color="#3b82f6" description="Upload a floor plan and explore your 3D dollhouse.">
      <small style={{ color: '#94a3b8' }}>
        Scene: {sceneType.replace('_', ' ')} · {rooms.length} rooms
      </small>
      <div style={{ margin: '1rem 0' }}>
        {loading && !model ? <p style={{ color: '#64748b' }}>Loading…</p> : <ThreeViewer model={model} />}
      </div>
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      {rooms.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
          {rooms.map((room, i) => {
            const id = String(room.room_id ?? i)
            return (
              <button
                key={id}
                onClick={() => handleRoomClick(id)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: 6,
                  border: '1px solid #3b82f6',
                  background: currentRoom === id ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.15)',
                  color: '#e0e7ff',
                  cursor: 'pointer',
                }}
              >
                {room.room_name || room.room_function || `Room ${id}`}
              </button>
            )
          })}
        </div>
      )}
      <button onClick={upload} disabled={loading} style={buttonStyle('#64a8d6')}>
        {loading ? 'Working…' : 'Upload Floor Plan →'}
      </button>
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

export default function App() {
  const { message, show: toast } = useToast()

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
