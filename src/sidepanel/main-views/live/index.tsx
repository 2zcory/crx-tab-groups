import { MOCK_GROUP } from "@/constants";
import { EMockGroup } from "@/enums";
import { extractDomainNameFromUrl } from "@/helpers";
import onTabUpdated from "@/listeners/onTabUpdated";
import StorageSyncFavIcon from "@/storage/favIcon.sync";
import StorageSyncGroup from "@/storage/group.sync";
import StorageSyncTab from "@/storage/tab.sync";
import { useEffect, useState } from "react";
import { CheckCircle2, FolderPlus, Info, LoaderCircle } from "lucide-react";
import TopSites from "./components/TopSites";
import { BentoGroupCard } from "@/components/BentoGroupCard";
import Tooltip from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TabGroup extends chrome.tabGroups.TabGroup {
  tabs: chrome.tabs.Tab[];
}

type SaveState = "idle" | "pending" | "saved" | "failed";

interface SaveStatus {
  state: SaveState;
  message?: string;
}

function LiveManagement() {
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [tabsPinned, setTabsPinned] = useState<chrome.tabs.Tab[]>([]);
  const [tabsUngroup, setTabsUngroup] = useState<chrome.tabs.Tab[]>([]);
  const [saveStatuses, setSaveStatuses] = useState<Record<number, SaveStatus>>({});

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

  const setSaveStatus = (groupId: number, status: SaveStatus) => {
    setSaveStatuses((current) => ({
      ...current,
      [groupId]: status,
    }));
  };

  const saveGroupSnapshot = async (group: TabGroup) => {
    setSaveStatus(group.id, {
      state: "pending",
      message: "Saving snapshot...",
    });

    const now = new Date().toISOString();
    const snapshotGroupId = crypto.randomUUID();
    const snapshotGroup: NStorage.Sync.Schema.Group = {
      id: snapshotGroupId,
      title: group.title || "Untitled Group",
      order: Date.now(),
      color: group.color,
      createdAt: now,
      updatedAt: now,
      lastOpened: now,
    };

    const snapshotTabs: NStorage.Sync.Schema.Tab[] = group.tabs.map((tab, index) => ({
      id: crypto.randomUUID(),
      title: tab.title || "Untitled Tab",
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      order: index + 1,
      groupId: snapshotGroupId,
      createdAt: now,
      updatedAt: now,
      lastOpened: tab.lastAccessed ? new Date(tab.lastAccessed).toISOString() : now,
    }));

    const missingUrlCount = snapshotTabs.filter((tab) => !tab.url).length;

    try {
      await StorageSyncGroup.create(snapshotGroup);
      await StorageSyncTab.create(...snapshotTabs);

      setSaveStatus(group.id, {
        state: "saved",
        message:
          missingUrlCount === 0
            ? "Snapshot saved with restore-ready URLs."
            : `Snapshot saved, but ${missingUrlCount} tab${missingUrlCount === 1 ? "" : "s"} missing URL data may not restore later.`,
      });
    } catch {
      setSaveStatus(group.id, {
        state: "failed",
        message: "Snapshot save failed. Please try again.",
      });
    }
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
            actions={
              <div className="flex items-center gap-2">
                {saveStatuses[group.id] && saveStatuses[group.id].state !== "idle" && (
                  <span
                    className={cn(
                      "hidden rounded-full px-2 py-0.5 text-[10px] font-medium md:inline-flex",
                      saveStatuses[group.id].state === "saved"
                        ? "bg-emerald-100 text-emerald-700"
                        : saveStatuses[group.id].state === "failed"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-slate-200 text-slate-600",
                    )}
                  >
                    {saveStatuses[group.id].state === "pending"
                      ? "Saving"
                      : saveStatuses[group.id].state === "saved"
                        ? "Saved"
                        : "Retry"}
                  </span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full border-black/10 bg-white/80 px-2.5 text-[11px] text-slate-700 shadow-none hover:bg-white"
                  disabled={saveStatuses[group.id]?.state === "pending"}
                  onClick={(event) => {
                    event.stopPropagation();
                    void saveGroupSnapshot(group);
                  }}
                >
                  {saveStatuses[group.id]?.state === "pending" ? (
                    <>
                      <LoaderCircle className="animate-spin" size={12} />
                      Saving
                    </>
                  ) : saveStatuses[group.id]?.state === "saved" ? (
                    <>
                      <CheckCircle2 size={12} />
                      Saved
                    </>
                  ) : (
                    <>
                      <FolderPlus size={12} />
                      Save snapshot
                    </>
                  )}
                </Button>
              </div>
            }
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

      {Object.values(saveStatuses).some((status) => status.message) && (
        <div className="flex flex-col gap-2">
          {groups
            .map((group) => ({ group, status: saveStatuses[group.id] }))
            .filter(({ status }) => Boolean(status?.message))
            .map(({ group, status }) => (
              <div
                key={group.id}
                className={cn(
                  "rounded-2xl border px-3 py-2 text-xs",
                  status?.state === "saved"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : status?.state === "failed"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-slate-200 bg-slate-50 text-slate-600",
                )}
              >
                <span className="font-medium">{group.title || "Untitled Group"}:</span>{" "}
                {status?.message}
              </div>
            ))}
        </div>
      )}

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
