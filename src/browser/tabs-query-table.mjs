function toSingleLine(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function truncateText(value, maxWidth) {
  if (!value) return ''
  if (value.length <= maxWidth) return value
  if (maxWidth <= 3) return value.slice(0, maxWidth)
  return `${value.slice(0, maxWidth - 3)}...`
}

function formatCell(value, width) {
  return truncateText(toSingleLine(value), width).padEnd(width, ' ')
}

function createBorder(widths) {
  return `+${widths.map(width => '-'.repeat(width + 2)).join('+')}+`
}

function renderRow(values, widths) {
  const cells = values.map((value, index) => ` ${formatCell(value, widths[index])} `)
  return `|${cells.join('|')}|`
}

function detectTerminalWidth(fallback = 120) {
  const columns = Number(process?.stdout?.columns)
  if (Number.isFinite(columns) && columns > 0) return columns
  return fallback
}

function buildFlags(tab) {
  const flags = []
  if (tab?.active) flags.push('A')
  if (tab?.pinned) flags.push('P')
  if (tab?.audible) flags.push('U')
  if (tab?.discarded) flags.push('D')
  if (tab?.mutedInfo?.muted) flags.push('M')
  return flags.join(',') || '-'
}

export function renderTabsQueryTable(tabs, options = {}) {
  const list = Array.isArray(tabs) ? tabs : []

  const terminalWidth = options.terminalWidth ?? detectTerminalWidth()
  const minTitleWidth = options.minTitleWidth ?? 24
  const minUrlWidth = options.minUrlWidth ?? 40
  const indexWidth = options.indexWidth ?? 3
  const flagsWidth = options.flagsWidth ?? 7

  const framePadding = 3 // table char + spaces around content in each cell
  const nonFlexWidth = indexWidth + flagsWidth + framePadding * 2
  const available = Math.max(minTitleWidth + minUrlWidth, terminalWidth - nonFlexWidth - 5)
  const titleWidth = options.titleWidth ?? Math.max(minTitleWidth, Math.min(48, Math.floor(available * 0.35)))
  const urlWidth = options.urlWidth ?? Math.max(minUrlWidth, available - titleWidth)

  const widths = [indexWidth, flagsWidth, titleWidth, urlWidth]
  const topBorder = createBorder(widths)

  const title = `Tabs Query Results (${list.length} tab${list.length === 1 ? '' : 's'})`
  const titleLine = `| ${formatCell(title, widths.reduce((sum, width) => sum + width + 3, -3))} |`

  const legend = 'Flags: A=active, P=pinned, U=audible, D=discarded, M=muted'
  const legendLine = `| ${formatCell(legend, widths.reduce((sum, width) => sum + width + 3, -3))} |`

  const header = renderRow(['#', 'FLAGS', 'TITLE', 'URL'], widths)
  const divider = createBorder(widths)

  const rows = list.map((tab, idx) => {
    const index = String(idx + 1)
    const flags = buildFlags(tab)
    const titleText = toSingleLine(tab?.title) || '(untitled)'
    const urlText = toSingleLine(tab?.url) || '(no url)'
    return renderRow([index, flags, titleText, urlText], widths)
  })

  return [topBorder, titleLine, legendLine, divider, header, divider, ...rows, topBorder].join('\n')
}
