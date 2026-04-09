function toSingleLine(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

const graphemeSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null

const extendedPictographicRegex = /\p{Extended_Pictographic}/u

function splitGraphemes(value) {
  if (!value) return []
  if (!graphemeSegmenter) return Array.from(value)
  return Array.from(graphemeSegmenter.segment(value), part => part.segment)
}

function isCombiningCodePoint(codePoint) {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  )
}

function isVariationSelectorCodePoint(codePoint) {
  return (
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  )
}

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

function graphemeDisplayWidth(grapheme) {
  if (!grapheme) return 0
  if (
    grapheme.includes('\u200d') ||
    grapheme.includes('\ufe0f') ||
    extendedPictographicRegex.test(grapheme)
  ) {
    return 2
  }

  let width = 0
  for (const char of grapheme) {
    const codePoint = char.codePointAt(0)
    if (!codePoint) continue
    if ((codePoint >= 0x00 && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f)) continue
    if (codePoint === 0x200d || isVariationSelectorCodePoint(codePoint) || isCombiningCodePoint(codePoint)) continue
    width += isWideCodePoint(codePoint) ? 2 : 1
  }
  return Math.max(0, width)
}

function stringDisplayWidth(value) {
  let width = 0
  for (const grapheme of splitGraphemes(value)) {
    width += graphemeDisplayWidth(grapheme)
  }
  return width
}

function truncateText(value, maxWidth) {
  if (!value) return ''
  const valueWidth = stringDisplayWidth(value)
  if (valueWidth <= maxWidth) return value
  if (maxWidth <= 3) return '.'.repeat(Math.max(0, maxWidth))

  const targetWidth = maxWidth - 3
  let output = ''
  let width = 0
  for (const grapheme of splitGraphemes(value)) {
    const graphemeWidth = graphemeDisplayWidth(grapheme)
    if (width + graphemeWidth > targetWidth) break
    output += grapheme
    width += graphemeWidth
  }
  return `${output}...`
}

function formatCell(value, width) {
  const text = truncateText(toSingleLine(value), width)
  const padding = Math.max(0, width - stringDisplayWidth(text))
  return `${text}${' '.repeat(padding)}`
}

function resolveTableChars(options = {}) {
  if (options.useUnicode === false) {
    return {
      h: '-',
      v: '|',
      topLeft: '+',
      topMid: '+',
      topRight: '+',
      midLeft: '+',
      midMid: '+',
      midRight: '+',
      bottomLeft: '+',
      bottomMid: '+',
      bottomRight: '+',
    }
  }

  return {
    h: '─',
    v: '│',
    topLeft: '┌',
    topMid: '┬',
    topRight: '┐',
    midLeft: '├',
    midMid: '┼',
    midRight: '┤',
    bottomLeft: '└',
    bottomMid: '┴',
    bottomRight: '┘',
  }
}

function createBorder(widths, chars, left, mid, right) {
  return `${left}${widths.map(width => chars.h.repeat(width + 2)).join(mid)}${right}`
}

function renderRow(values, widths, chars) {
  const cells = values.map((value, index) => ` ${formatCell(value, widths[index])} `)
  return `${chars.v}${cells.join(chars.v)}${chars.v}`
}

function detectTerminalWidth(fallback = 120) {
  const columns = Number(process?.stdout?.columns)
  if (Number.isFinite(columns) && columns > 0) return columns
  const envColumns = Number(process?.env?.COLUMNS)
  if (Number.isFinite(envColumns) && envColumns > 0) return envColumns
  return fallback
}

function fitColumnWidths(terminalWidth, preferredWidths, minWidths, shrinkOrder) {
  const borderChars = 3 * preferredWidths.length + 1
  const maxContentWidth = Math.max(1, terminalWidth - borderChars)
  const widths = preferredWidths.slice()
  const mins = minWidths.slice()

  let total = widths.reduce((sum, width) => sum + width, 0)
  if (total <= maxContentWidth) return widths

  while (total > maxContentWidth) {
    let shrunk = false
    for (const index of shrinkOrder) {
      if (widths[index] > mins[index]) {
        widths[index] -= 1
        total -= 1
        shrunk = true
        break
      }
    }
    if (!shrunk) break
  }

  return widths
}

