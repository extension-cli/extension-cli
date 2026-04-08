import { describe, expect, it } from 'vitest'
import { buildDownloadsMethodArgs, DOWNLOADS_METHOD_NAMES } from './downloads-methods.mjs'

describe('downloads methods list', () => {
  it('contains integrated downloads methods', () => {
    expect(DOWNLOADS_METHOD_NAMES).toEqual([
      'acceptDanger',
      'cancel',
      'download',
      'erase',
      'getFileIcon',
      'open',
      'pause',
      'removeFile',
      'resume',
      'search',
      'show',
      'showDefaultFolder',
    ])
  })
})

describe('buildDownloadsMethodArgs', () => {
  it('builds args for object-based methods', () => {
    expect(buildDownloadsMethodArgs('download', { options: '{"url":"https://example.com/a.zip"}' }))
      .toEqual([{ url: 'https://example.com/a.zip' }])
    expect(buildDownloadsMethodArgs('search', { query: '{"query":["example"],"limit":10}' }))
      .toEqual([{ query: ['example'], limit: 10 }])
    expect(buildDownloadsMethodArgs('search', {})).toEqual([{}])
    expect(buildDownloadsMethodArgs('erase', { query: '{"state":"complete"}' }))
      .toEqual([{ state: 'complete' }])
  })

  it('builds args for id-based methods', () => {
    expect(buildDownloadsMethodArgs('pause', { _downloadId: '7' })).toEqual([7])
    expect(buildDownloadsMethodArgs('resume', { downloadId: '8' })).toEqual([8])
    expect(buildDownloadsMethodArgs('showDefaultFolder', {})).toEqual([])
    expect(buildDownloadsMethodArgs('getFileIcon', { _downloadId: '9', iconOptions: '{"size":32}' }))
      .toEqual([9, { size: 32 }])
  })

  it('supports raw --args override', () => {
    expect(buildDownloadsMethodArgs('open', { args: '[11]' })).toEqual([11])
  })
})
