export const STORAGE_METHOD_NAMES = [
  'local.clear',
  'local.get',
  'local.getBytesInUse',
  'local.remove',
  'local.set',
  'managed.get',
  'managed.getBytesInUse',
  'session.clear',
  'session.get',
  'session.getBytesInUse',
  'session.remove',
  'session.set',
  'sync.clear',
  'sync.get',
  'sync.getBytesInUse',
  'sync.remove',
  'sync.set',
]

function parseJson(value, flagName) {
  if (value === undefined || value === null || value === '') return undefined
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`Invalid JSON for ${flagName}: ${error instanceof Error ? error.message : String(error)}`)
  }
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

function parseKeysInput(options = {}) {
  if (options.key !== undefined) return options.key
  if (options.keys === undefined) return undefined
  return parseJson(options.keys, '--keys')
}

export function buildStorageMethodArgs(method, options = {}) {
  if (options.args !== undefined) {
    const parsed = parseJson(options.args, '--args')
    if (!Array.isArray(parsed)) throw new Error('--args must be a JSON array')
    return parsed
  }

  const action = method.split('.')[1]
  switch (action) {
    case 'clear':
      return []
    case 'get': {
      const keys = parseKeysInput(options)
      return keys === undefined ? [] : [keys]
    }
    case 'set': {
      const items = requireObject(parseJson(options.items, '--items'), '--items')
      return [items]
    }
    case 'remove': {
      const keys = parseKeysInput(options)
      if (keys === undefined) throw new Error('Either --key or --keys is required')
      return [keys]
    }
    case 'getBytesInUse': {
      const keys = parseKeysInput(options)
      return keys === undefined ? [] : [keys]
    }
    default:
      throw new Error(`Unsupported storage method: ${method}`)
  }
}
