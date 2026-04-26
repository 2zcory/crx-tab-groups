import StorageSyncTab from './tab.sync'

class StorageSyncGroup {
  static name: keyof NStorage.Sync.Schema.Database = 'groups'

  static async getList() {
    const data = await chrome.storage.sync.get(StorageSyncGroup.name)
    return (data.groups || []) as NStorage.Sync.Schema.Group[]
  }

  static async getListWithTabs<TResponse = NStorage.Sync.Response.Group[]>() {
    const data = await chrome.storage.sync.get([StorageSyncGroup.name, StorageSyncTab.name])

    const groups = (data.groups || []) as NStorage.Sync.Schema.Group[]
    const tabsData = (data.tabs || []) as NStorage.Sync.Schema.Tab[]
    const tabs = Object.groupBy(tabsData, ({ groupId }) => groupId)

    const res: TResponse = groups.map((group) => ({
      ...group,
      tabs: tabs[group.id] || [],
    })) as TResponse

    return res
  }

  private static async mutate(subtype: string, payload: object) {
    return new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: 'STORAGE_SYNC_MUTATE_COMPLEX',
          key: StorageSyncGroup.name,
          subtype,
          payload,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
          } else if (response?.success) {
            resolve()
          } else {
            reject(new Error(response?.error || 'Unknown group mutation error'))
          }
        },
      )
    })
  }

  static async create(...groups: NStorage.Sync.Schema.Group[]) {
    return StorageSyncGroup.mutate('create', { items: groups })
  }

  static async update(...groups: NStorage.Sync.Schema.Group[]) {
    return StorageSyncGroup.mutate('update', { items: groups })
  }

  static async deleteGroupById(id: string) {
    return StorageSyncGroup.mutate('delete', { id })
  }
}

export default StorageSyncGroup
