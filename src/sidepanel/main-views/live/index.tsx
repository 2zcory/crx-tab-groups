import { MOCK_GROUP } from "@/constants"
import { EMockGroup } from "@/enums"
import { extractDomainNameFromUrl } from "@/helpers"
import onTabUpdated from "@/listeners/onTabUpdated"
import StorageSyncFavIcon from "@/storage/favIcon.sync"
import { useEffect, useState } from "react"
import TopSites from "./components/TopSites"
import { BentoGroupCard } from "@/components/BentoGroupCard"

interface TabGroup extends chrome.tabGroups.TabGroup {
  tabs: chrome.tabs.Tab[]
}

function LiveManagement() {
  // List of groups, each with a nested tab list
  const [groups, setGroups] = useState<TabGroup[]>([])
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([])

  const [tabsPinned, setTabsPinned] = useState<chrome.tabs.Tab[]>([])
  const [tabsUngroup, setTabsUngroup] = useState<chrome.tabs.Tab[]>([])

  onTabUpdated(() => {
    getActiveGroups();
  })

  useEffect(() => {
    const timer = setTimeout(() => addFavIconsToStorage(), 30000);
    return () => clearTimeout(timer)
  }, [tabs])

  useEffect(() => {
    getActiveGroups();
  }, [])

  // Performance
  const addFavIconsToStorage = async () => {
    const favIcons = await StorageSyncFavIcon.get()
    tabs.forEach(tab => {
      if (!tab.url) return
      const domainNameExtract = extractDomainNameFromUrl(tab.url)
      if (!tab.favIconUrl || !domainNameExtract) return
      favIcons[domainNameExtract] = {
        url: tab.favIconUrl,
        lastOpened: new Date().toISOString()
      }
    })
    await StorageSyncFavIcon.update(favIcons)
  }

  const getActiveGroups = async () => {
    const activeGroups = await chrome.tabGroups.query({})
    const activeTabs = await chrome.tabs.query({})
    
    // Use manual grouping instead of Object.groupBy for broader compatibility if needed, 
    // but React 18+ usually environment handles this. 
    const tabListByGroups: Record<string, chrome.tabs.Tab[]> = {}
    activeTabs.forEach(tab => {
      const gId = `${tab.groupId}`
      if (!tabListByGroups[gId]) tabListByGroups[gId] = []
      tabListByGroups[gId].push(tab)
    })

    const groupsIncludeTabs = activeGroups.map(group => ({
      ...group,
      tabs: tabListByGroups[group.id] || []
    }))

    if (tabListByGroups["-1"]?.length) {
      const pinned: chrome.tabs.Tab[] = []
      const ungroup: chrome.tabs.Tab[] = []
      tabListByGroups["-1"].forEach(tab => {
        if (tab.pinned) pinned.push(tab)
        else ungroup.push(tab)
      })
      setTabsPinned(pinned)
      setTabsUngroup(ungroup)
    } else {
      setTabsPinned([])
      setTabsUngroup([])
    }

    setTabs(activeTabs)
    setGroups(groupsIncludeTabs)
  }

  const handleTabClick = (tabId: number) => {
    chrome.tabs.update(tabId, { active: true })
  }

  return (
    <div className="flex flex-col gap-3 p-1.5">
      <TopSites />
      
      <div className="flex items-center justify-between px-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live</span>
          <div className="w-1 h-1 bg-slate-300 rounded-full" />
          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-tight">
            {tabs.length} Tabs · {groups.length} Groups
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {/* Pinned Tabs - A sleek bento card */}
        {tabsPinned.length > 0 && (
          <BentoGroupCard
            title={MOCK_GROUP[EMockGroup.PINNED]}
            tabs={tabsPinned}
            onTabClick={handleTabClick}
            className="bg-slate-50 border-slate-200"
          />
        )}

        {/* Active Groups - Colorful bento cards */}
        {groups.map(group => (
          <BentoGroupCard
            key={group.id}
            title={group.title || "Untitled Group"}
            color={group.color}
            tabs={group.tabs}
            onTabClick={handleTabClick}
          />
        ))}

        {/* Ungrouped Tabs - Simple minimalist card */}
        {tabsUngroup.length > 0 && (
          <BentoGroupCard
            title={MOCK_GROUP[EMockGroup.UNGROUP]}
            tabs={tabsUngroup}
            onTabClick={handleTabClick}
            className="bg-white border-dashed border-slate-300"
          />
        )}
      </div>

      {tabs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <p className="text-sm font-medium">No active tabs found</p>
          <p className="text-xs">Your garden is empty</p>
        </div>
      )}
    </div>
  )
}

export default LiveManagement

