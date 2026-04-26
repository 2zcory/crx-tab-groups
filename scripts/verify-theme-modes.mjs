import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const DEBUG_PORT = 9223
const DEBUG_HOST = '127.0.0.1'
const DEFAULT_BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]
const REPO_ROOT = process.cwd()
const BUILD_DIR = path.join(REPO_ROOT, 'build')
const PROFILE_DIR = path.join(REPO_ROOT, '.tmp-runtime-profile', 'theme-modes')
const SECURE_PREFERENCES_PATH = path.join(PROFILE_DIR, 'Default', 'Secure Preferences')
const STARTUP_TIMEOUT_MS = 20000
const TARGET_TIMEOUT_MS = 20000
const POLL_INTERVAL_MS = 250
const EXTENSION_URL_PREFIX = 'chrome-extension://'
const DEFAULT_GLASS_STYLE = 'frosted-light'
const EXPECTED_GLASS_STYLES = [
  'frosted-light',
  'aurora-dark',
  'minimal-clear',
  'warm-glass',
  'monochrome-glass',
]

const chromePath =
  process.env.CHROME_PATH || DEFAULT_BROWSER_CANDIDATES.find((candidate) => existsSync(candidate))

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.id = 0
    this.pending = new Map()
    this.ws = null
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl)

    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })

    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!('id' in message)) return

      const pending = this.pending.get(message.id)
      if (!pending) return

      this.pending.delete(message.id)

      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)))
        return
      }

      pending.resolve(message.result || {})
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })

    if (response.exceptionDetails) {
      const description =
        response.result?.description ||
        response.exceptionDetails.text ||
        'Runtime evaluation failed'
      throw new Error(description)
    }

    return response.result?.value
  }

  async close() {
    if (!this.ws) return
    this.ws.close()
    await delay(50)
  }
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const ensureRuntimeDirs = () => {
  if (!chromePath) {
    throw new Error('No supported Chromium browser was found. Set CHROME_PATH to continue.')
  }

  if (!existsSync(BUILD_DIR)) {
    throw new Error(`Missing build output at ${BUILD_DIR}. Run the build first.`)
  }

  mkdirSync(PROFILE_DIR, { recursive: true })
}

const launchChrome = () => {
  const args = [
    `--user-data-dir=${PROFILE_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--remote-debugging-address=${DEBUG_HOST}`,
    `--load-extension=${BUILD_DIR}`,
    `--disable-extensions-except=${BUILD_DIR}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    'about:blank',
  ]

  return spawn(chromePath, args, {
    stdio: 'ignore',
    detached: false,
  })
}

const fetchJson = async (url, init) => {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`)
  }

  return response.json()
}

const createTarget = (url) =>
  fetchJson(`http://${DEBUG_HOST}:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  })

const waitFor = async (label, fn, timeoutMs = TARGET_TIMEOUT_MS) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const value = await fn()
    if (value) return value
    await delay(POLL_INTERVAL_MS)
  }

  throw new Error(`Timed out while waiting for ${label}`)
}

const waitForDebugger = async () => {
  await waitFor(
    'Chrome debugger endpoint',
    async () => {
      try {
        return await fetchJson(`http://${DEBUG_HOST}:${DEBUG_PORT}/json/version`)
      } catch {
        return null
      }
    },
    STARTUP_TIMEOUT_MS,
  )
}

const readExtensionSettingsFromProfile = () => {
  if (!existsSync(SECURE_PREFERENCES_PATH)) return []

  try {
    const securePreferences = JSON.parse(readFileSync(SECURE_PREFERENCES_PATH, 'utf8'))
    const settings = securePreferences?.extensions?.settings || {}

    return Object.entries(settings).map(([id, value]) => ({
      id,
      path: value?.path || null,
    }))
  } catch {
    return []
  }
}

const resolveExtensionId = async () =>
  waitFor('crx-tab-groups extension id', async () => {
    const buildPath = path.normalize(BUILD_DIR).toLowerCase()
    const profileEntry = readExtensionSettingsFromProfile().find(
      (entry) => entry.path && path.normalize(entry.path).toLowerCase() === buildPath,
    )

    return profileEntry?.id || null
  })

