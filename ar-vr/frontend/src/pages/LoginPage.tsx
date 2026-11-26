import { useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'

const field: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: 8,
  border: '1px solid #334155', background: '#0f172a', color: '#e0e7ff', fontSize: '1rem',
}

/** The one ORVYNE login. WYA and TryOn accounts are linked behind the scenes. */
export function LoginPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') await login(email, password)
      else await register(email, password, fullName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0e17', color: '#e0e7ff', fontFamily: 'system-ui, sans-serif', padding: '1rem' }}>
      <form onSubmit={submit} aria-label={mode === 'login' ? 'Sign in' : 'Create account'}
        style={{ width: 'min(420px, 100%)', background: 'rgba(15,23,42,0.85)', borderRadius: 14, padding: '2rem', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
        <h1 style={{ margin: 0, letterSpacing: 1 }}>ORVYNE</h1>
        <p style={{ color: '#94a3b8', marginTop: 4 }}>One sign-in for your home, wardrobe, try-on, jewellery and Luna.</p>

        {mode === 'register' && (
          <>
            <label htmlFor="full-name" style={{ display: 'block', margin: '1rem 0 0.3rem' }}>Name</label>
            <input id="full-name" style={field} value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" required />
          </>
        )}
        <label htmlFor="email" style={{ display: 'block', margin: '1rem 0 0.3rem' }}>Email</label>
        <input id="email" type="email" style={field} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        <label htmlFor="password" style={{ display: 'block', margin: '1rem 0 0.3rem' }}>Password</label>
        <input id="password" type="password" style={field} value={password} onChange={e => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : 1} required />
        {mode === 'register' && <small style={{ color: '#64748b' }}>At least 8 characters.</small>}

        {error && <p role="alert" style={{ color: '#fca5a5', margin: '1rem 0 0' }}>{error}</p>}

        <button type="submit" disabled={busy}
          style={{ width: '100%', marginTop: '1.25rem', padding: '0.85rem', borderRadius: 8, border: '1px solid #3b82f6', background: 'rgba(59,130,246,0.3)', color: '#fff', fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
          style={{ width: '100%', marginTop: '0.75rem', background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer' }}>
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
