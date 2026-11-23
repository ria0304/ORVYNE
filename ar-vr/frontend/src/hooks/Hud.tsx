import type { Dispatch, SetStateAction } from 'react'
import { FURNITURE_ICONS } from '../lib/furniture'
import type { InventorySlot } from '../hooks/useHUD'

export function Hotbar({ selectedSlot, setSelectedSlot, inventory, setInventory }: {
  selectedSlot: number
  setSelectedSlot: (slot: number) => void
  inventory: InventorySlot[]
  setInventory: Dispatch<SetStateAction<InventorySlot[]>>
}) {
  return (
    <div
      style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 4, padding: 4, background: 'rgba(15, 23, 42, 0.8)',
        borderRadius: 12, zIndex: 10,
      }}
    >
      {inventory.map((item, i) => (
        <div
          key={i}
          title={item ? `${item} (right-click to clear)` : `Slot ${i + 1}`}
          onClick={() => setSelectedSlot(i)}
          onContextMenu={e => {
            e.preventDefault()
            setInventory(inv => inv.map((v, j) => (j === i ? null : v)))
          }}
          style={{
            width: 36, height: 36, position: 'relative',
            background: i === selectedSlot ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
            border: `2px solid ${i === selectedSlot ? '#3b82f6' : 'transparent'}`,
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#e0e7ff', fontSize: '1.1rem', cursor: 'pointer', userSelect: 'none',
          }}
        >
          {item ? FURNITURE_ICONS[item] : '▢'}
          <span style={{ position: 'absolute', top: 0, left: 3, fontSize: 9, opacity: 0.6 }}>{i + 1}</span>
        </div>
      ))}
    </div>
  )
}

export function PerspectiveIndicator({ perspective }: { perspective: 'first' | 'third' }) {
  return (
    <div
      style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #3b82f6', borderRadius: 6,
        padding: '0.4rem 0.9rem', color: '#e0e7ff', fontSize: '0.75rem', zIndex: 10,
      }}
    >
      {perspective === 'first' ? 'First-Person' : 'Third-Person'}
    </div>
  )
}
