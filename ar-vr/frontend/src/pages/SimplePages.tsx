import { useState } from 'react'
import { api } from '../lib/api'
import { Card, buttonStyle } from '../components/ui'
import { AvatarCustomisation, type AvatarColors, type AvatarProps, type AvatarType } from '../components/AvatarCustomisation'
import type { Notify } from '../hooks/useToast'
import type { Dispatch, SetStateAction } from 'react'

const fail = (toast: Notify, label: string) => (e: unknown) =>
  toast(`${label}${e instanceof Error && e.message ? ` (${e.message})` : ''}`)

const pre = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.8rem', background: '#0b1220', padding: '0.75rem', borderRadius: 8, marginTop: '1rem', maxHeight: 320, overflow: 'auto' } as const

type WardrobeItem = { id?: string | number; name?: string; category?: string; color?: string; image_url?: string }

export function WyaPage({ toast }: { toast: Notify }) {
  const [items, setItems] = useState<WardrobeItem[] | null>(null)
  const [recs, setRecs] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const browse = () => {
    setBusy(true)
    api('/api/wardrobe/browse', { method: 'POST' })
      .then(data => setItems(data?.items ?? []))
      .catch(fail(toast, 'Wardrobe browse failed'))
      .finally(() => setBusy(false))
  }

  const recommend = () => {
    setBusy(true)
    api('/api/wardrobe/outfit-recommendations', { method: 'POST', body: JSON.stringify({}) })
      .then(data => setRecs(data?.recommendations ?? null))
      .catch(fail(toast, 'Recommendations failed'))
      .finally(() => setBusy(false))
  }

  return (
    <Card title="WYA — Wardrobe Intelligence" color="#10b981" description="Your own WYA wardrobe and AI outfit recommendations.">
      <button style={buttonStyle('#22c55e')} onClick={browse} disabled={busy}>Browse Wardrobe →</button>
      <button style={buttonStyle('#22c55e')} onClick={recommend} disabled={busy}>Get Outfit Recommendations →</button>
      {items && (items.length === 0
        ? <p style={{ color: '#94a3b8' }}>Your WYA wardrobe is empty.</p>
        : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: '1rem' }}>
            {items.map((it, i) => (
              <li key={it.id ?? i} style={{ background: '#0b1220', borderRadius: 8, padding: 10 }}>
                {it.image_url && <img src={it.image_url} alt={it.name ?? 'garment'} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 6 }} />}
                <strong>{it.name ?? 'Item'}</strong>
                <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{[it.category, it.color].filter(Boolean).join(' · ')}</div>
              </li>
            ))}
          </ul>
        ))}
      {recs != null && <pre style={pre} aria-label="Outfit recommendations">{JSON.stringify(recs, null, 2)}</pre>}
    </Card>
  )
}

export function TryOnPage({ toast, avatarType, setAvatarType, avatarColors, setAvatarColors, avatarProps: _avatarProps, setAvatarProps }: {
  toast: Notify
  avatarType: AvatarType
  setAvatarType: Dispatch<SetStateAction<AvatarType>>
  avatarColors: AvatarColors
  setAvatarColors: Dispatch<SetStateAction<AvatarColors>>
  avatarProps: AvatarProps
  setAvatarProps: Dispatch<SetStateAction<AvatarProps>>
}) {
  const [garments, setGarments] = useState<WardrobeItem[]>([])
  const [garmentUrl, setGarmentUrl] = useState('')
  const [category, setCategory] = useState('top')
  const [stand, setStand] = useState('feminine')
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadWardrobe = () =>
    api('/api/wardrobe/browse', { method: 'POST' })
      .then(data => setGarments((data?.items ?? []).filter((i: WardrobeItem) => i.image_url)))
      .catch(fail(toast, 'Could not load your WYA wardrobe'))

  const generate = () => {
    setBusy(true)
    setResultUrl(null)
    api('/api/tryon/generate', { method: 'POST', body: JSON.stringify({ garment_image_url: garmentUrl, category, avatar: stand }) })
      .then(data => (data?.url ? setResultUrl(data.url) : toast('TryOn returned no image')))
      .catch(fail(toast, 'Try-on failed'))
      .finally(() => setBusy(false))
  }

  const input = { width: '100%', boxSizing: 'border-box', padding: '0.6rem', borderRadius: 8, border: '1px solid #f59e0b', background: '#0f172a', color: '#e0e7ff', marginTop: 8 } as const

  return (
    <>
      <Card title="TryOn — Virtual Fitting Room" color="#f59e0b" description="Image-based preview: the garment is dressed onto TryOn's stand-in body (not a 3D cloth simulation).">
        <button style={buttonStyle('#f59e0b')} onClick={() => void loadWardrobe()}>Pick from my WYA wardrobe →</button>
        {garments.length > 0 && (
          <select aria-label="Garment" style={input} value={garmentUrl} onChange={e => setGarmentUrl(e.target.value)}>
            <option value="">Choose a garment…</option>
            {garments.map((g, i) => <option key={g.id ?? i} value={g.image_url}>{g.name ?? 'Item'}</option>)}
          </select>
        )}
        <input aria-label="Garment image URL" style={input} placeholder="…or paste a garment image URL" value={garmentUrl} onChange={e => setGarmentUrl(e.target.value)} />
        <select aria-label="Category" style={input} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="top">Top</option><option value="dress">Dress</option><option value="jacket">Jacket</option><option value="bottom">Bottom</option>
        </select>
        <select aria-label="Stand-in body" style={input} value={stand} onChange={e => setStand(e.target.value)}>
          <option value="feminine">Feminine</option><option value="masculine">Masculine</option>
        </select>
        <button style={buttonStyle('#f59e0b')} onClick={generate} disabled={busy || !garmentUrl}>{busy ? 'Generating…' : 'Generate Try-On →'}</button>
        {resultUrl && <img src={resultUrl} alt="Generated try-on result" style={{ width: '100%', maxWidth: 420, borderRadius: 10, marginTop: '1rem' }} />}
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
  const [result, setResult] = useState<unknown>(null)
  const run = (label: string, call: () => Promise<unknown>) =>
    call().then(setResult).catch(fail(toast, label))
  return (
    <Card title="VELARIS — Jewellery Boutique" color="#8b5cf6" description="AI-generated jewellery designs and trends.">
      <button style={buttonStyle('#a855f7')} onClick={() => void run('Failed to load trends', () => api('/api/jewellery/designs'))}>
        Design Trends →
      </button>
      <button
        style={buttonStyle('#a855f7')}
        onClick={() => void run('Design generation failed', () =>
          api('/api/jewellery/generate-design', { method: 'POST', body: JSON.stringify({ gemstone: 'diamond', metal: 'gold', occasion: 'gift' }) }))}
      >
        Generate Design →
      </button>
      {result != null && <pre style={pre} aria-label="VELARIS result">{JSON.stringify(result, null, 2).slice(0, 4000)}</pre>}
    </Card>
  )
}

export function LunaPage({ toast }: { toast: Notify }) {
  const [input, setInput] = useState('I need an outfit for a summer wedding')
  const [reply, setReply] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ask = () => {
    setBusy(true)
    api('/api/luna/chat', { method: 'POST', body: JSON.stringify({ message: input, intent: 'outfit-help' }) })
      .then(data => setReply(data?.reply || 'Luna had no reply.'))
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
