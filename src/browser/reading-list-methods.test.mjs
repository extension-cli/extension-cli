import { describe, expect, it } from 'vitest'
import { buildReadingListMethodArgs, READING_LIST_METHOD_NAMES } from './reading-list-methods.mjs'

describe('readingList methods list', () => {
  it('contains integrated readingList methods', () => {
    expect(READING_LIST_METHOD_NAMES).toEqual([
      'addEntry',
      'query',
      'removeEntry',
      'updateEntry',
    ])
  })
})

describe('buildReadingListMethodArgs', () => {
  it('builds args for add/query/update/remove', () => {
    expect(buildReadingListMethodArgs('addEntry', { entry: '{"url":"https://example.com","title":"Example","hasBeenRead":false}' }))
      .toEqual([{ url: 'https://example.com', title: 'Example', hasBeenRead: false }])
    expect(buildReadingListMethodArgs('query', { query: '{"hasBeenRead":false}' }))
      .toEqual([{ hasBeenRead: false }])
    expect(buildReadingListMethodArgs('query', {})).toEqual([{}])
    expect(buildReadingListMethodArgs('updateEntry', { entry: '{"url":"https://example.com","hasBeenRead":true}' }))
      .toEqual([{ url: 'https://example.com', hasBeenRead: true }])
    expect(buildReadingListMethodArgs('removeEntry', { details: '{"url":"https://example.com"}' }))
      .toEqual([{ url: 'https://example.com' }])
  })

  it('supports raw --args override', () => {
    expect(buildReadingListMethodArgs('query', { args: '[{"title":"docs"}]' }))
      .toEqual([{ title: 'docs' }])
  })
})
