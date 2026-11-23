import type { CSSProperties, ReactNode } from 'react'

export const cardStyle: CSSProperties = {
  padding: '2rem',
  background: 'rgba(15, 23, 42, 0.8)',
  borderRadius: 12,
  marginBottom: '1rem',
}

export const buttonStyle = (color: string): CSSProperties => ({
  width: '100%',
  padding: '0.8rem',
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${color}`,
  borderRadius: 8,
  color: '#d1d9e1',
  fontWeight: 500,
  cursor: 'pointer',
  marginTop: '1rem',
})

export function Card({ title, color, description, children }: {
  title: string
  color: string
  description: string
  children?: ReactNode
}) {
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color }}>{title}</h3>
      <p style={{ margin: '0 0 1rem 0', opacity: 0.8 }}>{description}</p>
      {children}
    </div>
  )
}
