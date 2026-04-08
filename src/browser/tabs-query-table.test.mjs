import { describe, expect, it } from 'vitest'
import { renderTabsQueryTable } from './tabs-query-table.mjs'

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
    expect(output).toContain('| #   | FLAGS')
    expect(output).toContain('GitHub')
    expect(output).toContain('https://github.com')
    expect(output).toContain('A,P')
    expect(output).toContain('(untitled)')
    expect(output).toContain('(no url)')
  })
})
