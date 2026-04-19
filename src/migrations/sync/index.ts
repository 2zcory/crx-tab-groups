import ESchemeVersion from "../scheme-version.enum";
import { IMigration } from "../types";
import migrateSyncTo_1_0_0 from "./1_0_0";
import migrateSyncTo_1_1_0 from "./1_1_0";

const migrationSyncs: IMigration = {
  [ESchemeVersion.SYNC_0_0_0]: migrateSyncTo_1_0_0,
  [ESchemeVersion.SYNC_1_0_0]: migrateSyncTo_1_1_0,
}

export default migrationSyncs
