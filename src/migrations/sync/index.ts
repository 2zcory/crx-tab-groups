import ESchemeVersion from "../scheme-version.enum";
import { IMigration } from "../types";
import migrateSyncTo_1_0_0 from "./1_0_0";
import migrateSyncTo_1_0_1 from "./1_0_1";

const migrationSyncs: IMigration = {
  [ESchemeVersion.SYNC_0_0_0]: migrateSyncTo_1_0_0,
  [ESchemeVersion.SYNC_1_0_0]: migrateSyncTo_1_0_1,
}

export default migrationSyncs
