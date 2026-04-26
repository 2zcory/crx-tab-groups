class StorageSync {
  /**
   * Run a storage operation exclusively.
   * Note: Mutations are delegated to the Background Service Worker.
   */
  static async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    // In Sidepanel, we just execute the operation.
    // Serialization is handled by the Background Service Worker queue.
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
      console.log('[StorageSync] Sending mutation:', params)
      
      // Safety check: ensure background is alive by checking runtime
      if (!chrome.runtime?.id) {
        reject(new Error('Extension runtime unavailable'))
        return
      }

      chrome.runtime.sendMessage(
        { action: 'STORAGE_SYNC_MUTATE', params },
        (response) => {
          const lastError = chrome.runtime.lastError
          if (lastError) {
            console.error('[StorageSync] Runtime error:', lastError.message)
            reject(new Error(lastError.message))
            return
          }

          if (response?.success) {
            resolve()
          } else {
            const errorMsg = response?.error || 'Unknown storage mutation error'
            console.error('[StorageSync] Mutation failed:', errorMsg)
            reject(new Error(errorMsg))
          }
        },
      )
    })
  }
}

export default StorageSync
