import ESchemeVersion from "../scheme-version.enum"
import { IInputData } from "../types"

const migrateSyncTo_1_0_0 = (data: IInputData) => {
  return {
    ...data,
    groups: [],
    tabs: [],
    version: ESchemeVersion.SYNC_1_0_0
  }
}

export default migrateSyncTo_1_0_0
