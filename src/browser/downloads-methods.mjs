export const DOWNLOADS_METHOD_NAMES = [
  'acceptDanger',
  'cancel',
  'download',
  'erase',
  'getFileIcon',
  'open',
  'pause',
  'removeFile',
  'resume',
  'search',
  'show',
  'showDefaultFolder',
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

function requireDownloadId(options = {}) {
  const id = parseNumber(options.downloadId ?? options._downloadId, '--download-id')
  if (id === undefined) throw new Error('--download-id is required')
  return id
}

export function buildDownloadsMethodArgs(method, options = {}) {
  if (options.args !== undefined) {
    const parsed = parseJson(options.args, '--args')
    if (!Array.isArray(parsed)) throw new Error('--args must be a JSON array')
    return parsed
  }

  switch (method) {
    case 'download': {
      const opts = requireObject(parseJson(options.options, '--options'), '--options')
      return [opts]
    }
    case 'search': {
      const query = parseJson(options.query, '--query')
      if (query === undefined) return [{}]
      return [requireObject(query, '--query')]
    }
    case 'erase': {
      const query = requireObject(parseJson(options.query, '--query'), '--query')
      return [query]
    }
    case 'getFileIcon': {
      const downloadId = requireDownloadId(options)
      const iconOptions = parseJson(options.iconOptions, '--icon-options')
      return iconOptions === undefined ? [downloadId] : [downloadId, iconOptions]
    }
    case 'showDefaultFolder':
      return []
    case 'acceptDanger':
    case 'cancel':
    case 'open':
    case 'pause':
    case 'removeFile':
    case 'resume':
    case 'show': {
      return [requireDownloadId(options)]
    }
    default:
      throw new Error(`Unsupported downloads method: ${method}`)
  }
}
