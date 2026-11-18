import { useCallback } from 'react'
import { api } from '../api/client'
import type { ProcessResponse, ProcessingReport } from '../api/types'
import { useAppStore } from '../store/useAppStore'

export function useProcessing() {
  const { setGeometry } = useAppStore()

  const processUpload = useCallback(
    async (projectId: number, uploadId: number, pageIndex: number, replaceExisting: boolean) => {
      const res: ProcessResponse = await api.process(projectId, uploadId, pageIndex, replaceExisting)
      setGeometry(res.geometry)
      return res
    },
    [setGeometry],
  )

  const latestReport = useCallback(async (projectId: number): Promise<ProcessingReport | null> => {
    return api.latestReport(projectId)
  }, [])

  const planImageUrl = (projectId: number, revision: number) => api.planImageUrl(projectId, revision)

  return { processUpload, latestReport, planImageUrl }
}
