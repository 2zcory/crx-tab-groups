import {
  describeRulePattern,
  getAutoGroupRulePatterns,
  matchesAutoGroupRule,
  shouldIgnoreAutoGroupUrl,
  sortAutoGroupRules,
} from '@/helpers'
import StorageLocalAutoGroup from '@/storage/autoGroup.local'

console.log('[CrxTabGroups] Background Service Worker active.')

// --- STORAGE MUTATE QUEUE & HELPERS ---
let mutationQueue: Promise<any> = Promise.resolve()

function enqueueMutation<T>(op: () => Promise<T>): Promise<T> {
  const res = mutationQueue.then(op)
  mutationQueue = res.catch(() => {})
  return res
}

const readStorage = (storageArea: chrome.storage.StorageArea, keys: string | string[] | null): Promise<any> => {
  return new Promise((resolve, reject) => {
    storageArea.get(keys, (data) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(data)
    })
  })
}

const writeStorage = (storageArea: chrome.storage.StorageArea, data: object): Promise<void> => {
  return new Promise((resolve, reject) => {
    storageArea.set(data, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve()
    })
  })
}

// --- MESSAGE ROUTER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] Received message:', request.action)

  if (request.action === 'STORAGE_MUTATE') {
    enqueueMutation(async () => {
      const { type } = request.mutation
      const settingsData = await readStorage(chrome.storage.local, 'extensionSettings')
      const settings = settingsData.extensionSettings as NStorage.Local.ExtensionSettings | undefined
      const storageArea = settings?.storageEngine === 'local' ? chrome.storage.local : chrome.storage.sync

      switch (type) {
        case 'SAVE_SNAPSHOT': {
          const { group, tabs } = request.mutation
          const db = await readStorage(storageArea, ['groups', 'tabs'])
          const currentGroups = db.groups || []
          const currentTabs = db.tabs || []

          await writeStorage(storageArea, {
            groups: [...currentGroups, group],
            tabs: [...currentTabs, ...tabs],
          })
          break
        }
        case 'UPDATE_SNAPSHOT': {
          const { group, tabs } = request.mutation
          const db = await readStorage(storageArea, ['groups', 'tabs'])
          const currentGroups = db.groups || []
          const currentTabs = db.tabs || []

          const updatedGroups = currentGroups.map((g: any) => (g.id === group.id ? { ...g, ...group } : g))
          const filteredTabs = currentTabs.filter((t: any) => t.groupId !== group.id)

          await writeStorage(storageArea, {
            groups: updatedGroups,
            tabs: [...filteredTabs, ...tabs],
          })
          break
        }
        case 'DELETE_SNAPSHOT': {
          const { groupId } = request.mutation
          const db = await readStorage(storageArea, ['groups', 'tabs'])
          const currentGroups = db.groups || []
          const currentTabs = db.tabs || []

          await writeStorage(storageArea, {
            groups: currentGroups.filter((g: any) => g.id !== groupId),
            tabs: currentTabs.filter((t: any) => t.groupId !== groupId),
          })
          break
        }
        case 'MUTATE_GROUPS': {
          const { groups } = request.mutation
          const db = await readStorage(storageArea, 'groups')
          const currentGroups = db.groups || []

          const updatedGroups = [...currentGroups]
          for (const newG of groups) {
            const index = updatedGroups.findIndex((g: any) => g.id === newG.id)
            if (index !== -1) {
              updatedGroups[index] = { ...updatedGroups[index], ...newG }
            } else {
              updatedGroups.push(newG)
            }
          }

          await writeStorage(storageArea, { groups: updatedGroups })
          break
        }
        case 'MUTATE_TABS': {
          const { tabs } = request.mutation
          const db = await readStorage(storageArea, 'tabs')
          const currentTabs = db.tabs || []

          const updatedTabs = [...currentTabs]
          for (const newT of tabs) {
            const index = updatedTabs.findIndex((t: any) => t.id === newT.id)
            if (index !== -1) {
              updatedTabs[index] = { ...updatedTabs[index], ...newT }
            } else {
              updatedTabs.push(newT)
            }
          }

          await writeStorage(storageArea, { tabs: updatedTabs })
          break
        }
        case 'MUTATE_AUTOGROUPS': {
          const { autoGroups } = request.mutation
          const db = await readStorage(storageArea, 'autoGroups')
          const currentRules = db.autoGroups || []

          const updatedRules = [...currentRules]
          for (const newR of autoGroups) {
            const index = updatedRules.findIndex((r: any) => r.id === newR.id)
            if (index !== -1) {
              updatedRules[index] = { ...updatedRules[index], ...newR }
            } else {
              updatedRules.push(newR)
            }
          }

          await writeStorage(storageArea, { autoGroups: updatedRules })
          break
        }
        case 'REPLACE_AUTOGROUPS': {
          const { autoGroups } = request.mutation
          await writeStorage(storageArea, { autoGroups })
          break
        }
        case 'SET': {
          const { params } = request.mutation
          await writeStorage(storageArea, params)
          break
        }
        default:
          throw new Error(`Unknown mutation type: ${type}`)
      }
    })
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((err) => {
        console.error('[Background] Mutation error:', err)
        sendResponse({ success: false, error: err.message || String(err) })
      })
    return true
  }

  if (request.action === 'run_auto_group_scan') {
    chrome.tabs.query(request.windowId ? { windowId: request.windowId } : {}, (tabs) => {
      const err = chrome.runtime.lastError
      if (err) {
        sendResponse({ success: false, error: err.message })
        return
      }

      scanTabs(tabs)
        .then((summary) => {
          console.log('[Background] Scan success:', summary)
          sendResponse({ success: true, summary })
        })
        .catch((e) => {
          console.error('[Background] Scan error:', e)
          sendResponse({ success: false, error: String(e) })
        })
    })
    return true
  }

  if (request.action === 'get_auto_group_debug_state') {
    Promise.all([
      StorageLocalAutoGroup.getOwnershipRegistry(),
      StorageLocalAutoGroup.getAuditEntries(),
    ])
      .then(([ownership, audit]) =>
        sendResponse({ success: true, ownership: Object.values(ownership), audit }),
      )
      .catch((e) => sendResponse({ success: false, error: String(e) }))
    return true
  }

  if (request.action === 'clear_auto_group_audit') {
    StorageLocalAutoGroup.clearAuditEntries()
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: String(e) }))
    return true
  }

  console.log('[Background] Unhandled message action:', request.action)
  return false
})

