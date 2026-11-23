import { useCallback, useState } from 'react'
import type { FurnitureType } from '../lib/furniture'

export type InventorySlot = FurnitureType | null
export const HOTBAR_SIZE = 9

const STARTER: InventorySlot[] = ['lamp', 'table', 'plant', 'painting', 'sofa', 'rug', null, null, null]

export function useHUD() {
  const [selectedSlot, setSelectedSlotRaw] = useState(0)
  const [inventory, setInventory] = useState<InventorySlot[]>(STARTER)
  const [isPaused, setIsPaused] = useState(false)

  const setSelectedSlot = useCallback((slot: number) => {
    setSelectedSlotRaw(Math.max(0, Math.min(HOTBAR_SIZE - 1, slot)))
  }, [])
  const togglePause = useCallback(() => setIsPaused(p => !p), [])

  return { selectedSlot, setSelectedSlot, inventory, setInventory, isPaused, togglePause }
}
