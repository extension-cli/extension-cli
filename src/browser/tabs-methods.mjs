export const TABS_METHOD_NAMES = [
  'captureVisibleTab',
  'connect',
  'create',
  'detectLanguage',
  'discard',
  'duplicate',
  'get',
  'getCurrent',
  'getZoom',
  'getZoomSettings',
  'goBack',
  'goForward',
  'group',
  'highlight',
  'move',
  'query',
  'reload',
  'remove',
  'sendMessage',
  'setZoom',
  'setZoomSettings',
  'ungroup',
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

function parseTabIds(value, flagName = '--tab-ids') {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${flagName} is required`)
  }
  if (Array.isArray(value)) {
    return value.map((item) => parseNumber(item, flagName))
  }
  if (typeof value === 'number') return value
  const text = String(value).trim()
  if (!text) throw new Error(`${flagName} is required`)
  if (text.startsWith('[')) {
    const arr = parseJson(text, flagName)
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error(`${flagName} must be a non-empty array`)
    }
    return arr.map((item) => parseNumber(item, flagName))
  }
  if (text.includes(',')) {
    const ids = text.split(',').map((part) => parseNumber(part.trim(), flagName))
    if (ids.length === 0) throw new Error(`${flagName} must not be empty`)
    return ids
  }
  return parseNumber(text, flagName)
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

export function buildTabsMethodArgs(method, options = {}) {
  if (options.args !== undefined) {
    const parsed = parseJson(options.args, '--args')
    if (!Array.isArray(parsed)) {
      throw new Error('--args must be a JSON array')
    }
    return parsed
  }

  switch (method) {
    case 'captureVisibleTab': {
      const windowId = parseNumber(options.windowId, '--window-id')
      const screenshotOptions = parseJson(options.options, '--options')
      return [windowId, screenshotOptions].filter((item) => item !== undefined)
    }
    case 'connect': {
      const tabId = parseNumber(options.tabId ?? options._tabId, '--tab-id')
      const connectInfo = parseJson(options.connectInfo, '--connect-info')
      return [tabId, connectInfo].filter((item) => item !== undefined)
    }
    case 'create': {
      const createProperties = parseJson(options.createProperties, '--create-properties') || {}
      if (options._url) createProperties.url = options._url
      return [createProperties]
    }
    case 'detectLanguage':
    case 'discard':
    case 'getZoom':
    case 'getZoomSettings':
    case 'goBack':
    case 'goForward': {
      const tabId = parseNumber(options.tabId ?? options._tabId, '--tab-id')
      return tabId === undefined ? [] : [tabId]
    }
    case 'duplicate':
    case 'get': {
      const tabId = parseNumber(options.tabId ?? options._tabId, '--tab-id')
      if (tabId === undefined) throw new Error('--tab-id is required')
      return [tabId]
    }
    case 'getCurrent': {
      return []
    }
    case 'group': {
      const opts = requireObject(parseJson(options.options, '--options'), '--options')
      return [opts]
    }
    case 'highlight': {
      const info = requireObject(parseJson(options.highlightInfo, '--highlight-info'), '--highlight-info')
      return [info]
    }
    case 'move': {
      const tabIds = parseTabIds(options.tabIds)
      const moveProperties = requireObject(parseJson(options.moveProperties, '--move-properties'), '--move-properties')
      return [tabIds, moveProperties]
    }
    case 'query': {
      const queryInfo = parseJson(options.query, '--query')
      if (queryInfo === undefined) return [{}]
      return [requireObject(queryInfo, '--query')]
    }
    case 'reload': {
      const tabId = parseNumber(options.tabId ?? options._tabId, '--tab-id')
      const reloadProperties = parseJson(options.reloadProperties, '--reload-properties')
      return [tabId, reloadProperties].filter((item) => item !== undefined)
    }
    case 'remove':
    case 'ungroup': {
      return [parseTabIds(options.tabIds)]
    }
    case 'sendMessage': {
      const tabId = parseNumber(options.tabId ?? options._tabId, '--tab-id')
      if (tabId === undefined) throw new Error('--tab-id is required')
      let message = parseJson(options.message, '--message')
      if (message === undefined && options.messageText !== undefined) {
        message = options.messageText
      }
      if (message === undefined) {
        throw new Error('Either --message (JSON) or --message-text is required')
      }
      const sendOptions = parseJson(options.options, '--options')
      return [tabId, message, sendOptions].filter((item) => item !== undefined)
    }
    case 'setZoom': {
      const tabId = parseNumber(options.tabId ?? options._tabId, '--tab-id')
      const zoomFactor = parseNumber(options.zoomFactor, '--zoom-factor')
      if (zoomFactor === undefined) throw new Error('--zoom-factor is required')
      return tabId === undefined ? [zoomFactor] : [tabId, zoomFactor]
    }
    case 'setZoomSettings': {
      const tabId = parseNumber(options.tabId ?? options._tabId, '--tab-id')
      const settings = requireObject(parseJson(options.zoomSettings, '--zoom-settings'), '--zoom-settings')
      return tabId === undefined ? [settings] : [tabId, settings]
    }
    case 'update': {
      const tabId = parseNumber(options.tabId ?? options._tabId, '--tab-id')
      const updateProperties = requireObject(parseJson(options.updateProperties, '--update-properties'), '--update-properties')
      return tabId === undefined ? [updateProperties] : [tabId, updateProperties]
    }
    default:
      throw new Error(`Unsupported tabs method: ${method}`)
  }
}

