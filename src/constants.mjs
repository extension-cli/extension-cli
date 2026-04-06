import os from 'node:os'
import path from 'node:path'

export const APP_NAME = 'extension-cli'
export const EXTENSION_CLI_HOME =
  process.env.EXTENSION_CLI_HOME ||
  process.env.BROWSERCLI_HOME ||
  process.env.BROWSER_CLI_HOME ||
  path.join(os.homedir(), '.extension-cli')
export const PROFILE_DIR = path.join(EXTENSION_CLI_HOME, 'profile')
export const LOG_DIR = path.join(EXTENSION_CLI_HOME, 'logs')
export const RENDERING_AUTH_FILE = path.join(
  EXTENSION_CLI_HOME,
  'rendering-auth.json',
)
export const DEFAULT_TIMEOUT_MS = 30_000

export function validateHttpUrl(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid URL format: ${rawUrl}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid URL protocol: ${parsed.protocol}`)
  }

  return parsed.toString()
}
