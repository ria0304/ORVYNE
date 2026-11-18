import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { FurnitureAsset, FurnitureCategory } from '../api/types'
import { Button } from '../components/common/Button'
import { Card, CardBody, CardHeader, CardTitle } from '../components/common/Card'
import { EmptyState } from '../components/common/EmptyState'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { ErrorBanner } from '../components/common/ErrorBanner'

const CATEGORIES: FurnitureCategory[] = ['sofa', 'bed', 'chair', 'table', 'wardrobe', 'cabinet', 'shelf', 'desk', 'dresser', 'lighting', 'decor', 'other']

export default function FurnitureLibraryPage() {
  const navigate = useNavigate()
  const [assets, setAssets] = useState<FurnitureAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<FurnitureCategory | 'all'>('all')
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      setAssets(await api.listFurnitureAssets())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const filtered = assets.filter((a) => {
    if (category !== 'all' && a.category !== category) return false
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleImport = async (file: File) => {
    setImporting(true)
    setError(null)
    try {
      const asset = await api.importFurnitureAsset(file, file.name.replace(/\.[^.]+$/, ''), 'other')
      setAssets((prev) => [asset, ...prev])
      navigate(`/furniture/${asset.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCreate = async () => {
    try {
      const asset = await api.createFurnitureAsset({ name: 'New furniture', category: 'other' })
      setAssets((prev) => [asset, ...prev])
      navigate(`/furniture/${asset.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create asset.')
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this furniture asset?')) return
    try {
      await api.deleteFurnitureAsset(id)
      setAssets((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete asset.')
    }
  }

  if (loading) return <div className="p-8"><LoadingSpinner /></div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl brand-gradient tracking-tight">Furniture Library</h1>
          <p className="text-muted mt-1">Reusable 3D furniture assets for your dollhouse.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImport(f)
            }}
          />
          <Button onClick={() => fileInputRef.current?.click()} size="lg" className="brand-gradient-bg text-white" disabled={importing}>
            {importing ? 'Importing…' : 'Import Model'}
          </Button>
          <Button onClick={handleCreate} variant="secondary" size="lg">
            New Asset
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="flex flex-col md:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search assets…"
          className="flex-1 rounded-sm border border-line bg-card px-3 py-2 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as FurnitureCategory | 'all')}
          className="rounded-sm border border-line bg-card px-3 py-2 text-sm"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No furniture assets yet"
          description="Import a GLB/GLTF model or create an asset to build your library."
          action={<Button onClick={() => fileInputRef.current?.click()}>Import model</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((asset) => (
            <Card key={asset.id} className="hover:border-accent/30 transition-colors">
              <CardHeader>
                <CardTitle className="text-base">{asset.name}</CardTitle>
              </CardHeader>
              <CardBody className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted uppercase tracking-wider">{asset.category}</span>
                  <span className="text-xs text-muted">·</span>
                  <span className="text-xs text-muted">{asset.width.toFixed(2)} × {asset.height.toFixed(2)} × {asset.depth.toFixed(2)} {asset.units}</span>
                </div>
                <div className="text-xs text-muted">{asset.dimensions_confirmed ? 'Dimensions confirmed' : 'Dimensions estimated'}</div>
                {asset.model_path && <div className="text-xs text-ok">Model available</div>}
                <div className="flex items-center gap-2 pt-2">
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/furniture/${asset.id}`)}>
                    Details
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(asset.id)}>
                    Delete
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}