// --- AUTO GROUPING ---
const handleAutoGrouping = async (
  tabId: number,
  url: string | undefined,
  windowId: number,
  activeRules: NStorage.Sync.Schema.AutoGroupRule[],
) => {
  if (!url || shouldIgnoreAutoGroupUrl(url)) return { kind: 'ignored' }

  try {
    const tab = await chrome.tabs.get(tabId)

    for (const rule of activeRules) {
      const patterns = getAutoGroupRulePatterns(rule)
      const isMatch = patterns.some((p) => matchesAutoGroupRule(url, p))

      if (isMatch) {
        console.log(`[Automation] Match found for tab ${tabId}: "${rule.title}" (Pattern matched)`)

        const groups = await chrome.tabGroups.query({ windowId })
        const targetGroup = groups.find(
          (g) => g.title?.trim().toLowerCase() === rule.title.trim().toLowerCase(),
        )

        if (targetGroup) {
          if (tab.groupId === targetGroup.id) {
            console.log(`[Automation] Tab ${tabId} already in target group: ${rule.title}`)
            return { kind: 'already_grouped' }
          }
          try {
            await chrome.tabs.group({ tabIds: [tabId], groupId: targetGroup.id })
            console.log(`[Automation] Grouped tab ${tabId} into existing group: ${rule.title}`)
            return { kind: 'grouped' }
          } catch (groupError: any) {
            const groupErrorMsg = (groupError?.message || String(groupError)).toLowerCase()
            if (groupErrorMsg.includes('no group with id') || groupErrorMsg.includes('group not found')) {
              console.warn(`[Background] Target group ${targetGroup.id} was dissolved before grouping. Re-creating group.`)
              const gid = await chrome.tabs.group({ tabIds: [tabId] })
              await chrome.tabGroups.update(gid, { title: rule.title, color: rule.color })
              console.log(`[Automation] Created new group "${rule.title}" for tab ${tabId} after target group dissolved.`)
              return { kind: 'grouped' }
            } else {
              throw groupError
            }
          }
        } else {
          const gid = await chrome.tabs.group({ tabIds: [tabId] })
          await chrome.tabGroups.update(gid, { title: rule.title, color: rule.color })
          console.log(`[Automation] Created new group "${rule.title}" for tab ${tabId}`)
          return { kind: 'grouped' }
        }
      }
    }
  } catch (e: any) {
    const errorMsg = (e?.message || String(e)).toLowerCase()
    if (
      errorMsg.includes('no tab with id') ||
      errorMsg.includes('not found') ||
      errorMsg.includes('no group with id')
    ) {
      console.warn(`[Background] Auto-grouping skipped for tab ${tabId} because tab/group was dissolved.`)
    } else {
      console.error('[Background] Auto-grouping error for tab', tabId, e)
    }
  }
  return { kind: 'no_match' }
}

const scanTabs = async (tabs: chrome.tabs.Tab[]) => {
  console.log(`[Background] Manual scan triggered for ${tabs.length} tabs`)
  const summary = { scanned: 0, matched: 0, grouped: 0, created: 0, alreadyGrouped: 0, errors: 0 }

  try {
    const settingsData = await chrome.storage.local.get('extensionSettings')
    const settings = settingsData.extensionSettings as NStorage.Local.ExtensionSettings | undefined
    const storageArea =
      settings?.storageEngine === 'local' ? chrome.storage.local : chrome.storage.sync

    const data = await storageArea.get('autoGroups')
    const rules = (data.autoGroups || []) as NStorage.Sync.Schema.AutoGroupRule[]
    const activeRules = sortAutoGroupRules(rules.filter((r) => r.isActive))

    for (const tab of tabs) {
      if (!tab.url || !tab.id) continue
      summary.scanned++

      const res = await handleAutoGrouping(tab.id, tab.url, tab.windowId, activeRules)
      if (res.kind === 'grouped') summary.grouped++
      if (res.kind === 'already_grouped') summary.alreadyGrouped++
    }
  } catch (e) {
    console.error('[Background] Scan tabs error:', e)
    summary.errors++
  }

  return summary
}

