export const SESSIONS_METHOD_NAMES = [
  'getRecentlyClosed',
  'getDevices',
  'restore',
  'setTabValue',
  'getTabValue',
  'removeTabValue',
  'setWindowValue',
  'getWindowValue',
  'removeWindowValue',
]

function parseJson(value, flagName) {
  if (value === undefined || value === null || value === '') return undefined
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`Invalid JSON for ${flagName}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function parseNumber(value, flagName) {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`${flagName} must be a valid number`)
  }
  return n
}

function parseAny(value) {
  if (value === undefined || value === null) return undefined
  try {
    return JSON.parse(String(value))
  } catch {
    return value
  }
}

export function buildSessionsMethodArgs(method, options = {}) {
  if (options.args !== undefined) {
    const parsed = parseJson(options.args, '--args')
    if (!Array.isArray(parsed)) throw new Error('--args must be a JSON array')
    return parsed
  }

  switch (method) {
    case 'getRecentlyClosed':
    case 'getDevices': {
      const filter = parseJson(options.filter, '--filter')
      return filter === undefined ? [] : [filter]
    }
    case 'restore': {
      const sessionId = options.sessionId ?? options._sessionId
      return sessionId === undefined ? [] : [String(sessionId)]
    }
    case 'setTabValue': {
      const tabId = parseNumber(options.tabId ?? options._tabId, '--tab-id')
      const key = options.key ?? options._key
      if (tabId === undefined) throw new Error('--tab-id is required')
      if (key === undefined) throw new Error('--key is required')
      const value = parseAny(options.value ?? options._value)
      return [tabId, String(key), value]
    }
    case 'getTabValue':
    case 'removeTabValue': {
      const tabId = parseNumber(options.tabId ?? options._tabId, '--tab-id')
      const key = options.key ?? options._key
      if (tabId === undefined) throw new Error('--tab-id is required')
      if (key === undefined) throw new Error('--key is required')
      return [tabId, String(key)]
    }
    case 'setWindowValue': {
      const windowId = parseNumber(options.windowId ?? options._windowId, '--window-id')
      const key = options.key ?? options._key
      if (windowId === undefined) throw new Error('--window-id is required')
      if (key === undefined) throw new Error('--key is required')
      const value = parseAny(options.value ?? options._value)
      return [windowId, String(key), value]
    }
    case 'getWindowValue':
    case 'removeWindowValue': {
      const windowId = parseNumber(options.windowId ?? options._windowId, '--window-id')
      const key = options.key ?? options._key
      if (windowId === undefined) throw new Error('--window-id is required')
      if (key === undefined) throw new Error('--key is required')
      return [windowId, String(key)]
    }
    default:
      throw new Error(`Unsupported sessions method: ${method}`)
  }
}

