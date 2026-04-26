import {
  describeRulePattern,
  getAutoGroupRulePatterns,
  matchesAutoGroupRule,
  shouldIgnoreAutoGroupUrl,
  sortAutoGroupRules,
} from '@/helpers'
import StorageLocalAutoGroup from '@/storage/autoGroup.local'

console.log('[CrxTabGroups] Background Service Worker is starting...')

// Helper: Show notification to the user
const notify = (title: string, message: string) => {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'img/logo-48.png',
      title: title,
      message: message,
      priority: 2,
    })
  } catch (e) {
    console.error('[Notify Error]', e)
  }
}

type AutoGroupResult =
  | { kind: 'ignored' | 'no_match' }
  | { kind: 'already_grouped'; ruleTitle: string }
  | { kind: 'grouped'; ruleTitle: string; groupCreated: boolean }
  | { kind: 'error'; error: string }

type AutoGroupScanSummary = {
  scanned: number
  matched: number
  grouped: number
  created: number
  alreadyGrouped: number
  errors: number
}

const getOwnedRegistryKey = (windowId: number, ruleId: string) => `${windowId}:${ruleId}`

const getOwnedAutoGroupRegistry = async () => {
  return await StorageLocalAutoGroup.getOwnershipRegistry()
}

const removeOwnedGroup = async (windowId: number, ruleId: string) => {
  const registry = await getOwnedAutoGroupRegistry()
  const registryKey = getOwnedRegistryKey(windowId, ruleId)

  if (!registry[registryKey]) return

  delete registry[registryKey]
  await StorageLocalAutoGroup.setOwnershipRegistry(registry)
}

const writeAutoGroupAudit = async (
  entry: Omit<NStorage.Local.AutoGroupAuditEntry, 'id' | 'createdAt'>,
) => {
  await StorageLocalAutoGroup.appendAuditEntry({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  })
}

const resolveTargetGroup = async (windowId: number, rule: NStorage.Sync.Schema.AutoGroupRule) => {
  const groups = await chrome.tabGroups.query({ windowId })
  const normalizedTitle = rule.title.trim().toLowerCase()
  const titleMatches = groups.filter(
    (group) => group.title?.trim().toLowerCase() === normalizedTitle,
  )
  const registry = await getOwnedAutoGroupRegistry()
  const ownedGroupId = registry[getOwnedRegistryKey(windowId, rule.id)]?.groupId

  if (typeof ownedGroupId === 'number') {
    const ownedGroup = groups.find((group) => group.id === ownedGroupId)

    if (ownedGroup) {
      return ownedGroup
    }

    await removeOwnedGroup(windowId, rule.id)
  }

  if (titleMatches.length === 0) return null

  const exactColorMatches = titleMatches.filter((group) => group.color === rule.color)
  if (exactColorMatches.length === 1) return exactColorMatches[0]

  if (titleMatches.length === 1) return titleMatches[0]

  return null
}

