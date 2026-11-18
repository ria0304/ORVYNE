import { useCallback } from 'react'
import { api } from '../api/client'
import { useAppStore } from '../store/useAppStore'

export function useUploads() {
  const { setUploads, addUpload, removeUpload } = useAppStore()

  const listUploads = useCallback(async (projectId: number) => {
    const uploads = await api.listUploads(projectId)
    setUploads(uploads)
    return uploads
  }, [setUploads])

  const uploadPlan = useCallback(
    async (projectId: number, file: File) => {
      const upload = await api.uploadPlan(projectId, file)
      addUpload(upload)
      return upload
    },
    [addUpload],
  )

  const deleteUpload = useCallback(async (uploadId: number) => {
    await api.deleteUpload(uploadId)
    removeUpload(uploadId)
  }, [removeUpload])

  const previewUrl = (uploadId: number, page: number) => api.previewUrl(uploadId, page)

  return { listUploads, uploadPlan, deleteUpload, previewUrl }
}
