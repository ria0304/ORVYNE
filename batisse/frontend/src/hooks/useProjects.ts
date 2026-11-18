import { useCallback } from 'react'
import { api } from '../api/client'
import type { FloorPlanGeometry } from '../api/types'
import { useAppStore } from '../store/useAppStore'

export function useProjects() {
  const { setProjects, setCurrentProject, addProject, removeProject, setUploads, setGeometry } = useAppStore()

  const loadProjects = useCallback(async () => {
    const projects = await api.listProjects()
    setProjects(projects)
    return projects
  }, [setProjects])

  const createProject = useCallback(
    async (name: string, description = '') => {
      const project = await api.createProject(name, description)
      addProject(project)
      return project
    },
    [addProject],
  )

  const selectProject = useCallback(
    async (id: number) => {
      const [project, uploads] = await Promise.all([api.getProject(id), api.listUploads(id)])
      setCurrentProject(project)
      setUploads(uploads)
      return project
    },
    [setCurrentProject, setUploads],
  )

  const deleteProject = useCallback(
    async (id: number) => {
      await api.deleteProject(id)
      removeProject(id)
    },
    [removeProject],
  )

  const fetchGeometry = useCallback(async (id: number) => {
    const res = await api.getGeometry(id)
    setGeometry(res.geometry)
    return res
  }, [setGeometry])

  const saveGeometry = useCallback(
    async (id: number, geometry: FloorPlanGeometry) => {
      const res = await api.putGeometry(id, geometry)
      setGeometry(res.geometry)
      return res
    },
    [setGeometry],
  )

  const setScaleReference = useCallback(
    async (
      id: number,
      p1: [number, number],
      p2: [number, number],
      length: number,
      unit: 'm' | 'cm' | 'mm' | 'ft' | 'in',
    ) => {
      const res = await api.scaleReference(id, p1, p2, length, unit)
      setGeometry(res.geometry)
      return res
    },
    [setGeometry],
  )

  const acceptScale = useCallback(
    async (id: number, meters_per_pixel: number, source: string, confidence: number, note?: string) => {
      const res = await api.scaleAccept(id, meters_per_pixel, source as any, confidence, note)
      setGeometry(res.geometry)
      return res
    },
    [setGeometry],
  )

  return {
    loadProjects,
    createProject,
    selectProject,
    deleteProject,
    fetchGeometry,
    saveGeometry,
    setScaleReference,
    acceptScale,
  }
}
