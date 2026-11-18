import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { FurnitureAsset, FurnitureCategory } from '../api/types'
import { ModelPreview } from '../components/furniture/ModelPreview'
import { Button } from '../components/common/Button'
import { Card, CardBody, CardHeader, CardTitle } from '../components/common/Card'
import { Input } from '../components/common/Input'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { ErrorBanner } from '../components/common/ErrorBanner'

const CATEGORIES: FurnitureCategory[] = ['sofa', 'bed', 'chair', 'table', 'wardrobe', 'cabinet', 'shelf', 'desk', 'dresser', 'lighting', 'decor', 'other']

export default function FurnitureAssetDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const assetId = Number(id)
  const [asset, setAsset] = useState<FurnitureAsset | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<FurnitureAsset>>({})

  useEffect(() => {
    api.getFurnitureAsset(assetId)
      .then((a) => { setAsset(a); setForm(a) })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load asset.'))
      .finally(() => setLoading(false))
  }, [assetId])

  const handleSave = async () => {
    if (!asset) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateFurnitureAsset(asset.id, {
        name: form.name,
        category: form.category,
        description: form.description,
        width: form.width,
        height: form.height,
        depth: form.depth,
        units: form.units,
        dimensions_confirmed: form.dimensions_confirmed,
      })
      setAsset(updated)
      setForm(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!asset) return
    if (!window.confirm('Delete this furniture asset?')) return
    try {
      await api.deleteFurnitureAsset(asset.id)
      navigate('/furniture')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  if (loading) return <div className="p-8"><LoadingSpinner /></div>
  if (!asset) return <div className="p-8">Asset not found.</div>

  const modelUrl = asset.model_path ? api.furnitureModelUrl(asset.id) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-2xl brand-gradient tracking-tight">{asset.name}</h1>
        <Button variant="ghost" onClick={() => navigate('/furniture')}>← Back</Button>
      </div>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          {modelUrl ? (
            <ModelPreview
              url={modelUrl}
              className="h-80"
              onDimensions={(d) => {
                if (!asset.dimensions_confirmed) {
                  setForm((f) => ({ ...f, width: d.width, height: d.height, depth: d.depth }))
                }
              }}
            />
          ) : (
            <div className="h-80 rounded-sm border border-line bg-paper flex items-center justify-center text-muted text-sm">
              No model uploaded.
            </div>
          )}
          <p className="text-xs text-muted mt-2">
            {asset.dimensions_confirmed ? 'Dimensions confirmed by user.' : 'Extracted dimensions are estimates until confirmed.'}
          </p>
        </div>
        <Card>
          <CardHeader><CardTitle>Metadata</CardTitle></CardHeader>
          <CardBody className="p-4 space-y-3">
            <Input label="Name" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div>
              <label className="text-xs font-medium text-ink">Category</label>
              <select
                value={form.category ?? 'other'}
                onChange={(e) => setForm({ ...form, category: e.target.value as FurnitureCategory })}
                className="block w-full rounded-sm border border-line bg-card px-3 py-2 text-sm mt-1"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Input label="Description" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <Input label="Width" value={String(form.width ?? 0)} onChange={(e) => setForm({ ...form, width: parseFloat(e.target.value) || 0 })} />
              <Input label="Height" value={String(form.height ?? 0)} onChange={(e) => setForm({ ...form, height: parseFloat(e.target.value) || 0 })} />
              <Input label="Depth" value={String(form.depth ?? 0)} onChange={(e) => setForm({ ...form, depth: parseFloat(e.target.value) || 0 })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.dimensions_confirmed}
                onChange={(e) => setForm({ ...form, dimensions_confirmed: e.target.checked })}
              />
              Dimensions confirmed (not estimated)
            </label>
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="danger" onClick={handleDelete}>Delete</Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}