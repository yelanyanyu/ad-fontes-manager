# Repository Guidelines

## Project Structure & Module Organization

The application is split by runtime. `web/` contains the Express 5 backend: `server.ts`, `routes/`, `controllers/`, `services/`, `middleware/`, `db/`, and shared helpers in `utils/`. `web/client/` is the Vue 3.5 frontend with source under `src/` (`components/`, `views/`, `stores/`, `composables/`, `utils/`, `types/`). `node/` holds maintenance scripts, while `migrations/`, `schema.sql`, and `docs/` cover database evolution and project documentation. Read `.opencode/skills/ad-fontes/SKILL.md` and `PROJECT_DIAGNOSTIC_REPORT.md` before major changes.

## Build, Test, and Development Commands

- `cd web && npm run dev`: start backend and Vite client together.
- `cd web && npm run dev:server`: run only the Express API on port `8080`.
- `cd web/client && npm run dev`: run only the Vue client.
- `cd web && npm run build`: build the frontend bundle.
- `cd web && npm run type-check`: backend TypeScript validation.
- `cd web/client && npm run type-check`: frontend Vue/TypeScript validation.
- `cd web && npm run lint` or `cd web/client && npm run lint`: ESLint checks (ESLint 9 Flat Config).
- `cd web && npm run lint:fix`: auto-fix ESLint issues.
- `cd web/client && npm run test`: run Vitest unit tests.
- `cd web && npm run test-api`: run the existing API smoke script against a running server.
- `docker-compose up -d --build`: build and start all services with Docker.

## Coding Style & Naming Conventions

Use TypeScript-first changes and replace nearby `any` usages when you touch them. Default to Zod for all new boundary validation and type derivation: new request validation, config parsing, shared input/output contracts, and reusable parsing helpers should start from schemas under `web/schemas/`, with TypeScript types inferred from those schemas where practical. Avoid adding ad-hoc manual validation for new code when a Zod schema is the natural fit. Prettier enforces 2-space indentation, single quotes, semicolons, trailing commas (`es5`), and 100-character lines. Keep Vue components and views in PascalCase like `EditorView.vue`; composables use `useX.ts`; stores use `xStore.ts`; backend modules use descriptive singular names such as `wordService.ts` and `wordController.ts`. Always run `npm run lint` after modifications and fix all errors before committing.

## Testing Guidelines

Place frontend tests beside the source as `*.test.ts` (for example `src/utils/search.test.ts`). Backend tests live in `web/tests/`. There is no enforced global threshold yet, but the project target is 60% coverage for new code and current overall coverage is low, so every feature or bug fix should add at least one focused automated test plus the relevant manual/API verification. Run `cd web/client && npm run test` for frontend tests and `cd web && npm run test-api` for API smoke tests.

## Commit & Pull Request Guidelines

Follow Conventional Commits: `type(scope): subject`. Recent history uses patterns like `refactor(config): ...` and `fix(security): ...`. Keep commits scoped and descriptive. PRs should explain the user-facing change, list verification commands run, link the related issue or task, and include screenshots when UI behavior changes. Never commit `.env` or `config.json`; start from `.env.example` and `config.json.template` instead.

## Architecture Notes

- **Vertical Slicing**: Services are organized by domain (e.g., `web/services/word/` contains WordValidator, WordRepository, WordAssembler, WordService)
- **Database**: Uses native `pg` driver with handwritten SQL; no ORM currently
- **Validation**: Zod schemas preferred for boundary validation under `web/schemas/`
- **Security**: Helmet configured for security headers; sensitive files excluded from Git history
- **Browser Support**: Targets modern browsers (Chrome 87+, Firefox 78+, Safari 14+, Edge 88+)

## Multi-Language Architecture (v2)

### Database
- **`words_v2` table**: Single-table design with `content` JSONB column as the single source of truth. Identity columns (`lemma`, `language`, `part_of_speech`) for querying; all YAML content stored in `content` JSONB.
- **Old tables preserved**: `words`, `etymologies`, `cognates`, `examples`, `synonyms`, `user_requests` are kept for backward compatibility during migration but are **no longer the primary data store**.
- **Data migration**: 321 English words migrated from old 6 tables into `words_v2.content` by directly copying `original_yaml` JSONB (not rebuilding from sub-table columns, which may be stale).
- **Language constraint**: `UNIQUE (lemma, language)` — same lemma can exist in multiple languages (e.g., English "see" and German "See").
- **Migration files**: `migrations/20260429_language_decoupling.up.sql` / `.down.sql`.

### API Layers
- **v1 API** (`/api/words`): Legacy, English-only. Uses old 6-table schema. Preserved for backward compatibility; no new features.
- **v2 API** (`/api/v2/words`): Multi-language, JSONB-first. All new code should use v2. Supports `?language=en|de` query parameter for filtering.

### Backend Service Layers
- **v1 (legacy)**: `WordService.ts`, `WordRepository.ts`, `WordAssembler.ts` — operate on old 6 tables. **Do not modify.**
- **v2 (current)**: `WordServiceV2.ts`, `WordRepositoryV2.ts`, `WordAssemblerV2.ts` — operate on single `words_v2` table. V2 Assembler is ~82% smaller than v1 (no sub-table management needed).
- **Language detection**: `WordServiceV2.detectLanguage()` — checks `yield.language` field, then `contextual_meaning.de` presence, defaults to `'en'`.
- **Validation**: `WordValidator.validate(data, wordLower, language?)` — selects `EnglishWordSchema` or `GermanWordSchema` based on language parameter.
- **Schemas**: `web/schemas/word/` directory with `helpers.ts`, `base.ts`, `english.ts`, `german.ts`, `index.ts`. Old `web/schemas/word.ts` is a re-export for backward compatibility.

### German YAML Format
- Defined in `docs/word-de2cn-yaml.md` (agent prompt spec) and `docs/german-word-parsing-feasibility-report.md` (technical analysis).
- Key differences from English: `contextual_meaning.de` instead of `.en`, `morphological_analysis` instead of `root_and_affixes`, plus `historical_phonology`, `historical_semantics`, `dialectal_notes`, `observations`, `genus`, `kasus`.
- German type definitions in `node/types/word-yaml.ts`.

### Frontend API Usage
- **All frontend code now uses v2 API** (`/api/v2/words`). Migration completed 2026-04-29.
- Only remaining v1 fallback: `useWordEditorLoader.ts` line 165 (last-resort when v2 and cache both fail).
- `appStore.currentLanguage` (default `'en'`) controls language filtering in API calls.

## Testing

### v2 API Tests
- `cd web && npx tsx --test --test-concurrency=1 tests/words-v2-api.test.ts` — 14 integration tests covering CRUD, language isolation, conflict detection, cross-language coexistence, and German-specific fields.
- **Run serially**: `--test-concurrency=1` is required; concurrent requests may overwhelm the dev server.
- `cd web && npx tsx tests/word-validator.test.ts` — 4 unit tests for WordValidator (English + language-aware).

### Database Migration Testing
```bash
# Apply migration
psql $DATABASE_URL -f migrations/20260429_language_decoupling.up.sql
# Verify
psql $DATABASE_URL -c "SELECT COUNT(*), language FROM words_v2 GROUP BY language;"
# Rollback
psql $DATABASE_URL -f migrations/20260429_language_decoupling.down.sql
```
