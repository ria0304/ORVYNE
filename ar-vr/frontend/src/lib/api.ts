export const BASE_URL: string = import.meta.env?.VITE_API_URL || 'http://127.0.0.1:8001'
export const USER_ID = 'user-123'
export const PROJECT_ID = 1

const TOKEN_KEY = 'orvyne_token'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function getToken(): string | null {
  try {
    return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null
  } catch {
    return null
  }
}

async function errorMessage(res: Response): Promise<string> {
  const fallback = `${res.status} ${res.statusText}`.trim()
  try {
    const body = JSON.parse(await res.text())
    const detail = body?.detail ?? body?.message
    if (typeof detail === 'string') return `${fallback}: ${detail}`
    if (Array.isArray(detail) && detail.length) {
      return `${fallback}: ${detail.map((d: any) => d?.msg ?? String(d)).join('; ')}`
    }
  } catch {
    /* body was not JSON */
  }
  return fallback
}

/**
 * Thin fetch wrapper for the ORVYNE gateway.
 * - sends auth + user headers
 * - lets the browser set Content-Type for FormData bodies
 * - throws ApiError with the server's detail message on non-2xx
 * - tolerates empty (204) responses
 */
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  if (!headers.has('X-User-Id')) headers.set('X-User-Id', USER_ID)
  const token = getToken()
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body != null && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  } catch (e) {
    throw new ApiError(0, e instanceof Error ? `Network error: ${e.message}` : 'Network error')
  }
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res))
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const qs = (params: Record<string, string | number | undefined | null>): string => {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}
