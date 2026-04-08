export const COOKIES_METHOD_NAMES = [
  'get',
  'getAll',
  'getAllCookieStores',
  'remove',
  'set',
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

export function buildCookiesMethodArgs(method, options = {}) {
  if (options.args !== undefined) {
    const parsed = parseJson(options.args, '--args')
    if (!Array.isArray(parsed)) throw new Error('--args must be a JSON array')
    return parsed
  }

  switch (method) {
    case 'get': {
      const details = requireObject(parseJson(options.details, '--details'), '--details')
      return [details]
    }
    case 'getAll': {
      const details = parseJson(options.details, '--details')
      if (details === undefined) return []
      return [requireObject(details, '--details')]
    }
    case 'getAllCookieStores':
      return []
    case 'remove': {
      const details = requireObject(parseJson(options.details, '--details'), '--details')
      return [details]
    }
    case 'set': {
      const details = requireObject(parseJson(options.details, '--details'), '--details')
      return [details]
    }
    default:
      throw new Error(`Unsupported cookies method: ${method}`)
  }
}
