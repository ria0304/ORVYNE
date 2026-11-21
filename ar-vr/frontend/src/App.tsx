import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer'

const BASE_URL = 'http://127.0.0.1:8001'

// Helper: call any ORVYNE backend endpoint
async function api(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

// Helper: show toast notifications
function useToast() {
  const [toast, setToast] = useState({ show: false, message: '' })
  const show = (msg: string, timeout = 5000) => {
    setToast({ show: true, message: msg })
    setTimeout(() => setToast({ show: false, message: '' }), timeout)
  }
  return { toast, show }
}

function useLoadingState(initial: boolean = false) {
  const [loading, setLoading] = useState(initial)
  const setLoading = (val: boolean) => setLoading(val)
  return { loading, setLoading }
}

// ─── Scene types for clear distinction ───
enum SceneType {
  ACTUAL_BATISSE = 'actual_batisse',
  GEOMETRY_DERIVED = 'geometry_derived',
  PLACEHOLDER = 'placeholder',
}

// ─── Scene management for Three.js ───
function useThreeScene(initialUrl: string | null) {
  const [scene, setScene] = useState<THREE.Scene | null>(null)
  const [camera] = useState(() => new THREE.PerspectiveCamera(75, 2, 0.1, 1000))
  const [renderer] = useState(() => {
    const canvas = document.createElement('canvas')
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    r.setSize(400, 400)
    r.setPixelRatio(window.devicePixelRatio)
    ;(renderer as THREE.WebGLRenderer).setClearColor(0x0a0e17, 1)
    document.getElementById('three-container')!.appendChild(canvas)
    return r
  })
  const controls = useState(() => new OrbitControls(camera, renderer.domElement))[0]

  useEffect(() => {
    if (!scene) {
      scene = new THREE.Scene()
      scene.background = new THREE.Color(0x0a0e17)
    }
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(5, 5, 5)
    scene.add(dirLight)
    
    // Fit camera to bounds
    const fitCameraToBounds = () => {
      if (scene.children.length > 0) {
        const box = new THREE.Box3().setFromObject(scene)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        camera.position.set(center.x, center.y, center.z + size.z * 1.5)
        camera.lookAt(center.x, center.y, center.z)
      }
    }
    fitCameraToBounds()
    
    const animate = () => {
      ;(renderer as THREE.WebGLRenderer).render(scene, camera)
      requestAnimationFrame(animate)
    }
    animate()
    
    return () => {
      ;(renderer as THREE.WebGLRenderer).dispose()
      scene?.remove(...scene.children)
    }
  }, [scene, camera, renderer])

  return { scene, camera, renderer, controls }
}

// ─── Create actual BATISSE GLB scene from GLTF data ───
async function loadActualBatisseGLB(glbBase64: string): Promise<THREE.Group | null> {
  const loader = new GLTFLoader()
  try {
    const byteCharacters = atob(glbBase64)
    const byteNumbers = new Uint8Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const blob = new Blob([byteNumbers], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    
    const gltf = await loader.loadAsync(url)
    URL.revokeObjectURL(url)
    return gltf.scene
  } catch (e) {
    console.error('Failed to load actual BATISSE GLB:', e)
    return null
  }
}

// ─── Create geometry-derived scene from BATISSE data ───
function createGeometryDerivedScene(rooms: any[]): THREE.Group {
  const group = new THREE.Group()
  
  // Floor
  const floorGeometry = new THREE.PlaneGeometry(10, 10)
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2e37 })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.01
  group.add(floor)
  
  // Walls based on room data
  if (rooms) {
    const wallGeometry = new THREE.BoxGeometry(8, 3, 0.5)
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x3d4a5e })
    
    rooms.forEach((room: any, idx: number) => {
      const wall = new THREE.Mesh(wallGeometry, wallMaterial)
      // Place walls based on room index
      const angle = (idx / Math.max(rooms.length, 1)) * Math.PI * 2
      const distance = 3
      wall.position.set(
        Math.cos(angle) * distance,
        1.5,
        Math.sin(angle) * distance
      )
      wall.rotation.y = angle + Math.PI / 2
      group.add(wall)
      
      // Room label sphere
      const labelGeometry = new THREE.SphereGeometry(0.2, 16, 16)
      const labelMaterial = new THREE.MeshStandardMaterial({ color: 0xef476f })
      const label = new THREE.Mesh(labelGeometry, labelMaterial)
      label.position.set(
        Math.cos(angle) * 3.5,
        1.5,
        Math.sin(angle) * 3.5
      )
      group.add(label)
    })
  }
  
  // Ceiling
  const ceilingGeometry = new THREE.BoxGeometry(10, 0.5, 8)
  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x3d4a5e })
  const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial)
  ceiling.position.y = 3
  group.add(ceiling)
  
  // Placeholder furniture spheres
  const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16)
  const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0xef476f })
  const sphereCount = rooms ? rooms.length : 0
  for (let i = 0; i < Math.min(sphereCount, 8); i++) {
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
    const angle = (i / Math.max(rooms.length, 1)) * Math.PI * 2
    const distance = 4 + Math.random()
    sphere.position.set(
      Math.cos(angle) * distance,
      1 + Math.random(),
      Math.sin(angle) * distance
    )
    group.add(sphere)
  }
  
  return group
}

