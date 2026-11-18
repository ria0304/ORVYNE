import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean
  bordered?: boolean
}

export function Card({ className = '', padded = true, bordered = true, children, ...props }: CardProps) {
  return (
    <div
      className={[
        'rounded-sm',
        bordered && 'border border-line',
        'bg-card',
        padded && 'p-4',
        'shadow-sm',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={['mb-3', className].filter(Boolean).join(' ')}>{children}</div>
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h3 className={['font-display font-semibold text-ink', className].filter(Boolean).join(' ')}>{children}</h3>
}

export function CardBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}

export function CardFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={['mt-4 flex items-center gap-2', className].filter(Boolean).join(' ')}>{children}</div>
}