const buildHarnessReadyExpression = () => `(
  () =>
    Boolean(
      window.__CRX_TAB_GROUPS_THEME_HARNESS__ &&
        typeof window.__CRX_TAB_GROUPS_THEME_HARNESS__.setThemeMode === 'function' &&
        typeof window.__CRX_TAB_GROUPS_THEME_HARNESS__.setGlassStyle === 'function' &&
        typeof window.__CRX_TAB_GROUPS_THEME_HARNESS__.clearThemeMode === 'function' &&
        typeof window.__CRX_TAB_GROUPS_THEME_HARNESS__.getThemeState === 'function',
    )
)()`

const buildGetThemeStateExpression = () => `(
  async () => window.__CRX_TAB_GROUPS_THEME_HARNESS__.getThemeState()
)()`

const buildSetThemeModeExpression = (mode) => `(
  async () => {
    await window.__CRX_TAB_GROUPS_THEME_HARNESS__.setThemeMode('${mode}')
    return window.__CRX_TAB_GROUPS_THEME_HARNESS__.getThemeState()
  }
)()`

const buildSetGlassStyleExpression = (style) => `(
  async () => {
    await window.__CRX_TAB_GROUPS_THEME_HARNESS__.setGlassStyle('${style}')
    return window.__CRX_TAB_GROUPS_THEME_HARNESS__.getThemeState()
  }
)()`

const buildClearThemeModeExpression = () => `(
  async () => {
    await window.__CRX_TAB_GROUPS_THEME_HARNESS__.clearThemeMode()
    return window.__CRX_TAB_GROUPS_THEME_HARNESS__.getThemeState()
  }
)()`

const buildGlassStyleUiSnapshotExpression = () => `(
  () => {
    const cards = Array.from(document.querySelectorAll('[data-glass-style-card]'))

    return {
      cardCount: cards.length,
      activeCount: cards.filter((card) => card.getAttribute('data-active') === 'true').length,
      labels: cards.map((card) => card.querySelector('.sp-glass-style-title')?.textContent?.trim() || null),
      descriptions: cards.map(
        (card) => card.querySelector('.sp-glass-style-description')?.textContent?.trim() || null,
      ),
      activeStyle:
        cards.find((card) => card.getAttribute('data-active') === 'true')?.getAttribute('data-glass-style-card') ||
        null,
    }
  }
)()`

const setPreferredScheme = async (client, value) => {
  await client.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value }],
  })
}

const openHarnessSidepanel = async (extensionId, preferredScheme = 'light') => {
  const sidepanelTarget = await createTarget(
    `${EXTENSION_URL_PREFIX}${extensionId}/sidepanel.html?codex-harness=theme-modes`,
  )

  const sidepanelClient = new CDPClient(sidepanelTarget.webSocketDebuggerUrl)
  await sidepanelClient.connect()
  await sidepanelClient.send('Runtime.enable')
  await sidepanelClient.send('Page.enable')
  await setPreferredScheme(sidepanelClient, preferredScheme)

  await waitFor('theme harness bridge to be ready', async () => {
    const ready = await sidepanelClient.evaluate(buildHarnessReadyExpression())
    return ready ? true : null
  })

  return sidepanelClient
}

const expectThemeState = async (client, label, predicate) =>
  waitFor(label, async () => {
    const state = await client.evaluate(buildGetThemeStateExpression())
    return predicate(state) ? state : null
  })

