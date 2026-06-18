import StorageSync from './core'
import StorageSyncTab from './tab.sync'

class StorageSyncGroup {
  static name: keyof NStorage.Sync.Schema.Database = 'groups'

  static async getList() {
    const data = await StorageSync.get<Pick<NStorage.Sync.Schema.Database, 'groups'>>(
      StorageSyncGroup.name,
    )
    return data.groups || []
  }

  static async getListWithTabs<TResponse = NStorage.Sync.Response.Group[]>() {
    const data = await StorageSync.get<Pick<NStorage.Sync.Schema.Database, 'groups' | 'tabs'>>([
      StorageSyncGroup.name,
      StorageSyncTab.name,
    ])

    const groups = data.groups || []
    const tabsData = data.tabs || []
    const tabs = Object.groupBy(tabsData, ({ groupId }) => groupId)

    const res: TResponse = groups.map((group) => ({
      ...group,
      tabs: tabs[group.id] || [],
    })) as TResponse

    return res
  }

  static async create(...groups: NStorage.Sync.Schema.Group[]) {
    await StorageSync.mutateGroups(groups)
  }

  static async update(...groups: NStorage.Sync.Schema.Group[]) {
    await StorageSync.mutateGroups(groups)
  }

  static async deleteGroupById(id: string) {
    const currentGroups = await StorageSyncGroup.getList()
    await StorageSync.set({
      groups: currentGroups.filter((group) => group.id !== id)
    })
  }
}

export default StorageSyncGroup
