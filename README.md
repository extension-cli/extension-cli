# Extension CLI

A skill-first browser extension CLI for AI agents on Chrome, Firefox, and Edge.

## Why Extension CLI?

- Agent-first browser automation with predictable CLI primitives.
- Works with real browser state (tabs, windows, history, sessions, bookmarks).
- Safer defaults for destructive operations via human-in-the-loop confirmation.
- Built for local workflows: fast iteration, explicit outputs, easy scripting.

## How it works

```mermaid
flowchart LR
  A["AI Agent / User"] --> B["extension-cli (CLI)"]
  B --> C["Local Daemon (127.0.0.1:19883)"]
  C --> D["Browser Extension (WebSocket /ext)"]
  D --> E["Chrome APIs (tabs/windows/history/sessions/bookmarks/debugger/cookies)"]
  E --> D
  D --> C
  C --> B
  B --> F["Structured JSON Output"]
```

1. `extension-cli` sends commands to a local daemon.
2. Daemon talks to the browser extension through WebSocket.
3. Extension executes Chrome APIs and returns structured results.
4. CLI prints JSON-friendly output for humans and AI agents.

## Features

- Unified browser API surface: `tabs`, `tab-groups`, `windows`, `history`, `sessions`, `bookmarks`.
- Event bridge support (`events`, `events-clear`, `--follow`) for runtime observability.
- Cloudflare Browser Rendering integration (`rendering` namespace).
- Risk controls for delete/remove operations:
  - interactive `YES/NO` confirmation
  - target tab preview (`tabs remove`: `tabId`, `title`, `url`)
  - machine-readable safety error (`SAFETY_CONFIRMATION_REQUIRED`)
  - non-interactive explicit ack (`--yes --risk-ack ...`)

## Agent Prompt Examples

- Group browser tabs into meaningful categories in current window.
- Find inactive tabs in the current window and close the ones older than 7 days.
- Summarize top domains from recent history and output JSON.
- Move all tabs from social media domains into a new tab group named `Later`.
- Export bookmark tree stats, then suggest cleanup candidates with duplicated titles.

## Install

```bash
pnpm i -g @extension-cli/cli
```

Or run directly without global install:

```bash
npx @extension-cli/cli --help
```

Note: the executable command is still `extension-cli`.

## Project Governance

- Contributing guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Security policy: `SECURITY.md`
- Support: `SUPPORT.md`

## Setup Extension (required for browser APIs)

1. Build extension
```bash
cd extension
pnpm install
pnpm run build
```

2. Load extension (multi-browser)
- Open `chrome://extensions`
- Enable Developer mode
- Click `Load unpacked`
- Chrome: choose `<project-root>/extension/.output/chrome-mv3`
- Edge: choose `<project-root>/extension/.output/edge-mv3`
- Firefox: use `<project-root>/extension/.output/firefox-mv3` as temporary add-on

3. Back to project root
```bash
cd <project-root>
```

## Command Reference

Use `extension-cli <namespace> --help` or `extension-cli <namespace> <command> --help` to view full argument and option details.

### Safety: Human-in-the-loop for Destructive Commands

Commands that include `remove` or `delete` now require explicit human confirmation in an interactive terminal before execution.

- If terminal is non-interactive (no TTY), these commands are rejected.
- The prompt requires explicit `YES/NO`; only `YES` continues.
- For `extension-cli tabs remove`, the prompt previews each target tab (`tabId`, `title`, `url`) before confirmation.
- This is intentional to reduce accidental data loss or irreversible actions.

For AI Agent / non-interactive execution, use explicit acknowledgement flags:

```bash
extension-cli --yes --risk-ack "tabs remove" tabs remove --tab-ids "123"
extension-cli --yes --risk-ack "ALL" history delete-range --range '{"startTime":1,"endTime":2}'
```

When blocked in non-interactive mode, CLI emits machine-readable JSON with code `SAFETY_CONFIRMATION_REQUIRED`.

High-risk commands include:

```bash
extension-cli tabs remove
extension-cli windows remove
extension-cli history delete-all
extension-cli history delete-range
extension-cli history delete-url
extension-cli sessions remove-tab-value
extension-cli sessions remove-window-value
extension-cli bookmarks remove
extension-cli bookmarks remove-tree
```

### Core

```bash
extension-cli doctor
extension-cli status [--verify-rendering-token]

extension-cli daemon status
extension-cli daemon start
extension-cli daemon stop
```

### Tabs (`chrome.tabs`)

```bash
extension-cli tabs query
extension-cli tabs capture-visible-tab
extension-cli tabs connect
extension-cli tabs create
extension-cli tabs detect-language
extension-cli tabs discard
extension-cli tabs duplicate
extension-cli tabs get
extension-cli tabs get-current
extension-cli tabs get-zoom
extension-cli tabs get-zoom-settings
extension-cli tabs go-back
extension-cli tabs go-forward
extension-cli tabs group
extension-cli tabs highlight
extension-cli tabs move
extension-cli tabs reload
extension-cli tabs remove
extension-cli tabs send-message
extension-cli tabs set-zoom
extension-cli tabs set-zoom-settings
extension-cli tabs ungroup
extension-cli tabs update
extension-cli tabs methods
extension-cli tabs events
extension-cli tabs events-clear
```

