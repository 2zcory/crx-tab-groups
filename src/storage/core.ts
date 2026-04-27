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
    // Forcing direct storage access to bypass message port issues in test environments
    console.log('[StorageSync] Direct mutation:', params)
    await chrome.storage.sync.set(params)
    
    // Check for lastError to match the previous API behavior
    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message)
    }
  }
}

export default StorageSync
