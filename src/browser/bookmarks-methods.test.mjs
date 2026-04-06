import { describe, expect, it } from 'vitest'
import { BOOKMARKS_METHOD_NAMES, buildBookmarksMethodArgs } from './bookmarks-methods.mjs'

describe('bookmarks methods list', () => {
  it('contains integrated bookmarks methods', () => {
    expect(BOOKMARKS_METHOD_NAMES).toEqual([
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
    ])
  })
})

describe('buildBookmarksMethodArgs', () => {
  it('builds create/get/getTree/getRecent', () => {
    expect(buildBookmarksMethodArgs('create', { bookmark: '{"title":"A","url":"https://a.com"}' }))
      .toEqual([{ title: 'A', url: 'https://a.com' }])
    expect(buildBookmarksMethodArgs('get', { ids: '1,2' })).toEqual([['1', '2']])
    expect(buildBookmarksMethodArgs('getTree', {})).toEqual([])
    expect(buildBookmarksMethodArgs('getRecent', { numberOfItems: '5' })).toEqual([5])
  })

  it('builds id-based and update methods', () => {
    expect(buildBookmarksMethodArgs('getChildren', { _id: '1' })).toEqual(['1'])
    expect(buildBookmarksMethodArgs('getSubTree', { _id: '1' })).toEqual(['1'])
    expect(buildBookmarksMethodArgs('remove', { _id: '1' })).toEqual(['1'])
    expect(buildBookmarksMethodArgs('removeTree', { _id: '1' })).toEqual(['1'])
    expect(buildBookmarksMethodArgs('move', { _id: '1', destination: '{"parentId":"2"}' })).toEqual(['1', { parentId: '2' }])
    expect(buildBookmarksMethodArgs('update', { _id: '1', changes: '{"title":"X"}' })).toEqual(['1', { title: 'X' }])
  })

  it('builds search', () => {
    expect(buildBookmarksMethodArgs('search', { query: '{"title":"X"}' })).toEqual([{ title: 'X' }])
    expect(buildBookmarksMethodArgs('search', { queryText: 'hello' })).toEqual(['hello'])
  })
})

