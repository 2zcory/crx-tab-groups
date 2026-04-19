import StorageSyncAutoGroup from "../storage/autoGroup.sync";
import migrateScheme from "../migrations";

console.log('[CrxTabGroups] Background service worker starting...');

// Ensure database is up to date immediately
migrateScheme().then(() => {
  console.log('[AutoGroup] Database migrated and ready');
}).catch(err => {
  console.error('[AutoGroup] Migration failed:', err);
});

// Helper to escape regex special characters except *
const patternToRegex = (pattern: string) => {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const wildcarded = escaped.replace(/\*/g, '.*');
  return new RegExp(wildcarded, 'i');
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
          // Verify current tab status to avoid redundant calls
          const tab = await chrome.tabs.get(tabId);
          if (tab.groupId === targetGroup.id) {
            console.log(`[AutoGroup] Tab ${tabId} already in correct group.`);
            break;
          }
          await chrome.tabs.group({ tabIds: [tabId], groupId: targetGroup.id });
          console.log(`[AutoGroup] Added tab ${tabId} to existing group: ${rule.title}`);
        } else {
          const newGroupId = await chrome.tabs.group({ tabIds: [tabId] });
          await chrome.tabGroups.update(newGroupId, {
            title: rule.title,
            color: rule.color
          });
          console.log(`[AutoGroup] Created new group: ${rule.title} for tab ${tabId}`);
        }
        break; // Stop after first match
      }
    }
  } catch (error) {
    console.error('[AutoGroup] Execution Error:', error);
  }
};

// Listen for tab updates (URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    void handleAutoGrouping(tabId, tab.url || changeInfo.url, tab.windowId);
  }
});

// Listen for web navigation (More reliable for some cases)
chrome.webNavigation?.onCommitted?.addListener(async (details) => {
  if (details.frameId === 0) { // Only main frame
    try {
      const tab = await chrome.tabs.get(details.tabId);
      void handleAutoGrouping(details.tabId, details.url, tab.windowId);
    } catch (e) {
      console.error('[AutoGroup] webNavigation Error:', e);
    }
  }
});