// Core Automation Logic
const handleAutoGrouping = async (
  tabId: number,
  url: string | undefined,
  windowId: number,
): Promise<AutoGroupResult> => {
  if (shouldIgnoreAutoGroupUrl(url)) {
    await writeAutoGroupAudit({
      tabId,
      windowId,
      url,
      outcome: 'ignored',
      reason: 'Ignored internal or missing URL.',
    })
    return { kind: 'ignored' }
  }

  try {
    const data = await chrome.storage.sync.get('autoGroups')
    const rules = (data.autoGroups || []) as NStorage.Sync.Schema.AutoGroupRule[]
    const activeRules = sortAutoGroupRules(rules.filter((rule) => rule.isActive))

    if (activeRules.length === 0) {
      await writeAutoGroupAudit({
        tabId,
        windowId,
        url,
        outcome: 'no_match',
        reason: 'No active rules are available.',
      })
      return { kind: 'no_match' }
    }

    for (const rule of activeRules) {
      const patterns = getAutoGroupRulePatterns(rule)
      const matchedPattern = url
        ? patterns.find((pattern) => matchesAutoGroupRule(url, pattern))
        : undefined

      if (url && matchedPattern) {
        console.log(
          `[AutoGroup] Match found! URL: ${url} matches Rule: ${rule.title} (${describeRulePattern(matchedPattern)})`,
        )
        const targetGroup = await resolveTargetGroup(windowId, rule)

        if (targetGroup) {
          const tab = await chrome.tabs.get(tabId)
          if (tab.groupId === targetGroup.id) {
            const registry = await getOwnedAutoGroupRegistry()
            registry[getOwnedRegistryKey(windowId, rule.id)] = {
              ruleId: rule.id,
              windowId,
              groupId: targetGroup.id,
              title: rule.title,
              color: rule.color,
              updatedAt: new Date().toISOString(),
            }
            await StorageLocalAutoGroup.setOwnershipRegistry(registry)
            await writeAutoGroupAudit({
              ruleId: rule.id,
              ruleTitle: rule.title,
              tabId,
              windowId,
              url,
              outcome: 'already_grouped',
              reason: 'Tab is already in the owned target group.',
              groupId: targetGroup.id,
              matchedPattern,
            })
            console.log(`[AutoGroup] Tab already in group: ${rule.title}`)
            return { kind: 'already_grouped', ruleTitle: rule.title }
          }
          await chrome.tabs.group({ tabIds: [tabId], groupId: targetGroup.id })
          const registry = await getOwnedAutoGroupRegistry()
          registry[getOwnedRegistryKey(windowId, rule.id)] = {
            ruleId: rule.id,
            windowId,
            groupId: targetGroup.id,
            title: rule.title,
            color: rule.color,
            updatedAt: new Date().toISOString(),
          }
          await StorageLocalAutoGroup.setOwnershipRegistry(registry)
          await writeAutoGroupAudit({
            ruleId: rule.id,
            ruleTitle: rule.title,
            tabId,
            windowId,
            url,
            outcome: 'grouped',
            reason: 'Matched an existing owned or resolved target group.',
            groupId: targetGroup.id,
            groupCreated: false,
            matchedPattern,
          })
          notify('Crx Tab Groups', `Auto-grouped to "${rule.title}"`)
          return { kind: 'grouped', ruleTitle: rule.title, groupCreated: false }
        } else {
          const newGroupId = await chrome.tabs.group({ tabIds: [tabId] })
          await chrome.tabGroups.update(newGroupId, {
            title: rule.title,
            color: rule.color,
          })
          const registry = await getOwnedAutoGroupRegistry()
          registry[getOwnedRegistryKey(windowId, rule.id)] = {
            ruleId: rule.id,
            windowId,
            groupId: newGroupId,
            title: rule.title,
            color: rule.color,
            updatedAt: new Date().toISOString(),
          }
          await StorageLocalAutoGroup.setOwnershipRegistry(registry)
          await writeAutoGroupAudit({
            ruleId: rule.id,
            ruleTitle: rule.title,
            tabId,
            windowId,
            url,
            outcome: 'grouped',
            reason: 'Created a new owned target group for the matched rule.',
            groupId: newGroupId,
            groupCreated: true,
            matchedPattern,
          })
          notify('Crx Tab Groups', `New group "${rule.title}" created!`)
          return { kind: 'grouped', ruleTitle: rule.title, groupCreated: true }
        }
      }
    }

    await writeAutoGroupAudit({
      tabId,
      windowId,
      url,
      outcome: 'no_match',
      reason: 'No active rule matched the tab URL.',
    })
    return { kind: 'no_match' }
  } catch (error) {
    console.error('[AutoGroup] Runtime Error:', error)
    await writeAutoGroupAudit({
      tabId,
      windowId,
      url,
      outcome: 'error',
      reason: 'Runtime auto-grouping error.',
      message: error instanceof Error ? error.message : 'Unknown auto-group error',
    })
    return {
      kind: 'error',
      error: error instanceof Error ? error.message : 'Unknown auto-group error',
    }
  }
}

const scanTabs = async (tabs: chrome.tabs.Tab[]) => {
  const summary: AutoGroupScanSummary = {
    scanned: 0,
    matched: 0,
    grouped: 0,
    created: 0,
    alreadyGrouped: 0,
    errors: 0,
  }

  for (const tab of tabs) {
    if (typeof tab.id !== 'number' || typeof tab.windowId !== 'number' || !tab.url) continue

    summary.scanned += 1
    const result = await handleAutoGrouping(tab.id, tab.url, tab.windowId)

    if (result.kind === 'grouped') {
      summary.matched += 1
      summary.grouped += 1
      if (result.groupCreated) summary.created += 1
    }

    if (result.kind === 'already_grouped') {
      summary.matched += 1
      summary.alreadyGrouped += 1
    }

    if (result.kind === 'error') {
      summary.errors += 1
    }
  }

  return summary
}

// Listeners
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    void handleAutoGrouping(tabId, tab.url || changeInfo.url, tab.windowId)
  }
})

