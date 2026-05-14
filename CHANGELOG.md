# Changelog - Ad Fontes Manager

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [2.0.0] - 2026-05-15

### 新增

- **AI 批量生成**：新增批量输入面板，支持多词条同时提交，自动排队处理。
- **AI 作业队列系统**：完整的任务队列引擎（JobQueue），支持并发池配置、暂停/恢复/取消、断点续传。
- **AI 作业历史**：队列历史面板，查看已完成/已取消的生成任务，可恢复继续处理。
- **AI 工作集**：支持将今日生成的结果批量保存，统一管理当天产物。
- **AI 暂停/恢复**：单任务级别暂停和恢复，队列面板中可视化操作。
- **AI 审核评分展示**：生成完成后展示审核评分（overall_score）和各字段评分详情。
- **AI 内容修复流程**：新增 `fixing` 和 `auditing` 两个修复阶段，审核不达标可自动修复（audit-fix 流水线）。
- **推理努力配置**：每个流水线阶段可独立配置推理努力（reasoningEffort：none ~ xhigh）。
- **第三方 OpenAI 兼容厂商适配**：引入 `@ai-sdk/openai-compatible`，支持硅基流动、DashScope、AIHubMix 等厂商，自动处理 `/chat/completions` 端点和 `enable_thinking` 等厂商特有参数。
- **确认弹窗组件**：`useConfirmDialog` composable 替代原生 `confirm()`，统一 UI 交互。
- **新手引导系统**：5 步交互式引导（OnboardingTour），覆盖生成、编辑、保存、预览、导出流程，支持重放。
- **YAML 层级面包屑**：编辑器底部显示 YAML 层级路径导航，点击可快速跳转。
- **智能缩进**：Tab / Shift+Tab 智能调整 YAML 缩进，缩进深度标记可视化。
- **排序模式**：词条列表支持最新添加、最早添加、A-Z、Z-A 四种排序。
- **搜索清除 / 清空选择**：搜索框和词条列表工具栏新增一键清除功能。
- **版本号与版权**：Settings > About 页面显示应用版本号和 Copyright，版本号从 `package.json` 读取。
- **应用自定义图标**：Windows `.exe` 内嵌自定义图标（`assets/icon.ico`），安装包和快捷方式统一使用。
- **Prompt 模板重构**：静态/动态分离，新增 content-fixer 和 format-fixer 模板，content-reviewer 反 AI 风格分层审查（Tier 1 严格 / Tier 2 放宽 + 转折呼应规则）。

### 变更

- AI 流水线从 3 段（searching → pondering → auditing）扩展为可配置 4 段（+ fixing）。
- AI 提供商系统重构：OpenAI 官方、OpenAI 兼容厂商、Anthropic 格式三条路径独立处理。
- Prompt 构建逻辑重构：新增 schema 文件支持，assembler 按阶段动态组装。
- AI 工具调用重构：支持 AbortController 可中止请求，优化限流与重复任务检测。
- 作业队列上下文处理重构：新增排序模式校验，清理冗余逻辑。
- 批量 Anki 导出优化：统一前置准备与并行处理，后台任务非阻塞。
- 词条列表查询简化：移除废弃的 `listAll` 方法，新增小写 lemma + language 组合索引优化查询性能。
- UI 组件整理：清空选择按钮样式优化，侧边面板和批量生成 UI 重设计。
- 项目文档重构：提示词、任务计划、需求文档分类整理到 `docs/task/`。

### 修复

- 修复批量请求污染问题：添加加载状态和请求去重。
- 修复 AI 作业队列限流和重复任务检测逻辑。
- 修复词条列表排序模式切换后状态不一致的问题。
- 修复 Electron 开发模式 API 代理配置。
- 修复 `@ai-sdk/openai` v3 默认 Responses API 导致的硅基流动 404 错误。
- 修复 WordEditor 多处 UI 细节（状态指示器、滚动条主题适配等）。

### 文档

- 新增 `docs/JOB_QUEUE.md`：AI 作业队列系统完整文档。
- 更新 `docs/DEVELOPMENT.md`：补充 AI 流水线架构、YAML 编辑器、批量生成。
- 更新 `docs/API.md`：新增批量生成、暂停/恢复、作业历史、工作集等端点。
- 更新 `docs/CONFIGURATION.md`：补全 AI 提供商预设字段和端点类型说明。
- 更新 `docs/AGENTS.md`：修正过时路径，补充新系统引用。
- 更新 `README.md`：新增批量生成、作业队列、版本号等功能说明。
- README 新增 Logo 展示和应用截图。

