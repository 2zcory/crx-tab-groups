import { MOCK_GROUP } from "@/constants";
import { EMockGroup } from "@/enums";
import { extractDomainNameFromUrl } from "@/helpers";
import onTabUpdated from "@/listeners/onTabUpdated";
import StorageSyncFavIcon from "@/storage/favIcon.sync";
import StorageSyncGroup from "@/storage/group.sync";
import StorageSyncTab from "@/storage/tab.sync";
import { useEffect, useState } from "react";
import { Check, CheckCircle2, FolderPlus, Info, LoaderCircle, RefreshCw, X, Monitor, Sparkles } from "lucide-react";
import TopSites from "./components/TopSites";
import { BentoGroupCard } from "@/components/BentoGroupCard";
import Tooltip from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

type SaveState = "idle" | "pending" | "saved" | "failed";

interface SaveStatus {
  state: SaveState;
  message?: string;
}

interface AutoGroupScanStatus {
  tone: "idle" | "success" | "warning" | "error";
  message?: string;
}

function LiveManagement() {
  const [windows, setWindows] = useState<WindowData[]>([]);
  const [totalTabsAllCount, setTotalTabsAllCount] = useState(0);
  const [saveStatuses, setSaveStatuses] = useState<Record<number, SaveStatus>>({});
  const [savedSnapshots, setSavedSnapshots] = useState<NStorage.Sync.Response.Group[]>([]);
  const [showSaveMenu, setShowSaveMenu] = useState<number | null>(null);
  const [newSnapshotTitle, setNewSnapshotTitle] = useState("");
  const [isNamingNewSnapshot, setIsNamingNewSnapshot] = useState(false);
  const [autoGroupScanStatus, setAutoGroupScanStatus] = useState<AutoGroupScanStatus>({ tone: "idle" });

  onTabUpdated(() => {
    getActiveGroups();
  });

  useEffect(() => {
    getActiveGroups();
    fetchSavedSnapshots();
  }, []);

  const fetchSavedSnapshots = async () => {
    const res = await StorageSyncGroup.getListWithTabs();
    setSavedSnapshots(res || []);
  };

  const setSaveStatus = (groupId: number, status: SaveStatus) => {
    setSaveStatuses((current) => ({
      ...current,
      [groupId]: status,
    }));
  };

  const openSaveMenu = (group: TabGroup) => {
    setShowSaveMenu(group.id);
    setNewSnapshotTitle(group.title || "Untitled Group");
    setIsNamingNewSnapshot(false);
  };

  const saveGroupSnapshot = async (group: TabGroup) => {
    const finalTitle = newSnapshotTitle.trim() || group.title || "Untitled Group";
    setShowSaveMenu(null);
    setIsNamingNewSnapshot(false);
    setSaveStatus(group.id, { state: "pending", message: "Saving snapshot..." });

    let uniqueTitle = finalTitle;
    const existingTitles = savedSnapshots.map(s => s.title.toLowerCase());
    if (existingTitles.includes(uniqueTitle.toLowerCase())) {
      let counter = 1;
      let newTitle = `${uniqueTitle} (${counter})`;
      while (existingTitles.includes(newTitle.toLowerCase())) {
        counter++;
        newTitle = `${uniqueTitle} (${counter})`;
      }
      uniqueTitle = newTitle;
    }

    const now = new Date().toISOString();
    const snapshotGroupId = crypto.randomUUID();
    const snapshotGroup: NStorage.Sync.Schema.Group = {
      id: snapshotGroupId,
      title: uniqueTitle,
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

    try {
      await StorageSyncGroup.create(snapshotGroup);
      await StorageSyncTab.create(...snapshotTabs);
      setSaveStatus(group.id, { state: "saved", message: `Saved snapshot "${uniqueTitle}"` });
      void fetchSavedSnapshots();
    } catch {
      setSaveStatus(group.id, { state: "failed", message: "Failed to save snapshot" });
    }
  };

  const updateExistingSnapshot = async (liveGroup: TabGroup, savedSnapshot: NStorage.Sync.Response.Group) => {
    setShowSaveMenu(null);
    setSaveStatus(liveGroup.id, { state: "pending", message: "Updating snapshot..." });
    const now = new Date().toISOString();

    const updatedGroup: NStorage.Sync.Schema.Group = {
      id: savedSnapshot.id,
      title: savedSnapshot.title,
      color: liveGroup.color,
      order: savedSnapshot.order,
      createdAt: savedSnapshot.createdAt,
      updatedAt: now,
      lastOpened: now,
    };

    const newTabs: NStorage.Sync.Schema.Tab[] = liveGroup.tabs.map((tab, index) => ({
      id: crypto.randomUUID(),
      title: tab.title || "Untitled Tab",
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      order: index + 1,
      groupId: savedSnapshot.id,
      createdAt: now,
      updatedAt: now,
      lastOpened: tab.lastAccessed ? new Date(tab.lastAccessed).toISOString() : now,
    }));

    try {
      await StorageSyncGroup.update(updatedGroup);
      await StorageSyncTab.deleteTabsByGroupId(savedSnapshot.id);
      await StorageSyncTab.create(...newTabs);
      setSaveStatus(liveGroup.id, { state: "saved", message: `Updated snapshot "${savedSnapshot.title}"` });
      void fetchSavedSnapshots();
    } catch {
      setSaveStatus(liveGroup.id, { state: "failed", message: "Failed to update snapshot" });
    }
  };

  const getActiveGroups = async () => {
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
    setTotalTabsAllCount(globalTabCount);
  };

  const focusWindow = (windowId: number) => {
    void chrome.windows.update(windowId, { focused: true });
  };

  const toggleGroupCollapsed = async (group: TabGroup) => {
    await chrome.tabGroups.update(group.id, { collapsed: !group.collapsed });
    void getActiveGroups();
  };

  const closeGroupTabs = async (group: TabGroup) => {
    const tabIds = group.tabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === "number");

    if (!tabIds.length) return;

    setShowSaveMenu(null);
    await chrome.tabs.remove(tabIds);
    void getActiveGroups();
  };

  const runAutoGroupScan = () => {
    setAutoGroupScanStatus({ tone: "success", message: "Running auto-group scan across all windows..." });
    chrome.runtime.sendMessage({ action: 'run_auto_group_scan' }, (response) => {
      if (chrome.runtime.lastError) {
        setAutoGroupScanStatus({ tone: "error", message: "Auto-group scan failed to start." });
        return;
      }

      if (!response?.success) {
        setAutoGroupScanStatus({
          tone: "error",
          message: response?.error ? `Auto-group scan failed: ${response.error}` : "Auto-group scan reported errors.",
        });
        return;
      }

      const summary = response.summary as {
        grouped?: number;
        alreadyGrouped?: number;
      } | undefined;

      if (summary?.grouped) {
        setAutoGroupScanStatus({
          tone: "success",
          message: `Auto-group scan updated ${summary.grouped} tab(s) across all windows.`,
        });
        return;
      }

      if (summary?.alreadyGrouped) {
        setAutoGroupScanStatus({
          tone: "warning",
          message: "Matching tabs were already grouped correctly.",
        });
        return;
      }

      setAutoGroupScanStatus({
        tone: "warning",
        message: "Auto-group scan found no matching tabs.",
      });
    });
  };

  return (
    <div className="flex flex-col gap-4 p-2 pb-6">
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Live Browser
            </p>
            <Tooltip>
              <Tooltip.Trigger asChild>
                <button type="button" className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full border border-black/5 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100">
                  <Info size={12} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" sideOffset={8} className="max-w-56 rounded-xl bg-slate-900 px-3 py-2 text-[11px] text-slate-50 shadow-lg">
                Manage tabs and groups across all open windows.
              </Tooltip.Content>
            </Tooltip>
            
            <Tooltip>
              <Tooltip.Trigger asChild>
                <button 
                  onClick={() => {
                    runAutoGroupScan();
                  }}
                  className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100"
                >
                  <Sparkles size={11} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" sideOffset={8} className="rounded-xl bg-slate-900 px-3 py-2 text-[11px] text-white shadow-lg">
                Apply Auto-Group Rules Across Browser
              </Tooltip.Content>
            </Tooltip>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-1.5">
          <span className="rounded-full border border-black/5 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            {totalTabsAllCount} tabs
          </span>
          <span className="rounded-full border border-black/5 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            {windows.length} windows
          </span>
        </div>
      </section>

      <div className="flex flex-col gap-6">
        {autoGroupScanStatus.message && (
          <div
            className={cn(
              "rounded-2xl border px-3 py-2 text-xs font-medium shadow-sm",
              autoGroupScanStatus.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
              autoGroupScanStatus.tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
              autoGroupScanStatus.tone === "error" && "border-rose-200 bg-rose-50 text-rose-700"
            )}
          >
            {autoGroupScanStatus.message}
          </div>
        )}

        {windows.map((win, winIdx) => (
          <div key={win.id} className="flex flex-col gap-2.5">
            {/* Window Header */}
            <div 
              className={cn(
                "flex cursor-pointer items-center justify-between px-1.5 transition-opacity hover:opacity-80",
                !win.isCurrent && "opacity-60"
              )}
              onClick={() => focusWindow(win.id)}
            >
              <div className="flex items-center gap-2">
                <Monitor size={12} className={win.isCurrent ? "text-slate-900" : "text-slate-400"} />
                <p className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  win.isCurrent ? "text-slate-900" : "text-slate-500"
                )}>
                  Window {windows.length > 1 ? winIdx + 1 : ""} {win.isCurrent && "• Current"}
                </p>
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase">
                {win.totalTabs} tabs
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {win.tabsPinned.length > 0 && (
                <BentoGroupCard
                  title={MOCK_GROUP[EMockGroup.PINNED]}
                  tabs={win.tabsPinned}
                  className="bg-slate-50 border-slate-200"
                />
              )}

              {win.groups.map((group) => (
                <BentoGroupCard
                  key={group.id}
                  title={group.title || "Untitled Group"}
                  color={group.color}
                  tabs={group.tabs}
                  collapsed={group.collapsed}
                  onToggleCollapsed={() => void toggleGroupCollapsed(group)}
                  onCloseTabs={() => void closeGroupTabs(group)}
                  actions={
                    <div className="relative flex items-center gap-2">
                      {saveStatuses[group.id]?.state && saveStatuses[group.id].state !== "idle" && (
                        <span className={cn(
                          "hidden rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider md:inline-flex",
                          saveStatuses[group.id].state === "saved" && "bg-emerald-100 text-emerald-700",
                          saveStatuses[group.id].state === "failed" && "bg-rose-100 text-rose-700",
                          saveStatuses[group.id].state === "pending" && "bg-slate-200 text-slate-600"
                        )}>
                          {saveStatuses[group.id].state}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-7 rounded-full border-black/10 bg-white/80 px-2.5 text-[11px] font-bold text-slate-700 shadow-none hover:bg-white",
                          showSaveMenu === group.id && "bg-slate-100"
                        )}
                        disabled={saveStatuses[group.id]?.state === "pending"}
                        aria-haspopup="menu"
                        aria-expanded={showSaveMenu === group.id}
                        aria-label={`Save ${group.title || "Untitled Group"} as a snapshot`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (showSaveMenu === group.id) { setShowSaveMenu(null); setIsNamingNewSnapshot(false); }
                          else { openSaveMenu(group); }
                        }}
                      >
                        {saveStatuses[group.id]?.state === "pending" ? <LoaderCircle className="animate-spin" size={12} /> : saveStatuses[group.id]?.state === "saved" ? <CheckCircle2 size={12} /> : <FolderPlus size={12} />}
                        <span className="ml-1">
                          {saveStatuses[group.id]?.state === "pending" && "Saving"}
                          {saveStatuses[group.id]?.state === "saved" && "Saved"}
                          {saveStatuses[group.id]?.state !== "pending" && saveStatuses[group.id]?.state !== "saved" && "Snapshot"}
                        </span>
                      </Button>

                      {showSaveMenu === group.id && (
                        <div className="absolute right-0 top-full z-50 mt-1.5 flex min-w-56 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5" role="menu" onClick={(e) => e.stopPropagation()}>
                          {isNamingNewSnapshot ? (
                            <div className="flex flex-col gap-2 p-1">
                              <p className="px-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Snapshot Name:</p>
                              <div className="flex items-center gap-1">
                                <input
                                  autoFocus
                                  className="w-full rounded border-none bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 outline-none ring-1 ring-slate-200"
                                  value={newSnapshotTitle}
                                  onChange={(e) => setNewSnapshotTitle(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") void saveGroupSnapshot(group); if (e.key === "Escape") setIsNamingNewSnapshot(false); }}
                                />
                                <button type="button" aria-label="Save new snapshot" onClick={() => void saveGroupSnapshot(group)} className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-emerald-500 text-white"><Check size={14} /></button>
                                <button type="button" aria-label="Cancel snapshot naming" onClick={() => setIsNamingNewSnapshot(false)} className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-slate-100 text-slate-400"><X size={14} /></button>
                              </div>
                            </div>
                          ) : (
                            <button type="button" role="menuitem" className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold text-emerald-600 transition-colors hover:bg-emerald-50" onClick={() => setIsNamingNewSnapshot(true)}>
                              <FolderPlus size={12} /> New Snapshot
                            </button>
                          )}
                          {!isNamingNewSnapshot && savedSnapshots.length > 0 && (
                            <>
                              <div className="my-0.5 h-px bg-slate-100" />
                              <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Overwrite snapshot:</p>
                              <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto pr-0.5 text-slate-600">
                                {savedSnapshots.map((ss) => (
                                  <button key={ss.id} type="button" role="menuitem" className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-slate-50" onClick={() => updateExistingSnapshot(group, ss)}>
                                    <span className="truncate font-medium">{ss.title}</span>
                                    <RefreshCw size={10} className="text-slate-300" />
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  }
                />
              ))}

              {win.tabsUngroup.length > 0 && (
                <BentoGroupCard
                  title={MOCK_GROUP[EMockGroup.UNGROUP]}
                  tabs={win.tabsUngroup}
                  className="bg-white border-dashed border-slate-300"
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {Object.values(saveStatuses).some((status) => status.message) && (
        <div className="flex flex-col gap-2 mt-4">
          {windows.flatMap(w => [...w.groups]).map(group => {
            const status = saveStatuses[group.id];
            if (!status?.message) return null;
            return (
              <div key={group.id} className={cn(
                "rounded-2xl border px-3 py-2 text-xs font-medium shadow-sm",
                status?.state === "saved" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                status?.state === "failed" && "border-rose-200 bg-rose-50 text-rose-700",
                status?.state === "pending" && "border-slate-200 bg-slate-50 text-slate-600"
              )}>
                {group.title || "Untitled Group"}: {status.message}
              </div>
            );
          })}
        </div>
      )}

      {totalTabsAllCount > 0 && <TopSites />}

      {totalTabsAllCount === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-slate-400">
          <p className="text-sm font-medium text-slate-600">No active tabs found</p>
        </div>
      )}
    </div>
  );
}

export default LiveManagement;
