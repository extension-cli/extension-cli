import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { DEFAULT_DAEMON_PORT } from './constants.mjs'
import { fetchDaemonStatus, isExtensionConnected } from './daemon-client.mjs'
import { LOG_DIR } from '../constants.mjs'

const DAEMON_SPAWN_TIMEOUT_MS = 10000
const DAEMON_LOG_FILE = path.join(LOG_DIR, 'daemon.log')

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

async function readDaemonLogTail(maxLines = 20) {
  try {
    const text = await fsp.readFile(DAEMON_LOG_FILE, 'utf8')
    const lines = text.trim().split(/\r?\n/)
    return lines.slice(-maxLines).join('\n')
  } catch {
    return ''
  }
}

function spawnDaemonProcess() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const daemonPath = path.resolve(__dirname, '..', 'daemon.mjs')
  ensureLogDir()
  const outFd = fs.openSync(DAEMON_LOG_FILE, 'a')

  try {
    const child = spawn(process.execPath, [daemonPath], {
      detached: true,
      stdio: ['ignore', outFd, outFd],
      env: { ...process.env },
    })
    child.unref()
  } finally {
    try {
      fs.closeSync(outFd)
    } catch {
      // ignore
    }
  }
}

export async function ensureDaemonRunning(timeoutSeconds = 10) {
  const status = await fetchDaemonStatus()
  if (status) return status

  spawnDaemonProcess()
  const deadline = Date.now() + timeoutSeconds * 1000
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 200))
    const next = await fetchDaemonStatus()
    if (next) return next
  }
  const tail = await readDaemonLogTail()
  if (tail) {
    throw new Error(`Failed to start daemon process. daemon.log:\n${tail}`)
  }
  throw new Error('Failed to start daemon process')
}

export async function ensureBridgeReady(timeoutSeconds) {
  const effectiveSeconds = timeoutSeconds && timeoutSeconds > 0
    ? timeoutSeconds
    : Math.ceil(DAEMON_SPAWN_TIMEOUT_MS / 1000)
  const timeoutMs = effectiveSeconds * 1000

  const status = await fetchDaemonStatus()
  if (status?.extensionConnected) return

  if (status) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 200))
      if (await isExtensionConnected()) return
    }
    throw new Error(
      'Daemon is running but extension is not connected. Install/load extension-cli extension in Chrome.',
    )
  }

  spawnDaemonProcess()

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 200))
    if (await isExtensionConnected()) return
  }

  if (await fetchDaemonStatus()) {
    throw new Error(
      'Daemon started but extension is not connected. Open Chrome and enable the extension-cli extension.',
    )
  }

  const tail = await readDaemonLogTail()
  if (tail) {
    throw new Error(
      `Failed to start daemon. Ensure port ${DEFAULT_DAEMON_PORT} is available.\n${tail}`,
    )
  }
  throw new Error(`Failed to start daemon. Ensure port ${DEFAULT_DAEMON_PORT} is available.`)
}
