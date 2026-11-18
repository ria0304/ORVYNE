interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
  children: React.ReactNode
}

export function Badge({ variant = 'default', className = '', children }: BadgeProps) {
  const variants: Record<string, string> = {
    default: 'bg-card text-ink border border-line',
    success: 'bg-ok-soft text-ok border border-ok/30',
    warning: 'bg-warn-soft text-warn border border-warn/30',
    danger: 'bg-danger-soft text-danger border border-danger/30',
    info: 'bg-accent-soft text-accent border border-accent/30',
  }
  return (
    <span
      className={[
        'inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium transition-colors',
        variants[variant],
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </span>
  )
}