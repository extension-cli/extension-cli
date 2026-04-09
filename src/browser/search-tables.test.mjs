import { describe, expect, it } from 'vitest'
import {
  renderBookmarksSearchTable,
  renderHistorySearchTable,
  renderWindowsGetAllTable,
} from './search-tables.mjs'

function isWideCodePoint(codePoint) {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2329 && codePoint <= 0x232a) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff)
  )
}

function stringDisplayWidth(value) {
  let width = 0
  for (const char of value) {
    const codePoint = char.codePointAt(0)
    if (!codePoint) continue
    if ((codePoint >= 0x00 && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f)) continue
    width += isWideCodePoint(codePoint) ? 2 : 1
  }
  return width
}

describe('search table renderers', () => {
  it('renders windows table', () => {
    const output = renderWindowsGetAllTable([{
      id: 12,
      type: 'normal',
      state: 'maximized',
      focused: true,
      incognito: false,
      tabs: [{}, {}],
      title: 'Work Window',
    }], { terminalWidth: 120 })

    expect(output).toContain('Windows GetAll Results (1 window)')
    expect(output).toMatch(/[│|] #/)
    expect(output).toContain('Work Window')
    expect(output).toContain('normal')
    expect(output).toContain('yes')
  })

  it('renders history table', () => {
    const output = renderHistorySearchTable([{
      visitCount: 4,
      typedCount: 1,
      lastVisitTime: 1700000000000,
      title: 'OpenAI Docs',
      url: 'https://platform.openai.com/docs',
    }], { terminalWidth: 120 })

    expect(output).toContain('History Search Results (1 item)')
    expect(output).toContain('OpenAI Docs')
    expect(output).toContain('https://platform.openai.com/docs')
    expect(output).toContain('2023-11-14')
  })

  it('keeps history table inside narrow terminal width', () => {
    const output = renderHistorySearchTable([{
      visitCount: 84,
      typedCount: 15,
      lastVisitTime: 1744061350000,
      title: 'GitHub',
      url: 'https://github.com/very/long/path/that/should/be/truncated/in/a/narrow/terminal',
    }], { terminalWidth: 90 })

    const maxLineLength = output.split('\n').reduce((max, line) => Math.max(max, line.length), 0)
    expect(maxLineLength).toBeLessThanOrEqual(90)
    expect(output).toContain('History Search Results (1 item)')
  })

  it('renders bookmarks table', () => {
    const output = renderBookmarksSearchTable([{
      id: '123',
      title: 'GitHub',
      url: 'https://github.com',
    }], { terminalWidth: 120 })

    expect(output).toContain('Bookmarks Search Results (1 item)')
    expect(output).toContain('GitHub')
    expect(output).toContain('https://github.com')
    expect(output).toContain('LINK')
  })

  it('keeps history table aligned with Chinese and emoji', () => {
    const output = renderHistorySearchTable([{
      visitCount: 2,
      typedCount: 1,
      lastVisitTime: 1744186000000,
      title: '还有明天（豆瓣） ⬜️🤖✨',
      url: 'https://movie.douban.com/subject/36445098/',
    }], { terminalWidth: 120 })

    const maxDisplayWidth = output.split('\n').reduce((max, line) => (
      Math.max(max, stringDisplayWidth(line))
    ), 0)

    expect(maxDisplayWidth).toBeLessThanOrEqual(120)
    expect(output).toContain('还有明天')
  })

  it('keeps bookmarks table aligned with Chinese and emoji', () => {
    const output = renderBookmarksSearchTable([{
      id: 'cn-1',
      title: '特徵 | The Clock | BALMUDA（豆瓣）👨‍👩‍👧‍👦',
      url: 'https://example.com/emoji',
    }], { terminalWidth: 120 })

    const maxDisplayWidth = output.split('\n').reduce((max, line) => (
      Math.max(max, stringDisplayWidth(line))
    ), 0)

    expect(maxDisplayWidth).toBeLessThanOrEqual(120)
    expect(output).toContain('特徵')
    expect(output).toContain('emoji')
  })
})
