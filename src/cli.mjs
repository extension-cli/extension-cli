#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import {
  browserBookmarksMethod,
  browserCookiesMethod,
  browserDownloadsMethod,
  browserPermissionsContains,
  browserPermissionsRemove,
  browserPermissionsRequest,
  browserHistoryMethod,
  browserReadingListMethod,
  browserSessionsMethod,
  browserStorageMethod,
  browserTopSitesMethod,
  browserTabGroupsMethod,
  browserTabsEvents,
  browserTabsEventsClear,
  browserTabsEventsStream,
  browserTabsMethod,
  browserTabsQuery,
  browserWindowsMethod,
  daemonStart,
  daemonStatus,
  daemonStop,
} from './bridge.mjs'
import { getRenderingStatus, registerRenderingCommands } from './rendering.mjs'
import { buildTabsMethodArgs, TABS_METHOD_NAMES } from './browser/tabs-methods.mjs'
import {
  buildTabGroupsMethodArgs,
  TAB_GROUPS_METHOD_NAMES,
} from './browser/tab-groups-methods.mjs'
import { BOOKMARKS_METHOD_NAMES, buildBookmarksMethodArgs } from './browser/bookmarks-methods.mjs'
import { buildCookiesMethodArgs, COOKIES_METHOD_NAMES } from './browser/cookies-methods.mjs'
import { buildDownloadsMethodArgs, DOWNLOADS_METHOD_NAMES } from './browser/downloads-methods.mjs'
import { buildHistoryMethodArgs, HISTORY_METHOD_NAMES } from './browser/history-methods.mjs'
import { buildReadingListMethodArgs, READING_LIST_METHOD_NAMES } from './browser/reading-list-methods.mjs'
import { buildSessionsMethodArgs, SESSIONS_METHOD_NAMES } from './browser/sessions-methods.mjs'
import { buildStorageMethodArgs, STORAGE_METHOD_NAMES } from './browser/storage-methods.mjs'
import { buildTopSitesMethodArgs, TOP_SITES_METHOD_NAMES } from './browser/top-sites-methods.mjs'
import { buildWindowsMethodArgs, WINDOWS_METHOD_NAMES } from './browser/windows-methods.mjs'
import {
  buildFtMetrics,
  normalizeBookmarksTree,
  renderFtCategories,
  renderFtClassify,
  renderFtDomains,
  renderFtStats,
  renderFtViz,
} from './analysis.mjs'
import { syncBookmarksStore, syncHistoryStore } from './browser/sync.mjs'
import { renderTabsQueryTable } from './browser/tabs-query-table.mjs'
import {
  renderBookmarksSearchTable,
  renderHistorySearchTable,
  renderWindowsGetAllTable,
} from './browser/search-tables.mjs'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')
const program = new Command()
const PRIVACY_PERMISSION_BY_NAMESPACE = {
  bookmarks: 'bookmarks',
  history: 'history',
  sessions: 'sessions',
  'top-sites': 'topSites',
}

function printResult(result) {
  if (result === null || result === undefined) {
    return
  }
  if (typeof result === 'string') {
    console.log(result)
    return
  }
  console.log(JSON.stringify(result, null, 2))
}

function toKebabCase(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
}

function formatMethodNames(names) {
  return names.map(toKebabCase)
}

function getActionCommandPath(command) {
  const names = []
  let current = command
  while (current && current.parent) {
    names.push(current.name())
    current = current.parent
  }
  return names.reverse().join(' ')
}

function isDestructiveActionCommand(actionCommand) {
  const name = String(actionCommand?.name?.() || '')
  return /(^|-)remove($|-)/.test(name) || /(^|-)delete($|-)/.test(name)
}

function getGlobalSafetyOptions(actionCommand) {
  if (typeof actionCommand?.optsWithGlobals === 'function') {
    return actionCommand.optsWithGlobals()
  }
  return {}
}

function buildSafetyRequirementPayload(actionCommand) {
  const commandPath = getActionCommandPath(actionCommand)
  return {
    code: 'SAFETY_CONFIRMATION_REQUIRED',
    riskLevel: 'high',
    commandPath,
    command: `extension-cli ${commandPath}`,
    hint: `Run with --yes --risk-ack "${commandPath}" to confirm in non-interactive mode.`,
  }
}

function hasAgentRiskAcknowledgement(actionCommand) {
  const options = getGlobalSafetyOptions(actionCommand)
  const yes = Boolean(options?.yes)
  const riskAck = String(options?.riskAck || '').trim()
  if (!yes || !riskAck) return false
  const commandPath = getActionCommandPath(actionCommand)
  return riskAck === commandPath || riskAck === 'ALL'
}

function isTabsRemoveCommand(actionCommand) {
  return actionCommand?.name?.() === 'remove' && actionCommand?.parent?.name?.() === 'tabs'
}

