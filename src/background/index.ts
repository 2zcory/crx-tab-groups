import {
  describeRulePattern,
  getAutoGroupRulePatterns,
  matchesAutoGroupRule,
  shouldIgnoreAutoGroupUrl,
  sortAutoGroupRules,
} from '@/helpers'

console.log('[CrxTabGroups] Background Service Worker is starting...');

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

type AutoGroupResult =
  | { kind: 'ignored' | 'no_match' }
  | { kind: 'already_grouped'; ruleTitle: string }
  | { kind: 'grouped'; ruleTitle: string; groupCreated: boolean }
  | { kind: 'error'; error: string }

const resolveTargetGroup = async (windowId: number, rule: NStorage.Sync.Schema.AutoGroupRule) => {
  const groups = await chrome.tabGroups.query({ windowId })
  const normalizedTitle = rule.title.trim().toLowerCase()
  const titleMatches = groups.filter((group) => group.title?.trim().toLowerCase() === normalizedTitle)

  if (titleMatches.length === 0) return null

  const exactColorMatch = titleMatches.find((group) => group.color === rule.color)
  if (exactColorMatch) return exactColorMatch

  if (titleMatches.length === 1) return titleMatches[0]

  return null
}

// Core Automation Logic
const handleAutoGrouping = async (tabId: number, url: string | undefined, windowId: number): Promise<AutoGroupResult> => {
  if (shouldIgnoreAutoGroupUrl(url)) {
    return { kind: 'ignored' };
  }

  try {
    const data = await chrome.storage.sync.get('autoGroups');
    const rules = (data.autoGroups || []) as NStorage.Sync.Schema.AutoGroupRule[];
    const activeRules = sortAutoGroupRules(rules.filter((rule) => rule.isActive));

    if (activeRules.length === 0) return { kind: 'no_match' };

    for (const rule of activeRules) {
      const patterns = getAutoGroupRulePatterns(rule)
      const matchedPattern = url ? patterns.find((pattern) => matchesAutoGroupRule(url, pattern)) : undefined

      if (url && matchedPattern) {
        console.log(`[AutoGroup] Match found! URL: ${url} matches Rule: ${rule.title} (${describeRulePattern(matchedPattern)})`);
        const targetGroup = await resolveTargetGroup(windowId, rule);

        if (targetGroup) {
          const tab = await chrome.tabs.get(tabId);
          if (tab.groupId === targetGroup.id) {
            console.log(`[AutoGroup] Tab already in group: ${rule.title}`);
            return { kind: 'already_grouped', ruleTitle: rule.title };
          }
          await chrome.tabs.group({ tabIds: [tabId], groupId: targetGroup.id });
          notify('Crx Tab Groups', `Auto-grouped to "${rule.title}"`);
          return { kind: 'grouped', ruleTitle: rule.title, groupCreated: false };
        } else {
          const newGroupId = await chrome.tabs.group({ tabIds: [tabId] });
          await chrome.tabGroups.update(newGroupId, {
            title: rule.title,
            color: rule.color
          });
          notify('Crx Tab Groups', `New group "${rule.title}" created!`);
          return { kind: 'grouped', ruleTitle: rule.title, groupCreated: true };
        }
      }
    }

    return { kind: 'no_match' };
  } catch (error) {
    console.error('[AutoGroup] Runtime Error:', error);
    return {
      kind: 'error',
      error: error instanceof Error ? error.message : 'Unknown auto-group error',
    };
  }
};

// Listeners
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    void handleAutoGrouping(tabId, tab.url || changeInfo.url, tab.windowId);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (typeof tab.id === 'number' && tab.url) {
    void handleAutoGrouping(tab.id, tab.url, tab.windowId);
  }
});

// Manual trigger from UI
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'run_auto_group_scan') {
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({ windowId: request.windowId });
        const summary = {
          scanned: 0,
          matched: 0,
          grouped: 0,
          created: 0,
          alreadyGrouped: 0,
          errors: 0,
        };

        for (const tab of tabs) {
          if (tab.id && tab.url) {
            summary.scanned += 1;
            const result = await handleAutoGrouping(tab.id, tab.url, tab.windowId);

            if (result.kind === 'grouped') {
              summary.matched += 1;
              summary.grouped += 1;
              if (result.groupCreated) summary.created += 1;
            }

            if (result.kind === 'already_grouped') {
              summary.matched += 1;
              summary.alreadyGrouped += 1;
            }

            if (result.kind === 'error') {
              summary.errors += 1;
            }
          }
        }

        if (summary.errors > 0) {
          notify('Crx Tab Groups', `Auto-group scan completed with ${summary.errors} error(s).`);
        } else if (summary.grouped > 0) {
          notify('Crx Tab Groups', `Auto-group scan updated ${summary.grouped} tab(s).`);
        } else if (summary.alreadyGrouped > 0) {
          notify('Crx Tab Groups', 'Auto-group scan found matching tabs already in place.');
        } else {
          notify('Crx Tab Groups', 'Auto-group scan found no matching tabs.');
        }

        sendResponse({ success: summary.errors === 0, summary });
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown scan error';
        sendResponse({ success: false, error: errorMessage });
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
