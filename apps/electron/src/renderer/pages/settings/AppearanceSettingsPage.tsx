/**
 * AppearanceSettingsPage
 *
 * Visual customization settings: theme mode, color theme, font,
 * workspace-specific theme overrides, and CLI tool icon mappings.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { Button } from '@/components/ui/button'
import { EditPopover, EditButton, getEditConfig } from '@/components/ui/EditPopover'
import { useTheme } from '@/context/ThemeContext'
import { useAppShellContext } from '@/context/AppShellContext'
import { routes } from '@/lib/navigate'
import { Monitor, Sun, Moon, Volume2 } from 'lucide-react'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import type { ToolIconMapping } from '../../../shared/types'

import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsSegmentedControl,
  SettingsMenuSelect,
  SettingsInput,
  SettingsToggle,
} from '@/components/settings'
import * as storage from '@/lib/local-storage'
import { useWorkspaceIcons } from '@/hooks/useWorkspaceIcon'
import { Info_DataTable, SortableHeader } from '@/components/info/Info_DataTable'
import { Info_Badge } from '@/components/info/Info_Badge'
import type { PresetTheme } from '@config/theme'
import {
  CHAT_COMPLETION_SOUND_OPTIONS,
  DEFAULT_CHAT_COMPLETION_SOUND,
  playChatCompletionSound,
  readChatCompletionSoundPreference,
  type ChatCompletionSoundId,
  type ChatCompletionSoundPreference,
  writeChatCompletionSoundPreference,
} from '@/lib/chat-completion-sound'
import {
  DEFAULT_CHAT_TYPOGRAPHY,
  readChatTypographyPreference,
  type ChatTypographyPreference,
  writeChatTypographyPreference,
} from '@/lib/chat-typography'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'appearance',
}

function parsePositiveNumber(raw: string): number | null {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

// ============================================
// Tool Icons Table
// ============================================

/**
 * Column definitions for the tool icon mappings table.
 * Shows a preview icon, tool name, and the CLI commands that trigger it.
 */
const toolIconColumns: ColumnDef<ToolIconMapping>[] = [
  {
    accessorKey: 'iconDataUrl',
    header: () => <span className="p-1.5 pl-2.5">Icon</span>,
    cell: ({ row }) => (
      <div className="p-1.5 pl-2.5">
        <img
          src={row.original.iconDataUrl}
          alt={row.original.displayName}
          className="w-5 h-5 object-contain"
        />
      </div>
    ),
    size: 60,
    enableSorting: false,
  },
  {
    accessorKey: 'displayName',
    header: ({ column }) => <SortableHeader column={column} title="Tool" />,
    cell: ({ row }) => (
      <div className="p-1.5 pl-2.5 font-medium">
        {row.original.displayName}
      </div>
    ),
    size: 150,
  },
  {
    accessorKey: 'commands',
    header: () => <span className="p-1.5 pl-2.5">Commands</span>,
    cell: ({ row }) => (
      <div className="p-1.5 pl-2.5 flex flex-wrap gap-1">
        {row.original.commands.map(cmd => (
          <Info_Badge key={cmd} color="muted" className="font-mono">
            {cmd}
          </Info_Badge>
        ))}
      </div>
    ),
    meta: { fillWidth: true },
    enableSorting: false,
  },
]

// ============================================
// Main Component
// ============================================

