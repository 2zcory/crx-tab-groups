import ESchemeVersion from "../scheme-version.enum"
import { IInputData } from "../types"

const normalizePatterns = (rule: any) => {
  const legacyPatterns = Array.isArray(rule.urlPatterns)
    ? rule.urlPatterns
    : typeof rule.urlPattern === "string"
      ? [rule.urlPattern]
      : []

  const normalizedPatterns = legacyPatterns
    .map((pattern: unknown) => (typeof pattern === "string" ? pattern.trim() : ""))
    .filter(Boolean)

  return Array.from(new Set(normalizedPatterns))
}

/**
 * Migration 1.4.0: move auto-group rules from single urlPattern to urlPatterns[].
 */
const migrateSyncTo_1_4_0 = (data: IInputData) => {
  const autoGroups = (data.autoGroups || []).map((rule: any) => ({
    ...rule,
    urlPatterns: normalizePatterns(rule),
  }))

  return {
    ...data,
    autoGroups,
    version: ESchemeVersion.SYNC_1_4_0,
  }
}

export default migrateSyncTo_1_4_0
