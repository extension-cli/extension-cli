import { describe, expect, it } from 'vitest'
import { buildTabsMethodArgs, TABS_METHOD_NAMES } from './tabs-methods.mjs'

describe('tabs methods list', () => {
  it('contains all integrated chrome.tabs methods', () => {
    expect(TABS_METHOD_NAMES).toEqual([
      'captureVisibleTab',
      'connect',
      'create',
      'detectLanguage',
      'discard',
      'duplicate',
      'get',
      'getCurrent',
      'getZoom',
      'getZoomSettings',
      'goBack',
      'goForward',
      'group',
      'highlight',
      'move',
      'query',
      'reload',
      'remove',
      'sendMessage',
      'setZoom',
      'setZoomSettings',
      'ungroup',
      'update',
    ])
  })
})

describe('buildTabsMethodArgs', () => {
  it('builds args for captureVisibleTab', () => {
    expect(buildTabsMethodArgs('captureVisibleTab', { windowId: '2', options: '{"format":"png"}' }))
      .toEqual([2, { format: 'png' }])
  })

  it('builds args for connect', () => {
    expect(buildTabsMethodArgs('connect', { _tabId: '8', connectInfo: '{"name":"bus"}' }))
      .toEqual([8, { name: 'bus' }])
  })

  it('builds args for create', () => {
    expect(buildTabsMethodArgs('create', { _url: 'https://example.com', createProperties: '{"active":false}' }))
      .toEqual([{ active: false, url: 'https://example.com' }])
  })

  it('builds args for detectLanguage', () => {
    expect(buildTabsMethodArgs('detectLanguage', { _tabId: '9' })).toEqual([9])
  })

  it('builds args for discard without tabId', () => {
    expect(buildTabsMethodArgs('discard', {})).toEqual([])
  })

  it('builds args for duplicate', () => {
    expect(buildTabsMethodArgs('duplicate', { _tabId: '11' })).toEqual([11])
  })

  it('builds args for get', () => {
    expect(buildTabsMethodArgs('get', { _tabId: '11' })).toEqual([11])
  })

  it('builds args for getCurrent', () => {
    expect(buildTabsMethodArgs('getCurrent', {})).toEqual([])
  })

  it('builds args for getZoom', () => {
    expect(buildTabsMethodArgs('getZoom', { _tabId: '5' })).toEqual([5])
  })

  it('builds args for getZoomSettings', () => {
    expect(buildTabsMethodArgs('getZoomSettings', { _tabId: '5' })).toEqual([5])
  })

  it('builds args for goBack/goForward', () => {
    expect(buildTabsMethodArgs('goBack', { _tabId: '3' })).toEqual([3])
    expect(buildTabsMethodArgs('goForward', { _tabId: '3' })).toEqual([3])
  })

  it('builds args for group', () => {
    expect(buildTabsMethodArgs('group', { options: '{"tabIds":[1,2]}' }))
      .toEqual([{ tabIds: [1, 2] }])
  })

  it('builds args for highlight', () => {
    expect(buildTabsMethodArgs('highlight', { highlightInfo: '{"tabs":[0,1],"windowId":1}' }))
      .toEqual([{ tabs: [0, 1], windowId: 1 }])
  })

  it('builds args for move', () => {
    expect(buildTabsMethodArgs('move', { tabIds: '1,2', moveProperties: '{"index":0}' }))
      .toEqual([[1, 2], { index: 0 }])
  })

  it('builds args for query', () => {
    expect(buildTabsMethodArgs('query', { query: '{"active":true}' }))
      .toEqual([{ active: true }])
  })

  it('builds args for reload', () => {
    expect(buildTabsMethodArgs('reload', { _tabId: '7', reloadProperties: '{"bypassCache":true}' }))
      .toEqual([7, { bypassCache: true }])
  })

  it('builds args for remove', () => {
    expect(buildTabsMethodArgs('remove', { tabIds: '[4,5]' }))
      .toEqual([[4, 5]])
  })

  it('builds args for sendMessage', () => {
    expect(buildTabsMethodArgs('sendMessage', { _tabId: '2', message: '{"hello":"world"}' }))
      .toEqual([2, { hello: 'world' }])
  })

  it('builds args for setZoom', () => {
    expect(buildTabsMethodArgs('setZoom', { _tabId: '2', zoomFactor: '1.25' }))
      .toEqual([2, 1.25])
  })

  it('builds args for setZoomSettings', () => {
    expect(buildTabsMethodArgs('setZoomSettings', { _tabId: '2', zoomSettings: '{"mode":"automatic"}' }))
      .toEqual([2, { mode: 'automatic' }])
  })

  it('builds args for ungroup', () => {
    expect(buildTabsMethodArgs('ungroup', { tabIds: '8' }))
      .toEqual([8])
  })

  it('builds args for update', () => {
    expect(buildTabsMethodArgs('update', { _tabId: '1', updateProperties: '{"active":true}' }))
      .toEqual([1, { active: true }])
  })

  it('supports raw --args override', () => {
    expect(buildTabsMethodArgs('update', { args: '[123, {\"active\": false}]', updateProperties: '{"active":true}' }))
      .toEqual([123, { active: false }])
  })
})

