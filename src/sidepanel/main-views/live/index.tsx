import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MOCK_GROUP } from "@/constants"
import { EMockGroup } from "@/enums"
import { extractDomainNameFromUrl } from "@/helpers"
import { cn } from "@/lib/utils"
import onTabUpdated from "@/listeners/onTabUpdated"
import StorageSyncFavIcon from "@/storage/favIcon.sync"
import { X } from "lucide-react"
import { useEffect, useState } from "react"
import TopSites from "./components/TopSites"
import { C_GROUP_COLOR_BG_CLASSES, C_GROUP_COLOR_BORDER_CLASSES } from "@/constants/group-color-classes"
import TabListItem from "./components/TabListItem"

interface TabGroup extends chrome.tabGroups.TabGroup {
  tabs: chrome.tabs.Tab[]
}

function LiveManagement() {
  // List of groups, each with a nested tab list
  const [groups, setGroups] = useState<TabGroup[]>([])
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([])

  const [tabsPinned, setTabsPinned] = useState<chrome.tabs.Tab[]>([])
  const [tabsUngroup, setTabsUngroup] = useState<chrome.tabs.Tab[]>([])

  const [accordionValues, setAccordionValues] = useState<string[]>([`${EMockGroup.PINNED}`, `${EMockGroup.UNGROUP}`])

  console.log("tabs", tabs)

  onTabUpdated(() => {
    getActiveGroups();
  })

  useEffect(() => {
    const timer = setTimeout(() => addFavIconsToStorage(), 30000);

    return () => clearTimeout(timer)
  }, [tabs])

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
    // TODO
    const activeGroups = await chrome.tabGroups.query({})
    const activeTabs = await chrome.tabs.query({})
    const groupIdsOpened: string[] = []

    const tabListByGroups = Object.groupBy(activeTabs, ({ groupId }) => groupId)
    const groupsIncludeTabs = activeGroups.map(group => {
      if (!group.collapsed) {
        groupIdsOpened.push(`${group.id}`)
      }

      return ({
        ...group,
        tabs: tabListByGroups[group.id] || []
      })
    })

    if (tabListByGroups["-1"]?.length) {
      const tabsPinned: chrome.tabs.Tab[] = []
      const tabsUngroup: chrome.tabs.Tab[] = []
      tabListByGroups["-1"].forEach(tab => {
        if (tab.pinned) {
          tabsPinned.push(tab)
        } else {
          tabsUngroup.push(tab)
        }
      })

      setTabsPinned(tabsPinned)
      setTabsUngroup(tabsUngroup)
    }

    setTabs(activeTabs)
    setGroups(groupsIncludeTabs)
    setAccordionValues(prev => {
      const pinnedId = `${EMockGroup.PINNED}`
      const ungroupId = `${EMockGroup.UNGROUP}`
      if (prev.includes(pinnedId)) groupIdsOpened.push(pinnedId)
      if (prev.includes(ungroupId)) groupIdsOpened.push(ungroupId)
      return groupIdsOpened
    })
  }

  const toggleGroup = async (groupId: number) => {
    if (!groupId) return;

    const isCollapsed = accordionValues.some(value => value === String(groupId))

    if (groupId === EMockGroup.PINNED || groupId === EMockGroup.UNGROUP) {
      if (isCollapsed) {
        setAccordionValues(prev =>
          prev.filter(id => id !== String(groupId))
        )
      } else {
        setAccordionValues(prev => [...prev, String(groupId)])
      }
    } else {
      await chrome.tabGroups.update(groupId, {
        collapsed: isCollapsed,
      })
    }
  }

  const closeGroup = async (group: TabGroup) => {
    const tabIdsToClose: number[] = group.tabs.map(tab => tab.id).filter(id => id !== undefined)

    // TODO
    await chrome.tabs.remove(tabIdsToClose)
  }

  return (
    <div>
      <TopSites />
      <Accordion type="multiple" className="w-full" value={accordionValues}>
        {
          tabsPinned.length ? (
            <AccordionItem value={`${EMockGroup.PINNED}`}>
              <AccordionTrigger onClick={() => toggleGroup(EMockGroup.PINNED)} className="py-2 mt-1 pl-2">
                {MOCK_GROUP[EMockGroup.PINNED]}
              </AccordionTrigger>
              <AccordionContent className="flex flex-col text-balance">
                {
                  tabsPinned.map(tab => (
                    <TabListItem key={tab.id}
                      tab={tab}
                    />
                  ))
                }
              </AccordionContent>
            </AccordionItem>
          ) : (<></>)
        }
        {
          groups.map(group => (
            <AccordionItem key={group.id} value={`${group.id}`}>
              <AccordionTrigger onClick={() => toggleGroup(group.id)}
                className={cn(
                  "py-2 mt-1 pl-2 border border-r-0 border-l-4 border-t-0 rounded-sm",
                  C_GROUP_COLOR_BORDER_CLASSES[group.color]
                )}
              >
                <Badge className={cn(
                  "text-white",
                  C_GROUP_COLOR_BG_CLASSES[group.color],
                )}>
                  {group.title}
                </Badge>
                <Button variant="ghost" size="sm" className="size-5 ml-auto cursor-default hover:bg-gray-200"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeGroup(group)
                  }}
                >
                  <X />
                </Button>
              </AccordionTrigger>
              <AccordionContent className={cn(
                "flex flex-col text-balance",
              )}>
                {
                  group.tabs.map(tab => (
                    <TabListItem key={tab.id}
                      tab={tab}
                    />
                  ))
                }
              </AccordionContent>
            </AccordionItem>
          ))
        }
        {
          tabsUngroup.length ? (
            <AccordionItem value={`${EMockGroup.UNGROUP}`}>
              <AccordionTrigger onClick={() => toggleGroup(EMockGroup.UNGROUP)} className="py-2 mt-1 pl-2">{MOCK_GROUP[EMockGroup.UNGROUP]}</AccordionTrigger>
              <AccordionContent className="flex flex-col text-balance">
                {
                  tabsUngroup.map(tab => (
                    <TabListItem key={tab.id}
                      tab={tab}
                    />
                  ))
                }
              </AccordionContent>
            </AccordionItem>
          ) : (<></>)
        }
      </Accordion>
    </div>
  )
}

export default LiveManagement
