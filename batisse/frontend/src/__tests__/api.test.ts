import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, ApiError } from '../api/client'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ApiError', () => {
  it('carries status, code and message', () => {
    const err = new ApiError(404, 'project_not_found', 'not found', { detail: 'x' })
    expect(err.status).toBe(404)
    expect(err.code).toBe('project_not_found')
    expect(err.message).toBe('not found')
    expect(err.details).toEqual({ detail: 'x' })
  })
})

describe('api.request error handling', () => {
  it('throws ApiError on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({ error: { code: 'project_not_found', message: 'Project 9 does not exist.' } }, 404)
    )
    await expect(api.getProject(9)).rejects.toMatchObject({
      status: 404,
      code: 'project_not_found',
      message: 'Project 9 does not exist.',
    })
  })

  it('throws network ApiError when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(api.getProject(1)).rejects.toMatchObject({
      status: 0,
      code: 'network',
    })
  })
})

describe('api previewUrl', () => {
  it('builds a preview url with page param', () => {
    expect(api.previewUrl(3, 1)).toBe('/api/uploads/3/preview?page=1')
    expect(api.previewUrl(3, 0)).toBe('/api/uploads/3/preview?page=0')
  })
})
