import fs from 'node:fs/promises'
import path from 'node:path'
import { EXTENSION_CLI_HOME } from '../constants.mjs'

function syncDir() {
  return path.join(EXTENSION_CLI_HOME, 'sync')
}

function bookmarksCachePath() {
  return path.join(syncDir(), 'bookmarks.jsonl')
}

function bookmarksMetaPath() {
  return path.join(syncDir(), 'bookmarks-meta.json')
}

function historyCachePath() {
  return path.join(syncDir(), 'history.jsonl')
}

function historyMetaPath() {
  return path.join(syncDir(), 'history-meta.json')
}

async function ensureSyncDir() {
  const dir = syncDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function readJsonLines(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    return text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line))
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return []
    throw error
  }
}

async function writeJsonLines(filePath, rows) {
  const lines = rows.map(row => JSON.stringify(row)).join('\n')
  await fs.writeFile(filePath, lines ? `${lines}\n` : '', 'utf8')
}

async function readJsonMaybe(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null
    throw error
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function safeDomain(rawUrl) {
  try {
    return new URL(String(rawUrl || '')).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return 'unknown'
  }
}

function normalizeBookmarkItem(item, syncedAt) {
  return {
    id: String(item.id || ''),
    title: String(item.title || '(untitled)'),
    url: String(item.url || ''),
    domain: safeDomain(item.url),
    path: String(item.path || ''),
    dateAdded: typeof item.dateAdded === 'number' ? item.dateAdded : null,
    syncedAt,
  }
}

function normalizeHistoryItem(item, syncedAt) {
  return {
    id: String(item.id ?? item.url ?? ''),
    url: String(item.url || ''),
    title: String(item.title || '(untitled)'),
    domain: safeDomain(item.url),
    lastVisitTime: typeof item.lastVisitTime === 'number' ? item.lastVisitTime : null,
    visitCount: Number(item.visitCount || 0),
    typedCount: Number(item.typedCount || 0),
    syncedAt,
  }
}

function bookmarkKey(row) {
  return row.id || row.url
}

function historyKey(row) {
  return row.id || row.url
}

function sortByTimeDesc(rows, getTime) {
  return rows
    .slice()
    .sort((a, b) => {
      const ta = Number(getTime(a) || 0)
      const tb = Number(getTime(b) || 0)
      return tb - ta
    })
}

function mergeRecords(existing, incoming, keyOf, options = {}) {
  const full = Boolean(options.full)
  const map = new Map()
  let added = 0

  if (!full) {
    for (const row of existing) {
      map.set(keyOf(row), row)
    }
  }

  for (const row of incoming) {
    const key = keyOf(row)
    if (!map.has(key)) added += 1
    map.set(key, row)
  }

  return { merged: [...map.values()], added }
}

export function normalizeBookmarksForSync(nodes, syncedAt = new Date().toISOString()) {
  return nodes.map(item => normalizeBookmarkItem(item, syncedAt))
}

export function normalizeHistoryForSync(rows, syncedAt = new Date().toISOString()) {
  return rows.map(item => normalizeHistoryItem(item, syncedAt))
}

export function mergeBookmarksSync(existing, incoming, options = {}) {
  return mergeRecords(existing, incoming, bookmarkKey, options)
}

export function mergeHistorySync(existing, incoming, options = {}) {
  return mergeRecords(existing, incoming, historyKey, options)
}

export async function syncBookmarksStore(bookmarks, options = {}) {
  await ensureSyncDir()
  const now = new Date().toISOString()
  const cachePath = bookmarksCachePath()
  const metaPath = bookmarksMetaPath()
  const previousMeta = await readJsonMaybe(metaPath)

  const normalized = normalizeBookmarksForSync(bookmarks, now)
  const existing = options.full ? [] : await readJsonLines(cachePath)
  const { merged, added } = mergeBookmarksSync(existing, normalized, { full: options.full })
  const sorted = sortByTimeDesc(merged, row => row.dateAdded)

  await writeJsonLines(cachePath, sorted)
  const meta = {
    provider: 'chrome.bookmarks',
    schemaVersion: 1,
    totalRecords: sorted.length,
    lastSyncAt: now,
    lastFullSyncAt: options.full ? now : (previousMeta?.lastFullSyncAt ?? null),
    lastIncrementalSyncAt: options.full ? (previousMeta?.lastIncrementalSyncAt ?? null) : now,
  }
  await writeJson(metaPath, meta)

  return {
    mode: options.full ? 'full' : 'incremental',
    added,
    totalRecords: sorted.length,
    cachePath,
    metaPath,
  }
}

export async function syncHistoryStore(historyRows, options = {}) {
  await ensureSyncDir()
  const now = new Date().toISOString()
  const cachePath = historyCachePath()
  const metaPath = historyMetaPath()
  const previousMeta = await readJsonMaybe(metaPath)

  const normalized = normalizeHistoryForSync(historyRows, now)
  const existing = options.full ? [] : await readJsonLines(cachePath)
  const { merged, added } = mergeHistorySync(existing, normalized, { full: options.full })
  const sorted = sortByTimeDesc(merged, row => row.lastVisitTime)

  await writeJsonLines(cachePath, sorted)
  const meta = {
    provider: 'chrome.history',
    schemaVersion: 1,
    totalRecords: sorted.length,
    lastSyncAt: now,
    lastFullSyncAt: options.full ? now : (previousMeta?.lastFullSyncAt ?? null),
    lastIncrementalSyncAt: options.full ? (previousMeta?.lastIncrementalSyncAt ?? null) : now,
  }
  await writeJson(metaPath, meta)

  return {
    mode: options.full ? 'full' : 'incremental',
    added,
    totalRecords: sorted.length,
    cachePath,
    metaPath,
  }
}
