import { describe, expect, it } from 'vitest'
import { buildStorageMethodArgs, STORAGE_METHOD_NAMES } from './storage-methods.mjs'

describe('storage methods list', () => {
  it('contains integrated storage methods', () => {
    expect(STORAGE_METHOD_NAMES).toEqual([
      'local.clear',
      'local.get',
      'local.getBytesInUse',
      'local.remove',
      'local.set',
      'managed.get',
      'managed.getBytesInUse',
      'session.clear',
      'session.get',
      'session.getBytesInUse',
      'session.remove',
      'session.set',
      'sync.clear',
      'sync.get',
      'sync.getBytesInUse',
      'sync.remove',
      'sync.set',
    ])
  })
})

describe('buildStorageMethodArgs', () => {
  it('builds args for get/set/remove/clear', () => {
    expect(buildStorageMethodArgs('local.get', { keys: '["a","b"]' })).toEqual([['a', 'b']])
    expect(buildStorageMethodArgs('session.get', {})).toEqual([])
    expect(buildStorageMethodArgs('sync.set', { items: '{"a":1}' })).toEqual([{ a: 1 }])
    expect(buildStorageMethodArgs('local.remove', { key: 'token' })).toEqual(['token'])
    expect(buildStorageMethodArgs('sync.clear', {})).toEqual([])
  })

  it('builds args for getBytesInUse', () => {
    expect(buildStorageMethodArgs('local.getBytesInUse', { keys: '"token"' })).toEqual(['token'])
    expect(buildStorageMethodArgs('managed.getBytesInUse', {})).toEqual([])
  })

  it('supports raw --args override', () => {
    expect(buildStorageMethodArgs('local.get', { args: '["token"]' })).toEqual(['token'])
  })
})
