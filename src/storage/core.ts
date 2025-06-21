class StorageSync {
  static async get<TReturn = Partial<NStorage.Sync.Schema.Database>>(key: NStorage.Sync.GetKey): Promise<TReturn> {
    // TODO: Handle error - unprotected aync code
    const data = await chrome.storage.sync.get(key) as Promise<TReturn>;

    return data
  }

  static async set<TParams extends object = Partial<NStorage.Sync.Schema.Database>>(params: TParams) {
    // TODO: Handle error - unprotected aync code
    await chrome.storage.sync.set(params);
  }
}

export default StorageSync;
