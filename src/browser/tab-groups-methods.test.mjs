import { describe, expect, it } from 'vitest'
import {
  buildTabGroupsMethodArgs,
  TAB_GROUPS_METHOD_NAMES,
} from './tab-groups-methods.mjs'

describe('tabGroups methods list', () => {
  it('contains all integrated chrome.tabGroups methods', () => {
    expect(TAB_GROUPS_METHOD_NAMES).toEqual([
      'get',
      'move',
      'query',
      'update',
    ])
  })
})

describe('buildTabGroupsMethodArgs', () => {
  it('builds args for get', () => {
    expect(buildTabGroupsMethodArgs('get', { _groupId: '12' })).toEqual([12])
  })

  it('builds args for move', () => {
    expect(
      buildTabGroupsMethodArgs('move', {
        _groupId: '9',
        moveProperties: '{"windowId":1,"index":0}',
      }),
    ).toEqual([9, { windowId: 1, index: 0 }])
  })

  it('builds args for query', () => {
    expect(
      buildTabGroupsMethodArgs('query', { query: '{"windowId":1,"title":"Work"}' }),
    ).toEqual([{ windowId: 1, title: 'Work' }])
  })

  it('builds args for update', () => {
    expect(
      buildTabGroupsMethodArgs('update', {
        _groupId: '7',
        updateProperties: '{"title":"Pinned","collapsed":true}',
      }),
    ).toEqual([7, { title: 'Pinned', collapsed: true }])
  })

  it('supports raw --args override', () => {
    expect(
      buildTabGroupsMethodArgs('update', {
        args: '[1,{"title":"X"}]',
        _groupId: '7',
        updateProperties: '{"title":"Y"}',
      }),
    ).toEqual([1, { title: 'X' }])
  })
})