### 移除

- 移除 FontAwesome 依赖，全部使用内联 SVG 图标。
- 移除废弃的 6 表 PostgreSQL schema（v1 API），统一使用 `words_v2` 单表 JSONB 架构。
- 移除 `listAll` 方法和不再使用的配置模板。

## [1.8.1] - 2026-05-04

### 新增

- 亲生命设计系统：基于 CSS 自定义属性的亮色/暗色双主题，支持跟随系统 + 手动切换。
- Topbar 快捷主题切换按钮：一键在亮色/暗色之间切换。
- YAML 编辑器行号列：随文本滚动同步，颜色随校验状态变化（绿/红/灰）。
- 应用全局玻璃拟态顶栏、固定宽度图标侧栏、统一面板容器与阴影系统。

### 变更

- 图标系统全面迁移：移除 FontAwesome 依赖，全部使用内联 SVG 图标。
- 字体栈更新：Inter（UI 正文）+ JetBrains Mono（代码），衬线回退至 Georgia。
- 侧边栏重构：从可折叠文字菜单改为 58px 固定图标模式，hover tooltip 显示导航名称。
- 词表表格重设计：HTML table 替换为 CSS Grid 布局，Lemma 列使用衬线字体，行操作按钮 hover 渐显。
- 工具栏、分页、弹窗、Toast 等组件统一使用设计 tokens。
- Logo 从 SVG 切换为 PNG，应用于 Web、桌面图标和 README。
- Tailwind 颜色配置桥接至 CSS 变量，保持工具类便利性的同时支持主题切换。

### 文档

- README 新增 Logo 展示。
- 桌面应用图标：Windows 和 macOS 构建统一使用 `assets/icon.png`。

### 修复

- 表格高度约束修复：`min-height` → `height` 使 Grid 子元素正确产生滚动条。
- Column 按钮下拉菜单定位修复。
- 新手引导 `data-tour` 属性恢复，5 步引导全部正常。
- YAML 编辑器状态指示器动态变色（原来始终为绿色）。
- 自定义滚动条适配亮/暗双主题。
- Settings 页面滚动修复：`.panel-body` 添加 `overflow-y: auto`，面板内容可正常滚动。
- 布局高度链修复：`100vh` → `100%`，`#app` 加入高度继承链，解决 Electron 窗口内布局溢出问题。
- Electron 开发模式 API 代理修复：`electron.vite.config.mts` 新增 `/api` 反向代理，主进程支持 `ELECTRON_RENDERER_URL` 环境变量。

## [1.8.0] - 2026-05-03

### 新增

- Electron 桌面应用：Windows (NSIS 安装包) 和 macOS (DMG) 原生构建，支持 `npm run dev:desktop` 开发模式。
- 桌面模式单例限制：防止同时运行多个桌面实例。
- 桌面端配置持久化：数据目录可用户自定义，通过 Settings 页面选择。
- 桌面端自动认证：主进程注入 `ADMIN_TOKEN`，preload 通过 `contextBridge` 暴露给渲染进程，无需手动配置。
- Anki 配置状态检查：启动时检测 AnkiConnect 可用性，提前发现配置问题。
- SQLite 数据库 (better-sqlite3 + Drizzle ORM)：替代 PostgreSQL，零依赖部署，WAL 模式启用。
- 数据库 CLI 工具：`npm run db:init`（初始化）、`db:import`（YAML 导入）、`db:view`（查看词条）、`db:diff`（对比差异）。
- 可配置化 Anki 字段映射：用户可自定义 Anki 笔记类型字段与导出字段的对应关系。
- 支持通过 ID 列表批量导出 APKG 文件。

### 变更

- 项目结构重构：移除 `web/` 目录，代码按职责分为 `src/main/`（Electron 主进程）、`src/preload/`（预加载）、`src/renderer/`（Vue 前端）、`src/server/`（Express 后端）。
- 数据库从 PostgreSQL 迁移至 SQLite，`words_v2` 单表 JSONB 架构不变。
- 重构 Anki 字段提取器，内联卡片生成逻辑，提升可维护性。
- 构建脚本优化：新增 `npm run build:desktop:win` / `build:desktop:mac` / `rebuild:electron:native` 等命令。
- 许可证从 MIT 更改为 AGPL-3.0-only。

