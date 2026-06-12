import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { 
  Settings2,
  AlertTriangle,
  Paintbrush,
  Cpu,
  Database,
  Terminal,
  Download,
  Upload,
  RefreshCcw,
  Sparkles,
  ChevronDown,
  ChevronRight
} from 'lucide-react'

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
  migrateStorageData,
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
  | { kind: 'settings' }
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

const DEFAULT_SETTINGS: NStorage.Local.ExtensionSettings = {
  autoGroupingEnabled: true,
  groupOnTabCreated: true,
  groupOnTabUpdated: true,
  scanDebounceTime: 0,
  storageEngine: 'sync',
  autoCleanupEmptyGroups: true,
  developerMode: false,
}

export const SidePanel = () => {
  const [isMigrating, setIsMigrating] = useState(false)
  const [activeTab, setActiveTab] = useState<ETabMenu>(ETabMenu.TAB_SYNC)
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')
  const [glassStyle, setGlassStyle] = useState<GlassStyle>(DEFAULT_GLASS_STYLE)
  const [activeSheet, setActiveSheet] = useState<SidePanelSheetState>(null)
  
  const [settings, setSettings] = useState<NStorage.Local.ExtensionSettings>(DEFAULT_SETTINGS)
  const [bytesUsed, setBytesUsed] = useState<number>(0)
  const [expandedSection, setExpandedSection] = useState<string | null>('appearance')

  const quotaBytes = settings.storageEngine === 'local' ? 5242880 : 102400

  const updateSettings = useCallback(async (patch: Partial<NStorage.Local.ExtensionSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      void StorageLocal.set({ extensionSettings: next })
      return next
    })
  }, [])

  const updateStorageUsage = useCallback(async () => {
    try {
      const keys = ['groups', 'tabs', 'autoGroups', 'favIcons']
      const settingsData = await StorageLocal.get<{ extensionSettings?: NStorage.Local.ExtensionSettings }>('extensionSettings')
      const currentEngine = settingsData.extensionSettings?.storageEngine || 'sync'
      const storageArea = currentEngine === 'local' ? chrome.storage.local : chrome.storage.sync
      
      if (storageArea.getBytesInUse) {
        const bytes = await storageArea.getBytesInUse(keys)
        setBytesUsed(bytes)
      } else {
        const data = await storageArea.get(keys)
        const size = JSON.stringify(data).length
        setBytesUsed(size)
      }
    } catch (e) {
      console.warn('Failed to get bytes in use:', e)
    }
  }, [])

  useEffect(() => {
    if (activeSheet?.kind === 'settings') {
      updateStorageUsage()
    }
  }, [activeSheet, updateStorageUsage])

  const toggleSection = (section: string) => {
    setExpandedSection((prev) => (prev === section ? null : section))
  }
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
      setActiveSheet({ kind: 'settings' })
    } else if (harness === SAVED_RESTORE_HARNESS_MODE) {
      setActiveTab(ETabMenu.GROUP)
    }

    let isMounted = true

    StorageLocal.get<{
      [THEME_STORAGE_KEY]?: ThemeMode
      [GLASS_STYLE_STORAGE_KEY]?: GlassStyle
      extensionSettings?: NStorage.Local.ExtensionSettings
    }>([THEME_STORAGE_KEY, GLASS_STYLE_STORAGE_KEY, 'extensionSettings']).then((data) => {
      if (!isMounted) return

      const storedThemeMode = data?.[THEME_STORAGE_KEY]
      const storedGlassStyle = data?.[GLASS_STYLE_STORAGE_KEY]
      const storedSettings = data?.extensionSettings

      if (storedThemeMode) {
        setThemeMode(storedThemeMode)
      }

      if (storedGlassStyle) {
        setGlassStyle(storedGlassStyle)
      }

      if (storedSettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...storedSettings })
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

  const openSettingsSheet = useCallback(() => {
    setActiveSheet({ kind: 'settings' })
  }, [])

  const closeSheet = useCallback(() => {
    setActiveSheet(null)
    setAddToRulesStatus({ tone: 'idle' })
  }, [])

  const handleExportData = async () => {
    try {
      const storageArea = settings.storageEngine === 'local' ? chrome.storage.local : chrome.storage.sync
      const keys = ['groups', 'tabs', 'autoGroups', 'favIcons']
      const data = await storageArea.get(keys)
      
      const backupData = {
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        settings,
        data
      }
      
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `crx-tab-groups-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Export thất bại: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const backupData = JSON.parse(e.target?.result as string)
        if (!backupData.data || typeof backupData.data !== 'object') {
          throw new Error('Định dạng file backup không hợp lệ.')
        }

        const confirmImport = confirm('Bạn có muốn khôi phục dữ liệu từ file này? Dữ liệu hiện tại sẽ bị ghi đè.')
        if (!confirmImport) return

        const storageArea = settings.storageEngine === 'local' ? chrome.storage.local : chrome.storage.sync
        
        await storageArea.set(backupData.data)
        if (backupData.settings) {
          await updateSettings(backupData.settings)
        }

        alert('Khôi phục dữ liệu thành công!')
        updateStorageUsage()
        groupManagementRef.current?.refreshSavedGroups()
        fetchAutoGroupRules()
        liveManagementRef.current?.refreshActiveGroups()
      } catch (err) {
        alert(`Import thất bại: ${err instanceof Error ? err.message : 'File JSON không hợp lệ'}`)
      }
    }
    reader.readAsText(file)
  }

  const handleFactoryReset = async () => {
    const step1 = confirm('CẢNH BÁO: Thao tác này sẽ xóa vĩnh viễn toàn bộ Snapshots, Rules và Cài đặt của bạn. Bạn có chắc chắn?')
    if (!step1) return
    
    const step2 = prompt('Để xác nhận xóa toàn bộ, vui lòng nhập chữ "RESET" vào bên dưới:')
    if (step2 !== 'RESET') {
      alert('Nhập xác nhận không đúng. Thao tác hủy bỏ.')
      return
    }

    try {
      await chrome.storage.sync.clear()
      await chrome.storage.local.clear()
      await chrome.storage.local.set({ extensionSettings: DEFAULT_SETTINGS })
      setSettings(DEFAULT_SETTINGS)
      
      alert('Đã khôi phục cài đặt gốc thành công!')
      window.location.reload()
    } catch (e) {
      alert(`Reset thất bại: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

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
      <div className="sp-shell flex h-full w-full overflow-hidden">
        <div className="sp-shell-content flex h-full w-full flex-col overflow-hidden">
          <Tabs
            tabs={TAB_MENU}
            defaultValue={ETabMenu.TAB_SYNC}
            value={activeTab}
            onValueChange={(val) => setActiveTab(Number(val) as ETabMenu)}
            className="flex-1 min-h-0"
            rightElement={
              <button
                onClick={openSettingsSheet}
                className="size-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--sp-card-hover)] transition-colors cursor-pointer"
                title="Settings"
              >
                <Settings2 size={15} />
              </button>
            }
          >
            <Tabs.Content value={ETabMenu.TAB_SYNC}>
              <LiveManagement ref={liveManagementRef} onOpenAddToRules={openLiveAddToRules} />
            </Tabs.Content>
            <Tabs.Content value={ETabMenu.AUTOMATION}>
              <AutomationManagement developerMode={settings.developerMode} />
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
          isOpen={activeSheet?.kind === 'settings'}
          onClose={closeSheet}
          title="Cấu hình hệ thống"
          description="Tùy chỉnh hoạt động và giao diện của extension"
          sheetDataAttributes={{ 'data-bottom-sheet': 'settings' }}
        >
          <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1 pb-4">
            {/* Category 1: Appearance */}
            <div className="sp-settings-group border border-[var(--sp-card-border)] rounded-2xl overflow-hidden bg-[var(--surface-elevated)]">
              <button
                className="w-full flex items-center justify-between p-3.5 font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] hover:bg-[var(--sp-card-hover)] transition-colors cursor-pointer"
                onClick={() => toggleSection('appearance')}
              >
                <span className="flex items-center gap-2">
                  <Paintbrush size={14} className="text-indigo-500" />
                  Appearance & Styling
                </span>
                {expandedSection === 'appearance' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              
              {expandedSection === 'appearance' && (
                <div className="p-4 border-t border-[var(--sp-card-border)] flex flex-col gap-4 animate-in fade-in duration-200">
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Theme Mode</p>
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

                  {themeMode === 'glass' && (
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Glass Style</p>
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
                  )}
                </div>
              )}
            </div>

            {/* Category 2: Auto-Grouping */}
            <div className="sp-settings-group border border-[var(--sp-card-border)] rounded-2xl overflow-hidden bg-[var(--surface-elevated)]">
              <button
                className="w-full flex items-center justify-between p-3.5 font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] hover:bg-[var(--sp-card-hover)] transition-colors cursor-pointer"
                onClick={() => toggleSection('automation')}
              >
                <span className="flex items-center gap-2">
                  <Cpu size={14} className="text-amber-500" />
                  Auto-Grouping Preferences
                </span>
                {expandedSection === 'automation' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {expandedSection === 'automation' && (
                <div className="p-4 border-t border-[var(--sp-card-border)] flex flex-col gap-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">Tự động gom nhóm</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">Bật/tắt chạy ngầm gom nhóm tự động</p>
                    </div>
                    <button
                      className={`sp-toggle-switch ${settings.autoGroupingEnabled ? 'is-active' : ''}`}
                      onClick={() => updateSettings({ autoGroupingEnabled: !settings.autoGroupingEnabled })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">Khi mở tab mới</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">Tự động gom nhóm ngay khi tạo tab mới</p>
                    </div>
                    <button
                      className={`sp-toggle-switch ${settings.groupOnTabCreated ? 'is-active' : ''}`}
                      onClick={() => updateSettings({ groupOnTabCreated: !settings.groupOnTabCreated })}
                      disabled={!settings.autoGroupingEnabled}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">Khi cập nhật URL tab</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">Gom lại nhóm khi URL thay đổi</p>
                    </div>
                    <button
                      className={`sp-toggle-switch ${settings.groupOnTabUpdated ? 'is-active' : ''}`}
                      onClick={() => updateSettings({ groupOnTabUpdated: !settings.groupOnTabUpdated })}
                      disabled={!settings.autoGroupingEnabled}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">Độ trễ quét (Debounce)</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">Chờ trước khi chạy quét (tránh quá tải CPU)</p>
                    </div>
                    <select
                      className="sp-select text-xs"
                      value={settings.scanDebounceTime}
                      onChange={(e) => updateSettings({ scanDebounceTime: Number(e.target.value) })}
                      disabled={!settings.autoGroupingEnabled}
                    >
                      <option value={0}>Tức thì (0ms)</option>
                      <option value={500}>500ms</option>
                      <option value={1000}>1 giây</option>
                      <option value={2000}>2 giây</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Category 3: Storage */}
            <div className="sp-settings-group border border-[var(--sp-card-border)] rounded-2xl overflow-hidden bg-[var(--surface-elevated)]">
              <button
                className="w-full flex items-center justify-between p-3.5 font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] hover:bg-[var(--sp-card-hover)] transition-colors cursor-pointer"
                onClick={() => toggleSection('storage')}
              >
                <span className="flex items-center gap-2">
                  <Database size={14} className="text-emerald-500" />
                  Storage & Snapshots
                </span>
                {expandedSection === 'storage' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {expandedSection === 'storage' && (
                <div className="p-4 border-t border-[var(--sp-card-border)] flex flex-col gap-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">Vùng lưu trữ</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">Sync (Đồng bộ Cloud - 100KB) hoặc Local (Cục bộ máy - 5MB+)</p>
                    </div>
                    <select
                      className="sp-select text-xs"
                      value={settings.storageEngine}
                      onChange={async (e) => {
                        const nextEngine = e.target.value as 'sync' | 'local'
                        const labelStr = nextEngine === 'sync' ? 'Sync Cloud' : 'Local máy'
                        if (confirm(`Bạn có chắc muốn chuyển sang bộ nhớ ${labelStr}? Hệ thống sẽ tự động sao chép toàn bộ Snapshots, Rules, Favicons hiện có.`)) {
                          const res = await migrateStorageData(nextEngine)
                          if (res.success) {
                            await updateSettings({ storageEngine: nextEngine })
                            updateStorageUsage()
                            alert('Di chuyển dữ liệu thành công!')
                            groupManagementRef.current?.refreshSavedGroups()
                          } else {
                            alert(`Lỗi di chuyển dữ liệu: ${res.error}`)
                          }
                        }
                      }}
                    >
                      <option value="sync">Sync (Đồng bộ Cloud)</option>
                      <option value="local">Local (Cục bộ máy)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">Dọn dẹp nhóm trống</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">Tự động xóa các nhóm trống của Chrome sau khi phục hồi</p>
                    </div>
                    <button
                      className={`sp-toggle-switch ${settings.autoCleanupEmptyGroups ? 'is-active' : ''}`}
                      onClick={() => updateSettings({ autoCleanupEmptyGroups: !settings.autoCleanupEmptyGroups })}
                    />
                  </div>

                  <div className="py-2 border-t border-[var(--sp-card-border)] mt-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Dung lượng sử dụng</span>
                      <span className={`text-xs font-bold ${bytesUsed / quotaBytes >= 0.8 ? 'text-rose-500 animate-pulse' : 'text-indigo-500'}`}>
                        {(bytesUsed / 1024).toFixed(2)} KB / {(quotaBytes / 1024).toFixed(0)} KB ({((bytesUsed / quotaBytes) * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-[var(--sp-card-hover)] rounded-full h-2 overflow-hidden border border-[var(--sp-card-border)]">
                      <div 
                        className={`h-full transition-all duration-300 rounded-full ${bytesUsed / quotaBytes >= 0.8 ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                        style={{ width: `${Math.min(100, (bytesUsed / quotaBytes) * 100)}%` }} 
                      />
                    </div>
                    {bytesUsed / quotaBytes >= 0.8 && (
                      <p className="text-[9px] text-rose-500 font-medium mt-1 flex items-center gap-1 animate-pulse">
                        <AlertTriangle size={10} /> Cảnh báo: Bộ nhớ gần đầy (&gt;80%). Hãy chuyển sang Local storage hoặc xóa bớt Snapshots!
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Category 4: Developer Mode */}
            <div className="sp-settings-group border border-[var(--sp-card-border)] rounded-2xl overflow-hidden bg-[var(--surface-elevated)]">
              <button
                className="w-full flex items-center justify-between p-3.5 font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] hover:bg-[var(--sp-card-hover)] transition-colors cursor-pointer"
                onClick={() => toggleSection('developer')}
              >
                <span className="flex items-center gap-2">
                  <Terminal size={14} className="text-purple-500" />
                  System & Developer Mode
                </span>
                {expandedSection === 'developer' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {expandedSection === 'developer' && (
                <div className="p-4 border-t border-[var(--sp-card-border)] flex flex-col gap-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">Chế độ nhà phát triển</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">Hiện nút Con Bọ gỡ lỗi quét nhóm tự động ở tab Rules</p>
                    </div>
                    <button
                      className={`sp-toggle-switch ${settings.developerMode ? 'is-active' : ''}`}
                      onClick={() => updateSettings({ developerMode: !settings.developerMode })}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Category 5: Data & Backup */}
            <div className="sp-settings-group border border-[var(--sp-card-border)] rounded-2xl overflow-hidden bg-[var(--surface-elevated)]">
              <button
                className="w-full flex items-center justify-between p-3.5 font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] hover:bg-[var(--sp-card-hover)] transition-colors cursor-pointer"
                onClick={() => toggleSection('data')}
              >
                <span className="flex items-center gap-2">
                  <RefreshCcw size={14} className="text-rose-500" />
                  Data Management
                </span>
                {expandedSection === 'data' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {expandedSection === 'data' && (
                <div className="p-4 border-t border-[var(--sp-card-border)] flex flex-col gap-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs font-bold text-[var(--text-primary)]">Sao lưu dữ liệu</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">Xuất toàn bộ Snapshots, Rules và Cấu hình ra file .json</p>
                    </div>
                    <button
                      className="sp-btn-backup flex items-center gap-1 text-[10px] font-bold uppercase cursor-pointer"
                      onClick={handleExportData}
                    >
                      <Download size={12} />
                      Export
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-[var(--sp-card-border)] pt-3">
                    <div className="flex-1">
                      <p className="text-xs font-bold text-[var(--text-primary)]">Khôi phục dữ liệu</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">Khôi phục snapshots và rules từ file sao lưu .json</p>
                    </div>
                    <label className="sp-btn-backup flex items-center gap-1 text-[10px] font-bold uppercase cursor-pointer">
                      <Upload size={12} />
                      Import
                      <input 
                        type="file" 
                        accept=".json" 
                        className="hidden" 
                        onChange={handleImportData} 
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-[var(--sp-card-border)] pt-3">
                    <div className="flex-1">
                      <p className="text-xs font-bold text-rose-500">Khôi phục cài đặt gốc</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">Xóa vĩnh viễn toàn bộ cấu hình, rules và snapshots</p>
                    </div>
                    <button
                      className="sp-btn-reset text-[10px] font-bold uppercase cursor-pointer"
                      onClick={handleFactoryReset}
                    >
                      Reset All
                    </button>
                  </div>
                </div>
              )}
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
