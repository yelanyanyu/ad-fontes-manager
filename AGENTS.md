# Ad Fontes Manager Agent Guide

Ad Fontes Manager is a Vue 3 + Express + Electron app for generating, reviewing, improving, and exporting multilingual etymology-based word entries.

## Start Here

- Use CodeGraph before broad code exploration or edits. Prefer `codegraph_context` for feature, architecture, and bug questions; use `codegraph_files` for project structure; use focused file reads only after CodeGraph narrows the target.
- Check [CONTEXT.md](CONTEXT.md) for domain terms and [docs/adr/](docs/adr/) for hard-to-reverse decisions.
- Check [DESIGN.md](DESIGN.md) before UI, layout, dialog, table, or interaction changes. It is the source of truth for product feel, modal usage, Queue UI rules, responsive behavior, and accessibility expectations.
- Agent workflow docs live in [docs/agents/domain.md](docs/agents/domain.md), [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md), and [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

## Local Rules

- Use UTF-8 for all file reads and writes. In PowerShell, start commands with `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;`.
- Command safety is shared by Claude and Codex hooks through [scripts/agent-hooks/guard-command.js](scripts/agent-hooks/guard-command.js).
- Codex verification reminders are configured in [.codex/hooks.json](.codex/hooks.json).
- Use PowerShell `Select-String` for text searches and `apply_patch` for manual edits; these are also enforced by hooks.
- Preserve user changes in the working tree.

## Commands

Run commands from the repository root.

```bash

npm run dev:desktop
npm run type-check
npm run lint
npm run test
npm run test-api
npm run build:desktop:win
```

After any desktop build, verify native modules are restored for Node:

```bash
node -e "require('better-sqlite3')"
```

## Architecture Pointers

- Words API is v2-only: `/api/v2/words`. The legacy `/api/words` v1 API has been removed.
- The database is SQLite via better-sqlite3 and Drizzle. `words_v2.content` is the JSON source of truth.
- Prefer Zod schemas for new request validation, config parsing, shared contracts, and boundary parsing.
- Desktop mode uses Electron with `contextIsolation: true` and `nodeIntegration: false`; keep renderer access behind the preload bridge.

## Verification

- Run `npm run type-check` and `npm run lint` after code changes; Codex hooks remind before final response when these are missing.
- Add or update focused tests for behavior changes where practical.
- For UI changes, verify the relevant desktop or web flow manually and include screenshots in PRs when useful.
