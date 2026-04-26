import {
  describeRulePattern,
  getAutoGroupRulePatterns,
  matchesAutoGroupRule,
  shouldIgnoreAutoGroupUrl,
  sortAutoGroupRules,
} from '@/helpers'
import StorageLocalAutoGroup from '@/storage/autoGroup.local'

console.log('[CrxTabGroups] Background Service Worker active.')

// --- MESSAGE ROUTER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'STORAGE_SYNC_MUTATE') {
    chrome.storage.sync.set(request.params)
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: String(e) }))
    return true
  }

  if (request.action === 'run_auto_group_scan') {
    chrome.tabs.query(request.windowId ? { windowId: request.windowId } : {})
      .then(tabs => scanTabs(tabs))
      .then(summary => sendResponse({ success: true, summary }))
      .catch(e => sendResponse({ success: false, error: String(e) }))
    return true
  }

  if (request.action === 'get_auto_group_debug_state') {
    Promise.all([StorageLocalAutoGroup.getOwnershipRegistry(), StorageLocalAutoGroup.getAuditEntries()])
      .then(([ownership, audit]) => sendResponse({ success: true, ownership: Object.values(ownership), audit }))
      .catch((e) => sendResponse({ success: false, error: String(e) }))
    return true
  }

  if (request.action === 'clear_auto_group_audit') {
    StorageLocalAutoGroup.clearAuditEntries()
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: String(e) }))
    return true
  }

  return false
})

// --- AUTO GROUPING ---
const handleAutoGrouping = async (tabId: number, url: string | undefined, windowId: number) => {
  if (shouldIgnoreAutoGroupUrl(url)) return { kind: 'ignored' }
  try {
    const data = await chrome.storage.sync.get('autoGroups')
    const rules = (data.autoGroups || []) as NStorage.Sync.Schema.AutoGroupRule[]
    const activeRules = sortAutoGroupRules(rules.filter((r) => r.isActive))

    for (const rule of activeRules) {
      const patterns = getAutoGroupRulePatterns(rule)
      const matchedPattern = url ? patterns.find((p) => matchesAutoGroupRule(url, p)) : undefined
      if (url && matchedPattern) {
        const groups = await chrome.tabGroups.query({ windowId })
        const targetGroup = groups.find((g) => g.title?.trim().toLowerCase() === rule.title.trim().toLowerCase())
        if (targetGroup) {
          await chrome.tabs.group({ tabIds: [tabId], groupId: targetGroup.id })
          return { kind: 'grouped' }
        } else {
          const gid = await chrome.tabs.group({ tabIds: [tabId] })
          await chrome.tabGroups.update(gid, { title: rule.title, color: rule.color })
          return { kind: 'grouped' }
        }
      }
    }
  } catch (e) { console.error(e) }
  return { kind: 'no_match' }
}

const scanTabs = async (tabs: chrome.tabs.Tab[]) => {
  const summary = { scanned: 0, matched: 0, grouped: 0, created: 0, alreadyGrouped: 0, errors: 0 }
  for (const tab of tabs) {
    if (!tab.url) continue
    summary.scanned++
    const res = await handleAutoGrouping(tab.id!, tab.url, tab.windowId)
    if (res.kind === 'grouped') summary.grouped++
  }
  return summary
}

const trackCurrentSession = async () => {
  try {
    const allWindows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] })
    const snapshot = {
      timestamp: new Date().toISOString(),
      tabCount: allWindows.reduce((acc, win) => acc + (win.tabs?.length || 0), 0),
      windows: allWindows.map(win => ({
        id: win.id,
        tabs: (win.tabs || []).map(t => ({ url: t.url, title: t.title, groupId: t.groupId }))
      }))
    }
    if (snapshot.tabCount > 0) await chrome.storage.local.set({ last_known_good_session: snapshot })
  } catch (e) {}
}

chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url || change.status === 'complete') trackCurrentSession() })
chrome.tabs.onRemoved.addListener(trackCurrentSession)
chrome.windows.onCreated.addListener(trackCurrentSession)
chrome.windows.onRemoved.addListener(trackCurrentSession)
