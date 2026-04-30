import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Settings2 } from 'lucide-react'

import './SidePanel.css'
import migrateScheme from '@/migrations'
import LiveManagement, { LiveManagementHandle } from './live'
import Layout from './layout'
import Tabs from '@/components/ui/tabs'
import { TAB_MENU } from '@/constants'
import { ETabMenu } from '@/enums'
import GroupManagement, {
  GroupManagementHandle,
  SavedRestoreHarnessFaultMode,
  SavedRestoreHarnessState,
} from './group-management'
import AutomationManagement from './automation-management'
import { LiveStatusBar } from './live/components/LiveStatusBar'
import StorageLocal from '@/storage/local'
import StorageSyncAutoGroup from '@/storage/autoGroup.sync'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import {
  getAutoGroupRulePatterns,
  normalizeAutoGroupPattern,
  sortAutoGroupRules,
  validateAutoGroupRulePattern,
} from '@/helpers'

import {
  AddToRulesDraft,
  AutoGroupScanStatus,
  AutoGroupScanResponse,
  QuickRuleSourceGroup,
  buildAddToRulesDraft,
  getSelectableAutoGroupRules,
  LiveAddToRulesHarnessDraftOption,
  LiveAddToRulesHarnessSeedResult,
  LiveAddToRulesHarnessState,
  LiveThemeSmokeHarnessState,
  LIVE_ADD_TO_RULES_HARNESS_MODE,
  LIVE_HARNESS_QUERY_KEY,
  NEW_RULE_DESTINATION_ID,
  triggerAutoGroupScan,
} from './live/add-to-rules'
import { LiveAddToRulesSheetContent } from './live/components/LiveAddToRulesSheetContent'

type ThemeMode = 'light' | 'dark' | 'system' | 'glass'
type ResolvedTheme = 'light' | 'dark' | 'glass'
type GlassStyle =
  | 'frosted-light'
  | 'aurora-dark'
  | 'minimal-clear'
  | 'warm-glass'
  | 'monochrome-glass'

type SidePanelSheetState =
  | { kind: 'appearance' }
  | { kind: 'live-add-to-rules'; payload: AddToRulesDraft }
  | null

const THEME_STORAGE_KEY = 'themeMode'
const GLASS_STYLE_STORAGE_KEY = 'glassStyle'
const THEME_HARNESS_QUERY_KEY = 'codex-harness'
const THEME_HARNESS_MODE = 'theme-modes'
const SAVED_RESTORE_HARNESS_MODE = 'saved-restore'
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
    __CRX_TAB_GROUPS_HARNESS__?: {
      seedAddToRulesScenario: () => Promise<LiveAddToRulesHarnessSeedResult>
      getExampleTabDraftOptions: () => Promise<LiveAddToRulesHarnessDraftOption[]>
      applyExampleTabToRule: (
        destinationRuleId: string,
      ) => Promise<{
        success: boolean
        scanResponse: AutoGroupScanResponse
        pattern: string
      }>
      getAddToRulesState: () => Promise<LiveAddToRulesHarnessState>
      showThemeSmokeState: () => Promise<LiveThemeSmokeHarnessState>
      seedSavedRestoreScenario: (
        scenario: 'partial' | 'failed' | 'group-setup',
      ) => Promise<{
        groupId: string
        scenario: 'partial' | 'failed' | 'group-setup'
      }>
      runSavedRestore: (
        groupId: string,
        faultMode?: SavedRestoreHarnessFaultMode,
      ) => Promise<void>
      getSavedRestoreState: (groupId: string) => Promise<SavedRestoreHarnessState>
    }
  }
}

