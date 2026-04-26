import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const DEBUG_PORT = 9222
const DEBUG_HOST = '127.0.0.1'
const DEFAULT_BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]
const REPO_ROOT = process.cwd()
const BUILD_DIR = path.join(REPO_ROOT, 'build')
const PROFILE_DIR = path.join(REPO_ROOT, '.tmp-runtime-profile', 'live-add-to-rules')
const SECURE_PREFERENCES_PATH = path.join(PROFILE_DIR, 'Default', 'Secure Preferences')
const STARTUP_TIMEOUT_MS = 20000
const TARGET_TIMEOUT_MS = 20000
const POLL_INTERVAL_MS = 250
const EXTENSION_URL_PREFIX = 'chrome-extension://'

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

const listTargets = () => fetchJson(`http://${DEBUG_HOST}:${DEBUG_PORT}/json/list`)

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
      window.__CRX_TAB_GROUPS_HARNESS__ &&
        typeof window.__CRX_TAB_GROUPS_HARNESS__.getExampleTabDraftOptions === 'function' &&
        typeof window.__CRX_TAB_GROUPS_HARNESS__.applyExampleTabToRule === 'function' &&
        typeof window.__CRX_TAB_GROUPS_HARNESS__.getAddToRulesState === 'function' &&
        typeof window.__CRX_TAB_GROUPS_HARNESS__.showThemeSmokeState === 'function',
    )
)()`

const buildHarnessMethodReadyExpression = (methodName) => `(
  () =>
    Boolean(
      window.__CRX_TAB_GROUPS_HARNESS__ &&
        typeof window.__CRX_TAB_GROUPS_HARNESS__.${methodName} === 'function',
    )
)()`

const buildSeedExpression = () => `(
  async () => window.__CRX_TAB_GROUPS_HARNESS__.seedAddToRulesScenario()
)()`

const buildDraftOptionsExpression = () => `(
  async () => window.__CRX_TAB_GROUPS_HARNESS__.getExampleTabDraftOptions()
)()`

const buildApplyToRuleExpression = () => `(
  async () => window.__CRX_TAB_GROUPS_HARNESS__.applyExampleTabToRule('rule-active')
)()`

const buildHarnessStateExpression = () => `(
  async () => {
    return window.__CRX_TAB_GROUPS_HARNESS__.getAddToRulesState()
  }
)()`

const buildShowThemeSmokeStateExpression = () => `(
  async () => {
    return window.__CRX_TAB_GROUPS_HARNESS__.showThemeSmokeState()
  }
)()`

const buildSetGlassThemeExpression = (style) => `(
  async () => {
    const waitForCommit = () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve)
        })
      })

    const themeButtons = Array.from(document.querySelectorAll('.sp-theme-chip'))
    const glassButton = themeButtons.find((button) => button.textContent?.trim() === 'Glass')
    if (!(glassButton instanceof HTMLButtonElement)) {
      throw new Error('Glass theme button not found')
    }

    glassButton.click()
    await waitForCommit()

    const styleButton = document.querySelector('[data-glass-style-card="${style}"]')
    if (!(styleButton instanceof HTMLButtonElement)) {
      throw new Error('Glass style button not found: ${style}')
    }

    styleButton.click()
    await waitForCommit()

    return {
      rootTheme: document.documentElement.getAttribute('data-theme'),
      rootThemeMode: document.documentElement.getAttribute('data-theme-mode'),
      rootGlassStyle: document.documentElement.getAttribute('data-glass-style'),
    }
  }
)()`

const buildLiveThemeSurfaceSnapshotExpression = () => `(
  () => {
    const root = document.documentElement
    const readSurface = (selector) => {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) return null

      const styles = getComputedStyle(element)
      return {
        backgroundColor: styles.backgroundColor,
        backgroundImage: styles.backgroundImage,
        borderColor: styles.borderColor,
        color: styles.color,
        boxShadow: styles.boxShadow,
        backdropFilter: styles.backdropFilter,
      }
    }

    return {
      rootTheme: root.getAttribute('data-theme'),
      rootThemeMode: root.getAttribute('data-theme-mode'),
      rootGlassStyle: root.getAttribute('data-glass-style'),
      bodyBackgroundImage: getComputedStyle(document.body).backgroundImage,
      surfaces: {
        topSites: readSurface('[data-live-surface="top-sites"]'),
        saveMenu: readSurface('[data-live-surface="save-menu"]'),
        addToRules: readSurface('[data-live-surface="add-to-rules"]'),
        dragOverlay: readSurface('[data-live-surface="drag-overlay"]'),
      },
    }
  }
)()`

const openHarnessSidepanel = async (extensionId) => {
  const sidepanelTarget = await createTarget(
    `${EXTENSION_URL_PREFIX}${extensionId}/sidepanel.html?codex-harness=live-add-to-rules`,
  )

  const sidepanelClient = new CDPClient(sidepanelTarget.webSocketDebuggerUrl)
  await sidepanelClient.connect()
  await sidepanelClient.send('Runtime.enable')
  await sidepanelClient.send('Page.enable')

  await waitForHarnessBridge(sidepanelClient)

  return sidepanelClient
}

const waitForHarnessBridge = async (sidepanelClient) => {
  await waitFor('harness bridge to be ready', async () => {
    const ready = await sidepanelClient.evaluate(buildHarnessReadyExpression())
    return ready ? true : null
  })
}

const waitForHarnessMethod = async (sidepanelClient, methodName) => {
  await waitFor(`harness method ${methodName} to be ready`, async () => {
    const ready = await sidepanelClient.evaluate(buildHarnessMethodReadyExpression(methodName))
    return ready ? true : null
  })
}

const evaluateHarnessMethod = async (sidepanelClient, methodName, expression) => {
  await waitForHarnessMethod(sidepanelClient, methodName)
  return sidepanelClient.evaluate(expression)
}

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

    sidepanelClient = await openHarnessSidepanel(extensionId)

    const seededState = await evaluateHarnessMethod(
      sidepanelClient,
      'seedAddToRulesScenario',
      buildSeedExpression(),
    )
    await waitForHarnessBridge(sidepanelClient)

    const draftOptions = await evaluateHarnessMethod(
      sidepanelClient,
      'getExampleTabDraftOptions',
      buildDraftOptionsExpression(),
    )
    const optionLabels = draftOptions.map((option) => option.label)
    assert(
      optionLabels.some((label) => label.includes('Active Rule')),
      `Active rule option missing: ${JSON.stringify(draftOptions)}`,
    )
    assert(
      !optionLabels.some((label) => label.includes('Dormant Rule')),
      `Inactive rule leaked into destination options: ${JSON.stringify(draftOptions)}`,
    )

    const applyResult = await evaluateHarnessMethod(
      sidepanelClient,
      'applyExampleTabToRule',
      buildApplyToRuleExpression(),
    )

    let harnessState = null
    await waitFor('example.com tab to be grouped by the active rule', async () => {
      harnessState = await evaluateHarnessMethod(
        sidepanelClient,
        'getAddToRulesState',
        buildHarnessStateExpression(),
      )
      if (!harnessState?.group) return null
      const hasPattern = harnessState.activeRulePatterns.includes('example.com')
      return hasPattern ? harnessState : null
    })

    assert(
      harnessState.group.title === 'Active Rule',
      `Unexpected group title: ${JSON.stringify(harnessState.group)}`,
    )
    assert(
      harnessState.group.color === 'blue',
      `Unexpected group color: ${JSON.stringify(harnessState.group)}`,
    )
    assert(
      harnessState.dormantRulePatterns.length === 0,
      `Dormant rule was modified: ${JSON.stringify(harnessState.dormantRulePatterns)}`,
    )

    const themeSmokeState = await evaluateHarnessMethod(
      sidepanelClient,
      'showThemeSmokeState',
      buildShowThemeSmokeStateExpression(),
    )
    assert(
      themeSmokeState.saveMenuOpen &&
        themeSmokeState.addToRulesOpen &&
        themeSmokeState.dragOverlayOpen,
      `Live theme smoke state failed to open: ${JSON.stringify(themeSmokeState)}`,
    )

    const liveThemeStyles = ['aurora-dark', 'warm-glass', 'monochrome-glass']
    const themeSmokeSnapshots = []

    for (const style of liveThemeStyles) {
      const themeSwitchState = await sidepanelClient.evaluate(buildSetGlassThemeExpression(style))
      assert(
        themeSwitchState.rootTheme === 'glass' &&
          themeSwitchState.rootThemeMode === 'glass' &&
          themeSwitchState.rootGlassStyle === style,
        `Glass theme switch failed for ${style}: ${JSON.stringify(themeSwitchState)}`,
      )

      const snapshot = await sidepanelClient.evaluate(buildLiveThemeSurfaceSnapshotExpression())
      assert(
        snapshot.rootTheme === 'glass' &&
          snapshot.rootThemeMode === 'glass' &&
          snapshot.rootGlassStyle === style &&
          snapshot.surfaces.topSites &&
          snapshot.surfaces.saveMenu &&
          snapshot.surfaces.addToRules &&
          snapshot.surfaces.dragOverlay,
        `Live theme surface snapshot missing required surfaces for ${style}: ${JSON.stringify(snapshot)}`,
      )

      themeSmokeSnapshots.push({
        style,
        snapshot,
      })
    }

    const serializedSurfaceSignatures = themeSmokeSnapshots.map(({ snapshot }) =>
      JSON.stringify({
        bodyBackgroundImage: snapshot.bodyBackgroundImage,
        topSites: snapshot.surfaces.topSites,
        saveMenu: snapshot.surfaces.saveMenu,
        addToRules: snapshot.surfaces.addToRules,
        dragOverlay: snapshot.surfaces.dragOverlay,
      }),
    )
    assert(
      new Set(serializedSurfaceSignatures).size === themeSmokeSnapshots.length,
      `Live theme smoke snapshots did not diverge across styles: ${JSON.stringify(themeSmokeSnapshots)}`,
    )

    const result = {
      scope: 'SCR.SP.LIVE + FN.LIVE.ADD_TAB_PATTERN_TO_RULE',
      evidenceTier: 'runtime-verified',
      environment: {
        chromePath,
        buildDir: BUILD_DIR,
        profileDir: PROFILE_DIR,
      },
      seededState,
      destinationOptions: draftOptions,
      applyResult,
      groupedResult: harnessState,
      themeSmokeState,
      themeSmokeSnapshots,
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
