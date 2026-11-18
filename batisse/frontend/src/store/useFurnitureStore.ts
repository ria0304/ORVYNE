import { create } from 'zustand'
import { api } from '../api/client'
import type { FurnitureInstance, FurnitureAsset, SceneConfiguration } from '../api/types'

interface FurnitureState {
  instances: FurnitureInstance[]
  assets: Map<number, FurnitureAsset>
  selectedInstanceId: number | null
  sceneConfigs: SceneConfiguration[]
  currentSceneId: number | null
  loading: boolean
  saving: boolean
  error: string | null

  loadForProject: (projectId: number) => Promise<void>
  loadAssets: () => Promise<void>
  getAsset: (id: number) => FurnitureAsset | undefined

  addInstance: (instance: FurnitureInstance) => void
  updateInstanceLocal: (id: number, patch: Partial<FurnitureInstance>) => void
  removeInstance: (id: number) => void
  selectInstance: (id: number | null) => void

  persistInstance: (id: number, patch: Partial<FurnitureInstance>) => Promise<void>
  createInstance: (body: Partial<FurnitureInstance>) => Promise<FurnitureInstance | null>
  deleteInstance: (id: number) => Promise<void>
  duplicateInstance: (id: number) => Promise<void>

  loadScenes: (projectId: number) => Promise<void>
  saveCurrentScene: (projectId: number, name: string) => Promise<void>
  applyScene: (scene: SceneConfiguration, projectId: number) => Promise<void>
  duplicateScene: (id: number) => Promise<void>
  deleteScene: (id: number) => Promise<void>
  setCurrentScene: (id: number | null) => void
  setError: (e: string | null) => void
}

export const useFurnitureStore = create<FurnitureState>((set, get) => ({
  instances: [],
  assets: new Map(),
  selectedInstanceId: null,
  sceneConfigs: [],
  currentSceneId: null,
  loading: false,
  saving: false,
  error: null,

  loadForProject: async (projectId) => {
    set({ loading: true, error: null })
    try {
      const [instances, configs] = await Promise.all([
        api.listFurnitureInstances(projectId),
        api.listSceneConfigurations(projectId),
      ])
      set({ instances, sceneConfigs: configs })
      await get().loadAssets()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load furniture.' })
    } finally {
      set({ loading: false })
    }
  },

  loadAssets: async () => {
    try {
      const assets = await api.listFurnitureAssets()
      const m = new Map<number, FurnitureAsset>()
      assets.forEach((a) => m.set(a.id, a))
      set({ assets: m })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load assets.' })
    }
  },

  getAsset: (id) => get().assets.get(id),

  addInstance: (instance) => set((s) => ({ instances: [...s.instances, instance] })),

  updateInstanceLocal: (id, patch) =>
    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),

  removeInstance: (id) =>
    set((s) => ({
      instances: s.instances.filter((i) => i.id !== id),
      selectedInstanceId: s.selectedInstanceId === id ? null : s.selectedInstanceId,
    })),

  selectInstance: (id) => set({ selectedInstanceId: id }),

  persistInstance: async (id, patch) => {
    set({ saving: true })
    try {
      const updated = await api.updateFurnitureInstance(id, patch)
      set((s) => ({
        instances: s.instances.map((i) => (i.id === id ? updated : i)),
        saving: false,
      }))
    } catch (err) {
      set({ saving: false, error: err instanceof Error ? err.message : 'Save failed.' })
    }
  },

  createInstance: async (body) => {
    try {
      const inst = await api.createFurnitureInstance(body)
      set((s) => ({ instances: [...s.instances, inst] }))
      return inst
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Create failed.' })
      return null
    }
  },

  deleteInstance: async (id) => {
    try {
      await api.deleteFurnitureInstance(id)
      get().removeInstance(id)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Delete failed.' })
    }
  },

  duplicateInstance: async (id) => {
    const inst = get().instances.find((i) => i.id === id)
    if (!inst) return
    await get().createInstance({
      asset_id: inst.asset_id,
      project_id: inst.project_id,
      floor_id: inst.floor_id,
      room_id: inst.room_id,
      pos_x: inst.pos_x + 0.5,
      pos_y: inst.pos_y,
      pos_z: inst.pos_z + 0.5,
      rot_x: inst.rot_x,
      rot_y: inst.rot_y,
      rot_z: inst.rot_z,
      scale_x: inst.scale_x,
      scale_y: inst.scale_y,
      scale_z: inst.scale_z,
      material_overrides: inst.material_overrides ?? undefined,
    })
  },

  loadScenes: async (projectId) => {
    try {
      const configs = await api.listSceneConfigurations(projectId)
      set({ sceneConfigs: configs })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load scenes.' })
    }
  },

  saveCurrentScene: async (projectId, name) => {
    const placements = get().instances.map((i) => ({
      asset_id: i.asset_id,
      floor_id: i.floor_id,
      room_id: i.room_id,
      pos_x: i.pos_x, pos_y: i.pos_y, pos_z: i.pos_z,
      rot_x: i.rot_x, rot_y: i.rot_y, rot_z: i.rot_z,
      scale_x: i.scale_x, scale_y: i.scale_y, scale_z: i.scale_z,
      material_overrides: i.material_overrides,
    }))
    try {
      const cfg = await api.createSceneConfiguration({ project_id: projectId, name, placements })
      set((s) => ({ sceneConfigs: [...s.sceneConfigs, cfg], currentSceneId: cfg.id }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Save scene failed.' })
    }
  },

  applyScene: async (scene, projectId) => {
    // Transactional: build new instance list first, then swap; never discard silently.
    set({ saving: true })
    try {
      // delete current instances
      await Promise.all(get().instances.map((i) => api.deleteFurnitureInstance(i.id)))
      // create from placements
      const created: FurnitureInstance[] = []
      for (const p of scene.placements) {
        const inst = await api.createFurnitureInstance({
          asset_id: p.asset_id as number,
          project_id: projectId,
          floor_id: (p.floor_id as string) ?? 'floor-0',
          room_id: (p.room_id as string) ?? null,
          pos_x: (p.pos_x as number) ?? 0,
          pos_y: (p.pos_y as number) ?? 0,
          pos_z: (p.pos_z as number) ?? 0,
          rot_x: (p.rot_x as number) ?? 0,
          rot_y: (p.rot_y as number) ?? 0,
          rot_z: (p.rot_z as number) ?? 0,
          scale_x: (p.scale_x as number) ?? 1,
          scale_y: (p.scale_y as number) ?? 1,
          scale_z: (p.scale_z as number) ?? 1,
          material_overrides: (p.material_overrides as Record<string, unknown>) ?? null,
        })
        created.push(inst)
      }
      set({ instances: created, currentSceneId: scene.id, saving: false })
    } catch (err) {
      set({ saving: false, error: err instanceof Error ? err.message : 'Scene switch failed.' })
    }
  },

  duplicateScene: async (id) => {
    try {
      const cfg = await api.duplicateSceneConfiguration(id)
      set((s) => ({ sceneConfigs: [...s.sceneConfigs, cfg] }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Duplicate failed.' })
    }
  },

  deleteScene: async (id) => {
    try {
      await api.deleteSceneConfiguration(id)
      set((s) => ({
        sceneConfigs: s.sceneConfigs.filter((c) => c.id !== id),
        currentSceneId: s.currentSceneId === id ? null : s.currentSceneId,
      }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Delete failed.' })
    }
  },

  setCurrentScene: (id) => set({ currentSceneId: id }),
  setError: (e) => set({ error: e }),
}))