// ─── Create placeholder scene ───
function createPlaceholderScene(): THREE.Group {
  const group = new THREE.Group()
  
  // Floor
  const floorGeometry = new THREE.PlaneGeometry(10, 10)
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2e37 })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.01
  group.add(floor)
  
  // Walls
  const wallGeometry = new THREE.BoxGeometry(8, 3, 0.5)
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x3d4a5e })
  const wall1 = new THREE.Mesh(wallGeometry, wallMaterial)
  wall1.position.set(-4, 1.5, 0)
  group.add(wall1)
  const wall2 = new THREE.Mesh(wallGeometry, wallMaterial)
  wall2.rotation.y = Math.PI / 2
  wall2.position.set(4, 1.5, 0)
  group.add(wall2)
  
  // Ceiling
  const ceilingGeometry = new THREE.BoxGeometry(10, 0.5, 6)
  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x3d4a5e })
  const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial)
  ceiling.position.y = 3
  group.add(ceiling)
  
  // Placeholder sphere
  const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16)
  const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0x6b7280 })
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
  sphere.position.set(0, 1, -1)
  group.add(sphere)
  
  return group
}

// ─── Format number ───
function formatNumber(num: number): string {
  if (num === 0) return '0'
  const neg = num < 0 ? '-' : ''
  const absNum = Math.abs(num)
  if (absNum >= 1e6) return `${neg}${absNum / 1e6}M`
  if (absNum >= 1e3) return `${neg}${absNum / 1e3}k`
  return `${neg}${absNum}`
}

