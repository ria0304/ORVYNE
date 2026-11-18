import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, className = '', ...props }, ref) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-ink">{label}</label>}
      <input
        ref={ref}
        className={[
          'block w-full rounded-sm border border-line bg-card px-3 py-2 text-sm text-ink',
          'focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent',
          error && 'border-danger',
          className,
        ].filter(Boolean).join(' ')}
        {...props}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
})

Input.displayName = 'Input'