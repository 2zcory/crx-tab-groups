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
    return StorageSync.runExclusive(async () => {
      const currentGroups = await StorageSyncGroup.getList()
      const params: Pick<NStorage.Sync.Schema.Database, 'groups'> = {
        groups: [...currentGroups, ...groups],
      }
      await StorageSync.set(params)
    })
  }

  static async update(...groups: NStorage.Sync.Schema.Group[]) {
    return StorageSync.runExclusive(async () => {
      const currentGroups = await StorageSyncGroup.getList()
      const updatedGroups = currentGroups.map((group) => {
        const matchingNewGroup = groups.find((newG) => newG.id === group.id)
        return matchingNewGroup ? { ...group, ...matchingNewGroup } : group
      })
      
      const params: Pick<NStorage.Sync.Schema.Database, 'groups'> = {
        groups: updatedGroups,
      }
      await StorageSync.set(params)
    })
  }

  static async deleteGroupById(id: string) {
    return StorageSync.runExclusive(async () => {
      const currentGroups = await StorageSyncGroup.getList()
      const params: Pick<NStorage.Sync.Schema.Database, 'groups'> = {
        groups: currentGroups.filter((group) => group.id !== id),
      }
      await StorageSync.set(params)
    })
  }
}

export default StorageSyncGroup
