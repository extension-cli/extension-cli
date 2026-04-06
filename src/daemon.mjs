#!/usr/bin/env node
import { createServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import {
  DEFAULT_DAEMON_IDLE_TIMEOUT,
  DEFAULT_DAEMON_PORT,
} from './browser/constants.mjs'

const PORT = parseInt(
  process.env.EXTENSION_CLI_DAEMON_PORT ??
    process.env.BROWSERCLI_DAEMON_PORT ??
    process.env.BROWSER_CLI_DAEMON_PORT ??
    String(DEFAULT_DAEMON_PORT),
  10,
)
const IDLE_TIMEOUT = Number(
  process.env.EXTENSION_CLI_DAEMON_TIMEOUT ??
    process.env.BROWSERCLI_DAEMON_TIMEOUT ??
    process.env.BROWSER_CLI_DAEMON_TIMEOUT ??
    DEFAULT_DAEMON_IDLE_TIMEOUT,
)
const MAX_BODY = 1024 * 1024

let extensionWs = null
let extensionVersion = null
const pending = new Map()
const logBuffer = []
const LOG_BUFFER_SIZE = 200
const eventBuffer = []
const EVENT_BUFFER_SIZE = 1000
const sseClients = new Map()
const cliWsClients = new Map()
let lastCliRequestTime = Date.now()
let idleTimer = null

function pushLog(entry) {
  logBuffer.push(entry)
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift()
  }
}

function pushEvent(entry) {
  eventBuffer.push(entry)
  if (eventBuffer.length > EVENT_BUFFER_SIZE) {
    eventBuffer.shift()
  }
  broadcastEvent(entry)
}

function broadcastEvent(entry) {
  const payload = JSON.stringify(entry)
  for (const [res, filter] of sseClients) {
    if (filter?.namespace && filter.namespace !== entry.namespace) continue
    if (filter?.type && filter.type !== entry.name) continue
    try {
      res.write(`event: ${entry.namespace || 'event'}\n`)
      res.write(`data: ${payload}\n\n`)
    } catch {
      sseClients.delete(res)
      try {
        res.end()
      } catch {
        // ignore
      }
    }
  }

  const wsPayload = JSON.stringify({ type: 'event', data: entry })
  for (const [ws, filter] of cliWsClients) {
    if (filter?.namespace && filter.namespace !== entry.namespace) continue
    if (filter?.type && filter.type !== entry.name) continue
    if (ws.readyState !== WebSocket.OPEN) continue
    try {
      ws.send(wsPayload)
    } catch {
      try {
        ws.terminate()
      } catch {
        // ignore
      }
    }
  }
}

function scheduleIdleCheck() {
  if (idleTimer) clearTimeout(idleTimer)
  if (extensionWs?.readyState === WebSocket.OPEN) return

  const elapsed = Date.now() - lastCliRequestTime
  const remaining = Math.max(0, IDLE_TIMEOUT - elapsed)

  idleTimer = setTimeout(() => {
    if (extensionWs?.readyState === WebSocket.OPEN) return
    process.exit(0)
  }, remaining)
}

function onCliRequest() {
  lastCliRequestTime = Date.now()
  scheduleIdleCheck()
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let aborted = false

    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY) {
        aborted = true
        req.destroy()
        reject(new Error('Body too large'))
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (!aborted) resolve(Buffer.concat(chunks).toString('utf8'))
    })

    req.on('error', err => {
      if (!aborted) reject(err)
    })
  })
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

