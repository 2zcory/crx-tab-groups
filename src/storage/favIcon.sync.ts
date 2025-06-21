import StorageSync from "./core"

class StorageSyncFavIcon {
  static name: keyof NStorage.Sync.Schema.Database = "favIcons"

  static async get() {
    const data = await StorageSync.get<Pick<NStorage.Sync.Schema.Database, "favIcons">>(StorageSyncFavIcon.name)

    return data.favIcons
  }

  static async update(favIcons: NStorage.Sync.Schema.FavIcons = {}) {
    await StorageSync.set({ favIcons })
  }
}

export default StorageSyncFavIcon