const main = async () => {
  ensureRuntimeDirs()

  const chromeProcess = launchChrome()
  let sidepanelClient = null

  const shutdown = async () => {
    await Promise.allSettled([sidepanelClient?.close()])

    if (!chromeProcess.killed) {
      chromeProcess.kill('SIGTERM')
      await delay(300)
    }
  }

  try {
    await waitForDebugger()

    const extensionId = await resolveExtensionId()
    assert(extensionId, 'Could not resolve extension id for crx-tab-groups')

    sidepanelClient = await openHarnessSidepanel(extensionId, 'light')

    const baseline = await sidepanelClient.evaluate(buildClearThemeModeExpression())
    assert(
      baseline.themeMode === 'system' &&
        baseline.storedThemeMode === 'system' &&
        baseline.glassStyle === DEFAULT_GLASS_STYLE &&
        baseline.storedGlassStyle === DEFAULT_GLASS_STYLE &&
        baseline.rootGlassStyle === DEFAULT_GLASS_STYLE,
      `Unexpected baseline theme state: ${JSON.stringify(baseline)}`,
    )

    const lightState = await sidepanelClient.evaluate(buildSetThemeModeExpression('light'))
    assert(
      lightState.resolvedTheme === 'light' &&
        lightState.rootTheme === 'light' &&
        lightState.rootThemeMode === 'light' &&
        lightState.isDarkClassApplied === false,
      `Light mode contract mismatch: ${JSON.stringify(lightState)}`,
    )

    const darkState = await sidepanelClient.evaluate(buildSetThemeModeExpression('dark'))
    assert(
      darkState.resolvedTheme === 'dark' &&
        darkState.rootTheme === 'dark' &&
        darkState.rootThemeMode === 'dark' &&
        darkState.isDarkClassApplied === true &&
        darkState.storedThemeMode === 'dark',
      `Dark mode contract mismatch: ${JSON.stringify(darkState)}`,
    )

    await sidepanelClient.close()
    sidepanelClient = await openHarnessSidepanel(extensionId, 'light')

    const darkPersisted = await expectThemeState(
      sidepanelClient,
      'dark persistence after reload',
      (state) => state.themeMode === 'dark' && state.resolvedTheme === 'dark',
    )

    await setPreferredScheme(sidepanelClient, 'dark')
    await sidepanelClient.evaluate(buildSetThemeModeExpression('system'))

    const systemDarkState = await expectThemeState(
      sidepanelClient,
      'system mode to resolve dark',
      (state) =>
        state.themeMode === 'system' &&
        state.resolvedTheme === 'dark' &&
        state.rootTheme === 'dark' &&
        state.rootThemeMode === 'system' &&
        state.isDarkClassApplied === true,
    )

    await setPreferredScheme(sidepanelClient, 'light')
    const systemLightState = await expectThemeState(
      sidepanelClient,
      'system mode to resolve light',
      (state) =>
        state.themeMode === 'system' &&
        state.resolvedTheme === 'light' &&
        state.rootTheme === 'light' &&
        state.rootThemeMode === 'system' &&
        state.isDarkClassApplied === false,
    )

    const glassState = await sidepanelClient.evaluate(buildSetThemeModeExpression('glass'))
    assert(
      glassState.themeMode === 'glass' &&
        glassState.resolvedTheme === 'glass' &&
        glassState.rootTheme === 'glass' &&
        glassState.rootThemeMode === 'glass' &&
        glassState.glassStyle === DEFAULT_GLASS_STYLE &&
        glassState.rootGlassStyle === DEFAULT_GLASS_STYLE &&
        glassState.isDarkClassApplied === false &&
        glassState.storedThemeMode === 'glass',
      `Glass mode contract mismatch: ${JSON.stringify(glassState)}`,
    )

    const glassPickerUi = await sidepanelClient.evaluate(buildGlassStyleUiSnapshotExpression())
    assert(
      glassPickerUi.cardCount === EXPECTED_GLASS_STYLES.length &&
        glassPickerUi.activeCount === 1 &&
        glassPickerUi.activeStyle === DEFAULT_GLASS_STYLE &&
        glassPickerUi.labels.includes('Frosted Light') &&
        glassPickerUi.labels.includes('Aurora Dark') &&
        glassPickerUi.labels.includes('Minimal Clear') &&
        glassPickerUi.labels.includes('Warm Glass') &&
        glassPickerUi.labels.includes('Monochrome Glass'),
      `Glass picker UI mismatch: ${JSON.stringify(glassPickerUi)}`,
    )

    const auroraGlassState = await sidepanelClient.evaluate(buildSetGlassStyleExpression('aurora-dark'))
    assert(
      auroraGlassState.themeMode === 'glass' &&
        auroraGlassState.resolvedTheme === 'glass' &&
        auroraGlassState.glassStyle === 'aurora-dark' &&
        auroraGlassState.rootGlassStyle === 'aurora-dark' &&
        auroraGlassState.storedGlassStyle === 'aurora-dark',
      `Aurora glass style contract mismatch: ${JSON.stringify(auroraGlassState)}`,
    )

    const auroraGlassPickerUi = await sidepanelClient.evaluate(buildGlassStyleUiSnapshotExpression())
    assert(
      auroraGlassPickerUi.activeCount === 1 && auroraGlassPickerUi.activeStyle === 'aurora-dark',
      `Aurora glass picker active state mismatch: ${JSON.stringify(auroraGlassPickerUi)}`,
    )

    const warmGlassState = await sidepanelClient.evaluate(buildSetGlassStyleExpression('warm-glass'))
    assert(
      warmGlassState.themeMode === 'glass' &&
        warmGlassState.resolvedTheme === 'glass' &&
        warmGlassState.glassStyle === 'warm-glass' &&
        warmGlassState.rootGlassStyle === 'warm-glass' &&
        warmGlassState.storedGlassStyle === 'warm-glass',
      `Warm glass style contract mismatch: ${JSON.stringify(warmGlassState)}`,
    )

    const warmGlassPickerUi = await sidepanelClient.evaluate(buildGlassStyleUiSnapshotExpression())
    assert(
      warmGlassPickerUi.activeCount === 1 && warmGlassPickerUi.activeStyle === 'warm-glass',
      `Warm glass picker active state mismatch: ${JSON.stringify(warmGlassPickerUi)}`,
    )

    const monochromeGlassState = await sidepanelClient.evaluate(
      buildSetGlassStyleExpression('monochrome-glass'),
    )
    assert(
      monochromeGlassState.themeMode === 'glass' &&
        monochromeGlassState.resolvedTheme === 'glass' &&
        monochromeGlassState.glassStyle === 'monochrome-glass' &&
        monochromeGlassState.rootGlassStyle === 'monochrome-glass' &&
        monochromeGlassState.storedGlassStyle === 'monochrome-glass',
      `Monochrome glass style contract mismatch: ${JSON.stringify(monochromeGlassState)}`,
    )

    const monochromeGlassPickerUi = await sidepanelClient.evaluate(
      buildGlassStyleUiSnapshotExpression(),
    )
    assert(
      monochromeGlassPickerUi.activeCount === 1 &&
        monochromeGlassPickerUi.activeStyle === 'monochrome-glass',
      `Monochrome glass picker active state mismatch: ${JSON.stringify(monochromeGlassPickerUi)}`,
    )

    await sidepanelClient.close()
    sidepanelClient = await openHarnessSidepanel(extensionId, 'light')

    const glassPersisted = await expectThemeState(
      sidepanelClient,
      'glass persistence after reload',
      (state) =>
        state.themeMode === 'glass' &&
        state.resolvedTheme === 'glass' &&
        state.glassStyle === 'monochrome-glass' &&
        state.rootGlassStyle === 'monochrome-glass',
    )

    const result = {
      scope: 'SCR.SP + FN.THEME',
      evidenceTier: 'runtime-verified',
      environment: {
        chromePath,
        buildDir: BUILD_DIR,
        profileDir: PROFILE_DIR,
      },
      checks: {
        baseline,
        lightState,
        darkState,
        darkPersisted,
        systemDarkState,
        systemLightState,
        glassState,
        glassPickerUi,
        auroraGlassState,
        auroraGlassPickerUi,
        warmGlassState,
        warmGlassPickerUi,
        monochromeGlassState,
        monochromeGlassPickerUi,
        glassPersisted,
      },
    }

    console.log(JSON.stringify(result, null, 2))
  } finally {
    await shutdown()
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error))
  process.exitCode = 1
})
