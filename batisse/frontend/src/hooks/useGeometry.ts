import { useCallback } from 'react'
import { api } from '../api/client'
import type { FloorPlanGeometry } from '../api/types'
import { useAppStore } from '../store/useAppStore'

export function useGeometry() {
  const { setGeometry } = useAppStore()

  const fetchGeometry = useCallback(async (projectId: number) => {
    const res = await api.getGeometry(projectId)
    setGeometry(res.geometry)
    return res
  }, [setGeometry])

  const saveGeometry = useCallback(
    async (projectId: number, geometry: FloorPlanGeometry) => {
      const res = await api.putGeometry(projectId, geometry)
      setGeometry(res.geometry)
      return res
    },
    [setGeometry],
  )

  return { fetchGeometry, saveGeometry }
}
