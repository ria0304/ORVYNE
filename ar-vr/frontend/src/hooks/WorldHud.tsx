import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { WallCollider } from '../lib/collision'
import { FURNITURE_ICONS, FURNITURE_SPECS, type FurnitureType } from '../lib/furniture'
import type { PlayerState } from '../lib/player'

export interface HudRoom {
  room_id: string
  room_name?: string
  room_function?: string
  center?: { x: number; z: number }
  width?: number
  depth?: number
}

const panel = {
  background: 'rgba(15, 23, 42, 0.9)', border: '1px solid #3b82f6', borderRadius: 10, color: '#e0e7ff',
  boxShadow: '0 8px 30px rgba(0,0,0,0.5)', zIndex: 20,
} as const

/** The room the player is standing in, by bounding box (rooms come from BATISSE geometry). */
export function roomAt(rooms: HudRoom[], x: number, z: number): HudRoom | undefined {
  return rooms.find(r => r.center && r.width && r.depth
    && Math.abs(x - r.center.x) <= r.width / 2 && Math.abs(z - r.center.z) <= r.depth / 2)
}

/** M: top-down map of the real walls (door gaps included), room names, and the player. */
export function Minimap({ colliders, rooms, playerRef }: {
  colliders: readonly WallCollider[]
  rooms: HudRoom[]
  playerRef: MutableRefObject<PlayerState>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const SIZE = 190

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const xs: number[] = [], zs: number[] = []
    colliders.forEach(c => xs.push(c.ax, c.bx) && zs.push(c.az, c.bz))
    rooms.forEach(r => r.center && xs.push(r.center.x - (r.width ?? 0) / 2, r.center.x + (r.width ?? 0) / 2) && zs.push(r.center.z - (r.depth ?? 0) / 2, r.center.z + (r.depth ?? 0) / 2))
    if (!xs.length) return
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
    const pad = 14
    const scale = (SIZE - pad * 2) / Math.max(maxX - minX, maxZ - minZ, 1)
    const tx = (x: number) => pad + (x - minX) * scale
    const tz = (z: number) => pad + (z - minZ) * scale
    let raf = 0
    const draw = () => {
      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#94a3b8'
      for (const c of colliders) {
        if (c.r < 0.06) continue // furniture-front colliders are not walls
        ctx.lineWidth = Math.max(2, c.r * 2 * scale)
        ctx.beginPath()
        ctx.moveTo(tx(c.ax), tz(c.az))
        ctx.lineTo(tx(c.bx), tz(c.bz))
        ctx.stroke()
      }
      ctx.fillStyle = '#64748b'
      ctx.font = '9px system-ui, sans-serif'
      ctx.textAlign = 'center'
      for (const r of rooms) if (r.center) ctx.fillText(r.room_name ?? r.room_function ?? '', tx(r.center.x), tz(r.center.z))
      const p = playerRef.current
      const px = tx(p.position.x), pz = tz(p.position.z)
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw) // 0 looks down -Z
      ctx.strokeStyle = '#f87171'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px, pz)
      ctx.lineTo(px + fx * 12, pz + fz * 12)
      ctx.stroke()
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(px, pz, 4, 0, Math.PI * 2)
      ctx.fill()
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [colliders, rooms, playerRef])

  return (
    <div role="region" aria-label="Minimap" style={{ ...panel, position: 'absolute', top: 12, right: 12, padding: 4 }}>
      <canvas ref={canvasRef} width={SIZE} height={SIZE} />
    </div>
  )
}

