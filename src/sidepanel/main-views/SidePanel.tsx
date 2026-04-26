import { useEffect, useState, useRef } from 'react'
import { X, Settings2 } from 'lucide-react'

import './SidePanel.css'
import migrateScheme from '@/migrations'
import LiveManagement from './live'
import Layout from './layout'
import Tabs from '@/components/ui/tabs'
import { TAB_MENU } from '@/constants'
import { ETabMenu } from '@/enums'
import GroupManagement from './group-management'
import AutomationManagement from './automation-management'
import { LiveStatusBar } from './live/components/LiveStatusBar'
import StorageLocal from '@/storage/local'

type ThemeMode = 'light' | 'dark' | 'system' | 'glass'
type ResolvedTheme = 'light' | 'dark' | 'glass'
type GlassStyle =
  | 'frosted-light'
  | 'aurora-dark'
  | 'minimal-clear'
  | 'warm-glass'
  | 'monochrome-glass'

const THEME_STORAGE_KEY = 'themeMode'
const GLASS_STYLE_STORAGE_KEY = 'glassStyle'
const THEME_HARNESS_QUERY_KEY = 'codex-harness'
const THEME_HARNESS_MODE = 'theme-modes'
const DEFAULT_GLASS_STYLE: GlassStyle = 'frosted-light'

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
  { value: 'glass', label: 'Glass' },
]

const GLASS_STYLE_OPTIONS: Array<{
  value: GlassStyle
  label: string
  shortLabel: string
  description: string
  accentLabel: string
}> = [
  {
    value: 'frosted-light',
    label: 'Frosted Light',
    shortLabel: 'Frosted',
    description: 'Bright, airy, and clean.',
    accentLabel: 'Clean glow',
  },
  {
    value: 'aurora-dark',
    label: 'Aurora Dark',
    shortLabel: 'Aurora',
    description: 'Dark aurora gradient with premium glow.',
    accentLabel: 'Cyber premium',
  },
  {
    value: 'minimal-clear',
    label: 'Minimal Clear',
    shortLabel: 'Minimal',
    description: 'Lower blur and easier readability.',
    accentLabel: 'Low blur',
  },
  {
    value: 'warm-glass',
    label: 'Warm Glass',
    shortLabel: 'Warm',
    description: 'Amber-tinted glass with softer warmth.',
    accentLabel: 'Warm tone',
  },
  {
    value: 'monochrome-glass',
    label: 'Monochrome Glass',
    shortLabel: 'Mono',
    description: 'Neutral grayscale glass with mature contrast.',
    accentLabel: 'Mono calm',
  },
]

