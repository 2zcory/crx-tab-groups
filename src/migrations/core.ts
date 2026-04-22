import StorageSync from '@/storage/core'
import { IMigration, MigrateType } from './types'
import ESchemeVersion from './scheme-version.enum'

const migrateStorage = async (type: MigrateType, migrations: IMigration) => {
  const data = await StorageSync.get(null)
  let version = (data.version || ESchemeVersion.SYNC_0_0_0) as ESchemeVersion
  let currentData = { ...data }
  let hasChanged = false

  while (migrations[version]) {
    const migrateFn = migrations[version]

    if (!migrateFn) break

    currentData = migrateFn(currentData)
    version = currentData.version as ESchemeVersion
    hasChanged = true
  }

  if (hasChanged) {
    if (type === 'sync') {
      await StorageSync.set(currentData)
    }

    if (type === 'local') {
      // TODO
    }
  }
}

export default migrateStorage
