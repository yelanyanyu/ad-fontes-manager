# Repository Guidelines

## Project Structure & Module Organization

The application supports both web and desktop (Electron) modes from a single codebase.

- `src/main/` — Electron main process, window management, Express lifecycle, IPC handlers
- `src/preload/` — contextBridge preload script, exposes `electronAPI` to renderer
- `src/renderer/` — Vue 3.5 frontend (Vite 7, Pinia 3, Vue Router 4, Tailwind CSS 3)
- `src/server/` — Express 5 backend shared between web and desktop modes
  - `db/` — better-sqlite3 + Drizzle ORM, connection management, schema
  - `services/word/` — WordServiceV2, WordRepositoryV2, WordAssemblerV2, WordValidator
  - `services/anki/` — AnkiConnect relay and APKG export
  - `routes/`, `controllers/`, `middleware/` — API routing and request handling
  - `schemas/` — Zod validation schemas (config, words, requests)
  - `utils/` — config, logger, errors
- `node/` — CLI maintenance tools: `init_db.ts`, `loader.ts`, `view-word-yaml.ts`, `check-word-diff.ts`
- `drizzle/` — Drizzle ORM migration SQL files (applied by `node/init_db.ts`)
- `data/` — SQLite database files (runtime only, git-ignored)
- `docs/` — Project documentation including [ELECTRON_NATIVE_MODULES.md](docs/ELECTRON_NATIVE_MODULES.md)

Read [CLAUDE.md](CLAUDE.md) for a complete architecture overview before making major changes.

## Build, Test, and Development Commands

All commands run from the repository root.

```bash
# Development
npm run dev:web              # Web mode: Express backend + Vite frontend
npm run dev:desktop          # Electron desktop dev mode
npm run dev:server           # Express API only (tsx watch)
npm run dev:renderer         # Vite dev server only

# Build
npm run build:web            # Vite build for web
npm run build:desktop:win    # Windows NSIS installer
npm run build:desktop:mac    # Mac DMG

# Quality
npm run type-check           # vue-tsc + tsc --noEmit
npm run lint                 # ESLint 9 flat config
npm run lint:fix             # Auto-fix lint issues
npm run test                 # Vitest frontend unit tests
npm run test-api             # API smoke tests

# Database tools
npm run db:init              # Initialize SQLite database
npm run db:import            # Import YAML file into database
npm run db:view              # View word entry in YAML format
npm run db:diff              # Compare DB entry with YAML file

# Formatting
npm run format               # Prettier --write
```

## Electron Desktop Build

The desktop build requires special handling for native C++ modules:

```bash
npm run build:desktop:win
# 1. electron-vite build           — compile main/preload/renderer
# 2. tsc                            — compile server code
# 3. @electron/rebuild              — rebuild better-sqlite3 for Electron ABI (140)
# 4. electron-builder --win         — package NSIS installer
# 5. restore-native-after-desktop   — restore better-sqlite3 to Node ABI (127)
```

**Critical**: After desktop build, verify `node -e "require('better-sqlite3')"` passes to confirm dev environment restored. See [docs/ELECTRON_NATIVE_MODULES.md](docs/ELECTRON_NATIVE_MODULES.md).

## Coding Style & Naming Conventions

Use TypeScript-first changes and replace nearby `any` usages when you touch them. Default to Zod for all new boundary validation and type derivation: new request validation, config parsing, shared input/output contracts, and reusable parsing helpers should start from schemas under `src/server/schemas/`, with TypeScript types inferred from those schemas where practical. Avoid adding ad-hoc manual validation for new code when a Zod schema is the natural fit. Prettier enforces 2-space indentation, single quotes, semicolons, trailing commas (`es5`), and 100-character lines. Keep Vue components and views in PascalCase like `EditorView.vue`; composables use `useX.ts`; stores use `xStore.ts`; backend modules use descriptive singular names such as `WordServiceV2.ts` and `wordControllerV2.ts`. Always run `npm run lint` after modifications and fix all errors before committing.

## Testing Guidelines

Place frontend tests beside the source as `*.test.ts` (for example `src/renderer/src/utils/search.test.ts`). Backend API integration tests live in `src/server/` beside their target modules. There is no enforced global threshold yet, but the project target is 60% coverage for new code and current overall coverage is low, so every feature or bug fix should add at least one focused automated test plus the relevant manual/API verification.

- Frontend unit tests: `npm run test` (Vitest)
- API smoke tests: `npm run test-api`

## Commit & Pull Request Guidelines

Follow Conventional Commits: `type(scope): subject`. Recent history uses patterns like `refactor(anki): ...` and `fix(security): ...`. Keep commits scoped and descriptive. PRs should explain the user-facing change, list verification commands run, link the related issue or task, and include screenshots when UI behavior changes. Never commit `.env` or `config.json`; start from `.env.example` instead.

## Architecture Notes

- **Database**: SQLite via better-sqlite3 + Drizzle ORM. Single-table design (`words_v2`) with JSON `content` column as the single source of truth. WAL mode enabled.
- **Vertical Slicing**: Services are organized by domain (e.g., `src/server/services/word/` contains WordValidator, WordRepository, WordAssembler, WordService)
- **Validation**: Zod schemas preferred for boundary validation under `src/server/schemas/`
- **Security**: Helmet configured for security headers; sensitive files excluded from Git history
- **Desktop Security**: contextBridge with `contextIsolation: true`, `nodeIntegration: false`
- **Config**: 12-factor style env vars mapped to nested config object, validated by Zod. Desktop mode sets `ADFONTES_DESKTOP=1` to skip production `.env` checks.

## Multi-Language Architecture (v2)

### Database
- **`words_v2` table**: Single-table design with `content` JSON column as the single source of truth. Identity columns (`lemma`, `language`, `part_of_speech`) for querying; all YAML content stored in `content`.
- **Language constraint**: `UNIQUE (lemma, language)` — same lemma can exist in multiple languages (e.g., English "see" and German "See").

### API Layers
- **v1 API** (`/api/words`): Legacy, English-only. Uses old 6-table schema. Preserved for backward compatibility; **do not modify**.
- **v2 API** (`/api/v2/words`): Multi-language, JSON-first. All new code should use v2. Supports `?language=en|de` query parameter for filtering.

### Backend Service Layers
- **v2 (current)**: `WordServiceV2.ts`, `WordRepositoryV2.ts`, `WordAssemblerV2.ts` — operate on single `words_v2` table.
- **Language detection**: `WordServiceV2.detectLanguage()` — checks `yield.language` field, then `contextual_meaning.de` presence, defaults to `'en'`.
- **Validation**: `WordValidator.validate(data, wordLower, language?)` — selects `EnglishWordSchema` or `GermanWordSchema` based on language parameter.

### German YAML Format
Key differences from English: `contextual_meaning.de` instead of `.en`, `morphological_analysis` instead of `root_and_affixes`, plus `historical_phonology`, `historical_semantics`, `dialectal_notes`, `observations`, `genus`, `kasus`.

### Frontend API Usage
- **All frontend code uses v2 API** (`/api/v2/words`). Migration completed 2026-04-29.
- `appStore.currentLanguage` (default `'en'`) controls language filtering in API calls.
