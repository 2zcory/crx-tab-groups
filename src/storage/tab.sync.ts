import StorageSync from "./core"

class StorageSyncTab {
  static name: keyof NStorage.Sync.Schema.Database = "tabs"

  static async getList() {
    const data = await StorageSync.get<Pick<NStorage.Sync.Schema.Database, "tabs">>(StorageSyncTab.name);

    return data.tabs
  }

  static async create(...tabs: NStorage.Sync.Schema.Tab[]) {
    const params: Pick<NStorage.Sync.Schema.Database, "tabs"> = { tabs: [] }

    params.tabs = await StorageSyncTab.getList();

    for (let tab of tabs) {
      params.tabs.push(tab)
    }

    await StorageSync.set(params)
  }

  static async update(...tabs: NStorage.Sync.Schema.Tab[]) {
    const params: Pick<NStorage.Sync.Schema.Database, "tabs"> = { tabs: [] }

    params.tabs = await StorageSyncTab.getList();

    for (let newTab of tabs) {
      params.tabs = params.tabs.map(tab => {
        if (tab.id === newTab.id) {
          return {
            ...tab,
            ...newTab
          }
        }
        return tab
      })
    }

    await StorageSync.set(params)
  }

  static async deleteTabById(id: string) {
    const params: Pick<NStorage.Sync.Schema.Database, "tabs"> = { tabs: [] };

    // TODO: Handle error - unprotected aync code
    params.tabs = await StorageSyncTab.getList()

    params.tabs = params.tabs.filter(tab => tab.id !== id)

    // TODO: Handle error - unprotected aync code
    await StorageSync.set(params)
  }
}

export default StorageSyncTab
