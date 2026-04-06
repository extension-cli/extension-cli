const ANSI_RE = /\x1b\[[0-9;]*m/g

const ESC = '\x1b['
const RESET = `${ESC}0m`
const BOLD = `${ESC}1m`
const DIM = `${ESC}2m`

const color = {
  title: `${ESC}38;2;131;197;255m`,
  accent: `${ESC}38;2;124;255;178m`,
  warn: `${ESC}38;2;255;190;120m`,
  soft: `${ESC}38;2;185;185;204m`,
  bar: `${ESC}38;2;140;170;255m`,
}

const BLOCKS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']
const SPARKS = '▁▂▃▄▅▆▇█'

const CATEGORY_RULES = [
  {
    key: 'ai',
    patterns: [/\b(ai|llm|gpt|agent|prompt|rag|embedding|transformer)\b/i],
    domains: ['openai.com', 'anthropic.com', 'huggingface.co', 'replicate.com', 'arxiv.org'],
  },
  {
    key: 'dev',
    patterns: [/\b(api|sdk|repo|github|coding|javascript|typescript|python|rust|golang|programming)\b/i],
    domains: ['github.com', 'gitlab.com', 'stackoverflow.com', 'npmjs.com', 'pypi.org', 'developer.mozilla.org'],
  },
  {
    key: 'design',
    patterns: [/\b(design|ux|ui|figma|typography|brand|visual)\b/i],
    domains: ['figma.com', 'dribbble.com', 'behance.net'],
  },
  {
    key: 'news',
    patterns: [/\b(news|report|analysis|breaking|journal)\b/i],
    domains: ['nytimes.com', 'wsj.com', 'theverge.com', 'techcrunch.com', 'reuters.com'],
  },
  {
    key: 'video',
    patterns: [/\b(video|podcast|watch|stream|youtube|bilibili)\b/i],
    domains: ['youtube.com', 'youtu.be', 'vimeo.com', 'bilibili.com'],
  },
  {
    key: 'shopping',
    patterns: [/\b(buy|price|deal|discount|shopping|shop)\b/i],
    domains: ['amazon.com', 'taobao.com', 'jd.com', 'etsy.com'],
  },
  {
    key: 'social',
    patterns: [/\b(tweet|thread|post|social|community|reddit)\b/i],
    domains: ['x.com', 'twitter.com', 'reddit.com', 'weibo.com'],
  },
  {
    key: 'docs',
    patterns: [/\b(doc|docs|documentation|guide|manual|reference|spec)\b/i],
    domains: ['docs.google.com', 'readthedocs.io', 'w3.org'],
  },
  {
    key: 'finance',
    patterns: [/\b(finance|market|stocks|crypto|invest|trading|economy)\b/i],
    domains: ['bloomberg.com', 'ft.com', 'coinbase.com'],
  },
]

function stripAnsi(value) {
  return String(value).replace(ANSI_RE, '')
}

function padAnsi(value, width) {
  const raw = stripAnsi(value)
  return value + ' '.repeat(Math.max(0, width - raw.length))
}

function formatBar(value, max, width = 28, barColor = color.bar) {
  const ratio = max > 0 ? value / max : 0
  const filled = ratio * width
  const full = Math.floor(filled)
  const partial = Math.round((filled - full) * 8)
  const piece = '█'.repeat(full) + (partial > 0 ? BLOCKS[partial] : '')
  const pad = ' '.repeat(Math.max(0, width - full - (partial > 0 ? 1 : 0)))
  return `${barColor}${piece}${RESET}${DIM}${pad}${RESET}`
}

function sparkline(values = []) {
  if (!values.length) return ''
  const max = Math.max(...values, 1)
  return values
    .map(v => SPARKS[Math.round((v / max) * 7)] ?? SPARKS[0])
    .join('')
}

function safeHost(input) {
  if (!input || typeof input !== 'string') return null
  try {
    return new URL(input).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function fmtDate(value) {
  if (!value) return 'unknown'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return d.toISOString().slice(0, 10)
}

function truncateText(value, max = 68) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, Math.max(0, max - 1))}…`
}

export function normalizeBookmarksTree(treeResult) {
  const roots = Array.isArray(treeResult)
    ? treeResult
    : Array.isArray(treeResult?.data)
      ? treeResult.data
      : Array.isArray(treeResult?.result)
        ? treeResult.result
        : []

  const folders = []
  const bookmarks = []

  function walk(node, path = []) {
    if (!node || typeof node !== 'object') return
    const title = String(node.title || '').trim() || '(untitled)'
    const currentPath = [...path, title]

    if (Array.isArray(node.children)) {
      folders.push({ id: String(node.id || ''), title, path: currentPath.join(' / '), depth: path.length })
      for (const child of node.children) walk(child, currentPath)
      return
    }

    if (typeof node.url === 'string' && node.url.trim()) {
      bookmarks.push({
        id: String(node.id || ''),
        title,
        url: node.url,
        domain: safeHost(node.url) || 'unknown',
        path: path.join(' / '),
        dateAdded: typeof node.dateAdded === 'number' ? node.dateAdded : null,
      })
    }
  }

  for (const root of roots) walk(root, [])

  return { roots, folders, bookmarks }
}

export function classifyBookmark(bookmark) {
  const text = `${bookmark.title || ''} ${bookmark.url || ''}`.toLowerCase()
  const domain = bookmark.domain || ''

  for (const rule of CATEGORY_RULES) {
    if (rule.domains.some(d => domain === d || domain.endsWith(`.${d}`))) return rule.key
    if (rule.patterns.some(re => re.test(text))) return rule.key
  }

  return 'other'
}

export function buildFtMetrics(bookmarks = [], folders = []) {
  const domains = new Map()
  const categories = new Map()
  const byMonth = new Map()
  const byHour = new Map()
  const domainMonthSet = new Map()
  const byWeekday = new Map([
    ['Sun', 0], ['Mon', 0], ['Tue', 0], ['Wed', 0], ['Thu', 0], ['Fri', 0], ['Sat', 0],
  ])
  let earliest = null
  let latest = null

  const classified = bookmarks.map(item => {
    const category = classifyBookmark(item)
    domains.set(item.domain, (domains.get(item.domain) || 0) + 1)
    categories.set(category, (categories.get(category) || 0) + 1)

    if (item.dateAdded) {
      const d = new Date(item.dateAdded)
      if (!Number.isNaN(d.getTime())) {
        if (!earliest || d < earliest) earliest = d
        if (!latest || d > latest) latest = d
        const month = d.toISOString().slice(0, 7)
        byMonth.set(month, (byMonth.get(month) || 0) + 1)
        const months = domainMonthSet.get(item.domain) || new Set()
        months.add(month)
        domainMonthSet.set(item.domain, months)
        const weekday = d.toUTCString().slice(0, 3)
        byWeekday.set(weekday, (byWeekday.get(weekday) || 0) + 1)
        const hour = d.getUTCHours()
        byHour.set(hour, (byHour.get(hour) || 0) + 1)
      }
    }

    return { ...item, category }
  })

  const domainRows = [...domains.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
  const categoryRows = [...categories.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
  const monthRows = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count }))
  const weekdayRows = [...byWeekday.entries()].map(([day, count]) => ({ day, count }))
  const hourRows = Array.from({ length: 24 }, (_, hour) => ({ hour, count: byHour.get(hour) || 0 }))

  const oldestFirst = classified
    .filter(item => item.dateAdded && !Number.isNaN(new Date(item.dateAdded).getTime()))
    .slice()
    .sort((a, b) => Number(a.dateAdded) - Number(b.dateAdded))

  const byYear = new Map()
  for (const item of oldestFirst) {
    const year = fmtDate(item.dateAdded).slice(0, 4)
    if (!byYear.has(year)) byYear.set(year, item)
  }
  const timeCapsules = [...byYear.values()].slice(0, 8).map(item => ({
    title: item.title,
    domain: item.domain,
    url: item.url,
    date: fmtDate(item.dateAdded),
    category: item.category,
  }))

  const hiddenGems = classified
    .filter(item => (domains.get(item.domain) || 0) === 1)
    .map(item => {
      const ageDays = item.dateAdded ? Math.floor((Date.now() - Number(item.dateAdded)) / 86400000) : 0
      const pathDepth = String(item.path || '').split('/').filter(Boolean).length
      const score = String(item.title || '').length + pathDepth * 8 + Math.floor(ageDays / 90)
      return { item, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ item }) => ({
      title: item.title,
      domain: item.domain,
      url: item.url,
      date: fmtDate(item.dateAdded),
      path: item.path || '',
      category: item.category,
    }))

  const latestMonth = monthRows.length ? monthRows[monthRows.length - 1].month : null
  const risingDomains = latestMonth
    ? [...domains.entries()]
        .filter(([domain, count]) => count >= 3 && (domainMonthSet.get(domain)?.size || 0) === 1 && domainMonthSet.get(domain)?.has(latestMonth))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count }))
    : []

  return {
    totalBookmarks: bookmarks.length,
    totalFolders: folders.length,
    uniqueDomains: domainRows.length,
    earliest: earliest ? earliest.toISOString() : null,
    latest: latest ? latest.toISOString() : null,
    topDomains: domainRows,
    topCategories: categoryRows,
    monthlyActivity: monthRows,
    weekdayActivity: weekdayRows,
    hourActivity: hourRows,
    timeCapsules,
    hiddenGems,
    risingDomains,
    classified,
  }
}

function renderCountChart(rows, { limit = 10, labelWidth = 14 } = {}) {
  const list = rows.slice(0, limit)
  if (!list.length) return `${DIM}(empty)${RESET}`
  const max = Math.max(...list.map(r => r.count), 1)
  return list
    .map(r => {
      const label = padAnsi(`${color.soft}${r.name}${RESET}`, labelWidth)
      return `${label} ${formatBar(r.count, max)} ${BOLD}${r.count}${RESET}`
    })
    .join('\n')
}

function renderWeekdayChart(rows) {
  const max = Math.max(...rows.map(r => r.count), 1)
  return rows
    .map(r => `${padAnsi(`${color.soft}${r.day}${RESET}`, 4)} ${formatBar(r.count, max, 16, color.accent)} ${r.count}`)
    .join('\n')
}

function renderTemporalGrouping(metrics, options = {}) {
  const groupBy = options.groupBy === 'year' ? 'year' : 'month'
  const rows = Array.isArray(metrics.monthlyActivity) ? metrics.monthlyActivity : []
  if (!rows.length) return `${DIM}(empty)${RESET}`

  if (groupBy === 'year') {
    const byYear = new Map()
    for (const row of rows) {
      const year = String(row.month || '').slice(0, 4)
      if (!year) continue
      byYear.set(year, (byYear.get(year) || 0) + Number(row.count || 0))
    }
    const yearRows = [...byYear.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
    return renderCountChart(yearRows, { limit: 20, labelWidth: 8 })
  }

  const monthRows = rows
    .slice(-12)
    .map(row => ({ name: String(row.month || ''), count: Number(row.count || 0) }))
  return renderCountChart(monthRows, { limit: 12, labelWidth: 10 })
}

function renderTimeCapsules(metrics) {
  if (!metrics.timeCapsules?.length) return ''
  return [
    `${BOLD}${color.warn}TIME CAPSULES${RESET}`,
    `${DIM}oldest saved items across years${RESET}`,
    ...metrics.timeCapsules.map(item =>
      `${color.soft}${item.date}${RESET}  ${color.accent}${item.domain}${RESET}  ${truncateText(item.title, 58)}`),
  ].join('\n')
}

function renderHiddenGems(metrics) {
  if (!metrics.hiddenGems?.length) return ''
  return [
    `${BOLD}${color.accent}HIDDEN GEMS${RESET}`,
    `${DIM}rare-domain saves with high signal titles${RESET}`,
    ...metrics.hiddenGems.map(item =>
      `◆ ${color.soft}${item.category}${RESET}  ${color.accent}${item.domain}${RESET}  ${truncateText(item.title, 54)}`),
  ].join('\n')
}

function renderRisingDomains(metrics) {
  if (!metrics.risingDomains?.length) return ''
  const max = Math.max(...metrics.risingDomains.map(row => row.count), 1)
  return [
    `${BOLD}${color.accent}RISING DOMAINS${RESET}`,
    `${DIM}domains concentrated in your most recent month${RESET}`,
    ...metrics.risingDomains.map(row => `${padAnsi(`${color.soft}${row.name}${RESET}`, 24)} ${formatBar(row.count, max, 18, color.accent)} ${row.count}`),
  ].join('\n')
}

function renderDailyArc(metrics) {
  const rows = metrics.hourActivity || []
  if (!rows.length) return ''
  const max = Math.max(...rows.map(r => r.count), 1)
  const height = 8
  const lines = [
    `${BOLD}${color.warn}DAILY ARC${RESET}`,
    `${DIM}when saves happen throughout the day (UTC)${RESET}`,
    '',
  ]

  for (let row = height; row >= 1; row--) {
    let line = ''
    for (const h of rows) {
      const level = (h.count / max) * height
      line += level >= row ? `${color.warn}█${RESET}` : ' '
    }
    lines.push(line)
  }

  lines.push('00    06    12    18    23')

  const peak = rows.reduce((a, b) => (a.count >= b.count ? a : b), rows[0])
  lines.push(`${DIM}peak hour: ${String(peak.hour).padStart(2, '0')}:00 (${peak.count})${RESET}`)
  return lines.join('\n')
}

function renderFingerprint(metrics, options = {}) {
  const primaryLabel = options.primaryLabel || 'Bookmarks'
  const titleLengths = (metrics.classified || []).map(item => String(item.title || '').length)
  const avgTitleLength = titleLengths.length
    ? Math.round(titleLengths.reduce((a, b) => a + b, 0) / titleLengths.length)
    : 0
  const topDomain = metrics.topDomains?.[0]
  const topCategory = metrics.topCategories?.[0]
  const longTailDomains = metrics.uniqueDomains > 0
    ? Math.max(0, metrics.uniqueDomains - (metrics.topDomains?.slice(0, 10).length || 0))
    : 0

  return [
    `${BOLD}${color.title}FINGERPRINT${RESET}`,
    `${DIM}quick signature of this ${String(primaryLabel).toLowerCase()} set${RESET}`,
    `${color.soft}avg title length${RESET}: ${BOLD}${avgTitleLength}${RESET} chars`,
    `${color.soft}top domain${RESET}: ${BOLD}${topDomain?.name || 'n/a'}${RESET} (${topDomain?.count || 0})`,
    `${color.soft}top category${RESET}: ${BOLD}${topCategory?.name || 'n/a'}${RESET} (${topCategory?.count || 0})`,
    `${color.soft}long-tail domains${RESET}: ${BOLD}${longTailDomains}${RESET}`,
  ].join('\n')
}

export function renderFtViz(metrics, options = {}) {
  const title = options.title || 'Chrome Bookmarks Dashboard'
  const primaryLabel = options.primaryLabel || 'Bookmarks'
  const secondaryLabel = options.secondaryLabel || 'Folders'
  const showSecondary = options.showSecondary !== false
  const months = metrics.monthlyActivity
  const monthValues = months.map(r => r.count)
  const monthSpark = months.length ? sparkline(monthValues) : 'n/a'
  const totalByDate = monthValues.reduce((a, b) => a + b, 0)
  const summaryLine = showSecondary
    ? `${color.soft}${primaryLabel}${RESET}: ${BOLD}${metrics.totalBookmarks}${RESET}   ${color.soft}${secondaryLabel}${RESET}: ${BOLD}${metrics.totalFolders}${RESET}   ${color.soft}Domains${RESET}: ${BOLD}${metrics.uniqueDomains}${RESET}`
    : `${color.soft}${primaryLabel}${RESET}: ${BOLD}${metrics.totalBookmarks}${RESET}   ${color.soft}Domains${RESET}: ${BOLD}${metrics.uniqueDomains}${RESET}`

  const narrativeBlocks = [renderHiddenGems(metrics), renderTimeCapsules(metrics), renderRisingDomains(metrics)]
    .filter(Boolean)
    .flatMap(block => [block, ''])

  return [
    `${BOLD}${color.title}${title}${RESET}`,
    '',
    summaryLine,
    `${color.soft}Range${RESET}: ${BOLD}${fmtDate(metrics.earliest)}${RESET} -> ${BOLD}${fmtDate(metrics.latest)}${RESET}`,
    '',
    ...narrativeBlocks,
    renderDailyArc(metrics),
    '',
    `${BOLD}${color.accent}Monthly Activity${RESET} ${DIM}(sparkline over detected months)${RESET}`,
    ` ${color.accent}${monthSpark}${RESET}  ${DIM}${totalByDate} with date metadata${RESET}`,
    '',
    `${BOLD}${color.accent}Grouped by ${options.groupBy === 'year' ? 'Year' : 'Month'}${RESET}`,
    renderTemporalGrouping(metrics, options),
    '',
    `${BOLD}${color.accent}Top Categories${RESET}`,
    renderCountChart(metrics.topCategories, { limit: 8, labelWidth: 12 }),
    '',
    `${BOLD}${color.accent}Top Domains${RESET}`,
    renderCountChart(metrics.topDomains, { limit: 8, labelWidth: 24 }),
    '',
    `${BOLD}${color.accent}Weekday Pattern${RESET}`,
    renderWeekdayChart(metrics.weekdayActivity),
    '',
    renderFingerprint(metrics, { primaryLabel }),
  ].join('\n')
}

export function renderFtStats(metrics, options = {}) {
  const title = options.title || 'chrome.bookmarks stats'
  return [
    `${BOLD}${color.title}${title}${RESET}`,
    '',
    `${color.soft}total bookmarks${RESET}: ${BOLD}${metrics.totalBookmarks}${RESET}`,
    `${color.soft}total folders${RESET}: ${BOLD}${metrics.totalFolders}${RESET}`,
    `${color.soft}unique domains${RESET}: ${BOLD}${metrics.uniqueDomains}${RESET}`,
    `${color.soft}date range${RESET}: ${BOLD}${fmtDate(metrics.earliest)}${RESET} -> ${BOLD}${fmtDate(metrics.latest)}${RESET}`,
    '',
    `${BOLD}${color.accent}Top domains${RESET}`,
    renderCountChart(metrics.topDomains, { limit: 10, labelWidth: 24 }),
  ].join('\n')
}

export function renderFtCategories(metrics, limit = 15, options = {}) {
  const title = options.title || 'Category Distribution'
  return [
    `${BOLD}${color.title}${title}${RESET}`,
    '',
    renderCountChart(metrics.topCategories, { limit, labelWidth: 12 }),
  ].join('\n')
}

export function renderFtDomains(metrics, limit = 15, options = {}) {
  const title = options.title || 'Domain Distribution'
  return [
    `${BOLD}${color.title}${title}${RESET}`,
    '',
    renderCountChart(metrics.topDomains, { limit, labelWidth: 28 }),
  ].join('\n')
}

export function renderFtClassify(metrics, limit = 30, options = {}) {
  const title = options.title || 'Bookmark Classification'
  const rows = metrics.classified.slice(0, limit)
  const lines = rows.map(row => {
    const domain = padAnsi(`${color.soft}${row.domain}${RESET}`, 22)
    const category = padAnsi(`${color.accent}${row.category}${RESET}`, 10)
    return `${category} ${domain} ${row.title}`
  })

  return [
    `${BOLD}${color.title}${title}${RESET}`,
    `${DIM}Showing ${rows.length}/${metrics.classified.length}${RESET}`,
    '',
    ...lines,
  ].join('\n')
}
