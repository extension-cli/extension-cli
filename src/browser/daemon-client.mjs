import { DEFAULT_DAEMON_PORT } from './constants.mjs'
import http from 'node:http'
import { WebSocket } from 'ws'

const DAEMON_PORT = parseInt(
  process.env.EXTENSION_CLI_DAEMON_PORT ??
    process.env.BROWSERCLI_DAEMON_PORT ??
    process.env.BROWSER_CLI_DAEMON_PORT ??
    String(DEFAULT_DAEMON_PORT),
  10,
)
const DAEMON_URL = `http://127.0.0.1:${DAEMON_PORT}`
const DAEMON_WS_URL = `ws://127.0.0.1:${DAEMON_PORT}`
const HEADERS = { 'X-OpenCLI': '1' }
let idCounter = 0

function id() {
  return `cmd_${Date.now()}_${++idCounter}`
}

async function request(pathname, init = {}) {
  const { timeout = 2000, headers, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(`${DAEMON_URL}${pathname}`, {
      ...rest,
      headers: { ...HEADERS, ...headers },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchDaemonStatus(options = {}) {
  try {
    const res = await request('/status', { timeout: options.timeout ?? 2000 })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function requestDaemonShutdown(options = {}) {
  try {
    const res = await request('/shutdown', {
      method: 'POST',
      timeout: options.timeout ?? 5000,
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchEvents(options = {}) {
  const params = new URLSearchParams()
  if (options.since !== undefined && options.since !== null) params.set('since', String(options.since))
  if (options.limit !== undefined && options.limit !== null) params.set('limit', String(options.limit))
  if (options.type) params.set('type', String(options.type))
  if (options.namespace) params.set('namespace', String(options.namespace))

  const path = params.toString() ? `/events?${params.toString()}` : '/events'
  const res = await request(path, { timeout: options.timeout ?? 3000 })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to fetch events (${res.status}): ${text}`)
  }
  return res.json()
}

export async function clearEvents(options = {}) {
  const res = await request('/events', {
    method: 'DELETE',
    timeout: options.timeout ?? 3000,
  })
  return res.ok
}

export async function streamEventsSse(options = {}) {
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {}
  const onReady = typeof options.onReady === 'function' ? options.onReady : () => {}
  const onError = typeof options.onError === 'function' ? options.onError : () => {}

  const params = new URLSearchParams()
  if (options.type) params.set('type', String(options.type))
  if (options.namespace) params.set('namespace', String(options.namespace))
  const path = params.toString() ? `/events/stream?${params.toString()}` : '/events/stream'

  const req = http.request({
    host: '127.0.0.1',
    port: DAEMON_PORT,
    path,
    method: 'GET',
    headers: {
      ...HEADERS,
      Accept: 'text/event-stream',
    },
  })

  req.on('response', res => {
    if (res.statusCode !== 200) {
      onError(new Error(`SSE stream failed: HTTP ${res.statusCode}`))
      req.destroy()
      return
    }
    onReady()

    let buffer = ''
    res.on('data', chunk => {
      buffer += chunk.toString('utf8')
      while (true) {
        const idx = buffer.indexOf('\n\n')
        if (idx === -1) break
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)

        let eventName = 'message'
        const dataLines = []
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim()
          if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
        }
        if (eventName === 'ready') continue
        if (dataLines.length === 0) continue
        try {
          onEvent(JSON.parse(dataLines.join('\n')))
        } catch {
          // ignore malformed chunk
        }
      }
    })

    res.on('error', onError)
    res.on('close', () => onError(new Error('SSE stream closed')))
  })

  req.on('error', onError)
  req.end()

  return {
    close() {
      req.destroy()
    },
  }
}

export async function streamEventsWs(options = {}) {
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {}
  const onReady = typeof options.onReady === 'function' ? options.onReady : () => {}
  const onError = typeof options.onError === 'function' ? options.onError : () => {}

  const params = new URLSearchParams()
  if (options.type) params.set('type', String(options.type))
  if (options.namespace) params.set('namespace', String(options.namespace))
  const url = `${DAEMON_WS_URL}/cli${params.toString() ? `?${params.toString()}` : ''}`

  const ws = new WebSocket(url)
  ws.on('open', onReady)
  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg?.type === 'event' && msg?.data) onEvent(msg.data)
    } catch {
      // ignore malformed event
    }
  })
  ws.on('error', onError)
  ws.on('close', () => onError(new Error('WS stream closed')))

  return {
    close() {
      try {
        ws.close()
      } catch {
        // ignore
      }
    },
  }
}

export async function isExtensionConnected() {
  const status = await fetchDaemonStatus()
  return !!status?.extensionConnected
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function sendCommand(action, params = {}) {
  const maxRetries = 4

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const command = { id: id(), action, ...params }
    try {
      const res = await request('/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
        timeout: 30000,
      })
      const result = await res.json()

      if (!result.ok) {
        if (attempt < maxRetries && String(result.error || '').toLowerCase().includes('extension')) {
          await sleep(1500)
          continue
        }
        throw new Error(result.error || 'Daemon command failed')
      }

      return result.data
    } catch (error) {
      const transient = error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')
      if (transient && attempt < maxRetries) {
        await sleep(500)
        continue
      }
      throw error
    }
  }

  throw new Error('Max retries exhausted')
}
