import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  asChild?: boolean
  icon?: React.ReactNode
}

export function Button({ className = '', variant = 'primary', size = 'md', asChild = false, icon, children, ...props }: ButtonProps) {
  const Comp = asChild ? ({ children, ...rest }: any) => <span {...rest}>{children}</span> : 'button'
  const sizeStyles: Record<string, string> = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-base',
  }
  const variantClasses: Record<string, string> = {
    primary: 'bg-accent text-white hover:bg-accent/90',
    secondary: 'bg-card text-ink border border-line hover:bg-accent-soft',
    ghost: 'text-ink hover:bg-accent-soft',
    danger: 'bg-danger text-white hover:bg-danger/90',
  }
  return (
    <Comp className={[
      'inline-flex items-center justify-center rounded-sm font-medium transition-colors',
      'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
      'disabled:opacity-50 disabled:pointer-events-none',
      sizeStyles[size],
      variantClasses[variant],
      className,
    ].filter(Boolean).join(' ')} {...props}>
      {icon && <span className="flex-shrink-0 mr-2">{icon}</span>}
      {children}
    </Comp>
  )
}