// ─── ORVYNE Frontend Component ───
export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const { show: toast } = useToast()
  
  // Health check on mount
  useEffect(() => {
    fetch(`${BASE_URL}/api/health`)
      .then(res => {
        if (!res.ok) throw new Error('Backend unavailable')
      })
      .catch(() => toast('ORVYNE backend unavailable'))
  }, [])

  // BATISSE state - track what type of scene we're showing
  const [batisseSceneType, setBatisseSceneType] = useState<SceneType>(SceneType.PLACEHOLDER)
  const [batisseLoading, setBatisseLoading] = useState(false)
  const [batisseError, setBatisseError] = useState<string | null>(null)
  const [batisseModel, setBatisseModel] = useState<THREE.Group | null>(null)
  const [batisseRooms, setBatisseRooms] = useState<any[]>([])
  const [currentRoom, setCurrentRoom] = useState<string | null>(null)

  // Load BATISSE model and room data
  useEffect(() => {
    setBatisseLoading(true)
    
    // Step 1: Get geometry data
    api('/api/batisse/projects/1/geometry', {})
      .then(data => {
        setBatisseRooms(data.rooms || [])
        
        // Determine scene type based on data availability
        if (data.ready_for_3d && data.geometry) {
          // Has geometry data - check for GLB export
          return api('/api/batisse/projects/1/geometry/export-glb', {})
            .then(glbData => {
              if (glbData && glbData.success !== false) {
                // Actual BATISSE GLB - mark scene type
                setBatisseSceneType(SceneType.ACTUAL_BATISSE)
                // Try to load the actual GLB
                loadActualBatisseGLB(glbData.glb_base64 || '').then(loadedModel => {
                  if (loadedModel) {
                    setBatisseModel(loadedModel)
                  } else {
                    // GLB loaded but failed - fall back to geometry-derived
                    setBatisseSceneType(SceneType.GEOMETRY_DERIVED)
                    setBatisseModel(createGeometryDerivedScene(batisseRooms))
                  }
                }).catch(() => {
                  setBatisseSceneType(SceneType.GEOMETRY_DERIVED)
                  setBatisseModel(createGeometryDerivedScene(batisseRooms))
                })
              } else {
                // Geometry-derived scene
                setBatisseSceneType(SceneType.GEOMETRY_DERIVED)
                setBatisseModel(createGeometryDerivedScene(batisseRooms))
              }
            })
            .catch(() => {
              // GLB export failed - use geometry-derived
              setBatisseSceneType(SceneType.GEOMETRY_DERIVED)
              setBatisseModel(createGeometryDerivedScene(batisseRooms))
            })
        })
        .catch(() => {
          setBatisseError('BATISSE backend unavailable')
          setBatisseSceneType(SceneType.PLACEHOLDER)
          setBatisseModel(createPlaceholderScene())
          setBatisseLoading(false)
        })
      })
      .catch(() => {
        setBatisseError('BATISSE backend unavailable')
        setBatisseSceneType(SceneType.PLACEHOLDER)
        setBatisseModel(createPlaceholderScene())
        setBatisseLoading(false)
      })
  }, [])

  // Room navigation effect
  useEffect(() => {
    // Update camera when room changes
    if (currentRoom) {
      // Could animate camera to room position
    }
  }, [currentRoom])

  // Helper: format number with appropriate units
  function formatNumber(num: number): string {
    if (num === 0) return '0'
    const neg = num < 0 ? '-' : ''
    const absNum = Math.abs(num)
    if (absNum >= 1e6) return `${neg}${absNum / 1e6}M`
    if (absNum >= 1e3) return `${neg}${absNum / 1e3}k`
    return `${neg}${absNum}`
  }

  // Room click handler
  const handleRoomClick = (roomId: string) => {
    setCurrentRoom(roomId)
    api(`/api/navigation/set-room/user-123/${roomId}`, {
      method: 'POST',
    }).then(() => toast(`Moved to room ${roomId}`)).catch(() => toast('Navigation failed'))
  }

  return (
    <BrowserRouter>
      <div style={{ 
        minHeight: '100vh', 
        fontFamily: 'system-ui, -apple-system, sans-serif', 
        background: '#0a0e17',
        color: '#e0e7ff'
      }}>
        <nav style={{
          background: 'linear-gradient(180deg, #0f172a, #1e293b)',
          padding: '1rem 1.5rem',
          color: '#cbd5e1',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
          position: 'fixed',
          top: 0,
          width: 'full',
          zIndex: 100
        }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center' }}>
            <h2 style={{ margin: '0', fontSize: '1.5rem', letterSpacing: '0.5px' }}>ORVYNE</h2>
            <p style={{ margin: '0.5rem 0 0 0', opacity: '0.8', fontSize: '0.85rem', letterSpacing: '0.5px' }}>
              Personal Virtual Home & Lifestyle Universe
            </p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Link to="/" style={{ 
              color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
              padding: '0.5rem 1rem', borderRadius: '6px', transition: 'all 0.2s'
            }} onMouseOver={(e) => e.target.style.background = 'rgba(100, 140, 180, 0.2)'} onMouseOut={(e) => e.target.style.background = ''}>Home</Link>
            <Link to="/batisse" style={{ 
              color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
              padding: '0.5rem 1rem', borderRadius: '6px', transition: 'all 0.2s'
            }} onMouseOver={(e) => e.target.style.background = 'rgba(100, 140, 180, 0.2)'} onMouseOut={(e) => e.target.style.background = ''}>BATISSE</Link>
            <Link to="/wardrobe" style={{ 
              color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
              padding: '0.5rem 1rem', borderRadius: '6px', transition: 'all 0.2s'
            }} onMouseOver={(e) => e.target.style.background = 'rgba(16, 185, 129, 0.2)'} onMouseOut={(e) => e.target.style.background = ''}>WYA</Link>
            <Link to="/tryon" style={{ 
              color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
              padding: '0.5rem 1rem', borderRadius: '6px', transition: 'all 0.2s'
            }} onMouseOver={(e) => e.target.style.background = 'rgba(245, 158, 11, 0.2)'} onMouseOut={(e) => e.target.style.background = ''}>TryOn</Link>
            <Link to="/jewellery" style={{ 
              color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
              padding: '0.5rem 1rem', borderRadius: '6px', transition: 'all 0.2s'
            }} onMouseOver={(e) => e.target.style.background = 'rgba(139, 92, 246, 0.2)'} onMouseOut={(e) => e.target.style.background = ''}>VELARIS</Link>
            <Link to="/luna" style={{ 
              color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
              padding: '0.5rem 1rem', borderRadius: '6px', transition: 'all 0.2s'
            }} onMouseOver={(e) => e.target.style.background = 'rgba(236, 72, 153, 0.2)'} onMouseOut={(e) => e.target.style.background = ''}>Luna</Link>
          </div>
        </nav>

        <div style={{ 
          maxWidth: '1200px', 
          margin: '2rem auto', 
          padding: '0 1rem',
          minHeight: '80vh',
          position: 'relative'
        }}>
          <hr style={{ borderColor: '#334155', margin: '1rem 0' }} />
          
          <Routes>
            {/* Home */}
            <Route path="/" element={<h2 style={{ textAlign: 'center', margin: '2rem 0' }}>ORVYNE</h2><p style={{ textAlign: 'center', color: '#94a3b8' }}>Select a project from the navigation above.</p>} />
            
            {/* BATISSE — Floor plan → 3D home */}
            <Route
              path="/batisse"
              element={({ route }) => {
                const navigate = useNavigate()
                const { show: toast } = useToast()
                const { loading: loadingBatisse, setLoading: setLoadingBatisse } = useLoadingState(false)
                
                useEffect(() => {
                  // Health check
                  fetch(`${BASE_URL}/api/health`)
                    .then(res => {
                      if (!res.ok) throw new Error('Backend unavailable')
                    })
                    .catch(() => toast('ORVYNE backend unavailable'))
                  
                  // Load BATISSE model and room data
                  setBatisseLoading(true)
                  api('/api/batisse/projects/1/geometry', {})
                    .then(data => {
                      setBatisseRooms(data.rooms || [])
                      
                      // Determine scene type
                      if (data.ready_for_3d && data.geometry) {
                        // Has geometry data - check for GLB export
                        return api('/api/batisse/projects/1/geometry/export-glb', {})
                          .then(glbData => {
                            if (glbData && glbData.success !== false) {
                              // Actual BATISSE GLB - mark scene type and load GLB
                              setBatisseSceneType(SceneType.ACTUAL_BATISSE)
                              // Try to load the actual GLB
                              loadActualBatisseGLB(glbData.glb_base64 || '').then(loadedModel => {
                                if (loadedModel) {
                                  setBatisseModel(loadedModel)
                                } else {
                                  // GLB loaded but failed - fall back to geometry-derived
                                  setBatisseSceneType(SceneType.GEOMETRY_DERIVED)
                                  setBatisseModel(createGeometryDerivedScene(batisseRooms))
                                }
                              }).catch(() => {
                                setBatisseSceneType(SceneType.GEOMETRY_DERIVED)
                                setBatisseModel(createGeometryDerivedScene(batisseRooms))
                              })
                          })
                          .catch(() => {
                            // GLB export failed - use geometry-derived
                            setBatisseSceneType(SceneType.GEOMETRY_DERIVED)
                            setBatisseModel(createGeometryDerivedScene(batisseRooms))
                          })
                      })
                      .catch(() => {
                        setBatisseError('BATISSE backend unavailable')
                        setBatisseSceneType(SceneType.PLACEHOLDER)
                        setBatisseModel(createPlaceholderScene())
                        setBatisseLoading(false)
                      })
                  })
                  .catch(() => {
                    setBatisseError('BATISSE backend unavailable')
                    setBatisseSceneType(SceneType.PLACEHOLDER)
                    setBatisseModel(createPlaceholderScene())
                    setBatisseLoading(false)
                  })
                }, [])

                return (
                  <div style={{ 
                    padding: '2rem', 
                    background: 'rgba(10, 14, 23, 0.8)',
                    borderRadius: '12px',
                    marginBottom: '1rem',
                    overflow: 'hidden'
                  }}>
                    <header style={{ 
                      margin: '-2rem -2rem 1rem -2rem',
                      padding: '1rem 1.5rem',
                      background: 'linear-gradient(180deg, #1e293b, #0f172a)',
                      borderRadius: '12px 12px 0 0',
                      textAlign: 'center'
                    }}>
                      <h3 style={{ 
                        margin: '0 0 1rem 0', 
                        fontSize: '1.2rem', 
                        background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                        '-webkit-background-clip': 'text', 
                        '-webkit-text-fill-color': 'transparent',
                        borderRadius: '4px'
                      }}>BATISSE — Floor Plan & 3D Home</h3>
                      <p style={{ margin: '0.5rem 0 1rem 0', opacity: '0.8' }}>
                        Upload a floor plan and view your 3D dollhouse.
                      </p>
                      <small style={{ color: '#94a3b8' }}>
                        {formatNumber(batisseRooms.length)} rooms•{formatNumber(data?.area_sq_m || 0)} sqm{data?.units ? ` (${data.units})` : ''}
                      </small>
                    </header>
                    
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center', 
                      minHeight: '300px',
                      background: 'rgba(10, 14, 23, 0.8)',
                      borderRadius: '8px',
                      marginBottom: '1rem',
                      position: 'relative'
                    }}>
                      {/* Room grid overlay with clickable areas */}
                      {batisseRooms.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          pointerEvents: 'auto'
                        }}>
                          {batisseRooms.map((room, idx) => {
                            const centerAngle = (idx / Math.max(batisseRooms.length, 1)) * Math.PI * 2
                            const radius = 100
                            const x = radius * Math.cos(centerAngle)
                            const y = radius * Math.sin(centerAngle)
                            
                            return (
                              <div
                                key={room.room_id}
                                style={{
                                  position: 'absolute',
                                  width: 100,
                                  height: 100,
                                  left: `${x - 50}px`,
                                  top: `${y - 50}px`,
                                  background: 'rgba(59, 130, 246, 0.3)',
                                  border: '2px solid #3b82f6',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                                onClick={() => handleRoomClick(room.room_id)}
                                title={`Room ${room.room_id}: ${room.room_name || 'Unnamed'}`}>
                                <span style={{
                                  position: 'absolute',
                                  top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                  fontSize: '10px', color: '#fff', textAlign: 'center'
                                }}>{room.room_id?.substring(0, 6)}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      
                      {batisseModel ? (
                        <div id="three-container" style={{ width: 400, height: 400 }} />
                      ) : (
                        <p style={{ textAlign: 'center', color: '#64748b', marginTop: '5rem' }}>
                          {batisseSceneType === SceneType.ACTUAL_BATISSE
                            ? 'Loading actual BATISSE 3D home...'
                            : batisseSceneType === SceneType.GEOMETRY_DERIVED
                              ? 'Deriving home from floor plan geometry...'
                              : 'Waiting for floor plan...'}
                        </p>
                      )}
                      
                      {batisseError ? (
                        <p style={{ color: '#f87171', marginBottom: '1rem', textAlign: 'center' }}>{batisseError}</p>
                      ) : null}
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {batisseError ? (
                          <p style={{ color: '#f87171', marginBottom: '1rem' }}>{batisseError}</p>
                        ) : null}
                        
                        <div>
                          <button
                            onClick={() => {
                              setBatisseLoading(true)
                              api('/api/batisse/upload', {
                                method: 'POST',
                                body: JSON.stringify({ name: 'My Floor Plan', description: 'Uploaded from ORVYNE frontend' }),
                              }).then(() => {
                                setBatisseLoading(false)
                                toast('Floor plan uploaded successfully')
                              }).catch(() => {
                                setBatisseLoading(false)
                                toast('BATISSE upload failed')
                              })
                          }}
                          disabled={batisseLoading}
                          style={{
                            width: '100%',
                            padding: '0.8rem',
                            background: batisseLoading ? 'rgba(251, 191, 36, 0.2)' : 'rgba(30, 64, 139, 0.8)',
                            border: '1px solid #64a8d6',
                            borderRadius: '8px',
                            color: '#d1d9e1',
                            fontWeight: 500,
                            transition: 'all 0.2s',
                            marginBottom: '0.5rem'
                          }}>
                            {batisseLoading ? 'Uploading...' : 'Upload Floor Plan →'}
                          </button>
                          <small style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                            (requires BATISSE backend)
                          </small>
                        </div>
                        <br />
                        <small style={{ color: '#94a3b8' }}>
                          {formatNumber(data?.room_count || 0)} rooms•{formatNumber(data?.area_sq_m || 0)} sqm{data?.units ? ` (${data.units})` : ''}
                        </small>
                      </div>
                    </div>
                  </div>
                )
              }}
            />

            {/* WYA — AI Wardrobe */}
            <Route
              path="/wardrobe"
              element={({ route }) => {
                const navigate = useNavigate()
                const { show: toast } = useToast()
                
                useEffect(() => {
                  api('/api/wardrobe/browse', {
                    method: 'POST',
                    body: JSON.stringify({ category: 'tops', limit: 10 }),
                  }).then(() => toast('Wardrobe loaded')).catch(() => toast('Wardrobe failed'))
                }, [])
                
                return (
                  <div style={{ 
                    padding: '2rem', 
                    background: 'rgba(10, 14, 23, 0.8)',
                    borderRadius: '12px',
                    marginBottom: '1rem'
                  }}>
                    <h3 style={{ 
                      margin: '0 0 1rem 0', 
                      fontSize: '1.2rem', 
                      background: 'linear-gradient(90deg, #10b981, #059669)',
                      '-webkit-background-clip': 'text', 
                      '-webkit-text-fill-color': 'transparent',
                      borderRadius: '4px'
                    }}>WYA — Wardrobe Intelligence</h3>
                    <p style={{ margin: '0.5rem 0 1rem 0', opacity: '0.8' }}>
                      Browse wardrobe items and get AI outfit recommendations.
                    </p>
                    <button
                      onClick={() => {
                        api('/api/wardrobe/browse', {
                          method: 'POST',
                          body: JSON.stringify({ category: 'tops', limit: 10 }),
                        }).then(() => toast('Wardrobe browse completed')).catch(() => toast('Wardrobe browse failed'))
                      }}
                      style={{
                        width: '100%', padding: '0.8rem', background: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid #22c55e', borderRadius: '8px', color: '#d1d9e1',
                        fontWeight: 500, transition: 'all 0.2s', marginTop: '1rem'
                      }}>
                        Browse Wardrobe →
                      </button>
                    <br />
                    <br />
                    <Link to="/tryon" style={{ color: '#94a3b8', fontSize: '0.9rem' }}>TryOn →</Link>
                  </div>
                )
              }}
            />

            {/* TryOn — Virtual Fitting Room */}
            <Route
              path="/tryon"
              element={({ route }) => {
                const navigate = useNavigate()
                const { show: toast } = useToast()
                
                useEffect(() => {
                  api('/api/tryon/generate', {
                    method: 'POST',
                    body: JSON.stringify({ garment_type: 'dress', image_url: '/test.jpg' }),
                  }).then(() => toast('Try-on generated')).catch(() => toast('Try-on failed'))
                }, [])
                
                return (
                  <div style={{ 
                    padding: '2rem', 
                    background: 'rgba(10, 14, 23, 0.8)',
                    borderRadius: '12px',
                    marginBottom: '1rem'
                  }}>
                    <h3 style={{ 
                      margin: '0 0 1rem 0', 
                      fontSize: '1.2rem', 
                      background: 'linear-gradient(90deg, #f59e0b, #d97706)',
                      '-webkit-background-clip': 'text', 
                      '-webkit-text-fill-color': 'transparent',
                      borderRadius: '4px'
                    }}>TryOn — Virtual Fitting Room</h3>
                    <p style={{ margin: '0.5rem 0 1rem 0', opacity: '0.8' }}>
                      Generate AI try-on previews for garments.
                    </p>
                    <button
                      onClick={() => {
                        api('/api/tryon/generate', {
                          method: 'POST',
                          body: JSON.stringify({ garment_type: 'dress', image_url: '/test.jpg' }),
                        }).then(() => toast('Try-on generated')).catch(() => toast('Try-on failed'))
                      }}
                      style={{
                        width: '100%', padding: '0.8rem', background: 'rgba(245, 158, 11, 0.2)',
                        border: '1px solid #f59e0b', borderRadius: '8px', color: '#d1d9e1',
                        fontWeight: 500, transition: 'all 0.2s', marginTop: '1rem'
                      }}>
                        Generate Try-On →
                      </button>
                    <br />
                    <br />
                    <Link to="/jewellery" style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Jewellery →</Link>
                  </div>
                )
              }}
            />

            {/* VELARIS — Jewellery Boutique */}
            <Route
              path="/jewellery"
              element={({ route }) => {
                const navigate = useNavigate()
                const { show: toast } = useToast()
                
                useEffect(() => {
                  api('/api/jewellery/designs', {}).then(() => toast('Designs loaded')).catch(() => toast('Failed to load designs'))
                }, [])
                
                return (
                  <div style={{ 
                    padding: '2rem', 
                    background: 'rgba(10, 14, 23, 0.8)',
                    borderRadius: '12px',
                    marginBottom: '1rem'
                  }}>
                    <h3 style={{ 
                      margin: '0 0 1rem 0', 
                      fontSize: '1.2rem', 
                      background: 'linear-gradient(90deg, #8b5cf6, #7c3aed)',
                      '-webkit-background-clip': 'text', 
                      '-webkit-text-fill-color': 'transparent',
                      borderRadius: '4px'
                    }}>VELARIS — Jewellery Boutique</h3>
                    <p style={{ margin: '0.5rem 0 1rem 0', opacity: '0.8' }}>
                      AI-generated jewellery designs and gifting advice.
                    </p>
                    <button
                      onClick={() => {
                        api('/api/jewellery/generate-design', {
                          method: 'POST',
                          body: JSON.stringify({ gemstone: 'diamond', metal: 'gold', occasion: 'gift' }),
                        }).then(() => toast('Design generated')).catch(() => toast('Design generation failed'))
                      }}
                      style={{
                        width: '100%', padding: '0.8rem', background: 'rgba(139, 92, 246, 0.2)',
                        border: '1px solid #a855f7', borderRadius: '8px', color: '#d1d9e1',
                        fontWeight: 500, transition: 'all 0.2s', marginTop: '1rem'
                      }}>
                        Generate Design →
                      </button>
                    <br />
                    <br />
                    <Link to="/luna" style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Luna →</Link>
                  </div>
                )
              }}
            />

            {/* luna-stylist — AI Fashion Chatbot */}
            <Route
              path="/luna"
              element={({ route }) => {
                const navigate = useNavigate()
                const { show: toast } = useToast()
                
                useEffect(() => {
                  api('/api/luna/chat', {
                    method: 'POST',
                    body: JSON.stringify({ message: 'I want a summer outfit', token: 'test-token' }),
                  }).then(() => toast('Luna chat loaded')).catch(() => toast('Luna chat failed'))
                }, [])
                
                return (
                  <div style={{ 
                    padding: '2rem', 
                    background: 'rgba(10, 14, 23, 0.8)',
                    borderRadius: '12px',
                    marginBottom: '1rem'
                  }}>
                    <h3 style={{ 
                      margin: '0 0 1rem 0', 
                      fontSize: '1.2rem', 
                      background: 'linear-gradient(180deg, #ec4899, #db2777)',
                      '-webkit-background-clip': 'text', 
                      '-webkit-text-fill-color': 'transparent',
                      borderRadius: '4px'
                    }>luna-stylist — AI Fashion Chatbot</h3>
                    <p style={{ margin: '0.5rem 0 1rem 0', opacity: '0.8' }}>
                      Chat with Luna for style advice and outfit suggestions.
                    </p>
                    <div style={{ 
                      margin: '1rem 0', padding: '1rem', background: 'rgba(236, 72, 153, 0.2)',
                      borderRadius: '8px', border: '1px solid #ec4899'
                    }}>
                      <strong style={{ color: '#f472b6', fontSize: '0.9rem' }}>Talk to Luna:</strong>
                      <br />
                      <button
                        onClick={() => {
                          api('/api/luna/chat', {
                            method: 'POST',
                            body: JSON.stringify({ message: 'I need an outfit for a summer wedding', token: 'test-token' }),
                          }).then((data: any) => {
                            const msg = data.reply || 'No reply'
                            toast(`Luna says: ${msg.slice(0, 100)}`)
                          }).catch(() => toast('Luna chat failed'))
                        }}
                        style={{
                          width: '100%', padding: '0.8rem', background: 'rgba(236, 72, 153, 0.2)',
                          border: '1px solid #ec4899', borderRadius: '8px', color: '#d1d9e1',
                          fontWeight: 500, transition: 'all 0.2s', marginTop: '0.5rem'
                        }}>
                          Ask Luna →
                        </button>
                    </div>
                    <br />
                    <br />
                    <Link to="/" style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Home →</Link>
                  </div>
                )
              }}
            />
          </Routes>
        </div>

        <footer style={{
          textAlign: 'center', padding: '1rem 0', marginTop: '2rem',
          background: 'rgba(0, 0, 0, 0.3)', borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '0.75rem', color: '#64748b'
        }}>
          ORVYNE • Personal Virtual Home & Lifestyle Universe
        </footer>
      </div>
    </BrowserRouter>
  )
}