### 修复

- 修复 APKG 导出时 model CSS 未包含的问题。
- 修复桌面端原生模块 ABI 兼容性问题（Node.js vs Electron better-sqlite3 构建）。
- 移除 `addReverse` 校验，改为从 AnkiConnect 拉取 CSS 配置。

### 文档

- 新增 `docs/ELECTRON_NATIVE_MODULES.md`：Electron 原生模块构建调试文档。
- 更新 README：补充桌面应用安装说明和项目截图。

## [1.7.0] - 2026-04-30

### 新增

- 多语言支持：v2 API (`/api/v2/words`) + `words_v2` 表单表 JSONB 架构，`language` 字段区分语种。
- 德语单词完整支持：`morphological_analysis`（形态分析）、`historical_phonology`（Grimm/Verner 定律、OHG/MHG 音变链）、`historical_semantics`（历史语义）、`dialectal_notes`（方言注释）、`observations`（语体观察），以及 `genus`（词性）、`kasus`（格位）。
- 语言感知的 Zod 校验 Schema：`EnglishWordSchema` / `GermanWordSchema`，拆分到 `web/schemas/word/` 目录。
- 语言自动检测：根据 YAML 内容中的 `contextual_meaning.de` 或 `yield.language` 字段判定语种。
- Header 全局语言切换：国旗下拉菜单，localStorage 持久化记忆，切换后列表自动刷新。
- 预览自适应渲染：`generator.ts` 重写，Card HTML 和 Markdown 均能根据语种渲染对应的词源结构（德语：组件表格、音韵链、方言注释等）。
- `WordServiceV2`、`WordRepositoryV2`、`WordAssemblerV2`：单表 JSONB 后端管线，代码量比旧 6 表方案减少 58%。
- 数据库迁移 `20260429_language_decoupling.up.sql`：321 条英语数据从 6 张旧表迁移至 `words_v2`。
- `POST /api/v2/words/validate`：客户端实时校验端点，不保存数据只返回 Schema 错误。
- YAML 编辑器实时 Schema 校验：输入时 300ms 防抖调用校验 API，红色错误列表显示层级错位或字段缺失。
- `strictObject()`：Zod 严格对象工具，拒绝任意层级的未知字段，防止字段错放。
- 14 个 v2 API 集成测试 (`tests/words-v2-api.test.ts`)。

### 变更

- 前端全线迁移至 v2 API：列表、保存、删除、预览、Anki 导出全部走 `/api/v2/words`。
- `WordValidator.validate()` 新增 `language` 可选参数，按语种选择校验 Schema。
- `WordServiceV2.saveWord()` 补上 Zod 校验环节（此前仅 `addWord` 校验，`saveWord` 绕过）。
- 英语和德语 Zod Schema 顶层启用 `.strict()`，所有嵌套对象改用 `strictObject()`，拒绝多余字段。
- 德语 Schema：`genus` 和 `kasus` 改为必填；`historical_phonology` 和 `historical_semantics` 作为合法词源子段。
- `appStore` 新增 `currentLanguage` 状态，localStorage 持久化。
- `defaultDbListMeta` 移除硬编码 `language: 'en'`。

### 修复

- YAML 字段层级错位（如 `visual_imagery_zh` 误放在 `historical_origins` 内）现在被前后端双重拦截。
- 启动时德语模式下显示英语数据的问题（`fetchDbRecords` 语言回退链修复）。
- Docker 健康检查 URL 修正（`/api/core/health` → `/api/health`）。

### 文档

- `docs/DEVELOPMENT.md`：新增「多语言支持」章节，含 4 步添加新语言指南。
- `docs/DATABASE.md`：新增 `words_v2` 表文档（ER 图、列定义、JSONB 结构示例、迁移说明）。
- `docs/API.md`：重写为完整 v2 API 参考（list/details/add/save/delete/validate/check）。
- `AGENTS.md`：新增多语言架构、v2 管线、德语 YAML 格式、测试命令等章节。

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
