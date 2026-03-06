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
- `cd web && npm run lint` or `cd web/client && npm run lint`: ESLint checks.
- `cd web/client && npm run test`: run Vitest unit tests.
- `cd web && npm run test-api`: run the existing API smoke script against a running server.

## Coding Style & Naming Conventions

Use TypeScript-first changes and replace nearby `any` usages when you touch them. Prettier enforces 2-space indentation, single quotes, semicolons, trailing commas (`es5`), and 100-character lines. Keep Vue components and views in PascalCase like `EditorView.vue`; composables use `useX.ts`; stores use `xStore.ts`; backend modules use descriptive singular names such as `wordService.ts` and `wordController.ts`.

## Testing Guidelines

Place frontend tests beside the source as `*.test.ts` (for example `src/utils/search.test.ts`). Backend tests live in `web/tests/`. There is no enforced global threshold yet, but the project target is 60% coverage for new code and current overall coverage is low, so every feature or bug fix should add at least one focused automated test plus the relevant manual/API verification.

## Commit & Pull Request Guidelines

Follow Conventional Commits: `type(scope): subject`. Recent history uses patterns like `refactor(config): ...` and `fix(security): ...`. Keep commits scoped and descriptive. PRs should explain the user-facing change, list verification commands run, link the related issue or task, and include screenshots when UI behavior changes. Never commit `.env`; start from `.env.example` instead.
