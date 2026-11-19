import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import * as THREE from 'three'

const BASE_URL = 'http://127.0.0.1:8001'

// Helper: call any ORVYNE backend endpoint
async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export default function App() {
  useEffect(() => {
    console.log('ORVYNE Frontend loaded — connected to backend at', BASE_URL)
  }, [])

  return (
    <BrowserRouter>
      <div style={{ margin: '0', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        <nav style={{ padding: '1rem 1.5rem', background: 'linear-gradient(135deg, #1a1a2e, #16213e)', color: '#fff' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <h2 style={{ margin: '0', fontSize: '1.5rem' }}>ORVYNE</h2>
            <p style={{ margin: '0.5rem 0 0 0', opacity: '0.8', fontSize: '0.9rem' }}>
              Personal Virtual Home & Lifestyle Universe
            </p>
          </div>
        </nav>

        <div style={{ maxWidth: '1200px', margin: '2rem auto', padding: '0 1rem' }}>
          <hr style={{ borderColor: '#333', margin: '1rem 0' }} />

          <Routes>
            {/* BATISSE — Floor plan → 3D home */}
            <Route
              path="/batisse"
              element={({ route }) => {
                const navigate = useNavigate()
                useEffect(() => {
                  api('/api/batisse/upload', {
                    method: 'POST',
                    body: JSON.stringify({ name: 'My Floor Plan', description: 'Uploaded from ORVYNE frontend' }),
                  }).then(data => {
                    console.log('BATISSE upload response:', data)
                  })
                }, [])
                return (
                  <div>
                    <h3>BATISSE — Floor Plan & 3D Home</h3>
                    <p>Upload a floor plan and view your 3D dollhouse.</p>
                    <button
                      onClick={() =>
        api('/api/batisse/upload', {
          method: 'POST',
          body: JSON.stringify({ name: 'My Floor Plan', description: 'Uploaded from ORVYNE frontend' }),
        }).then(data => alert('Upload: ' + JSON.stringify(data)))
      }
                    >
                      Upload Floor Plan →
                    </button>
                    <br />
                    <br />
                    <Link to="/navigation">Navigate Rooms →</Link>
                  </div>
                )
              }}
            />

            {/* WYA — AI Wardrobe */}
            <Route
              path="/wardrobe"
              element={({ route }) => {
                const navigate = useNavigate()
                useEffect(() => {
                  api('/api/wardrobe/browse', {
                    method: 'POST',
                    body: JSON.stringify({ category: 'tops', limit: 10 }),
                  }).then(data => console.log('WARDROBE browse:', data))
                }, [])
                return (
                  <div>
                    <h3>WYA — Wardrobe Intelligence</h3>
                    <p>Browse wardrobe items and get AI outfit recommendations.</p>
                    <button
                      onClick={() =>
        api('/api/wardrobe/browse', {
          method: 'POST',
          body: JSON.stringify({ category: 'tops', limit: 10 }),
        }).then(data => alert('Wardrobe browse: ' + JSON.stringify(data).slice(0, 200)))
      }
                    >
                      Browse Wardrobe →
                    </button>
                    <br />
                    <br />
                    <Link to="/tryon">Virtual Try-On →</Link>
                  </div>
                )
              }}
            />

            {/* TryOn — Virtual Fitting Room */}
            <Route
              path="/tryon"
              element={({ route }) => {
                const navigate = useNavigate()
                useEffect(() => {
                  api('/api/tryon/generate', {
                    method: 'POST',
                    body: JSON.stringify({ garment_type: 'dress', image_url: '/test.jpg' }),
                  }).then(data => console.log('TRYON generate:', data))
                }, [])
                return (
                  <div>
                    <h3>TryOn — Virtual Fitting Room</h3>
                    <p>Generate AI try-on previews for garments.</p>
                    <button
                      onClick={() =>
        api('/api/tryon/generate', {
          method: 'POST',
          body: JSON.stringify({ garment_type: 'dress', image_url: '/test.jpg' }),
        }).then(data => alert('Try-on generated: ' + JSON.stringify(data).slice(0, 200)))
      }
                    >
                      Generate Try-On →
                    </button>
                    <br />
                    <br />
                    <Link to="/jewellery">Jewellery Boutique →</Link>
                  </div>
                )
              }}
            />

            {/* VELARIS — Jewellery Boutique */}
            <Route
              path="/jewellery"
              element={({ route }) => {
                const navigate = useNavigate()
                useEffect(() => {
                  api('/api/jewellery/designs', {}).then(data => console.log('VELARIS designs:', data))
                }, [])
                return (
                  <div>
                    <h3>VELARIS — Jewellery Boutique</h3>
                    <p>AI-generated jewellery designs and gifting advice.</p>
                    <button
                      onClick={() =>
        api('/api/jewellery/generate-design', {
          method: 'POST',
          body: JSON.stringify({ gemstone: 'diamond', metal: 'gold', occasion: 'gift' }),
        }).then(data => alert('Design generated: ' + JSON.stringify(data).slice(0, 200)))
      }
                    >
                      Generate Design →
                    </button>
                    <br />
                    <br />
                    <Link to="/luna">Luna Stylist →</Link>
                  </div>
                )
              }}
            />

            {/* luna-stylist — AI Fashion Chatbot */}
            <Route
              path="/luna"
              element={({ route }) => {
                const navigate = useNavigate()
                useEffect(() => {
                  api('/api/luna/chat', {
                    method: 'POST',
                    body: JSON.stringify({ message: 'I want a summer outfit', token: 'test-token' }),
                  }).then(data => console.log('LUNA chat:', data))
                }, [])
                return (
                  <div>
                    <h3>luna-stylist — AI Fashion Chatbot</h3>
                    <p>Chat with Luna for style advice and outfit suggestions.</p>
                    <div style={{ margin: '1rem 0', padding: '1rem', background: '#f1f1f1', borderRadius: '4px' }}>
                      <strong>Talk to Luna:</strong>
                      <br />
                      <button
                        onClick={() =>
        api('/api/luna/chat', {
          method: 'POST',
          body: JSON.stringify({ message: 'I need an outfit for a summer wedding', token: 'test-token' }),
        }).then(data => {
          const msg = data.reply || 'No reply'
          alert('Luna says: ' + msg.slice(0, 150))
        })}
      }
                        >
                          Ask Luna →
                        </button>
                    </div>
                    <br />
                    <br />
                    <Link to="/">Home →</Link>
                  </div>
                )
              }}
            />

            {/* Home */}
            <Route path="/" element={<h2>ORVYNE — Welcome</h2><p>Select a project from the navigation above.</p>} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
