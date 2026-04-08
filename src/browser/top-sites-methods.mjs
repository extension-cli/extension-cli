export const TOP_SITES_METHOD_NAMES = [
  'get',
]

function parseJson(value, flagName) {
  if (value === undefined || value === null || value === '') return undefined
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`Invalid JSON for ${flagName}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function buildTopSitesMethodArgs(method, options = {}) {
  if (options.args !== undefined) {
    const parsed = parseJson(options.args, '--args')
    if (!Array.isArray(parsed)) throw new Error('--args must be a JSON array')
    return parsed
  }

  switch (method) {
    case 'get':
      return []
    default:
      throw new Error(`Unsupported topSites method: ${method}`)
  }
}
