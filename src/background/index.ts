import StorageSyncAutoGroup from "../storage/autoGroup.sync";
import migrateScheme from "../migrations";

console.log('[CrxTabGroups] Background service worker starting...');

// Ensure database is up to date immediately
migrateScheme().then(() => {
  console.log('[AutoGroup] Database migrated and ready');
}).catch(err => {
  console.error('[AutoGroup] Migration failed:', err);
});

// Robust pattern to regex converter
const patternToRegex = (pattern: string) => {
  try {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const wildcarded = escaped.replace(/\*/g, '.*');
    return new RegExp(wildcarded, 'i');
  } catch (e) {
    return new RegExp(pattern.trim(), 'i');
  }
};

// Notification helper
const notify = (title: string, message: string) => {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'img/logo-48.png',
    title: title,
    message: message,
    priority: 2
  });
};

// Main Auto-grouping logic
const handleAutoGrouping = async (tabId: number, url: string | undefined, windowId: number) => {
  if (!url || url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) {
    return;
  }

  try {
    const rules = await StorageSyncAutoGroup.getList();
    const activeRules = rules.filter(r => r.isActive);

    if (activeRules.length === 0) return;

    for (const rule of activeRules) {
      const regex = patternToRegex(rule.urlPattern.trim());
      
      if (regex.test(url)) {
        console.log(`[AutoGroup] Match! URL: ${url} matches Pattern: ${rule.urlPattern}`);
        
        const groups = await chrome.tabGroups.query({ windowId });
        const targetGroup = groups.find(g => g.title?.toLowerCase() === rule.title.toLowerCase());

        if (targetGroup) {
          const tab = await chrome.tabs.get(tabId);
          if (tab.groupId === targetGroup.id) {
            break;
          }
          await chrome.tabs.group({ tabIds: [tabId], groupId: targetGroup.id });
          notify('Auto-Grouped!', `Tab moved to "${rule.title}" group.`);
        } else {
          const newGroupId = await chrome.tabs.group({ tabIds: [tabId] });
          await chrome.tabGroups.update(newGroupId, {
            title: rule.title,
            color: rule.color
          });
          notify('New Group Created!', `Started "${rule.title}" group for this tab.`);
        }
        break; 
      }
    }
  } catch (error) {
    console.error('[AutoGroup] Execution Error:', error);
  }
};

// Listen for messages from UI (e.g., manual scan request)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'run_auto_group_scan') {
    void (async () => {
      const tabs = await chrome.tabs.query({ windowId: request.windowId });
      for (const tab of tabs) {
        if (tab.id && tab.url) {
          await handleAutoGrouping(tab.id, tab.url, tab.windowId);
        }
      }
      sendResponse({ success: true });
    })();
    return true; // Keep channel open for async response
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    void handleAutoGrouping(tabId, tab.url || changeInfo.url, tab.windowId);
  }
});

chrome.webNavigation?.onCommitted?.addListener(async (details) => {
  if (details.frameId === 0) {
    try {
      const tab = await chrome.tabs.get(details.tabId);
      void handleAutoGrouping(details.tabId, details.url, tab.windowId);
    } catch (e) {}
  }
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
