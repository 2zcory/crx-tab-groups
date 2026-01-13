# Migrations Module

This module handles data schema migrations for the application's storage. It ensures that data persisted in the user's storage is updated to match the current schema version expected by the application.

## Structure

- **`core.ts`**: Contains the core logic for running migrations sequentially (`migrateStorage`).
- **`index.ts`**: The entry point that triggers the migration process (`migrateScheme`).
- **`scheme-version.enum.ts`**: Defines the `ESchemeVersion` enum, listing all available schema versions.
- **`types.ts`**: TypeScript definitions for migration functions and data structures.
- **`sync/`**: Contains migration scripts for "sync" storage.
  - **`index.ts`**: Maps source versions to their corresponding migration functions.
  - **`*.ts`**: Individual migration scripts (e.g., `1_0_0.ts`).

## How it Works

The migration process is driven by the `migrateStorage` function in `core.ts`.

1. **Initialization**: `migrateScheme()` in `index.ts` is called (usually at startup).
2. **Retrieval**: `migrateStorage` retrieves the current data from the storage provider (e.g., `StorageSync`).
3. **Version Check**: It reads the `version` field from the data (defaults to `0.0.0` if not present).
4. **Migration Loop**:
   - Checks if a migration function exists for the current version in the registered migrations map.
   - If found:
     - Executes the migration function, passing the current data.
     - Receives the transformed data (which includes the new version).
     - Updates the storage with the new data.
     - Repeats the check with the new version.
   - If not found: The process stops, assuming the data is up-to-date.

## Adding a New Migration

To add a new migration (e.g., from `1.0.0` to `1.0.1`):

### 1. Define the new version
Add the new version string to the `ESchemeVersion` enum in `src/migrations/scheme-version.enum.ts`.

```typescript
export enum ESchemeVersion {
  // ...
  SYNC_1_0_0 = "1.0.0",
  SYNC_1_0_1 = "1.0.1", // Add this
}
```

### 2. Create the migration script
Create a new file in `src/migrations/sync/`, named after the version it migrates *to* (e.g., `1_0_1.ts` or just `1_0_1.ts`). 
*Convention suggests naming it based on the version, e.g., `1_0_1.ts`.*

The function should:
- Accept `IInputData`.
- Return a new object with the necessary data changes.
- **Crucially**, set the `version` to the new target version (`ESchemeVersion.SYNC_1_0_1`).

```typescript
// src/migrations/sync/1_0_1.ts
import { IInputData } from "../types"
import ESchemeVersion from "../scheme-version.enum"

const migrateSyncTo_1_0_1 = (data: IInputData) => {
  // 1. Copy existing data
  const newData = { ...data }

  // 2. Perform transformations
  // e.g., newData.newField = "defaultValue"
  
  // 3. Update version
  newData.version = ESchemeVersion.SYNC_1_0_1
  
  return newData
}

export default migrateSyncTo_1_0_1
```

### 3. Register the migration
Import the new script in `src/migrations/sync/index.ts` and add it to the `migrationSyncs` object.
The **key** in the map is the **source version** (the version you are migrating *from*).

```typescript
// src/migrations/sync/index.ts
import migrateSyncTo_1_0_1 from "./1_0_1"; 
// ...

const migrationSyncs: IMigration = {
  // ...
  [ESchemeVersion.SYNC_1_0_0]: migrateSyncTo_1_0_1, // Runs when data version is 1.0.0
}
```
