import ESchemeVersion from "../scheme-version.enum"
import { IInputData } from "../types"

/**
 * Migration 1.2.0: Tag repaired tabs with isRepaired flag.
 * This allows the UI to identify and notify the user about unrestorable tabs.
 */
const migrateSyncTo_1_2_0 = (data: IInputData) => {
  const repairedTabs = (data.tabs || []).map((tab: any) => {
    // If it's already "about:blank" (from 1.1.0) or still missing URL
    if (!tab.url || tab.url === "about:blank" || tab.url.trim() === "") {
      return {
        ...tab,
        url: tab.url || "about:blank",
        isRepaired: true,
        updatedAt: new Date().toISOString()
      }
    }
    return tab
  })

  return {
    ...data,
    tabs: repairedTabs,
    version: ESchemeVersion.SYNC_1_2_0
  }
}

export default migrateSyncTo_1_2_0