const trackCurrentSession = async () => {
  try {
    const allWindows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] })
    const snapshot = {
      timestamp: new Date().toISOString(),
      tabCount: allWindows.reduce((acc, win) => acc + (win.tabs?.length || 0), 0),
      windows: allWindows.map((win) => ({
        id: win.id,
        tabs: (win.tabs || []).map((t) => ({ url: t.url, title: t.title, groupId: t.groupId })),
      })),
    }
    if (snapshot.tabCount > 0) await chrome.storage.local.set({ last_known_good_session: snapshot })
  } catch (e) {}
}

// --- EVENT LISTENERS ---
// Keep track of tabs currently being auto-grouped to prevent concurrent races and loops
const pendingAutoGroups = new Set<number>()

const handleTabUpdate = async (tabId: number, windowId: number, url?: string) => {
  if (!url || shouldIgnoreAutoGroupUrl(url)) return
  if (pendingAutoGroups.has(tabId)) return

  pendingAutoGroups.add(tabId)
  try {
    const settingsData = await chrome.storage.local.get('extensionSettings')
    const settings = settingsData.extensionSettings as NStorage.Local.ExtensionSettings | undefined

    // Check global enable switch
    const autoGroupingEnabled = settings?.autoGroupingEnabled ?? true
    if (!autoGroupingEnabled) return

    const storageArea =
      settings?.storageEngine === 'local' ? chrome.storage.local : chrome.storage.sync
    const data = await storageArea.get('autoGroups')
    const rules = (data.autoGroups || []) as NStorage.Sync.Schema.AutoGroupRule[]
    const activeRules = sortAutoGroupRules(rules.filter((r) => r.isActive))

    if (activeRules.length > 0) {
      // Support scan delay if scanDebounceTime is set
      const debounceTime = settings?.scanDebounceTime ?? 0
      if (debounceTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, debounceTime))
        // Verify tab is still open and has same URL after delay
        try {
          const currentTab = await chrome.tabs.get(tabId)
          if (!currentTab || currentTab.url !== url) return
        } catch {
          return // Tab was closed during delay
        }
      }
      await handleAutoGrouping(tabId, url, windowId, activeRules)
    }
  } catch (e) {
    console.error('[Background] Automation error:', e)
  } finally {
    pendingAutoGroups.delete(tabId)
  }
}

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  const windowId = tab.windowId
  if (windowId === undefined) return

  const hasUrlChanged = !!change.url
  const isStatusComplete = change.status === 'complete'

  if (hasUrlChanged || isStatusComplete) {
    const targetUrl = tab.url
    if (!targetUrl) return

    chrome.storage.local.get('extensionSettings').then((data) => {
      const settings = data.extensionSettings as NStorage.Local.ExtensionSettings | undefined
      const groupOnTabUpdated = settings?.groupOnTabUpdated ?? true
      if (groupOnTabUpdated) {
        void handleTabUpdate(tabId, windowId, targetUrl)
      }
    })
  }

  if (change.url || change.status || change.groupId !== undefined) {
    void trackCurrentSession()
  }
})

chrome.tabs.onCreated.addListener((tab) => {
  const tabId = tab.id
  const windowId = tab.windowId
  if (tabId !== undefined && windowId !== undefined) {
    chrome.storage.local.get('extensionSettings').then((data) => {
      const settings = data.extensionSettings as NStorage.Local.ExtensionSettings | undefined
      const groupOnTabCreated = settings?.groupOnTabCreated ?? true
      if (groupOnTabCreated) {
        // Note: onCreated might not have URL yet, handleTabUpdate will skip if url is missing
        void handleTabUpdate(tabId, windowId, tab.url)
      }
    })
  }
  void trackCurrentSession()
})

chrome.tabs.onRemoved.addListener(trackCurrentSession)
chrome.windows.onCreated.addListener(trackCurrentSession)
chrome.windows.onRemoved.addListener(trackCurrentSession)

// Note: STORAGE_SYNC_LOCK port listener removed as mutations are now centralized in the background worker promise queue.

// --- SIDE PANEL BEHAVIOR ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[Background] Failed to set side panel behavior:', error))
})

// Also run at top level to ensure behavior is set immediately on service worker startup/reloads
chrome.sidePanel
  ?.setPanelBehavior?.({ openPanelOnActionClick: true })
  .catch((error) =>
    console.error('[Background] Failed to set side panel behavior at top level:', error),
  )
