import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import StorageSyncGroup from "@/storage/group.sync";
import StorageSyncTab from "@/storage/tab.sync";
import { AlertCircle, Check, CheckCircle2, FolderSync, Info, LoaderCircle, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import Tooltip from "@/components/ui/tooltip";

type RestoreState = "idle" | "pending" | "full" | "partial" | "failed" | "updated" | "deleted";

interface RestoreStatus {
  state: RestoreState;
  message?: string;
  openedCount?: number;
  failedCount?: number;
}

const STATUS_STYLES: Record<Exclude<RestoreState, "idle" | "pending">, string> = {
  full: "border-emerald-200 bg-emerald-50 text-emerald-700",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
  updated: "border-sky-200 bg-sky-50 text-sky-700",
  deleted: "border-slate-200 bg-slate-50 text-slate-600",
};

interface LiveTabGroup extends chrome.tabGroups.TabGroup {
  tabs: chrome.tabs.Tab[];
}

const groupTabs = (tabIds: [number, ...number[]]) =>
  new Promise<number>((resolve, reject) => {
    chrome.tabs.group({ tabIds }, (groupId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(groupId);
    });
  });

const updateTabGroup = (groupId: number, updates: chrome.tabGroups.UpdateProperties) =>
  new Promise<void>((resolve, reject) => {
    chrome.tabGroups.update(groupId, updates, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });

function GroupManagement() {
  const [groups, setGroups] = useState<NStorage.Sync.Response.Group[]>([]);
  const [liveGroups, setLiveGroups] = useState<LiveTabGroup[]>([]);
  const [restoreStatuses, setRestoreStatuses] = useState<Record<string, RestoreStatus>>({});
  const [showUpdateMenu, setShowUpdateMenu] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => {
    fetchGroups();
    fetchLiveGroups();
  }, []);

  const fetchLiveGroups = async () => {
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

    setLiveGroups(groupsIncludeTabs);
  };

  const fetchGroups = async () => {
    const res = await StorageSyncGroup.getListWithTabs();
    const groupsOrdered = [...res].sort((a, b) => a.order - b.order);
    setGroups(groupsOrdered);
  };

  const startEditing = (group: NStorage.Sync.Response.Group) => {
    setEditingGroupId(group.id);
    setEditingTitle(group.title || "");
  };

  const cancelEditing = () => {
    setEditingGroupId(null);
    setEditingTitle("");
  };

  const handleRename = async (group: NStorage.Sync.Response.Group) => {
    const trimmedTitle = editingTitle.trim();
    if (!trimmedTitle || trimmedTitle === group.title) {
      cancelEditing();
      return;
    }

    // Check for duplicate names (case-insensitive, excluding current group)
    const isDuplicate = groups.some(g => 
      g.id !== group.id && g.title.toLowerCase() === trimmedTitle.toLowerCase()
    );

    if (isDuplicate) {
      setRestoreStatus(group.id, {
        state: "failed",
        message: "Name already exists",
      });
      return;
    }

    try {
      await StorageSyncGroup.update({
        ...group,
        title: trimmedTitle,
        updatedAt: new Date().toISOString(),
      });
      setEditingGroupId(null);
      await fetchGroups();
    } catch {
      setRestoreStatus(group.id, {
        state: "failed",
        message: "Rename failed",
      });
    }
  };

  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const setRestoreStatus = (groupId: string, status: RestoreStatus) => {
    setRestoreStatuses((current) => ({
      ...current,
      [groupId]: status,
    }));
  };

  const updateGroupSnapshot = async (savedGroup: NStorage.Sync.Response.Group, liveGroup: LiveTabGroup) => {
    setShowUpdateMenu(null);
    setRestoreStatus(savedGroup.id, {
      state: "pending",
      message: `Updating...`,
    });

    const now = new Date().toISOString();

    const updatedGroup: NStorage.Sync.Schema.Group = {
      id: savedGroup.id,
      title: liveGroup.title || "Untitled Group",
      color: liveGroup.color,
      order: savedGroup.order,
      createdAt: savedGroup.createdAt,
      updatedAt: now,
      lastOpened: now,
    };

    const newTabs: NStorage.Sync.Schema.Tab[] = liveGroup.tabs.map((tab, index) => ({
      id: crypto.randomUUID(),
      title: tab.title || "Untitled Tab",
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      order: index + 1,
      groupId: savedGroup.id,
      createdAt: now,
      updatedAt: now,
      lastOpened: tab.lastAccessed ? new Date(tab.lastAccessed).toISOString() : now,
    }));

    try {
      await StorageSyncGroup.update(updatedGroup);
      await StorageSyncTab.deleteTabsByGroupId(savedGroup.id);
      await StorageSyncTab.create(...newTabs);

      setRestoreStatus(savedGroup.id, {
        state: "updated",
        message: `Updated`,
      });

      await fetchGroups();
    } catch {
      setRestoreStatus(savedGroup.id, {
        state: "failed",
        message: "Failed",
      });
    }
  };

  const deleteSnapshot = async (groupId: string) => {
    if (!confirm("Delete this snapshot?")) return;

    setRestoreStatus(groupId, {
      state: "pending",
    });

    try {
      await StorageSyncGroup.deleteGroupById(groupId);
      await StorageSyncTab.deleteTabsByGroupId(groupId);

      setRestoreStatus(groupId, {
        state: "deleted",
        message: "Deleted",
      });

      setTimeout(() => fetchGroups(), 800);
    } catch {
      setRestoreStatus(groupId, {
        state: "failed",
        message: "Failed",
      });
    }
  };

  const restoreGroup = async (group: NStorage.Sync.Response.Group) => {
    setRestoreStatus(group.id, {
      state: "pending",
    });

    const sortedTabs = [...group.tabs].sort((a, b) => a.order - b.order);
    const tabsWithUrls = sortedTabs.filter((tab) => Boolean(tab.url));
    let failedCount = sortedTabs.length - tabsWithUrls.length;
    let openedCount = 0;
    let createdGroup = false;
    const createdTabIds: number[] = [];

    if (tabsWithUrls.length === 0) {
      setRestoreStatus(group.id, {
        state: "failed",
        message: "No URLs",
      });
      return;
    }

    for (const tab of tabsWithUrls) {
      try {
        const createdTab = await chrome.tabs.create({
          url: tab.url,
          active: false,
        });

        if (typeof createdTab.id === "number") {
          createdTabIds.push(createdTab.id);
          openedCount += 1;
        } else {
          failedCount += 1;
        }
      } catch {
        failedCount += 1;
      }
    }

    if (createdTabIds.length > 0) {
      try {
        const liveGroupId = await groupTabs(createdTabIds as [number, ...number[]]);
        const updates: chrome.tabGroups.UpdateProperties = {};

        if (group.title) updates.title = group.title;
        if (group.color) updates.color = group.color;

        if (Object.keys(updates).length > 0) {
          await updateTabGroup(liveGroupId, updates);
        }

        createdGroup = true;
      } catch {
        createdGroup = false;
      }
    }

    if (openedCount === 0) {
      setRestoreStatus(group.id, {
        state: "failed",
        message: "Restore failed",
      });
      return;
    }

    const isFullRestore = failedCount === 0 && createdGroup;

    setRestoreStatus(group.id, {
      state: isFullRestore ? "full" : "partial",
      message: isFullRestore ? "Restored" : `Partial`,
    });
  };

  return (
    <div className="flex flex-col gap-3 p-2">
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Saved Snapshots
          </p>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
            {groups.length}
          </span>
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center text-slate-400">
          <p className="text-[11px] font-medium">No snapshots saved yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => {
            const status = restoreStatuses[group.id];
            const isMenuOpen = showUpdateMenu === group.id;
            const isExpanded = expandedGroups[group.id];

            return (
              <div
                key={group.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:border-slate-300"
              >
                <div 
                  className="flex cursor-pointer items-center justify-between gap-2 p-2.5 transition-colors hover:bg-slate-50/50"
                  onClick={() => toggleExpand(group.id)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div className={cn("size-2.5 shrink-0 rounded-full", group.color ? `bg-${group.color}-500` : "bg-slate-300")} />
                    
                    {editingGroupId === group.id ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          className="w-full min-w-24 rounded border-none bg-slate-100 px-1.5 py-0.5 text-[13px] font-bold text-slate-700 outline-none ring-1 ring-slate-200 focus:ring-slate-400"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleRename(group);
                            if (e.key === "Escape") cancelEditing();
                          }}
                        />
                        <button 
                          onClick={() => void handleRename(group)}
                          className="flex size-6 shrink-0 items-center justify-center rounded-full text-emerald-500 hover:bg-emerald-50"
                        >
                          <Check size={14} />
                        </button>
                        <button 
                          onClick={cancelEditing}
                          className="flex size-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="group/title flex items-center gap-1.5 truncate">
                        <h3 className="truncate text-[13px] font-bold text-slate-700">
                          {group.title || "Untitled"}
                        </h3>
                        <button
                          className="opacity-0 transition-opacity group-hover/title:opacity-100 text-slate-300 hover:text-slate-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(group);
                          }}
                        >
                          <Pencil size={11} />
                        </button>
                        <span className="text-[10px] font-bold text-slate-400">
                          {group.tabs.length}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {status && status.state !== "idle" && status.state !== "pending" && (
                      <div className={cn(
                        "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-sm",
                        STATUS_STYLES[status.state]
                      )}>
                        {status.message}
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <Tooltip.Trigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            className="size-7 rounded-full p-0 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            onClick={() => setShowUpdateMenu(isMenuOpen ? null : group.id)}
                          >
                            <RefreshCw size={12} className={cn(status?.state === "pending" && "animate-spin")} />
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] text-white">
                          Update from Live
                        </Tooltip.Content>
                      </Tooltip>

                      <Tooltip>
                        <Tooltip.Trigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            className="size-7 rounded-full p-0 text-rose-300 hover:bg-rose-50 hover:text-rose-500"
                            onClick={() => deleteSnapshot(group.id)}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] text-white">
                          Delete
                        </Tooltip.Content>
                      </Tooltip>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      className="h-7 rounded-full bg-slate-900 px-3 text-[11px] font-bold text-white shadow-sm hover:bg-slate-800"
                      disabled={status?.state === "pending"}
                      onClick={() => restoreGroup(group)}
                    >
                      {status?.state === "pending" ? (
                        <LoaderCircle className="animate-spin" size={12} />
                      ) : (
                        "Restore"
                      )}
                    </Button>
                  </div>
                </div>

                {isMenuOpen && (
                  <div className="mx-2 mb-2 flex flex-col gap-1 rounded-xl bg-slate-50 p-1.5 ring-1 ring-slate-200 ring-inset" onClick={(e) => e.stopPropagation()}>
                    <p className="px-1.5 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Update from:
                    </p>
                    {liveGroups.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {liveGroups.map((lg) => (
                          <button
                            key={lg.id}
                            className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-white hover:shadow-sm"
                            onClick={() => updateGroupSnapshot(group, lg)}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <div className={cn("size-1.5 rounded-full", lg.color ? `bg-${lg.color}-500` : "bg-slate-300")} />
                              <span className="truncate font-medium text-slate-600">{lg.title || "Untitled Group"}</span>
                            </div>
                            <span className="text-[9px] text-slate-400">{lg.tabs.length} tabs</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="px-1.5 py-2 text-[10px] italic text-slate-400">No live groups</p>
                    )}
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t border-slate-50 bg-slate-50/30 px-2.5 py-2">
                    <ul className="flex flex-col gap-1">
                      {[...group.tabs].sort((a, b) => a.order - b.order).map((tab) => (
                        <li key={tab.id} className="flex items-center gap-2 rounded-lg bg-white/50 px-2 py-1 ring-1 ring-slate-100 ring-inset">
                          {tab.favIconUrl ? (
                            <img src={tab.favIconUrl} className="size-3.5 shrink-0" alt="" />
                          ) : (
                            <div className="size-3.5 shrink-0 rounded-sm bg-slate-100" />
                          )}
                          <span className="truncate text-[11px] text-slate-600">
                           {tab.title || "Untitled Tab"}
                          </span>
                          {tab.isRepaired && (
                           <Tooltip>
                             <Tooltip.Trigger asChild>
                               <AlertCircle size={10} className="shrink-0 text-amber-500" />
                             </Tooltip.Trigger>
                             <Tooltip.Content className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] text-white">
                               Repaired: original URL was missing
                             </Tooltip.Content>
                           </Tooltip>
                           )}
                           </li>
                           ))}                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default GroupManagement;
