# Changelog - Ad Fontes Manager

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.7.0] - 2026-04-29

### Added

- Multi-language support with v2 API (`/api/v2/words`) and `words_v2` table.
- German word support with full etymological analysis: `morphological_analysis`, `historical_phonology` (Grimm/Verner laws, OHG/MHG), `historical_semantics`, `dialectal_notes`, `observations`, `genus`, `kasus`.
- Language-specific Zod validation schemas (`EnglishWordSchema`, `GermanWordSchema`) in `web/schemas/word/`.
- Language detection: auto-detects language from YAML content (`contextual_meaning.de` presence, `yield.language` field).
- Language switcher in Header (flag dropdown, localStorage persistence, list auto-refresh).
- Language-adaptive preview rendering (card HTML + Markdown) in `generator.ts` for both English and German YAML structures.
- `WordServiceV2`, `WordRepositoryV2`, `WordAssemblerV2` — single-table JSONB backend pipeline.
- Database migration `20260429_language_decoupling.up.sql` with 321-word data migration.
- 14 integration tests for v2 API (`tests/words-v2-api.test.ts`).

### Changed

- Frontend fully migrated to v2 API for all word operations (list, save, delete, preview, Anki export).
- `WordValidator.validate()` now accepts optional `language` parameter.
- `generator.ts` rewritten with language detection — renders German-specific fields (components table, phonology chain, dialect notes, etc.).
- `appStore` extended with `currentLanguage` state, persisted to localStorage.
- API docs updated with full v2 endpoint reference.

### Database

- New `words_v2` table: `id`, `lemma`, `language`, `part_of_speech`, `content` (JSONB).
- `UNIQUE(lemma, language)` constraint — same lemma can exist in multiple languages.
- Old 6 tables (`words`, `etymologies`, `cognates`, `examples`, `synonyms`, `user_requests`) preserved for backward compatibility.

## [1.6.0] - 2026-03-28

### 新增

- 新增单词到 Anki 的完整导出流程，支持 AnkiConnect 和 `.apkg` 导出。
- 新增共享的 Anki 导出 payload 生成逻辑，确保单条导出和批量导出使用同一套 HTML 样式和字段映射。
- 新增批量导出到 Anki 的能力。
- 新增批量重复检测，以及对重复项统一跳过或覆盖的处理方式。
- 新增批量列表里的 `Preview HTML` 入口。
- 在 `WordList` 中新增跨页保留选择。
- 在工具栏中新增 `Clear Selection` 和总选中数显示。
- 新增 `Select All Matching`，可以按当前搜索条件选中全部匹配结果。
- 新增大批量选择确认提示；当 `Select All Matching` 超过 `150` 个词条时，会先要求确认。
- 新增后台批量任务；关闭批量弹窗后，重复检测和导入仍可继续执行。
- 在主界面新增简化版批量任务进度显示。
- 新增可恢复的批量任务面板；用户返回主界面后，可以重新打开同一个任务。
- 新增基于 Pinia 的批量任务会话状态，用于当前 SPA 会话内的状态保留。
- 新增批量导出 helper、选择 helper、`select-all-matching` helper 和批量任务 store 的测试。

### 变更

- 将单条导出和批量导出的默认 Anki tags 改为空。
- 调整批量导出交互，使其复用单条导出的配置模型。
- 将批量弹窗从一次性操作窗口改为可隐藏、可重新打开的任务详情面板。
- 调整导出配置行为；批量检查或导入开始后，deck、model、reverse card 和 tags 会锁定。
- 调整选择语义；表头复选框只作用于当前页，但整体选择集可以跨页保留。

### 修复

- 修复批量导出 payload 依赖当前页数据的问题，避免翻页后已选词条无法继续导出。
- 修复重复项处理流程，让未决议的重复项在导入前保持可见，并能在一次批量操作中统一处理。

### 文档

- 更新 README，补充批量导出、跨页选择、`Select All Matching` 和后台任务的说明。

## [1.5.0] - 2026-03-06

### Added

- Completed TypeScript migration across frontend, backend, and Node maintenance scripts.
- Added layered type checking commands.
- Added database typings and initialization support.
- Added the word service module and related backend structure.

### Changed

- Refactored major frontend components such as `WordList` and `WordEditor`.
- Improved build flow and Docker support for TypeScript-based builds.
- Cleaned up deprecated files and project structure.

## [1.4.0] - 2026-03-05

### Added

- Introduced a 12-factor configuration model based on environment variables.

### Changed

- Improved the logging system and error handling flow.
- Updated editor context handling and configuration validation behavior.

### Fixed

- Fixed YAML validation edge cases.
- Fixed rendering issues caused by duplicated DOM structure.
- Fixed overwrite-word behavior.

## [1.3.0] - 2026-03-05

### Added

- Added structured Pino logging.
- Added global state management helpers.
- Added global error handling middleware and custom error types.
- Added runtime config management through `/api/core/config`.

### Changed

- Refactored word services into a more maintainable multi-file structure.
- Corrected database field mapping for several YAML-backed entities.
- Consolidated documentation into the `docs/` directory.

### Security

- Added Helmet-based security headers.
- Protected `/api/core/config` with admin-token authentication.
- Removed sensitive config artifacts from tracked history.
- Improved connection-pool safety defaults.

## [1.2.3] - 2026-01-26

### Added

- Added preview integration with rich card and Markdown modes.
- Added stronger YAML validation in the editor.
- Added list-level quick access to preview views.

### Changed

- Refactored the main layout into a sidebar-based application shell.
- Improved list-toolbar search placement and general UI behavior.

## [1.2.2] - 2026-01-20

### Added

- Added downloadable word card image generation.
- Added server-side pagination and on-demand detail loading.
- Added exact-match search mode with persisted settings.
- Added backend endpoints for adding words and retrieving word details.

### Changed

- Rebuilt the frontend around Vue 3 and Vite.

## [1.2.0] - 2026-01-15

### Added

- Added conflict detection and resolution in the v2 workflow.
- Added the web service that writes YAML word data into PostgreSQL.

## [1.1.0] - 2026-01-10

### Added

- Added offline-first storage with LocalStorage and PostgreSQL.
- Added automatic sync from local storage to the online database.
- Added visual diff tooling for conflict inspection.

## [1.0.0] - 2026-01-01

### Added

- Initial release.
- Basic word management.
- YAML editor support.
