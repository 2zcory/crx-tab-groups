const REGEX_PREFIX = 're:'
const INTERNAL_URL_PREFIXES = ['chrome://', 'edge://', 'about:']

type RulePatternKind = 'empty' | 'regex' | 'glob' | 'host' | 'url'

type RulePatternValidation = {
  isValid: boolean
  kind: RulePatternKind
  normalizedPattern: string
  error?: string
}

export const normalizeAutoGroupPattern = (pattern: string) => pattern.trim()

type ParsedUrlTargets = {
  href: string
  hrefWithoutProtocol: string
  hostname: string
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const parseUrlTargets = (rawUrl: string): ParsedUrlTargets | null => {
  try {
    const parsed = new URL(rawUrl)
    const href = parsed.href.toLowerCase()

    return {
      href,
      hrefWithoutProtocol: href.replace(/^[a-z]+:\/\//, ''),
      hostname: parsed.hostname.toLowerCase(),
    }
  } catch {
    return null
  }
}

const isHostLikePattern = (pattern: string) => !/[/:?#]/.test(pattern)

const compileGlobRegex = (pattern: string) => {
  const segments = pattern.split('*').map(escapeRegex)
  return new RegExp(`^${segments.join('.*')}$`, 'i')
}

export const describeRulePattern = (pattern: string): RulePatternKind => {
  const normalized = pattern.trim()

  if (!normalized) return 'empty'
  if (normalized.toLowerCase().startsWith(REGEX_PREFIX)) return 'regex'
  if (normalized.includes('*')) return 'glob'
  if (isHostLikePattern(normalized)) return 'host'
  return 'url'
}

export const validateAutoGroupRulePattern = (pattern: string): RulePatternValidation => {
  const normalizedPattern = normalizeAutoGroupPattern(pattern)
  const kind = describeRulePattern(normalizedPattern)

  if (!normalizedPattern) {
    return {
      isValid: false,
      kind,
      normalizedPattern,
      error: 'Pattern is required.',
    }
  }

  if (kind === 'regex') {
    const regexBody = normalizedPattern.slice(REGEX_PREFIX.length).trim()

    if (!regexBody) {
      return {
        isValid: false,
        kind,
        normalizedPattern,
        error: 'Regex rule must include a pattern after re:.',
      }
    }

    try {
      new RegExp(regexBody, 'i')
    } catch {
      return {
        isValid: false,
        kind,
        normalizedPattern,
        error: 'Regex pattern is invalid.',
      }
    }
  }

  return {
    isValid: true,
    kind,
    normalizedPattern,
  }
}

export const shouldIgnoreAutoGroupUrl = (url?: string) => {
  if (!url) return true

  const normalizedUrl = url.toLowerCase()
  return INTERNAL_URL_PREFIXES.some((prefix) => normalizedUrl.startsWith(prefix))
}

export const getAutoGroupRulePatterns = (rule: Pick<NStorage.Sync.Schema.AutoGroupRule, 'urlPatterns' | 'urlPattern'>) => {
  const candidates = Array.isArray(rule.urlPatterns) && rule.urlPatterns.length > 0
    ? rule.urlPatterns
    : rule.urlPattern
      ? [rule.urlPattern]
      : []

  return Array.from(
    new Set(
      candidates
        .map((pattern) => normalizeAutoGroupPattern(pattern))
        .filter(Boolean)
    )
  )
}

export const normalizeAutoGroupRuleOrder = <
  TRule extends Pick<NStorage.Sync.Schema.AutoGroupRule, 'createdAt' | 'title' | 'id'> &
    Partial<Pick<NStorage.Sync.Schema.AutoGroupRule, 'order'>>
>(rules: TRule[]) => {
  return [...rules]
    .sort((left, right) => {
      const leftOrder = typeof left.order === 'number' && Number.isFinite(left.order) ? left.order : Number.MAX_SAFE_INTEGER
      const rightOrder = typeof right.order === 'number' && Number.isFinite(right.order) ? right.order : Number.MAX_SAFE_INTEGER
      const orderDelta = leftOrder - rightOrder

      if (orderDelta !== 0) return orderDelta

      const createdAtDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()

      if (createdAtDelta !== 0) return createdAtDelta

      const titleDelta = left.title.localeCompare(right.title)
      if (titleDelta !== 0) return titleDelta

      return left.id.localeCompare(right.id)
    })
    .map((rule, index) => ({
      ...rule,
      order: index + 1,
    }))
}

export const sortAutoGroupRules = <
  TRule extends Pick<NStorage.Sync.Schema.AutoGroupRule, 'createdAt' | 'title' | 'id'> &
    Partial<Pick<NStorage.Sync.Schema.AutoGroupRule, 'order'>>
>(rules: TRule[]) => {
  return [...normalizeAutoGroupRuleOrder(rules)].sort((left, right) => {
    const orderDelta = left.order - right.order

    if (orderDelta !== 0) return orderDelta

    const createdAtDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()

    if (createdAtDelta !== 0) return createdAtDelta

    const titleDelta = left.title.localeCompare(right.title)
    if (titleDelta !== 0) return titleDelta

    return left.id.localeCompare(right.id)
  })
}

export const matchesAutoGroupRule = (url: string, pattern: string) => {
  const validation = validateAutoGroupRulePattern(pattern)
  const normalizedPattern = validation.normalizedPattern.toLowerCase()

  if (!validation.isValid) return false

  const targets = parseUrlTargets(url)
  if (!targets) return false

  if (normalizedPattern.startsWith(REGEX_PREFIX)) {
    const regexBody = pattern.trim().slice(REGEX_PREFIX.length).trim()
    if (!regexBody) return false

    try {
      return new RegExp(regexBody, 'i').test(targets.href)
    } catch {
      return false
    }
  }

  if (normalizedPattern.includes('*')) {
    const globRegex = compileGlobRegex(normalizedPattern)

    if (isHostLikePattern(normalizedPattern)) {
      return globRegex.test(targets.hostname)
    }

    return globRegex.test(targets.hrefWithoutProtocol) || globRegex.test(targets.href)
  }

  if (isHostLikePattern(normalizedPattern)) {
    return targets.hostname === normalizedPattern || targets.hostname.endsWith(`.${normalizedPattern}`)
  }

  return targets.hrefWithoutProtocol.includes(normalizedPattern) || targets.href.includes(normalizedPattern)
}
