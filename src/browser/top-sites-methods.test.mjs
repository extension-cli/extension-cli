import { describe, expect, it } from 'vitest'
import { buildTopSitesMethodArgs, TOP_SITES_METHOD_NAMES } from './top-sites-methods.mjs'

describe('topSites methods list', () => {
  it('contains integrated topSites methods', () => {
    expect(TOP_SITES_METHOD_NAMES).toEqual([
      'get',
    ])
  })
})

describe('buildTopSitesMethodArgs', () => {
  it('builds args for get', () => {
    expect(buildTopSitesMethodArgs('get', {})).toEqual([])
  })

  it('supports raw --args override', () => {
    expect(buildTopSitesMethodArgs('get', { args: '[]' })).toEqual([])
  })
})
