class StorageLocal {
  static async get<TReturn = Record<string, unknown>>(
    key: string | string[] | null,
  ): Promise<TReturn> {
    const data = (await chrome.storage.local.get(key as any)) as TReturn

    return data
  }

  static async set<TParams extends object = Record<string, unknown>>(params: TParams) {
    await chrome.storage.local.set(params)
  }
}

export default StorageLocal
