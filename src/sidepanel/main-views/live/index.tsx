import { MOCK_GROUP } from "@/constants";
import { EMockGroup } from "@/enums";
import { extractDomainNameFromUrl } from "@/helpers";
import onTabUpdated from "@/listeners/onTabUpdated";
import StorageSyncFavIcon from "@/storage/favIcon.sync";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import TopSites from "./components/TopSites";
import { BentoGroupCard } from "@/components/BentoGroupCard";
import Tooltip from "@/components/ui/tooltip";

interface TabGroup extends chrome.tabGroups.TabGroup {
  tabs: chrome.tabs.Tab[];
}

function LiveManagement() {
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [tabsPinned, setTabsPinned] = useState<chrome.tabs.Tab[]>([]);
  const [tabsUngroup, setTabsUngroup] = useState<chrome.tabs.Tab[]>([]);

  onTabUpdated(() => {
    getActiveGroups();
  });

  useEffect(() => {
    const timer = setTimeout(() => addFavIconsToStorage(), 30000);
    return () => clearTimeout(timer);
  }, [tabs]);

  useEffect(() => {
    getActiveGroups();
  }, []);

  const addFavIconsToStorage = async () => {
    const favIcons = await StorageSyncFavIcon.get();
    tabs.forEach((tab) => {
      if (!tab.url) return;
      const domainNameExtract = extractDomainNameFromUrl(tab.url);
      if (!tab.favIconUrl || !domainNameExtract) return;
      favIcons[domainNameExtract] = {
        url: tab.favIconUrl,
        lastOpened: new Date().toISOString(),
      };
    });
    await StorageSyncFavIcon.update(favIcons);
  };

  const getActiveGroups = async () => {
    const activeGroups = await chrome.tabGroups.query({});
    const activeTabs = await chrome.tabs.query({});
    const tabListByGroups: Record<string, chrome.tabs.Tab[]> = {};

    activeTabs.forEach((tab) => {
      const gId = `${tab.groupId}`;
      if (!tabListByGroups[gId]) tabListByGroups[gId] = [];
      tabListByGroups[gId].push(tab);
    });

    const groupsIncludeTabs = activeGroups.map((group) => ({
      ...group,
      tabs: tabListByGroups[group.id] || [],
    }));

    if (tabListByGroups["-1"]?.length) {
      const pinned: chrome.tabs.Tab[] = [];
      const ungroup: chrome.tabs.Tab[] = [];

      tabListByGroups["-1"].forEach((tab) => {
        if (tab.pinned) pinned.push(tab);
        else ungroup.push(tab);
      });

      setTabsPinned(pinned);
      setTabsUngroup(ungroup);
    } else {
      setTabsPinned([]);
      setTabsUngroup([]);
    }

    setTabs(activeTabs);
    setGroups(groupsIncludeTabs);
  };

  return (
    <div className="flex flex-col gap-3 p-1.5">
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Live
            </p>
            <Tooltip>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  className="inline-flex size-5 items-center justify-center rounded-full border border-black/5 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-1"
                  aria-label="About Live"
                >
                  <Info size={12} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" sideOffset={8} className="max-w-56 rounded-xl bg-slate-900 px-3 py-2 text-[11px] leading-relaxed text-slate-50 shadow-lg">
                Live shows your current browser state in real time. Pinned, grouped, and ungrouped tabs can be inspected and acted on here. Saved snapshots are managed separately.
              </Tooltip.Content>
            </Tooltip>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-1.5">
          <span className="rounded-full border border-black/5 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {tabs.length} tabs
          </span>
          <span className="rounded-full border border-black/5 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {groups.length} groups
          </span>
          <span className="rounded-full border border-black/5 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {tabsUngroup.length} ungrouped
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-2.5">
        {tabsPinned.length > 0 && (
          <BentoGroupCard
            title={MOCK_GROUP[EMockGroup.PINNED]}
            tabs={tabsPinned}
            className="bg-slate-50 border-slate-200"
          />
        )}

        {groups.map((group) => (
          <BentoGroupCard
            key={group.id}
            title={group.title || "Untitled Group"}
            color={group.color}
            tabs={group.tabs}
          />
        ))}

        {tabsUngroup.length > 0 && (
          <BentoGroupCard
            title={MOCK_GROUP[EMockGroup.UNGROUP]}
            tabs={tabsUngroup}
            className="bg-white border-dashed border-slate-300"
          />
        )}
      </div>

      {tabs.length > 0 && <TopSites />}

      {tabs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-slate-400">
          <p className="text-sm font-medium text-slate-600">No active tabs found</p>
          <p className="mt-1 text-xs">Your live browser state is empty right now.</p>
        </div>
      )}
    </div>
  );
}

export default LiveManagement;
