class StorageSync {
  /**
   * Run a storage operation exclusively.
   * Note: Mutations are delegated to the Background Service Worker.
   */
  static async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    // Connect to the background lock channel
    const port = chrome.runtime.connect({ name: 'STORAGE_SYNC_LOCK' })

    await new Promise<void>((resolve, reject) => {
      const onMessage = (msg: any) => {
        if (msg.action === 'LOCK_ACQUIRED') {
          port.onMessage.removeListener(onMessage)
          resolve()
        }
      }
      port.onMessage.addListener(onMessage)
      port.onDisconnect.addListener(() => {
        reject(new Error('[StorageSync] Lock port disconnected unexpectedly.'))
      })
    })

    try {
      const result = await operation()
      return result
    } finally {
      port.disconnect()
    }
  }

  static async getStorageArea(): Promise<chrome.storage.StorageArea> {
    try {
      const data = await chrome.storage.local.get('extensionSettings')
      const settings = data.extensionSettings as NStorage.Local.ExtensionSettings | undefined
      if (settings?.storageEngine === 'local') {
        return chrome.storage.local
      }
    } catch (e) {
      console.warn('[StorageSync] Failed to read storageEngine setting, defaulting to sync:', e)
    }
    return chrome.storage.sync
  }

  static async get<TReturn = Partial<NStorage.Sync.Schema.Database>>(
    key: NStorage.Sync.GetKey,
  ): Promise<TReturn> {
    const storageArea = await StorageSync.getStorageArea()
    return (await storageArea.get(key as any)) as TReturn
  }

  static async set<TParams extends object = Partial<NStorage.Sync.Schema.Database>>(
    params: TParams,
  ) {
    const MAX_RETRIES = 5
    let lastError: any = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await new Promise<{ success: boolean; error?: string }>(
          (resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'STORAGE_SYNC_MUTATE', params }, (res) => {
              const err = chrome.runtime.lastError
              if (err) {
                reject(new Error(err.message))
              } else {
                resolve(res)
              }
            })
          },
        )

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
          await new Promise((r) => setTimeout(r, 200 * attempt))
          continue
        }

        // For other errors (like quota), fail immediately
        throw e
      }
    }

    console.error(
      '[StorageSync] Centralized mutation failed after max retries. Falling back to direct mutation.',
      lastError,
    )

    // Fallback to direct mutation if messaging bridge is completely broken
    const storageArea = await StorageSync.getStorageArea()
    await storageArea.set(params as any)
    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message)
    }
  }
}

export default StorageSync
