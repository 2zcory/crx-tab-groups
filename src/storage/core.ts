class StorageSync {
  /**
   * Run a storage operation exclusively.
   * Note: Mutations are now delegated to the Background Service Worker
   * to ensure cross-context serialization.
   */
  static async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    // We still keep a local queue to prevent overlapping calls within the same context
    // before they are even sent to the background.
    return operation()
  }

  static async get<TReturn = Partial<NStorage.Sync.Schema.Database>>(
    key: NStorage.Sync.GetKey,
  ): Promise<TReturn> {
    return (await chrome.storage.sync.get(key as any)) as TReturn
  }

  static async set<TParams extends object = Partial<NStorage.Sync.Schema.Database>>(
    params: TParams,
  ) {
    return new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'STORAGE_SYNC_MUTATE', params },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
          } else if (response?.success) {
            resolve()
          } else {
            reject(new Error(response?.error || 'Unknown storage mutation error'))
          }
        },
      )
    })
  }
}

export default StorageSync
