import { describe, expect, it } from 'vitest'
import { buildWindowsMethodArgs, WINDOWS_METHOD_NAMES } from './windows-methods.mjs'

describe('windows methods list', () => {
  it('contains all integrated chrome.windows methods', () => {
    expect(WINDOWS_METHOD_NAMES).toEqual([
      'create',
      'get',
      'getAll',
      'getCurrent',
      'getLastFocused',
      'remove',
      'update',
    ])
  })
})

describe('buildWindowsMethodArgs', () => {
  it('builds args for create', () => {
    expect(buildWindowsMethodArgs('create', { createData: '{"url":"https://example.com"}' }))
      .toEqual([{ url: 'https://example.com' }])
  })

  it('builds args for get', () => {
    expect(buildWindowsMethodArgs('get', { _windowId: '2', getInfo: '{"populate":true}' }))
      .toEqual([2, { populate: true }])
  })

  it('builds args for getAll', () => {
    expect(buildWindowsMethodArgs('getAll', { getInfo: '{"populate":false}' }))
      .toEqual([{ populate: false }])
  })

  it('builds args for getCurrent and getLastFocused', () => {
    expect(buildWindowsMethodArgs('getCurrent', { getInfo: '{"populate":true}' }))
      .toEqual([{ populate: true }])
    expect(buildWindowsMethodArgs('getLastFocused', {}))
      .toEqual([])
  })

  it('builds args for remove', () => {
    expect(buildWindowsMethodArgs('remove', { _windowId: '7' })).toEqual([7])
  })

  it('builds args for update', () => {
    expect(buildWindowsMethodArgs('update', { _windowId: '8', updateInfo: '{"focused":true}' }))
      .toEqual([8, { focused: true }])
  })

  it('supports raw --args override', () => {
    expect(buildWindowsMethodArgs('update', { args: '[1, {\"left\": 100}]' }))
      .toEqual([1, { left: 100 }])
  })
})