async function handleRequest(req, res) {
  const origin = req.headers.origin
  if (origin && !origin.startsWith('chrome-extension://')) {
    json(res, 403, { ok: false, error: 'Forbidden: cross-origin request blocked' })
    return
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = req.url || '/'
  const pathname = url.split('?')[0]

  if (req.method === 'GET' && pathname === '/ping') {
    json(res, 200, { ok: true })
    return
  }

  if (!req.headers['x-opencli']) {
    json(res, 403, { ok: false, error: 'Forbidden: missing X-OpenCLI header' })
    return
  }

  if (req.method === 'GET' && pathname === '/status') {
    const mem = process.memoryUsage()
    json(res, 200, {
      ok: true,
      pid: process.pid,
      uptime: process.uptime(),
      extensionConnected: extensionWs?.readyState === WebSocket.OPEN,
      extensionVersion,
      pending: pending.size,
      eventsBuffered: eventBuffer.length,
      latestEventAt: eventBuffer[eventBuffer.length - 1]?.ts ?? null,
      sseSubscribers: sseClients.size,
      wsSubscribers: cliWsClients.size,
      lastCliRequestTime,
      memoryMB: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      port: PORT,
    })
    return
  }

  if (req.method === 'GET' && pathname === '/logs') {
    const level = new URL(url, `http://localhost:${PORT}`).searchParams.get('level')
    const filtered = level ? logBuffer.filter(item => item.level === level) : logBuffer
    json(res, 200, { ok: true, logs: filtered })
    return
  }

  if (req.method === 'GET' && pathname === '/events') {
    const params = new URL(url, `http://localhost:${PORT}`).searchParams
    const sinceRaw = params.get('since')
    const limitRaw = params.get('limit')
    const since = sinceRaw === null ? NaN : Number(sinceRaw)
    const limit = limitRaw === null ? NaN : Number(limitRaw)
    const type = params.get('type')
    const namespace = params.get('namespace')

    let events = eventBuffer
    if (Number.isFinite(since)) {
      events = events.filter(item => typeof item?.ts === 'number' && item.ts > since)
    }
    if (type) {
      events = events.filter(item => item?.name === type)
    }
    if (namespace) {
      events = events.filter(item => item?.namespace === namespace)
    }
    if (Number.isFinite(limit) && limit > 0 && events.length > limit) {
      events = events.slice(-limit)
    }

    json(res, 200, {
      ok: true,
      count: events.length,
      events,
      totalBuffered: eventBuffer.length,
      latestEventAt: events[events.length - 1]?.ts ?? null,
    })
    return
  }

  if (req.method === 'GET' && pathname === '/events/stream') {
    onCliRequest()
    const params = new URL(url, `http://localhost:${PORT}`).searchParams
    const type = params.get('type')
    const namespace = params.get('namespace')

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write('event: ready\n')
    res.write('data: {"ok":true}\n\n')

    sseClients.set(res, { type, namespace })

    const keepalive = setInterval(() => {
      try {
        res.write(': ping\n\n')
      } catch {
        clearInterval(keepalive)
      }
    }, 15000)

    req.on('close', () => {
      clearInterval(keepalive)
      sseClients.delete(res)
      try {
        res.end()
      } catch {
        // ignore
      }
    })
    return
  }

  if (req.method === 'DELETE' && pathname === '/logs') {
    logBuffer.length = 0
    json(res, 200, { ok: true })
    return
  }

  if (req.method === 'DELETE' && pathname === '/events') {
    eventBuffer.length = 0
    json(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && pathname === '/shutdown') {
    json(res, 200, { ok: true, message: 'Shutting down' })
    setTimeout(() => shutdown(), 100)
    return
  }

  if (req.method === 'POST' && pathname === '/command') {
    onCliRequest()

    try {
      const body = JSON.parse(await readBody(req))
      if (!body.id) {
        json(res, 400, { ok: false, error: 'Missing command id' })
        return
      }

      if (!extensionWs || extensionWs.readyState !== WebSocket.OPEN) {
        json(res, 503, {
          id: body.id,
          ok: false,
          error: 'Extension not connected. Please install and enable extension-cli extension.',
        })
        return
      }

      const timeoutMs =
        typeof body.timeout === 'number' && body.timeout > 0
          ? body.timeout * 1000
          : 120000

      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(body.id)
          reject(new Error(`Command timeout (${timeoutMs / 1000}s)`))
        }, timeoutMs)

        pending.set(body.id, { resolve, reject, timer })
        extensionWs.send(JSON.stringify(body))
      })

      json(res, 200, result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid request'
      json(
        res,
        message.includes('timeout') ? 408 : 400,
        { ok: false, error: message },
      )
    }

    return
  }

  json(res, 404, { ok: false, error: 'Not found' })
}

const httpServer = createServer((req, res) => {
  handleRequest(req, res).catch(() => {
    res.writeHead(500)
    res.end()
  })
})

