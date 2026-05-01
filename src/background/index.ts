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
  console.log('[Background] Received message:', request.action)

  if (request.action === 'STORAGE_SYNC_MUTATE') {
    try {
      if (!request.params || typeof request.params !== 'object') {
        throw new Error('Invalid mutation params')
      }

      chrome.storage.sync.set(request.params, () => {
        const err = chrome.runtime.lastError
        if (err) {
          console.error('[Background] Mutation error:', err.message)
          sendResponse({ success: false, error: err.message })
        } else {
          console.log('[Background] Mutation success')
          sendResponse({ success: true })
        }
      })
    } catch (e) {
      console.error('[Background] Mutation sync error:', e)
      sendResponse({ success: false, error: String(e) })
    }
    return true
  }

  if (request.action === 'run_auto_group_scan') {
    chrome.tabs.query(request.windowId ? { windowId: request.windowId } : {}, (tabs) => {
      const err = chrome.runtime.lastError
      if (err) {
        sendResponse({ success: false, error: err.message })
        return
      }

      scanTabs(tabs).then(summary => {
        console.log('[Background] Scan success:', summary)
        sendResponse({ success: true, summary })
      }).catch(e => {
        console.error('[Background] Scan error:', e)
        sendResponse({ success: false, error: String(e) })
      })
    })
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

  console.log('[Background] Unhandled message action:', request.action)
  return false
})

// --- AUTO GROUPING ---
const handleAutoGrouping = async (
  tabId: number, 
  url: string | undefined, 
  windowId: number, 
  activeRules: NStorage.Sync.Schema.AutoGroupRule[]
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
        const targetGroup = groups.find((g) => 
          g.title?.trim().toLowerCase() === rule.title.trim().toLowerCase()
        )
        
        if (targetGroup) {
          if (tab.groupId === targetGroup.id) {
            console.log(`[Automation] Tab ${tabId} already in target group: ${rule.title}`)
            return { kind: 'already_grouped' }
          }
          await chrome.tabs.group({ tabIds: [tabId], groupId: targetGroup.id })
          console.log(`[Automation] Grouped tab ${tabId} into existing group: ${rule.title}`)
          return { kind: 'grouped' }
        } else {
          const gid = await chrome.tabs.group({ tabIds: [tabId] })
          await chrome.tabGroups.update(gid, { title: rule.title, color: rule.color })
          console.log(`[Automation] Created new group "${rule.title}" for tab ${tabId}`)
          return { kind: 'grouped' }
        }
      }
    }
  } catch (e) { 
    console.error('[Background] Auto-grouping error for tab', tabId, e) 
  }
  return { kind: 'no_match' }
}

const scanTabs = async (tabs: chrome.tabs.Tab[]) => {
  console.log(`[Background] Manual scan triggered for ${tabs.length} tabs`)
  const summary = { scanned: 0, matched: 0, grouped: 0, created: 0, alreadyGrouped: 0, errors: 0 }
  
  try {
    const data = await chrome.storage.sync.get('autoGroups')
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
      windows: allWindows.map(win => ({
        id: win.id,
        tabs: (win.tabs || []).map(t => ({ url: t.url, title: t.title, groupId: t.groupId }))
      }))
    }
    if (snapshot.tabCount > 0) await chrome.storage.local.set({ last_known_good_session: snapshot })
  } catch (e) {}
}

// --- EVENT LISTENERS ---
const handleTabUpdate = async (tabId: number, windowId: number, url?: string) => {
  if (!url || shouldIgnoreAutoGroupUrl(url)) return

  try {
    const data = await chrome.storage.sync.get('autoGroups')
    const rules = (data.autoGroups || []) as NStorage.Sync.Schema.AutoGroupRule[]
    const activeRules = sortAutoGroupRules(rules.filter((r) => r.isActive))
    
    if (activeRules.length > 0) {
      await handleAutoGrouping(tabId, url, windowId, activeRules)
    }
  } catch (e) {
    console.error('[Background] Automation error:', e)
  }
}

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  const targetUrl = change.url || tab.url
  if (targetUrl || change.status === 'complete') {
    void handleTabUpdate(tabId, tab.windowId, targetUrl)
    void trackCurrentSession()
  }
})

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id) {
    // Note: onCreated might not have URL yet, handleTabUpdate will skip if url is missing
    void handleTabUpdate(tab.id, tab.windowId, tab.url)
  }
  void trackCurrentSession()
})

chrome.tabs.onRemoved.addListener(trackCurrentSession)
chrome.windows.onCreated.addListener(trackCurrentSession)
chrome.windows.onRemoved.addListener(trackCurrentSession)
