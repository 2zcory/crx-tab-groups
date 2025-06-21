import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import StorageSyncGroup from "@/storage/group.sync"
import { useEffect, useState } from "react"

function GroupManagement() {
  const [groups, setGroups] = useState<NStorage.Sync.Response.Group[]>([])

  useEffect(() => {
    fetchGroups()
  }, [])

  const fetchGroups = async () => {
    // TODO
    const res = await StorageSyncGroup.getListWithTabs();

    setGroups(res)
  }

  return (
    <Accordion type="single" collapsible className="w-full" defaultValue="1">
      {
        groups.map(group => (
          <AccordionItem key={group.id} value={group.id}>
            <AccordionTrigger>{group.title}</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4 text-balance">
              <ul>
                {
                  group.tabs.map(tab => (
                    <li key={tab.id}>{tab.title}</li>
                  ))
                }
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))
      }
    </Accordion>
  )
}

export default GroupManagement
