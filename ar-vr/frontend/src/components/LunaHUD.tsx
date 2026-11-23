import type { LunaState } from '../lib/luna'

const Indicator = ({
  label, color, value, icon,
}: {
  label: string
  color: string
  value: number | string
  icon: string
}) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'rgba(30, 41, 59, 0.85)', border: `1px solid ${color}`,
    borderRadius: 8, padding: '4px 10px', fontSize: '0.72rem', color: '#e0e7ff',
  }}>
    <span style={{ fontSize: '0.8rem' }}>{icon}</span>
    <span style={{ color, fontWeight: 600, minWidth: 40, textAlign: 'right' }}>{value}</span>
    <span style={{ opacity: 0.7 }}>{label}</span>
  </div>
)

const BatteryBar = ({ level }: { level: number }) => {
  const color = level > 30 ? '#22c55e' : level > 10 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{
      width: 64, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3,
      overflow: 'hidden',
    }}>
      <div
        style={{
          height: '100%', width: `${level}%`, background: color, transition: 'width 0.5s',
        }}
      />
    </div>
  )
}

const CommandBar = () => (
  <div style={{
    display: 'flex', gap: 8, flexWrap: 'wrap', background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px',
  }}>
    {(['follow', 'stay', 'status', 'help'] as const).map(cmd => (
      <button
        key={cmd}
        onClick={() => window.dispatchEvent(new CustomEvent('luna-command', { detail: { text: cmd } }))}
        style={{
          background: 'rgba(59, 130, 246, 0.25)', border: '1px solid rgba(59, 130, 246, 0.5)',
          color: '#e0e7ff', padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
          fontSize: '0.7rem', transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.4)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)'}
      >
        {cmd.charAt(0).toUpperCase() + cmd.slice(1)}
      </button>
    ))}
  </div>
)

const NameTag = ({ isActive, isSpeaking, following }: {
  isActive: boolean
  isSpeaking: boolean
  following: boolean
}) => (
  <div style={{
    position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)',
    background: isActive ? 'rgba(59, 130, 246, 0.9)' : 'rgba(15, 23, 42, 0.9)',
    color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: '0.68rem',
    whiteSpace: 'nowrap', boxShadow: isSpeaking ? '0 0 8px rgba(0, 255, 204, 0.6)' : 'none',
  }}>
    {isSpeaking ? '🔊 Speaking...' : isActive ? '🪐 Active' : 'Z4'}
  </div>
)

export function LunaHUD({ luna }: { luna: ReturnType<typeof useLunaState> | null }) {
  const lc = luna as any
  if (!lc) return null

  const battery = lc.battery ?? 100
  const isFollowing = lc.isFollowing ?? true
  const speechActive = lc.speechActive ?? false
  const expression = lc.currentExpression ?? 'idle'
  const voiceVolume = lc.voiceVolume ?? 0.8

  return (
    <div style={{
      position: 'fixed', bottom: 12, right: 12, display: 'flex', flexDirection: 'column',
      gap: 6, zIndex: 20, userSelect: 'none',
    }}>
      {/* Name tag + zones */}
      <NameTag isActive={true} isSpeaking={speechActive} following={isFollowing} />

      {/* Status row */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
        background: 'rgba(30, 41, 59, 0.85)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8, padding: '5px 12px', fontSize: '0.72rem', color: '#e0e7ff',
      }}>
        <Indicator
          label={isFollowing ? 'Following You' : 'Standing Still'}
          color="#22c55e"
          value={isFollowing ? 'ON' : 'OFF'}
          icon="👣"
        />
        <Indicator
          label={expression === 'thinking' ? 'Thinking' : expression === 'happy' ? 'Happy' : expression === 'sleeping' ? 'Sleeping' : 'Nominal'}
          color="#3b82f6"
          value={String(expression).toUpperCase()}
          icon="💡"
        />
        <Indicator label="Power" color="#a78bfa" value={`${battery}%`} icon="🔋" />
        <BatteryBar level={battery} />
      </div>

      {/* Command bar */}
      <CommandBar />
    </div>
  )
}

export function useLunaState() {
  // Hook stub - actual state managed by parent
  return {
    battery: 100,
    isFollowing: true,
    speechActive: false,
    currentExpression: 'idle',
    voiceVolume: 0.8,
  }
}
