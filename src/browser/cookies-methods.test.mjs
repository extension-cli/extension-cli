import { describe, expect, it } from 'vitest'
import { buildCookiesMethodArgs, COOKIES_METHOD_NAMES } from './cookies-methods.mjs'

describe('cookies methods list', () => {
  it('contains integrated cookies methods', () => {
    expect(COOKIES_METHOD_NAMES).toEqual([
      'get',
      'getAll',
      'getAllCookieStores',
      'remove',
      'set',
    ])
  })
})

describe('buildCookiesMethodArgs', () => {
  it('builds args for get/set/remove', () => {
    expect(buildCookiesMethodArgs('get', { details: '{"url":"https://example.com","name":"sid"}' }))
      .toEqual([{ url: 'https://example.com', name: 'sid' }])
    expect(buildCookiesMethodArgs('set', { details: '{"url":"https://example.com","name":"sid","value":"x"}' }))
      .toEqual([{ url: 'https://example.com', name: 'sid', value: 'x' }])
    expect(buildCookiesMethodArgs('remove', { details: '{"url":"https://example.com","name":"sid"}' }))
      .toEqual([{ url: 'https://example.com', name: 'sid' }])
  })

  it('builds args for getAll/getAllCookieStores', () => {
    expect(buildCookiesMethodArgs('getAll', { details: '{"domain":"example.com"}' }))
      .toEqual([{ domain: 'example.com' }])
    expect(buildCookiesMethodArgs('getAll', {})).toEqual([])
    expect(buildCookiesMethodArgs('getAllCookieStores', {})).toEqual([])
  })

  it('supports raw --args override', () => {
    expect(buildCookiesMethodArgs('getAll', { args: '[{"domain":"example.com"}]' }))
      .toEqual([{ domain: 'example.com' }])
  })
})
