import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

interface LunaState {
  isFollowing: boolean
  currentExpression: string
  voiceVolume: number
  voiceMuted: boolean
  battery: number
  zone: string
  interactionStatus: string
  speechActive: boolean
  speechText: string
}

export function useLunaController() {
  const [lunaState, setLunaState] = useState<LunaState>({
    isFollowing: true,
    currentExpression: 'idle',
    voiceVolume: 0.8,
    voiceMuted: false,
    battery: 100,
    zone: 'living_room',
    interactionStatus: 'idle',
    speechActive: false,
    speechText: '',
  })

  const stateRef = useRef<LunaState>(lunaState)
  const speechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechIdRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Sync stateRef with state
  useEffect(() => { stateRef.current = lunaState }, [lunaState])

  // Persistence: save state when it changes
  useEffect(() => {
    const timer = setTimeout(() => {
      api('/api/luna/state/set_state', {
        method: 'POST',
        body: JSON.stringify({
          state: lunaState.currentExpression,
          is_following: lunaState.isFollowing,
          voice_volume: lunaState.voiceVolume,
          voice_muted: lunaState.voiceMuted,
          battery: lunaState.battery,
          zone: lunaState.zone,
          interaction_status: lunaState.interactionStatus,
          speech_active: lunaState.speechActive,
          speech_text: lunaState.speechText,
        }),
      }).catch(() => {})
    }, 3000)
    return () => clearTimeout(timer)
  }, [lunaState])

  // Load persisted state on mount
  useEffect(() => {
    api('/api/luna/state/get_state').then(data => {
      if (data) {
        setLunaState(prev => ({
          ...prev,
          currentExpression: data.state ?? prev.currentExpression,
          isFollowing: data.is_following ?? prev.isFollowing,
          zone: data.zone ?? prev.zone,
        }))
      }
    }).catch(() => {})
  }, [])

  // Speech synthesis
  const speak = useCallback((text: string) => {
    const synth = typeof window !== 'undefined' ? (window as any).speechSynthesis : null
    const volume = lunaState.voiceMuted ? 0 : lunaState.voiceVolume

    // Cancel previous speech
    speechIdRef.current++
    if (speechTimerRef.current) {
      clearTimeout(speechTimerRef.current)
    }
    if (synth) synth.cancel()

    if (volume > 0 && text && synth) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.volume = volume
      utterance.rate = 1.0
      utterance.pitch = 0.9

      const currentId = speechIdRef.current

      utterance.onstart = () => {
        setLunaState(prev => ({ ...prev, speechActive: true, speechText: text }))
      }
      utterance.onend = () => {
        if (currentId === speechIdRef.current) {
          setLunaState(prev => ({ ...prev, speechActive: false, speechText: '' }))
        }
      }
      utterance.onerror = () => {
        setLunaState(prev => ({ ...prev, speechActive: false, speechText: '' }))
      }

      synth.speak(utterance)

      // Visual speech indicator (fallback)
      speechTimerRef.current = setTimeout(() => {
        setLunaState(prev => ({ ...prev, speechActive: true, speechText: text }))
      }, 100)
    }
  }, [lunaState])

  // Help text
  const generateHelpText = useCallback(() => `Hello! I'm Luna, your virtual companion. I can:
    • Follow you around the home.
    • Show your wardrobe items from WYA.
    • Help you with outfit coordination.
    • Go to the jewellery studio with you.
    • Tell you my status. Try saying "What can you do?" or "Status".`, [])

  // Command execution
  const executeCommand = useCallback(async (cmd: string) => {
    const normalized = cmd.toLowerCase().trim()

    setLunaState(prev => ({ ...prev, interactionStatus: 'providing_help' }))

    switch (normalized) {
      case 'follow':
      case 'follow me':
      case 'following':
        setLunaState(prev => ({ ...prev, isFollowing: !prev.isFollowing }))
        speak(stateRef.current.isFollowing ? 'Stopped following.' : 'Now following you!')
        break

      case 'stay':
      case 'stop':
      case 'stay here':
      case 'stop following':
      case 'come closer':
        setLunaState(prev => ({ ...prev, isFollowing: false }))
        speak('Staying here. Waiting for your command.')
        break

      case 'open wardrobe':
      case 'open my wardrobe':
      case 'show wardrobe':
        speak('Opening your wardrobe...')
        api('/api/wardrobe/browse', { method: 'POST' }).then(wardrobe => {
          const items: any[] = wardrobe?.items ?? []
          speak(items.length
            ? `Here are your top items: ${items.slice(0, 5).map(i => i?.name ?? 'an item').join(', ')}`
            : 'Your wardrobe is empty.')
        }).catch(() => speak('I cannot reach your wardrobe right now.'))
        break

      case 'go to jewelry studio':
      case 'go to jewellery studio':
      case 'go to studio':
      case 'take me to studio':
        setLunaState(prev => ({ ...prev, zone: 'jewelry_studio' }))
        speak('Navigating to jewelry studio.')
        break

      case 'what can you do':
      case 'what are you':
      case 'help':
        speak(generateHelpText())
        break

      case 'status':
      case 'where are you':
        setLunaState(prev => ({ ...prev, interactionStatus: 'idle' }))
        speak(`I'm ${stateRef.current.isFollowing ? 'following you' : 'staying here'}. Zone: ${stateRef.current.zone}. Battery: ${stateRef.current.battery}%`)
        break

      default:
        speak('I didn\'t quite catch that. Try saying "What can you do?" for help.')
        break
    }

    setTimeout(() => {
      setLunaState(prev => ({ ...prev, interactionStatus: 'idle' }))
    }, 3000)
  }, [speak, generateHelpText])

  // Event listener for voice commands from player
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text as string | undefined
      if (text) {
        executeCommand(text)
      }
    }
    window.addEventListener('luna-command', handler)
    return () => window.removeEventListener('luna-command', handler)
  }, [executeCommand])

  return {
    lunaState,
    setLunaState,
    speak,
    executeCommand,
  }
}
