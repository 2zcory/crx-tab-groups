class StorageSync {
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

  // CENTRALIZED ATOMIC MUTATIONS HELPERS
  static async saveSnapshot(group: NStorage.Sync.Schema.Group, tabs: NStorage.Sync.Schema.Tab[]) {
    return StorageSync.mutate({ type: 'SAVE_SNAPSHOT', group, tabs })
  }

  static async updateSnapshot(group: NStorage.Sync.Schema.Group, tabs: NStorage.Sync.Schema.Tab[]) {
    return StorageSync.mutate({ type: 'UPDATE_SNAPSHOT', group, tabs })
  }

  static async deleteSnapshot(groupId: string) {
    return StorageSync.mutate({ type: 'DELETE_SNAPSHOT', groupId })
  }

  static async mutateGroups(groups: NStorage.Sync.Schema.Group[]) {
    return StorageSync.mutate({ type: 'MUTATE_GROUPS', groups })
  }

  static async mutateTabs(tabs: NStorage.Sync.Schema.Tab[]) {
    return StorageSync.mutate({ type: 'MUTATE_TABS', tabs })
  }

  static async mutateAutoGroups(autoGroups: NStorage.Sync.Schema.AutoGroupRule[]) {
    return StorageSync.mutate({ type: 'MUTATE_AUTOGROUPS', autoGroups })
  }

  static async replaceAutoGroups(autoGroups: NStorage.Sync.Schema.AutoGroupRule[]) {
    return StorageSync.mutate({ type: 'REPLACE_AUTOGROUPS', autoGroups })
  }

  static async set<TParams extends object = Partial<NStorage.Sync.Schema.Database>>(
    params: TParams,
  ) {
    return StorageSync.mutate({ type: 'SET', params })
  }

  private static async mutate(mutation: any) {
    const MAX_RETRIES = 5
    let lastError: any = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await new Promise<{ success: boolean; error?: string }>(
          (resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'STORAGE_MUTATE', mutation }, (res) => {
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
    if (mutation.type === 'SET') {
      await storageArea.set(mutation.params as any)
    } else {
      // Fallback for other mutation types when connection fails completely
      const db = (await storageArea.get(null)) as any
      let groups = db.groups || []
      let tabs = db.tabs || []
      let autoGroups = db.autoGroups || []

      switch (mutation.type) {
        case 'SAVE_SNAPSHOT':
          groups = [...groups, mutation.group]
          tabs = [...tabs, ...mutation.tabs]
          await storageArea.set({ groups, tabs })
          break
        case 'UPDATE_SNAPSHOT':
          groups = groups.map((g: any) => (g.id === mutation.group.id ? { ...g, ...mutation.group } : g))
          tabs = [...tabs.filter((t: any) => t.groupId !== mutation.group.id), ...mutation.tabs]
          await storageArea.set({ groups, tabs })
          break
        case 'DELETE_SNAPSHOT':
          await storageArea.set({
            groups: groups.filter((g: any) => g.id !== mutation.groupId),
            tabs: tabs.filter((t: any) => t.groupId !== mutation.groupId),
          })
          break
        case 'MUTATE_GROUPS': {
          const updatedGroups = [...groups]
          for (const newG of mutation.groups) {
            const index = updatedGroups.findIndex((g: any) => g.id === newG.id)
            if (index !== -1) updatedGroups[index] = { ...updatedGroups[index], ...newG }
            else updatedGroups.push(newG)
          }
          await storageArea.set({ groups: updatedGroups })
          break
        }
        case 'MUTATE_TABS': {
          const updatedTabs = [...tabs]
          for (const newT of mutation.tabs) {
            const index = updatedTabs.findIndex((t: any) => t.id === newT.id)
            if (index !== -1) updatedTabs[index] = { ...updatedTabs[index], ...newT }
            else updatedTabs.push(newT)
          }
          await storageArea.set({ tabs: updatedTabs })
          break
        }
        case 'MUTATE_AUTOGROUPS': {
          const updatedRules = [...autoGroups]
          for (const newR of mutation.autoGroups) {
            const index = updatedRules.findIndex((r: any) => r.id === newR.id)
            if (index !== -1) updatedRules[index] = { ...updatedRules[index], ...newR }
            else updatedRules.push(newR)
          }
          await storageArea.set({ autoGroups: updatedRules })
          break
        }
        case 'REPLACE_AUTOGROUPS':
          await storageArea.set({ autoGroups: mutation.autoGroups })
          break
      }
    }

    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message)
    }
  }
}

export default StorageSync
