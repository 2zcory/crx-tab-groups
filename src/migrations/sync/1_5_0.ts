import ESchemeVersion from "../scheme-version.enum"
import { IInputData } from "../types"

const getOrderSeed = (rule: any, fallbackOrder: number) => {
  if (typeof rule.order === "number" && Number.isFinite(rule.order)) {
    return rule.order
  }

  return fallbackOrder
}

/**
 * Migration 1.5.0: add explicit rule order for deterministic priority and UI reordering.
 */
const migrateSyncTo_1_5_0 = (data: IInputData) => {
  const autoGroups = (data.autoGroups || [])
    .map((rule: any, index: number) => ({
      ...rule,
      __orderSeed: getOrderSeed(rule, index + 1),
    }))
    .sort((left: any, right: any) => {
      const orderDelta = left.__orderSeed - right.__orderSeed

      if (orderDelta !== 0) return orderDelta

      const createdAtDelta =
        new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime()

      if (createdAtDelta !== 0) return createdAtDelta

      return String(left.id || "").localeCompare(String(right.id || ""))
    })
    .map((rule: any, index: number) => {
      const { __orderSeed, ...rest } = rule

      return {
        ...rest,
        order: index + 1,
      }
    })

  return {
    ...data,
    autoGroups,
    version: ESchemeVersion.SYNC_1_5_0,
  }
}

export default migrateSyncTo_1_5_0
