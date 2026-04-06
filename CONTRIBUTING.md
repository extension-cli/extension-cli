# Contributing

Thanks for your interest in contributing to `@extension-cli/cli`.

## Development Setup

1. Fork and clone the repository.
2. Install dependencies:

```bash
pnpm install
```

3. Build browser extension assets:

```bash
pnpm run build
```

4. Verify the CLI:

```bash
pnpm run check
pnpm run test:browser-api
```

## Pull Request Guidelines

1. Keep PRs focused and small.
2. Add or update tests for behavior changes.
3. Update docs when command behavior or flags change.
4. Use clear commit messages and PR descriptions (problem, change, verification).

## Code Style

1. Follow existing project style and file organization.
2. Prefer explicit, readable code over clever shortcuts.
3. Keep CLI UX consistent with existing commands and error messages.

## Reporting Issues

1. Use the issue tracker: https://github.com/extension-cli/extension-cli/issues
2. Include:
   - Environment (`node -v`, `pnpm -v`, OS, browser)
   - Command and flags
   - Expected result and actual result
   - Logs or screenshots if relevant

## Security

Please report sensitive issues privately. See `SECURITY.md`.
