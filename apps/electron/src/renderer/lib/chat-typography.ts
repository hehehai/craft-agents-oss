export interface ChatTypographyPreference {
  fontFamily: string
  fontSize: number
  lineHeight: number
}

export const DEFAULT_CHAT_TYPOGRAPHY: ChatTypographyPreference = {
  fontFamily: '',
  fontSize: 13,
  lineHeight: 1.6,
}

export const CHAT_TYPOGRAPHY_CHANGED_EVENT = 'craft:chat-typography-changed'

function toPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value
}

export function normalizeChatTypography(value: unknown): ChatTypographyPreference {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_CHAT_TYPOGRAPHY }
  }

  const raw = value as Record<string, unknown>
  const fontFamily = typeof raw.fontFamily === 'string' ? raw.fontFamily.trim() : DEFAULT_CHAT_TYPOGRAPHY.fontFamily
  const fontSize = toPositiveNumber(raw.fontSize) ?? DEFAULT_CHAT_TYPOGRAPHY.fontSize
  const lineHeight = toPositiveNumber(raw.lineHeight) ?? DEFAULT_CHAT_TYPOGRAPHY.lineHeight

  return { fontFamily, fontSize, lineHeight }
}

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

export async function readChatTypographyPreference(): Promise<ChatTypographyPreference> {
  if (!window.electronAPI?.readPreferences) {
    return { ...DEFAULT_CHAT_TYPOGRAPHY }
  }

  try {
    const { content } = await window.electronAPI.readPreferences()
    const preferences = parsePreferences(content)
    return normalizeChatTypography(preferences.chatTypography)
  } catch {
    return { ...DEFAULT_CHAT_TYPOGRAPHY }
  }
}

export async function writeChatTypographyPreference(next: ChatTypographyPreference): Promise<void> {
  if (!window.electronAPI?.writePreferences || !window.electronAPI?.readPreferences) {
    return
  }

  const normalized = normalizeChatTypography(next)

  try {
    const { content } = await window.electronAPI.readPreferences()
    const preferences = parsePreferences(content)
    preferences.chatTypography = normalized
    preferences.updatedAt = Date.now()
    await window.electronAPI.writePreferences(JSON.stringify(preferences, null, 2))
  } catch {
    await window.electronAPI.writePreferences(JSON.stringify({
      chatTypography: normalized,
      updatedAt: Date.now(),
    }, null, 2))
  }

  window.dispatchEvent(
    new CustomEvent<ChatTypographyPreference>(CHAT_TYPOGRAPHY_CHANGED_EVENT, {
      detail: normalized,
    })
  )
}
