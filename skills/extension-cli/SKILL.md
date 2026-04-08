---
name: extension-cli
description: Use extension-cli APIs through daemon + Chrome extension bridge (tabs/tab-groups/windows/history/sessions/bookmarks methods and events).
allowed-tools: Bash(extension-cli:*), Read, Write, Edit
---

# extension-cli browser

Package: `@extension-cli/cli`  
Executable: `extension-cli`

## Critical Rules

1. Always verify bridge health first: `extension-cli status`.
2. If daemon is offline, run `extension-cli daemon start`.
3. If daemon is online but extension is disconnected, reload/install extension-cli extension and retry.
4. Prefer API methods (`browser ...`) over DOM hacks when data exists in Chrome extension APIs.
5. For live state changes, use `events --follow` (WS/SSE) instead of polling.
6. Use `events-clear` before a fresh capture session to avoid mixing old/new events.
7. `bookmarks/history/sessions` are privacy-gated: verify/grant optional permission first.
8. Use `auth grant/revoke` (not `request/remove`).

## Recommended Startup Check

```bash
extension-cli status
extension-cli daemon start
extension-cli tabs query --active true
```

## API Namespaces

```bash
extension-cli tabs --help
extension-cli tab-groups --help
extension-cli windows --help
extension-cli history --help
extension-cli sessions --help
extension-cli bookmarks --help
```

## Privacy Permission Gate (Required For Bookmarks/History/Sessions)

```bash
extension-cli bookmarks auth --help
extension-cli history auth --help
extension-cli sessions auth --help
```

Grant flow:

```bash
extension-cli bookmarks auth grant
extension-cli history auth grant
extension-cli sessions auth grant
```

Revoke flow:

```bash
extension-cli bookmarks auth revoke
extension-cli history auth revoke
extension-cli sessions auth revoke
```

Permission events:

```bash
extension-cli bookmarks auth events --follow
extension-cli history auth events --follow
extension-cli sessions auth events --follow
```

If grant fails with `This function must be called during a user gesture`, open the extension-cli extension popup and click `Grant` for the corresponding permission.

## Methods Discovery

```bash
extension-cli tabs methods
extension-cli tab-groups methods
extension-cli windows methods
extension-cli history methods
extension-cli sessions methods
extension-cli bookmarks methods
```

## Common Query Examples

```bash
extension-cli tabs query --active true
extension-cli windows get-all --get-info '{"populate":true}'
extension-cli tab-groups query --query '{"title":"Work"}'
extension-cli history search --query '{"text":"cloudflare","maxResults":20}'
extension-cli sessions get-recently-closed --filter '{"maxResults":10}'
extension-cli bookmarks search --query-text "extension-cli"
```

## Brainstorm: 20 Cross-API Use Cases

1. Morning workspace restore: rebuild `windows/tabs/tab-groups` from `storage` snapshot.
2. End-of-day archive: split current tabs into `keep/read-later/close`, then persist with `reading-list/bookmarks/storage`.
3. Automatic tab classification: classify by domain/title rules and regroup via `tab-groups`.
4. Meeting mode switch: keep only meeting tabs, archive others into `sessions/storage`.
5. Deep-work anti-distraction: detect social/audible tabs and auto-mute/regroup/minimize.
6. Top-sites curation: suggest adding high-frequency unbookmarked sites from `top-sites` to `bookmarks`.
7. Reading funnel: detect repeatedly-opened pages from `top-sites/history` and enqueue to `reading-list`.
8. Bookmark hygiene assistant: use `bookmarks + history` to mark stale/low-value links.
9. Duplicate tab cleanup: find same-URL duplicates, preserve active tab, close/reassign others.
10. Download operations board: stream `downloads events` and persist task states into `storage`.
11. Download source traceability: map downloads back to source tabs/URLs for audit trail.
12. Session health checks: validate critical site login state through `cookies` probes.
13. Multi-account guardrails: detect same-domain cross-window account mixing and separate sessions.
14. Weekly browsing report: aggregate `history` by domain/topic/time-window for focus insights.
15. Intent-aware workspace prep: infer project intent from recent `history` and preload tab sets.
16. Incident replay bundle: capture `tabs/windows/downloads/cookies` event timeline for debugging.
17. Security cleanup mode: close sensitive tabs, remove scoped cookies, and tear down windows quickly.
18. Research sprint sandbox: create isolated window, open seed tabs, then archive findings at finish.
19. Least-privilege automation: `auth grant` before tasks and `auth revoke` after tasks with logs.
20. Next-best-action suggestions: combine signals from `top-sites/history/reading-list/downloads` to rank next tasks.

## Bookmark Analytics (analysis.mjs)

Dashboard + metrics:

```bash
extension-cli bookmarks viz
extension-cli bookmarks viz --group-by month
extension-cli bookmarks viz --group-by year
extension-cli bookmarks stats
extension-cli bookmarks categories --limit 20
extension-cli bookmarks domains --limit 20
extension-cli bookmarks classify --limit 30
```

Raw metrics:

```bash
extension-cli bookmarks viz --json
extension-cli bookmarks stats --json
```

Sync and then analyze:

```bash
extension-cli bookmarks sync
extension-cli bookmarks sync --full
extension-cli history sync --max-results 20000
extension-cli history viz --json
```

## Events (Realtime)

```bash
extension-cli tabs events --follow
extension-cli tab-groups events --follow --transport sse
extension-cli windows events --follow
extension-cli history events --follow
extension-cli sessions events --follow
extension-cli bookmarks events --follow
```

## Event Hygiene

```bash
extension-cli tabs events-clear
extension-cli windows events-clear
extension-cli history events-clear
```

## Troubleshooting

```bash
extension-cli daemon status
extension-cli tabs query --active true
```

- `Daemon is running but extension is not connected`:
  reload the extension-cli extension, then retry.
- `Unknown action: ...-method`:
  extension version is outdated; rebuild/reload extension and restart daemon.
- `404 Not found` on events:
  daemon route mismatch/outdated process; restart daemon and reconnect extension.
- `Missing optional permission "...". Run: extension-cli <namespace> auth grant`:
  grant the namespace permission first (or click `Grant` in extension popup).