/** F3: position, facing and the room you are in. */
export function CoordsOverlay({ playerRef, rooms }: { playerRef: MutableRefObject<PlayerState>; rooms: HudRoom[] }) {
  const [text, setText] = useState('')
  useEffect(() => {
    const tick = () => {
      const p = playerRef.current
      const room = roomAt(rooms, p.position.x, p.position.z)
      const yaw = ((((-p.yaw * 180) / Math.PI) % 360) + 360) % 360
      setText(`XYZ ${p.position.x.toFixed(2)} / ${p.position.y.toFixed(2)} / ${p.position.z.toFixed(2)}  ·  facing ${yaw.toFixed(0)}°  ·  ${room?.room_name ?? room?.room_function ?? 'outside'}`)
    }
    tick()
    const id = setInterval(tick, 150)
    return () => clearInterval(id)
  }, [playerRef, rooms])
  return (
    <div role="status" aria-label="Coordinates" style={{ ...panel, position: 'absolute', top: 44, left: 12, padding: '0.3rem 0.7rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }}>
      {text}
    </div>
  )
}

/** I: everything that can be placed; click one to put it in the selected hotbar slot. */
export function InventoryPanel({ selectedSlot, inventory, onAssign, onClose }: {
  selectedSlot: number
  inventory: (FurnitureType | null)[]
  onAssign: (type: FurnitureType) => void
  onClose: () => void
}) {
  return (
    <div role="dialog" aria-label="Inventory" style={{ ...panel, position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '1rem', width: 'min(460px, 92%)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Inventory</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }} aria-label="Close inventory">✕</button>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '4px 0 10px' }}>
        Click an item to put it in hotbar slot {selectedSlot + 1}, then press F to place it.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
        {(Object.keys(FURNITURE_SPECS) as FurnitureType[]).map(type => (
          <button key={type} onClick={() => onAssign(type)} title={type}
            style={{ padding: '0.5rem', borderRadius: 8, border: `1px solid ${inventory[selectedSlot] === type ? '#3b82f6' : '#334155'}`, background: inventory[selectedSlot] === type ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.05)', color: '#e0e7ff', cursor: 'pointer' }}>
            <div style={{ fontSize: '1.4rem' }}>{FURNITURE_ICONS[type]}</div>
            <div style={{ fontSize: '0.7rem' }}>{type}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

export interface WorldSettings {
  showMinimap: boolean
  showCoords: boolean
  /** Multiplier on the default mouse-look sensitivity. */
  sensitivity: number
}

/** Esc: pause the world (movement stops) and adjust settings. */
export function PauseMenu({ settings, onChange, onResume, onExitWalk }: {
  settings: WorldSettings
  onChange: (next: WorldSettings) => void
  onResume: () => void
  onExitWalk: () => void
}) {
  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.5rem 0' } as const
  const btn = { padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #3b82f6', background: 'rgba(59,130,246,0.3)', color: '#fff', cursor: 'pointer' } as const
  return (
    <div role="dialog" aria-label="Paused" style={{ ...panel, position: 'absolute', inset: 0, borderRadius: 8, background: 'rgba(10,14,23,0.82)', display: 'grid', placeItems: 'center' }}>
      <div style={{ width: 'min(360px, 90%)', padding: '1rem' }}>
        <h3 style={{ margin: 0 }}>Paused</h3>
        <label style={row}><span>Minimap</span><input type="checkbox" checked={settings.showMinimap} onChange={e => onChange({ ...settings, showMinimap: e.target.checked })} /></label>
        <label style={row}><span>Coordinates</span><input type="checkbox" checked={settings.showCoords} onChange={e => onChange({ ...settings, showCoords: e.target.checked })} /></label>
        <label style={row}>
          <span>Mouse sensitivity ×{settings.sensitivity.toFixed(1)}</span>
          <input type="range" min={0.3} max={3} step={0.1} value={settings.sensitivity} aria-label="Mouse sensitivity"
            onChange={e => onChange({ ...settings, sensitivity: Number(e.target.value) })} />
        </label>
        <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
          WASD move · Space jump · Shift sprint · Ctrl crouch · E interact · F place · R rotate · I inventory · M map · L Luna · F3 coordinates · F5 perspective · Esc pause
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn} onClick={onResume}>Resume</button>
          <button style={{ ...btn, background: 'transparent' }} onClick={onExitWalk}>Exit walk mode</button>
        </div>
      </div>
    </div>
  )
}

/** L: type a command or question for Luna. */
export function LunaPrompt({ onSend, onClose }: { onSend: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <form role="dialog" aria-label="Talk to Luna" style={{ ...panel, position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)', padding: '0.6rem', width: 'min(420px, 92%)' }}
      onSubmit={e => { e.preventDefault(); if (text.trim()) { onSend(text.trim()); setText(''); onClose() } }}>
      <label htmlFor="luna-command" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Luna: try follow, stay, come closer, status, help…</label>
      <input id="luna-command" ref={ref} value={text} onChange={e => setText(e.target.value)} placeholder="Ask or tell Luna"
        style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: '0.5rem', borderRadius: 6, border: '1px solid #3b82f6', background: '#0f172a', color: '#e0e7ff' }} />
    </form>
  )
}
