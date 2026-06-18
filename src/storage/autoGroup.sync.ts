import StorageSync from './core'

class StorageSyncAutoGroup {
  static name: keyof NStorage.Sync.Schema.Database = 'autoGroups'

  static async getList() {
    const data = await StorageSync.get<Pick<NStorage.Sync.Schema.Database, 'autoGroups'>>(
      StorageSyncAutoGroup.name,
    )
    return data.autoGroups || []
  }

  static async create(...rules: NStorage.Sync.Schema.AutoGroupRule[]) {
    await StorageSync.mutateAutoGroups(rules)
  }

  static async update(...rules: NStorage.Sync.Schema.AutoGroupRule[]) {
    await StorageSync.mutateAutoGroups(rules)
  }

  static async deleteById(id: string) {
    const currentRules = await StorageSyncAutoGroup.getList()
    await StorageSync.set({
      autoGroups: currentRules.filter((rule) => rule.id !== id)
    })
  }

  static async replaceAll(rules: NStorage.Sync.Schema.AutoGroupRule[]) {
    await StorageSync.replaceAutoGroups(rules)
  }
}

export default StorageSyncAutoGroup
