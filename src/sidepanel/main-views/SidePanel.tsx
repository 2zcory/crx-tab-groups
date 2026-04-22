import { useEffect, useState } from 'react'

import './SidePanel.css'
import migrateScheme from '@/migrations'
import LiveManagement from './live'
import Layout from './layout'
import Tabs from '@/components/ui/tabs'
import { TAB_MENU } from '@/constants'
import { ETabMenu } from '@/enums'
import GroupManagement from './group-management'
import AutomationManagement from './automation-management'
import { LiveStatusBar } from './live/components/LiveStatusBar'

export const SidePanel = () => {
  const [isMigrating, setIsMigrating] = useState(false)
  const [activeTab, setActiveTab] = useState<ETabMenu>(ETabMenu.TAB_SYNC)

  useEffect(() => {
    setIsMigrating(true)
    migrateScheme().then(() => setIsMigrating(false))
  }, [])

  if (isMigrating) {
    return <div>Migrating...</div>
  }

  return (
    <Layout>
      <div className="flex flex-col h-[100vh] w-full overflow-hidden bg-background">
        <Tabs 
          tabs={TAB_MENU} 
          defaultValue={ETabMenu.TAB_SYNC}
          onValueChange={(val) => setActiveTab(Number(val) as ETabMenu)}
          className="flex-1 min-h-0"
        >
          <Tabs.Content value={ETabMenu.TAB_SYNC}>
            <LiveManagement />
          </Tabs.Content>
          <Tabs.Content value={ETabMenu.AUTOMATION}>
            <AutomationManagement />
          </Tabs.Content>
          <Tabs.Content value={ETabMenu.GROUP}>
            <GroupManagement />
          </Tabs.Content>
        </Tabs>
        
        {/* Fixed Footer Status Bar outside of scrollable area */}
        <div className="shrink-0">
          {activeTab === ETabMenu.TAB_SYNC && <LiveStatusBar />}
          {activeTab === ETabMenu.GROUP && (
            <footer className="border-t border-slate-100 bg-slate-50 p-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Saved Snapshots Management
            </footer>
          )}
          {activeTab === ETabMenu.AUTOMATION && (
            <footer className="border-t border-slate-100 bg-slate-50 p-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Automation Rules Management
            </footer>
          )}
        </div>
      </div>
    </Layout>
  )
}

export default SidePanel
