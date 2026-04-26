import StorageSync from './core'

class StorageSyncFavIcon {
  static name: keyof NStorage.Sync.Schema.Database = 'favIcons'

  static async get() {
    const data = await chrome.storage.sync.get(StorageSyncFavIcon.name)
    return (data.favIcons || {}) as NStorage.Sync.Schema.FavIcons
  }

  static async update(favIcons: NStorage.Sync.Schema.FavIcons = {}) {
    await StorageSync.set({ favIcons })
  }
}

export default StorageSyncFavIcon
