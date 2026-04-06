import { ensureBridgeReady, ensureDaemonRunning } from './browser/bridge.mjs'
import {
  clearEvents,
  fetchDaemonStatus,
  fetchEvents,
  requestDaemonShutdown,
  sendCommand,
  streamEventsSse,
  streamEventsWs,
} from './browser/daemon-client.mjs'

export async function daemonStatus() {
  const status = await fetchDaemonStatus()
  if (!status) {
    return { running: false }
  }
  return {
    running: true,
    extensionConnected: !!status.extensionConnected,
    extensionVersion: status.extensionVersion,
    pid: status.pid,
    uptimeSeconds: status.uptime,
    memoryMB: status.memoryMB,
    port: status.port,
    eventsBuffered: status.eventsBuffered,
    latestEventAt: status.latestEventAt,
    sseSubscribers: status.sseSubscribers,
    wsSubscribers: status.wsSubscribers,
  }
}

export async function daemonStop() {
  const ok = await requestDaemonShutdown()
  return { stopped: ok }
}

export async function daemonStart() {
  const status = await ensureDaemonRunning(10)
  return {
    started: true,
    extensionConnected: !!status?.extensionConnected,
    daemon: status,
  }
}

export async function browserTabsQuery(query = {}) {
  await ensureBridgeReady()
  return sendCommand('tabs-query', { query })
}

export async function browserTabsMethod(method, args = []) {
  await ensureBridgeReady()
  try {
    return await sendCommand('tabs-method', { method, args })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unknown action: tabs-method')) {
      throw new Error(
        'Connected extension is outdated (missing tabs-method). Rebuild/reload extension-cli extension and restart daemon.',
      )
    }
    throw error
  }
}

export async function browserTabGroupsMethod(method, args = []) {
  await ensureBridgeReady()
  try {
    return await sendCommand('tab-groups-method', { method, args })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unknown action: tab-groups-method')) {
      throw new Error(
        'Connected extension is outdated (missing tab-groups-method). Rebuild/reload extension-cli extension and restart daemon.',
      )
    }
    throw error
  }
}

export async function browserWindowsMethod(method, args = []) {
  await ensureBridgeReady()
  try {
    return await sendCommand('windows-method', { method, args })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unknown action: windows-method')) {
      throw new Error(
        'Connected extension is outdated (missing windows-method). Rebuild/reload extension-cli extension and restart daemon.',
      )
    }
    throw error
  }
}

export async function browserHistoryMethod(method, args = []) {
  await ensureBridgeReady()
  try {
    return await sendCommand('history-method', { method, args })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unknown action: history-method')) {
      throw new Error(
        'Connected extension is outdated (missing history-method). Rebuild/reload extension-cli extension and restart daemon.',
      )
    }
    throw error
  }
}

export async function browserSessionsMethod(method, args = []) {
  await ensureBridgeReady()
  try {
    return await sendCommand('sessions-method', { method, args })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unknown action: sessions-method')) {
      throw new Error(
        'Connected extension is outdated (missing sessions-method). Rebuild/reload extension-cli extension and restart daemon.',
      )
    }
    throw error
  }
}

export async function browserBookmarksMethod(method, args = []) {
  await ensureBridgeReady()
  try {
    return await sendCommand('bookmarks-method', { method, args })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unknown action: bookmarks-method')) {
      throw new Error(
        'Connected extension is outdated (missing bookmarks-method). Rebuild/reload extension-cli extension and restart daemon.',
      )
    }
    throw error
  }
}

export async function browserPermissionsContains(permissions = []) {
  await ensureBridgeReady()
  try {
    return await sendCommand('permissions-method', { permissionOp: 'contains', permissions })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unknown action: permissions-method')) {
      throw new Error(
        'Connected extension is outdated (missing permissions-method). Rebuild/reload extension-cli extension and restart daemon.',
      )
    }
    throw error
  }
}

export async function browserPermissionsRequest(permissions = []) {
  await ensureBridgeReady()
  try {
    return await sendCommand('permissions-method', { permissionOp: 'request', permissions })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unknown action: permissions-method')) {
      throw new Error(
        'Connected extension is outdated (missing permissions-method). Rebuild/reload extension-cli extension and restart daemon.',
      )
    }
    throw error
  }
}

export async function browserPermissionsRemove(permissions = []) {
  await ensureBridgeReady()
  try {
    return await sendCommand('permissions-method', { permissionOp: 'remove', permissions })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unknown action: permissions-method')) {
      throw new Error(
        'Connected extension is outdated (missing permissions-method). Rebuild/reload extension-cli extension and restart daemon.',
      )
    }
    throw error
  }
}

export async function browserTabsEvents(options = {}) {
  if (options.requireBridge) {
    await ensureBridgeReady()
  } else {
    await ensureDaemonRunning(5)
  }
  return fetchEvents(options)
}

export async function browserTabsEventsClear() {
  await ensureDaemonRunning(5)
  return clearEvents()
}

export async function browserTabsEventsStream(options = {}) {
  await ensureDaemonRunning(5)
  const transport = String(options.transport || 'ws').toLowerCase()
  if (transport === 'sse') return streamEventsSse(options)
  if (transport === 'ws') return streamEventsWs(options)
  throw new Error(`Unsupported stream transport: ${transport}`)
}
