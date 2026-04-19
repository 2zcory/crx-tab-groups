import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import StorageSyncGroup from "@/storage/group.sync";
import { AlertCircle, CheckCircle2, FolderSync, Info, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import Tooltip from "@/components/ui/tooltip";

type RestoreState = "idle" | "pending" | "full" | "partial" | "failed";

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
};

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
  const [restoreStatuses, setRestoreStatuses] = useState<Record<string, RestoreStatus>>({});

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    const res = await StorageSyncGroup.getListWithTabs();
    const groupsOrdered = [...res].sort((a, b) => a.order - b.order);
    setGroups(groupsOrdered);
  };

  const setRestoreStatus = (groupId: string, status: RestoreStatus) => {
    setRestoreStatuses((current) => ({
      ...current,
      [groupId]: status,
    }));
  };

  const restoreGroup = async (group: NStorage.Sync.Response.Group) => {
    setRestoreStatus(group.id, {
      state: "pending",
      message: "Restoring snapshot into a new live group...",
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
        message: "This snapshot does not contain any saved tab URLs, so nothing could be restored.",
        openedCount: 0,
        failedCount,
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
        message: "No tabs could be restored from this snapshot.",
        openedCount,
        failedCount,
      });
      return;
    }

    const isFullRestore = failedCount === 0 && createdGroup;

    if (isFullRestore) {
      setRestoreStatus(group.id, {
        state: "full",
        message: `Restored ${openedCount} tab${openedCount === 1 ? "" : "s"} into a new live group.`,
        openedCount,
        failedCount,
      });
      return;
    }

    const partialReason = createdGroup
      ? `Restored ${openedCount} tab${openedCount === 1 ? "" : "s"}, but ${failedCount} could not be reopened.`
      : `Opened ${openedCount} tab${openedCount === 1 ? "" : "s"}, but the extension could not recreate the group container.`;

    setRestoreStatus(group.id, {
      state: "partial",
      message: partialReason,
      openedCount,
      failedCount,
    });
  };

  return (
    <div className="flex flex-col gap-3 p-1.5">
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Saved
            </p>
            <Tooltip>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  className="inline-flex size-5 items-center justify-center rounded-full border border-black/5 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-1"
                  aria-label="About Saved"
                >
                  <Info size={12} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" sideOffset={8} className="max-w-56 rounded-xl bg-slate-900 px-3 py-2 text-[11px] leading-relaxed text-slate-50 shadow-lg">
                Saved snapshots stay separate from live browser state. Restore creates a new live group and reports whether the result was full, partial, or failed.
              </Tooltip.Content>
            </Tooltip>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Review saved snapshots and explicitly restore them into a new live group.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-1.5">
          <span className="rounded-full border border-black/5 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {groups.length} snapshots
          </span>
          <span className="rounded-full border border-black/5 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {groups.reduce((count, group) => count + group.tabs.length, 0)} tabs
          </span>
        </div>
      </section>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-slate-400">
          <p className="text-sm font-medium text-slate-600">No saved snapshots found</p>
          <p className="mt-1 text-xs">Saved groups will appear here after they are persisted to sync storage.</p>
        </div>
      ) : (
        <Accordion type="single" collapsible className="w-full space-y-2">
          {groups.map((group) => {
            const status = restoreStatuses[group.id];
            const restorableTabs = group.tabs.filter((tab) => Boolean(tab.url)).length;

            return (
              <AccordionItem key={group.id} value={group.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800">
                        {group.title || "Untitled Snapshot"}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                        <span>{group.tabs.length} saved tabs</span>
                        <span>{restorableTabs} with URLs</span>
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="border-t border-slate-100 px-4 py-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">
                        Restore opens a new live group from this snapshot. The saved snapshot itself stays unchanged.
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="shrink-0 rounded-full bg-slate-900 px-3 text-xs text-white hover:bg-slate-800"
                        disabled={status?.state === "pending"}
                        onClick={() => restoreGroup(group)}
                      >
                        {status?.state === "pending" ? (
                          <>
                            <LoaderCircle className="animate-spin" size={14} />
                            Restoring
                          </>
                        ) : (
                          <>
                            <FolderSync size={14} />
                            Restore
                          </>
                        )}
                      </Button>
                    </div>

                    {status && status.state !== "idle" && (
                      <div
                        className={cn(
                          "flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs",
                          status.state === "pending"
                            ? "border-slate-200 bg-slate-50 text-slate-600"
                            : STATUS_STYLES[status.state],
                        )}
                      >
                        {status.state === "pending" ? (
                          <LoaderCircle className="mt-0.5 animate-spin" size={14} />
                        ) : status.state === "full" ? (
                          <CheckCircle2 className="mt-0.5" size={14} />
                        ) : (
                          <AlertCircle className="mt-0.5" size={14} />
                        )}
                        <div>
                          <div>{status.message}</div>
                          {typeof status.openedCount === "number" && (
                            <div className="mt-1 text-[11px] opacity-80">
                              Opened {status.openedCount} tab{status.openedCount === 1 ? "" : "s"}
                              {typeof status.failedCount === "number"
                                ? `, missed ${status.failedCount}.`
                                : "."}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <ul className="space-y-2">
                      {group.tabs
                        .sort((a, b) => a.order - b.order)
                        .map((tab) => (
                          <li
                            key={tab.id}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium text-slate-700">
                                  {tab.title || "Untitled Tab"}
                                </div>
                                <div className="mt-1 truncate text-[11px] text-slate-500">
                                  {tab.url || "No saved URL available"}
                                </div>
                              </div>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                  tab.url
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-200 text-slate-500",
                                )}
                              >
                                {tab.url ? "Restorable" : "Missing URL"}
                              </span>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}

export default GroupManagement;