export const SidePanel = () => {
  const [isMigrating, setIsMigrating] = useState(false)
  const [activeTab, setActiveTab] = useState<ETabMenu>(ETabMenu.TAB_SYNC)
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')
  const [glassStyle, setGlassStyle] = useState<GlassStyle>(DEFAULT_GLASS_STYLE)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef(0)

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true)
    dragStartY.current = e.clientY
    setDragY(0)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    const deltaY = e.clientY - dragStartY.current
    if (deltaY > 0) {
      setDragY(deltaY)
    }
  }

  const handlePointerUp = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 100) {
      setIsSettingsOpen(false)
    }
    setDragY(0)
  }

  useEffect(() => {
    setIsMigrating(true)
    migrateScheme().then(() => setIsMigrating(false))
  }, [])

  useEffect(() => {
    let isMounted = true

    StorageLocal.get<{
      [THEME_STORAGE_KEY]?: ThemeMode
      [GLASS_STYLE_STORAGE_KEY]?: GlassStyle
    }>([THEME_STORAGE_KEY, GLASS_STYLE_STORAGE_KEY]).then((data) => {
      if (!isMounted) return

      const storedThemeMode = data?.[THEME_STORAGE_KEY]
      const storedGlassStyle = data?.[GLASS_STYLE_STORAGE_KEY]

      if (storedThemeMode) {
        setThemeMode(storedThemeMode)
      }

      if (storedGlassStyle) {
        setGlassStyle(storedGlassStyle)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const applyResolvedTheme = () => {
      if (themeMode === 'glass') {
        setResolvedTheme('glass')
        return
      }

      if (themeMode === 'system') {
        setResolvedTheme(mediaQuery.matches ? 'dark' : 'light')
        return
      }

      setResolvedTheme(themeMode)
    }

    applyResolvedTheme()
    mediaQuery.addEventListener('change', applyResolvedTheme)

    return () => {
      mediaQuery.removeEventListener('change', applyResolvedTheme)
    }
  }, [themeMode])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolvedTheme === 'dark')
    root.setAttribute('data-theme', resolvedTheme)
    root.setAttribute('data-theme-mode', themeMode)
    root.setAttribute('data-glass-style', glassStyle)
  }, [glassStyle, resolvedTheme, themeMode])

  const handleThemeModeChange = async (nextThemeMode: ThemeMode) => {
    setThemeMode(nextThemeMode)
    await StorageLocal.set({ [THEME_STORAGE_KEY]: nextThemeMode })
  }

  const handleGlassStyleChange = async (nextGlassStyle: GlassStyle) => {
    setGlassStyle(nextGlassStyle)
    await StorageLocal.set({ [GLASS_STYLE_STORAGE_KEY]: nextGlassStyle })
  }

  const waitForThemeCommit = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get(THEME_HARNESS_QUERY_KEY) !== THEME_HARNESS_MODE) return

    window.__CRX_TAB_GROUPS_THEME_HARNESS__ = {
      async clearThemeMode() {
        await StorageLocal.set({
          [THEME_STORAGE_KEY]: 'system',
          [GLASS_STYLE_STORAGE_KEY]: DEFAULT_GLASS_STYLE,
        })
        setThemeMode('system')
        setGlassStyle(DEFAULT_GLASS_STYLE)
        await waitForThemeCommit()
      },
      async setThemeMode(nextThemeMode) {
        await handleThemeModeChange(nextThemeMode)
        await waitForThemeCommit()
      },
      async setGlassStyle(nextGlassStyle) {
        await handleGlassStyleChange(nextGlassStyle)
        await waitForThemeCommit()
      },
      async getThemeState() {
        const storedThemePrefs = await StorageLocal.get<{
          [THEME_STORAGE_KEY]?: ThemeMode
          [GLASS_STYLE_STORAGE_KEY]?: GlassStyle
        }>([THEME_STORAGE_KEY, GLASS_STYLE_STORAGE_KEY])

        return {
          themeMode,
          resolvedTheme,
          glassStyle,
          rootTheme: document.documentElement.getAttribute('data-theme'),
          rootThemeMode: document.documentElement.getAttribute('data-theme-mode'),
          rootGlassStyle: document.documentElement.getAttribute('data-glass-style'),
          isDarkClassApplied: document.documentElement.classList.contains('dark'),
          storedThemeMode: storedThemePrefs?.[THEME_STORAGE_KEY] ?? null,
          storedGlassStyle: storedThemePrefs?.[GLASS_STYLE_STORAGE_KEY] ?? null,
        }
      },
    }

    return () => {
      delete window.__CRX_TAB_GROUPS_THEME_HARNESS__
    }
  }, [glassStyle, resolvedTheme, themeMode])

  if (isMigrating) {
    return <div>Migrating...</div>
  }

  return (
    <Layout>
      <div className="sp-shell flex h-[100vh] w-full overflow-hidden rounded-[1.4rem] border border-[var(--sp-card-border)]">
        <div className="sp-shell-content flex h-full w-full flex-col overflow-hidden">
          <Tabs
            tabs={TAB_MENU}
            defaultValue={ETabMenu.TAB_SYNC}
            onValueChange={(val) => setActiveTab(Number(val) as ETabMenu)}
            className="flex-1 min-h-0"
            rightElement={
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="size-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--sp-card-hover)] transition-colors cursor-pointer"
                title="Appearance Settings"
              >
                <Settings2 size={15} />
              </button>
            }
          >
            <Tabs.Content value={ETabMenu.TAB_SYNC}>
              <LiveManagement />
            </Tabs.Content>
            <Tabs.Content value={ETabMenu.AUTOMATION}>
              <AutomationManagement />
            </Tabs.Content>
            <Tabs.Content value={ETabMenu.GROUP}>
              <GroupManagement />
            </Tabs.Content>
          </Tabs>

          <div className="sp-footer shrink-0">
            {activeTab === ETabMenu.TAB_SYNC && <LiveStatusBar />}
            {activeTab === ETabMenu.GROUP && (
              <footer className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider sp-footer-label">
                Saved Snapshots Management
              </footer>
            )}
            {activeTab === ETabMenu.AUTOMATION && (
              <footer className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider sp-footer-label">
                Automation Rules Management
              </footer>
            )}
          </div>
        </div>

        {/* Settings Bottom Sheet */}
        <div 
          className={`sp-sheet-backdrop ${isSettingsOpen ? 'sp-sheet-backdrop-open' : ''}`}
          onClick={() => setIsSettingsOpen(false)}
        />
        <div 
          className={`sp-sheet ${isSettingsOpen ? 'sp-sheet-open' : ''}`}
          style={{ 
            transform: isSettingsOpen 
              ? `translateY(${dragY}px)` 
              : 'translateY(100%)',
            transition: isDragging ? 'none' : undefined
          }}
        >
          <div 
            className="sp-sheet-header cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div className="sp-sheet-handle" />
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-primary)]">
                  Appearance
                </h2>
                <p className="text-[10px] text-[var(--text-muted)]">Customize your experience</p>
              </div>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="size-7 flex items-center justify-center rounded-full hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
              >
                <X size={14} className="text-[var(--text-muted)]" />
              </button>
            </div>
          </div>

          <div className="sp-sheet-content">
            <div className="px-5 py-4">
              {/* Theme Mode Selection */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] sp-footer-label">
                      Theme Mode
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {themeMode === 'system'
                        ? `Following ${resolvedTheme}`
                        : `${themeMode[0].toUpperCase()}${themeMode.slice(1)} active`}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      data-active={themeMode === option.value}
                      className="sp-theme-chip rounded-xl py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] flex flex-col items-center gap-1 border border-[var(--sp-card-border)] bg-[var(--surface-elevated)] cursor-pointer"
                      onClick={() => void handleThemeModeChange(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Glass Style Selection (Only if Glass mode is active) */}
              <div className={`transition-opacity duration-300 ${themeMode === 'glass' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] sp-footer-label">
                      Glass Style
                    </p>
                    <p className="truncate text-[11px] text-[var(--text-secondary)]">
                      {GLASS_STYLE_OPTIONS.find((option) => option.value === glassStyle)?.description}
                    </p>
                  </div>
                  <div className="rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] sp-chip sp-glass-style-accent">
                    {GLASS_STYLE_OPTIONS.find((option) => option.value === glassStyle)?.accentLabel}
                  </div>
                </div>

                <div className="sp-glass-style-grid">
                  {GLASS_STYLE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      data-active={glassStyle === option.value}
                      data-glass-style-card={option.value}
                      className="sp-glass-style-card"
                      onClick={() => void handleGlassStyleChange(option.value)}
                    >
                      <span className="sp-glass-style-preview" aria-hidden="true">
                        <span className="sp-glass-style-preview-shell" />
                        <span className="sp-glass-style-preview-card" />
                        <span className="sp-glass-style-preview-chip" />
                      </span>
                      <span className="sp-glass-style-copy">
                        <span className="sp-glass-style-title-row">
                          <span className="sp-glass-style-title">{option.label}</span>
                          <span className="sp-glass-style-badge">{option.shortLabel}</span>
                        </span>
                        <span className="sp-glass-style-description">{option.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default SidePanel

declare global {
  interface Window {
    __CRX_TAB_GROUPS_THEME_HARNESS__?: {
      clearThemeMode: () => Promise<void>
      setThemeMode: (nextThemeMode: ThemeMode) => Promise<void>
      setGlassStyle: (nextGlassStyle: GlassStyle) => Promise<void>
      getThemeState: () => Promise<{
        themeMode: ThemeMode
        resolvedTheme: ResolvedTheme
        glassStyle: GlassStyle
        rootTheme: string | null
        rootThemeMode: string | null
        rootGlassStyle: string | null
        isDarkClassApplied: boolean
        storedThemeMode: ThemeMode | null
        storedGlassStyle: GlassStyle | null
      }>
    }
  }
}
