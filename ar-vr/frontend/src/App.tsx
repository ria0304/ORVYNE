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

// ─── Scene management for Three.js ───
function useThreeScene() {
  const [scene, setScene] = useState<THREE.Scene | null>(null)
  const [camera] = useState(() => new THREE.PerspectiveCamera(75, 2, 0.1, 1000))
  const [renderer] = useState(() => {
    const r = new THREE.WebGLRenderer({ antialias: true })
    r.setSize(200, 200)
    document.body.appendChild(r.domElement)
    return r
  })
  const controls = useState(() => new OrbitControls(camera, renderer.domElement))[0]

  useEffect(() => {
    camera.position.z = 5
    const animate = () => {
      renderer.render(scene, camera)
      requestAnimationFrame(animate)
    }
    animate()
    return () => renderer.dispose()
  }, [scene, camera, renderer])

  return { scene, camera, renderer, controls }
}

// ─── Load GLB model ───
async function loadGLB(url: string): Promise<THREE.Group | null> {
  const loader = new GLTFLoader()
  try {
    const gltf = await loader.loadAsync(url)
    return gltf.scene
  } catch (e) {
    console.error('Failed to load GLB:', e)
    return null
  }
}

// ─── ORVYNE Frontend Component ───
export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const { show: toast } = useToast()
  const { loading: loadingHome, setLoading: setLoadingHome } = useLoadingState(false)

  // Health check on mount
  useEffect(() => {
    fetch(`${BASE_URL}/api/health`)
      .then(res => {
        if (!res.ok) throw new Error('Backend unavailable')
      })
      .catch(() => toast('ORVYNE backend unavailable'))
  }, [])

  // Handle API errors with toasts
  useEffect(() => {
    // Could add global error handling here
  }, [])

  return (
    <BrowserRouter>
      <div style={{ 
        minHeight: '100vh', 
        fontFamily: 'system-ui, -apple-system, sans-serif', 
        background: '#0a0e17',
        color: '#e0e7ff',
        margin: 0,
        overflowX: 'hidden'
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
            }} hoverStyle={{ background: 'rgba(100, 140, 180, 0.2)' }}:hover>
              Home
            </Link>
            <Link to="/batisse" style={{ 
              color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
              padding: '0.5rem 1rem', borderRadius: '6px', transition: 'all 0.2s'
            }} hoverStyle={{ background: 'rgba(100, 140, 180, 0.2)' }}:hover>
              BATISSE
            </Link>
            <Link to="/wardrobe" style={{ 
              color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
              padding: '0.5rem 1rem', borderRadius: '6px', transition: 'all 0.2s'
            }} hoverStyle={{ background: 'rgba(100, 140, 180, 0.2)' }}:hover>
              WYA
            </Link>
            <Link to="/tryon" style={{ 
              color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
              padding: '0.5rem 1rem', borderRadius: '6px', transition: 'all 0.2s'
            }} hoverStyle={{ background: 'rgba(100, 140, 180, 0.2)' }}:hover>
              TryOn
            </Link>
            <Link to="/jewellery" style={{ 
              color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
              padding: '0.5rem 1rem', borderRadius: '6px', transition: 'all 0.2s'
            }} hoverStyle={{ background: 'rgba(100, 140, 180, 0.2)' }}:hover>
              VELARIS
            </Link>
            <Link to="/luna" style={{ 
              color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
              padding: '0.5rem 1rem', borderRadius: '6px', transition: 'all 0.2s'
            }} hoverStyle={{ background: 'rgba(100, 140, 180, 0.2)' }}:hover>
              Luna
            </Link>
          </div>
        </nav>

        <div style={{ 
          maxWidth: '1200px', 
          margin: '2rem auto', 
          padding: '0 1rem',
          minHeight: '80vh'
        }}>
          <hr style={{ borderColor: '#334155', margin: '1rem 0' }} />
          
          <Routes>
            {/* Home */}
            <Route path="/" element={<h2 style={{ textAlign: 'center', margin: '2rem 0' }}>ORVYNE</h2><p style={{ textAlign: 'center', color: '#94a3b8' }}>Select a project from the navigation above.</p>} />}
            
            {/* BATISSE — Floor plan → 3D home */}
            <Route
              path="/batisse"
              element={({ route }) => {
                const navigate = useNavigate()
                const { show: toast } = useToast()
                const { loading: loadingBatisse, setLoading: setLoadingBatisse } = useLoadingState(false)
                
                useEffect(() => {
                  api('/api/batisse/upload', {
                    method: 'POST',
                    body: JSON.stringify({ name: 'My Floor Plan', description: 'Uploaded from ORVYNE frontend' }),
                  }).then(() => setLoadingBatisse(false)).catch(() => toast('BATISSE upload failed'))
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
                      background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                      '-webkit-background-clip': 'text', 
                      '-webkit-text-fill-color': 'transparent',
                      borderRadius: '4px'
                    }}>BATISSE — Floor Plan & 3D Home</h3>
                    <p style={{ margin: '0.5rem 0 1rem 0', opacity: '0.8' }}>
                      Upload a floor plan and view your 3D dollhouse.
                    </p>
                    <button
                      onClick={() => {
                        setLoadingBatisse(true)
                        api('/api/batisse/upload', {
                          method: 'POST',
                          body: JSON.stringify({ name: 'My Floor Plan', description: 'Uploaded from ORVYNE frontend' }),
                        }).then(() => {
                          setLoadingBatisse(false)
                          toast('Floor plan uploaded successfully')
                        }).catch(() => {
                          setLoadingBatisse(false)
                          toast('BATISSE upload failed')
                        })
                      }}
                      disabled={loadingBatisse}
                      style={{
                        width: '100%',
                        padding: '0.8rem',
                        background: loadingBatisse ? 'rgba(251, 191, 36, 0.2)' : 'rgba(30, 64, 139, 0.8)',
                        border: '1px solid #64a8d6',
                        borderRadius: '8px',
                        color: '#d1d9e1',
                        fontWeight: 500,
                        transition: 'all 0.2s',
                        marginTop: '1rem'
                      }}
                    >
                      {loadingBatisse ? 'Uploading...' : 'Upload Floor Plan →'}
                    </button>
                    <br />
                    <br />
                    <Link to="/navigation" style={{ 
                      color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
                      fontSize: '0.9rem'
                    }}>Navigate Rooms →</Link>
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
                  }).then(() => {}).catch(() => toast('Wardrobe browse failed'))
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
                        width: '100%',
                        padding: '0.8rem',
                        background: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid #22c55e',
                        borderRadius: '8px',
                        color: '#d1d9e1',
                        fontWeight: 500,
                        transition: 'all 0.2s',
                        marginTop: '1rem'
                      }}
                    >
                      Browse Wardrobe →
                    </button>
                    <br />
                    <br />
                    <Link to="/tryon" style={{ 
                      color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
                      fontSize: '0.9rem'
                    }}>TryOn →</Link>
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
                        width: '100%',
                        padding: '0.8rem',
                        background: 'rgba(245, 158, 11, 0.2)',
                        border: '1px solid #f59e0b',
                        borderRadius: '8px',
                        color: '#d1d9e1',
                        fontWeight: 500,
                        transition: 'all 0.2s',
                        marginTop: '1rem'
                      }}
                    >
                      Generate Try-On →
                    </button>
                    <br />
                    <br />
                    <Link to="/jewellery" style={{ 
                      color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
                      fontSize: '0.9rem'
                    }}>Jewellery →</Link>
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
                        width: '100%',
                        padding: '0.8rem',
                        background: 'rgba(139, 92, 246, 0.2)',
                        border: '1px solid #a855f7',
                        borderRadius: '8px',
                        color: '#d1d9e1',
                        fontWeight: 500,
                        transition: 'all 0.2s',
                        marginTop: '1rem'
                      }}
                    >
                      Generate Design →
                    </button>
                    <br />
                    <br />
                    <Link to="/luna" style={{ 
                      color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
                      fontSize: '0.9rem'
                    }}>Luna →</Link>
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
                    }}>luna-stylist — AI Fashion Chatbot</h3>
                    <p style={{ margin: '0.5rem 0 1rem 0', opacity: '0.8' }}>
                      Chat with Luna for style advice and outfit suggestions.
                    </p>
                    <div style={{ 
                      margin: '1rem 0', 
                      padding: '1rem', 
                      background: 'rgba(236, 72, 153, 0.2)',
                      borderRadius: '8px',
                      border: '1px solid #ec4899'
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
                          width: '100%',
                          padding: '0.8rem',
                          background: 'rgba(236, 72, 153, 0.2)',
                          border: '1px solid {#f472b6}',
                          borderRadius: '8px',
                          color: '#d1d9e1',
                          fontWeight: 500,
                          transition: 'all 0.2s',
                          marginTop: '0.5rem'
                        }}
                      >
                        Ask Luna →
                      </button>
                    </div>
                    <br />
                    <br />
                    <Link to="/" style={{ 
                      color: '#94a3b8', textDecoration: 'none', fontWeight: 500, 
                      fontSize: '0.9rem'
                    }}>Home →</Link>
                  </div>
                )
              }}
            />
          </Routes>
        </div>

        {/* Footer */}
        <footer style={{
          textAlign: 'center',
          padding: '1rem 0',
          marginTop: '2rem',
          background: 'rgba(0, 0, 0, 0.3)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '0.75rem',
          color: '#64748b'
        }}>
          ORVYNE • Personal Virtual Home & Lifestyle Universe
        </footer>
      </div>
    </BrowserRouter>
  )
}
