export const BOOKMARKS_METHOD_NAMES = [
  'create',
  'get',
  'getChildren',
  'getRecent',
  'getTree',
  'getSubTree',
  'move',
  'remove',
  'removeTree',
  'search',
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
  if (value === undefined) throw new Error(`${flagName} is required`)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${flagName} must be a JSON object`)
  }
  return value
}

function parseIds(value, flagName) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${flagName} is required`)
  }
  const text = String(value).trim()
  if (!text) throw new Error(`${flagName} is required`)
  if (text.startsWith('[')) {
    const arr = parseJson(text, flagName)
    if (!Array.isArray(arr)) throw new Error(`${flagName} must be a JSON array`)
    return arr.map(v => String(v))
  }
  if (text.includes(',')) return text.split(',').map(v => v.trim()).filter(Boolean)
  return [text]
}

export function buildBookmarksMethodArgs(method, options = {}) {
  if (options.args !== undefined) {
    const parsed = parseJson(options.args, '--args')
    if (!Array.isArray(parsed)) throw new Error('--args must be a JSON array')
    return parsed
  }

  switch (method) {
    case 'create': {
      const bookmark = requireObject(parseJson(options.bookmark, '--bookmark'), '--bookmark')
      return [bookmark]
    }
    case 'get': {
      const ids = parseIds(options.ids, '--ids')
      return [ids]
    }
    case 'getChildren':
    case 'getSubTree':
    case 'remove':
    case 'removeTree': {
      const id = options.id ?? options._id
      if (id === undefined) throw new Error('--id is required')
      return [String(id)]
    }
    case 'getRecent': {
      const numberOfItems = parseNumber(options.numberOfItems, '--number-of-items')
      if (numberOfItems === undefined) throw new Error('--number-of-items is required')
      return [numberOfItems]
    }
    case 'getTree':
      return []
    case 'move': {
      const id = options.id ?? options._id
      if (id === undefined) throw new Error('--id is required')
      const destination = requireObject(parseJson(options.destination, '--destination'), '--destination')
      return [String(id), destination]
    }
    case 'search': {
      const queryObj = parseJson(options.query, '--query')
      if (queryObj !== undefined) return [queryObj]
      if (options.queryText !== undefined) return [String(options.queryText)]
      throw new Error('Either --query or --query-text is required')
    }
    case 'update': {
      const id = options.id ?? options._id
      if (id === undefined) throw new Error('--id is required')
      const changes = requireObject(parseJson(options.changes, '--changes'), '--changes')
      return [String(id), changes]
    }
    default:
      throw new Error(`Unsupported bookmarks method: ${method}`)
  }
}

