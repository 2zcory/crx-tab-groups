import StorageSync from './core'

class StorageSyncTab {
  static name: keyof NStorage.Sync.Schema.Database = 'tabs'

  static async getList() {
    const data = await StorageSync.get<Pick<NStorage.Sync.Schema.Database, 'tabs'>>(
      StorageSyncTab.name,
    )
    return data.tabs || []
  }

  static async create(...tabs: NStorage.Sync.Schema.Tab[]) {
    return StorageSync.runExclusive(async () => {
      const currentTabs = await StorageSyncTab.getList()
      const params: Pick<NStorage.Sync.Schema.Database, 'tabs'> = {
        tabs: [...currentTabs, ...tabs],
      }
      await StorageSync.set(params)
    })
  }

  static async update(...tabs: NStorage.Sync.Schema.Tab[]) {
    return StorageSync.runExclusive(async () => {
      const currentTabs = await StorageSyncTab.getList()
      const updatedTabs = currentTabs.map((tab) => {
        const matchingNewTab = tabs.find((newT) => newT.id === tab.id)
        return matchingNewTab ? { ...tab, ...matchingNewTab } : tab
      })

      const params: Pick<NStorage.Sync.Schema.Database, 'tabs'> = {
        tabs: updatedTabs,
      }
      await StorageSync.set(params)
    })
  }

  static async deleteTabsByGroupId(groupId: string) {
    return StorageSync.runExclusive(async () => {
      const currentTabs = await StorageSyncTab.getList()
      const params: Pick<NStorage.Sync.Schema.Database, 'tabs'> = {
        tabs: currentTabs.filter((tab) => tab.groupId !== groupId),
      }
      await StorageSync.set(params)
    })
  }
}

export default StorageSyncTab
