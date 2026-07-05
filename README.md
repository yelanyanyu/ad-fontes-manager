<!--
 * @Author: yelanyanyu
 * @Date: 2026-05-03
 * @Description: Ad Fontes Manager — README
-->

<div align="center">

# Ad Fontes Manager

<img src="src/renderer/public/logo.png" alt="Ad Fontes Logo" width="96" height="96" />

[![GitHub stars](https://img.shields.io/github/stars/yelanyanyu/ad-fontes-manager?style=flat-square)](https://github.com/yelanyanyu/ad-fontes-manager/stargazers)
[![GitHub license](https://img.shields.io/github/license/yelanyanyu/ad-fontes-manager?style=flat-square)](./LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/yelanyanyu/ad-fontes-manager?style=flat-square)](https://github.com/yelanyanyu/ad-fontes-manager/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Web-blue?style=flat-square)](#)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/yelanyanyu/ad-fontes-manager)

Ad Fontes 英语/德语词源词条管理工具。它把 AI 生成、YAML 修订、词条预览、SQLite 存储、词条迁移和 Anki 导出放在同一个桌面/Web 工作流里。

[下载](https://github.com/yelanyanyu/ad-fontes-manager/releases) · [零基础教程](./docs/TUTORIAL.md) · [开发指南](./docs/DEVELOPMENT.md) · [发布记录](./CHANGELOG.md)

</div>

---

<img width="1672" height="941" alt="Ad Fontes Manager screenshot" src="https://github.com/user-attachments/assets/e06b4a75-3a8b-4646-9b56-c93b79a833b9" />

## 能做什么

- **AI 生成词条**：多阶段流水线生成英语/德语词源 YAML，支持搜索、创意扩写、审核、修复、批量队列和当前结构生成校验。
- **YAML 编辑与修复**：CodeMirror 编辑器提供实时校验、行内错误标记、层级导航、智能缩进、Basic Format Fix、重复键诊断和当前 schema 参考面板。
- **词条结构版本**：保存的词条会记录 Word Schema Version；旧结构词条以温和提示展示，可无损维护，也可重新生成到当前结构。
- **词条管理**：SQLite 本地数据库保存词条，支持搜索、排序、分页、多语言切换、批量删除、JSON 无损导入导出和冲突检测。
- **预览与导出**：Word Preview、生成结果预览和 Anki 导出共用内置词卡 HTML，支持 AnkiConnect 导入、`.apkg` 文件导出和词条 JSON 迁移。
- **桌面优先**：Windows/macOS Electron 应用支持自定义数据目录、自动更新和本地运行；同一代码库也支持 Web 模式。

## 快速开始

### 安装桌面版

从 [GitHub Releases](https://github.com/yelanyanyu/ad-fontes-manager/releases) 下载最新安装包：

- Windows: `ad-fontes-manager-<version>-win-x64-setup.exe`
- macOS: `ad-fontes-manager-<version>-mac-<arch>.dmg`

第一次使用建议先看 [docs/TUTORIAL.md](./docs/TUTORIAL.md)，它覆盖 AI 配置、生成第一个词条、保存和导出到 Anki。

### 本地开发

环境要求：

- Node.js 22 LTS 或更高版本
- pnpm 11 或更高版本
- 可选：Anki + [AnkiConnect](https://ankiweb.net/shared/info/2055492159)

```bash
git clone https://github.com/yelanyanyu/ad-fontes-manager.git
cd ad-fontes-manager
pnpm install
cp .env.example .env
cp config.example.json config.json
```

启动 Web 开发模式：

```bash
pnpm run dev:web
```

启动桌面开发模式：

```bash
pnpm run dev:desktop
```

## 常用命令

```bash
# 开发
pnpm run dev:web
pnpm run dev:desktop
pnpm run dev:server
pnpm run dev:renderer

# 检查
pnpm run type-check
pnpm run lint
pnpm run test

# 构建
pnpm run build:web
pnpm run build:desktop:win
pnpm run build:desktop:mac

# 数据库维护
pnpm run db:init
pnpm run db:import
pnpm run db:view
pnpm run db:diff
```

桌面构建会切换 `better-sqlite3` 的原生模块 ABI。构建后如果要继续跑 Node/Web 命令，执行：

```bash
pnpm run native:node
```

## 架构速览

```text
src/
├── main/        # Electron 主进程
├── preload/     # contextBridge 预加载桥
├── renderer/    # Vue 3 + Pinia 前端
└── server/      # Express API、AI 流水线、SQLite/Drizzle 数据层

docs/
├── adr/         # 架构决策记录
├── agents/      # Agent 工作流说明
├── prompts/     # AI prompt 模板
└── releases/    # 单版本发布说明
```

核心技术栈：

| 层级   | 技术                                                        |
| ------ | ----------------------------------------------------------- |
| 前端   | Vue 3, Pinia, Vite, Tailwind CSS                            |
| 桌面   | Electron, electron-vite, electron-builder                   |
| 后端   | Express, Zod, Pino                                          |
| AI     | Vercel AI SDK, OpenAI/Anthropic/OpenAI-compatible providers |
| 数据库 | SQLite, better-sqlite3, Drizzle ORM                         |
| 导出   | AnkiConnect, anki-apkg-export                               |

## 文档地图

优先阅读：

- [docs/TUTORIAL.md](./docs/TUTORIAL.md)：面向新用户的完整使用流程。
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)：开发环境、架构、调试和常见问题。
- [docs/API.md](./docs/API.md)：HTTP API 端点参考。
- [docs/CONFIGURATION.md](./docs/CONFIGURATION.md)：`.env`、`config.json` 和 AI provider 配置。
- [docs/JOB_QUEUE.md](./docs/JOB_QUEUE.md)：AI 作业队列、状态机、SSE 事件和并发规则。
- [docs/ELECTRON_NATIVE_MODULES.md](./docs/ELECTRON_NATIVE_MODULES.md)：Electron/Node 原生模块 ABI 切换手册。
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)：桌面构建、Docker/Web 部署、备份恢复。
- [docs/adr/0005-word-schema-version.md](./docs/adr/0005-word-schema-version.md)：Word Schema Version 的存储、导入和旧词条维护规则。
- [docs/prompts/](./docs/prompts/)：英语/德语 AI prompt 与当前词条 schema 参考。

给 Agent 和维护者看的入口：

- [AGENTS.md](./AGENTS.md)：仓库级 agent 工作规则。
- [CONTEXT.md](./CONTEXT.md)：领域词汇和当前系统语义。
- [DESIGN.md](./DESIGN.md)：产品设计原则和 UI 约束。
- [docs/adr/](./docs/adr/)：已经定下的架构决策。
- [docs/agents/](./docs/agents/)：issue、triage、domain 约定。

## 配置与数据

- `.env`：基础设施配置，例如 `DATABASE_URL`、`ADMIN_TOKEN`、AnkiConnect 地址。
- `config.json`：应用运行时配置，例如 AI provider、模型、搜索 API、审核阈值。
- Web 数据库默认位置：`data/ad_fontes.db`
- 桌面数据库默认位置：`%APPDATA%/ad-fontes-manager/data/ad_fontes.db`

## 贡献

欢迎提交 issue 和 PR。提交信息请遵循 [Conventional Commits](https://www.conventionalcommits.org/)。

发布记录见 [CHANGELOG.md](./CHANGELOG.md) 和 [GitHub Releases](https://github.com/yelanyanyu/ad-fontes-manager/releases)。

## 许可证

本项目采用 [GNU Affero General Public License v3.0](./LICENSE)。
