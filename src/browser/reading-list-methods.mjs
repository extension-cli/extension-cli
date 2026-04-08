export const READING_LIST_METHOD_NAMES = [
  'addEntry',
  'query',
  'removeEntry',
  'updateEntry',
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

export function buildReadingListMethodArgs(method, options = {}) {
  if (options.args !== undefined) {
    const parsed = parseJson(options.args, '--args')
    if (!Array.isArray(parsed)) throw new Error('--args must be a JSON array')
    return parsed
  }

  switch (method) {
    case 'addEntry': {
      const entry = requireObject(parseJson(options.entry, '--entry'), '--entry')
      return [entry]
    }
    case 'query': {
      const query = parseJson(options.query, '--query')
      if (query === undefined) return [{}]
      return [requireObject(query, '--query')]
    }
    case 'removeEntry': {
      const details = requireObject(parseJson(options.details, '--details'), '--details')
      return [details]
    }
    case 'updateEntry': {
      const entry = requireObject(parseJson(options.entry, '--entry'), '--entry')
      return [entry]
    }
    default:
      throw new Error(`Unsupported readingList method: ${method}`)
  }
}