function parseTabIdNumber(value, source) {
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${source} must be an integer tab id`)
  }
  return n
}

function parseTabIdsForPreview(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return []
  if (Array.isArray(rawValue)) return rawValue.map(item => parseTabIdNumber(item, '--tab-ids'))
  if (typeof rawValue === 'number') return [parseTabIdNumber(rawValue, '--tab-ids')]

  const text = String(rawValue).trim()
  if (!text) return []
  if (text.startsWith('[')) {
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('Invalid JSON in --tab-ids')
    }
    if (!Array.isArray(parsed)) throw new Error('--tab-ids JSON must be an array')
    return parsed.map(item => parseTabIdNumber(item, '--tab-ids'))
  }
  if (text.includes(',')) {
    return text
      .split(',')
      .map(part => parseTabIdNumber(part.trim(), '--tab-ids'))
  }
  return [parseTabIdNumber(text, '--tab-ids')]
}

function extractTabIdsFromTabsRemove(actionCommand) {
  const opts = typeof actionCommand?.opts === 'function' ? actionCommand.opts() : {}
  if (opts?.args !== undefined) {
    let parsedArgs
    try {
      parsedArgs = JSON.parse(String(opts.args))
    } catch {
      throw new Error('Invalid JSON for --args')
    }
    if (!Array.isArray(parsedArgs)) {
      throw new Error('--args must be a JSON array')
    }
    return parseTabIdsForPreview(parsedArgs[0])
  }
  return parseTabIdsForPreview(opts?.tabIds)
}

async function buildTabsRemovePreview(actionCommand) {
  const tabIds = extractTabIdsFromTabsRemove(actionCommand)
  if (tabIds.length === 0) return []

  const previews = []
  for (const tabId of tabIds) {
    try {
      const tab = await browserTabsMethod('get', [tabId])
      previews.push({
        tabId,
        title: String(tab?.title || '(untitled)'),
        url: String(tab?.url || '(no url)'),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      previews.push({
        tabId,
        title: '(unavailable)',
        url: `(failed to load tab metadata: ${message})`,
      })
    }
  }
  return previews
}

async function confirmDestructiveAction(actionCommand) {
  if (hasAgentRiskAcknowledgement(actionCommand)) {
    return
  }

  if (!input.isTTY || !output.isTTY) {
    const payload = buildSafetyRequirementPayload(actionCommand)
    const message = `${payload.code}: ${payload.command}`
    const error = new Error(message)
    error.safetyPayload = payload
    throw error
  }

  const commandPath = getActionCommandPath(actionCommand)
  const ANSI = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
  }

  let tabsRemovePreview = []
  if (isTabsRemoveCommand(actionCommand)) {
    try {
      tabsRemovePreview = await buildTabsRemovePreview(actionCommand)
    } catch {
      tabsRemovePreview = []
    }
  }

  const rl = createInterface({ input, output })
  try {
    output.write(
      `${ANSI.bold}${ANSI.yellow}[HUMAN-IN-THE-LOOP] Destructive command detected${ANSI.reset}\n`,
    )
    output.write(`${ANSI.yellow}Command:${ANSI.reset} extension-cli ${commandPath}\n`)
    output.write(
      `${ANSI.bold}${ANSI.yellow}Warning:${ANSI.reset} ` +
      `${ANSI.yellow}This operation may delete data or close resources and may be irreversible.${ANSI.reset}\n`,
    )

    if (tabsRemovePreview.length > 0) {
      output.write(`${ANSI.bold}${ANSI.yellow}Tabs to be removed:${ANSI.reset}\n`)
      for (const item of tabsRemovePreview) {
        output.write(
          `${ANSI.yellow}- tabId=${item.tabId}${ANSI.reset}\n` +
          `  title: ${item.title}\n` +
          `  url:   ${item.url}\n`,
        )
      }
    }

    const answer = await rl.question(
      `${ANSI.yellow}Proceed? [YES/NO]: ${ANSI.reset}`,
    )
    const normalized = answer.trim().toUpperCase()
    if (normalized !== 'YES') {
      throw new Error('Command cancelled by user.')
    }
  } finally {
    rl.close()
  }
}

function parseBooleanOption(value, optionName) {
  if (value === undefined || value === null || value === '') return true
  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
  throw new InvalidArgumentError(`${optionName} must be true or false`)
}

function parseNumberOption(value, optionName) {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new InvalidArgumentError(`${optionName} must be a number`)
  }
  return n
}

function parsePositiveIntOption(value, optionName) {
  const n = parseNumberOption(value, optionName)
  if (n === undefined) return undefined
  if (!Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError(`${optionName} must be a positive integer`)
  }
  return n
}

function parseGroupByOption(value, optionName) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'month' || normalized === 'year') return normalized
  throw new InvalidArgumentError(`${optionName} must be one of: month, year`)
}

function permissionOf(namespace) {
  return PRIVACY_PERMISSION_BY_NAMESPACE[namespace]
}

async function requireOptionalPermission(namespace) {
  const permission = permissionOf(namespace)
  const status = await browserPermissionsContains([permission])
  if (!status?.granted) {
    throw new Error(
      `Missing optional permission "${permission}". Run: extension-cli ${namespace} auth grant`,
    )
  }
}

async function confirmByEnter(namespace, op) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error('Permission confirmation requires an interactive terminal (TTY).')
  }

  const permission = permissionOf(namespace)
  const actionText = op === 'request' ? 'grant' : 'revoke'
  const rl = createInterface({ input, output })
  try {
    await rl.question(
      `[privacy] About to ${actionText} chrome.${permission} permission.\nPress Enter to continue, Ctrl+C to cancel: `,
    )
  } finally {
    rl.close()
  }
}

async function runPermissionAction(namespace, op) {
  const permission = permissionOf(namespace)
  await confirmByEnter(namespace, op)
  try {
    if (op === 'request') {
      return await browserPermissionsRequest([permission])
    }
    return await browserPermissionsRemove([permission])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (op === 'request' && /user gesture/i.test(message)) {
      throw new Error(
        `Chrome requires a real extension user gesture to grant "${permission}". Open the extension popup and click the Grant button for ${permission}.`,
      )
    }
    throw error
  }
}

function shouldSkipPermissionCheck(actionCommand) {
  if (actionCommand.parent?.name() === 'auth') return true
  if (actionCommand.name() === 'methods') return true
  return false
}

function attachOptionalPermissionGuard(command, namespace) {
  command.hook('preAction', async (_thisCommand, actionCommand) => {
    if (shouldSkipPermissionCheck(actionCommand)) return
    try {
      await requireOptionalPermission(namespace)
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })
}

function registerAuthCommands(command, namespace) {
  const permission = permissionOf(namespace)
  const auth = command.command('auth').description(`Manage optional chrome.${permission} permission`)

  auth
    .command('grant')
    .description(`Grant chrome.${permission} permission (requires Enter confirmation; may require popup click)`)
    .action(async () => {
      try {
        const data = await runPermissionAction(namespace, 'request')
        printResult({ ...data, namespace })
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })

  auth
    .command('revoke')
    .description(`Revoke chrome.${permission} permission (requires Enter confirmation)`)
    .action(async () => {
      try {
        const data = await runPermissionAction(namespace, 'remove')
        printResult({ ...data, namespace })
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })

  auth
    .command('events')
    .description(`Read bridged chrome.permissions events for chrome.${permission}`)
    .option('--since <ms>', 'Only events after this unix ms timestamp', value =>
      parseNumberOption(value, '--since'))
    .option('--limit <n>', 'Max returned events', value =>
      parseNumberOption(value, '--limit'))
    .option('--type <name>', 'Filter by event name, e.g. onAdded|onRemoved')
    .option('--follow', 'Stream continuously for new events')
    .option('--transport <transport>', 'Stream transport for --follow: ws|sse', 'ws')
    .action(async options => {
      try {
        const matchesNamespacePermission = event => {
          const list = event?.payload?.permissions?.permissions
          return Array.isArray(list) && list.includes(namespace)
        }

        if (!options.follow) {
          const data = await browserTabsEvents({
            since: options.since,
            limit: options.limit,
            type: options.type,
            namespace: 'permissions',
            requireBridge: true,
          })
          const events = Array.isArray(data?.events)
            ? data.events.filter(matchesNamespacePermission)
            : []
          printResult({ ...data, events, count: events.length })
          return
        }

        let closedBySignal = false
        const stream = await browserTabsEventsStream({
          transport: options.transport,
          type: options.type,
          namespace: 'permissions',
          onReady: () => {},
          onEvent: event => {
            if (matchesNamespacePermission(event)) printResult(event)
          },
          onError: error => {
            if (closedBySignal) return
            console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
          },
        })

        const closeStream = () => {
          closedBySignal = true
          stream.close()
        }

        process.on('SIGINT', () => {
          closeStream()
          process.exit(0)
        })
        process.on('SIGTERM', () => {
          closeStream()
          process.exit(0)
        })

        await new Promise(() => {})
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })
}

program
  .name('extension-cli')
  .description(packageJson.description)
  .version(packageJson.version)
  .option('--yes', 'Acknowledge and proceed for interactive safety prompts')
  .option('--risk-ack <commandPath>', 'Explicit risk acknowledgement token (e.g. "tabs remove", or "ALL")')

program.hook('preAction', async (_thisCommand, actionCommand) => {
  if (!isDestructiveActionCommand(actionCommand)) return
  try {
    await confirmDestructiveAction(actionCommand)
  } catch (error) {
    if (error && typeof error === 'object' && error.safetyPayload) {
      console.error(JSON.stringify(error.safetyPayload))
    }
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
})

program
  .command('doctor')
  .description('Check runtime setup')
  .action(async () => {
    try {
      const [daemon, rendering] = await Promise.all([
        daemonStatus(),
        getRenderingStatus({ verifyToken: false }),
      ])
      printResult({
        ok: true,
        daemon,
        rendering,
      })
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

program
  .command('status')
  .description('Show aggregate status for daemon/rendering')
  .option('--verify-rendering-token', 'Verify Cloudflare token via network')
  .action(async options => {
    try {
      const [daemon, rendering] = await Promise.all([
        daemonStatus(),
        getRenderingStatus({ verifyToken: options.verifyRenderingToken }),
      ])
      printResult({
        ok: true,
        daemon,
        rendering,
      })
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

const daemon = program.command('daemon').description('Manage local browser bridge daemon')

daemon.command('status').action(async () => {
  try {
    printResult(await daemonStatus())
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
})

daemon.command('start').action(async () => {
  try {
    printResult(await daemonStart())
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
})

daemon.command('stop').action(async () => {
  try {
    printResult(await daemonStop())
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
})

async function loadFtMetrics() {
  await requireOptionalPermission('bookmarks')
  const tree = await browserBookmarksMethod('getTree', [])
  const { bookmarks, folders } = normalizeBookmarksTree(tree)
  return buildFtMetrics(bookmarks, folders)
}

async function callFt(render, options = {}) {
  try {
    const metrics = await loadFtMetrics()
    if (options.json) {
      printResult(metrics)
      return
    }
    console.log(render(metrics))
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

async function loadHistoryMetrics(maxResults = 10000) {
  await requireOptionalPermission('history')
  const rows = await browserHistoryMethod('search', [{
    text: '',
    startTime: 0,
    maxResults,
  }])
  const items = Array.isArray(rows) ? rows : []
  const normalized = items.map((row, idx) => ({
    id: String(row?.id ?? row?.url ?? idx),
    title: String(row?.title || '(untitled)'),
    url: String(row?.url || ''),
    domain: (() => {
      try {
        return new URL(String(row?.url || '')).hostname.replace(/^www\./, '').toLowerCase()
      } catch {
        return 'unknown'
      }
    })(),
    dateAdded: typeof row?.lastVisitTime === 'number' ? row.lastVisitTime : null,
  }))
  return buildFtMetrics(normalized, [])
}

async function syncBookmarksSnapshot(options = {}) {
  try {
    const tree = await browserBookmarksMethod('getTree', [])
    const { bookmarks } = normalizeBookmarksTree(tree)
    const result = await syncBookmarksStore(bookmarks, { full: options.full })
    printResult({
      ok: true,
      namespace: 'bookmarks',
      mode: result.mode,
      fetched: bookmarks.length,
      added: result.added,
      totalRecords: result.totalRecords,
      cachePath: result.cachePath,
      metaPath: result.metaPath,
    })
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

async function syncHistorySnapshot(options = {}) {
  try {
    const maxResults = options.maxResults ?? 10000
    const rows = await browserHistoryMethod('search', [{
      text: '',
      startTime: 0,
      maxResults,
    }])
    const items = Array.isArray(rows) ? rows : []
    const result = await syncHistoryStore(items, { full: options.full })
    printResult({
      ok: true,
      namespace: 'history',
      mode: result.mode,
      fetched: items.length,
      added: result.added,
      totalRecords: result.totalRecords,
      cachePath: result.cachePath,
      metaPath: result.metaPath,
    })
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

async function callHistoryFt(render, options = {}) {
  try {
    const metrics = await loadHistoryMetrics(options.maxResults)
    if (options.json) {
      printResult(metrics)
      return
    }
    console.log(render(metrics))
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

const browserTabs = program.command('tabs').description('Chrome tabs API')
const browserTabGroups = program.command('tab-groups').description('Chrome tabGroups API')
const browserWindows = program.command('windows').description('Chrome windows API')
const browserHistory = program.command('history').description('Chrome history API')
const browserSessions = program.command('sessions').description('Chrome sessions API')
const browserBookmarks = program.command('bookmarks').description('Chrome bookmarks API')
const browserCookies = program.command('cookies').description('Chrome cookies API')
const browserDownloads = program.command('downloads').description('Chrome downloads API')
const browserStorage = program.command('storage').description('Chrome storage API')
const browserReadingList = program.command('reading-list').description('Chrome readingList API')
const browserTopSites = program.command('top-sites').description('Chrome topSites API')

registerAuthCommands(browserBookmarks, 'bookmarks')
registerAuthCommands(browserHistory, 'history')
registerAuthCommands(browserSessions, 'sessions')
registerAuthCommands(browserTopSites, 'top-sites')

attachOptionalPermissionGuard(browserBookmarks, 'bookmarks')
attachOptionalPermissionGuard(browserHistory, 'history')
attachOptionalPermissionGuard(browserSessions, 'sessions')
attachOptionalPermissionGuard(browserTopSites, 'top-sites')

async function callTabsMethod(method, options = {}) {
  try {
    const normalized = typeof options?.opts === 'function' ? options.opts() : (options || {})
    const args = buildTabsMethodArgs(method, normalized)
    const data = await browserTabsMethod(method, args)
    printResult({ method, args, data })
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

async function callTabGroupsMethod(method, options = {}) {
  try {
    const normalized = typeof options?.opts === 'function' ? options.opts() : (options || {})
    const args = buildTabGroupsMethodArgs(method, normalized)
    const data = await browserTabGroupsMethod(method, args)
    printResult({ method, args, data })
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

async function callWindowsMethod(method, options = {}) {
  try {
    const normalized = typeof options?.opts === 'function' ? options.opts() : (options || {})
    const args = buildWindowsMethodArgs(method, normalized)
    const data = await browserWindowsMethod(method, args)
    printResult({ method, args, data })
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

async function callHistoryMethod(method, options = {}) {
  try {
    const normalized = typeof options?.opts === 'function' ? options.opts() : (options || {})
    const args = buildHistoryMethodArgs(method, normalized)
    const data = await browserHistoryMethod(method, args)
    printResult({ method, args, data })
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

async function callSessionsMethod(method, options = {}) {
  try {
    const normalized = typeof options?.opts === 'function' ? options.opts() : (options || {})
    const args = buildSessionsMethodArgs(method, normalized)
    const data = await browserSessionsMethod(method, args)
    printResult({ method, args, data })
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

async function callBookmarksMethod(method, options = {}) {
  try {
    const normalized = typeof options?.opts === 'function' ? options.opts() : (options || {})
    const args = buildBookmarksMethodArgs(method, normalized)
    const data = await browserBookmarksMethod(method, args)
    printResult({ method, args, data })
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

async function callCookiesMethod(method, options = {}) {
  try {
    const normalized = typeof options?.opts === 'function' ? options.opts() : (options || {})
    const args = buildCookiesMethodArgs(method, normalized)
    const data = await browserCookiesMethod(method, args)
    printResult({ method, args, data })
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

async function callDownloadsMethod(method, options = {}) {
  try {
    const normalized = typeof options?.opts === 'function' ? options.opts() : (options || {})
    const args = buildDownloadsMethodArgs(method, normalized)
    const data = await browserDownloadsMethod(method, args)
    printResult({ method, args, data })
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

async function callStorageMethod(method, options = {}) {
  try {
    const normalized = typeof options?.opts === 'function' ? options.opts() : (options || {})
    const args = buildStorageMethodArgs(method, normalized)
    const data = await browserStorageMethod(method, args)
    printResult({ method, args, data })
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

async function callReadingListMethod(method, options = {}) {
  try {
    const normalized = typeof options?.opts === 'function' ? options.opts() : (options || {})
    const args = buildReadingListMethodArgs(method, normalized)
    const data = await browserReadingListMethod(method, args)
    printResult({ method, args, data })
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

async function callTopSitesMethod(method, options = {}) {
  try {
    const normalized = typeof options?.opts === 'function' ? options.opts() : (options || {})
    const args = buildTopSitesMethodArgs(method, normalized)
    const data = await browserTopSitesMethod(method, args)
    printResult({ method, args, data })
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

function registerNamespaceEventsCommands(command, namespace, exampleType) {
  command
    .command('events')
    .description(`Read bridged chrome.${namespace} events from extension -> daemon`)
    .option('--since <ms>', 'Only events after this unix ms timestamp', value =>
      parseNumberOption(value, '--since'))
    .option('--limit <n>', 'Max returned events', value =>
      parseNumberOption(value, '--limit'))
    .option('--type <name>', `Filter by event name, e.g. ${exampleType}`)
    .option('--follow', 'Stream continuously for new events')
    .option('--transport <transport>', 'Stream transport for --follow: ws|sse', 'ws')
    .action(async options => {
      try {
        if (!options.follow) {
          const data = await browserTabsEvents({
            since: options.since,
            limit: options.limit,
            type: options.type,
            namespace,
            requireBridge: true,
          })
          printResult(data)
          return
        }

        let closedBySignal = false
        const stream = await browserTabsEventsStream({
          transport: options.transport,
          type: options.type,
          namespace,
          onReady: () => {},
          onEvent: event => {
            printResult(event)
          },
          onError: error => {
            if (closedBySignal) return
            console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
          },
        })

        const closeStream = () => {
          closedBySignal = true
          stream.close()
        }

        process.on('SIGINT', () => {
          closeStream()
          process.exit(0)
        })
        process.on('SIGTERM', () => {
          closeStream()
          process.exit(0)
        })

        await new Promise(() => {})
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })

  command
    .command('events-clear')
    .description('Clear buffered bridged events from daemon')
    .action(async () => {
      try {
        const ok = await browserTabsEventsClear()
        printResult({ ok })
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })
}

browserTabs
  .command('query')
  .description('chrome.tabs.query(queryInfo): Get tabs matching QueryInfo filters')
  .option('--query <json>', 'Raw chrome.tabs.query QueryInfo JSON')
  .option('--table', 'Render a boxed TUI-style table output')
  .option('--active [boolean]', 'Filter by active state (true|false)', value =>
    parseBooleanOption(value, '--active'))
  .option('--current-window [boolean]', 'Filter by current window (true|false)', value =>
    parseBooleanOption(value, '--current-window'))
  .option('--last-focused-window [boolean]', 'Filter by last focused window (true|false)', value =>
    parseBooleanOption(value, '--last-focused-window'))
  .option('--window-id <id>', 'Filter by window id')
  .option('--status <status>', 'Tab loading status: loading|complete')
  .option('--url <pattern>', 'Match pattern, e.g. https://*.github.com/*')
  .option('--pinned [boolean]', 'Filter by pinned state (true|false)', value =>
    parseBooleanOption(value, '--pinned'))
  .option('--audible [boolean]', 'Filter by audible state (true|false)', value =>
    parseBooleanOption(value, '--audible'))
  .option('--muted [boolean]', 'Filter by muted state (true|false)', value =>
    parseBooleanOption(value, '--muted'))
  .option('--highlighted [boolean]', 'Filter by highlighted state (true|false)', value =>
    parseBooleanOption(value, '--highlighted'))
  .option('--discarded [boolean]', 'Filter by discarded state (true|false)', value =>
    parseBooleanOption(value, '--discarded'))
  .option('--group-id <id>', 'Filter by group id')
  .option('--index <index>', 'Filter by tab index')
  .addHelpText('after', `
URL pattern notes:
  --url expects a Chrome match pattern, not regex.
  Format: <scheme>://<host>/<path>
  Wildcards:
    * matches many chars (e.g. *.github.com, /foo/*)
Examples:
  extension-cli tabs query --url "https://*.github.com/*"
  extension-cli tabs query --url "*://*.google.com/*"
  extension-cli tabs query --active --current-window
  extension-cli tabs query --query '{"url":["https://*.github.com/*","https://*.gitlab.com/*"]}'
`)
  .action(async options => {
    try {
      let query = {}
      if (options.query) {
        query = JSON.parse(options.query)
      }

      const merged = {
        ...query,
      }

      const assignIf = (key, value) => {
        if (value !== undefined) merged[key] = value
      }

      assignIf('active', options.active)
      assignIf('currentWindow', options.currentWindow)
      assignIf('lastFocusedWindow', options.lastFocusedWindow)
      assignIf('status', options.status)
      assignIf('url', options.url)
      assignIf('pinned', options.pinned)
      assignIf('audible', options.audible)
      assignIf('highlighted', options.highlighted)
      assignIf('discarded', options.discarded)

      if (options.muted !== undefined) {
        assignIf('muted', options.muted)
      }
      if (options.windowId !== undefined) {
        assignIf('windowId', Number(options.windowId))
      }
      if (options.groupId !== undefined) {
        assignIf('groupId', Number(options.groupId))
      }
      if (options.index !== undefined) {
        assignIf('index', Number(options.index))
      }

      const tabs = await browserTabsQuery(merged)
      if (options.table) {
        console.log(renderTabsQueryTable(tabs))
        return
      }
      printResult({ count: Array.isArray(tabs) ? tabs.length : 0, tabs })
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserTabs
  .command('capture-visible-tab')
  .description('chrome.tabs.captureVisibleTab(windowId?, options?): Capture visible area of a tab')
  .option('--window-id <id>', 'Target window ID')
  .option('--options <json>', 'ImageDetails JSON, e.g. {"format":"png"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callTabsMethod('captureVisibleTab', options))

browserTabs
  .command('connect')
  .description('chrome.tabs.connect(tabId?, connectInfo?): Connect to a content script port')
  .argument('[tabId]', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--connect-info <json>', 'connectInfo JSON, e.g. {"name":"channel"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('connect', { ...options, _tabId: tabId }))

browserTabs
  .command('create')
  .description('chrome.tabs.create(createProperties): Create a new tab')
  .argument('[url]', 'Shortcut for createProperties.url')
  .option('--create-properties <json>', 'createProperties JSON')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (url, options) => callTabsMethod('create', { ...options, _url: url }))

browserTabs
  .command('detect-language')
  .description('chrome.tabs.detectLanguage(tabId?): Detect language of a tab')
  .argument('[tabId]', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('detectLanguage', { ...options, _tabId: tabId }))

browserTabs
  .command('discard')
  .description('chrome.tabs.discard(tabId?): Discard a tab to free memory')
  .argument('[tabId]', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('discard', { ...options, _tabId: tabId }))

browserTabs
  .command('duplicate')
  .description('chrome.tabs.duplicate(tabId): Duplicate a tab')
  .argument('<tabId>', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('duplicate', { ...options, _tabId: tabId }))

browserTabs
  .command('get')
  .description('chrome.tabs.get(tabId): Get details of a tab')
  .argument('<tabId>', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('get', { ...options, _tabId: tabId }))

browserTabs
  .command('get-current')
  .description('chrome.tabs.getCurrent(): Get current tab from extension page context')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callTabsMethod('getCurrent', options))

browserTabs
  .command('get-zoom')
  .description('chrome.tabs.getZoom(tabId?): Get zoom factor for a tab')
  .argument('[tabId]', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('getZoom', { ...options, _tabId: tabId }))

browserTabs
  .command('get-zoom-settings')
  .description('chrome.tabs.getZoomSettings(tabId?): Get zoom settings for a tab')
  .argument('[tabId]', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('getZoomSettings', { ...options, _tabId: tabId }))

browserTabs
  .command('go-back')
  .description('chrome.tabs.goBack(tabId?): Navigate tab back in history')
  .argument('[tabId]', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('goBack', { ...options, _tabId: tabId }))

browserTabs
  .command('go-forward')
  .description('chrome.tabs.goForward(tabId?): Navigate tab forward in history')
  .argument('[tabId]', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('goForward', { ...options, _tabId: tabId }))

browserTabs
  .command('group')
  .description('chrome.tabs.group(options): Add one or more tabs to a tab group')
  .option('--options <json>', 'group options JSON, e.g. {"tabIds":[1,2]}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callTabsMethod('group', options))

browserTabs
  .command('highlight')
  .description('chrome.tabs.highlight(highlightInfo): Highlight tabs by index')
  .option('--highlight-info <json>', 'highlightInfo JSON')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callTabsMethod('highlight', options))

browserTabs
  .command('move')
  .description('chrome.tabs.move(tabIds, moveProperties): Move tabs within/between windows')
  .option('--tab-ids <ids>', 'Tab IDs: single, comma list, or JSON array')
  .option('--move-properties <json>', 'moveProperties JSON, e.g. {"index":0}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callTabsMethod('move', options))

browserTabs
  .command('reload')
  .description('chrome.tabs.reload(tabId?, reloadProperties?): Reload a tab')
  .argument('[tabId]', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--reload-properties <json>', 'reloadProperties JSON, e.g. {"bypassCache":true}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('reload', { ...options, _tabId: tabId }))

browserTabs
  .command('remove')
  .description('chrome.tabs.remove(tabIds): Close one or more tabs')
  .option('--tab-ids <ids>', 'Tab IDs: single, comma list, or JSON array')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callTabsMethod('remove', options))

browserTabs
  .command('send-message')
  .description('chrome.tabs.sendMessage(tabId, message, options?): Send a message to a tab')
  .argument('<tabId>', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--message <json>', 'Message as JSON')
  .option('--message-text <text>', 'Message as plain text')
  .option('--options <json>', 'sendMessage options JSON')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('sendMessage', { ...options, _tabId: tabId }))

browserTabs
  .command('set-zoom')
  .description('chrome.tabs.setZoom(tabId?, zoomFactor): Set zoom factor')
  .argument('[tabId]', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .requiredOption('--zoom-factor <number>', 'Zoom factor, e.g. 1 or 1.25')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('setZoom', { ...options, _tabId: tabId }))

browserTabs
  .command('set-zoom-settings')
  .description('chrome.tabs.setZoomSettings(tabId?, zoomSettings): Set zoom mode/scope')
  .argument('[tabId]', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .requiredOption('--zoom-settings <json>', 'zoomSettings JSON')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('setZoomSettings', { ...options, _tabId: tabId }))

browserTabs
  .command('ungroup')
  .description('chrome.tabs.ungroup(tabIds): Remove tabs from their groups')
  .option('--tab-ids <ids>', 'Tab IDs: single, comma list, or JSON array')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callTabsMethod('ungroup', options))

browserTabs
  .command('update')
  .description('chrome.tabs.update(tabId?, updateProperties): Update tab properties')
  .argument('[tabId]', 'Tab ID')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .requiredOption('--update-properties <json>', 'updateProperties JSON, e.g. {"active":true}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, options) => callTabsMethod('update', { ...options, _tabId: tabId }))

browserTabs
  .command('methods')
  .description('List all integrated chrome.tabs methods')
  .action(() => {
    printResult({ count: TABS_METHOD_NAMES.length, methods: formatMethodNames(TABS_METHOD_NAMES) })
  })

browserTabs
  .command('events')
  .description('Read bridged chrome.tabs events from extension -> daemon')
  .option('--since <ms>', 'Only events after this unix ms timestamp', value =>
    parseNumberOption(value, '--since'))
  .option('--limit <n>', 'Max returned events', value =>
    parseNumberOption(value, '--limit'))
  .option('--type <name>', 'Filter by event name, e.g. onUpdated')
  .option('--follow', 'Stream continuously for new events')
  .option('--transport <transport>', 'Stream transport for --follow: ws|sse', 'ws')
  .action(async options => {
    try {
      if (!options.follow) {
        const data = await browserTabsEvents({
          since: options.since,
          limit: options.limit,
          type: options.type,
          namespace: 'tabs',
          requireBridge: true,
        })
        printResult(data)
        return
      }

      let closedBySignal = false
      const stream = await browserTabsEventsStream({
        transport: options.transport,
        type: options.type,
        namespace: 'tabs',
        onReady: () => {},
        onEvent: event => {
          printResult(event)
        },
        onError: error => {
          if (closedBySignal) return
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        },
      })

      const closeStream = () => {
        closedBySignal = true
        stream.close()
      }

      process.on('SIGINT', () => {
        closeStream()
        process.exit(0)
      })
      process.on('SIGTERM', () => {
        closeStream()
        process.exit(0)
      })

      await new Promise(() => {})
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserTabs
  .command('events-clear')
  .description('Clear buffered bridged events from daemon')
  .action(async () => {
    try {
      const ok = await browserTabsEventsClear()
      printResult({ ok })
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserTabGroups
  .command('get')
  .description('chrome.tabGroups.get(groupId): Get details of a tab group')
  .argument('<groupId>', 'Tab group ID')
  .option('--group-id <id>', 'Tab group ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (groupId, options) => callTabGroupsMethod('get', { ...options, _groupId: groupId }))

browserTabGroups
  .command('move')
  .description('chrome.tabGroups.move(groupId, moveProperties): Move a tab group')
  .argument('<groupId>', 'Tab group ID')
  .option('--group-id <id>', 'Tab group ID (same as positional)')
  .requiredOption('--move-properties <json>', 'moveProperties JSON, e.g. {"index":0}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (groupId, options) => callTabGroupsMethod('move', { ...options, _groupId: groupId }))

browserTabGroups
  .command('query')
  .description('chrome.tabGroups.query(queryInfo): Query tab groups')
  .option('--query <json>', 'queryInfo JSON')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .addHelpText('after', `
Query examples:
  extension-cli tab-groups query --query '{"title":"Work"}'
  extension-cli tab-groups query --query '{"collapsed":false,"windowId":123}'
`)
  .action(async options => callTabGroupsMethod('query', options))

browserTabGroups
  .command('update')
  .description('chrome.tabGroups.update(groupId, updateProperties): Update a tab group')
  .argument('<groupId>', 'Tab group ID')
  .option('--group-id <id>', 'Tab group ID (same as positional)')
  .requiredOption('--update-properties <json>', 'updateProperties JSON, e.g. {"title":"Work"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (groupId, options) => callTabGroupsMethod('update', { ...options, _groupId: groupId }))

browserTabGroups
  .command('methods')
  .description('List all integrated chrome.tabGroups methods')
  .action(() => {
    printResult({ count: TAB_GROUPS_METHOD_NAMES.length, methods: formatMethodNames(TAB_GROUPS_METHOD_NAMES) })
  })

browserTabGroups
  .command('events')
  .description('Read bridged chrome.tabGroups events from extension -> daemon')
  .option('--since <ms>', 'Only events after this unix ms timestamp', value =>
    parseNumberOption(value, '--since'))
  .option('--limit <n>', 'Max returned events', value =>
    parseNumberOption(value, '--limit'))
  .option('--type <name>', 'Filter by event name, e.g. onUpdated')
  .option('--follow', 'Stream continuously for new events')
  .option('--transport <transport>', 'Stream transport for --follow: ws|sse', 'ws')
  .action(async options => {
    try {
      if (!options.follow) {
        const data = await browserTabsEvents({
          since: options.since,
          limit: options.limit,
          type: options.type,
          namespace: 'tabGroups',
          requireBridge: true,
        })
        printResult(data)
        return
      }

      let closedBySignal = false
      const stream = await browserTabsEventsStream({
        transport: options.transport,
        type: options.type,
        namespace: 'tabGroups',
        onReady: () => {},
        onEvent: event => {
          printResult(event)
        },
        onError: error => {
          if (closedBySignal) return
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        },
      })

      const closeStream = () => {
        closedBySignal = true
        stream.close()
      }

      process.on('SIGINT', () => {
        closeStream()
        process.exit(0)
      })
      process.on('SIGTERM', () => {
        closeStream()
        process.exit(0)
      })

      await new Promise(() => {})
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserTabGroups
  .command('events-clear')
  .description('Clear buffered bridged events from daemon')
  .action(async () => {
    try {
      const ok = await browserTabsEventsClear()
      printResult({ ok })
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserWindows
  .command('create')
  .description('chrome.windows.create(createData): Create a new browser window')
  .option('--create-data <json>', 'createData JSON, e.g. {"url":"https://example.com","focused":true}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callWindowsMethod('create', options))

browserWindows
  .command('get')
  .description('chrome.windows.get(windowId, getInfo?): Get details for a window')
  .argument('<windowId>', 'Window ID')
  .option('--window-id <id>', 'Window ID (same as positional)')
  .option('--get-info <json>', 'getInfo JSON, e.g. {"populate":true}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (windowId, options) => callWindowsMethod('get', { ...options, _windowId: windowId }))

browserWindows
  .command('get-all')
  .description('chrome.windows.getAll(getInfo?): Get all windows')
  .option('--get-info <json>', 'getInfo JSON, e.g. {"populate":true}')
  .option('--table', 'Render a boxed TUI-style table output')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .addHelpText('after', `
getInfo notes:
  --get-info controls detail level.
  Common fields:
    {"populate":true}   include tabs in each window
    {"windowTypes":["normal","popup"]}  filter window types
Examples:
  extension-cli windows get-all --get-info '{"populate":true}'
  extension-cli windows get-all --get-info '{"populate":false,"windowTypes":["normal"]}'
  extension-cli windows get-all --table
`)
  .action(async options => {
    try {
      const args = buildWindowsMethodArgs('getAll', options)
      const data = await browserWindowsMethod('getAll', args)
      if (options.table) {
        console.log(renderWindowsGetAllTable(data))
        return
      }
      printResult({ method: 'getAll', args, data })
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserWindows
  .command('get-current')
  .description('chrome.windows.getCurrent(getInfo?): Get current window')
  .option('--get-info <json>', 'getInfo JSON, e.g. {"populate":true}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callWindowsMethod('getCurrent', options))

browserWindows
  .command('get-last-focused')
  .description('chrome.windows.getLastFocused(getInfo?): Get last focused window')
  .option('--get-info <json>', 'getInfo JSON, e.g. {"populate":true}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callWindowsMethod('getLastFocused', options))

browserWindows
  .command('remove')
  .description('chrome.windows.remove(windowId): Close a window')
  .argument('<windowId>', 'Window ID')
  .option('--window-id <id>', 'Window ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (windowId, options) => callWindowsMethod('remove', { ...options, _windowId: windowId }))

browserWindows
  .command('update')
  .description('chrome.windows.update(windowId, updateInfo): Update a window')
  .argument('<windowId>', 'Window ID')
  .option('--window-id <id>', 'Window ID (same as positional)')
  .requiredOption('--update-info <json>', 'updateInfo JSON, e.g. {"focused":true}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (windowId, options) => callWindowsMethod('update', { ...options, _windowId: windowId }))

browserWindows
  .command('methods')
  .description('List all integrated chrome.windows methods')
  .action(() => {
    printResult({ count: WINDOWS_METHOD_NAMES.length, methods: formatMethodNames(WINDOWS_METHOD_NAMES) })
  })

browserWindows
  .command('events')
  .description('Read bridged chrome.windows events from extension -> daemon')
  .option('--since <ms>', 'Only events after this unix ms timestamp', value =>
    parseNumberOption(value, '--since'))
  .option('--limit <n>', 'Max returned events', value =>
    parseNumberOption(value, '--limit'))
  .option('--type <name>', 'Filter by event name, e.g. onCreated')
  .option('--follow', 'Stream continuously for new events')
  .option('--transport <transport>', 'Stream transport for --follow: ws|sse', 'ws')
  .action(async options => {
    try {
      if (!options.follow) {
        const data = await browserTabsEvents({
          since: options.since,
          limit: options.limit,
          type: options.type,
          namespace: 'windows',
          requireBridge: true,
        })
        printResult(data)
        return
      }

      let closedBySignal = false
      const stream = await browserTabsEventsStream({
        transport: options.transport,
        type: options.type,
        namespace: 'windows',
        onReady: () => {},
        onEvent: event => {
          printResult(event)
        },
        onError: error => {
          if (closedBySignal) return
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        },
      })

      const closeStream = () => {
        closedBySignal = true
        stream.close()
      }

      process.on('SIGINT', () => {
        closeStream()
        process.exit(0)
      })
      process.on('SIGTERM', () => {
        closeStream()
        process.exit(0)
      })

      await new Promise(() => {})
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserWindows
  .command('events-clear')
  .description('Clear buffered bridged events from daemon')
  .action(async () => {
    try {
      const ok = await browserTabsEventsClear()
      printResult({ ok })
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserHistory
  .command('sync')
  .description('Sync chrome.history into local cache (~/.extension-cli/sync)')
  .option('--full', 'Full refresh (replace cache instead of incremental merge)')
  .option('--max-results <n>', 'Max rows fetched from history', value => parsePositiveIntOption(value, '--max-results'), 10000)
  .action(async options => {
    await syncHistorySnapshot(options)
  })

browserHistory
  .command('viz')
  .description('Visual dashboard for chrome.history')
  .option('--max-results <n>', 'Max rows fetched from history', value => parsePositiveIntOption(value, '--max-results'), 10000)
  .option('--json', 'Raw metrics JSON output')
  .action(async options => {
    await callHistoryFt(
      metrics =>
        renderFtViz(metrics, {
          title: 'Chrome History Dashboard',
          primaryLabel: 'History Items',
          showSecondary: false,
        }),
      options,
    )
  })

browserHistory
  .command('stats')
  .description('Aggregate stats for chrome.history')
  .option('--max-results <n>', 'Max rows fetched from history', value => parsePositiveIntOption(value, '--max-results'), 10000)
  .option('--json', 'Raw metrics JSON output')
  .action(async options => {
    await callHistoryFt(metrics => renderFtStats(metrics, { title: 'chrome.history stats' }), options)
  })

browserHistory
  .command('categories')
  .description('Category distribution over history')
  .option('--max-results <n>', 'Max rows fetched from history', value => parsePositiveIntOption(value, '--max-results'), 10000)
  .option('--limit <n>', 'Max rows', value => parsePositiveIntOption(value, '--limit'), 15)
  .option('--json', 'Raw metrics JSON output')
  .action(async options => {
    await callHistoryFt(
      metrics => renderFtCategories(metrics, options.limit, { title: 'History Category Distribution' }),
      options,
    )
  })

browserHistory
  .command('domains')
  .description('Domain distribution over history')
  .option('--max-results <n>', 'Max rows fetched from history', value => parsePositiveIntOption(value, '--max-results'), 10000)
  .option('--limit <n>', 'Max rows', value => parsePositiveIntOption(value, '--limit'), 15)
  .option('--json', 'Raw metrics JSON output')
  .action(async options => {
    await callHistoryFt(
      metrics => renderFtDomains(metrics, options.limit, { title: 'History Domain Distribution' }),
      options,
    )
  })

browserHistory
  .command('classify')
  .description('Classify history items by category (rule-based)')
  .option('--max-results <n>', 'Max rows fetched from history', value => parsePositiveIntOption(value, '--max-results'), 10000)
  .option('--limit <n>', 'Max rows', value => parsePositiveIntOption(value, '--limit'), 30)
  .option('--json', 'Raw metrics JSON output')
  .action(async options => {
    await callHistoryFt(
      metrics => renderFtClassify(metrics, options.limit, { title: 'History Item Classification' }),
      options,
    )
  })

browserHistory
  .command('add-url')
  .description('chrome.history.addUrl(details): Add a URL to history')
  .requiredOption('--details <json>', 'details JSON, e.g. {"url":"https://example.com"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callHistoryMethod('addUrl', options))

browserHistory
  .command('delete-all')
  .description('chrome.history.deleteAll(): Delete all history')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callHistoryMethod('deleteAll', options))

browserHistory
  .command('delete-range')
  .description('chrome.history.deleteRange(range): Delete history in a time range')
  .requiredOption('--range <json>', 'range JSON, e.g. {"startTime":1,"endTime":2}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callHistoryMethod('deleteRange', options))

browserHistory
  .command('delete-url')
  .description('chrome.history.deleteUrl(details): Delete a specific URL from history')
  .requiredOption('--details <json>', 'details JSON, e.g. {"url":"https://example.com"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callHistoryMethod('deleteUrl', options))

browserHistory
  .command('get-visits')
  .description('chrome.history.getVisits(details): Get visit list for a URL')
  .requiredOption('--details <json>', 'details JSON, e.g. {"url":"https://example.com"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callHistoryMethod('getVisits', options))

browserHistory
  .command('search')
  .description('chrome.history.search(query): Search browsing history')
  .requiredOption('--query <json>', 'query JSON, e.g. {"text":"example","maxResults":10}')
  .option('--table', 'Render a boxed TUI-style table output')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .addHelpText('after', `
Query fields:
  text        keyword; use "" to match all
  startTime   unix ms (inclusive)
  endTime     unix ms (inclusive)
  maxResults  max rows
Examples:
  extension-cli history search --query '{"text":"github","maxResults":20}'
  extension-cli history search --query '{"text":"","startTime":1704067200000,"endTime":1706745600000,"maxResults":500}'
  extension-cli history search --query '{"text":"openai","maxResults":20}' --table
`)
  .action(async options => {
    try {
      const args = buildHistoryMethodArgs('search', options)
      const data = await browserHistoryMethod('search', args)
      if (options.table) {
        console.log(renderHistorySearchTable(data))
        return
      }
      printResult({ method: 'search', args, data })
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserHistory
  .command('methods')
  .description('List all integrated chrome.history methods')
  .action(() => {
    printResult({ count: HISTORY_METHOD_NAMES.length, methods: formatMethodNames(HISTORY_METHOD_NAMES) })
  })

browserHistory
  .command('events')
  .description('Read bridged chrome.history events from extension -> daemon')
  .option('--since <ms>', 'Only events after this unix ms timestamp', value =>
    parseNumberOption(value, '--since'))
  .option('--limit <n>', 'Max returned events', value =>
    parseNumberOption(value, '--limit'))
  .option('--type <name>', 'Filter by event name, e.g. onVisited')
  .option('--follow', 'Stream continuously for new events')
  .option('--transport <transport>', 'Stream transport for --follow: ws|sse', 'ws')
  .action(async options => {
    try {
      if (!options.follow) {
        const data = await browserTabsEvents({
          since: options.since,
          limit: options.limit,
          type: options.type,
          namespace: 'history',
          requireBridge: true,
        })
        printResult(data)
        return
      }

      let closedBySignal = false
      const stream = await browserTabsEventsStream({
        transport: options.transport,
        type: options.type,
        namespace: 'history',
        onReady: () => {},
        onEvent: event => {
          printResult(event)
        },
        onError: error => {
          if (closedBySignal) return
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        },
      })

      const closeStream = () => {
        closedBySignal = true
        stream.close()
      }

      process.on('SIGINT', () => {
        closeStream()
        process.exit(0)
      })
      process.on('SIGTERM', () => {
        closeStream()
        process.exit(0)
      })

      await new Promise(() => {})
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserHistory
  .command('events-clear')
  .description('Clear buffered bridged events from daemon')
  .action(async () => {
    try {
      const ok = await browserTabsEventsClear()
      printResult({ ok })
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserSessions
  .command('get-recently-closed')
  .description('chrome.sessions.getRecentlyClosed(filter?): Get recently closed tabs/windows')
  .option('--filter <json>', 'filter JSON, e.g. {"maxResults":10}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .addHelpText('after', `
Filter notes:
  Currently useful field is maxResults.
Examples:
  extension-cli sessions get-recently-closed --filter '{"maxResults":10}'
  extension-cli sessions get-recently-closed --filter '{"maxResults":50}'
`)
  .action(async options => callSessionsMethod('getRecentlyClosed', options))

browserSessions
  .command('get-devices')
  .description('chrome.sessions.getDevices(filter?): Get synced sessions from other devices')
  .option('--filter <json>', 'filter JSON, e.g. {"maxResults":10}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .addHelpText('after', `
Filter notes:
  maxResults limits returned sessions per device.
Examples:
  extension-cli sessions get-devices --filter '{"maxResults":5}'
  extension-cli sessions get-devices --filter '{"maxResults":20}'
`)
  .action(async options => callSessionsMethod('getDevices', options))

browserSessions
  .command('restore')
  .description('chrome.sessions.restore(sessionId?): Restore a closed session')
  .argument('[sessionId]', 'Session ID')
  .option('--session-id <id>', 'Session ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (sessionId, options) => callSessionsMethod('restore', { ...options, _sessionId: sessionId }))

browserSessions
  .command('set-tab-value')
  .description('chrome.sessions.setTabValue(tabId, key, value): Set tab-scoped value')
  .argument('<tabId>', 'Tab ID')
  .argument('<key>', 'Value key')
  .argument('<value>', 'JSON or string value')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--key <key>', 'Value key (same as positional)')
  .option('--value <value>', 'Value (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, key, value, options) =>
    callSessionsMethod('setTabValue', { ...options, _tabId: tabId, _key: key, _value: value }))

browserSessions
  .command('get-tab-value')
  .description('chrome.sessions.getTabValue(tabId, key): Get tab-scoped value')
  .argument('<tabId>', 'Tab ID')
  .argument('<key>', 'Value key')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--key <key>', 'Value key (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, key, options) =>
    callSessionsMethod('getTabValue', { ...options, _tabId: tabId, _key: key }))

browserSessions
  .command('remove-tab-value')
  .description('chrome.sessions.removeTabValue(tabId, key): Remove tab-scoped value')
  .argument('<tabId>', 'Tab ID')
  .argument('<key>', 'Value key')
  .option('--tab-id <id>', 'Tab ID (same as positional)')
  .option('--key <key>', 'Value key (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (tabId, key, options) =>
    callSessionsMethod('removeTabValue', { ...options, _tabId: tabId, _key: key }))

browserSessions
  .command('set-window-value')
  .description('chrome.sessions.setWindowValue(windowId, key, value): Set window-scoped value')
  .argument('<windowId>', 'Window ID')
  .argument('<key>', 'Value key')
  .argument('<value>', 'JSON or string value')
  .option('--window-id <id>', 'Window ID (same as positional)')
  .option('--key <key>', 'Value key (same as positional)')
  .option('--value <value>', 'Value (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (windowId, key, value, options) =>
    callSessionsMethod('setWindowValue', { ...options, _windowId: windowId, _key: key, _value: value }))

browserSessions
  .command('get-window-value')
  .description('chrome.sessions.getWindowValue(windowId, key): Get window-scoped value')
  .argument('<windowId>', 'Window ID')
  .argument('<key>', 'Value key')
  .option('--window-id <id>', 'Window ID (same as positional)')
  .option('--key <key>', 'Value key (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (windowId, key, options) =>
    callSessionsMethod('getWindowValue', { ...options, _windowId: windowId, _key: key }))

browserSessions
  .command('remove-window-value')
  .description('chrome.sessions.removeWindowValue(windowId, key): Remove window-scoped value')
  .argument('<windowId>', 'Window ID')
  .argument('<key>', 'Value key')
  .option('--window-id <id>', 'Window ID (same as positional)')
  .option('--key <key>', 'Value key (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (windowId, key, options) =>
    callSessionsMethod('removeWindowValue', { ...options, _windowId: windowId, _key: key }))

browserSessions
  .command('methods')
  .description('List all integrated chrome.sessions methods')
  .action(() => {
    printResult({ count: SESSIONS_METHOD_NAMES.length, methods: formatMethodNames(SESSIONS_METHOD_NAMES) })
  })

browserSessions
  .command('events')
  .description('Read bridged chrome.sessions events from extension -> daemon')
  .option('--since <ms>', 'Only events after this unix ms timestamp', value =>
    parseNumberOption(value, '--since'))
  .option('--limit <n>', 'Max returned events', value =>
    parseNumberOption(value, '--limit'))
  .option('--type <name>', 'Filter by event name, e.g. onChanged')
  .option('--follow', 'Stream continuously for new events')
  .option('--transport <transport>', 'Stream transport for --follow: ws|sse', 'ws')
  .action(async options => {
    try {
      if (!options.follow) {
        const data = await browserTabsEvents({
          since: options.since,
          limit: options.limit,
          type: options.type,
          namespace: 'sessions',
          requireBridge: true,
        })
        printResult(data)
        return
      }

      let closedBySignal = false
      const stream = await browserTabsEventsStream({
        transport: options.transport,
        type: options.type,
        namespace: 'sessions',
        onReady: () => {},
        onEvent: event => {
          printResult(event)
        },
        onError: error => {
          if (closedBySignal) return
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        },
      })

      const closeStream = () => {
        closedBySignal = true
        stream.close()
      }

      process.on('SIGINT', () => {
        closeStream()
        process.exit(0)
      })
      process.on('SIGTERM', () => {
        closeStream()
        process.exit(0)
      })

      await new Promise(() => {})
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserSessions
  .command('events-clear')
  .description('Clear buffered bridged events from daemon')
  .action(async () => {
    try {
      const ok = await browserTabsEventsClear()
      printResult({ ok })
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserBookmarks
  .command('sync')
  .description('Sync chrome.bookmarks into local cache (~/.extension-cli/sync)')
  .option('--full', 'Full refresh (replace cache instead of incremental merge)')
  .action(async options => {
    await syncBookmarksSnapshot(options)
  })

browserBookmarks
  .command('viz')
  .description('Visual dashboard for chrome.bookmarks')
  .option('--json', 'Raw metrics JSON output')
  .option('--group-by <unit>', 'Time grouping in dashboard: month|year', value => parseGroupByOption(value, '--group-by'), 'month')
  .action(async options => {
    await callFt(metrics => renderFtViz(metrics, { groupBy: options.groupBy }), options)
  })

browserBookmarks
  .command('stats')
  .description('Aggregate stats for chrome.bookmarks')
  .option('--json', 'Raw metrics JSON output')
  .action(async options => {
    await callFt(renderFtStats, options)
  })

browserBookmarks
  .command('categories')
  .description('Category distribution over bookmarks')
  .option('--limit <n>', 'Max rows', value => parsePositiveIntOption(value, '--limit'), 15)
  .option('--json', 'Raw metrics JSON output')
  .action(async options => {
    await callFt(metrics => renderFtCategories(metrics, options.limit), options)
  })

browserBookmarks
  .command('domains')
  .description('Domain distribution over bookmarks')
  .option('--limit <n>', 'Max rows', value => parsePositiveIntOption(value, '--limit'), 15)
  .option('--json', 'Raw metrics JSON output')
  .action(async options => {
    await callFt(metrics => renderFtDomains(metrics, options.limit), options)
  })

browserBookmarks
  .command('classify')
  .description('Classify bookmarks by category (rule-based)')
  .option('--limit <n>', 'Max rows', value => parsePositiveIntOption(value, '--limit'), 30)
  .option('--json', 'Raw metrics JSON output')
  .action(async options => {
    await callFt(metrics => renderFtClassify(metrics, options.limit), options)
  })

browserBookmarks
  .command('create')
  .description('chrome.bookmarks.create(bookmark): Create a bookmark/folder')
  .requiredOption('--bookmark <json>', 'bookmark JSON, e.g. {"title":"X","url":"https://x.com"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callBookmarksMethod('create', options))

browserBookmarks
  .command('get')
  .description('chrome.bookmarks.get(idOrIdList): Get bookmark node(s)')
  .requiredOption('--ids <ids>', 'IDs as single/comma-list/JSON-array')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .addHelpText('after', `
ID formats:
  single id:      --ids 123
  comma list:     --ids 123,456,789
  JSON array:     --ids '["123","456"]'
Examples:
  extension-cli bookmarks get --ids 123
  extension-cli bookmarks get --ids 123,456
`)
  .action(async options => callBookmarksMethod('get', options))

browserBookmarks
  .command('get-children')
  .description('chrome.bookmarks.getChildren(id): Get children of a folder')
  .argument('<id>', 'Bookmark node ID')
  .option('--id <id>', 'Bookmark node ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (id, options) => callBookmarksMethod('getChildren', { ...options, _id: id }))

browserBookmarks
  .command('get-recent')
  .description('chrome.bookmarks.getRecent(numberOfItems): Get recently added bookmarks')
  .argument('<numberOfItems>', 'Number of items')
  .option('--number-of-items <n>', 'Number of items (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (numberOfItems, options) =>
    callBookmarksMethod('getRecent', { ...options, numberOfItems: options.numberOfItems ?? numberOfItems }))

browserBookmarks
  .command('get-tree')
  .description('chrome.bookmarks.getTree(): Get the full bookmarks tree')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callBookmarksMethod('getTree', options))

browserBookmarks
  .command('get-sub-tree')
  .description('chrome.bookmarks.getSubTree(id): Get subtree under a node')
  .argument('<id>', 'Bookmark node ID')
  .option('--id <id>', 'Bookmark node ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (id, options) => callBookmarksMethod('getSubTree', { ...options, _id: id }))

browserBookmarks
  .command('move')
  .description('chrome.bookmarks.move(id, destination): Move a bookmark node')
  .argument('<id>', 'Bookmark node ID')
  .option('--id <id>', 'Bookmark node ID (same as positional)')
  .requiredOption('--destination <json>', 'destination JSON, e.g. {"parentId":"2","index":0}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (id, options) => callBookmarksMethod('move', { ...options, _id: id }))

browserBookmarks
  .command('remove')
  .description('chrome.bookmarks.remove(id): Remove a bookmark node')
  .argument('<id>', 'Bookmark node ID')
  .option('--id <id>', 'Bookmark node ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (id, options) => callBookmarksMethod('remove', { ...options, _id: id }))

browserBookmarks
  .command('remove-tree')
  .description('chrome.bookmarks.removeTree(id): Remove a bookmark folder tree')
  .argument('<id>', 'Bookmark node ID')
  .option('--id <id>', 'Bookmark node ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (id, options) => callBookmarksMethod('removeTree', { ...options, _id: id }))

browserBookmarks
  .command('search')
  .description('chrome.bookmarks.search(query): Search bookmarks')
  .option('--query <json>', 'query as JSON object/string')
  .option('--query-text <text>', 'query as plain text')
  .option('--table', 'Render a boxed TUI-style table output')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .addHelpText('after', `
Search modes:
  --query-text uses plain keyword search.
  --query accepts JSON (e.g. {"title":"AI"} or {"url":"github.com"}).
Examples:
  extension-cli bookmarks search --query-text "openai"
  extension-cli bookmarks search --query '{"title":"Docs"}'
  extension-cli bookmarks search --query '{"url":"github.com"}'
  extension-cli bookmarks search --query-text "openai" --table
`)
  .action(async options => {
    try {
      const args = buildBookmarksMethodArgs('search', options)
      const data = await browserBookmarksMethod('search', args)
      if (options.table) {
        console.log(renderBookmarksSearchTable(data))
        return
      }
      printResult({ method: 'search', args, data })
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserBookmarks
  .command('update')
  .description('chrome.bookmarks.update(id, changes): Update a bookmark node')
  .argument('<id>', 'Bookmark node ID')
  .option('--id <id>', 'Bookmark node ID (same as positional)')
  .requiredOption('--changes <json>', 'changes JSON, e.g. {"title":"New Title"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (id, options) => callBookmarksMethod('update', { ...options, _id: id }))

browserBookmarks
  .command('methods')
  .description('List all integrated chrome.bookmarks methods')
  .action(() => {
    printResult({ count: BOOKMARKS_METHOD_NAMES.length, methods: formatMethodNames(BOOKMARKS_METHOD_NAMES) })
  })

browserBookmarks
  .command('events')
  .description('Read bridged chrome.bookmarks events from extension -> daemon')
  .option('--since <ms>', 'Only events after this unix ms timestamp', value =>
    parseNumberOption(value, '--since'))
  .option('--limit <n>', 'Max returned events', value =>
    parseNumberOption(value, '--limit'))
  .option('--type <name>', 'Filter by event name, e.g. onCreated')
  .option('--follow', 'Stream continuously for new events')
  .option('--transport <transport>', 'Stream transport for --follow: ws|sse', 'ws')
  .action(async options => {
    try {
      if (!options.follow) {
        const data = await browserTabsEvents({
          since: options.since,
          limit: options.limit,
          type: options.type,
          namespace: 'bookmarks',
          requireBridge: true,
        })
        printResult(data)
        return
      }

      let closedBySignal = false
      const stream = await browserTabsEventsStream({
        transport: options.transport,
        type: options.type,
        namespace: 'bookmarks',
        onReady: () => {},
        onEvent: event => {
          printResult(event)
        },
        onError: error => {
          if (closedBySignal) return
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        },
      })

      const closeStream = () => {
        closedBySignal = true
        stream.close()
      }

      process.on('SIGINT', () => {
        closeStream()
        process.exit(0)
      })
      process.on('SIGTERM', () => {
        closeStream()
        process.exit(0)
      })

      await new Promise(() => {})
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserBookmarks
  .command('events-clear')
  .description('Clear buffered bridged events from daemon')
  .action(async () => {
    try {
      const ok = await browserTabsEventsClear()
      printResult({ ok })
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  })

browserCookies
  .command('get')
  .description('chrome.cookies.get(details): Get a single cookie')
  .requiredOption('--details <json>', 'details JSON, e.g. {"url":"https://example.com","name":"sid"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callCookiesMethod('get', options))

browserCookies
  .command('get-all')
  .description('chrome.cookies.getAll(details?): Get matching cookies')
  .option('--details <json>', 'details JSON, e.g. {"domain":"example.com"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callCookiesMethod('getAll', options))

browserCookies
  .command('get-all-cookie-stores')
  .description('chrome.cookies.getAllCookieStores(): List cookie stores')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callCookiesMethod('getAllCookieStores', options))

browserCookies
  .command('set')
  .description('chrome.cookies.set(details): Set a cookie')
  .requiredOption('--details <json>', 'details JSON, e.g. {"url":"https://example.com","name":"sid","value":"x"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callCookiesMethod('set', options))

browserCookies
  .command('remove')
  .description('chrome.cookies.remove(details): Remove a cookie')
  .requiredOption('--details <json>', 'details JSON, e.g. {"url":"https://example.com","name":"sid"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callCookiesMethod('remove', options))

browserCookies
  .command('methods')
  .description('List all integrated chrome.cookies methods')
  .action(() => {
    printResult({ count: COOKIES_METHOD_NAMES.length, methods: formatMethodNames(COOKIES_METHOD_NAMES) })
  })

registerNamespaceEventsCommands(browserCookies, 'cookies', 'onChanged')

browserDownloads
  .command('download')
  .description('chrome.downloads.download(options): Start a download')
  .requiredOption('--options <json>', 'options JSON, e.g. {"url":"https://example.com/file.zip"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callDownloadsMethod('download', options))

browserDownloads
  .command('search')
  .description('chrome.downloads.search(query?): Search downloads')
  .option('--query <json>', 'query JSON, e.g. {"query":["example"],"limit":20}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callDownloadsMethod('search', options))

browserDownloads
  .command('erase')
  .description('chrome.downloads.erase(query): Erase downloads from history')
  .requiredOption('--query <json>', 'query JSON, e.g. {"state":"complete"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callDownloadsMethod('erase', options))

browserDownloads
  .command('get-file-icon')
  .description('chrome.downloads.getFileIcon(downloadId, options?): Get file icon URL')
  .argument('<downloadId>', 'Download ID')
  .option('--download-id <id>', 'Download ID (same as positional)')
  .option('--icon-options <json>', 'options JSON, e.g. {"size":32}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (downloadId, options) => callDownloadsMethod('getFileIcon', { ...options, _downloadId: downloadId }))

browserDownloads
  .command('accept-danger')
  .description('chrome.downloads.acceptDanger(downloadId): Accept dangerous download')
  .argument('<downloadId>', 'Download ID')
  .option('--download-id <id>', 'Download ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (downloadId, options) => callDownloadsMethod('acceptDanger', { ...options, _downloadId: downloadId }))

browserDownloads
  .command('cancel')
  .description('chrome.downloads.cancel(downloadId): Cancel a download')
  .argument('<downloadId>', 'Download ID')
  .option('--download-id <id>', 'Download ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (downloadId, options) => callDownloadsMethod('cancel', { ...options, _downloadId: downloadId }))

browserDownloads
  .command('open')
  .description('chrome.downloads.open(downloadId): Open downloaded file')
  .argument('<downloadId>', 'Download ID')
  .option('--download-id <id>', 'Download ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (downloadId, options) => callDownloadsMethod('open', { ...options, _downloadId: downloadId }))

browserDownloads
  .command('pause')
  .description('chrome.downloads.pause(downloadId): Pause a download')
  .argument('<downloadId>', 'Download ID')
  .option('--download-id <id>', 'Download ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (downloadId, options) => callDownloadsMethod('pause', { ...options, _downloadId: downloadId }))

browserDownloads
  .command('remove-file')
  .description('chrome.downloads.removeFile(downloadId): Remove downloaded file')
  .argument('<downloadId>', 'Download ID')
  .option('--download-id <id>', 'Download ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (downloadId, options) => callDownloadsMethod('removeFile', { ...options, _downloadId: downloadId }))

browserDownloads
  .command('resume')
  .description('chrome.downloads.resume(downloadId): Resume a download')
  .argument('<downloadId>', 'Download ID')
  .option('--download-id <id>', 'Download ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (downloadId, options) => callDownloadsMethod('resume', { ...options, _downloadId: downloadId }))

browserDownloads
  .command('show')
  .description('chrome.downloads.show(downloadId): Show download in folder')
  .argument('<downloadId>', 'Download ID')
  .option('--download-id <id>', 'Download ID (same as positional)')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async (downloadId, options) => callDownloadsMethod('show', { ...options, _downloadId: downloadId }))

browserDownloads
  .command('show-default-folder')
  .description('chrome.downloads.showDefaultFolder(): Open default downloads folder')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callDownloadsMethod('showDefaultFolder', options))

browserDownloads
  .command('methods')
  .description('List all integrated chrome.downloads methods')
  .action(() => {
    printResult({ count: DOWNLOADS_METHOD_NAMES.length, methods: formatMethodNames(DOWNLOADS_METHOD_NAMES) })
  })

registerNamespaceEventsCommands(browserDownloads, 'downloads', 'onChanged')

browserStorage
  .command('local-get')
  .description('chrome.storage.local.get(keys?): Get local storage values')
  .option('--keys <json>', 'keys JSON, e.g. "token" or ["a","b"]')
  .option('--key <key>', 'single key shortcut')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('local.get', options))

browserStorage
  .command('local-set')
  .description('chrome.storage.local.set(items): Set local storage values')
  .requiredOption('--items <json>', 'items JSON object, e.g. {"token":"abc"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('local.set', options))

browserStorage
  .command('local-remove')
  .description('chrome.storage.local.remove(keys): Remove local storage values')
  .option('--keys <json>', 'keys JSON, e.g. "token" or ["a","b"]')
  .option('--key <key>', 'single key shortcut')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('local.remove', options))

browserStorage
  .command('local-clear')
  .description('chrome.storage.local.clear(): Clear local storage')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('local.clear', options))

browserStorage
  .command('local-bytes')
  .description('chrome.storage.local.getBytesInUse(keys?): Get local storage usage')
  .option('--keys <json>', 'keys JSON, e.g. "token" or ["a","b"]')
  .option('--key <key>', 'single key shortcut')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('local.getBytesInUse', options))

browserStorage
  .command('sync-get')
  .description('chrome.storage.sync.get(keys?): Get sync storage values')
  .option('--keys <json>', 'keys JSON, e.g. "token" or ["a","b"]')
  .option('--key <key>', 'single key shortcut')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('sync.get', options))

browserStorage
  .command('sync-set')
  .description('chrome.storage.sync.set(items): Set sync storage values')
  .requiredOption('--items <json>', 'items JSON object, e.g. {"token":"abc"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('sync.set', options))

browserStorage
  .command('sync-remove')
  .description('chrome.storage.sync.remove(keys): Remove sync storage values')
  .option('--keys <json>', 'keys JSON, e.g. "token" or ["a","b"]')
  .option('--key <key>', 'single key shortcut')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('sync.remove', options))

browserStorage
  .command('sync-clear')
  .description('chrome.storage.sync.clear(): Clear sync storage')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('sync.clear', options))

browserStorage
  .command('sync-bytes')
  .description('chrome.storage.sync.getBytesInUse(keys?): Get sync storage usage')
  .option('--keys <json>', 'keys JSON, e.g. "token" or ["a","b"]')
  .option('--key <key>', 'single key shortcut')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('sync.getBytesInUse', options))

browserStorage
  .command('session-get')
  .description('chrome.storage.session.get(keys?): Get session storage values')
  .option('--keys <json>', 'keys JSON, e.g. "token" or ["a","b"]')
  .option('--key <key>', 'single key shortcut')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('session.get', options))

browserStorage
  .command('session-set')
  .description('chrome.storage.session.set(items): Set session storage values')
  .requiredOption('--items <json>', 'items JSON object, e.g. {"token":"abc"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('session.set', options))

browserStorage
  .command('session-remove')
  .description('chrome.storage.session.remove(keys): Remove session storage values')
  .option('--keys <json>', 'keys JSON, e.g. "token" or ["a","b"]')
  .option('--key <key>', 'single key shortcut')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('session.remove', options))

browserStorage
  .command('session-clear')
  .description('chrome.storage.session.clear(): Clear session storage')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('session.clear', options))

browserStorage
  .command('session-bytes')
  .description('chrome.storage.session.getBytesInUse(keys?): Get session storage usage')
  .option('--keys <json>', 'keys JSON, e.g. "token" or ["a","b"]')
  .option('--key <key>', 'single key shortcut')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('session.getBytesInUse', options))

browserStorage
  .command('managed-get')
  .description('chrome.storage.managed.get(keys?): Get managed storage values')
  .option('--keys <json>', 'keys JSON, e.g. "token" or ["a","b"]')
  .option('--key <key>', 'single key shortcut')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('managed.get', options))

browserStorage
  .command('managed-bytes')
  .description('chrome.storage.managed.getBytesInUse(keys?): Get managed storage usage')
  .option('--keys <json>', 'keys JSON, e.g. "token" or ["a","b"]')
  .option('--key <key>', 'single key shortcut')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callStorageMethod('managed.getBytesInUse', options))

browserStorage
  .command('methods')
  .description('List all integrated chrome.storage methods')
  .action(() => {
    printResult({ count: STORAGE_METHOD_NAMES.length, methods: STORAGE_METHOD_NAMES })
  })

registerNamespaceEventsCommands(browserStorage, 'storage', 'onChanged')

browserReadingList
  .command('add-entry')
  .description('chrome.readingList.addEntry(entry): Add a reading list entry')
  .requiredOption('--entry <json>', 'entry JSON, e.g. {"url":"https://example.com","title":"Example","hasBeenRead":false}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callReadingListMethod('addEntry', options))

browserReadingList
  .command('query')
  .description('chrome.readingList.query(query): Query reading list entries')
  .option('--query <json>', 'query JSON, e.g. {"hasBeenRead":false}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callReadingListMethod('query', options))

browserReadingList
  .command('update-entry')
  .description('chrome.readingList.updateEntry(entry): Update reading list entry')
  .requiredOption('--entry <json>', 'entry JSON, e.g. {"url":"https://example.com","hasBeenRead":true}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callReadingListMethod('updateEntry', options))

browserReadingList
  .command('remove-entry')
  .description('chrome.readingList.removeEntry(details): Remove a reading list entry')
  .requiredOption('--details <json>', 'details JSON, e.g. {"url":"https://example.com"}')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callReadingListMethod('removeEntry', options))

browserReadingList
  .command('methods')
  .description('List all integrated chrome.readingList methods')
  .action(() => {
    printResult({ count: READING_LIST_METHOD_NAMES.length, methods: formatMethodNames(READING_LIST_METHOD_NAMES) })
  })

registerNamespaceEventsCommands(browserReadingList, 'readingList', 'onEntryAdded')

browserTopSites
  .command('get')
  .description('chrome.topSites.get(): Get top visited sites')
  .option('--args <json>', 'Raw args JSON array, overrides other flags')
  .action(async options => callTopSitesMethod('get', options))

browserTopSites
  .command('methods')
  .description('List all integrated chrome.topSites methods')
  .action(() => {
    printResult({ count: TOP_SITES_METHOD_NAMES.length, methods: formatMethodNames(TOP_SITES_METHOD_NAMES) })
  })

registerRenderingCommands(program)

program.parseAsync(process.argv)
