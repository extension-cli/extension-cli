import { describe, expect, it } from 'vitest'
import {
  mergeBookmarksSync,
  mergeHistorySync,
  normalizeBookmarksForSync,
  normalizeHistoryForSync,
} from './sync.mjs'

describe('normalizeBookmarksForSync', () => {
  it('normalizes bookmark rows with domain and syncedAt', () => {
    const out = normalizeBookmarksForSync([
      { id: '1', title: 'OpenAI', url: 'https://www.openai.com/docs', path: 'root / dev', dateAdded: 1 },
    ], '2026-04-05T00:00:00.000Z')

    expect(out).toEqual([
      {
        id: '1',
        title: 'OpenAI',
        url: 'https://www.openai.com/docs',
        domain: 'openai.com',
        path: 'root / dev',
        dateAdded: 1,
        syncedAt: '2026-04-05T00:00:00.000Z',
      },
    ])
  })
})

describe('normalizeHistoryForSync', () => {
  it('normalizes history rows', () => {
    const out = normalizeHistoryForSync([
      { id: '10', title: 'Example', url: 'https://example.com', lastVisitTime: 99, visitCount: 4, typedCount: 1 },
    ], '2026-04-05T00:00:00.000Z')

    expect(out[0]).toEqual({
      id: '10',
      title: 'Example',
      url: 'https://example.com',
      domain: 'example.com',
      lastVisitTime: 99,
      visitCount: 4,
      typedCount: 1,
      syncedAt: '2026-04-05T00:00:00.000Z',
    })
  })
})

describe('merge sync records', () => {
  it('merges bookmarks incrementally and counts only new keys', () => {
    const existing = [
      { id: '1', url: 'https://a.com', title: 'a' },
      { id: '2', url: 'https://b.com', title: 'b-old' },
    ]
    const incoming = [
      { id: '2', url: 'https://b.com', title: 'b-new' },
      { id: '3', url: 'https://c.com', title: 'c' },
    ]
    const { merged, added } = mergeBookmarksSync(existing, incoming, { full: false })

    expect(added).toBe(1)
    expect(merged).toHaveLength(3)
    expect(merged.find(x => x.id === '2')?.title).toBe('b-new')
  })

  it('replaces history cache on full sync', () => {
    const existing = [{ id: '1', url: 'https://a.com' }]
    const incoming = [{ id: '2', url: 'https://b.com' }]
    const { merged, added } = mergeHistorySync(existing, incoming, { full: true })

    expect(added).toBe(1)
    expect(merged).toEqual([{ id: '2', url: 'https://b.com' }])
  })
})
