/**
 * Migrate groups, tabs, autoGroups, and favIcons between chrome.storage.sync and chrome.storage.local.
 */
export const migrateStorageData = async (
  targetEngine: 'sync' | 'local',
): Promise<{ success: boolean; error?: string }> => {
  const sourceArea = targetEngine === 'sync' ? chrome.storage.local : chrome.storage.sync
  const destArea = targetEngine === 'sync' ? chrome.storage.sync : chrome.storage.local

  try {
    const keys = ['groups', 'tabs', 'autoGroups', 'favIcons']
    const sourceData = await sourceArea.get(keys)
    
    // Check if there is actually data to migrate
    const hasData = Object.values(sourceData).some((val) => Array.isArray(val) ? val.length > 0 : val && Object.keys(val).length > 0)
    if (!hasData) {
      return { success: true }
    }

    // If migrating to sync, check quota size
    if (targetEngine === 'sync') {
      const dataString = JSON.stringify(sourceData)
      // Sync quota limit is 102,400 bytes
      if (dataString.length > 98000) {
        return {
          success: false,
          error: 'Dữ liệu hiện tại vượt quá giới hạn 100KB của Chrome Sync. Hãy giảm bớt Snapshots trước khi chuyển.',
        }
      }
    }

    await destArea.set(sourceData)
    return { success: true }
  } catch (e) {
    console.error('[Storage Migration] Error:', e)
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
