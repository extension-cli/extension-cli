export const WINDOWS_METHOD_NAMES = [
  'create',
  'get',
  'getAll',
  'getCurrent',
  'getLastFocused',
  'remove',
  'update',
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

function requireObject(value, flagName) {
  if (value === undefined) {
    throw new Error(`${flagName} is required`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${flagName} must be a JSON object`)
  }
  return value
}

export function buildWindowsMethodArgs(method, options = {}) {
  if (options.args !== undefined) {
    const parsed = parseJson(options.args, '--args')
    if (!Array.isArray(parsed)) {
      throw new Error('--args must be a JSON array')
    }
    return parsed
  }

  switch (method) {
    case 'create': {
      const createData = parseJson(options.createData, '--create-data') || {}
      return [createData]
    }
    case 'get': {
      const windowId = parseNumber(options.windowId ?? options._windowId, '--window-id')
      if (windowId === undefined) throw new Error('--window-id is required')
      const getInfo = parseJson(options.getInfo, '--get-info')
      return [windowId, getInfo].filter(item => item !== undefined)
    }
    case 'getAll': {
      const getInfo = parseJson(options.getInfo, '--get-info')
      return getInfo === undefined ? [] : [getInfo]
    }
    case 'getCurrent':
    case 'getLastFocused': {
      const getInfo = parseJson(options.getInfo, '--get-info')
      return getInfo === undefined ? [] : [getInfo]
    }
    case 'remove': {
      const windowId = parseNumber(options.windowId ?? options._windowId, '--window-id')
      if (windowId === undefined) throw new Error('--window-id is required')
      return [windowId]
    }
    case 'update': {
      const windowId = parseNumber(options.windowId ?? options._windowId, '--window-id')
      if (windowId === undefined) throw new Error('--window-id is required')
      const updateInfo = requireObject(parseJson(options.updateInfo, '--update-info'), '--update-info')
      return [windowId, updateInfo]
    }
    default:
      throw new Error(`Unsupported windows method: ${method}`)
  }
}

