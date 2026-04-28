import { shouldIgnoreAutoGroupUrl, sortAutoGroupRules } from '@/helpers'

export interface AutoGroupScanStatus {
  tone: 'idle' | 'success' | 'warning' | 'error'
  message?: string
}

export interface AutoGroupScanResponse {
  success: boolean
  summary?: {
    scanned: number
    matched: number
    grouped: number
    created: number
    alreadyGrouped: number
    errors: number
  }
  error?: string
}

export interface QuickRuleSourceGroup {
  title?: string
  color?: NStorage.Sync.GroupColor
}

export interface AddToRulesDraft {
  tabId: number
  tabTitle?: string
  url: string
  hostname: string
  patternDraft: string
  destinationRuleId: string
  newRuleTitle: string
  newRuleColor: NStorage.Sync.GroupColor
  sourceGroup?: QuickRuleSourceGroup
}

export interface LiveAddToRulesHarnessSeedResult {
  autoGroups: NStorage.Sync.Schema.AutoGroupRule[]
  createdTab: {
    id?: number
    url?: string
    windowId: number
  }
}

export interface LiveAddToRulesHarnessState {
  exampleTab: {
    id?: number
    groupId?: number
    url?: string
  } | null
  group: {
    id: number
    title?: string
    color: string
  } | null
  activeRulePatterns: string[]
  dormantRulePatterns: string[]
}

export interface LiveThemeSmokeHarnessState {
  tabId: number | null
  groupId: number | null
  saveMenuOpen: boolean
  addToRulesOpen: boolean
  dragOverlayOpen: boolean
}

export interface LiveAddToRulesHarnessDraftOption {
  value: string
  label: string
}

export const LIVE_HARNESS_QUERY_KEY = 'codex-harness'
export const LIVE_ADD_TO_RULES_HARNESS_MODE = 'live-add-to-rules'
export const NEW_RULE_DESTINATION_ID = 'new'

export const COLORS: NStorage.Sync.GroupColor[] = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
]

export const COLOR_MAP: Record<NStorage.Sync.GroupColor, string> = {
  grey: 'bg-slate-400',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  pink: 'bg-pink-500',
  purple: 'bg-purple-500',
  cyan: 'bg-cyan-500',
  orange: 'bg-orange-500',
}

export const getHostnamePatternFromTab = (tab: chrome.tabs.Tab) => {
  if (!tab.url || shouldIgnoreAutoGroupUrl(tab.url)) return null

  try {
    return new URL(tab.url).hostname.toLowerCase()
  } catch {
    return null
  }
}

export const getPathPatternFromTab = (tab: chrome.tabs.Tab) => {
  if (!tab.url || shouldIgnoreAutoGroupUrl(tab.url)) return null

  try {
    const parsedUrl = new URL(tab.url)
    const pathname = parsedUrl.pathname

    if (!pathname || pathname === '/') return parsedUrl.hostname.toLowerCase()

    const segments = pathname.split('/').filter(Boolean)
    const firstSegment = segments[0]

    return `${parsedUrl.hostname.toLowerCase()}/${firstSegment}/*`
  } catch {
    return null
  }
}

export const getExactPatternFromTab = (tab: chrome.tabs.Tab) => {
  if (!tab.url || shouldIgnoreAutoGroupUrl(tab.url)) return null

  try {
    const parsedUrl = new URL(tab.url)
    return parsedUrl.href.replace(/^[a-z]+:\/\//i, '')
  } catch {
    return null
  }
}

export const getQuickRuleTitle = (tab: chrome.tabs.Tab, sourceGroup?: QuickRuleSourceGroup) => {
  const groupTitle = sourceGroup?.title?.trim()
  if (groupTitle) return groupTitle

  return getHostnamePatternFromTab(tab) || tab.title?.trim() || 'Quick Rule'
}

export const getSelectableAutoGroupRules = (rules: NStorage.Sync.Schema.AutoGroupRule[]) =>
  sortAutoGroupRules(rules.filter((rule) => rule.isActive))

export const buildAddToRulesDraft = (
  tab: chrome.tabs.Tab,
  autoGroupRules: NStorage.Sync.Schema.AutoGroupRule[],
  sourceGroup?: QuickRuleSourceGroup,
): AddToRulesDraft | null => {
  const hostname = getHostnamePatternFromTab(tab)

  if (!hostname || !tab.url || typeof tab.id !== 'number') {
    return null
  }

  const title = getQuickRuleTitle(tab, sourceGroup)
  const color = sourceGroup?.color || 'blue'
  const matchingRule = autoGroupRules.find(
    (rule) => rule.title.trim().toLowerCase() === title.toLowerCase() && rule.color === color,
  )

  return {
    tabId: tab.id,
    tabTitle: tab.title,
    url: tab.url,
    hostname,
    patternDraft: hostname,
    destinationRuleId: matchingRule?.id || NEW_RULE_DESTINATION_ID,
    newRuleTitle: title,
    newRuleColor: color,
    sourceGroup,
  }
}

export const getAddToRulesPatternSuggestions = (draft: AddToRulesDraft) => {
  const draftTab: chrome.tabs.Tab = {
    id: draft.tabId,
    url: draft.url,
    title: draft.tabTitle,
  } as chrome.tabs.Tab

  const hostPattern = getHostnamePatternFromTab(draftTab)
  const pathPattern = getPathPatternFromTab(draftTab)
  const exactPattern = getExactPatternFromTab(draftTab)
  const suggestions = [
    hostPattern ? { label: 'Host', value: hostPattern } : null,
    pathPattern ? { label: 'Path', value: pathPattern } : null,
    exactPattern ? { label: 'Exact', value: exactPattern } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item))

  return Array.from(new Map(suggestions.map((item) => [item.value, item])).values())
}

export const triggerAutoGroupScan = async () => {
  for (let i = 0; i < 3; i++) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'run_auto_group_scan' })
      return (response || { success: false, error: 'Auto-group scan failed' }) as AutoGroupScanResponse
    } catch (error) {
      if (i < 2) {
        console.warn(`[Harness] Auto-group scan attempt ${i + 1} failed, retrying in 500ms...`, error)
        await new Promise((resolve) => setTimeout(resolve, 500))
        continue
      }

      return {
        success: false,
        error: String(error) || 'Auto-group scan failed',
      }
    }
  }

  return { success: false, error: 'Auto-group scan failed after retries' }
}
