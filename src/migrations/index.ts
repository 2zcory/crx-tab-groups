import migrateStorage from "./core"
import migrationSyncs from "./sync"

const migrateScheme = async () => {
  await migrateStorage("sync", migrationSyncs)
}

export default migrateScheme
