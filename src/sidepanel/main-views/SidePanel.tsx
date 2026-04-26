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

const THEME_STORAGE_KEY = 'themeMode'
const THEME_HARNESS_QUERY_KEY = 'codex-harness'
const THEME_HARNESS_MODE = 'theme-modes'

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
  { value: 'glass', label: 'Glass' },
]

export const SidePanel = () => {
  const [isMigrating, setIsMigrating] = useState(false)
  const [activeTab, setActiveTab] = useState<ETabMenu>(ETabMenu.TAB_SYNC)
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')

  useEffect(() => {
    setIsMigrating(true)
    migrateScheme().then(() => setIsMigrating(false))
  }, [])

  useEffect(() => {
    let isMounted = true

    StorageLocal.get<{ [THEME_STORAGE_KEY]?: ThemeMode }>(THEME_STORAGE_KEY).then((data) => {
      const storedThemeMode = data?.[THEME_STORAGE_KEY]
      if (!isMounted || !storedThemeMode) return
      setThemeMode(storedThemeMode)
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
  }, [resolvedTheme, themeMode])

  const handleThemeModeChange = async (nextThemeMode: ThemeMode) => {
    setThemeMode(nextThemeMode)
    await StorageLocal.set({ [THEME_STORAGE_KEY]: nextThemeMode })
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
        await StorageLocal.set({ [THEME_STORAGE_KEY]: 'system' })
        setThemeMode('system')
        await waitForThemeCommit()
      },
      async setThemeMode(nextThemeMode) {
        await handleThemeModeChange(nextThemeMode)
        await waitForThemeCommit()
      },
      async getThemeState() {
        const storedThemeMode = await StorageLocal.get<{ [THEME_STORAGE_KEY]?: ThemeMode }>(
          THEME_STORAGE_KEY,
        )

        return {
          themeMode,
          resolvedTheme,
          rootTheme: document.documentElement.getAttribute('data-theme'),
          rootThemeMode: document.documentElement.getAttribute('data-theme-mode'),
          isDarkClassApplied: document.documentElement.classList.contains('dark'),
          storedThemeMode: storedThemeMode?.[THEME_STORAGE_KEY] ?? null,
        }
      },
    }

    return () => {
      delete window.__CRX_TAB_GROUPS_THEME_HARNESS__
    }
  }, [resolvedTheme, themeMode])

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
      getThemeState: () => Promise<{
        themeMode: ThemeMode
        resolvedTheme: ResolvedTheme
        rootTheme: string | null
        rootThemeMode: string | null
        isDarkClassApplied: boolean
        storedThemeMode: ThemeMode | null
      }>
    }
  }
}
