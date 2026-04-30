import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const DEBUG_PORT = 9224
const DEBUG_HOST = '127.0.0.1'
const DEFAULT_BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]
const REPO_ROOT = process.cwd()
const BUILD_DIR = path.join(REPO_ROOT, 'build')
const PROFILE_DIR = path.join(REPO_ROOT, '.tmp-runtime-profile', 'saved-restore')
const SECURE_PREFERENCES_PATH = path.join(PROFILE_DIR, 'Default', 'Secure Preferences')
const STARTUP_TIMEOUT_MS = 30000
const TARGET_TIMEOUT_MS = 30000
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
        typeof window.__CRX_TAB_GROUPS_HARNESS__.seedSavedRestoreScenario === 'function' &&
        typeof window.__CRX_TAB_GROUPS_HARNESS__.runSavedRestore === 'function' &&
        typeof window.__CRX_TAB_GROUPS_HARNESS__.getSavedRestoreState === 'function',
    )
)()`

const buildSeedScenarioExpression = (scenario) => `(
  async () => window.__CRX_TAB_GROUPS_HARNESS__.seedSavedRestoreScenario('${scenario}')
)()`

const buildRunRestoreExpression = (groupId, faultMode) => `(
  async () => window.__CRX_TAB_GROUPS_HARNESS__.runSavedRestore(
    '${groupId}'${faultMode ? `, '${faultMode}'` : ''}
  )
)()`

const buildGetRestoreStateExpression = (groupId) => `(
  async () => window.__CRX_TAB_GROUPS_HARNESS__.getSavedRestoreState('${groupId}')
)()`

const openHarnessSidepanel = async (extensionId) => {
  const sidepanelTarget = await createTarget(
    `${EXTENSION_URL_PREFIX}${extensionId}/sidepanel.html?codex-harness=saved-restore`,
  )

  const sidepanelClient = new CDPClient(sidepanelTarget.webSocketDebuggerUrl)
  await sidepanelClient.connect()
  await sidepanelClient.send('Runtime.enable')
  await sidepanelClient.send('Page.enable')

  await waitFor('saved restore harness bridge to be ready', async () => {
    const ready = await sidepanelClient.evaluate(buildHarnessReadyExpression())
    return ready ? true : null
  })

  return sidepanelClient
}

const getRestoreState = async (client, groupId) =>
  client.evaluate(buildGetRestoreStateExpression(groupId))

const waitForRestoreState = async (client, groupId, label, predicate) =>
  waitFor(label, async () => {
    const state = await getRestoreState(client, groupId)
    return predicate(state) ? state : null
  })

const assertContains = (list, predicate, message) => {
  if (!list.some(predicate)) {
    throw new Error(message)
  }
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

    const partialSeed = await sidepanelClient.evaluate(buildSeedScenarioExpression('partial'))
    await sidepanelClient.evaluate(buildRunRestoreExpression(partialSeed.groupId))
    const partialState = await waitForRestoreState(
      sidepanelClient,
      partialSeed.groupId,
      'partial restore result',
      (state) => state.status?.state === 'partial',
    )

    assert(
      partialState.status.message === 'Partial 2/4' &&
        partialState.status.openedCount === 2 &&
        partialState.status.failedCount === 2,
      `Partial restore counts mismatch: ${JSON.stringify(partialState)}`,
    )
    assertContains(
      partialState.status.detailLines || [],
      (line) => line.includes('1 tab(s) had no URL'),
      `Partial restore missing missing-URL detail: ${JSON.stringify(partialState)}`,
    )
    assertContains(
      partialState.status.detailLines || [],
      (line) => line.includes('1 tab(s) used internal or unsupported URLs'),
      `Partial restore missing unsupported-URL detail: ${JSON.stringify(partialState)}`,
    )
    assertContains(
      partialState.savedGroup.tabs,
      (tab) =>
        tab.url === 'about:blank' &&
        tab.isRepaired === true &&
        tab.canRestore === true &&
        (tab.note || '').includes('repaired blank tab'),
      `Partial restore missing repaired blank tab marker: ${JSON.stringify(partialState)}`,
    )
    assertContains(
      partialState.savedGroup.tabs,
      (tab) => tab.reason === 'unsupported_url',
      `Partial restore missing unsupported eligibility row: ${JSON.stringify(partialState)}`,
    )
    assert(
      partialState.liveGroup &&
        partialState.liveGroup.title === 'Partial Restore Harness' &&
        partialState.liveTabs.length === 2 &&
        partialState.liveTabs.every((tab) => tab.groupId >= 0) &&
        partialState.liveTabs.some(
          (tab) => tab.url === 'about:blank' || tab.pendingUrl === 'about:blank',
        ) &&
        partialState.liveTabs.some(
          (tab) => tab.url === 'https://example.com/' || tab.pendingUrl === 'https://example.com/',
        ),
      `Partial restore live results mismatch: ${JSON.stringify(partialState)}`,
    )

    const failedSeed = await sidepanelClient.evaluate(buildSeedScenarioExpression('failed'))
    await sidepanelClient.evaluate(buildRunRestoreExpression(failedSeed.groupId))
    const failedState = await waitForRestoreState(
      sidepanelClient,
      failedSeed.groupId,
      'failed restore result',
      (state) => state.status?.state === 'failed',
    )

    assert(
      failedState.status.message === 'Nothing restorable' &&
        failedState.status.openedCount === 0 &&
        failedState.status.failedCount === 2 &&
        failedState.liveTabs.length === 0 &&
        failedState.liveGroup === null,
      `Failed restore contract mismatch: ${JSON.stringify(failedState)}`,
    )
    assertContains(
      failedState.status.detailLines || [],
      (line) => line.includes('1 tab(s) had no URL'),
      `Failed restore missing missing-URL detail: ${JSON.stringify(failedState)}`,
    )
    assertContains(
      failedState.status.detailLines || [],
      (line) => line.includes('1 tab(s) used internal or unsupported URLs'),
      `Failed restore missing unsupported-URL detail: ${JSON.stringify(failedState)}`,
    )

    const groupSetupSeed = await sidepanelClient.evaluate(buildSeedScenarioExpression('group-setup'))
    await sidepanelClient.evaluate(
      buildRunRestoreExpression(groupSetupSeed.groupId, 'group-setup'),
    )
    const groupSetupState = await waitForRestoreState(
      sidepanelClient,
      groupSetupSeed.groupId,
      'group setup failure result',
      (state) => state.status?.state === 'partial' && state.status?.groupSetupFailed === true,
    )

    assert(
      groupSetupState.status.message === 'Partial 1/1' &&
        groupSetupState.status.openedCount === 1 &&
        groupSetupState.status.failedCount === 0 &&
        groupSetupState.liveGroup === null &&
        groupSetupState.liveTabs.length === 1 &&
        groupSetupState.liveTabs[0].groupId === -1,
      `Group setup failure contract mismatch: ${JSON.stringify(groupSetupState)}`,
    )
    assertContains(
      groupSetupState.status.detailLines || [],
      (line) => line.includes('group setup failed'),
      `Group setup failure missing detail line: ${JSON.stringify(groupSetupState)}`,
    )

    const result = {
      scope: 'SCR.SP.SAVED + FN.RESTORE',
      evidenceTier: 'runtime-verified',
      environment: {
        chromePath,
        buildDir: BUILD_DIR,
        profileDir: PROFILE_DIR,
      },
      checks: {
        extensionId,
        partialState,
        failedState,
        groupSetupState,
      },
    }

    process.stdout.write(JSON.stringify(result, null, 2))
    await shutdown()
    process.exit(0)
  } catch (error) {
    console.error(error)
    await shutdown()
    process.exit(1)
  }
}

main()
