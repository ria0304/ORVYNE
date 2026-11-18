import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { FurnitureAsset } from '../../api/types'
import { useFurnitureStore } from '../../store/useFurnitureStore'
import { Button } from '../common/Button'
import { Card, CardBody, CardHeader, CardTitle } from '../common/Card'
import { EmptyState } from '../common/EmptyState'
import { Input } from '../common/Input'

interface Props {
  projectId: number | null
  geometry: { floors: { id: string; rooms: { id: string; name: string }[] }[] } | null
  transformMode: 'translate' | 'rotate' | 'scale'
  setTransformMode: (m: 'translate' | 'rotate' | 'scale') => void
  snap: boolean
  setSnap: (s: boolean) => void
}

export function FurnitureControlsPanel({ projectId, geometry, transformMode, setTransformMode, snap, setSnap }: Props) {
  const furniture = useFurnitureStore()
  const [assets, setAssets] = useState<FurnitureAsset[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [sceneName, setSceneName] = useState('')
  const [savingScene, setSavingScene] = useState(false)

  useEffect(() => {
    api.listFurnitureAssets().then(setAssets).catch(() => {})
    if (geometry?.floors?.[0]) {
      const rooms = geometry.floors[0].rooms
      if (rooms.length && !selectedRoomId) setSelectedRoomId(rooms[0].id)
    }
  }, [geometry])

  const floor = geometry?.floors?.[0]
  const rooms = floor?.rooms ?? []

  const handleAdd = async () => {
    if (!selectedAssetId || !geometry || !projectId) return
    const asset = assets.find((a) => a.id === selectedAssetId)
    if (!asset) return
    const room = rooms.find((r) => r.id === selectedRoomId)
    await furniture.createInstance({
      asset_id: asset.id,
      project_id: projectId,
      floor_id: floor?.id ?? 'floor-0',
      room_id: room?.id ?? null,
      pos_x: 0, pos_y: 0, pos_z: 0,
      rot_x: 0, rot_y: 0, rot_z: 0,
      scale_x: 1, scale_y: 1, scale_z: 1,
    })
  }

  const selectedInst = furniture.instances.find((i) => i.id === furniture.selectedInstanceId)
  const selectedAsset = selectedInst ? assets.find((a) => a.id === selectedInst.asset_id) ?? furniture.getAsset(selectedInst.asset_id) : null

  const handleSaveScene = async () => {
    if (!projectId || !sceneName.trim()) return
    setSavingScene(true)
    try {
      await furniture.saveCurrentScene(projectId, sceneName.trim())
      setSceneName('')
    } finally {
      setSavingScene(false)
    }
  }

  const handleApplyScene = async (sceneId: number) => {
    const scene = furniture.sceneConfigs.find((s) => s.id === sceneId)
    if (!scene || !projectId) return
    if (furniture.instances.length > 0 && !window.confirm('Replace current furniture arrangement with this scene?')) return
    await furniture.applyScene(scene, projectId)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Furniture Tools</CardTitle></CardHeader>
        <CardBody className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            {(['translate', 'rotate', 'scale'] as const).map((m) => (
              <Button key={m} size="sm" variant={transformMode === m ? 'secondary' : 'ghost'} onClick={() => setTransformMode(m)}>
                {m}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
            Snap to grid
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Add Furniture</CardTitle></CardHeader>
        <CardBody className="p-4 space-y-3">
          {assets.length === 0 ? (
            <EmptyState title="No assets" description="Import a model in the Furniture Library first." />
          ) : (
            <>
              <select
                value={selectedAssetId ?? ''}
                onChange={(e) => setSelectedAssetId(e.target.value ? Number(e.target.value) : null)}
                className="block w-full rounded-sm border border-line bg-card px-3 py-2 text-sm"
              >
                <option value="">Select asset…</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select
                value={selectedRoomId ?? ''}
                onChange={(e) => setSelectedRoomId(e.target.value || null)}
                className="block w-full rounded-sm border border-line bg-card px-3 py-2 text-sm"
              >
                <option value="">No room</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <Button onClick={handleAdd} disabled={!selectedAssetId || !projectId} className="w-full">
                Add to scene
              </Button>
              {!projectId && <p className="text-xs text-muted">No project instances loaded yet.</p>}
            </>
          )}
        </CardBody>
      </Card>

      {selectedInst && (
        <Card>
          <CardHeader><CardTitle>Selected Furniture</CardTitle></CardHeader>
          <CardBody className="p-4 space-y-2 text-sm">
            <div className="font-medium text-ink">{selectedAsset?.name ?? 'Furniture'}</div>
            <div className="text-xs text-muted">Instance #{selectedInst.id}</div>
            <div className="grid grid-cols-3 gap-1 text-xs">
              <span>X: {selectedInst.pos_x.toFixed(2)}</span>
              <span>Y: {selectedInst.pos_y.toFixed(2)}</span>
              <span>Z: {selectedInst.pos_z.toFixed(2)}</span>
            </div>
            <label className="flex items-center gap-2 text-xs">
              Color override
              <input
                type="color"
                value={(selectedInst.material_overrides?.color as string) ?? '#cccccc'}
                onChange={(e) => {
                  const patch = { material_overrides: { ...(selectedInst.material_overrides ?? {}), color: e.target.value } }
                  furniture.updateInstanceLocal(selectedInst.id, patch)
                  furniture.persistInstance(selectedInst.id, patch)
                }}
                className="w-8 h-6 border border-line rounded-sm"
              />
            </label>
            <div className="flex items-center gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => furniture.duplicateInstance(selectedInst.id)}>Duplicate</Button>
              <Button size="sm" variant="danger" onClick={() => furniture.deleteInstance(selectedInst.id)}>Delete</Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Scene Configurations</CardTitle></CardHeader>
        <CardBody className="p-4 space-y-3">
          <select
            value={furniture.currentSceneId ?? ''}
            onChange={(e) => {
              const sid = e.target.value ? Number(e.target.value) : null
              furniture.setCurrentScene(sid)
              const scene = furniture.sceneConfigs.find((s) => s.id === sid)
              if (scene && projectId) handleApplyScene(scene.id)
            }}
            className="block w-full rounded-sm border border-line bg-card px-3 py-2 text-sm"
          >
            <option value="">Current arrangement</option>
            {furniture.sceneConfigs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <Input value={sceneName} onChange={(e) => setSceneName(e.target.value)} placeholder="Scene name" />
            <Button size="sm" onClick={handleSaveScene} disabled={!sceneName.trim() || savingScene || !projectId}>
              {savingScene ? 'Saving…' : 'Save'}
            </Button>
          </div>
          {furniture.sceneConfigs.length > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => {
                const sid = furniture.currentSceneId
                if (sid) furniture.duplicateScene(sid)
              }} disabled={!furniture.currentSceneId}>
                Duplicate
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                const sid = furniture.currentSceneId
                if (sid && projectId && window.confirm('Delete this scene?')) furniture.deleteScene(sid)
              }} disabled={!furniture.currentSceneId}>
                Delete
              </Button>
            </div>
          )}
          {furniture.saving && <p className="text-xs text-muted">Saving…</p>}
          {furniture.error && <p className="text-xs text-danger">{furniture.error}</p>}
        </CardBody>
      </Card>
    </div>
  )
}