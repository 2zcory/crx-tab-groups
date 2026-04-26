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
    const currentRules = await StorageSyncAutoGroup.getList()
    const params: Pick<NStorage.Sync.Schema.Database, 'autoGroups'> = {
      autoGroups: [...currentRules, ...rules],
    }
    await StorageSync.set(params)
  }

  static async update(...rules: NStorage.Sync.Schema.AutoGroupRule[]) {
    const currentRules = await StorageSyncAutoGroup.getList()
    const updatedRules = currentRules.map((rule) => {
      const matchingNewRule = rules.find((newR) => newR.id === rule.id)
      return matchingNewRule ? { ...rule, ...matchingNewRule } : rule
    })

    const params: Pick<NStorage.Sync.Schema.Database, 'autoGroups'> = {
      autoGroups: updatedRules,
    }
    await StorageSync.set(params)
  }

  static async deleteById(id: string) {
    const currentRules = await StorageSyncAutoGroup.getList()
    const params: Pick<NStorage.Sync.Schema.Database, 'autoGroups'> = {
      autoGroups: currentRules.filter((rule) => rule.id !== id),
    }
    await StorageSync.set(params)
  }

  static async replaceAll(rules: NStorage.Sync.Schema.AutoGroupRule[]) {
    const params: Pick<NStorage.Sync.Schema.Database, 'autoGroups'> = {
      autoGroups: rules,
    }
    await StorageSync.set(params)
  }
}

export default StorageSyncAutoGroup
