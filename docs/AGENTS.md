# Ad Fontes Manager - Agent Guide

## Quick Reference

**When starting work:**
1. Read `CLAUDE.md` for project overview and architecture
2. Based on your task, load the relevant doc from `docs/`

**Task → Document Mapping:**

| Task | Document |
|------|----------|
| First time on project | `docs/DEVELOPMENT.md` |
| Backend / API work | `docs/API.md` |
| Frontend / Vue work | `docs/DEVELOPMENT.md` (前端开发 section) |
| Database changes | `docs/DATABASE.md` |
| Security review | `docs/SECURITY.md` |
| Configuration | `docs/CONFIGURATION.md` |
| Deployment | `docs/DEPLOYMENT.md` |
| Logging / Debugging | `docs/LOGGING.md` |
| Desktop / Electron | `CLAUDE.md` (Electron architecture section) |

## Development Commands

```bash
# Setup
npm install

# Development
npm run dev:web              # Web mode: backend + frontend
npm run dev:desktop          # Electron desktop mode
npm run dev:server           # Backend only
npm run dev:renderer         # Frontend only

# Quality checks
npm run type-check           # TypeScript check
npm run lint                 # ESLint
npm run format               # Prettier

# Tests
npm run test                 # Vitest frontend unit tests
npm run test-api             # API smoke tests
```

## Critical Rules

1. Always read `CLAUDE.md` first when starting work
2. Never commit `.env` files or credentials
3. Run `npm run lint` before committing; fix all errors
4. All write operations require `X-Admin-Token` header
5. v1 API (`/api/words`) is frozen — do not modify. All new work goes in v2 (`/api/v2/words`)
6. New validation must use Zod schemas under `web/schemas/` — no ad-hoc manual validation
7. Replace nearby `any` usages when touching code
8. Desktop and web modes must both work — always test or at minimum keep fallback paths
9. `window.electronAPI` may be undefined (web mode) — always guard with optional chaining (`?.`)

## Key Architectural Notes

- **v2 single-table design**: `words_v2` stores full YAML as JSON in `content` column. No multi-table joins needed for word data.
- **Electron**: Main process runs Express, preload exposes limited API via `contextBridge`, renderer is standard Vue 3. Port is random each launch — localStorage is NOT persistent across restarts.
- **Auth flow in desktop**: Main process sets `process.env.ADMIN_TOKEN` → preload exposes `electronAPI.adminToken` → `writeAuth.ts` resolves token chain.
- **Database**: SQLite via `better-sqlite3` with WAL mode. Orphan `-wal`/`-shm` files can corrupt data if a replacement DB is copied while the app is closed.

## External Resources

- Vue 3: https://vuejs.org/
- Express: https://expressjs.com/
- Pinia: https://pinia.vuejs.org/
- Electron: https://www.electronjs.org/
- Drizzle ORM: https://orm.drizzle.team/
