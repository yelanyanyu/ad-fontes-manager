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
