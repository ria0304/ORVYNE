import type { ChangeEvent, Dispatch, SetStateAction } from 'react'
import { Card } from './ui'

export type AvatarType = 'human' | 'elf' | 'cat' | 'dog'
export interface AvatarColors { primary: number; secondary: number }
export interface AvatarProps { type: AvatarType; primary: number; secondary: number }

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0')
const ICONS: Record<AvatarType, string> = { human: '👤', elf: '🧝', cat: '🐱', dog: '🐶' }

export function AvatarCustomisation({ avatarType, setAvatarType, avatarColors, setAvatarColors, setAvatarProps }: {
  avatarType: AvatarType
  setAvatarType: Dispatch<SetStateAction<AvatarType>>
  avatarColors: AvatarColors
  setAvatarColors: Dispatch<SetStateAction<AvatarColors>>
  setAvatarProps: Dispatch<SetStateAction<AvatarProps>>
}) {
  const onType = (e: ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value as AvatarType
    setAvatarType(type)
    setAvatarProps(prev => ({ ...prev, type }))
  }

  const onColor = (e: ChangeEvent<HTMLInputElement>) => {
    const key = e.target.name as keyof AvatarColors
    const color = parseInt(e.target.value.replace('#', ''), 16)
    if (Number.isNaN(color)) return
    setAvatarColors(prev => ({ ...prev, [key]: color }))
    setAvatarProps(prev => ({ ...prev, [key]: color }))
  }

  const label = { display: 'block', marginBottom: '0.5rem', color: '#e0e7ff' } as const
  const colorInput = { width: '100%', height: '3rem', padding: 0, border: 'none', cursor: 'pointer', marginBottom: '1rem' } as const

  return (
    <Card title="Avatar Customisation" color="#6c5ce7" description="Customize your avatar appearance">
      <label style={label} htmlFor="avatar-type">Avatar Type</label>
      <select
        id="avatar-type"
        value={avatarType}
        onChange={onType}
        style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #3b3d4e', borderRadius: 6, color: '#e0e7ff', marginBottom: '1rem' }}
      >
        <option value="human">Human</option>
        <option value="elf">Elf</option>
        <option value="cat">Cat Person</option>
        <option value="dog">Dog Person</option>
      </select>

      <label style={label} htmlFor="avatar-primary">Primary Color</label>
      <input id="avatar-primary" type="color" name="primary" value={hex(avatarColors.primary)} onChange={onColor} style={colorInput} />
      <label style={label} htmlFor="avatar-secondary">Secondary Color</label>
      <input id="avatar-secondary" type="color" name="secondary" value={hex(avatarColors.secondary)} onChange={onColor} style={colorInput} />

      <div
        style={{
          width: 64, height: 64, margin: '1rem auto', borderRadius: 50, display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem',
          background: hex(avatarColors.primary), border: `3px solid ${hex(avatarColors.secondary)}`,
        }}
      >
        {ICONS[avatarType]}
      </div>
    </Card>
  )
}
