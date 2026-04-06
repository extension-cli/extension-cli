import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { EXTENSION_CLI_HOME, RENDERING_AUTH_FILE, validateHttpUrl } from './constants.mjs'

const API_BASE = 'https://api.cloudflare.com/client/v4'
const CRAWL_TERMINAL_STATUSES = new Set([
  'completed',
  'errored',
  'cancelled_by_user',
  'cancelled_due_to_timeout',
  'cancelled_due_to_limits',
])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseIntMaybe(value, name) {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a number`)
  }
  return n
}

function parseJsonMaybe(value, name) {
  if (value === undefined || value === null || value === '') return undefined
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`Invalid JSON in ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function parseJsonFileMaybe(filePath, name) {
  if (!filePath) return undefined
  const content = await fs.readFile(path.resolve(filePath), 'utf8')
  return parseJsonMaybe(content, name)
}

function mergeBodies(...parts) {
  const out = {}
  for (const part of parts) {
    if (!part) continue
    if (!isObject(part)) {
      throw new Error('Body JSON must be an object')
    }
    Object.assign(out, part)
  }
  return out
}

function applyNavigationAndViewportOptions(body, options, withScreenshotOptions = false) {
  const next = { ...body }

  const waitUntil = options.waitUntil
  const timeoutRaw = options.timeout
  const viewportWidthRaw = options.viewportWidth
  const viewportHeightRaw = options.viewportHeight

  if (waitUntil || timeoutRaw !== undefined) {
    next.gotoOptions = { ...(next.gotoOptions || {}) }
    if (waitUntil) {
      next.gotoOptions.waitUntil = waitUntil
    }
    if (timeoutRaw !== undefined) {
      const timeout = Number(timeoutRaw)
      if (!Number.isFinite(timeout) || timeout < 0) {
        throw new Error('--timeout must be a non-negative number (milliseconds)')
      }
      next.gotoOptions.timeout = timeout
    }
  }

  if (viewportWidthRaw !== undefined || viewportHeightRaw !== undefined) {
    next.viewport = { ...(next.viewport || {}) }
    if (viewportWidthRaw !== undefined) {
      const w = Number(viewportWidthRaw)
      if (!Number.isFinite(w) || w <= 0) {
        throw new Error('--viewport-width must be a positive number')
      }
      next.viewport.width = w
    }
    if (viewportHeightRaw !== undefined) {
      const h = Number(viewportHeightRaw)
      if (!Number.isFinite(h) || h <= 0) {
        throw new Error('--viewport-height must be a positive number')
      }
      next.viewport.height = h
    }
  }

  if (withScreenshotOptions && options.fullPage) {
    next.screenshotOptions = { ...(next.screenshotOptions || {}), fullPage: true }
  }

  return next
}

async function loadAuth() {
  try {
    const text = await fs.readFile(RENDERING_AUTH_FILE, 'utf8')
    const parsed = JSON.parse(text)
    if (!parsed.accountId || !parsed.apiToken) {
      throw new Error('Missing credentials in auth file')
    }
    return parsed
  } catch (error) {
    throw new Error(
      `Not logged in. Run: extension-cli rendering login (${error instanceof Error ? error.message : String(error)})`,
    )
  }
}

async function readSavedAuthMaybe() {
  try {
    const text = await fs.readFile(RENDERING_AUTH_FILE, 'utf8')
    const parsed = JSON.parse(text)
    if (!parsed.accountId || !parsed.apiToken) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

async function saveAuth(auth) {
  await fs.mkdir(EXTENSION_CLI_HOME, { recursive: true })
  await fs.writeFile(
    RENDERING_AUTH_FILE,
    JSON.stringify(
      {
        accountId: auth.accountId,
        apiToken: auth.apiToken,
        savedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )
}

export async function getRenderingStatus(options = {}) {
  const auth = await readSavedAuthMaybe()
  const base = {
    loggedIn: !!auth,
    authFile: RENDERING_AUTH_FILE,
    accountId: auth?.accountId ?? null,
    savedAt: auth?.savedAt ?? null,
    tokenConfigured: !!auth?.apiToken,
  }

  if (!auth || !options.verifyToken) {
    return base
  }

  try {
    const verify = await verifyApiToken(auth.apiToken)
    return {
      ...base,
      tokenVerified: true,
      tokenStatus: verify?.status ?? null,
      tokenId: verify?.id ?? null,
    }
  } catch (error) {
    return {
      ...base,
      tokenVerified: false,
      tokenVerifyError: error instanceof Error ? error.message : String(error),
    }
  }
}

async function verifyApiToken(apiToken) {
  const res = await fetch(`${API_BASE}/user/tokens/verify`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  })

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await res.text()
    throw new Error(`Token verify failed: HTTP ${res.status} ${res.statusText} - ${text}`)
  }

  const data = await res.json()
  if (!res.ok || data.success === false) {
    const message = data?.errors?.map(item => item?.message).filter(Boolean).join('; ') || JSON.stringify(data)
    throw new Error(`Token verify failed: ${message}`)
  }

  return data.result
}

function createHeaders(apiToken, hasBody) {
  const headers = {
    Authorization: `Bearer ${apiToken}`,
  }
  if (hasBody) {
    headers['Content-Type'] = 'application/json'
  }
  return headers
}

function withQuery(url, query) {
  if (!query || !isObject(query)) return url
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url
}

async function cfRequest({
  accountId,
  apiToken,
  method = 'POST',
  endpoint,
  body,
  query,
  expectBinary = false,
}) {
  const url = withQuery(
    new URL(`${API_BASE}/accounts/${accountId}/browser-rendering/${endpoint}`),
    query,
  )

  const response = await fetch(url, {
    method,
    headers: createHeaders(apiToken, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const contentType = response.headers.get('content-type') || ''

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Cloudflare API failed (${response.status}): ${text}`)
  }

  if (
    expectBinary ||
    contentType.includes('application/pdf') ||
    contentType.includes('image/') ||
    contentType.includes('application/octet-stream')
  ) {
    const bytes = Buffer.from(await response.arrayBuffer())
    return {
      kind: 'binary',
      bytes,
      contentType,
      headers: Object.fromEntries(response.headers.entries()),
    }
  }

  const text = await response.text()
  const json = text ? JSON.parse(text) : {}

  if (json.success === false) {
    const message =
      json?.errors?.map(item => item?.message).filter(Boolean).join('; ') ||
      JSON.stringify(json)
    throw new Error(`Cloudflare API error: ${message}`)
  }

  return {
    kind: 'json',
    data: json,
    headers: Object.fromEntries(response.headers.entries()),
  }
}

async function ensureUrlOrHtml(url, options) {
  const bodyJson = parseJsonMaybe(options.body, '--body')
  const bodyFileJson = await parseJsonFileMaybe(options.bodyFile, '--body-file')
  const merged = mergeBodies(bodyFileJson, bodyJson)

  if (url) {
    merged.url = validateHttpUrl(url)
  }

  if (!merged.url && !merged.html) {
    throw new Error('You must provide either <url> or body.html')
  }

  return merged
}

async function writeBinaryResult(bytes, defaultExt, outputPath) {
  const resolved = await resolveOutputPath(defaultExt, outputPath)
  await fs.mkdir(path.dirname(resolved), { recursive: true })
  await fs.writeFile(resolved, bytes)
  return resolved
}

async function resolveOutputPath(defaultExt, outputPath) {
  if (!outputPath) {
    return path.resolve(process.cwd(), `rendering-${Date.now()}.${defaultExt}`)
  }

  const resolved = path.resolve(outputPath)
  const looksLikeDirectory =
    outputPath.endsWith(path.sep) || outputPath.endsWith('/')

  if (looksLikeDirectory) {
    await fs.mkdir(resolved, { recursive: true })
    return path.join(resolved, `rendering-${Date.now()}.${defaultExt}`)
  }

  try {
    const stat = await fs.stat(resolved)
    if (stat.isDirectory()) {
      return path.join(resolved, `rendering-${Date.now()}.${defaultExt}`)
    }
  } catch {
    // Path doesn't exist yet; treat as a file path.
  }

  return resolved
}

function extractResult(payload) {
  if (!payload || typeof payload !== 'object') return payload
  if ('result' in payload) return payload.result
  return payload
}

async function ask(question) {
  const rl = readline.createInterface({ input, output })
  try {
    const answer = await rl.question(question)
    return answer.trim()
  } finally {
    rl.close()
  }
}

async function callRendering(endpoint, options = {}) {
  const auth = await loadAuth()
  return cfRequest({
    accountId: auth.accountId,
    apiToken: auth.apiToken,
    ...options,
    endpoint,
  })
}

function printResult(result) {
  if (result === undefined || result === null) return
  if (typeof result === 'string') {
    console.log(result)
    return
  }
  console.log(JSON.stringify(result, null, 2))
}

async function pollCrawlUntilTerminal(auth, jobId, options) {
  const intervalSec = parseIntMaybe(options.pollInterval, '--poll-interval') ?? 5
  const timeoutSec = parseIntMaybe(options.timeout, '--timeout') ?? 300
  const started = Date.now()

  while (true) {
    const probe = await cfRequest({
      accountId: auth.accountId,
      apiToken: auth.apiToken,
      method: 'GET',
      endpoint: `crawl/${jobId}`,
      query: { limit: 1 },
    })

    const result = extractResult(probe.data)
    const status = result?.status

    if (CRAWL_TERMINAL_STATUSES.has(status)) {
      return result
    }

    if (Date.now() - started > timeoutSec * 1000) {
      throw new Error(`Crawl polling timed out after ${timeoutSec}s (last status: ${status})`)
    }

    await new Promise(resolve => setTimeout(resolve, intervalSec * 1000))
  }
}

export function registerRenderingCommands(program) {
  const rendering = program.command('rendering').description('Cloudflare Browser Rendering REST API')

  rendering
    .command('login')
    .description('Save Cloudflare Account ID and API token')
    .option('--account-id <accountId>', 'Cloudflare account ID')
    .option('--api-token <token>', 'Cloudflare API token')
    .action(async options => {
      try {
        const accountId = (options.accountId || (await ask('Cloudflare Account ID: '))).trim()
        const apiToken = (options.apiToken || (await ask('CLOUDFLARE_API_TOKEN: '))).trim()

        if (!accountId) throw new Error('Account ID is required')
        if (!apiToken) throw new Error('API token is required')

        const verify = await verifyApiToken(apiToken)
        await saveAuth({ accountId, apiToken })

        printResult({
          success: true,
          message: 'Logged in and credentials saved',
          accountId,
          tokenStatus: verify?.status,
          tokenId: verify?.id,
          authFile: RENDERING_AUTH_FILE,
        })
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })

  rendering
    .command('logout')
    .description('Remove saved Cloudflare credentials')
    .action(async () => {
      try {
        await fs.rm(RENDERING_AUTH_FILE, { force: true })
        printResult({ success: true, message: 'Logged out', authFile: RENDERING_AUTH_FILE })
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })

  const addBodyOptions = command =>
    command
      .option('--body <json>', 'extra JSON body to merge')
      .option('--body-file <path>', 'path to JSON file for request body')

  addBodyOptions(
    rendering
      .command('content')
      .argument('[url]', 'target URL')
      .description('POST /content: fetch HTML content')
      .action(async (url, options) => {
        try {
          const body = await ensureUrlOrHtml(url, options)
          const result = await callRendering('content', { body })
          printResult(extractResult(result.data))
        } catch (error) {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
          process.exit(1)
        }
      }),
  )

  addBodyOptions(
    rendering
      .command('markdown')
      .argument('[url]', 'target URL')
      .description('POST /markdown: extract Markdown')
      .action(async (url, options) => {
        try {
          const body = await ensureUrlOrHtml(url, options)
          const result = await callRendering('markdown', { body })
          printResult(extractResult(result.data))
        } catch (error) {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
          process.exit(1)
        }
      }),
  )

  addBodyOptions(
    rendering
      .command('links')
      .argument('[url]', 'target URL')
      .description('POST /links: retrieve links from a webpage')
      .action(async (url, options) => {
        try {
          const body = await ensureUrlOrHtml(url, options)
          const result = await callRendering('links', { body })
          printResult(extractResult(result.data))
        } catch (error) {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
          process.exit(1)
        }
      }),
  )

  addBodyOptions(
    rendering
      .command('json')
      .argument('[url]', 'target URL')
      .description('POST /json: structured extraction using AI')
      .option('--prompt <prompt>', 'Extraction prompt')
      .option('--schema <json>', 'JSON schema (string)')
      .option('--schema-file <path>', 'Path to JSON schema file')
      .option(
        '--response-format <json>',
        'Full response_format JSON object',
      )
      .option(
        '--response-format-file <path>',
        'Path to response_format JSON file',
      )
      .action(async (url, options) => {
        try {
          const body = await ensureUrlOrHtml(url, options)
          const schemaFromString = parseJsonMaybe(options.schema, '--schema')
          const schemaFromFile = await parseJsonFileMaybe(options.schemaFile, '--schema-file')
          const responseFormatFromString = parseJsonMaybe(
            options.responseFormat,
            '--response-format',
          )
          const responseFormatFromFile = await parseJsonFileMaybe(
            options.responseFormatFile,
            '--response-format-file',
          )

          if (options.prompt) body.prompt = options.prompt
          if (schemaFromFile !== undefined) {
            body.response_format = {
              type: 'json_schema',
              schema: schemaFromFile,
            }
          }
          if (schemaFromString !== undefined) {
            body.response_format = {
              type: 'json_schema',
              schema: schemaFromString,
            }
          }
          if (responseFormatFromFile !== undefined) {
            body.response_format = responseFormatFromFile
          }
          if (responseFormatFromString !== undefined) {
            body.response_format = responseFormatFromString
          }

          if (!body.prompt && !body.response_format) {
            body.prompt =
              'Extract key structured information from this page and return JSON.'
          }

          const result = await callRendering('json', { body })
          printResult(extractResult(result.data))
        } catch (error) {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
          process.exit(1)
        }
      }),
  )

  addBodyOptions(
    rendering
      .command('scrape')
      .argument('[url]', 'target URL')
      .description('POST /scrape: scrape HTML elements')
      .option('--selector <selector...>', 'CSS selector(s)')
      .action(async (url, options) => {
        try {
          const body = await ensureUrlOrHtml(url, options)
          const selectors = options.selector || []
          if (selectors.length > 0 && !body.elements) {
            body.elements = selectors.map(sel => ({ selector: sel }))
          }

          const result = await callRendering('scrape', { body })
          printResult(extractResult(result.data))
        } catch (error) {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
          process.exit(1)
        }
      }),
  )

  addBodyOptions(
    rendering
      .command('snapshot')
      .argument('[url]', 'target URL')
      .description('POST /snapshot: get HTML content + screenshot (base64)')
      .option('--screenshot-out <path>', 'Write decoded screenshot to file')
      .option('--content-out <path>', 'Write HTML content to file')
      .action(async (url, options) => {
        try {
          const body = await ensureUrlOrHtml(url, options)
          const result = await callRendering('snapshot', { body })
          const payload = extractResult(result.data)

          if (options.contentOut && payload?.content) {
            const resolved = path.resolve(options.contentOut)
            await fs.mkdir(path.dirname(resolved), { recursive: true })
            await fs.writeFile(resolved, payload.content, 'utf8')
          }

          if (options.screenshotOut && payload?.screenshot) {
            const resolved = path.resolve(options.screenshotOut)
            await fs.mkdir(path.dirname(resolved), { recursive: true })
            await fs.writeFile(resolved, Buffer.from(payload.screenshot, 'base64'))
          }

          printResult(payload)
        } catch (error) {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
          process.exit(1)
        }
      }),
  )

  addBodyOptions(
    rendering
      .command('screenshot')
      .argument('[url]', 'target URL')
      .description('POST /screenshot: capture screenshot')
      .option('--out <path>', 'Output image path')
      .option(
        '--wait-until <event>',
        'gotoOptions.waitUntil (e.g. load, domcontentloaded, networkidle0)',
      )
      .option('--timeout <ms>', 'gotoOptions.timeout in milliseconds')
      .option('--viewport-width <px>', 'viewport.width')
      .option('--viewport-height <px>', 'viewport.height')
      .option('--full-page', 'screenshotOptions.fullPage=true')
      .action(async (url, options) => {
        try {
          const body = applyNavigationAndViewportOptions(
            await ensureUrlOrHtml(url, options),
            options,
            true,
          )
          const result = await callRendering('screenshot', { body, expectBinary: true })

          if (result.kind === 'binary') {
            const outPath = await writeBinaryResult(result.bytes, 'png', options.out)
            printResult({
              success: true,
              out: outPath,
              contentType: result.contentType,
            })
            return
          }

          printResult(extractResult(result.data))
        } catch (error) {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
          process.exit(1)
        }
      }),
  )

  addBodyOptions(
    rendering
      .command('pdf')
      .argument('[url]', 'target URL')
      .description('POST /pdf: render PDF')
      .option('--out <path>', 'Output PDF path')
      .option('--output <path>', 'Output PDF path (alias)')
      .option(
        '--wait-until <event>',
        'gotoOptions.waitUntil (e.g. load, domcontentloaded, networkidle0)',
      )
      .option('--timeout <ms>', 'gotoOptions.timeout in milliseconds')
      .option('--viewport-width <px>', 'viewport.width')
      .option('--viewport-height <px>', 'viewport.height')
      .action(async (url, options) => {
        try {
          const body = applyNavigationAndViewportOptions(
            await ensureUrlOrHtml(url, options),
            options,
            false,
          )
          const result = await callRendering('pdf', { body, expectBinary: true })

          if (result.kind === 'binary') {
            const outPath = await writeBinaryResult(
              result.bytes,
              'pdf',
              options.output || options.out,
            )
            printResult({
              success: true,
              out: outPath,
              contentType: result.contentType,
            })
            return
          }

          printResult(extractResult(result.data))
        } catch (error) {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
          process.exit(1)
        }
      }),
  )

  addBodyOptions(
    rendering
      .command('crawl')
      .argument('[url]', 'start URL')
      .description('POST /crawl and optionally poll until completed')
      .option('--wait', 'poll until crawl reaches terminal status', true)
      .option('--no-wait', 'return only crawl job id')
      .option('--poll-interval <seconds>', 'poll interval in seconds', '5')
      .option('--timeout <seconds>', 'poll timeout in seconds', '300')
      .option('--limit <n>', 'result page size when fetching final payload')
      .option('--cursor <cursor>', 'result cursor for pagination')
      .option('--status <status>', 'filter records by URL status')
      .action(async (url, options) => {
        try {
          const body = await ensureUrlOrHtml(url, options)
          const auth = await loadAuth()

          const startResp = await cfRequest({
            accountId: auth.accountId,
            apiToken: auth.apiToken,
            method: 'POST',
            endpoint: 'crawl',
            body,
          })

          const jobId = extractResult(startResp.data)
          if (!options.wait) {
            printResult({ jobId })
            return
          }

          const terminal = await pollCrawlUntilTerminal(auth, jobId, options)
          if (terminal?.status !== 'completed') {
            printResult({ jobId, status: terminal?.status, result: terminal })
            return
          }

          const fullResp = await cfRequest({
            accountId: auth.accountId,
            apiToken: auth.apiToken,
            method: 'GET',
            endpoint: `crawl/${jobId}`,
            query: {
              limit: parseIntMaybe(options.limit, '--limit'),
              cursor: options.cursor,
              status: options.status,
            },
          })

          printResult(extractResult(fullResp.data))
        } catch (error) {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
          process.exit(1)
        }
      }),
  )

  rendering
    .command('crawl-result')
    .argument('<jobId>', 'crawl job id')
    .description('GET /crawl/{jobId}: fetch crawl status/results')
    .option('--limit <n>', 'page size')
    .option('--cursor <cursor>', 'pagination cursor')
    .option('--status <status>', 'queued|completed|disallowed|skipped|errored|cancelled')
    .action(async (jobId, options) => {
      try {
        const result = await callRendering(`crawl/${jobId}`, {
          method: 'GET',
          query: {
            limit: parseIntMaybe(options.limit, '--limit'),
            cursor: options.cursor,
            status: options.status,
          },
        })
        printResult(extractResult(result.data))
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })

  rendering
    .command('crawl-cancel')
    .argument('<jobId>', 'crawl job id')
    .description('DELETE /crawl/{jobId}: cancel an in-progress crawl')
    .action(async jobId => {
      try {
        const result = await callRendering(`crawl/${jobId}`, { method: 'DELETE' })
        printResult(extractResult(result.data))
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })
}
