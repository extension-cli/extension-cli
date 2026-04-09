import { describe, expect, it } from 'vitest'
import { renderTabsQueryTable } from './tabs-query-table.mjs'

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

describe('renderTabsQueryTable', () => {
  it('renders bordered table with metadata and rows', () => {
    const output = renderTabsQueryTable([
      {
        title: 'GitHub',
        url: 'https://github.com',
        active: true,
        pinned: true,
      },
      {
        title: '',
        url: '',
      },
    ], {
      terminalWidth: 90,
      titleWidth: 16,
      urlWidth: 28,
      flagsWidth: 7,
      indexWidth: 3,
    })

    expect(output).toContain('Tabs Query Results (2 tabs)')
    expect(output).toContain('Flags: A=active, P=pinned, U=audible, D=discarded, M=muted')
    expect(output).toMatch(/[│|] #\s+[│|] FLAGS/)
    expect(output).toContain('GitHub')
    expect(output).toContain('https://github.com')
    expect(output).toContain('A,P')
    expect(output).toContain('(untitled)')
    expect(output).toContain('(no url)')
  })

  it('keeps aligned width with Chinese and symbols', () => {
    const output = renderTabsQueryTable([
      {
        title: '特徵 | The Clock | BALMUDA（豆瓣）',
        url: 'https://movie.douban.com/subject/36445098/',
      },
      {
        title: '还有明天（豆瓣）',
        url: 'https://example.com/a/very/very/very/long/path?x=1&y=2',
      },
    ], {
      terminalWidth: 120,
    })

    const maxDisplayWidth = output.split('\n').reduce((max, line) => (
      Math.max(max, stringDisplayWidth(line))
    ), 0)

    expect(maxDisplayWidth).toBeLessThanOrEqual(120)
    expect(output).toContain('特徵 | The Clock')
    expect(output).toContain('还有明天')
  })

  it('keeps aligned width with emoji graphemes', () => {
    const output = renderTabsQueryTable([
      {
        title: 'Xetera/ghost-cursor: ⬜️🤖✨',
        url: 'https://github.com/Xetera/ghost-cursor',
      },
      {
        title: 'Family: 👨‍👩‍👧‍👦 and rocket 🚀',
        url: 'https://example.com/emoji',
      },
    ], {
      terminalWidth: 120,
    })

    const maxDisplayWidth = output.split('\n').reduce((max, line) => (
      Math.max(max, stringDisplayWidth(line))
    ), 0)

    expect(maxDisplayWidth).toBeLessThanOrEqual(120)
    expect(output).toContain('Xetera/ghost-cursor')
    expect(output).toContain('Family:')
  })
})
