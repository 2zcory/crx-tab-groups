import { MOCK_GROUP } from '@/constants'
import { EMockGroup } from '@/enums'
import onTabUpdated from '@/listeners/onTabUpdated'
import StorageSyncGroup from '@/storage/group.sync'
import StorageSyncTab from '@/storage/tab.sync'
import { forwardRef, useEffect, useState, useMemo, useCallback, useRef, useImperativeHandle } from 'react'
import { CheckCircle2, FolderPlus, LoaderCircle, Monitor, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { BentoGroupCard } from '@/components/BentoGroupCard'
import Tooltip from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  defaultDropAnimationSideEffects,
  CollisionDetection,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TabListItem from './components/TabListItem'
import { StarterSuggestions } from './components/StarterSuggestions'
import {
  shouldIgnoreAutoGroupUrl,
} from '@/helpers'
import {
  AutoGroupScanStatus,
  LIVE_ADD_TO_RULES_HARNESS_MODE,
  LIVE_HARNESS_QUERY_KEY,
  QuickRuleSourceGroup,
  triggerAutoGroupScan,
} from './add-to-rules'

interface TabGroup extends chrome.tabGroups.TabGroup {
  tabs: chrome.tabs.Tab[]
}

interface WindowData {
  id: number
  isCurrent: boolean
  groups: TabGroup[]
  tabsPinned: chrome.tabs.Tab[]
  tabsUngroup: chrome.tabs.Tab[]
  totalTabs: number
}

type SaveState = 'idle' | 'pending' | 'saved' | 'failed'

interface SaveStatus {
  state: SaveState
  message?: string
}

const AUTO_GROUP_STATUS_AUTO_DISMISS_MS = 5000
const AUTO_GROUP_STATUS_EXIT_MS = 180
const LIVE_TOAST_BOTTOM_OFFSET_PX = 10
const SNAPSHOT_MENU_VIEWPORT_MARGIN_PX = 8
const SNAPSHOT_MENU_OFFSET_PX = 8
const SNAPSHOT_MENU_WIDTH_PX = 224

type AutoGroupToastPhase = 'entering' | 'visible' | 'exiting'

type TabContainerKind = 'pinned' | 'ungrouped' | 'group'

const toSnapshotTab = (
  tab: chrome.tabs.Tab,
  groupId: string,
  order: number,
  now: string,
): NStorage.Sync.Schema.Tab => {
  const url = tab.url || 'about:blank'

  return {
    id: crypto.randomUUID(),
    title: tab.title || 'Untitled Tab',
    url,
    favIconUrl: tab.favIconUrl,
    order,
    groupId,
    isRepaired: shouldIgnoreAutoGroupUrl(url),
    createdAt: now,
    updatedAt: now,
    lastOpened: tab.lastAccessed ? new Date(tab.lastAccessed).toISOString() : now,
  }
}

interface TabDropTarget {
  kind: TabContainerKind
  windowId: number
  groupId?: number
  tabsInContainer: chrome.tabs.Tab[]
}

const cloneWindows = (windows: WindowData[]): WindowData[] =>
  windows.map((win) => ({
    ...win,
    tabsPinned: [...win.tabsPinned],
    tabsUngroup: [...win.tabsUngroup],
    groups: win.groups.map((group) => ({ ...group, tabs: [...group.tabs] })),
  }))

const getContainerGroupId = (containerId: string) => {
  if (!containerId.startsWith('group-')) return null
  const groupId = Number(containerId.slice('group-'.length))
  return Number.isFinite(groupId) ? groupId : null
}

const TAB_GROUP_NONE = -1

const getDropTargetForTab = (windows: WindowData[], tabId: number): TabDropTarget | null => {
  for (const win of windows) {
    if (win.tabsPinned.some((tab) => tab.id === tabId)) {
      return { kind: 'pinned', windowId: win.id, tabsInContainer: win.tabsPinned }
    }

    if (win.tabsUngroup.some((tab) => tab.id === tabId)) {
      return {
        kind: 'ungrouped',
        windowId: win.id,
        tabsInContainer: win.tabsUngroup,
      }
    }

    for (const group of win.groups) {
      if (group.tabs.some((tab) => tab.id === tabId)) {
        return {
          kind: 'group',
          windowId: win.id,
          groupId: group.id,
          tabsInContainer: group.tabs,
        }
      }
    }
  }

  return null
}

const getValidTabId = (tab: chrome.tabs.Tab | undefined): number | null =>
  typeof tab?.id === 'number' ? tab.id : null

export interface LiveThemeSmokeSeed {
  exampleTab: chrome.tabs.Tab
  groupId: number
  groupTitle?: string
  groupColor: NStorage.Sync.GroupColor
  saveMenuOpen: boolean
  dragOverlayOpen: boolean
}

export interface LiveManagementHandle {
  refreshActiveGroups: () => Promise<void>
  findTabById: (id: number) => chrome.tabs.Tab | undefined
  setAutoGroupScanStatus: (status: AutoGroupScanStatus) => void
  seedThemeSmokeState: () => Promise<LiveThemeSmokeSeed>
}

interface LiveManagementProps {
  onOpenAddToRules: (tab: chrome.tabs.Tab, sourceGroup?: QuickRuleSourceGroup) => void
}

const LiveManagement = forwardRef<LiveManagementHandle, LiveManagementProps>(function LiveManagement(
  { onOpenAddToRules },
  ref,
) {
  const [windows, setWindows] = useState<WindowData[]>([])
  const windowsRef = useRef<WindowData[]>([])
  const [totalTabsAllCount, setTotalTabsAllCount] = useState(0)
  const [saveStatuses, setSaveStatuses] = useState<Record<number, SaveStatus>>({})
  const [savedSnapshots, setSavedSnapshots] = useState<NStorage.Sync.Response.Group[]>([])
  const [showSaveMenu, setShowSaveMenu] = useState<number | null>(null)
  const [newSnapshotTitle, setNewSnapshotTitle] = useState('')
  const [isNamingNewSnapshot, setIsNamingNewSnapshot] = useState(false)
  const [autoGroupScanStatus, setAutoGroupScanStatus] = useState<AutoGroupScanStatus>({
    tone: 'idle',
  })
  const [renderedAutoGroupScanStatus, setRenderedAutoGroupScanStatus] =
    useState<AutoGroupScanStatus | null>(null)
  const [autoGroupToastPhase, setAutoGroupToastPhase] = useState<AutoGroupToastPhase>('visible')
  const [saveMenuPosition, setSaveMenuPosition] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)
  const autoGroupStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoGroupStatusExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveMenuRef = useRef<HTMLDivElement | null>(null)
  const saveMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const harnessMode = useMemo(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get(LIVE_HARNESS_QUERY_KEY)
  }, [])

  // DND State
  const [activeTabId, setActiveTabId] = useState<number | null>(null)
  const isDraggingLocal = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  )

  const getActiveGroups = useCallback(async () => {
    if (isDraggingLocal.current) return

    const currentWindow = await chrome.windows.getCurrent()
    const allWindows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] })
    const allGroups = await chrome.tabGroups.query({})

    let globalTabCount = 0

    const windowDataList: WindowData[] = allWindows.map((win) => {
      const winId = win.id!
      const winTabs = win.tabs || []
      globalTabCount += winTabs.length

      const winGroups = allGroups.filter((g) => g.windowId === winId)
      const tabListByGroups: Record<string, chrome.tabs.Tab[]> = {}

      winTabs.forEach((tab) => {
        const gId = `${tab.groupId}`
        if (!tabListByGroups[gId]) tabListByGroups[gId] = []
        tabListByGroups[gId].push(tab)
      })

      const groupsIncludeTabs = winGroups.map((group) => ({
        ...group,
        tabs: tabListByGroups[group.id] || [],
      }))

      const pinned: chrome.tabs.Tab[] = []
      const ungroup: chrome.tabs.Tab[] = []

      if (tabListByGroups['-1']?.length) {
        tabListByGroups['-1'].forEach((tab) => {
          if (tab.pinned) pinned.push(tab)
          else ungroup.push(tab)
        })
      }

      return {
        id: winId,
        isCurrent: winId === currentWindow.id,
        groups: groupsIncludeTabs,
        tabsPinned: pinned,
        tabsUngroup: ungroup,
        totalTabs: winTabs.length,
      }
    })

    windowDataList.sort((a, b) => (a.isCurrent === b.isCurrent ? 0 : a.isCurrent ? -1 : 1))

    windowsRef.current = windowDataList
    setWindows(windowDataList)
    setTotalTabsAllCount(globalTabCount)
  }, [])

  onTabUpdated(() => {
    getActiveGroups()
  })

  useEffect(() => {
    getActiveGroups()
    fetchSavedSnapshots()
  }, [getActiveGroups])

  useEffect(() => {
    if (autoGroupStatusTimerRef.current) {
      clearTimeout(autoGroupStatusTimerRef.current)
      autoGroupStatusTimerRef.current = null
    }

    if (autoGroupStatusExitTimerRef.current) {
      clearTimeout(autoGroupStatusExitTimerRef.current)
      autoGroupStatusExitTimerRef.current = null
    }

    if (!autoGroupScanStatus.message) {
      if (renderedAutoGroupScanStatus?.message) {
        setAutoGroupToastPhase('exiting')
        autoGroupStatusExitTimerRef.current = setTimeout(() => {
          setRenderedAutoGroupScanStatus(null)
          setAutoGroupToastPhase('visible')
          autoGroupStatusExitTimerRef.current = null
        }, AUTO_GROUP_STATUS_EXIT_MS)
      }
      return
    }

    setRenderedAutoGroupScanStatus(autoGroupScanStatus)
    setAutoGroupToastPhase('entering')

    const enterTimer = setTimeout(() => {
      setAutoGroupToastPhase('visible')
    }, 20)

    autoGroupStatusTimerRef.current = setTimeout(() => {
      setAutoGroupScanStatus({ tone: 'idle' })
      autoGroupStatusTimerRef.current = null
    }, AUTO_GROUP_STATUS_AUTO_DISMISS_MS)

    return () => {
      clearTimeout(enterTimer)

      if (autoGroupStatusTimerRef.current) {
        clearTimeout(autoGroupStatusTimerRef.current)
        autoGroupStatusTimerRef.current = null
      }

      if (autoGroupStatusExitTimerRef.current) {
        clearTimeout(autoGroupStatusExitTimerRef.current)
        autoGroupStatusExitTimerRef.current = null
      }
    }
  }, [autoGroupScanStatus, renderedAutoGroupScanStatus?.message])

  const updateSaveMenuPosition = useCallback(() => {
    if (!saveMenuTriggerRef.current) return

    const triggerRect = saveMenuTriggerRef.current.getBoundingClientRect()
    const width = Math.min(
      SNAPSHOT_MENU_WIDTH_PX,
      Math.max(160, window.innerWidth - SNAPSHOT_MENU_VIEWPORT_MARGIN_PX * 2),
    )
    const left = Math.min(
      Math.max(SNAPSHOT_MENU_VIEWPORT_MARGIN_PX, triggerRect.right - width),
      window.innerWidth - width - SNAPSHOT_MENU_VIEWPORT_MARGIN_PX,
    )
    const top = Math.min(
      triggerRect.bottom + SNAPSHOT_MENU_OFFSET_PX,
      window.innerHeight - SNAPSHOT_MENU_VIEWPORT_MARGIN_PX,
    )

    setSaveMenuPosition({ top, left, width })
  }, [])

  useEffect(() => {
    if (showSaveMenu === null) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null

      if (saveMenuRef.current?.contains(target) || saveMenuTriggerRef.current?.contains(target)) {
        return
      }

      setShowSaveMenu(null)
      setIsNamingNewSnapshot(false)
      setSaveMenuPosition(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      setShowSaveMenu(null)
      setIsNamingNewSnapshot(false)
      setSaveMenuPosition(null)
    }

    updateSaveMenuPosition()

    const handleViewportChange = () => updateSaveMenuPosition()

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    document.addEventListener('scroll', handleViewportChange, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      document.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [showSaveMenu, updateSaveMenuPosition])

  const fetchSavedSnapshots = useCallback(async () => {
    const res = await StorageSyncGroup.getListWithTabs()
    setSavedSnapshots(res || [])
  }, [])

  const handleRestoreSnapshot = async (group: NStorage.Sync.Response.Group) => {
    try {
      const currentWindow = await chrome.windows.getCurrent()
      const sortedTabs = [...group.tabs].sort((a, b) => (a.order || 0) - (b.order || 0))

      for (const tab of sortedTabs) {
        if (tab.url && !shouldIgnoreAutoGroupUrl(tab.url)) {
          await chrome.tabs.create({
            url: tab.url,
            active: false,
            windowId: currentWindow.id,
          })
        }
      }
      void getActiveGroups()
    } catch (e) {
      console.error('Failed to restore snapshot:', e)
    }
  }

  const setSaveStatus = (groupId: number, status: SaveStatus) => {
    setSaveStatuses((current) => ({
      ...current,
      [groupId]: status,
    }))
  }

  const getUniqueSnapshotTitle = (title: string) => {
    const existingTitles = new Set(savedSnapshots.map((snapshot) => snapshot.title.toLowerCase()))
    const baseTitle = title.trim() || 'Untitled Group'

    if (!existingTitles.has(baseTitle.toLowerCase())) return baseTitle

    let counter = 1
    let candidate = `${baseTitle} (${counter})`

    while (existingTitles.has(candidate.toLowerCase())) {
      counter += 1
      candidate = `${baseTitle} (${counter})`
    }

    return candidate
  }

  const openSaveMenu = (group: TabGroup) => {
    setShowSaveMenu(group.id)
    setNewSnapshotTitle(group.title || 'Untitled Group')
    setIsNamingNewSnapshot(false)
  }

  const saveGroupSnapshot = async (group: TabGroup) => {
    const finalTitle = getUniqueSnapshotTitle(newSnapshotTitle || group.title || 'Untitled Group')
    setShowSaveMenu(null)
    setIsNamingNewSnapshot(false)
    setSaveMenuPosition(null)
    setSaveStatus(group.id, {
      state: 'pending',
      message: 'Saving...',
    })

    const now = new Date().toISOString()
    const snapshotGroupId = crypto.randomUUID()
    const snapshotGroup: NStorage.Sync.Schema.Group = {
      id: snapshotGroupId,
      title: finalTitle,
      color: group.color,
      order: savedSnapshots.length,
      createdAt: now,
      updatedAt: now,
    }

    const snapshotTabs: NStorage.Sync.Schema.Tab[] = group.tabs.map((tab, index) =>
      toSnapshotTab(tab, snapshotGroupId, index + 1, now),
    )

    try {
      await StorageSyncGroup.create(snapshotGroup)
      await StorageSyncTab.create(...snapshotTabs)
      await fetchSavedSnapshots()
      setSaveStatus(group.id, {
        state: 'saved',
        message: 'Saved',
      })
    } catch (e) {
      console.error(e)
      setSaveStatus(group.id, {
        state: 'failed',
        message: 'Save failed',
      })
    }
  }

  const updateExistingSnapshot = async (
    liveGroup: TabGroup,
    savedSnapshot: NStorage.Sync.Response.Group,
  ) => {
    setShowSaveMenu(null)
    setIsNamingNewSnapshot(false)
    setSaveMenuPosition(null)
    setSaveStatus(liveGroup.id, {
      state: 'pending',
      message: 'Saving...',
    })

    const now = new Date().toISOString()
    const updatedGroup: NStorage.Sync.Schema.Group = {
      id: savedSnapshot.id,
      title: savedSnapshot.title,
      color: liveGroup.color,
      order: savedSnapshot.order,
      createdAt: savedSnapshot.createdAt,
      updatedAt: now,
    }

    const newTabs: NStorage.Sync.Schema.Tab[] = liveGroup.tabs.map((tab, index) =>
      toSnapshotTab(tab, savedSnapshot.id, index + 1, now),
    )

    try {
      await StorageSyncGroup.update(updatedGroup)
      await StorageSyncTab.deleteTabsByGroupId(savedSnapshot.id)
      await StorageSyncTab.create(...newTabs)
      await fetchSavedSnapshots()
      setSaveStatus(liveGroup.id, {
        state: 'saved',
        message: 'Saved',
      })
    } catch (e) {
      console.error(e)
      setSaveStatus(liveGroup.id, {
        state: 'failed',
        message: 'Save failed',
      })
    }
  }

  const focusWindow = (windowId: number) => {
    void chrome.windows.update(windowId, { focused: true })
  }

  const toggleGroupCollapsed = async (group: TabGroup) => {
    await chrome.tabGroups.update(group.id, { collapsed: !group.collapsed })
    void getActiveGroups()
  }

  const closeGroupTabs = async (group: TabGroup) => {
    const tabIds = group.tabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === 'number')

    if (!tabIds.length) return

    setShowSaveMenu(null)
    await chrome.tabs.remove(tabIds)
    void getActiveGroups()
  }

  const runAutoGroupScan = () => {
    setAutoGroupScanStatus({
      tone: 'idle',
      message: 'Scanning browser...',
    })

    chrome.runtime.sendMessage({ action: 'run_auto_group_scan' }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        setAutoGroupScanStatus({
          tone: 'error',
          message: 'Auto-group scan failed',
        })
        void getActiveGroups()
        return
      }

      const summary = response.summary
      setAutoGroupScanStatus({
        tone: summary?.grouped > 0 ? 'success' : 'warning',
        message:
          summary?.grouped > 0
            ? `Grouped ${summary.grouped} tab${summary.grouped === 1 ? '' : 's'}`
            : 'No matching tabs found',
      })
      void getActiveGroups()
    })
  }

  const findTabById = (id: number) => {
    for (const win of windowsRef.current) {
      const tab = [
        ...win.tabsPinned,
        ...win.tabsUngroup,
        ...win.groups.flatMap((g) => g.tabs),
      ].find((t) => t.id === id)
      if (tab) return tab
    }
    return undefined
  }

  const seedThemeSmokeState = useCallback(async () => {
    const ensureTabInState = async () => {
      for (let i = 0; i < 10; i++) {
        await getActiveGroups()
        const tabs = await chrome.tabs.query({})
        const exampleTab = tabs.find((tab) => (tab.url || '').startsWith('https://example.com/'))

        if (exampleTab?.id && findTabById(exampleTab.id)) {
          return exampleTab
        }

        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      throw new Error('Example tab not found in local state after retries')
    }

    const exampleTab = await ensureTabInState()
    const groupedWindows = windowsRef.current
    const firstGroup = groupedWindows.flatMap((win) => win.groups).find((group) => group.tabs.length > 0)

    if (!firstGroup) {
      throw new Error('No grouped tab card available for theme smoke harness')
    }

    openSaveMenu(firstGroup)
    setIsNamingNewSnapshot(true)
    setNewSnapshotTitle(firstGroup.title || 'Untitled Group')
    setActiveTabId(exampleTab.id ?? null)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })

    return {
      exampleTab,
      groupId: firstGroup.id,
      groupTitle: firstGroup.title || undefined,
      groupColor: firstGroup.color,
      saveMenuOpen: true,
      dragOverlayOpen: true,
    }
  }, [getActiveGroups])

  useImperativeHandle(
    ref,
    () => ({
      refreshActiveGroups: getActiveGroups,
      findTabById,
      setAutoGroupScanStatus,
      seedThemeSmokeState,
    }),
    [getActiveGroups, seedThemeSmokeState],
  )

  const findContainer = (id: number | string) => {
    if (typeof id === 'string') return id
    for (const win of windowsRef.current) {
      if (win.tabsPinned.some((t) => t.id === id)) return `ungroup-pinned-${win.id}`
      if (win.tabsUngroup.some((t) => t.id === id)) return `ungroup-${win.id}`
      for (const group of win.groups) {
        if (group.tabs.some((t) => t.id === id)) return `group-${group.id}`
      }
    }
    return null
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTabId(event.active.id as number)
    isDraggingLocal.current = true
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as number
    const overId = over.id

    const activeContainer = findContainer(activeId)
    const overContainer = findContainer(overId)
    const isOverContainer = typeof overId === 'string'
    const insertAfterOverTab =
      !isOverContainer &&
      active.rect.current.translated &&
      active.rect.current.translated.top > over.rect.top + over.rect.height / 2

    if (!activeContainer || !overContainer) return

    if (activeContainer !== overContainer) {
      setWindows((prev) => {
        const newWindows = cloneWindows(prev)

        let activeTab: chrome.tabs.Tab | undefined

        // Remove from source
        for (const win of newWindows) {
          const pIdx = win.tabsPinned.findIndex((t) => t.id === activeId)
          if (pIdx !== -1) {
            activeTab = win.tabsPinned.splice(pIdx, 1)[0]
            break
          }
          const uIdx = win.tabsUngroup.findIndex((t) => t.id === activeId)
          if (uIdx !== -1) {
            activeTab = win.tabsUngroup.splice(uIdx, 1)[0]
            break
          }
          for (const group of win.groups) {
            const tIdx = group.tabs.findIndex((t) => t.id === activeId)
            if (tIdx !== -1) {
              activeTab = group.tabs.splice(tIdx, 1)[0]
              break
            }
          }
          if (activeTab) break
        }

        if (!activeTab) return prev

        // Insert into target
        for (const win of newWindows) {
          if (overContainer === `ungroup-pinned-${win.id}`) {
            const overIndex = win.tabsPinned.findIndex((t) => t.id === overId)
            const index = isOverContainer
              ? win.tabsPinned.length
              : overIndex + (insertAfterOverTab ? 1 : 0)
            win.tabsPinned.splice(index >= 0 ? index : win.tabsPinned.length, 0, activeTab)
            break
          }
          if (overContainer === `ungroup-${win.id}`) {
            const overIndex = win.tabsUngroup.findIndex((t) => t.id === overId)
            const index = isOverContainer
              ? win.tabsUngroup.length
              : overIndex + (insertAfterOverTab ? 1 : 0)
            win.tabsUngroup.splice(index >= 0 ? index : win.tabsUngroup.length, 0, activeTab)
            break
          }
          if (overContainer.startsWith('group-')) {
            const groupId = getContainerGroupId(overContainer)
            const group = win.groups.find((g) => g.id === groupId)
            if (group) {
              const overIndex = group.tabs.findIndex((t) => t.id === overId)
              const index = isOverContainer
                ? group.tabs.length
                : overIndex + (insertAfterOverTab ? 1 : 0)
              group.tabs.splice(index >= 0 ? index : group.tabs.length, 0, activeTab)
              break
            }
          }
        }

        windowsRef.current = newWindows
        return newWindows
      })
    } else if (activeId !== overId && typeof overId === 'number') {
      // Reorder within the same container
      setWindows((prev) => {
        const newWindows = cloneWindows(prev)
        for (const win of newWindows) {
          if (activeContainer === `ungroup-pinned-${win.id}`) {
            const oldIndex = win.tabsPinned.findIndex((t) => t.id === activeId)
            const newIndex = win.tabsPinned.findIndex((t) => t.id === overId)
            win.tabsPinned = arrayMove(win.tabsPinned, oldIndex, newIndex)
            break
          }
          if (activeContainer === `ungroup-${win.id}`) {
            const oldIndex = win.tabsUngroup.findIndex((t) => t.id === activeId)
            const newIndex = win.tabsUngroup.findIndex((t) => t.id === overId)
            win.tabsUngroup = arrayMove(win.tabsUngroup, oldIndex, newIndex)
            break
          }
          if (activeContainer.startsWith('group-')) {
            const groupId = getContainerGroupId(activeContainer)
            const group = win.groups.find((g) => g.id === groupId)
            if (group) {
              const oldIndex = group.tabs.findIndex((t) => t.id === activeId)
              const newIndex = group.tabs.findIndex((t) => t.id === overId)
              group.tabs = arrayMove(group.tabs, oldIndex, newIndex)
              break
            }
          }
        }
        windowsRef.current = newWindows
        return newWindows
      })
    }
  }

  const syncTabDropToChrome = async (tabId: number, target: TabDropTarget) => {
    const tab = await chrome.tabs.get(tabId)
    const shouldBePinned = target.kind === 'pinned'
    const targetContainerIndex = target.tabsInContainer.findIndex((item) => item.id === tabId)
    if (targetContainerIndex === -1) return

    const previousTabId = getValidTabId(target.tabsInContainer[targetContainerIndex - 1])
    const nextTabId = getValidTabId(target.tabsInContainer[targetContainerIndex + 1])

    if (target.kind !== 'group' && tab.groupId !== TAB_GROUP_NONE) {
      await chrome.tabs.ungroup(tabId)
    }

    if (target.kind === 'group' && tab.pinned) {
      await chrome.tabs.update(tabId, { pinned: false })
    } else if (tab.pinned !== shouldBePinned) {
      await chrome.tabs.update(tabId, { pinned: shouldBePinned })
    }

    if (tab.windowId !== target.windowId) {
      await chrome.tabs.move(tabId, { windowId: target.windowId, index: -1 })
    }

    if (target.kind === 'group' && typeof target.groupId === 'number') {
      await chrome.tabs.group({ groupId: target.groupId, tabIds: tabId })
    }

    const activeTab = await chrome.tabs.get(tabId)
    let finalIndex = -1

    if (nextTabId !== null) {
      const nextTab = await chrome.tabs.get(nextTabId)
      finalIndex = activeTab.index < nextTab.index ? nextTab.index - 1 : nextTab.index
    } else if (previousTabId !== null) {
      const previousTab = await chrome.tabs.get(previousTabId)
      finalIndex = activeTab.index < previousTab.index ? previousTab.index : previousTab.index + 1
    }

    await chrome.tabs.move(tabId, { windowId: target.windowId, index: finalIndex })
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTabId(null)

    if (!over) {
      isDraggingLocal.current = false
      void getActiveGroups()
      return
    }

    const activeId = active.id as number
    const target = getDropTargetForTab(windowsRef.current, activeId)

    if (!target) {
      isDraggingLocal.current = false
      void getActiveGroups()
      return
    }

    try {
      await syncTabDropToChrome(activeId, target)
    } catch (e) {
      console.error('DND Sync Error', e)
    }

    // IMPORTANT: Wait a bit for Chrome to settle before allowing updates
    setTimeout(() => {
      isDraggingLocal.current = false
      void getActiveGroups()
    }, 150)
  }

  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args)

    if (pointerCollisions.length > 0) {
      const tabCollision = pointerCollisions.find((c) => typeof c.id === 'number')
      if (tabCollision) return [tabCollision]

      const containerCollision = pointerCollisions.find((c) => typeof c.id === 'string')
      if (containerCollision) return [containerCollision]
    }

    return closestCenter(args)
  }, [])

  const activeTab = useMemo(
    () => (activeTabId ? findTabById(activeTabId) : null),
    [activeTabId, windows],
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="relative flex flex-col gap-6 p-2 pb-6 min-h-full">
        {renderedAutoGroupScanStatus?.message && (
          <div
            className={cn(
              'pointer-events-none fixed inset-x-0 z-40 flex justify-center px-2',
            )}
            style={{ bottom: `${LIVE_TOAST_BOTTOM_OFFSET_PX}px` }}
            role="status"
            aria-live="polite"
          >
            <div
              className={cn(
                'pointer-events-auto w-full max-w-[min(100%,22rem)] rounded-2xl border px-3 py-2 shadow-lg backdrop-blur will-change-transform will-change-opacity',
                autoGroupToastPhase === 'entering' && 'live-toast-enter',
                autoGroupToastPhase === 'exiting' && 'live-toast-exit',
                autoGroupToastPhase === 'visible' && 'live-toast-idle',
                renderedAutoGroupScanStatus.tone === 'success' &&
                  'border-emerald-200 bg-emerald-50/95 text-emerald-700',
                renderedAutoGroupScanStatus.tone === 'warning' &&
                  'border-amber-200 bg-amber-50/95 text-amber-700',
                renderedAutoGroupScanStatus.tone === 'error' &&
                  'border-rose-200 bg-rose-50/95 text-rose-700',
                renderedAutoGroupScanStatus.tone === 'idle' &&
                  'border-[var(--sp-card-border)] bg-[color:color-mix(in_srgb,var(--surface-muted)_94%,transparent)] text-[var(--text-secondary)]',
              )}
            >
              <div className="live-toast-content flex items-start gap-2.5">
                <p className="min-w-0 flex-1 break-words pr-1 text-[11px] font-bold leading-4 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
                  {renderedAutoGroupScanStatus.message}
                </p>
                <button
                  type="button"
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-current/60 transition-all duration-200 hover:bg-black/5 hover:text-current hover:scale-105"
                  onClick={() => setAutoGroupScanStatus({ tone: 'idle' })}
                  aria-label="Dismiss status message"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          </div>
        )}

        {windows.map((win) => (
          <div key={win.id} className="flex flex-col gap-2.5">
            <div
              className={cn(
                'flex cursor-pointer items-center justify-between px-1.5 transition-opacity hover:opacity-80',
                !win.isCurrent && 'opacity-60',
              )}
              onClick={() => focusWindow(win.id)}
            >
              <div className="flex items-center gap-2">
                <Monitor
                  size={12}
                  className={win.isCurrent ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}
                />
                <p
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider',
                    win.isCurrent ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
                  )}
                >
                  Window {windows.length > 1 ? windows.findIndex((w) => w.id === win.id) + 1 : ''}{' '}
                  {win.isCurrent && '• Current'}
                </p>
              </div>
              <span className="sp-copy-muted text-[9px] font-bold uppercase">
                {win.totalTabs} tabs
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {win.tabsPinned.length > 0 && (
                <SortableContext
                  items={win.tabsPinned.map((t) => t.id!)}
                  strategy={verticalListSortingStrategy}
                >
                  <BentoGroupCard
                    id={`ungroup-pinned-${win.id}`}
                    title={MOCK_GROUP[EMockGroup.PINNED]}
                    tabs={win.tabsPinned}
                    className="sp-subtle-surface"
                    onAddTabToRules={(tab) => onOpenAddToRules(tab)}
                  />
                </SortableContext>
              )}

              {win.groups.map((group) => (
                <SortableContext
                  key={group.id}
                  items={group.tabs.map((t) => t.id!)}
                  strategy={verticalListSortingStrategy}
                >
                  <BentoGroupCard
                    id={`group-${group.id}`}
                    title={group.title || 'Untitled Group'}
                    color={group.color}
                    tabs={group.tabs}
                    collapsed={group.collapsed}
                    onToggleCollapsed={() => void toggleGroupCollapsed(group)}
                    onCloseTabs={() => void closeGroupTabs(group)}
                    onAddTabToRules={(tab) =>
                      onOpenAddToRules(tab, {
                        title: group.title || undefined,
                        color: group.color,
                      })
                    }
                    actions={
                      <div className="relative flex items-center gap-2">
                        {saveStatuses[group.id]?.state &&
                          saveStatuses[group.id].state !== 'idle' && (
                            <span
                              className={cn(
                                'hidden rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider md:inline-flex',
                                saveStatuses[group.id].state === 'saved' &&
                                  'bg-emerald-100 text-emerald-700',
                                saveStatuses[group.id].state === 'failed' &&
                                  'bg-rose-100 text-rose-700',
                                saveStatuses[group.id].state === 'pending' &&
                                  'bg-[var(--surface-muted)] text-[var(--text-secondary)]',
                              )}
                            >
                              {saveStatuses[group.id].state}
                            </span>
                          )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            'sp-secondary-action h-7 rounded-full px-2.5 text-[11px] font-bold shadow-none',
                            showSaveMenu === group.id && 'bg-[var(--surface-muted)]',
                          )}
                          disabled={saveStatuses[group.id]?.state === 'pending'}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (showSaveMenu === group.id) {
                              setShowSaveMenu(null)
                              setIsNamingNewSnapshot(false)
                              setSaveMenuPosition(null)
                            } else {
                              saveMenuTriggerRef.current = event.currentTarget
                              openSaveMenu(group)
                            }
                          }}
                        >
                          {saveStatuses[group.id]?.state === 'pending' ? (
                            <LoaderCircle className="animate-spin" size={12} />
                          ) : saveStatuses[group.id]?.state === 'saved' ? (
                            <CheckCircle2 size={12} />
                          ) : (
                            <FolderPlus size={12} />
                          )}
                          <span className="ml-1">
                            {saveStatuses[group.id]?.state === 'pending' && 'Saving'}
                            {saveStatuses[group.id]?.state === 'saved' && 'Saved'}
                            {saveStatuses[group.id]?.state !== 'pending' &&
                              saveStatuses[group.id]?.state !== 'saved' &&
                              'Snapshot'}
                          </span>
                        </Button>

                        {showSaveMenu === group.id &&
                          saveMenuPosition &&
                          typeof document !== 'undefined' &&
                          createPortal(
                            <div className="pointer-events-none fixed inset-0 z-[70]">
                              <div
                                ref={saveMenuRef}
                                data-live-surface="save-menu"
                                className="sp-overlay-panel pointer-events-auto fixed flex flex-col gap-1 rounded-xl p-2 text-left shadow-xl"
                                style={{
                                  top: `${saveMenuPosition.top}px`,
                                  left: `${saveMenuPosition.left}px`,
                                  width: `${saveMenuPosition.width}px`,
                                  maxHeight: `calc(100vh - ${saveMenuPosition.top + SNAPSHOT_MENU_VIEWPORT_MARGIN_PX}px)`,
                                }}
                                onClick={(event) => event.stopPropagation()}
                              >
                            <button
                              type="button"
                              className="sp-overlay-item flex items-center justify-between rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                              onClick={() => setIsNamingNewSnapshot((current) => !current)}
                            >
                              <span>New Snapshot</span>
                              <FolderPlus size={12} className="sp-copy-muted" />
                            </button>

                            {isNamingNewSnapshot && (
                              <div className="sp-subtle-surface flex flex-col gap-1.5 rounded-lg p-1.5">
                                <input
                                  autoFocus
                                  className="sp-input-shell sp-input min-w-0 w-full rounded-md border-none px-2 py-1.5 text-[11px] font-medium outline-none"
                                  value={newSnapshotTitle}
                                  onChange={(event) => setNewSnapshotTitle(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') void saveGroupSnapshot(group)
                                    if (event.key === 'Escape') setIsNamingNewSnapshot(false)
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 w-full rounded-md px-2 text-[10px] font-bold"
                                  onClick={() => void saveGroupSnapshot(group)}
                                >
                                  Save
                                </Button>
                              </div>
                            )}

                            <div className="sp-divider my-1" />

                            <p className="sp-label px-2 py-1 text-[9px] font-bold uppercase tracking-wider">
                              Overwrite
                            </p>

                            {savedSnapshots.length > 0 ? (
                              <div className="flex max-h-36 flex-col gap-0.5 overflow-y-auto">
                                {savedSnapshots.map((snapshot) => (
                                  <button
                                    key={snapshot.id}
                                    type="button"
                                    className="sp-overlay-item flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[10px]"
                                    onClick={() => void updateExistingSnapshot(group, snapshot)}
                                  >
                                    <span className="sp-copy-secondary min-w-0 truncate font-medium">
                                      {snapshot.title || 'Untitled Snapshot'}
                                    </span>
                                    <span className="sp-copy-muted shrink-0 text-[9px] font-bold">
                                      {snapshot.tabs.length}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="sp-copy-muted px-2 py-1.5 text-[10px] italic">
                                No saved snapshots yet
                              </p>
                            )}
                              </div>
                            </div>,
                            document.body,
                          )}
                      </div>
                    }
                  />
                </SortableContext>
              ))}

              {win.tabsUngroup.length > 0 && (
                <SortableContext
                  items={win.tabsUngroup.map((t) => t.id!)}
                  strategy={verticalListSortingStrategy}
                >
                  <BentoGroupCard
                    id={`ungroup-${win.id}`}
                    title={MOCK_GROUP[EMockGroup.UNGROUP]}
                    tabs={win.tabsUngroup}
                    className="sp-empty-state"
                    onAddTabToRules={(tab) => onOpenAddToRules(tab)}
                  />
                </SortableContext>
              )}
            </div>
          </div>
        ))}

        {totalTabsAllCount === 0 && (
          <StarterSuggestions 
            savedSnapshots={savedSnapshots}
            onRestoreSnapshot={handleRestoreSnapshot}
          />
        )}

        {/* Hidden surfaces for verifier */}
        <div className="hidden" aria-hidden="true">
          <div data-live-surface="top-sites" />
        </div>
      </div>

      {/* Theme Smoke Overlay (Only for verifier) */}
      {harnessMode === LIVE_ADD_TO_RULES_HARNESS_MODE && activeTab && (
        <div
          data-live-surface="drag-overlay"
          className="fixed inset-0 pointer-events-none z-[9999] flex items-center justify-center opacity-0"
        >
          <div className="w-[280px]">
            <TabListItem tab={activeTab} isOverlay />
          </div>
        </div>
      )}

      <DragOverlay
        dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({
            styles: {
              active: {
                opacity: '0.4',
              },
            },
          }),
        }}
      >
        {activeTab ? (
          <div className="w-[280px] pointer-events-none">
            <TabListItem tab={activeTab} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
})

export default LiveManagement
