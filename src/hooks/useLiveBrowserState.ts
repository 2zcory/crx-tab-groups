import { useState, useEffect } from "react";
import onTabUpdated from "@/listeners/onTabUpdated";

interface TabGroup extends chrome.tabGroups.TabGroup {
  tabs: chrome.tabs.Tab[];
}

interface WindowData {
  id: number;
  isCurrent: boolean;
  groups: TabGroup[];
  tabsPinned: chrome.tabs.Tab[];
  tabsUngroup: chrome.tabs.Tab[];
  totalTabs: number;
}

export function useLiveBrowserState() {
  const [windows, setWindows] = useState<WindowData[]>([]);
  const [totalTabsCount, setTotalTabsCount] = useState(0);

  const getActiveState = async () => {
    const currentWindow = await chrome.windows.getCurrent();
    const allWindows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    const allGroups = await chrome.tabGroups.query({});
    
    let globalTabCount = 0;

    const windowDataList: WindowData[] = allWindows.map(win => {
      const winId = win.id!;
      const winTabs = win.tabs || [];
      globalTabCount += winTabs.length;

      const winGroups = allGroups.filter(g => g.windowId === winId);
      const tabListByGroups: Record<string, chrome.tabs.Tab[]> = {};

      winTabs.forEach((tab) => {
        const gId = `${tab.groupId}`;
        if (!tabListByGroups[gId]) tabListByGroups[gId] = [];
        tabListByGroups[gId].push(tab);
      });

      const groupsIncludeTabs = winGroups.map((group) => ({
        ...group,
        tabs: tabListByGroups[group.id] || [],
      }));

      const pinned: chrome.tabs.Tab[] = [];
      const ungroup: chrome.tabs.Tab[] = [];

      if (tabListByGroups["-1"]?.length) {
        tabListByGroups["-1"].forEach((tab) => {
          if (tab.pinned) pinned.push(tab);
          else ungroup.push(tab);
        });
      }

      return {
        id: winId,
        isCurrent: winId === currentWindow.id,
        groups: groupsIncludeTabs,
        tabsPinned: pinned,
        tabsUngroup: ungroup,
        totalTabs: winTabs.length
      };
    });

    // Sort current window to top
    windowDataList.sort((a, b) => (a.isCurrent === b.isCurrent ? 0 : a.isCurrent ? -1 : 1));

    setWindows(windowDataList);
    setTotalTabsCount(globalTabCount);
  };

  // Register listener correctly at the top level of the hook
  onTabUpdated(() => {
    getActiveState();
  });

  return { windows, totalTabsCount, refresh: getActiveState };
}
