console.log('[CrxTabGroups] Background Service Worker is starting...');

// Standard Chrome Group Colors
const COLOR_MAP: Record<string, string> = {
  grey: "bg-slate-400",
  blue: "bg-blue-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
  pink: "bg-pink-500",
  purple: "bg-purple-500",
  cyan: "bg-cyan-500",
  orange: "bg-orange-500",
};

// Helper: Show notification to the user
const notify = (title: string, message: string) => {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'img/logo-48.png',
      title: title,
      message: message,
      priority: 2
    });
  } catch (e) {
    console.error('[Notify Error]', e);
  }
};

// Helper: Convert user pattern to a robust Regex
const patternToRegex = (pattern: string) => {
  try {
    const cleaned = pattern.trim().toLowerCase();
    // Escape special chars except *
    let regexStr = cleaned.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    // Convert * to .*
    regexStr = regexStr.replace(/\*/g, '.*');
    // If no wildcard, assume it can be anywhere in the URL
    if (!cleaned.includes('*')) {
      return new RegExp(regexStr, 'i');
    }
    return new RegExp('^' + regexStr + '$', 'i');
  } catch (e) {
    return new RegExp(pattern, 'i');
  }
};

// Core Automation Logic
const handleAutoGrouping = async (tabId: number, url: string | undefined, windowId: number) => {
  if (!url || url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) {
    return;
  }

  try {
    const data = await chrome.storage.sync.get('autoGroups');
    const rules = (data.autoGroups || []) as any[];
    const activeRules = rules.filter(r => r.isActive);

    if (activeRules.length === 0) return;

    for (const rule of activeRules) {
      const regex = patternToRegex(rule.urlPattern);
      
      if (regex.test(url)) {
        console.log(`[AutoGroup] Match found! URL: ${url} matches Rule: ${rule.title}`);
        
        const groups = await chrome.tabGroups.query({ windowId });
        const targetGroup = groups.find(g => g.title?.toLowerCase() === rule.title.toLowerCase());

        if (targetGroup) {
          const tab = await chrome.tabs.get(tabId);
          if (tab.groupId === targetGroup.id) {
            console.log(`[AutoGroup] Tab already in group: ${rule.title}`);
            break;
          }
          await chrome.tabs.group({ tabIds: [tabId], groupId: targetGroup.id });
          notify('Crx Tab Groups', `Auto-grouped to "${rule.title}"`);
        } else {
          const newGroupId = await chrome.tabs.group({ tabIds: [tabId] });
          await chrome.tabGroups.update(newGroupId, {
            title: rule.title,
            color: rule.color
          });
          notify('Crx Tab Groups', `New group "${rule.title}" created!`);
        }
        break; 
      }
    }
  } catch (error) {
    console.error('[AutoGroup] Runtime Error:', error);
  }
};

// Listeners
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    void handleAutoGrouping(tabId, tab.url || changeInfo.url, tab.windowId);
  }
});

// Manual trigger from UI
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'run_auto_group_scan') {
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({ windowId: request.windowId });
        for (const tab of tabs) {
          if (tab.id && tab.url) {
            await handleAutoGrouping(tab.id, tab.url, tab.windowId);
          }
        }
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e });
      }
    })();
    return true; 
  }
});

// Sidepanel behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Initial notification to confirm background is alive
notify('Crx Tab Groups', 'Automation Service is active 🚀');
