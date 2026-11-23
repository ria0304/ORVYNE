import { useEffect, useRef, type MutableRefObject } from 'react'
import { emptyInput, type InputState } from '../lib/player'

export interface ControlHandlers {
  /** E released. */
  onInteract?: () => void
  /** R pressed. */
  onRotate?: () => void
  /** F pressed. */
  onPlace?: () => void
  /** F5 or V pressed. */
  onTogglePerspective?: () => void
  /** Digits 1-9, zero-based slot. */
  onHotbar?: (slot: number) => void
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

const MOVEMENT_KEYS: Record<string, keyof InputState> = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'backward', ArrowDown: 'backward',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  ControlLeft: 'crouch', KeyC: 'crouch',
}

/**
 * Tracks keyboard state in a ref (no per-frame React renders) and dispatches
 * one-shot actions. Handlers are read through a ref so listeners are bound
 * once per `enabled` change and never go stale.
 */
export function usePlayerControls(enabled: boolean, handlers: ControlHandlers): MutableRefObject<InputState> {
  const input = useRef<InputState>(emptyInput())
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    if (!enabled) {
      input.current = emptyInput()
      return
    }

    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.altKey) return
      const key = MOVEMENT_KEYS[e.code]
      if (key) {
        if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
        input.current[key] = true
        return
      }
      if (e.repeat) return
      if (e.code === 'F5' || e.code === 'KeyV') {
        e.preventDefault()
        latest.current.onTogglePerspective?.()
      } else if (e.code === 'KeyR') latest.current.onRotate?.()
      else if (e.code === 'KeyF') latest.current.onPlace?.()
      else if (/^Digit[1-9]$/.test(e.code)) latest.current.onHotbar?.(Number(e.code.slice(5)) - 1)
    }

    const up = (e: KeyboardEvent) => {
      const key = MOVEMENT_KEYS[e.code]
      if (key) input.current[key] = false
      else if (e.code === 'KeyE' && !isTyping(e.target)) latest.current.onInteract?.()
    }

    const reset = () => {
      input.current = emptyInput()
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', reset)
      reset()
    }
  }, [enabled])

  return input
}
