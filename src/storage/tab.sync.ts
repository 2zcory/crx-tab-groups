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
    await StorageSync.mutateTabs(tabs)
  }

  static async update(...tabs: NStorage.Sync.Schema.Tab[]) {
    await StorageSync.mutateTabs(tabs)
  }

  static async deleteTabsByGroupId(groupId: string) {
    const currentTabs = await StorageSyncTab.getList()
    await StorageSync.set({
      tabs: currentTabs.filter((tab) => tab.groupId !== groupId)
    })
  }
}

export default StorageSyncTab