export const SidePanel = () => {
  const [isMigrating, setIsMigrating] = useState(false)
  const [activeTab, setActiveTab] = useState<ETabMenu>(ETabMenu.TAB_SYNC)
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')
  const [glassStyle, setGlassStyle] = useState<GlassStyle>(DEFAULT_GLASS_STYLE)
  const [activeSheet, setActiveSheet] = useState<SidePanelSheetState>(null)
  const [autoGroupRules, setAutoGroupRules] = useState<NStorage.Sync.Schema.AutoGroupRule[]>([])
  const [addToRulesStatus, setAddToRulesStatus] = useState<AutoGroupScanStatus>({ tone: 'idle' })

  const liveManagementRef = useRef<LiveManagementHandle | null>(null)
  const groupManagementRef = useRef<GroupManagementHandle | null>(null)
  const harnessMode = useMemo(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get(LIVE_HARNESS_QUERY_KEY)
  }, [])

  const fetchAutoGroupRules = useCallback(async () => {
    const rules = await StorageSyncAutoGroup.getList()
    setAutoGroupRules(getSelectableAutoGroupRules(rules))
  }, [])

  useEffect(() => {
    setIsMigrating(true)
    migrateScheme()
      .finally(() => setIsMigrating(false))
  }, [])

  useEffect(() => {
    void fetchAutoGroupRules()
  }, [fetchAutoGroupRules])

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const harness = searchParams.get(THEME_HARNESS_QUERY_KEY)
    if (harness === THEME_HARNESS_MODE) {
      setActiveSheet({ kind: 'appearance' })
    } else if (harness === SAVED_RESTORE_HARNESS_MODE) {
      setActiveTab(ETabMenu.GROUP)
    }

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

  const reportLiveStatus = useCallback((tone: 'idle' | 'success' | 'warning' | 'error', message?: string) => {
    liveManagementRef.current?.setAutoGroupScanStatus({ tone, message })
  }, [])

  const openAppearanceSheet = useCallback(() => {
    setActiveSheet({ kind: 'appearance' })
  }, [])

  const closeSheet = useCallback(() => {
    setActiveSheet(null)
    setAddToRulesStatus({ tone: 'idle' })
  }, [])

  const openLiveAddToRules = useCallback(
    (tab: chrome.tabs.Tab, sourceGroup?: QuickRuleSourceGroup) => {
      const draft = buildAddToRulesDraft(tab, autoGroupRules, sourceGroup)

      if (!draft) {
        reportLiveStatus('warning', 'Cannot add this tab URL to Rules')
        return
      }

      setAddToRulesStatus({ tone: 'idle' })
      setActiveSheet({ kind: 'live-add-to-rules', payload: draft })
    },
    [autoGroupRules, reportLiveStatus],
  )

  const updateLiveAddToRulesDraft = useCallback((patch: Partial<AddToRulesDraft>) => {
    setActiveSheet((current) =>
      current?.kind === 'live-add-to-rules'
        ? { kind: 'live-add-to-rules', payload: { ...current.payload, ...patch } }
        : current,
    )
  }, [])

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

  const waitForSidePanelCommit = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })

  const seedSavedRestoreScenario = useCallback(
    async (scenario: 'partial' | 'failed' | 'group-setup') => {
      const existingTabs = await chrome.tabs.query({})
      const tabsToClose = existingTabs
        .filter((tab) => tab.id && !tab.url?.startsWith('chrome-extension://'))
        .map((tab) => tab.id as number)

      if (tabsToClose.length > 0) {
        await chrome.tabs.remove(tabsToClose)
      }

      await chrome.storage.sync.clear()
      await chrome.storage.local.clear()

      const now = new Date().toISOString()
      const groupId = `saved-restore-${scenario}`
      const group: NStorage.Sync.Schema.Group = {
        id: groupId,
        title:
          scenario === 'partial'
            ? 'Partial Restore Harness'
            : scenario === 'failed'
              ? 'Failed Restore Harness'
              : 'Group Setup Failure Harness',
        color: scenario === 'failed' ? 'red' : 'blue',
        order: 1,
        createdAt: now,
        updatedAt: now,
      }

      const tabsByScenario: Record<typeof scenario, NStorage.Sync.Schema.Tab[]> = {
        partial: [
          {
            id: `${groupId}-tab-1`,
            title: 'Restorable Example',
            url: 'https://example.com/',
            order: 1,
            groupId,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: `${groupId}-tab-2`,
            title: 'Missing URL Snapshot',
            order: 2,
            groupId,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: `${groupId}-tab-3`,
            title: 'Unsupported Internal URL',
            url: 'chrome://settings',
            order: 3,
            groupId,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: `${groupId}-tab-4`,
            title: 'Recovered Blank Tab',
            url: 'about:blank',
            isRepaired: true,
            order: 4,
            groupId,
            createdAt: now,
            updatedAt: now,
          },
        ],
        failed: [
          {
            id: `${groupId}-tab-1`,
            title: 'Missing URL Snapshot',
            order: 1,
            groupId,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: `${groupId}-tab-2`,
            title: 'Unsupported Internal URL',
            url: 'chrome://extensions',
            order: 2,
            groupId,
            createdAt: now,
            updatedAt: now,
          },
        ],
        'group-setup': [
          {
            id: `${groupId}-tab-1`,
            title: 'Restorable Example',
            url: 'https://example.org/',
            order: 1,
            groupId,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }

      await chrome.storage.sync.set({
        autoGroups: [],
        groups: [group],
        tabs: tabsByScenario[scenario],
      })

      setActiveTab(ETabMenu.GROUP)
      setActiveSheet(null)
      setAddToRulesStatus({ tone: 'idle' })
      await waitForSidePanelCommit()
      await groupManagementRef.current?.refreshSavedGroups()

      return { groupId, scenario }
    },
    [],
  )

  const submitLiveAddToRules = useCallback(async () => {
    if (activeSheet?.kind !== 'live-add-to-rules') return

    const addToRulesDraft = activeSheet.payload
    const normalizedPattern = normalizeAutoGroupPattern(addToRulesDraft.patternDraft)
    const validation = validateAutoGroupRulePattern(normalizedPattern)

    if (!validation.isValid) {
      setAddToRulesStatus({
        tone: 'warning',
        message: validation.error || 'Rule pattern is invalid',
      })
      return
    }

    const title = addToRulesDraft.newRuleTitle.trim()

    if (addToRulesDraft.destinationRuleId === NEW_RULE_DESTINATION_ID && !title) {
      setAddToRulesStatus({
        tone: 'warning',
        message: 'Rule title is required',
      })
      return
    }

    try {
      setAddToRulesStatus({ tone: 'idle' })
      const currentRules = sortAutoGroupRules(await StorageSyncAutoGroup.getList())
      const selectableRules = getSelectableAutoGroupRules(currentRules)
      const selectedRule =
        addToRulesDraft.destinationRuleId === NEW_RULE_DESTINATION_ID
          ? null
          : selectableRules.find((rule) => rule.id === addToRulesDraft.destinationRuleId)

      if (addToRulesDraft.destinationRuleId !== NEW_RULE_DESTINATION_ID && !selectedRule) {
        setAddToRulesStatus({
          tone: 'warning',
          message: 'Selected active rule is no longer available',
        })
        await fetchAutoGroupRules()
        return
      }

      if (selectedRule) {
        const duplicatePattern = getAutoGroupRulePatterns(selectedRule).some(
          (pattern) => pattern.toLowerCase() === validation.normalizedPattern.toLowerCase(),
        )

        if (duplicatePattern) {
          setAddToRulesStatus({
            tone: 'warning',
            message: `Pattern already exists in ${selectedRule.title}`,
          })
          return
        }

        await StorageSyncAutoGroup.update({
          ...selectedRule,
          urlPatterns: [...getAutoGroupRulePatterns(selectedRule), validation.normalizedPattern],
        })
      } else {
        const existingExactRule = currentRules.some((rule) => {
          const existingPatterns = getAutoGroupRulePatterns(rule).map((item) => item.toLowerCase())

          return (
            rule.title.trim().toLowerCase() === title.toLowerCase() &&
            existingPatterns.includes(validation.normalizedPattern.toLowerCase())
          )
        })

        if (existingExactRule) {
          setAddToRulesStatus({
            tone: 'warning',
            message: `Pattern already exists under ${title}`,
          })
          return
        }

        const conflictingGroupIdentity = currentRules.some(
          (rule) =>
            rule.title.trim().toLowerCase() === title.toLowerCase() &&
            rule.color !== addToRulesDraft.newRuleColor,
        )

        if (conflictingGroupIdentity) {
          setAddToRulesStatus({
            tone: 'warning',
            message: `Rule title "${title}" already uses another color`,
          })
          return
        }

        const now = new Date().toISOString()
        const rule: NStorage.Sync.Schema.AutoGroupRule = {
          id: crypto.randomUUID(),
          title,
          color: addToRulesDraft.newRuleColor,
          order: currentRules.length + 1,
          urlPatterns: [validation.normalizedPattern],
          isActive: true,
          createdAt: now,
        }

        await StorageSyncAutoGroup.create(rule)
      }

      const scanResponse = await triggerAutoGroupScan()
      await fetchAutoGroupRules()
      await liveManagementRef.current?.refreshActiveGroups()

      const savedMessage =
        addToRulesDraft.destinationRuleId === NEW_RULE_DESTINATION_ID
          ? `Rule created for ${validation.normalizedPattern}`
          : `Pattern added: ${validation.normalizedPattern}`

      setActiveSheet(null)
      setAddToRulesStatus({ tone: 'idle' })

      if (!scanResponse.success) {
        reportLiveStatus('warning', `${savedMessage}. Auto-group scan failed.`)
      } else if (scanResponse.summary?.grouped && scanResponse.summary.grouped > 0) {
        reportLiveStatus(
          'success',
          `${savedMessage}. Grouped ${scanResponse.summary.grouped} tab${scanResponse.summary.grouped === 1 ? '' : 's'}.`,
        )
      } else if (scanResponse.summary?.alreadyGrouped && scanResponse.summary.alreadyGrouped > 0) {
        reportLiveStatus(
          'success',
          `${savedMessage}. Matching tab${scanResponse.summary.alreadyGrouped === 1 ? '' : 's'} already grouped.`,
        )
      } else {
        reportLiveStatus('warning', `${savedMessage}. No matching tabs were grouped.`)
      }
    } catch (error) {
      console.error(error)
      setAddToRulesStatus({
        tone: 'error',
        message: 'Add to Rules failed',
      })
    }
  }, [activeSheet, fetchAutoGroupRules, reportLiveStatus])

  useEffect(() => {
    const harness = new URLSearchParams(window.location.search).get(THEME_HARNESS_QUERY_KEY)
    if (harness !== THEME_HARNESS_MODE && harness !== LIVE_ADD_TO_RULES_HARNESS_MODE) return

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

  useEffect(() => {
    if (
      harnessMode !== LIVE_ADD_TO_RULES_HARNESS_MODE &&
      harnessMode !== SAVED_RESTORE_HARNESS_MODE
    )
      return

    window.__CRX_TAB_GROUPS_HARNESS__ = {
      seedAddToRulesScenario: async () => {
        const now = new Date().toISOString()
        const autoGroups: NStorage.Sync.Schema.AutoGroupRule[] = [
          {
            id: 'rule-active',
            title: 'Active Rule',
            color: 'blue',
            order: 1,
            urlPatterns: [],
            isActive: true,
            createdAt: now,
          },
          {
            id: 'rule-dormant',
            title: 'Dormant Rule',
            color: 'red',
            order: 2,
            urlPatterns: [],
            isActive: false,
            createdAt: now,
          },
        ]

        const existingTabs = await chrome.tabs.query({})
        const tabsToClose = existingTabs
          .filter((tab) => tab.id && !tab.url?.startsWith('chrome-extension://'))
          .map((tab) => tab.id as number)

        if (tabsToClose.length > 0) {
          await chrome.tabs.remove(tabsToClose)
        }

        await chrome.storage.sync.clear()
        await chrome.storage.local.clear()
        await chrome.storage.sync.set({ autoGroups, groups: [], tabs: [] })

        const createdTab = await chrome.tabs.create({
          url: 'https://example.com/',
          active: false,
        })

        await fetchAutoGroupRules()
        await liveManagementRef.current?.refreshActiveGroups()

        return {
          autoGroups,
          createdTab: {
            id: createdTab.id,
            url: createdTab.url,
            windowId: createdTab.windowId,
          },
        }
      },
      getExampleTabDraftOptions: async () => {
        const rules = getSelectableAutoGroupRules(await StorageSyncAutoGroup.getList())

        return [
          { value: NEW_RULE_DESTINATION_ID, label: 'Create new rule' },
          ...rules.map((rule) => ({
            value: rule.id,
            label: `${rule.title} - priority ${rule.order}`,
          })),
        ]
      },
      applyExampleTabToRule: async (destinationRuleId: string) => {
        let exampleTab = (await chrome.tabs.query({})).find((tab) =>
          (tab.url || '').startsWith('https://example.com/'),
        )

        if (!exampleTab) {
          for (let i = 0; i < 10; i++) {
            await new Promise((resolve) => setTimeout(resolve, 200))
            exampleTab = (await chrome.tabs.query({})).find((tab) =>
              (tab.url || '').startsWith('https://example.com/'),
            )
            if (exampleTab) break
          }
        }

        if (!exampleTab) {
          throw new Error('Example tab not found for harness scenario')
        }

        const openDraft = buildAddToRulesDraft(exampleTab, autoGroupRules)
        if (!openDraft) {
          throw new Error('Example tab draft could not be created')
        }

        setActiveSheet({
          kind: 'live-add-to-rules',
          payload: {
            ...openDraft,
            destinationRuleId,
          },
        })
        await waitForSidePanelCommit()

        const normalizedPattern = normalizeAutoGroupPattern(openDraft.patternDraft)
        const validation = validateAutoGroupRulePattern(normalizedPattern)
        if (!validation.isValid) {
          throw new Error(validation.error || 'Harness pattern validation failed')
        }

        const currentRules = sortAutoGroupRules(await StorageSyncAutoGroup.getList())
        const selectedRule = getSelectableAutoGroupRules(currentRules).find(
          (rule) => rule.id === destinationRuleId,
        )

        if (!selectedRule) {
          throw new Error('Selected active rule is no longer available')
        }

        const duplicatePattern = getAutoGroupRulePatterns(selectedRule).some(
          (pattern) => pattern.toLowerCase() === validation.normalizedPattern.toLowerCase(),
        )

        if (duplicatePattern) {
          throw new Error(`Pattern already exists in ${selectedRule.title}`)
        }

        await StorageSyncAutoGroup.update({
          ...selectedRule,
          urlPatterns: [...getAutoGroupRulePatterns(selectedRule), validation.normalizedPattern],
        })

        await new Promise((resolve) => setTimeout(resolve, 500))

        const scanResponse = await triggerAutoGroupScan()
        await fetchAutoGroupRules()
        await liveManagementRef.current?.refreshActiveGroups()
        setActiveSheet(null)

        return {
          success: scanResponse.success,
          scanResponse,
          pattern: validation.normalizedPattern,
        }
      },
      getAddToRulesState: async () => {
        const tabs = await chrome.tabs.query({})
        const exampleTab = tabs.find((tab) => (tab.url || '').startsWith('https://example.com/'))
        const rules = await StorageSyncAutoGroup.getList()
        const activeRule = rules.find((rule) => rule.id === 'rule-active')
        const dormantRule = rules.find((rule) => rule.id === 'rule-dormant')

        let group: LiveAddToRulesHarnessState['group'] = null

        if (exampleTab && typeof exampleTab.groupId === 'number' && exampleTab.groupId >= 0) {
          const liveGroup = await chrome.tabGroups.get(exampleTab.groupId)
          group = {
            id: liveGroup.id,
            title: liveGroup.title,
            color: liveGroup.color,
          }
        }

        return {
          exampleTab: exampleTab
            ? {
                id: exampleTab.id,
                groupId: exampleTab.groupId,
                url: exampleTab.url,
              }
            : null,
          group,
          activeRulePatterns: getAutoGroupRulePatterns(
            activeRule || { urlPattern: '', urlPatterns: [] },
          ),
          dormantRulePatterns: getAutoGroupRulePatterns(
            dormantRule || { urlPattern: '', urlPatterns: [] },
          ),
        }
      },
      showThemeSmokeState: async () => {
        const liveSeed = await liveManagementRef.current?.seedThemeSmokeState()
        if (!liveSeed) {
          throw new Error('Live theme smoke state could not be prepared')
        }

        openLiveAddToRules(liveSeed.exampleTab, {
          title: liveSeed.groupTitle,
          color: liveSeed.groupColor,
        })
        await waitForSidePanelCommit()

        return {
          tabId: liveSeed.exampleTab.id ?? null,
          groupId: liveSeed.groupId,
          saveMenuOpen: liveSeed.saveMenuOpen,
          addToRulesOpen: true,
          dragOverlayOpen: liveSeed.dragOverlayOpen,
        }
      },
      seedSavedRestoreScenario,
      runSavedRestore: async (groupId, faultMode) => {
        setActiveTab(ETabMenu.GROUP)
        setActiveSheet(null)
        setAddToRulesStatus({ tone: 'idle' })
        await waitForSidePanelCommit()
        await groupManagementRef.current?.runRestoreHarnessScenario(groupId, faultMode)
      },
      getSavedRestoreState: async (groupId) => {
        setActiveTab(ETabMenu.GROUP)
        await waitForSidePanelCommit()

        if (!groupManagementRef.current) {
          throw new Error('Saved restore harness is not ready')
        }

        return groupManagementRef.current.getRestoreHarnessState(groupId)
      },
    }

    return () => {
      delete window.__CRX_TAB_GROUPS_HARNESS__
    }
  }, [autoGroupRules, fetchAutoGroupRules, harnessMode, openLiveAddToRules])

  if (isMigrating) {
    return <div>Migrating...</div>
  }

  const addToRulesDraft = activeSheet?.kind === 'live-add-to-rules' ? activeSheet.payload : null

  return (
    <Layout>
      <div className="sp-shell flex h-[100vh] w-full overflow-hidden rounded-[1.4rem] border border-[var(--sp-card-border)]">
        <div className="sp-shell-content flex h-full w-full flex-col overflow-hidden">
          <Tabs
            tabs={TAB_MENU}
            defaultValue={ETabMenu.TAB_SYNC}
            value={activeTab}
            onValueChange={(val) => setActiveTab(Number(val) as ETabMenu)}
            className="flex-1 min-h-0"
            rightElement={
              <button
                onClick={openAppearanceSheet}
                className="size-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--sp-card-hover)] transition-colors cursor-pointer"
                title="Appearance Settings"
              >
                <Settings2 size={15} />
              </button>
            }
          >
            <Tabs.Content value={ETabMenu.TAB_SYNC}>
              <LiveManagement ref={liveManagementRef} onOpenAddToRules={openLiveAddToRules} />
            </Tabs.Content>
            <Tabs.Content value={ETabMenu.AUTOMATION}>
              <AutomationManagement />
            </Tabs.Content>
            <Tabs.Content value={ETabMenu.GROUP}>
              <GroupManagement ref={groupManagementRef} />
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

        <BottomSheet
          isOpen={activeSheet?.kind === 'appearance'}
          onClose={closeSheet}
          title="Appearance"
          description="Customize your experience"
        >
          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between">
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

          <div
            className={`transition-opacity duration-300 ${themeMode === 'glass' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
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
        </BottomSheet>

        <BottomSheet
          isOpen={Boolean(addToRulesDraft)}
          onClose={closeSheet}
          title="Add To Rules"
          description="Save this tab pattern into an automation rule"
          sheetDataAttributes={{ 'data-bottom-sheet': 'live-add-to-rules' }}
        >
          {addToRulesDraft && (
            <LiveAddToRulesSheetContent
              draft={addToRulesDraft}
              autoGroupRules={autoGroupRules}
              status={addToRulesStatus}
              onUpdateDraft={updateLiveAddToRulesDraft}
              onCancel={closeSheet}
              onSubmit={() => void submitLiveAddToRules()}
            />
          )}
        </BottomSheet>
      </div>
    </Layout>
  )
}

export default SidePanel
