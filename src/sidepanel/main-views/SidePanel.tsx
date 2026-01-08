import { useEffect, useState } from 'react'

import './SidePanel.css'
import migrateScheme from '@/migrations'
import LiveManagement from './live'
import Layout from './layout'
import Tabs from '@/components/ui/tabs'
import { TAB_MENU } from '@/constants'
import { ETabMenu } from '@/enums'
import GroupManagement from './group-management'

export const SidePanel = () => {
  const [isMigrating, setIsMigrating] = useState(false)

  useEffect(() => {
    setIsMigrating(true)
    migrateScheme().then(() => setIsMigrating(false))
  }, [])

  if (isMigrating) {
    return <div>Migrating...</div>
  }

  return (
    <Layout>
      <Tabs tabs={TAB_MENU} defaultValue={ETabMenu.TAB_SYNC}>
        <Tabs.Content value={ETabMenu.TAB_SYNC}>
          <LiveManagement />
        </Tabs.Content>
        <Tabs.Content value={ETabMenu.NOTE}>
          <>Note</>
        </Tabs.Content>
        <Tabs.Content value={ETabMenu.GROUP}>
          <GroupManagement />
        </Tabs.Content>
      </Tabs>
    </Layout>
  )
}

export default SidePanel
