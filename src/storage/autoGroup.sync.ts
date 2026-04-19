import StorageSync from "./core"

class StorageSyncAutoGroup {
  static name: keyof NStorage.Sync.Schema.Database = "autoGroups"

  static async getList() {
    // TODO: Handle error - unprotected aync code
    const data = await StorageSync.get<Pick<NStorage.Sync.Schema.Database, "autoGroups">>(StorageSyncAutoGroup.name);

    return data.autoGroups || []
  }

  static async create(...rules: NStorage.Sync.Schema.AutoGroupRule[]) {
    const currentRules = await StorageSyncAutoGroup.getList();
    const params: Pick<NStorage.Sync.Schema.Database, "autoGroups"> = { 
      autoGroups: [...currentRules, ...rules] 
    };

    // TODO: Handle error - unprotected aync code
    await StorageSync.set(params)
  }

  static async update(...rules: NStorage.Sync.Schema.AutoGroupRule[]) {
    let currentRules = await StorageSyncAutoGroup.getList();

    for (const newRule of rules) {
      currentRules = currentRules.map(rule => {
        if (rule.id === newRule.id) {
          return {
            ...rule,
            ...newRule
          }
        }
        return rule
      })
    }

    // TODO: Handle error - unprotected aync code
    await StorageSync.set({ autoGroups: currentRules })
  }

  static async deleteById(id: string) {
    const currentRules = await StorageSyncAutoGroup.getList();
    const filteredRules = currentRules.filter(rule => rule.id !== id);

    // TODO: Handle error - unprotected aync code
    await StorageSync.set({ autoGroups: filteredRules })
  }
}

export default StorageSyncAutoGroup
