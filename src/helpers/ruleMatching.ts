const REGEX_PREFIX = 're:'

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

export const describeRulePattern = (pattern: string) => {
  const normalized = pattern.trim()

  if (!normalized) return 'empty'
  if (normalized.toLowerCase().startsWith(REGEX_PREFIX)) return 'regex'
  if (normalized.includes('*')) return 'glob'
  if (isHostLikePattern(normalized)) return 'host'
  return 'url'
}

export const matchesAutoGroupRule = (url: string, pattern: string) => {
  const normalizedPattern = pattern.trim().toLowerCase()

  if (!normalizedPattern) return false

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
