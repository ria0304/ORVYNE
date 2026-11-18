import { create } from 'zustand'
import type { Project, UploadInfo, FloorPlanGeometry } from '../api/types'

interface AppState {
  projects: Project[]
  currentProject: Project | null
  uploads: UploadInfo[]
  geometry: FloorPlanGeometry | null
  setProjects: (projects: Project[]) => void
  setCurrentProject: (project: Project | null) => void
  setUploads: (uploads: UploadInfo[]) => void
  setGeometry: (geometry: FloorPlanGeometry | null) => void
  addProject: (project: Project) => void
  removeProject: (id: number) => void
  addUpload: (upload: UploadInfo) => void
  removeUpload: (id: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  projects: [],
  currentProject: null,
  uploads: [],
  geometry: null,
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setUploads: (uploads) => set({ uploads }),
  setGeometry: (geometry) => set({ geometry }),
  addProject: (project) => set((state) => ({ projects: [project, ...state.projects] })),
  removeProject: (id) => set((state) => ({ projects: state.projects.filter((p) => p.id !== id) })),
  addUpload: (upload) => set((state) => ({ uploads: [upload, ...state.uploads] })),
  removeUpload: (id) => set((state) => ({ uploads: state.uploads.filter((u) => u.id !== id) })),
}))
