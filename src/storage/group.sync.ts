import StorageSync from "./core"
import StorageSyncTab from "./tab.sync";

class StorageSyncGroup {
  static name: keyof NStorage.Sync.Schema.Database = "groups"

  static async getList() {
    // TODO: Handle error - unprotected aync code
    const data = await StorageSync.get<Pick<NStorage.Sync.Schema.Database, "groups">>(StorageSyncGroup.name);

    return data.groups
  }

  static async getListWithTabs<TResponse = NStorage.Sync.Response.Group[]>() {
    // TODO: Handle error - unprotected aync code
    const data = await StorageSync.get<Pick<NStorage.Sync.Schema.Database, "groups" | "tabs">>([StorageSyncGroup.name, StorageSyncTab.name]);

    const tabs = Object.groupBy(data.tabs, ({ groupId }) => groupId)

    const res: TResponse = data.groups.map(group => ({
      ...group,
      tabs: tabs[group.id] || []
    })) as TResponse;

    return res
  }

  static async create(...groups: NStorage.Sync.Schema.Group[]) {
    const params: Pick<NStorage.Sync.Schema.Database, "groups"> = { groups: [] };

    // TODO: Handle error - unprotected aync code
    params.groups = await StorageSyncGroup.getList();

    for (let group of groups) {
      params.groups.push(group)
    }

    // TODO: Handle error - unprotected aync code
    await StorageSync.set(params)
  }

  static async update(...groups: NStorage.Sync.Schema.Group[]) {
    const params: Pick<NStorage.Sync.Schema.Database, "groups"> = { groups: [] };

    // TODO: Handle error - unprotected aync code
    params.groups = await StorageSyncGroup.getList();

    for (let newGroup of groups) {
      params.groups = params.groups.map(group => {
        if (group.id === newGroup.id) {
          return {
            ...group,
            ...newGroup
          }
        }

        return group
      })
    }

    // TODO: Handle error - unprotected aync code
    await StorageSync.set(params)
  }

  static async deleteGroupById(id: string) {
    const params: Pick<NStorage.Sync.Schema.Database, "groups"> = { groups: [] };

    // TODO: Handle error - unprotected aync code
    params.groups = await StorageSyncGroup.getList()

    params.groups = params.groups.filter(group => group.id !== id)

    // TODO: Handle error - unprotected aync code
    await StorageSync.set(params)
  }
}

export default StorageSyncGroup
