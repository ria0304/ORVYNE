import { LUNA_EXPRESSIONS, type LunaExpression } from '../lib/environment'

const pill = (active: boolean) => ({
  padding: '0.25rem 0.6rem',
  borderRadius: 999,
  border: '1px solid #00ffcc',
  background: active ? 'rgba(0,255,204,0.25)' : 'transparent',
  color: '#e0e7ff',
  fontSize: '0.75rem',
  cursor: 'pointer',
})

/** Controls for Luna, the companion orb that follows the player inside the viewer. */
export function LunaCompanion({ expression, following, auto, onToggleFollowing, onSetExpression, onToggleAuto }: {
  expression: LunaExpression
  following: boolean
  auto: boolean
  onToggleFollowing: () => void
  onSetExpression: (e: LunaExpression) => void
  onToggleAuto: () => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, margin: '0.75rem 0' }}>
      <strong style={{ color: '#00ffcc', fontSize: '0.85rem' }}>Luna</strong>
      <button style={pill(following)} onClick={onToggleFollowing}>
        {following ? 'Following' : 'Staying'}
      </button>
      <button style={pill(auto)} onClick={onToggleAuto} title="Mood follows the time of day">
        Auto mood
      </button>
      {LUNA_EXPRESSIONS.map(e => (
        <button key={e} style={pill(!auto && e === expression)} onClick={() => onSetExpression(e)}>
          {e}
        </button>
      ))}
    </div>
  )
}
