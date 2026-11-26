import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { BASE_URL } from './lib/api'
import { AuthProvider, useAuth } from './lib/auth'
import { LoginPage } from './pages/LoginPage'
import { useToast } from './hooks/useToast'
import type { AvatarColors, AvatarProps, AvatarType } from './components/AvatarCustomisation'
import { LunaPage, TryOnPage, VelarisPage, WyaPage } from './pages/SimplePages'

// three.js is heavy; load it only when the BATISSE route is opened.
const BatissePage = lazy(() => import('./pages/BatissePage').then(m => ({ default: m.BatissePage })))

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/batisse', label: 'BATISSE' },
  { to: '/wardrobe', label: 'WYA' },
  { to: '/tryon', label: 'TryOn' },
  { to: '/jewellery', label: 'VELARIS' },
  { to: '/luna', label: 'Luna' },
]

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

/** Shows the single ORVYNE login until the user is signed in. */
function Gate() {
  const { user, checking } = useAuth()
  if (checking) return <p style={{ color: '#94a3b8', padding: '2rem', background: '#0a0e17', minHeight: '100vh', margin: 0 }}>Restoring your session…</p>
  return user ? <Shell /> : <LoginPage />
}

function Shell() {
  const { user, services, logout } = useAuth()
  const { message, show: toast } = useToast()
  const [avatarType, setAvatarType] = useState<AvatarType>('human')
  const [avatarColors, setAvatarColors] = useState<AvatarColors>({ primary: 0x6c5ce7, secondary: 0xa29bfe })
  const [avatarProps, setAvatarProps] = useState<AvatarProps>({ type: 'human', primary: 0x6c5ce7, secondary: 0xa29bfe })

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`${BASE_URL}/api/health`, { signal: ctrl.signal })
      .then(res => {
        if (!res.ok) throw new Error('unavailable')
      })
      .catch(e => {
        if (e?.name !== 'AbortError') toast('ORVYNE backend unavailable')
      })
    return () => ctrl.abort()
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
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
            <span title="Linked downstream accounts" style={{ color: '#64748b', fontSize: '0.8rem' }}>
              WYA {services.wya === 'linked' ? '✓' : '✗'} · TryOn {services.tryon === 'linked' ? '✓' : '✗'}
            </span>
            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{user?.email}</span>
            <button onClick={() => void logout()} style={{ background: 'none', border: '1px solid #475569', color: '#cbd5e1', borderRadius: 6, padding: '0.35rem 0.8rem', cursor: 'pointer' }}>
              Sign out
            </button>
          </div>
        </nav>

        <main style={{ maxWidth: 1200, margin: '2rem auto', padding: '0 1rem' }}>
          <Suspense fallback={<p style={{ color: '#64748b' }}>Loading…</p>}>
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
            <Route path="/batisse" element={<BatissePage toast={toast} avatarProps={avatarProps} />} />
            <Route path="/wardrobe" element={<WyaPage toast={toast} />} />
            <Route
              path="/tryon"
              element={
                <TryOnPage
                  toast={toast}
                  avatarType={avatarType}
                  setAvatarType={setAvatarType}
                  avatarColors={avatarColors}
                  setAvatarColors={setAvatarColors}
                  avatarProps={avatarProps}
                  setAvatarProps={setAvatarProps}
                />
              }
            />
            <Route path="/jewellery" element={<VelarisPage toast={toast} />} />
            <Route path="/luna" element={<LunaPage toast={toast} />} />
          </Routes>
          </Suspense>
        </main>

        {message && (
          <div
            role="status"
            style={{
              position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.25rem',
              borderRadius: 8, zIndex: 100, maxWidth: '90vw',
            }}
          >
            {message}
          </div>
        )}
      </div>
    </BrowserRouter>
  )
}
