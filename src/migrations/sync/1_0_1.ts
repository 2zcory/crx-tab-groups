import { dummyFavIcons } from "@/dummy/favIcons"
import ESchemeVersion from "../scheme-version.enum"
import { IInputData } from "../types"

/**
 *
 */
const migrateSyncTo_1_0_1 = (data: IInputData) => {
  return {
    ...data,
    favIcons: dummyFavIcons,
    version: ESchemeVersion.SYNC_1_0_1
  }
}

export default migrateSyncTo_1_0_1
