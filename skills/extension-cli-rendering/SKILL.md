---
name: extension-cli-rendering
description: Use extension-cli rendering (Cloudflare Browser Rendering REST API) for markdown/json/pdf/screenshot/crawl with login-aware workflow.
allowed-tools: Bash(extension-cli:*), Read, Write, Edit
---

# extension-cli rendering

Package: `@extension-cli/cli`  
Executable: `extension-cli`

## Critical Rules

1. Always run `extension-cli rendering login` before API calls requiring authorization.
2. For `json`, provide `--prompt` or `--response-format`/`--schema` (CLI has a safe default prompt fallback).
3. For complete page render output, set navigation options explicitly:
   `--wait-until networkidle0 --timeout 45000`.
4. For binary outputs (`pdf`/`screenshot`), prefer `--output`/`--out` and write into a concrete path or directory.
5. Use `--body` / `--body-file` to pass advanced REST payload fields directly.
6. For long tasks (`crawl`), use polling flow (`crawl --wait`) and fallback to `crawl-result` for follow-up checks.

## Recommended Flow

```bash
extension-cli rendering login
extension-cli rendering markdown https://example.com
extension-cli rendering json https://example.com --prompt "Extract title, summary, and main links"
extension-cli rendering screenshot https://example.com --out ./artifacts/ --wait-until networkidle0 --timeout 45000 --full-page
extension-cli rendering pdf https://example.com --output ./artifacts/example.pdf --wait-until networkidle0 --timeout 45000
```

## Auth & Status

```bash
extension-cli rendering login
extension-cli rendering logout
extension-cli status --verify-rendering-token
```

## Content APIs

```bash
extension-cli rendering content <url>
extension-cli rendering markdown <url>
extension-cli rendering links <url>
extension-cli rendering json <url> --prompt "..."
extension-cli rendering scrape <url> --selector "main" --selector "a"
extension-cli rendering snapshot <url> --content-out ./page.html --screenshot-out ./page.png
```

## Binary Rendering APIs

```bash
extension-cli rendering screenshot <url> --out ./shot.png
extension-cli rendering screenshot <url> --out ./shots/ --full-page --wait-until networkidle0 --timeout 45000
extension-cli rendering pdf <url> --out ./page.pdf
extension-cli rendering pdf <url> --output ./reports/ --wait-until networkidle0 --timeout 45000
```

## Crawl APIs

```bash
extension-cli rendering crawl <url> --wait
extension-cli rendering crawl <url> --no-wait
extension-cli rendering crawl-result <jobId>
extension-cli rendering crawl-cancel <jobId>
```

## Advanced Payload Controls

```bash
extension-cli rendering markdown https://example.com --body '{"gotoOptions":{"waitUntil":"networkidle0","timeout":45000}}'
extension-cli rendering json https://example.com --schema-file ./schema.json
extension-cli rendering screenshot https://example.com --body-file ./payload.json --out ./shot.png
```
