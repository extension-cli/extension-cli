export const TAB_GROUPS_METHOD_NAMES = [
  'get',
  'move',
  'query',
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

export function buildTabGroupsMethodArgs(method, options = {}) {
  if (options.args !== undefined) {
    const parsed = parseJson(options.args, '--args')
    if (!Array.isArray(parsed)) {
      throw new Error('--args must be a JSON array')
    }
    return parsed
  }

  switch (method) {
    case 'get': {
      const groupId = parseNumber(options.groupId ?? options._groupId, '--group-id')
      if (groupId === undefined) throw new Error('--group-id is required')
      return [groupId]
    }
    case 'move': {
      const groupId = parseNumber(options.groupId ?? options._groupId, '--group-id')
      if (groupId === undefined) throw new Error('--group-id is required')
      const moveProperties = requireObject(parseJson(options.moveProperties, '--move-properties'), '--move-properties')
      return [groupId, moveProperties]
    }
    case 'query': {
      const queryInfo = parseJson(options.query, '--query')
      if (queryInfo === undefined) return [{}]
      return [requireObject(queryInfo, '--query')]
    }
    case 'update': {
      const groupId = parseNumber(options.groupId ?? options._groupId, '--group-id')
      if (groupId === undefined) throw new Error('--group-id is required')
      const updateProperties = requireObject(parseJson(options.updateProperties, '--update-properties'), '--update-properties')
      return [groupId, updateProperties]
    }
    default:
      throw new Error(`Unsupported tabGroups method: ${method}`)
  }
}

