import StorageSyncAutoGroup from "@/storage/autoGroup.sync";
import migrateScheme from "@/migrations";

console.log('background is running')

// Ensure database is up to date even if side panel is never opened
migrateScheme().then(() => {
  console.log('[AutoGroup] Database migrated and ready');
}).catch(err => {
  console.error('[AutoGroup] Migration failed:', err);
});

chrome.runtime.onMessage.addListener((request) => {
  console.log(`request`, request)
})

// Allows users to open the side panel by clicking on the action toolbar icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Auto-grouping logic
const handleAutoGrouping = async (tabId: number, url: string | undefined, windowId: number, tab: chrome.tabs.Tab) => {
  if (!url || url.startsWith('chrome://') || url.startsWith('edge://')) return;

  try {
    const rules = await StorageSyncAutoGroup.getList();
    const activeRules = rules.filter(r => r.isActive);

    for (const rule of activeRules) {
      const pattern = rule.urlPattern.trim().toLowerCase();
      const currentUrl = url.toLowerCase();
      
      // Flexible matching: simple inclusion OR wildcard regex
      const isMatch = currentUrl.includes(pattern) || 
                      (pattern.includes('*') && new RegExp(pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')).test(currentUrl));

      if (isMatch) {
        console.log(`[AutoGroup] Match found for ${currentUrl} with rule: ${rule.title}`);
        const groups = await chrome.tabGroups.query({ windowId });
        let targetGroup = groups.find(g => g.title === rule.title);

        if (targetGroup) {
          // Skip if already in the correct group
          if (tab.groupId === targetGroup.id) {
            console.log(`[AutoGroup] Tab ${tabId} already in group: ${rule.title}`);
            break;
          }
          await chrome.tabs.group({ tabIds: [tabId], groupId: targetGroup.id });
          console.log(`[AutoGroup] Moved tab ${tabId} to existing group: ${rule.title}`);
        } else {
          const newGroupId = await chrome.tabs.group({ tabIds: [tabId] });
          await chrome.tabGroups.update(newGroupId, {
            title: rule.title,
            color: rule.color
          });
          console.log(`[AutoGroup] Created new group: ${rule.title} for tab ${tabId}`);
        }
        break; 
      }
    }
  } catch (error) {
    console.error('[AutoGroup] Error:', error);
  }
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    void handleAutoGrouping(tabId, tab.url, tab.windowId, tab);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id && tab.url) {
    void handleAutoGrouping(tab.id, tab.url, tab.windowId, tab);
  }
});

