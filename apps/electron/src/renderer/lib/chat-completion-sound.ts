export type ChatCompletionSoundId = 'chime' | 'glass' | 'wood'

export interface ChatCompletionSoundPreference {
  enabled: boolean
  soundId: ChatCompletionSoundId
}

export interface ChatCompletionSoundOption {
  id: ChatCompletionSoundId
  label: string
  description: string
}

export const CHAT_COMPLETION_SOUND_OPTIONS: ReadonlyArray<ChatCompletionSoundOption> = [
  { id: 'chime', label: 'Chime', description: 'Soft two-tone chime.' },
  { id: 'glass', label: 'Glass', description: 'Bright glass-like ping.' },
  { id: 'wood', label: 'Wood', description: 'Warm wooden click.' },
]

export const DEFAULT_CHAT_COMPLETION_SOUND: ChatCompletionSoundPreference = {
  enabled: true,
  soundId: 'chime',
}

export const CHAT_COMPLETION_SOUND_CHANGED_EVENT = 'craft:chat-completion-sound-changed'

let audioContext: AudioContext | null = null
const CHAT_COMPLETION_SOUND_GAIN_MULTIPLIER = 2.4
const CHAT_COMPLETION_SOUND_MAX_GAIN = 0.3

function parsePreferences(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Fall through to default
  }
  return {}
}

function isSoundId(value: unknown): value is ChatCompletionSoundId {
  return value === 'chime' || value === 'glass' || value === 'wood'
}

export function normalizeChatCompletionSound(value: unknown): ChatCompletionSoundPreference {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_CHAT_COMPLETION_SOUND }
  }

  const raw = value as Record<string, unknown>
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_CHAT_COMPLETION_SOUND.enabled,
    soundId: isSoundId(raw.soundId) ? raw.soundId : DEFAULT_CHAT_COMPLETION_SOUND.soundId,
  }
}

export async function readChatCompletionSoundPreference(): Promise<ChatCompletionSoundPreference> {
  if (!window.electronAPI?.readPreferences) {
    return { ...DEFAULT_CHAT_COMPLETION_SOUND }
  }

  try {
    const { content } = await window.electronAPI.readPreferences()
    const preferences = parsePreferences(content)
    return normalizeChatCompletionSound(preferences.chatCompletionSound)
  } catch {
    return { ...DEFAULT_CHAT_COMPLETION_SOUND }
  }
}

export async function writeChatCompletionSoundPreference(next: ChatCompletionSoundPreference): Promise<void> {
  if (!window.electronAPI?.writePreferences || !window.electronAPI?.readPreferences) {
    return
  }

  const normalized = normalizeChatCompletionSound(next)

  try {
    const { content } = await window.electronAPI.readPreferences()
    const preferences = parsePreferences(content)
    preferences.chatCompletionSound = normalized
    preferences.updatedAt = Date.now()
    await window.electronAPI.writePreferences(JSON.stringify(preferences, null, 2))
  } catch {
    await window.electronAPI.writePreferences(JSON.stringify({
      chatCompletionSound: normalized,
      updatedAt: Date.now(),
    }, null, 2))
  }

  window.dispatchEvent(
    new CustomEvent<ChatCompletionSoundPreference>(CHAT_COMPLETION_SOUND_CHANGED_EVENT, {
      detail: normalized,
    })
  )
}

function getAudioContext(): AudioContext | null {
  const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!audioContext) {
    audioContext = new Ctx()
  }
  return audioContext
}

interface Tone {
  at: number
  frequency: number
  duration: number
  gain: number
  type?: OscillatorType
}

function playTone(context: AudioContext, startAt: number, tone: Tone): void {
  const oscillator = context.createOscillator()
  const gainNode = context.createGain()
  oscillator.type = tone.type ?? 'sine'
  oscillator.frequency.setValueAtTime(tone.frequency, startAt + tone.at)
  const peakGain = Math.min(tone.gain * CHAT_COMPLETION_SOUND_GAIN_MULTIPLIER, CHAT_COMPLETION_SOUND_MAX_GAIN)

  const toneStart = startAt + tone.at
  const toneEnd = toneStart + tone.duration

  gainNode.gain.setValueAtTime(0.0001, toneStart)
  gainNode.gain.linearRampToValueAtTime(peakGain, toneStart + 0.015)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, toneEnd)

  oscillator.connect(gainNode)
  gainNode.connect(context.destination)

  oscillator.start(toneStart)
  oscillator.stop(toneEnd + 0.02)
}

function getPattern(soundId: ChatCompletionSoundId): Tone[] {
  switch (soundId) {
    case 'glass':
      return [
        { at: 0, frequency: 1046, duration: 0.11, gain: 0.07, type: 'triangle' },
        { at: 0.08, frequency: 1568, duration: 0.15, gain: 0.055, type: 'sine' },
      ]
    case 'wood':
      return [
        { at: 0, frequency: 392, duration: 0.07, gain: 0.075, type: 'triangle' },
        { at: 0.07, frequency: 330, duration: 0.1, gain: 0.06, type: 'triangle' },
      ]
    case 'chime':
    default:
      return [
        { at: 0, frequency: 740, duration: 0.12, gain: 0.07, type: 'sine' },
        { at: 0.11, frequency: 988, duration: 0.18, gain: 0.06, type: 'sine' },
      ]
  }
}

export async function playChatCompletionSound(soundId: ChatCompletionSoundId): Promise<void> {
  const context = getAudioContext()
  if (!context) return

  if (context.state === 'suspended') {
    try {
      await context.resume()
    } catch {
      return
    }
  }

  const startAt = context.currentTime + 0.01
  const pattern = getPattern(soundId)
  for (const tone of pattern) {
    playTone(context, startAt, tone)
  }
}
