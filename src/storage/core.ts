class StorageSync {
  private static queue: Promise<any> = Promise.resolve()

  /**
   * Run a storage operation exclusively by queuing it after existing operations.
   * This prevents race conditions during read-modify-write cycles.
   */
  static async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      try {
        return await operation()
      } catch (error) {
        console.error('Storage operation failed:', error)
        throw error
      }
    })

    // Update the queue to wait for this operation, but don't let a failure block future ops
    this.queue = result.catch(() => {})

    return result
  }

  static async get<TReturn = Partial<NStorage.Sync.Schema.Database>>(
    key: NStorage.Sync.GetKey,
  ): Promise<TReturn> {
    return (await chrome.storage.sync.get(key as any)) as TReturn
  }

  static async set<TParams extends object = Partial<NStorage.Sync.Schema.Database>>(
    params: TParams,
  ) {
    await chrome.storage.sync.set(params)
  }
}

export default StorageSync
