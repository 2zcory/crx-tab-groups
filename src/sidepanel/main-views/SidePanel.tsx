import { useEffect, useState } from 'react'

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
type GlassStyle = 'frosted-light' | 'aurora-dark' | 'minimal-clear'

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

const GLASS_STYLE_OPTIONS: Array<{ value: GlassStyle; label: string; description: string }> = [
  {
    value: 'frosted-light',
    label: 'Frosted Light',
    description: 'Bright, airy, and clean.',
  },
  {
    value: 'aurora-dark',
    label: 'Aurora Dark',
    description: 'Dark aurora gradient with premium glow.',
  },
  {
    value: 'minimal-clear',
    label: 'Minimal Clear',
    description: 'Lower blur and easier readability.',
  },
]

export const SidePanel = () => {
  const [isMigrating, setIsMigrating] = useState(false)
  const [activeTab, setActiveTab] = useState<ETabMenu>(ETabMenu.TAB_SYNC)
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')
  const [glassStyle, setGlassStyle] = useState<GlassStyle>(DEFAULT_GLASS_STYLE)

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

            <div className="flex items-center justify-between gap-3 border-t border-[var(--sp-footer-border)] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] sp-footer-label">
                  Theme
                </p>
                <p className="truncate text-[11px] text-[var(--text-secondary)]">
                  {themeMode === 'system'
                    ? `Following ${resolvedTheme}`
                    : themeMode === 'glass'
                      ? `${GLASS_STYLE_OPTIONS.find((option) => option.value === glassStyle)?.label || 'Glass'} active`
                    : `${themeMode[0].toUpperCase()}${themeMode.slice(1)} active`}
                </p>
              </div>

              <div className="sp-theme-bar">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    data-active={themeMode === option.value}
                    className="sp-theme-chip rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
                    onClick={() => void handleThemeModeChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {themeMode === 'glass' && (
              <div className="flex items-center justify-between gap-3 border-t border-[var(--sp-footer-border)] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] sp-footer-label">
                    Glass Style
                  </p>
                  <p className="truncate text-[11px] text-[var(--text-secondary)]">
                    {GLASS_STYLE_OPTIONS.find((option) => option.value === glassStyle)?.description}
                  </p>
                </div>

                <div className="sp-theme-bar">
                  {GLASS_STYLE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      data-active={glassStyle === option.value}
                      className="sp-theme-chip rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
                      onClick={() => void handleGlassStyleChange(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