function renderTable(title, headers, widths, rows, notes = [], options = {}) {
  const chars = resolveTableChars(options)
  const totalContentWidth = widths.reduce((sum, width) => sum + width + 3, -3)
  const topBorder = createBorder(widths, chars, chars.topLeft, chars.topMid, chars.topRight)
  const midBorder = createBorder(widths, chars, chars.midLeft, chars.midMid, chars.midRight)
  const bottomBorder = createBorder(widths, chars, chars.bottomLeft, chars.bottomMid, chars.bottomRight)
  const headerLine = renderRow(headers, widths, chars)
  const bodyRows = rows.length > 0
    ? rows.map(row => renderRow(row, widths, chars))
    : [`${chars.v} ${formatCell('(no results)', totalContentWidth)} ${chars.v}`]
  const separatedBodyRows = bodyRows.flatMap((line, index) => (
    index < bodyRows.length - 1 ? [line, midBorder] : [line]
  ))
  return [title, ...notes, topBorder, headerLine, midBorder, ...separatedBodyRows, bottomBorder].join('\n')
}

function formatTimestamp(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return '-'
  return new Date(n).toISOString().replace('T', ' ').replace('Z', ' UTC')
}

export function renderWindowsGetAllTable(windows, options = {}) {
  const list = Array.isArray(windows) ? windows : []
  const terminalWidth = options.terminalWidth ?? detectTerminalWidth(100)

  const widths = fitColumnWidths(
    terminalWidth,
    [3, 6, 8, 10, 7, 9, 4, 32],
    [2, 4, 4, 6, 5, 5, 3, 14],
    [7, 3, 2, 5, 4, 1, 6, 0],
  )

  const rows = list.map((item, idx) => [
    String(idx + 1),
    item?.id,
    item?.type || '-',
    item?.state || '-',
    item?.focused ? 'yes' : 'no',
    item?.incognito ? 'yes' : 'no',
    Array.isArray(item?.tabs) ? item.tabs.length : 0,
    item?.title || '(window)',
  ])

  return renderTable(
    `Windows GetAll Results (${list.length} window${list.length === 1 ? '' : 's'})`,
    ['#', 'ID', 'TYPE', 'STATE', 'FOCUS', 'INCOGNITO', 'TABS', 'TITLE'],
    widths,
    rows,
    [],
    options,
  )
}

export function renderHistorySearchTable(entries, options = {}) {
  const list = Array.isArray(entries) ? entries : []
  const terminalWidth = options.terminalWidth ?? detectTerminalWidth(100)

  const widths = fitColumnWidths(
    terminalWidth,
    [3, 6, 5, 24, 22, 48],
    [2, 4, 4, 19, 10, 16],
    [5, 4, 3, 1, 2, 0],
  )

  const rows = list.map((item, idx) => [
    String(idx + 1),
    item?.visitCount ?? 0,
    item?.typedCount ?? 0,
    formatTimestamp(item?.lastVisitTime),
    item?.title || '(untitled)',
    item?.url || '(no url)',
  ])

  return renderTable(
    `History Search Results (${list.length} item${list.length === 1 ? '' : 's'})`,
    ['#', 'VISIT', 'TYPED', 'LAST_VISIT', 'TITLE', 'URL'],
    widths,
    rows,
    [],
    options,
  )
}

export function renderBookmarksSearchTable(entries, options = {}) {
  const list = Array.isArray(entries) ? entries : []
  const terminalWidth = options.terminalWidth ?? detectTerminalWidth(100)

  const widths = fitColumnWidths(
    terminalWidth,
    [3, 8, 6, 28, 48],
    [2, 4, 4, 10, 16],
    [4, 3, 1, 2, 0],
  )

  const rows = list.map((item, idx) => [
    String(idx + 1),
    item?.id || '-',
    item?.url ? 'LINK' : 'FOLDER',
    item?.title || '(untitled)',
    item?.url || '-',
  ])

  return renderTable(
    `Bookmarks Search Results (${list.length} item${list.length === 1 ? '' : 's'})`,
    ['#', 'ID', 'TYPE', 'TITLE', 'URL'],
    widths,
    rows,
    [],
    options,
  )
}
