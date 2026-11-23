import { useCallback, useEffect, useRef, useState } from 'react'

export type Notify = (msg: string, timeout?: number) => void

export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback<Notify>((msg, timeout = 4000) => {
    setMessage(msg)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), timeout)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { message, show }
}