chrome.tabs.onCreated.addListener((tab) => {
  if (typeof tab.id === 'number' && tab.url) {
    void handleAutoGrouping(tab.id, tab.url, tab.windowId)
  }
})

// Manual trigger from UI
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'run_auto_group_scan') {
    void (async () => {
      try {
        const queryOptions =
          typeof request.windowId === 'number' ? { windowId: request.windowId } : {}
        const tabs = await chrome.tabs.query(queryOptions)
        const summary = await scanTabs(tabs)

        if (summary.errors > 0) {
          notify('Crx Tab Groups', `Auto-group scan completed with ${summary.errors} error(s).`)
        } else if (summary.grouped > 0) {
          notify('Crx Tab Groups', `Auto-group scan updated ${summary.grouped} tab(s).`)
        } else if (summary.alreadyGrouped > 0) {
          notify('Crx Tab Groups', 'Auto-group scan found matching tabs already in place.')
        } else {
          notify('Crx Tab Groups', 'Auto-group scan found no matching tabs.')
        }

        sendResponse({ success: summary.errors === 0, summary })
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown scan error'
        sendResponse({ success: false, error: errorMessage })
      }
    })()
    return true
  }

  if (request.action === 'get_auto_group_debug_state') {
    void (async () => {
      try {
        const [ownershipRegistry, auditEntries] = await Promise.all([
          StorageLocalAutoGroup.getOwnershipRegistry(),
          StorageLocalAutoGroup.getAuditEntries(),
        ])

        sendResponse({
          success: true,
          ownership: Object.values(ownershipRegistry),
          audit: auditEntries,
        })
      } catch (e) {
        sendResponse({
          success: false,
          error: e instanceof Error ? e.message : 'Unknown debug-state error',
        })
      }
    })()

    return true
  }

  if (request.action === 'clear_auto_group_audit') {
    void (async () => {
      try {
        await StorageLocalAutoGroup.clearAuditEntries()
        sendResponse({ success: true })
      } catch (e) {
        sendResponse({
          success: false,
          error: e instanceof Error ? e.message : 'Unknown audit-clear error',
        })
      }
    })()

    return true
  }
})

// Sidepanel behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error))

// --- SESSION TRACKING LOGIC ---

const SESSION_STORAGE_KEY = 'last_known_good_session'
const TRACKING_DEBOUNCE_MS = 2000

let trackingTimer: ReturnType<typeof setTimeout> | null = null

const trackCurrentSession = async () => {
  if (trackingTimer) clearTimeout(trackingTimer)

  trackingTimer = setTimeout(async () => {
    try {
      const allWindows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] })
      const allGroups = await chrome.tabGroups.query({})

      const sessionSnapshot = {
        timestamp: new Date().toISOString(),
        windowCount: allWindows.length,
        tabCount: allWindows.reduce((acc, win) => acc + (win.tabs?.length || 0), 0),
        windows: allWindows.map((win) => ({
          id: win.id,
          tabs: (win.tabs || []).map((tab) => ({
            url: tab.url,
            title: tab.title,
            favIconUrl: tab.favIconUrl,
            pinned: tab.pinned,
            groupId: tab.groupId,
          })),
          groups: allGroups
            .filter((g) => g.windowId === win.id)
            .map((g) => ({
              id: g.id,
              title: g.title,
              color: g.color,
              collapsed: g.collapsed,
            })),
        })),
      }

      // Only save if there are actually tabs open (to prevent overwriting with an empty session)
      if (sessionSnapshot.tabCount > 0) {
        await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: sessionSnapshot })
        console.log(`[SessionTracker] Saved state: ${sessionSnapshot.tabCount} tabs in ${sessionSnapshot.windowCount} windows.`)
      }
    } catch (e) {
      console.error('[SessionTracker] Error saving session:', e)
    } finally {
      trackingTimer = null
    }
  }, TRACKING_DEBOUNCE_MS)
}

// Attach tracking hooks
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') trackCurrentSession()
})
chrome.tabs.onRemoved.addListener(() => trackCurrentSession())
chrome.tabs.onMoved.addListener(() => trackCurrentSession())
chrome.tabs.onAttached.addListener(() => trackCurrentSession())
chrome.tabs.onDetached.addListener(() => trackCurrentSession())
chrome.windows.onCreated.addListener(() => trackCurrentSession())
chrome.windows.onRemoved.addListener(() => trackCurrentSession())

// --- END SESSION TRACKING LOGIC ---

// Initial notification to confirm background is alive
notify('Crx Tab Groups', 'Automation Service is active 🚀')
