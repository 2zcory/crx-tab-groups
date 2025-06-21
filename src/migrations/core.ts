import StorageSync from "@/storage/core";
import { IMigration, MigrateType } from "./types";
import ESchemeVersion from "./scheme-version.enum";

const migrateStorage = async (type: MigrateType, migrations: IMigration) => {
  const data = await StorageSync.get(null)
  let version = (data.version || ESchemeVersion.SYNC_0_0_0) as ESchemeVersion

  while (migrations[version]) {
    const migrateFn = migrations[version]

    if (!migrateFn) break

    const newData = migrateFn(data)

    if (type === "sync") {
      await StorageSync.set(newData)
    }

    if (type === "local") {
      // TODO
    }

    version = newData.version
  }
}

export default migrateStorage
