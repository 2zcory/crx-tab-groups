import StorageLocal from './local'

const OWNERSHIP_KEY = 'autoGroupOwnership'
const AUDIT_KEY = 'autoGroupAudit'
const AUDIT_LIMIT = 40

type OwnershipRegistry = Record<string, NStorage.Local.AutoGroupOwnershipEntry>

class StorageLocalAutoGroup {
  static ownershipKey = OWNERSHIP_KEY
  static auditKey = AUDIT_KEY

  static async getOwnershipRegistry() {
    const data =
      await StorageLocal.get<Record<string, OwnershipRegistry | undefined>>(OWNERSHIP_KEY)

    return data[OWNERSHIP_KEY] || {}
  }

  static async setOwnershipRegistry(registry: OwnershipRegistry) {
    await StorageLocal.set({ [OWNERSHIP_KEY]: registry })
  }

  static async getAuditEntries() {
    const data =
      await StorageLocal.get<Record<string, NStorage.Local.AutoGroupAuditEntry[] | undefined>>(
        AUDIT_KEY,
      )

    return data[AUDIT_KEY] || []
  }

  static async appendAuditEntry(entry: NStorage.Local.AutoGroupAuditEntry) {
    const currentEntries = await StorageLocalAutoGroup.getAuditEntries()
    const nextEntries = [entry, ...currentEntries].slice(0, AUDIT_LIMIT)

    await StorageLocal.set({ [AUDIT_KEY]: nextEntries })
  }

  static async clearAuditEntries() {
    await StorageLocal.set({ [AUDIT_KEY]: [] })
  }
}

export default StorageLocalAutoGroup
