import { useState } from 'react'
import { api, qs } from '../lib/api'
import { Card, buttonStyle } from '../components/ui'
import { AvatarCustomisation, type AvatarColors, type AvatarProps, type AvatarType } from '../components/AvatarCustomisation'
import type { Notify } from '../hooks/useToast'
import type { Dispatch, SetStateAction } from 'react'

const fail = (toast: Notify, label: string) => (e: unknown) =>
  toast(`${label}${e instanceof Error && e.message ? ` (${e.message})` : ''}`)

export function WyaPage({ toast }: { toast: Notify }) {
  return (
    <Card title="WYA — Wardrobe Intelligence" color="#10b981" description="Browse wardrobe items and get AI outfit recommendations.">
      <button
        style={buttonStyle('#22c55e')}
        onClick={() =>
          api(`/api/wardrobe/browse${{}}`, { method: 'POST' })
            .then(() => toast('Wardrobe loaded'))
            .catch(fail(toast, 'Wardrobe browse failed'))
        }
      >
        Browse Wardrobe →
      </button>
      <button
        style={buttonStyle('#22c55e')}
        onClick={() =>
          api('/api/wardrobe/outfit-recommendations', { method: 'POST', body: JSON.stringify({ occasion: 'casual' }) })
            .then(() => toast('Recommendations loaded'))
            .catch(fail(toast, 'Recommendations failed'))
        }
      >
        Get Outfit Recommendations →
      </button>
    </Card>
  )
}

export function TryOnPage({ toast, avatarType, setAvatarType, avatarColors, setAvatarColors, avatarProps, setAvatarProps }: {
  toast: Notify
  avatarType: AvatarType
  setAvatarType: Dispatch<SetStateAction<AvatarType>>
  avatarColors: AvatarColors
  setAvatarColors: Dispatch<SetStateAction<AvatarColors>>
  avatarProps: AvatarProps
  setAvatarProps: Dispatch<SetStateAction<AvatarProps>>
}) {
  return (
    <>
      <Card title="TryOn — Virtual Fitting Room" color="#f59e0b" description="Generate AI try-on previews for garments.">
        <button
          style={buttonStyle('#f59e0b')}
          onClick={() =>
            api('/api/tryon/generate', {
              method: 'POST',
              body: JSON.stringify(avatarProps),
            })
              .then(() => toast('Try-on generated'))
              .catch(fail(toast, 'Try-on failed'))
          }
        >
          Generate Try-On →
        </button>
      </Card>
      <AvatarCustomisation
        avatarType={avatarType}
        setAvatarType={setAvatarType}
        avatarColors={avatarColors}
        setAvatarColors={setAvatarColors}
        setAvatarProps={setAvatarProps}
      />
    </>
  )
}

export function VelarisPage({ toast }: { toast: Notify }) {
  return (
    <Card title="VELARIS — Jewellery Boutique" color="#8b5cf6" description="AI-generated jewellery designs and gifting advice.">
      <button
        style={buttonStyle('#a855f7')}
        onClick={() =>
          api('/api/jewellery/designs')
            .then(() => toast('Designs loaded'))
            .catch(fail(toast, 'Failed to load designs'))
        }
      >
        List Designs →
      </button>
      <button
        style={buttonStyle('#a855f7')}
        onClick={() =>
          api('/api/jewellery/generate-design', {
            method: 'POST',
            body: JSON.stringify({ gemstone: 'diamond', metal: 'gold', occasion: 'gift' }),
          })
            .then(() => toast('Design generated'))
            .catch(fail(toast, 'Design generation failed'))
        }
      >
        Generate Design →
      </button>
    </Card>
  )
}

export function LunaPage({ toast }: { toast: Notify }) {
  const [input, setInput] = useState('I need an outfit for a summer wedding')
  const [reply, setReply] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ask = () => {
    setBusy(true)
    api(`/api/luna/chat${qs({ message: input })}`, { method: 'POST' })
      .then(data => setReply(data?.reply || data?.response || JSON.stringify(data)))
      .catch(fail(toast, 'Luna chat failed'))
      .finally(() => setBusy(false))
  }

  return (
    <Card title="luna-stylist — AI Fashion Chatbot" color="#ec4899" description="Chat with Luna for style advice and outfit suggestions.">
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !busy && ask()}
        aria-label="Message for Luna"
        style={{ width: '100%', boxSizing: 'border-box', padding: '0.7rem', borderRadius: 8, border: '1px solid #ec4899', background: '#0f172a', color: '#e0e7ff' }}
      />
      <button style={buttonStyle('#ec4899')} onClick={ask} disabled={busy}>
        {busy ? 'Thinking…' : 'Ask Luna →'}
      </button>
      {reply && <p style={{ marginTop: '1rem', color: '#f9a8d4' }}>{reply}</p>}
    </Card>
  )
}
