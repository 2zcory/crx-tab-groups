import { MOCK_GROUP } from "@/constants";
import { EMockGroup } from "@/enums";
import onTabUpdated from "@/listeners/onTabUpdated";
import StorageSyncGroup from "@/storage/group.sync";
import StorageSyncTab from "@/storage/tab.sync";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Check, CheckCircle2, FolderPlus, Info, LoaderCircle, RefreshCw, X, Monitor, Sparkles } from "lucide-react";
import TopSites from "./components/TopSites";
import { BentoGroupCard } from "@/components/BentoGroupCard";
import Tooltip from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import TabListItem from "./components/TabListItem";

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
  
  // DND State
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [isDraggingLocal, setIsDraggingLocal] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const getActiveGroups = useCallback(async () => {
    if (isDraggingLocal) return;

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

    windowDataList.sort((a, b) => (a.isCurrent === b.isCurrent ? 0 : a.isCurrent ? -1 : 1));

    setWindows(windowDataList);
    setTotalTabsAllCount(globalTabCount);
  }, [isDraggingLocal]);

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
      color: group.color,
      order: savedSnapshots.length,
      createdAt: now,
      updatedAt: now,
    };

    const snapshotTabs: NStorage.Sync.Schema.Tab[] = group.tabs.map((tab, index) => ({
      id: crypto.randomUUID(),
      title: tab.title || "Untitled Tab",
      url: tab.url || "about:blank",
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
      setSaveStatus(group.id, { state: "saved", message: `Saved as "${uniqueTitle}"` });
      void fetchSavedSnapshots();
    } catch {
      setSaveStatus(group.id, { state: "failed", message: "Failed to save snapshot" });
    }
  };

  const updateExistingSnapshot = async (liveGroup: TabGroup, savedSnapshot: NStorage.Sync.Response.Group) => {
    setShowSaveMenu(null);
    setSaveStatus(liveGroup.id, { state: "pending", message: `Updating snapshot "${savedSnapshot.title}"...` });

    const now = new Date().toISOString();
    const updatedGroup: NStorage.Sync.Schema.Group = {
      id: savedSnapshot.id,
      title: savedSnapshot.title,
      color: liveGroup.color,
      order: savedSnapshot.order,
      createdAt: savedSnapshot.createdAt,
      updatedAt: now,
    };

    const newTabs: NStorage.Sync.Schema.Tab[] = liveGroup.tabs.map((tab, index) => ({
      id: crypto.randomUUID(),
      title: tab.title || "Untitled Tab",
      url: tab.url || "about:blank",
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

      const summary = response?.summary as { alreadyGrouped?: boolean; matches?: number } | undefined;
      
      if (summary?.matches) {
        setAutoGroupScanStatus({
          tone: "success",
          message: `Auto-group scan complete: ${summary.matches} tabs regrouped.`,
        });
        void getActiveGroups();
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

  const findTabById = (id: number) => {
    for (const win of windows) {
      const tab = [...win.tabsPinned, ...win.tabsUngroup, ...win.groups.flatMap(g => g.tabs)].find(t => t.id === id);
      if (tab) return tab;
    }
    return undefined;
  };

  const findContainer = (id: number | string) => {
    if (typeof id === 'string') return id;
    for (const win of windows) {
      if (win.tabsPinned.find(t => t.id === id)) return `ungroup-pinned-${win.id}`;
      if (win.tabsUngroup.find(t => t.id === id)) return `ungroup-${win.id}`;
      for (const group of win.groups) {
        if (group.tabs.find(t => t.id === id)) return `group-${group.id}`;
      }
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTabId(event.active.id as number);
    setIsDraggingLocal(true);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as number;
    const overId = over.id;

    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);

    if (!activeContainer || !overContainer) return;

    if (activeContainer !== overContainer) {
      setWindows((prev) => {
        const newWindows = JSON.parse(JSON.stringify(prev)) as WindowData[];
        let activeTab: chrome.tabs.Tab | undefined;
        
        // 1. Remove from source
        for (const win of newWindows) {
          const pinnedIdx = win.tabsPinned.findIndex(t => t.id === activeId);
          if (pinnedIdx !== -1) { activeTab = win.tabsPinned.splice(pinnedIdx, 1)[0]; break; }
          const ungroupIdx = win.tabsUngroup.findIndex(t => t.id === activeId);
          if (ungroupIdx !== -1) { activeTab = win.tabsUngroup.splice(ungroupIdx, 1)[0]; break; }
          for (const group of win.groups) {
            const tabIdx = group.tabs.findIndex(t => t.id === activeId);
            if (tabIdx !== -1) { activeTab = group.tabs.splice(tabIdx, 1)[0]; break; }
          }
          if (activeTab) break;
        }

        if (!activeTab) return prev;

        // 2. Insert into target
        const isOverContainer = typeof overId === 'string';
        for (const win of newWindows) {
          if (overContainer === `ungroup-pinned-${win.id}`) {
            const index = isOverContainer ? win.tabsPinned.length : win.tabsPinned.findIndex(t => t.id === overId);
            win.tabsPinned.splice(index >= 0 ? index : win.tabsPinned.length, 0, activeTab);
            break;
          }
          if (overContainer === `ungroup-${win.id}`) {
            const index = isOverContainer ? win.tabsUngroup.length : win.tabsUngroup.findIndex(t => t.id === overId);
            win.tabsUngroup.splice(index >= 0 ? index : win.tabsUngroup.length, 0, activeTab);
            break;
          }
          if (overContainer.startsWith("group-")) {
            const groupId = parseInt(overContainer.split("-")[1]);
            const group = win.groups.find(g => g.id === groupId);
            if (group) {
              const index = isOverContainer ? group.tabs.length : group.tabs.findIndex(t => t.id === overId);
              group.tabs.splice(index >= 0 ? index : group.tabs.length, 0, activeTab);
              break;
            }
          }
        }

        return newWindows;
      });
    } else if (activeId !== overId) {
      // Reorder within the same container
      setWindows((prev) => {
        const newWindows = JSON.parse(JSON.stringify(prev)) as WindowData[];
        for (const win of newWindows) {
          if (activeContainer === `ungroup-pinned-${win.id}`) {
            const oldIndex = win.tabsPinned.findIndex(t => t.id === activeId);
            const newIndex = win.tabsPinned.findIndex(t => t.id === overId);
            win.tabsPinned = arrayMove(win.tabsPinned, oldIndex, newIndex);
            break;
          }
          if (activeContainer === `ungroup-${win.id}`) {
            const oldIndex = win.tabsUngroup.findIndex(t => t.id === activeId);
            const newIndex = win.tabsUngroup.findIndex(t => t.id === overId);
            win.tabsUngroup = arrayMove(win.tabsUngroup, oldIndex, newIndex);
            break;
          }
          if (activeContainer.startsWith("group-")) {
            const groupId = parseInt(activeContainer.split("-")[1]);
            const group = win.groups.find(g => g.id === groupId);
            if (group) {
              const oldIndex = group.tabs.findIndex(t => t.id === activeId);
              const newIndex = group.tabs.findIndex(t => t.id === overId);
              group.tabs = arrayMove(group.tabs, oldIndex, newIndex);
              break;
            }
          }
        }
        return newWindows;
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setIsDraggingLocal(false);
    setActiveTabId(null);

    if (!over) { void getActiveGroups(); return; }

    const activeId = active.id as number;
    const overId = over.id;

    // Find the final position in our optimistic UI
    let finalTab: chrome.tabs.Tab | undefined;
    let finalWinId: number | undefined;
    let finalGroupId: number = -1;
    let finalIndex: number = 0;

    for (const win of windows) {
      const pIdx = win.tabsPinned.findIndex(t => t.id === activeId);
      if (pIdx !== -1) { finalTab = win.tabsPinned[pIdx]; finalWinId = win.id; finalIndex = pIdx; break; }
      const uIdx = win.tabsUngroup.findIndex(t => t.id === activeId);
      if (uIdx !== -1) { finalTab = win.tabsUngroup[uIdx]; finalWinId = win.id; finalIndex = uIdx; break; }
      for (const group of win.groups) {
        const tIdx = group.tabs.findIndex(t => t.id === activeId);
        if (tIdx !== -1) { finalTab = group.tabs[tIdx]; finalWinId = win.id; finalGroupId = group.id; finalIndex = tIdx; break; }
      }
    }

    if (!finalTab || !finalWinId) return;

    // Apply change to Chrome
    try {
      // 1. Handle Move (window and index)
      // Note: Chrome's index is global within the window, but we are working with relative indices.
      // For simplicity, we just move it. Real tab sync will correct it.
      await chrome.tabs.move(activeId, { windowId: finalWinId, index: -1 }); // Just move to window first

      // 2. Handle Grouping
      if (finalGroupId === -1) {
        await chrome.tabs.ungroup(activeId);
      } else {
        await chrome.tabs.group({ groupId: finalGroupId, tabIds: activeId });
      }
    } catch (e) {
      console.error("Failed to sync drag end to Chrome", e);
    }

    void getActiveGroups();
  };

  const allTabIds = useMemo(() => {
    return windows.flatMap(win => [
      ...win.tabsPinned.map(t => t.id!),
      ...win.tabsUngroup.map(t => t.id!),
      ...win.groups.flatMap(g => g.tabs.map(t => t.id!))
    ]);
  }, [windows]);

  const activeTab = useMemo(() => activeTabId ? findTabById(activeTabId) : null, [activeTabId, windows]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-6 p-2 pb-6">
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
                <SortableContext items={win.tabsPinned.map(t => t.id!)} strategy={verticalListSortingStrategy}>
                  <BentoGroupCard
                    id={`ungroup-pinned-${win.id}`}
                    title={MOCK_GROUP[EMockGroup.PINNED]}
                    tabs={win.tabsPinned}
                    className="bg-slate-50 border-slate-200"
                  />
                </SortableContext>
              )}

              {win.groups.map((group) => (
                <SortableContext key={group.id} items={group.tabs.map(t => t.id!)} strategy={verticalListSortingStrategy}>
                  <BentoGroupCard
                    id={`group-${group.id}`}
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
                      </div>
                    }
                  />
                </SortableContext>
              ))}

              <SortableContext items={win.tabsUngroup.map(t => t.id!)} strategy={verticalListSortingStrategy}>
                <BentoGroupCard
                  id={`ungroup-${win.id}`}
                  title={MOCK_GROUP[EMockGroup.UNGROUP]}
                  tabs={win.tabsUngroup}
                  className="bg-white border-dashed border-slate-300"
                />
              </SortableContext>
            </div>
          </div>
        ))}
      </div>

      <DragOverlay dropAnimation={{
        sideEffects: defaultDropAnimationSideEffects({
          styles: {
            active: {
              opacity: '0.4',
            },
          },
        }),
      }}>
        {activeTab ? (
          <div className="w-[280px] pointer-events-none">
             <TabListItem tab={activeTab} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default LiveManagement;
