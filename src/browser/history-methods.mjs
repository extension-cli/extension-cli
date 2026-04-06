export const HISTORY_METHOD_NAMES = [
  'addUrl',
  'deleteAll',
  'deleteRange',
  'deleteUrl',
  'getVisits',
  'search',
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
  if (value === undefined) throw new Error(`${flagName} is required`)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${flagName} must be a JSON object`)
  }
  return value
}

export function buildHistoryMethodArgs(method, options = {}) {
  if (options.args !== undefined) {
    const parsed = parseJson(options.args, '--args')
    if (!Array.isArray(parsed)) throw new Error('--args must be a JSON array')
    return parsed
  }

  switch (method) {
    case 'addUrl':
    case 'deleteUrl':
    case 'getVisits': {
      const details = requireObject(parseJson(options.details, '--details'), '--details')
      return [details]
    }
    case 'deleteAll':
      return []
    case 'deleteRange': {
      const range = requireObject(parseJson(options.range, '--range'), '--range')
      return [range]
    }
    case 'search': {
      const query = requireObject(parseJson(options.query, '--query'), '--query')
      return [query]
    }
    default:
      throw new Error(`Unsupported history method: ${method}`)
  }
}