const wss = new WebSocketServer({ noServer: true })
const cliWss = new WebSocketServer({ noServer: true })

function handleListenError(err) {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`[extension-cli] daemon already running on 127.0.0.1:${PORT}`)
    process.exit(69)
    return
  }
  console.error('[extension-cli] daemon failed to start:', err)
  process.exit(1)
}

wss.on('connection', ws => {
  extensionWs = ws
  extensionVersion = null
  scheduleIdleCheck()

  let missedPongs = 0
  const heartbeat = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(heartbeat)
      return
    }

    if (missedPongs >= 2) {
      clearInterval(heartbeat)
      ws.terminate()
      return
    }

    missedPongs += 1
    ws.ping()
  }, 15000)

  ws.on('pong', () => {
    missedPongs = 0
  })

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString())

      if (msg.type === 'hello') {
        extensionVersion = typeof msg.version === 'string' ? msg.version : null
        return
      }

      if (msg.type === 'log') {
        pushLog({ level: msg.level, msg: msg.msg, ts: msg.ts || Date.now() })
        return
      }

      if (msg.type === 'event') {
        pushEvent({
          source: 'extension',
          namespace: msg.namespace || 'tabs',
          name: msg.name || 'unknown',
          ts: typeof msg.ts === 'number' ? msg.ts : Date.now(),
          payload: msg.payload ?? {},
        })
        return
      }

      const entry = pending.get(msg.id)
      if (entry) {
        clearTimeout(entry.timer)
        pending.delete(msg.id)
        entry.resolve(msg)
      }
    } catch {
      // ignore malformed message
    }
  })

  const clearConnection = () => {
    clearInterval(heartbeat)
    if (extensionWs === ws) {
      extensionWs = null
      extensionVersion = null

      for (const [, entry] of pending) {
        clearTimeout(entry.timer)
        entry.reject(new Error('Extension disconnected'))
      }
      pending.clear()
      scheduleIdleCheck()
    }
  }

  ws.on('close', clearConnection)
  ws.on('error', clearConnection)
})

cliWss.on('connection', (ws, req) => {
  onCliRequest()
  let type = null
  let namespace = null
  try {
    if (typeof req?.url === 'string') {
      const params = new URL(req.url, `http://localhost:${PORT}`).searchParams
      type = params.get('type')
      namespace = params.get('namespace')
    }
  } catch {
    // ignore
  }

  cliWsClients.set(ws, { type, namespace })
  try {
    ws.send(JSON.stringify({ type: 'ready', ok: true }))
  } catch {
    // ignore
  }

  const cleanup = () => {
    cliWsClients.delete(ws)
  }

  ws.on('close', cleanup)
  ws.on('error', cleanup)
})

httpServer.on('upgrade', (req, socket, head) => {
  const url = req.url || '/'
  const pathname = url.split('?')[0]
  const origin = req.headers.origin

  if (pathname === '/ext') {
    if (origin && !origin.startsWith('chrome-extension://')) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit('connection', ws, req)
    })
    return
  }

  if (pathname === '/cli') {
    if (origin) {
      socket.destroy()
      return
    }
    cliWss.handleUpgrade(req, socket, head, ws => {
      cliWss.emit('connection', ws, req)
    })
    return
  }

  socket.destroy()
})

function shutdown() {
  for (const [, entry] of pending) {
    clearTimeout(entry.timer)
    entry.reject(new Error('Daemon shutting down'))
  }
  pending.clear()

  try {
    extensionWs?.close()
  } catch {
    // ignore
  }

  for (const [res] of sseClients) {
    try {
      res.end()
    } catch {
      // ignore
    }
  }
  sseClients.clear()

  for (const [ws] of cliWsClients) {
    try {
      ws.close()
    } catch {
      // ignore
    }
  }
  cliWsClients.clear()

  wss.close(() => {
    cliWss.close(() => {
      httpServer.close(() => {
        process.exit(0)
      })
    })
  })
}

httpServer.listen(PORT, '127.0.0.1', () => {
  onCliRequest()
})

httpServer.on('error', err => {
  handleListenError(err)
})

wss.on('error', handleListenError)
cliWss.on('error', handleListenError)

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
