import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, clearToken, getToken, setToken, SIGNED_OUT_EVENT } from './api'

export type ServiceLink = 'linked' | 'not_linked' | 'unavailable' | 'failed' | 'rate_limited'

export interface OrvyneUser {
  id: string
  email: string
  full_name: string
}

interface AuthState {
  user: OrvyneUser | null
  services: Record<string, ServiceLink>
  /** true while the stored token is being checked on first load */
  checking: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<OrvyneUser | null>(null)
  const [services, setServices] = useState<Record<string, ServiceLink>>({})
  const [checking, setChecking] = useState<boolean>(() => !!getToken())

  const apply = useCallback((res: { access_token?: string; user: OrvyneUser; services: Record<string, ServiceLink> }) => {
    if (res.access_token) setToken(res.access_token)
    setUser(res.user)
    setServices(res.services ?? {})
  }, [])

  // One sign-in: restore the session from the stored ORVYNE token.
  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    api('/api/auth/me')
      .then(res => !cancelled && apply(res))
      .catch(() => !cancelled && clearToken())
      .finally(() => !cancelled && setChecking(false))
    return () => {
      cancelled = true
    }
  }, [apply])

  // Any 401 elsewhere in the app (expired token) signs the user out.
  useEffect(() => {
    const onSignedOut = () => {
      setUser(null)
      setServices({})
    }
    globalThis.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    return () => globalThis.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    apply(await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }))
  }, [apply])

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    apply(await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, full_name: fullName }) }))
  }, [apply])

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      /* the local session is dropped either way */
    }
    clearToken()
    setUser(null)
    setServices({})
  }, [])

  const value = useMemo(() => ({ user, services, checking, login, register, logout }), [user, services, checking, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
