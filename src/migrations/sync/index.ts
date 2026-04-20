import ESchemeVersion from "../scheme-version.enum";
import { IMigration } from "../types";
import migrateSyncTo_1_0_0 from "./1_0_0";
import migrateSyncTo_1_1_0 from "./1_1_0";
import migrateSyncTo_1_2_0 from "./1_2_0";
import migrateSyncTo_1_3_0 from "./1_3_0";
import migrateSyncTo_1_4_0 from "./1_4_0";
import migrateSyncTo_1_5_0 from "./1_5_0";

const migrationSyncs: IMigration = {
  [ESchemeVersion.SYNC_0_0_0]: migrateSyncTo_1_0_0,
  [ESchemeVersion.SYNC_1_0_0]: migrateSyncTo_1_1_0,
  [ESchemeVersion.SYNC_1_1_0]: migrateSyncTo_1_2_0,
  [ESchemeVersion.SYNC_1_2_0]: migrateSyncTo_1_3_0,
  [ESchemeVersion.SYNC_1_3_0]: migrateSyncTo_1_4_0,
  [ESchemeVersion.SYNC_1_4_0]: migrateSyncTo_1_5_0,
}

export default migrationSyncs
