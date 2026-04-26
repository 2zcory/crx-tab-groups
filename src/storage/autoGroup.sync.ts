class StorageSyncAutoGroup {
  static name: keyof NStorage.Sync.Schema.Database = 'autoGroups'

  static async getList() {
    const data = await chrome.storage.sync.get(StorageSyncAutoGroup.name)
    return (data.autoGroups || []) as NStorage.Sync.Schema.AutoGroupRule[]
  }

  private static async mutate(subtype: string, payload: object) {
    return new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: 'STORAGE_SYNC_MUTATE_COMPLEX',
          key: StorageSyncAutoGroup.name,
          subtype,
          payload,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
          } else if (response?.success) {
            resolve()
          } else {
            reject(new Error(response?.error || 'Unknown autogroup mutation error'))
          }
        },
      )
    })
  }

  static async create(...rules: NStorage.Sync.Schema.AutoGroupRule[]) {
    return StorageSyncAutoGroup.mutate('create', { items: rules })
  }

  static async update(...rules: NStorage.Sync.Schema.AutoGroupRule[]) {
    return StorageSyncAutoGroup.mutate('update', { items: rules })
  }

  static async deleteById(id: string) {
    return StorageSyncAutoGroup.mutate('delete', { id })
  }

  static async replaceAll(rules: NStorage.Sync.Schema.AutoGroupRule[]) {
    return StorageSyncAutoGroup.mutate('replace_all', { items: rules })
  }
}

export default StorageSyncAutoGroup
