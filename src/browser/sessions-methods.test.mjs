import { describe, expect, it } from 'vitest'
import { buildSessionsMethodArgs, SESSIONS_METHOD_NAMES } from './sessions-methods.mjs'

describe('sessions methods list', () => {
  it('contains integrated sessions methods', () => {
    expect(SESSIONS_METHOD_NAMES).toEqual([
      'getRecentlyClosed',
      'getDevices',
      'restore',
      'setTabValue',
      'getTabValue',
      'removeTabValue',
      'setWindowValue',
      'getWindowValue',
      'removeWindowValue',
    ])
  })
})

describe('buildSessionsMethodArgs', () => {
  it('builds read/list methods', () => {
    expect(buildSessionsMethodArgs('getRecentlyClosed', { filter: '{"maxResults":5}' })).toEqual([{ maxResults: 5 }])
    expect(buildSessionsMethodArgs('getDevices', {})).toEqual([])
    expect(buildSessionsMethodArgs('restore', { _sessionId: 'abc' })).toEqual(['abc'])
  })

  it('builds tab value methods', () => {
    expect(buildSessionsMethodArgs('setTabValue', { _tabId: '1', _key: 'k', _value: '{"x":1}' })).toEqual([1, 'k', { x: 1 }])
    expect(buildSessionsMethodArgs('getTabValue', { _tabId: '1', _key: 'k' })).toEqual([1, 'k'])
    expect(buildSessionsMethodArgs('removeTabValue', { _tabId: '1', _key: 'k' })).toEqual([1, 'k'])
  })

  it('builds window value methods', () => {
    expect(buildSessionsMethodArgs('setWindowValue', { _windowId: '2', _key: 'k', _value: '42' })).toEqual([2, 'k', 42])
    expect(buildSessionsMethodArgs('getWindowValue', { _windowId: '2', _key: 'k' })).toEqual([2, 'k'])
    expect(buildSessionsMethodArgs('removeWindowValue', { _windowId: '2', _key: 'k' })).toEqual([2, 'k'])
  })
})