### Tab Groups (`chrome.tabGroups`)

```bash
extension-cli tab-groups get
extension-cli tab-groups move
extension-cli tab-groups query
extension-cli tab-groups update
extension-cli tab-groups methods
extension-cli tab-groups events
extension-cli tab-groups events-clear
```

### Windows (`chrome.windows`)

```bash
extension-cli windows create
extension-cli windows get
extension-cli windows get-all
extension-cli windows get-current
extension-cli windows get-last-focused
extension-cli windows remove
extension-cli windows update
extension-cli windows methods
extension-cli windows events
extension-cli windows events-clear
```

### History (`chrome.history`)

```bash
extension-cli history auth grant
extension-cli history auth revoke
extension-cli history auth events

extension-cli history sync
extension-cli history viz
extension-cli history stats
extension-cli history categories
extension-cli history domains
extension-cli history classify

extension-cli history add-url
extension-cli history delete-all
extension-cli history delete-range
extension-cli history delete-url
extension-cli history get-visits
extension-cli history search

extension-cli history methods
extension-cli history events
extension-cli history events-clear
```

### Sessions (`chrome.sessions`)

```bash
extension-cli sessions auth grant
extension-cli sessions auth revoke
extension-cli sessions auth events

extension-cli sessions get-recently-closed
extension-cli sessions get-devices
extension-cli sessions restore
extension-cli sessions set-tab-value
extension-cli sessions get-tab-value
extension-cli sessions remove-tab-value
extension-cli sessions set-window-value
extension-cli sessions get-window-value
extension-cli sessions remove-window-value

extension-cli sessions methods
extension-cli sessions events
extension-cli sessions events-clear
```

### Bookmarks (`chrome.bookmarks`)

```bash
extension-cli bookmarks auth grant
extension-cli bookmarks auth revoke
extension-cli bookmarks auth events

extension-cli bookmarks sync
extension-cli bookmarks viz
extension-cli bookmarks stats
extension-cli bookmarks categories
extension-cli bookmarks domains
extension-cli bookmarks classify

extension-cli bookmarks create
extension-cli bookmarks get
extension-cli bookmarks get-children
extension-cli bookmarks get-recent
extension-cli bookmarks get-tree
extension-cli bookmarks get-sub-tree
extension-cli bookmarks move
extension-cli bookmarks remove
extension-cli bookmarks remove-tree
extension-cli bookmarks search
extension-cli bookmarks update

extension-cli bookmarks methods
extension-cli bookmarks events
extension-cli bookmarks events-clear
```

### Rendering (Cloudflare Browser Rendering REST API)

```bash
# auth
extension-cli rendering login
extension-cli rendering logout

# content extraction
extension-cli rendering content
extension-cli rendering markdown
extension-cli rendering links
extension-cli rendering json
extension-cli rendering scrape
extension-cli rendering snapshot

# binary output
extension-cli rendering screenshot
extension-cli rendering pdf

# crawl jobs
extension-cli rendering crawl
extension-cli rendering crawl-result
extension-cli rendering crawl-cancel
```

Key options:

```bash
# login (non-interactive)
extension-cli rendering login --account-id <id> --api-token <token>

# most rendering endpoints support body merge
extension-cli rendering markdown <url> --body '{"gotoOptions":{"waitUntil":"networkidle0"}}'
extension-cli rendering markdown <url> --body-file ./payload.json

# json extraction
extension-cli rendering json <url> --prompt "Extract title and summary"
extension-cli rendering json <url> --schema-file ./schema.json
extension-cli rendering json <url> --response-format-file ./response-format.json

# scrape selectors
extension-cli rendering scrape <url> --selector "main" --selector "a"

# snapshot file outputs
extension-cli rendering snapshot <url> --content-out ./page.html --screenshot-out ./page.png

# screenshot/pdf output and navigation controls
extension-cli rendering screenshot <url> --out ./shots/ --wait-until networkidle0 --timeout 45000 --full-page
extension-cli rendering screenshot <url> --viewport-width 1440 --viewport-height 900
extension-cli rendering pdf <url> --output ./reports/page.pdf --wait-until networkidle0 --timeout 45000

# crawl polling controls
extension-cli rendering crawl <url> --wait --poll-interval 5 --timeout 300
extension-cli rendering crawl <url> --no-wait
extension-cli rendering crawl-result <jobId> --limit 100 --cursor <cursor> --status completed
```

## Quickstart Examples

```bash
# tabs query
extension-cli tabs query --active --current-window
extension-cli tabs query --url "https://*.github.com/*"

# local sync (cache path: ~/.extension-cli/sync)
extension-cli bookmarks sync
extension-cli history sync --max-results 20000

# local analytics
extension-cli bookmarks viz --json
extension-cli history stats --json

# rendering
extension-cli rendering login
extension-cli rendering markdown https://example.com
extension-cli rendering json https://example.com --prompt "Extract main title"
extension-cli rendering screenshot https://example.com --out ./shots/
```

## Notes

- `rendering screenshot --out` supports directory path (auto filename).
- `rendering json` supports `--prompt`, `--schema`, `--response-format`, and `--body` extensions.
- Credential file defaults to `~/.extension-cli/rendering-auth.json`.

## License

[MIT](./LICENSE)
