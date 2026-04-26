class StorageSyncTab {
  static name: keyof NStorage.Sync.Schema.Database = 'tabs'

  static async getList() {
    const data = await chrome.storage.sync.get(StorageSyncTab.name)
    return (data.tabs || []) as NStorage.Sync.Schema.Tab[]
  }

  private static async mutate(subtype: string, payload: object) {
    return new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: 'STORAGE_SYNC_MUTATE_COMPLEX',
          key: StorageSyncTab.name,
          subtype,
          payload,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
          } else if (response?.success) {
            resolve()
          } else {
            reject(new Error(response?.error || 'Unknown tab mutation error'))
          }
        },
      )
    })
  }

  static async create(...tabs: NStorage.Sync.Schema.Tab[]) {
    return StorageSyncTab.mutate('create', { items: tabs })
  }

  static async update(...tabs: NStorage.Sync.Schema.Tab[]) {
    return StorageSyncTab.mutate('update', { items: tabs })
  }

  static async deleteTabsByGroupId(groupId: string) {
    return StorageSyncTab.mutate('delete', { groupId })
  }
}

export default StorageSyncTab
