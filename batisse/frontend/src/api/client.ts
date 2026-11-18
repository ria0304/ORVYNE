import type {
  FloorPlanGeometry, GeometryResponse, LengthUnit, ProcessingReport, ProcessResponse, Project, UploadInfo, ScaleSource,
  FurnitureAsset, FurnitureInstance, SceneConfiguration,
} from './types'

const BASE = '/api'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, init)
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the Bâtisse backend. Is it running on port 8000?')
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = (body as { error?: { code: string; message: string; details?: unknown } } | null)?.error
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${res.status}).`, err?.details)
  }
  return body as T
}

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: data === undefined ? undefined : JSON.stringify(data),
})

export const api = {
  health: () => request<{ status: string; tesseract_available: boolean }>('/health'),
  listProjects: () => request<Project[]>('/projects'),
  createProject: (name: string, description = '') => request<Project>('/projects', json('POST', { name, description })),
  getProject: (id: number) => request<Project>(`/projects/${id}`),
  deleteProject: (id: number) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  listUploads: (id: number) => request<UploadInfo[]>(`/projects/${id}/uploads`),
  uploadPlan: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<UploadInfo>(`/projects/${id}/uploads`, { method: 'POST', body: form })
  },
  deleteUpload: (uploadId: number) => request<void>(`/uploads/${uploadId}`, { method: 'DELETE' }),
  previewUrl: (uploadId: number, page: number) => `${BASE}/uploads/${uploadId}/preview?page=${page}`,
  process: (id: number, uploadId: number, pageIndex: number, replaceExisting: boolean) =>
    request<ProcessResponse>(`/projects/${id}/process`, json('POST', { upload_id: uploadId, page_index: pageIndex, replace_existing: replaceExisting })),
  latestReport: (id: number) => request<ProcessingReport | null>(`/projects/${id}/processing`),
  planImageUrl: (id: number, revision: number) => `${BASE}/projects/${id}/plan-image?r=${revision}`,
  getGeometry: (id: number) => request<GeometryResponse>(`/projects/${id}/geometry`),
  putGeometry: (id: number, geometry: FloorPlanGeometry) =>
    request<GeometryResponse>(`/projects/${id}/geometry`, json('PUT', { geometry })),
  scaleReference: (id: number, p1: [number, number], p2: [number, number], length: number, unit: LengthUnit) =>
    request<GeometryResponse>(`/projects/${id}/geometry/scale/reference`, json('POST', { p1, p2, length, unit })),
  scaleAccept: (id: number, meters_per_pixel: number, source: ScaleSource, confidence: number, note?: string) =>
    request<GeometryResponse>(`/projects/${id}/geometry/scale/accept`, json('POST', { meters_per_pixel, source, confidence, note })),
  // Furniture assets
  listFurnitureAssets: () => request<FurnitureAsset[]>('/furniture/assets'),
  createFurnitureAsset: (body: Partial<FurnitureAsset>) => request<FurnitureAsset>('/furniture/assets', json('POST', body)),
  importFurnitureAsset: (file: File, name?: string, category?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (name) form.append('name', name)
    if (category) form.append('category', category)
    return request<FurnitureAsset>('/furniture/assets/import', { method: 'POST', body: form })
  },
  furnitureModelUrl: (id: number) => `${BASE}/furniture/assets/${id}/model`,
  getFurnitureAsset: (id: number) => request<FurnitureAsset>(`/furniture/assets/${id}`),
  updateFurnitureAsset: (id: number, body: Partial<FurnitureAsset>) => request<FurnitureAsset>(`/furniture/assets/${id}`, json('PATCH', body)),
  deleteFurnitureAsset: (id: number) => request<void>(`/furniture/assets/${id}`, { method: 'DELETE' }),
  // Furniture instances
  createFurnitureInstance: (body: Partial<FurnitureInstance>) => request<FurnitureInstance>('/furniture/instances', json('POST', body)),
  listFurnitureInstances: (projectId: number) => request<FurnitureInstance[]>(`/projects/${projectId}/furniture/instances`),
  getFurnitureInstance: (id: number) => request<FurnitureInstance>(`/furniture/instances/${id}`),
  updateFurnitureInstance: (id: number, body: Partial<FurnitureInstance>) => request<FurnitureInstance>(`/furniture/instances/${id}`, json('PATCH', body)),
  deleteFurnitureInstance: (id: number) => request<void>(`/furniture/instances/${id}`, { method: 'DELETE' }),
  // Scene configurations
  createSceneConfiguration: (body: { project_id: number; name: string; placements?: unknown[] }) =>
    request<SceneConfiguration>('/scene-configurations', json('POST', body)),
  listSceneConfigurations: (projectId: number) => request<SceneConfiguration[]>(`/projects/${projectId}/scene-configurations`),
  getSceneConfiguration: (id: number) => request<SceneConfiguration>(`/scene-configurations/${id}`),
  updateSceneConfiguration: (id: number, body: { name?: string; placements?: unknown[] }) =>
    request<SceneConfiguration>(`/scene-configurations/${id}`, json('PATCH', body)),
  duplicateSceneConfiguration: (id: number) => request<SceneConfiguration>(`/scene-configurations/${id}/duplicate`, json('POST', {})),
  deleteSceneConfiguration: (id: number) => request<void>(`/scene-configurations/${id}`, { method: 'DELETE' }),
}
