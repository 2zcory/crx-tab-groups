import ESchemeVersion from '../scheme-version.enum'
import { IInputData } from '../types'

/**
 * Migration 1.3.0: Initialize autoGroups array.
 * This ensures that the storage has the autoGroups property to support long-term grouping rules.
 */
const migrateSyncTo_1_3_0 = (data: IInputData) => {
  return {
    ...data,
    autoGroups: data.autoGroups || [],
    version: ESchemeVersion.SYNC_1_3_0,
  }
}

export default migrateSyncTo_1_3_0
