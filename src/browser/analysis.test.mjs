import { describe, expect, it } from 'vitest'
import {
  buildFtMetrics,
  classifyBookmark,
  normalizeBookmarksTree,
  renderFtCategories,
  renderFtDomains,
  renderFtStats,
  renderFtViz,
} from '../analysis.mjs'

describe('normalizeBookmarksTree', () => {
  it('flattens chrome bookmark tree into folders and bookmarks', () => {
    const tree = [
      {
        id: '0',
        title: 'root',
        children: [
          {
            id: '1',
            title: 'Dev',
            children: [
              { id: '2', title: 'GitHub', url: 'https://github.com/openai/openai-node', dateAdded: 1710000000000 },
            ],
          },
        ],
      },
    ]

    const result = normalizeBookmarksTree(tree)
    expect(result.folders.length).toBe(2)
    expect(result.bookmarks).toEqual([
      expect.objectContaining({
        id: '2',
        title: 'GitHub',
        domain: 'github.com',
        path: 'root / Dev',
      }),
    ])
  })
})

describe('classifyBookmark', () => {
  it('classifies by domain and keywords', () => {
    expect(classifyBookmark({ title: 'OpenAI docs', url: 'https://platform.openai.com/docs', domain: 'platform.openai.com' }))
      .toBe('ai')
    expect(classifyBookmark({ title: 'JS guide', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', domain: 'developer.mozilla.org' }))
      .toBe('dev')
    expect(classifyBookmark({ title: 'unknown', url: 'https://example.com', domain: 'example.com' }))
      .toBe('other')
  })
})

describe('buildFtMetrics and renderers', () => {
  it('builds aggregates and renders printable output', () => {
    const bookmarks = [
      { id: '1', title: 'OpenAI docs and API reference', url: 'https://openai.com', domain: 'openai.com', dateAdded: 1577836800000 }, // 2020-01-01
      { id: '2', title: 'GitHub Repo architecture deep dive for async sdk internals', url: 'https://github.com/foo/bar', domain: 'github.com', dateAdded: 1609459200000 }, // 2021-01-01
      { id: '3', title: 'News', url: 'https://reuters.com/tech', domain: 'reuters.com', dateAdded: 1640995200000 }, // 2022-01-01
      { id: '4', title: 'Vercel docs', url: 'https://vercel.com/docs', domain: 'vercel.com', dateAdded: 1704067200000 }, // 2024-01-01
      { id: '5', title: 'Vercel edge runtime', url: 'https://vercel.com/edge', domain: 'vercel.com', dateAdded: 1706745600000 }, // 2024-02-01
      { id: '6', title: 'Vercel deployment pipeline', url: 'https://vercel.com/changelog', domain: 'vercel.com', dateAdded: 1709251200000 }, // 2024-03-01
    ]
    const folders = [{ id: '0', title: 'root' }]

    const metrics = buildFtMetrics(bookmarks, folders)
    expect(metrics.totalBookmarks).toBe(6)
    expect(metrics.totalFolders).toBe(1)
    expect(metrics.uniqueDomains).toBe(4)
    expect(metrics.topCategories.length).toBeGreaterThan(0)
    expect(metrics.hiddenGems.length).toBeGreaterThan(0)
    expect(metrics.timeCapsules.length).toBeGreaterThan(0)

    const viz = renderFtViz(metrics)
    expect(viz).toContain('Chrome Bookmarks Dashboard')
    expect(viz).toContain('HIDDEN GEMS')
    expect(viz).toContain('TIME CAPSULES')
    expect(viz).toContain('DAILY ARC')
    expect(viz).toContain('Grouped by Month')
    expect(renderFtViz(metrics, { groupBy: 'year' })).toContain('Grouped by Year')
    expect(viz).toContain('FINGERPRINT')
    expect(renderFtStats(metrics)).toContain('chrome.bookmarks stats')
    expect(renderFtCategories(metrics)).toContain('Category Distribution')
    expect(renderFtDomains(metrics)).toContain('Domain Distribution')
  })
})