export default function AppearanceSettingsPage() {
  const { mode, setMode, colorTheme, setColorTheme, font, setFont, activeWorkspaceId, setWorkspaceColorTheme } = useTheme()
  const { workspaces } = useAppShellContext()

  // Fetch workspace icons as data URLs (file:// URLs don't work in renderer)
  const workspaceIconMap = useWorkspaceIcons(workspaces)

  // Preset themes for the color theme dropdown
  const [presetThemes, setPresetThemes] = useState<PresetTheme[]>([])

  // Per-workspace theme overrides (workspaceId -> themeId or undefined)
  const [workspaceThemes, setWorkspaceThemes] = useState<Record<string, string | undefined>>({})

  // Tool icon mappings loaded from main process
  const [toolIcons, setToolIcons] = useState<ToolIconMapping[]>([])

  // Resolved path to tool-icons.json (needed for EditPopover and "Edit File" action)
  const [toolIconsJsonPath, setToolIconsJsonPath] = useState<string | null>(null)

  // Connection icon visibility toggle
  const [showConnectionIcons, setShowConnectionIcons] = useState(() =>
    storage.get(storage.KEYS.showConnectionIcons, true)
  )
  const handleConnectionIconsChange = useCallback((checked: boolean) => {
    setShowConnectionIcons(checked)
    storage.set(storage.KEYS.showConnectionIcons, checked)
  }, [])

  // Rich tool descriptions toggle (persisted in config.json, read by SDK subprocess)
  const [richToolDescriptions, setRichToolDescriptions] = useState(true)
  useEffect(() => {
    window.electronAPI?.getRichToolDescriptions?.().then(setRichToolDescriptions)
  }, [])
  const handleRichToolDescriptionsChange = useCallback(async (checked: boolean) => {
    setRichToolDescriptions(checked)
    await window.electronAPI?.setRichToolDescriptions?.(checked)
  }, [])

  const [chatTypography, setChatTypography] = useState<ChatTypographyPreference>(DEFAULT_CHAT_TYPOGRAPHY)
  const [chatFontFamilyInput, setChatFontFamilyInput] = useState(DEFAULT_CHAT_TYPOGRAPHY.fontFamily)
  const [chatFontSizeInput, setChatFontSizeInput] = useState(String(DEFAULT_CHAT_TYPOGRAPHY.fontSize))
  const [chatLineHeightInput, setChatLineHeightInput] = useState(String(DEFAULT_CHAT_TYPOGRAPHY.lineHeight))
  const [chatFontSizeError, setChatFontSizeError] = useState<string | undefined>()
  const [chatLineHeightError, setChatLineHeightError] = useState<string | undefined>()
  const [chatCompletionSound, setChatCompletionSound] = useState<ChatCompletionSoundPreference>(DEFAULT_CHAT_COMPLETION_SOUND)

  useEffect(() => {
    let cancelled = false
    readChatTypographyPreference().then((preferences) => {
      if (cancelled) return
      setChatTypography(preferences)
      setChatFontFamilyInput(preferences.fontFamily)
      setChatFontSizeInput(String(preferences.fontSize))
      setChatLineHeightInput(String(preferences.lineHeight))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    readChatCompletionSoundPreference().then((preferences) => {
      if (!cancelled) {
        setChatCompletionSound(preferences)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const saveChatTypography = useCallback(async (next: ChatTypographyPreference) => {
    setChatTypography(next)
    await writeChatTypographyPreference(next)
  }, [])

  const saveChatCompletionSound = useCallback(async (next: ChatCompletionSoundPreference) => {
    setChatCompletionSound(next)
    await writeChatCompletionSoundPreference(next)
  }, [])

  const handleChatCompletionSoundEnabledChange = useCallback((checked: boolean) => {
    void saveChatCompletionSound({ ...chatCompletionSound, enabled: checked })
  }, [chatCompletionSound, saveChatCompletionSound])

  const handleChatCompletionSoundIdChange = useCallback((value: string) => {
    const soundId = value as ChatCompletionSoundId
    void saveChatCompletionSound({ ...chatCompletionSound, soundId })
  }, [chatCompletionSound, saveChatCompletionSound])

  const handlePreviewChatCompletionSound = useCallback(() => {
    void playChatCompletionSound(chatCompletionSound.soundId)
  }, [chatCompletionSound.soundId])

  const handleChatFontFamilyCommit = useCallback(() => {
    const nextFamily = chatFontFamilyInput.trim()
    setChatFontFamilyInput(nextFamily)
    if (nextFamily === chatTypography.fontFamily) return
    void saveChatTypography({ ...chatTypography, fontFamily: nextFamily })
  }, [chatFontFamilyInput, chatTypography, saveChatTypography])

  const handleChatFontSizeCommit = useCallback(() => {
    const parsed = parsePositiveNumber(chatFontSizeInput)
    if (parsed === null) {
      setChatFontSizeError('Please enter a number greater than 0.')
      return
    }

    setChatFontSizeError(undefined)
    const nextFontSize = Math.round(parsed)
    setChatFontSizeInput(String(nextFontSize))
    if (nextFontSize === chatTypography.fontSize) return
    void saveChatTypography({ ...chatTypography, fontSize: nextFontSize })
  }, [chatFontSizeInput, chatTypography, saveChatTypography])

  const handleChatLineHeightCommit = useCallback(() => {
    const parsed = parsePositiveNumber(chatLineHeightInput)
    if (parsed === null) {
      setChatLineHeightError('Please enter a number greater than 0.')
      return
    }

    setChatLineHeightError(undefined)
    const nextLineHeight = Math.round(parsed * 100) / 100
    setChatLineHeightInput(String(nextLineHeight))
    if (nextLineHeight === chatTypography.lineHeight) return
    void saveChatTypography({ ...chatTypography, lineHeight: nextLineHeight })
  }, [chatLineHeightInput, chatTypography, saveChatTypography])

  // Load preset themes on mount
  useEffect(() => {
    const loadThemes = async () => {
      if (!window.electronAPI) {
        setPresetThemes([])
        return
      }
      try {
        const themes = await window.electronAPI.loadPresetThemes()
        setPresetThemes(themes)
      } catch (error) {
        console.error('Failed to load preset themes:', error)
        setPresetThemes([])
      }
    }
    loadThemes()
  }, [])

  // Load workspace themes on mount
  useEffect(() => {
    const loadWorkspaceThemes = async () => {
      if (!window.electronAPI?.getAllWorkspaceThemes) return
      try {
        const themes = await window.electronAPI.getAllWorkspaceThemes()
        setWorkspaceThemes(themes)
      } catch (error) {
        console.error('Failed to load workspace themes:', error)
      }
    }
    loadWorkspaceThemes()
  }, [])

  // Load tool icon mappings and resolve the config file path on mount
  useEffect(() => {
    const load = async () => {
      if (!window.electronAPI) return
      try {
        const [mappings, homeDir] = await Promise.all([
          window.electronAPI.getToolIconMappings(),
          window.electronAPI.getHomeDir(),
        ])
        setToolIcons(mappings)
        setToolIconsJsonPath(`${homeDir}/.craft-agent/tool-icons/tool-icons.json`)
      } catch (error) {
        console.error('Failed to load tool icon mappings:', error)
      }
    }
    load()
  }, [])

  // Handler for workspace theme change
  // Uses ThemeContext for the active workspace (immediate visual update) and IPC for other workspaces
  const handleWorkspaceThemeChange = useCallback(
    async (workspaceId: string, value: string) => {
      // 'default' means inherit from app default (null in storage)
      const themeId = value === 'default' ? null : value

      // If changing the current workspace, use context for immediate update
      if (workspaceId === activeWorkspaceId) {
        setWorkspaceColorTheme(themeId)
      } else {
        // For other workspaces, just persist via IPC
        await window.electronAPI?.setWorkspaceColorTheme?.(workspaceId, themeId)
      }

      // Update local state for UI
      setWorkspaceThemes(prev => ({
        ...prev,
        [workspaceId]: themeId ?? undefined
      }))
    },
    [activeWorkspaceId, setWorkspaceColorTheme]
  )

  // Theme options for dropdowns
  const themeOptions = useMemo(() => [
    { value: 'default', label: 'Default' },
    ...presetThemes
      .filter(t => t.id !== 'default')
      .map(t => ({
        value: t.id,
        label: t.theme.name || t.id,
      })),
  ], [presetThemes])

  // Get current app default theme label for display (null when using 'default' to avoid redundant "Use Default (Default)")
  const appDefaultLabel = useMemo(() => {
    if (colorTheme === 'default') return null
    const preset = presetThemes.find(t => t.id === colorTheme)
    return preset?.theme.name || colorTheme
  }, [colorTheme, presetThemes])

  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        title="Appearance"
        actions={<HeaderMenu route={routes.view.settings('appearance')} helpFeature="themes" />}
      />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            <div className="space-y-8">

              {/* Default Theme */}
              <SettingsSection title="Default Theme">
                <SettingsCard>
                  <SettingsRow label="Mode">
                    <SettingsSegmentedControl
                      value={mode}
                      onValueChange={setMode}
                      options={[
                        { value: 'system', label: 'System', icon: <Monitor className="w-4 h-4" /> },
                        { value: 'light', label: 'Light', icon: <Sun className="w-4 h-4" /> },
                        { value: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" /> },
                      ]}
                    />
                  </SettingsRow>
                  <SettingsRow label="Color theme">
                    <SettingsMenuSelect
                      value={colorTheme}
                      onValueChange={setColorTheme}
                      options={themeOptions}
                    />
                  </SettingsRow>
                  <SettingsRow label="Font">
                    <SettingsSegmentedControl
                      value={font}
                      onValueChange={setFont}
                      options={[
                        { value: 'inter', label: 'Inter' },
                        { value: 'system', label: 'System' },
                      ]}
                    />
                  </SettingsRow>
                </SettingsCard>
              </SettingsSection>

              {/* Chat Typography */}
              <SettingsSection
                title="Chat Typography"
                description="Customize chat message text and tool card readability."
              >
                <SettingsCard divided>
                  <SettingsInput
                    label="Chat Font Family"
                    description="Enter a font family name (for example: Inter, SF Pro Text, JetBrains Mono)."
                    value={chatFontFamilyInput}
                    onChange={setChatFontFamilyInput}
                    onBlur={handleChatFontFamilyCommit}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleChatFontFamilyCommit()
                      }
                    }}
                    placeholder="System default"
                    inCard
                  />
                  <SettingsInput
                    label="Chat Font Size"
                    description="Size in pixels."
                    value={chatFontSizeInput}
                    onChange={(value) => {
                      setChatFontSizeInput(value)
                      setChatFontSizeError(undefined)
                    }}
                    onBlur={handleChatFontSizeCommit}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleChatFontSizeCommit()
                      }
                    }}
                    error={chatFontSizeError}
                    placeholder="13"
                    inCard
                  />
                  <SettingsInput
                    label="Chat Line Height"
                    description="Relative line height (for example: 1.6)."
                    value={chatLineHeightInput}
                    onChange={(value) => {
                      setChatLineHeightInput(value)
                      setChatLineHeightError(undefined)
                    }}
                    onBlur={handleChatLineHeightCommit}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleChatLineHeightCommit()
                      }
                    }}
                    error={chatLineHeightError}
                    placeholder="1.6"
                    inCard
                  />
                </SettingsCard>
              </SettingsSection>

              {/* Chat Completion Sound */}
              <SettingsSection
                title="Chat Completion Sound"
                description="Play a short cue when a chat run finishes in the background."
              >
                <SettingsCard>
                  <SettingsToggle
                    label="Play completion sound"
                    description="Enabled by default. Plays only when this window is not focused."
                    checked={chatCompletionSound.enabled}
                    onCheckedChange={handleChatCompletionSoundEnabledChange}
                  />
                  <SettingsRow
                    label="Completion sound"
                    description="Choose one of the built-in prompt sounds."
                    action={
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handlePreviewChatCompletionSound}
                        aria-label="Preview completion sound"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        Preview
                      </Button>
                    }
                  >
                    <SettingsMenuSelect
                      value={chatCompletionSound.soundId}
                      onValueChange={handleChatCompletionSoundIdChange}
                      options={CHAT_COMPLETION_SOUND_OPTIONS.map(({ id, label, description }) => ({
                        value: id,
                        label,
                        description,
                      }))}
                      searchable={false}
                      menuWidth={260}
                    />
                  </SettingsRow>
                </SettingsCard>
              </SettingsSection>

              {/* Workspace Themes */}
              {workspaces.length > 0 && (
                <SettingsSection
                  title="Workspace Themes"
                  description="Override theme settings per workspace"
                >
                  <SettingsCard>
                    {workspaces.map((workspace) => {
                      const wsTheme = workspaceThemes[workspace.id]
                      const hasCustomTheme = wsTheme !== undefined
                      return (
                        <SettingsRow
                          key={workspace.id}
                          label={
                            <div className="flex items-center gap-2">
                              {workspaceIconMap.get(workspace.id) ? (
                                <img
                                  src={workspaceIconMap.get(workspace.id)}
                                  alt=""
                                  className="w-4 h-4 rounded object-cover"
                                />
                              ) : (
                                <div className="w-4 h-4 rounded bg-foreground/10" />
                              )}
                              <span>{workspace.name}</span>
                            </div>
                          }
                        >
                          <SettingsMenuSelect
                            value={hasCustomTheme ? wsTheme : 'default'}
                            onValueChange={(value) => handleWorkspaceThemeChange(workspace.id, value)}
                            options={[
                              { value: 'default', label: appDefaultLabel ? `Use Default (${appDefaultLabel})` : 'Use Default' },
                              ...presetThemes
                                .filter(t => t.id !== 'default')
                                .map(t => ({
                                  value: t.id,
                                  label: t.theme.name || t.id,
                                })),
                            ]}
                          />
                        </SettingsRow>
                      )
                    })}
                  </SettingsCard>
                </SettingsSection>
              )}

              {/* Interface */}
              <SettingsSection title="Interface">
                <SettingsCard>
                  <SettingsToggle
                    label="Connection icons"
                    description="Show provider icons in the session list and model selector"
                    checked={showConnectionIcons}
                    onCheckedChange={handleConnectionIconsChange}
                  />
                  <SettingsToggle
                    label="Rich tool descriptions"
                    description="Add action names and intent descriptions to all tool calls. Provides richer activity context in sessions."
                    checked={richToolDescriptions}
                    onCheckedChange={handleRichToolDescriptionsChange}
                  />
                </SettingsCard>
              </SettingsSection>

              {/* Tool Icons — shows the command → icon mapping used in turn cards */}
              <SettingsSection
                title="Tool Icons"
                description="Icons shown next to CLI commands in chat activity. Stored in ~/.craft-agent/tool-icons/."
                action={
                  toolIconsJsonPath ? (
                    <EditPopover
                      trigger={<EditButton />}
                      {...getEditConfig('edit-tool-icons', toolIconsJsonPath)}
                      secondaryAction={{
                        label: 'Edit File',
                        filePath: toolIconsJsonPath,
                      }}
                    />
                  ) : undefined
                }
              >
                <SettingsCard>
                  <Info_DataTable
                    columns={toolIconColumns}
                    data={toolIcons}
                    searchable={{ placeholder: 'Search tools...' }}
                    maxHeight={480}
                    emptyContent="No tool icon mappings found"
                  />
                </SettingsCard>
              </SettingsSection>

            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
