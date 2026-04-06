import { describe, expect, it } from 'vitest'
import { buildHistoryMethodArgs, HISTORY_METHOD_NAMES } from './history-methods.mjs'

describe('history methods list', () => {
  it('contains integrated history methods', () => {
    expect(HISTORY_METHOD_NAMES).toEqual([
      'addUrl',
      'deleteAll',
      'deleteRange',
      'deleteUrl',
      'getVisits',
      'search',
    ])
  })
})

describe('buildHistoryMethodArgs', () => {
  it('builds addUrl/deleteUrl/getVisits', () => {
    expect(buildHistoryMethodArgs('addUrl', { details: '{"url":"https://a.com"}' })).toEqual([{ url: 'https://a.com' }])
    expect(buildHistoryMethodArgs('deleteUrl', { details: '{"url":"https://a.com"}' })).toEqual([{ url: 'https://a.com' }])
    expect(buildHistoryMethodArgs('getVisits', { details: '{"url":"https://a.com"}' })).toEqual([{ url: 'https://a.com' }])
  })

  it('builds deleteAll/deleteRange/search', () => {
    expect(buildHistoryMethodArgs('deleteAll', {})).toEqual([])
    expect(buildHistoryMethodArgs('deleteRange', { range: '{"startTime":1,"endTime":2}' })).toEqual([{ startTime: 1, endTime: 2 }])
    expect(buildHistoryMethodArgs('search', { query: '{"text":"abc","maxResults":10}' })).toEqual([{ text: 'abc', maxResults: 10 }])
  })
})

