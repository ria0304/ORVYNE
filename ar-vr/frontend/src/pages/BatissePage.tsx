import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { api, ApiError } from '../lib/api'
import { expressionForHour, type LunaExpression, type Weather } from '../lib/environment'
import { useLunaController } from '../hooks/useLunaController'
import {
  buildFurnitureForRooms, createFurniture, disposeFurniture, nearestFurniture, restingY,
  type FurnitureItem,
} from '../lib/furniture'
import { createPlayer, defaultOptions } from '../lib/player'
import {
  createHomeFromGeometry, createPlaceholderScene, disposeObject,
  SceneType, spawnFor,
} from '../lib/scene'
import { Card, buttonStyle } from '../components/ui'
import { ThreeViewer } from '../components/ThreeViewer'
import { Hotbar, PerspectiveIndicator } from '../components/Hud'
import { LunaHUD } from '../components/LunaHUD'
import { LunaCompanion } from '../components/LunaCompanion'
import type { AvatarProps } from '../components/AvatarCustomisation'
import { useHUD } from '../hooks/useHUD'
import { usePlayerControls } from '../hooks/usePlayerControls'
import type { Notify } from '../hooks/useToast'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function BatissePage({ toast, avatarProps }: { toast: Notify; avatarProps: AvatarProps }) {
  const [sceneType, setSceneType] = useState<SceneType>(SceneType.PLACEHOLDER)
  const [model, setModel] = useState<THREE.Object3D | null>(null)
  const [rooms, setRooms] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [needsScale, setNeedsScale] = useState(false)
  const [scaleLength, setScaleLength] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [currentRoom, setCurrentRoom] = useState<string | null>(null)
  const [homeConfig, setHomeConfig] = useState<'none' | 'loading' | 'generated' | 'empty' | 'error'>('none')
  const [furniture, setFurniture] = useState<FurnitureItem[]>([])
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null)
  const [meshUrl, setMeshUrl] = useState<string | undefined>(undefined)

  const [mode, setMode] = useState<'orbit' | 'walk'>('orbit')
  const [perspective, setPerspective] = useState<'first' | 'third'>('first')
  const [weather, setWeather] = useState<Weather>('clear')

  const [lunaExpression, setLunaExpressionState] = useState<LunaExpression>('idle')
  const [lunaFollowing, setLunaFollowing] = useState(true)
  const [lunaAuto, setLunaAuto] = useState(true)

  // Enhanced Luna controller - manages speech, commands, battery, HUD state
  const { lunaState, setLunaState } = useLunaController()

  const hud = useHUD()
  const playerRef = useRef(createPlayer())
  const modelRef = useRef<THREE.Object3D | null>(null)
  const furnitureRef = useRef<FurnitureItem[]>([])
  const loadToken = useRef(0)

  // ── Luna ────────────────────────────────────────────────────────────────
  const setLunaExpression = useCallback((e: LunaExpression, sync = true) => {
    setLunaExpressionState(e)
    if (!sync) return
    const form = new FormData()
    form.append('expression', e)
    api('/api/luna/state/set_expression', { method: 'POST', body: form }).catch(() => {})
  }, [])

  const toggleLunaFollowing = useCallback(() => {
    api<{ is_following: boolean }>('/api/luna/state/toggle_following', { method: 'POST' })
      .then(r => setLunaFollowing(!!r.is_following))
      .catch(() => setLunaFollowing(f => !f)) // backend down: still toggle locally
  }, [])

  useEffect(() => {
    api('/api/luna/state/get_state')
      .then(s => {
        if (typeof s?.is_following === 'boolean') setLunaFollowing(s.is_following)
        if (s?.state) setLunaExpressionState(s.state as LunaExpression)
      })
      .catch(() => {})
  }, [])

  const onHourChange = useCallback(
    (hour: number) => {
      if (lunaAuto) setLunaExpression(expressionForHour(hour))
    },
    [lunaAuto, setLunaExpression],
  )

  // ── Home generation ─────────────────────────────────────────────────────
  const installHome = useCallback((next: THREE.Object3D, type: SceneType, roomList: any[]) => {
    if (modelRef.current) disposeObject(modelRef.current)
    modelRef.current = next
    disposeFurniture(furnitureRef.current)
    const items = buildFurnitureForRooms(roomList)
    furnitureRef.current = items
    setModel(next)
    setSceneType(type)
    setRooms(roomList)
    setFurniture(items)
    setSelectedFurnitureId(null)
    playerRef.current = createPlayer(spawnFor(next))
  }, [])

  // ── Persist where the player is (backend is the source of truth) ─────────
  const lastSaved = useRef('')
  const savePosition = useCallback(() => {
    const p = playerRef.current
    const key = [p.position.x, p.position.y, p.position.z, p.yaw].map(n => n.toFixed(2)).join(',')
    if (key === lastSaved.current) return
    lastSaved.current = key
    api('/api/navigation/state', {
      method: 'PUT',
      body: JSON.stringify({
        position: { x: p.position.x, y: p.position.y, z: p.position.z },
        rotation: { x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) },
      }),
    }).catch(() => {
      lastSaved.current = '' // retry on the next tick
    })
  }, [])

  const restorePosition = useCallback(async () => {
    try {
      const st = await api('/api/navigation/state')
      if (!st?.saved) return
      const p = playerRef.current
      p.position.set(st.position.x, st.position.y, st.position.z)
      p.yaw = 2 * Math.atan2(st.rotation.y, st.rotation.w)
      lastSaved.current = [p.position.x, p.position.y, p.position.z, p.yaw].map((n: number) => n.toFixed(2)).join(',')
      if (st.room_id) setCurrentRoom(st.room_id)
    } catch {
      /* no saved position: stay at the spawn point */
    }
  }, [])

  const loadHome = useCallback(async () => {
    const token = ++loadToken.current
    const stale = () => token !== loadToken.current
    setLoading(true)
    setError(null)
    setNeedsScale(false)
    setHomeConfig('loading')
    try {
      const data = await api('/api/batisse/geometry')
      if (stale()) return
      // BATISSE has no server-side GLB export; build the scene from its validated geometry.
      const built = data?.ready_for_3d ? createHomeFromGeometry(data.geometry) : null
      if (built) {
        installHome(built.group, SceneType.GEOMETRY_DERIVED, built.rooms)
        setHomeConfig('generated')
        await restorePosition()
        return
      }
      setNeedsScale(data?.ready_for_3d === false)
      setError(data?.ready_for_3d === false
        ? 'Your floor plan needs a real-world scale before it can be shown in 3D.'
        : 'BATISSE returned no usable rooms.')
      setHomeConfig('error')
      installHome(createPlaceholderScene(), SceneType.PLACEHOLDER, [])
    } catch (e) {
      if (stale()) return
      if (e instanceof ApiError && e.status === 404) {
        // Signed in, but no floor plan uploaded yet: not an error.
        setHomeConfig('empty')
        installHome(createPlaceholderScene(), SceneType.PLACEHOLDER, [])
        return
      }
      setError(`BATISSE unavailable: ${errText(e)}`)
      setHomeConfig('error')
      installHome(createPlaceholderScene(), SceneType.PLACEHOLDER, [])
    } finally {
      if (!stale()) setLoading(false)
    }
  }, [installHome, restorePosition])

  useEffect(() => {
    if (mode !== 'walk') return
    const id = setInterval(savePosition, 2000)
    return () => {
      clearInterval(id)
      savePosition()
    }
  }, [mode, savePosition])

  useEffect(() => {
    void loadHome()
    return () => {
      loadToken.current++
    }
  }, [loadHome])

  useEffect(() => {
    furnitureRef.current = furniture
  }, [furniture])

  useEffect(
    () => () => {
      if (modelRef.current) disposeObject(modelRef.current)
      disposeFurniture(furnitureRef.current)
    },
    [],
  )

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleRoomClick = (roomId: string) => {
    setCurrentRoom(roomId)
    api(`/api/navigation/set-room/default/${roomId}`, { method: 'POST' })
      .then(() => toast(`Moved to room ${roomId}`))
      .catch(() => toast('Navigation failed'))
  }

  const handleDoorInteraction = (roomId: string, doorSide: 'front' | 'back' | 'left' | 'right') => {
    api(`/api/navigation/set-room/default/${roomId}`, { method: 'POST' })
      .then(() => {
        setCurrentRoom(roomId)
        toast(`Moved to room ${roomId} via ${doorSide} door`)
        setLunaExpression('idle')
      })
      .catch(() => toast('Door navigation failed'))
  }

  const uploadFile = (file: File) => {
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('name', file.name.replace(/\.[^.]+$/, '') || 'My home')
    api('/api/batisse/upload', { method: 'POST', body: form })
      .then(res => {
        toast(`Floor plan processed: ${res?.room_count ?? 0} rooms detected`)
        return loadHome()
      })
      .catch(e => toast(`BATISSE upload failed: ${errText(e)}`))
      .finally(() => setUploading(false))
  }

  const applyScale = () => {
    const length = Number(scaleLength)
    if (!(length > 0)) return toast('Enter the wall length in metres')
    api('/api/batisse/scale-from-longest-wall', { method: 'POST', body: JSON.stringify({ length, unit: 'm' }) })
      .then(() => {
        toast('Scale set')
        return loadHome()
      })
      .catch(e => toast(`Could not set scale: ${errText(e)}`))
  }

  const upload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.png,.jpg,.jpeg,.pdf'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) uploadFile(file)
    }
    input.click()
  }

  const browseWyaWardrobe = async (): Promise<any | null> => {
    try {
      const wardrobe = await api('/api/wardrobe/browse', { method: 'POST' })
      const items: any[] = wardrobe?.items ?? []
      toast(
        items.length
          ? `Wardrobe loaded with: ${items.slice(0, 5).map(i => i.name ?? i.item_name ?? 'Item').join(', ')}`
          : 'Wardrobe loaded',
      )
      return wardrobe
    } catch (e) {
      toast('Failed to load wardrobe')
      console.error('WARDROBE ERROR:', e)
      return null
    }
  }

  const tryOnGarment = async () => {
    try {
      const wardrobe = await api('/api/wardrobe/browse', { method: 'POST' })
      const first = (wardrobe?.items ?? [])[0]
      const garmentImage: string = first?.image_url ?? first?.file_url ?? ''
      if (!garmentImage) return toast('No garments available for try-on')
      const result = await api('/api/tryon/generate', {
        method: 'POST',
        body: JSON.stringify({ garment_image_url: garmentImage, category: first?.category === 'dress' ? 'dress' : 'top' }),
      })
      toast(result?.url ? `TryOn image ready: ${result.url}` : 'TryOn returned no image')
    } catch (e) {
      toast('TryOn failed')
      console.error('TRYON ERROR:', e)
    }
  }

  const generateJewelleryDesign = async () => {
    try {
      const result = await api('/api/velaris/mesh', {
        method: 'POST',
        body: JSON.stringify({ jewelry_type: 'ring', gemstone: 'diamond', metal: 'yellow gold', carat: 1.0, shape: 'round' }),
      })
      if (result?.mesh_url) {
        setMeshUrl(result.mesh_url)
        toast(`Jewellery design generated: ${result.description ?? 'ring'}`)
      } else {
        toast(`Design generation failed: ${result?.error || 'unknown error'}`)
      }
    } catch (e) {
      toast('Jewellery design failed')
      console.error('VELARIS ERROR:', e)
    }
  }

  const interact = () => {
    const near = nearestFurniture(playerRef.current.position, furnitureRef.current, 3)
    if (!near) {
      if (currentRoom) handleDoorInteraction(currentRoom, 'front')
      else toast('Nothing to interact with nearby')
      return
    }
    const { item } = near
    switch (item.type) {
      case 'wardrobe': toast('Opening wardrobe...'); void browseWyaWardrobe(); break
      case 'fitting-room': toast('Opening fitting studio...'); void tryOnGarment(); break
      case 'display case': toast('Opening jewellery studio...'); void generateJewelleryDesign(); break
      case 'lamp':
      case 'table':
        setSelectedFurnitureId(prev => (prev === item.id ? null : item.id))
        toast(selectedFurnitureId === item.id ? 'Deselected' : `Selected ${item.type} — press R to rotate`)
        break
      case 'sofa': toast('Press E to sit'); break
      case 'bed': toast('Time to rest'); break
      case 'counter': toast('Kitchen counter'); break
      case 'plant': toast('Watering plant'); break
      case 'painting': toast('Admiring artwork'); break
      default: toast('Interact with object')
    }
  }

  const rotateSelected = () => {
    const item = furnitureRef.current.find(f => f.id === selectedFurnitureId)
    if (!item) return toast('Select a lamp or table with E first')
    if (item.rotatable) item.mesh.rotation.y += Math.PI / 4
  }

  const placeSelectedSlot = () => {
    const type = hud.inventory[hud.selectedSlot]
    if (!type) return toast('Empty slot')
    const p = playerRef.current
    const ahead = new THREE.Vector3(0, 0, -2).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw)
    const item = createFurniture(type, [p.position.x + ahead.x, restingY(type), p.position.z + ahead.z])
    item.mesh.rotation.y = p.yaw
    setFurniture(prev => [...prev, item])
    toast(`Placed ${type}`)
  }

  const inputRef = usePlayerControls(mode === 'walk', {
    onInteract: interact,
    onRotate: rotateSelected,
    onPlace: placeSelectedSlot,
    onTogglePerspective: () => setPerspective(p => (p === 'first' ? 'third' : 'first')),
    onHotbar: hud.setSelectedSlot,
  })

  const small = { color: '#94a3b8', fontSize: '0.8rem' } as const
  const chip = (active: boolean) => ({
    padding: '0.35rem 0.8rem', borderRadius: 6, border: '1px solid #3b82f6',
    background: active ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.15)', color: '#e0e7ff', cursor: 'pointer',
  })

  return (
    <Card title="BATISSE — Floor Plan & 3D Home" color="#3b82f6" description="Upload a floor plan and explore your 3D dollhouse.">
      <small style={small}>
        Scene: {sceneType.replace('_', ' ')} · {rooms.length} rooms
        {homeConfig !== 'none' && (
          <span style={{ marginLeft: '1rem', color: '#64748b' }}>
            {homeConfig === 'generated' ? 'Home generated from your floor plan' : homeConfig === 'empty' ? 'No floor plan yet: upload one' : homeConfig === 'error' ? 'Home error' : 'Home loading'}
          </span>
        )}
      </small>

      {needsScale && (
        <div role="group" aria-label="Set plan scale" style={{ margin: '0.5rem 0', padding: '0.75rem', border: '1px solid #3b82f6', borderRadius: 8 }}>
          <label htmlFor="scale-length" style={{ display: 'block', marginBottom: 6 }}>
            How long is the longest wall in your plan, in metres?
          </label>
          <input id="scale-length" inputMode="decimal" value={scaleLength} onChange={e => setScaleLength(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #3b82f6', background: '#0f172a', color: '#e0e7ff', marginRight: 8 }} />
          <button style={{ padding: '0.5rem 1rem', borderRadius: 6, border: '1px solid #3b82f6', background: 'rgba(59,130,246,0.3)', color: '#fff', cursor: 'pointer' }} onClick={applyScale}>
            Set scale
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '0.75rem 0' }}>
        <button style={chip(mode === 'walk')} onClick={() => setMode(m => (m === 'walk' ? 'orbit' : 'walk'))}>
          {mode === 'walk' ? 'Exit walk mode' : 'Walk inside'}
        </button>
        <button style={chip(false)} onClick={() => setPerspective(p => (p === 'first' ? 'third' : 'first'))}>
          Perspective: {perspective}
        </button>
        <select
          value={weather}
          onChange={e => setWeather(e.target.value as Weather)}
          aria-label="Weather"
          style={{ padding: '0.35rem', background: '#0f172a', color: '#e0e7ff', border: '1px solid #3b82f6', borderRadius: 6 }}
        >
          <option value="clear">Clear</option>
          <option value="cloudy">Cloudy</option>
          <option value="rain">Rain</option>
        </select>
        {meshUrl && <button style={chip(false)} onClick={() => setMeshUrl(undefined)}>Clear jewellery</button>}
      </div>

      <div style={{ position: 'relative', margin: '1rem 0' }}>
        {loading && !model ? (
          <p style={{ color: '#64748b' }}>Loading…</p>
        ) : (
          <ThreeViewer
            model={model}
            meshUrl={meshUrl}
            furniture={furniture}
            selectedFurnitureId={selectedFurnitureId}
            mode={mode}
            perspective={perspective}
            playerRef={playerRef}
            inputRef={inputRef}
            options={defaultOptions}
            weather={weather}
            lunaExpression={lunaExpression}
            lunaFollowing={lunaFollowing}
            lunaBattery={lunaState.battery}
            lunaState={lunaState}
            onHourChange={onHourChange}
          />
        )}
        {mode === 'walk' && (
          <>
            <PerspectiveIndicator perspective={perspective} />
            <Hotbar
              selectedSlot={hud.selectedSlot}
              setSelectedSlot={hud.setSelectedSlot}
              inventory={hud.inventory}
              setInventory={hud.setInventory}
            />
            {currentRoom && (
              <div style={{ position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)', ...small, textAlign: 'center' }}>
                Press <kbd>E</kbd> to enter {currentRoom}
              </div>
            )}
          </>
        )}
      </div>
      {mode === 'walk' && (
        <p style={small}>
          Click the view to look around · WASD move · Space jump · Shift sprint · Ctrl/C crouch · E interact ·
          R rotate selected · F place hotbar item · 1–9 hotbar · V/F5 perspective
        </p>
      )}

      <LunaCompanion
        expression={lunaExpression}
        following={lunaFollowing}
        auto={lunaAuto}
        onToggleFollowing={toggleLunaFollowing}
        onSetExpression={e => { setLunaAuto(false); setLunaExpression(e) }}
        onToggleAuto={() => setLunaAuto(a => !a)}
      />
      <LunaHUD luna={lunaState} />

      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      {rooms.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
          {rooms.map((room, i) => {
            const id = String(room.room_id ?? i)
            return (
              <button key={id} onClick={() => handleRoomClick(id)} style={chip(currentRoom === id)}>
                {room.room_name || room.room_function || `Room ${id}`}
              </button>
            )
          })}
        </div>
      )}

      <button onClick={upload} disabled={uploading || loading} style={buttonStyle('#64a8d6')}>
        {uploading ? 'Working…' : 'Upload Floor Plan →'}
      </button>
    </Card>
  )
}
