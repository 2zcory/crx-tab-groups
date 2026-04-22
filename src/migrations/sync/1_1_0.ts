import ESchemeVersion from '../scheme-version.enum'
import { IInputData } from '../types'

/**
 * Migration 1.1.0: Repair missing URLs in saved snapshots.
 * This ensures that every tab has at least a placeholder URL to prevent restore logic failures.
 */
const migrateSyncTo_1_1_0 = (data: IInputData) => {
  const repairedTabs = (data.tabs || []).map((tab: any) => {
    if (!tab.url || typeof tab.url !== 'string' || tab.url.trim() === '') {
      return {
        ...tab,
        url: 'about:blank',
        title: tab.title || 'Unrestorable Tab (Missing URL)',
        updatedAt: new Date().toISOString(),
      }
    }
    return tab
  })

  return {
    ...data,
    tabs: repairedTabs,
    version: ESchemeVersion.SYNC_1_1_0,
  }
}

export default migrateSyncTo_1_1_0
