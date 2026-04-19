import StorageSyncAutoGroup from "@/storage/autoGroup.sync";

console.log('background is running')

chrome.runtime.onMessage.addListener((request) => {
  console.log(`request`, request)
})

// Allows users to open the side panel by clicking on the action toolbar icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Auto-grouping logic
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    const url = tab.url;
    if (!url) return;

    const rules = await StorageSyncAutoGroup.getList();
    const activeRules = rules.filter(r => r.isActive);

    for (const rule of activeRules) {
      // Simple matching logic: check if URL contains the pattern
      // You can expand this with glob-to-regex later if needed
      const isMatch = url.includes(rule.urlPattern) || 
                      (rule.urlPattern.includes('*') && new RegExp(rule.urlPattern.replace(/\*/g, '.*')).test(url));

      if (isMatch) {
        const windowId = tab.windowId;
        const groups = await chrome.tabGroups.query({ windowId });
        
        let targetGroup = groups.find(g => g.title === rule.title);

        if (targetGroup) {
          await chrome.tabs.group({ tabIds: tabId, groupId: targetGroup.id });
        } else {
          const newGroupId = await chrome.tabs.group({ tabIds: tabId });
          await chrome.tabGroups.update(newGroupId, {
            title: rule.title,
            color: rule.color
          });
        }
        break; // Stop after first match
      }
    }
  }
});

