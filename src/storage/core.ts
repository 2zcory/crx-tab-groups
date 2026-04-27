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
    const MAX_RETRIES = 5
    let lastError: any = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
          chrome.runtime.sendMessage(
            { action: 'STORAGE_SYNC_MUTATE', params },
            (res) => {
              const err = chrome.runtime.lastError
              if (err) {
                reject(new Error(err.message))
              } else {
                resolve(res)
              }
            }
          )
        })

        if (response.success) {
          return
        } else {
          throw new Error(response.error || 'Mutation failed without error message')
        }
      } catch (e: any) {
        lastError = e
        console.warn(`[StorageSync] Mutation attempt ${attempt} failed:`, e.message)
        
        // If it's a message port error or connection error, wait before retrying
        if (
          e.message.includes('message port closed') || 
          e.message.includes('Could not establish connection') ||
          e.message.includes('connection attempt failed')
        ) {
          await new Promise(r => setTimeout(r, 200 * attempt))
          continue
        }
        
        // For other errors (like quota), fail immediately
        throw e
      }
    }

    console.error('[StorageSync] Centralized mutation failed after max retries. Falling back to direct mutation.', lastError)
    
    // Fallback to direct mutation if messaging bridge is completely broken
    await chrome.storage.sync.set(params as any)
    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message)
    }
  }
}

export default StorageSync
