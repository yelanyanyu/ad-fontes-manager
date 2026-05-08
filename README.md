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

Ad Fontes 英语/德语词汇学习体系中的词条管理工具。支持 YAML 编辑、实时预览、Anki 导出。

[功能概览](#功能概览) · [快速开始](#快速开始) · [构建](#构建) · [文档](./docs/) · [CHANGELOG](./CHANGELOG.md)

</div>

---

<img width="1672" height="941" alt="ChatGPT Image 2026年5月4日 22_15_39" src="https://github.com/user-attachments/assets/e06b4a75-3a8b-4646-9b56-c93b79a833b9" />



## 目录

- [Ad Fontes Manager](#ad-fontes-manager)
  - [目录](#目录)
  - [功能概览](#功能概览)
  - [开发计划](#开发计划)
  - [使用流程](#使用流程)
    - [1. 生成词条 YAML](#1-生成词条-yaml)
    - [2. 粘贴到 YAML 编辑器](#2-粘贴到-yaml-编辑器)
    - [3. 保存到本地数据库](#3-保存到本地数据库)
    - [4. 管理与导出](#4-管理与导出)
  - [环境要求](#环境要求)
  - [快速开始](#快速开始)
    - [Web 开发模式](#web-开发模式)
    - [桌面开发模式](#桌面开发模式)
  - [构建](#构建)
  - [常用命令](#常用命令)
  - [文件目录说明](#文件目录说明)
  - [技术栈](#技术栈)
  - [数据库](#数据库)
  - [配置](#配置)
  - [部署](#部署)
    - [Docker（Web 部署）](#dockerweb-部署)
    - [桌面程序安装](#桌面程序安装)
  - [文档](#文档)
  - [贡献](#贡献)
  - [版本控制](#版本控制)
  - [版权说明](#版权说明)
  - [鸣谢](#鸣谢)

## 功能概览

- **AI 智能生成**：多阶段流水线（结构化研究 → 创意富化 → 质量审核），支持 SSE 实时进度、断点续传、自动修复
- **词条管理**：搜索、排序、分页、多语言支持（英语 / 德语）
- **YAML 编辑器**：实时语法校验 + 服务端 Schema 验证（300ms 防抖）
- **编辑器增强**：YAML 层级面包屑导航、缩进深度标记、Tab/Shift+Tab 智能缩进
- **冲突检测**：保存时自动冲突检测，支持差异对比和强制覆盖
- **单词预览**：预览单词卡片的 HTML 效果
- **Anki 导出**：单个词条导出到 AnkiConnect 或下载为 `.apkg`；批量跨页选择、后台执行
- **桌面模式**：Electron 桌面程序，可自定义数据目录

项目同时支持 **Web 应用** 和 **Windows / Mac 桌面程序**（Electron）两种运行模式，共享同一套后端和前端代码。

## 开发计划

- [ ] 公告系统与新手指引
- [x] AI 智能生成词条 YAML（多阶段流水线）
- [ ] LLM 集成批量生成 YAML

## 使用流程

### 1. 生成词条 YAML

**方式一：内置 AI 生成**（推荐）

点击编辑器顶部的「AI Generate」按钮，输入单词和上下文，选择语言（英语/德语），即可启动多阶段 AI 流水线：

1. **结构化研究**（searching）— 在线搜索词源信息，生成结构化 YAML
2. **创意富化**（pondering）— 补充视觉意象、语义演变、同源词等内容
3. **质量审核**（auditing）— 评分并给出修改建议，不达标可自动修复（auto-fix）

支持 SSE 实时进度、断点续传、自定义评分、字段局部重新生成。

**方式二：外部 Prompt 工具**

通过 [ad-fontes-prompts](https://github.com/yelanyanyu/ad-fontes-prompts)（搭配 LLM 的提示词工程工具）手动生成。例如，向 LLM 提交一个英语单词，得到如下结构化 YAML：

```yaml
yield:
  lemma: ephemeral
  language: en
  part_of_speech: adjective
etymology:
  root_and_affixes:
    prefix: epi-
    root: hēmer-
    suffix: -al
    structure_analysis: "Greek ἐφήμερος (ephēmeros) — epi (upon) + hēmera (day)"
  historical_origins:
    history_myth: "..."
    source_word: "ἐφήμερος"
    pie_root: "*h₂eh₁-mr-"
  visual_imagery_zh: |
    清晨，石板路还凉着...
  meaning_evolution_zh: |
    从"仅活一天"的身体感受，...
cognate_family:
  cognates:
    - word: "ephemeral"
      logic: "..."
application:
  selected_examples:
    - type: "Literal"
      sentence: "..."
      translation_zh: "..."
nuance:
  image_differentiation_zh: "..."
  synonyms:
    - word: "transient"
      meaning_zh: "短暂的"
```

英语和德语词条的字段规范由 [ad-fontes-prompts](https://github.com/yelanyanyu/ad-fontes-prompts) 项目定义，具体字段含义和生成规则请参考该项目的 prompt 模板。

### 2. 粘贴到 YAML 编辑器

将生成的 YAML 文本粘贴到左侧编辑面板。编辑器会在你输入时自动校验 —— 300ms 防抖后，语法错误和 Schema 不符的字段会以红色列表实时显示在底部。

### 3. 保存到本地数据库

点击编辑器上方的"保存"按钮将词条写入 SQLite 数据库。保存前系统会自动检测冲突：
- **无冲突**：直接入库，`revision_count` 递增。
- **有冲突**：弹出差异对比窗口，可选择覆盖已有记录或取消。

数据库文件位置取决于运行模式：
- Web：`./data/ad_fontes.db`
- 桌面：`%APPDATA%/ad-fontes-manager/data/ad_fontes.db`（可在设置中自定义）

### 4. 管理与导出

入库后的词条可在右侧列表中搜索、排序、分页浏览。点击任一词条可重新编辑或预览其在 [Anki](https://apps.ankiweb.net/) 中的卡片效果。准备好后，可将其导入 Anki：

- **单条导出**：在编辑器中点击"导出到 Anki"，选择 AnkiConnect 或下载 `.apkg` 文件。
- **批量导出**：在词条列表中跨页勾选目标词条，一键批量检查重复并导入 Anki，任务在后台执行，不阻塞其他操作。

---

## 环境要求

- Node.js 22 LTS 或更高版本
- npm 10 或更高版本
- （可选）Anki + [AnkiConnect](https://ankiweb.net/shared/info/2055492159) 插件，用于 Anki 导出功能

## 快速开始

### Web 开发模式

```bash
git clone https://github.com/yelanyanyu/ad-fontes-manager.git
cd ad-fontes-manager
npm install

# 配置环境变量
cp .env.example .env

# 启动开发环境（后端 + 前端）
npm run dev:web
```

启动后：前端 `http://localhost:5173`，后端 API `http://localhost:8080/api`

### 桌面开发模式

```bash
npm install
npm run dev:desktop
```

启动 Electron 窗口，内部加载 Vite 开发服务器和 Express 后端。

## 构建

```bash
# Web 前端
npm run build:web

# Windows 桌面程序（NSIS 安装包）
npm run build:desktop:win

# Mac 桌面程序（DMG）
npm run build:desktop:mac
```

桌面程序安装包输出到 `release/` 目录。

## 常用命令

所有命令从仓库根目录执行：

```bash
# 开发
npm run dev:web              # Web 模式：后端 + 前端
npm run dev:desktop          # Electron 桌面开发模式
npm run dev:server           # 仅 Express 后端
npm run dev:renderer         # 仅 Vite 前端

# 构建
npm run build:web            # Web 前端构建
npm run build:desktop:win    # Windows 桌面程序（NSIS 安装包）
npm run build:desktop:mac    # Mac 桌面程序（DMG）

# 质量检查
npm run type-check           # TypeScript 类型检查（vue-tsc + tsc）
npm run lint                 # ESLint 检查
npm run lint:fix             # ESLint 自动修复
npm run test                 # Vitest 单元测试
npm run format               # Prettier 格式化

# 数据库
npm run db:init              # 初始化数据库
npm run db:import            # 导入 YAML 文件到数据库
npm run db:view              # 查看数据库中词条的 YAML
npm run db:diff              # 对比数据库与 YAML 文件的差异
```

## 文件目录说明

```text
ad-fontes-manager/
├── src/
│   ├── main/                # Electron 主进程
│   ├── preload/             # contextBridge 预加载脚本
│   ├── renderer/            # Vue 3 前端（Vite 7）
│   │   ├── components/      # 组件（WordEditor, AiGenerate 等）
│   │   ├── composables/     # 组合式函数（useAiGenerate, useYamlHierarchy 等）
│   │   └── stores/          # Pinia 状态管理
│   └── server/              # Express 5 后端
│       ├── services/        # 业务逻辑层（word, ai 等）
│       │   └── ai/          # AI 流水线（pipe, agents, tools, prompts）
│       ├── routes/          # API 路由
│       ├── controllers/     # 控制器
│       ├── middleware/       # Express 中间件
│       ├── db/              # Drizzle ORM Schema + 连接管理
│       ├── schemas/         # Zod 校验 Schema（word 等）
│       ├── utils/           # 工具函数 / 配置
│       └── tests/           # 集成测试
├── data/                    # SQLite 数据库文件
├── node/                    # CLI 维护脚本
├── drizzle/                 # Drizzle 迁移文件
├── docs/                    # 项目文档
│   └── prompts/             # AI Prompt 模板
├── scripts/                 # Docker / 部署脚本
├── assets/                  # 应用图标等静态资源
├── electron-builder.yml     # electron-builder 配置
└── package.json             # 根 monorepo 配置（所有脚本入口）
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Vue 3.5 + Pinia 3 + Vue Router 4 |
| 构建工具（Web） | Vite 7 |
| 构建工具（桌面） | electron-vite + electron-builder |
| 桌面框架 | Electron 39 |
| CSS | Tailwind CSS 3 |
| 后端框架 | Express 5 |
| AI SDK | Vercel AI SDK 6 (streamText, tool use, reasoning) |
| 数据库 | SQLite (better-sqlite3 + Drizzle ORM) |
| 校验 | Zod 4 |
| 日志 | Pino |
| YAML 处理 | js-yaml |
| Anki 导出 | anki-apkg-export + AnkiConnect |

## 数据库

单表设计 — `words_v2`，完整的 YAML 文档以 JSON 形式存储在 `content` 列中：

```
id (UUID PK) | lemma | language (en/de) | part_of_speech |
content (JSON) | created_at | updated_at | revision_count
UNIQUE(lemma, language)
```

数据库文件位置：
- Web 开发：`data/ad_fontes.db`
- 桌面程序：`%APPDATA%/ad-fontes-manager/data/ad_fontes.db`（可在设置中自定义）

## 配置

项目使用双层配置文件，各司其职：

### `.env` — 基础设施配置

部署/环境相关配置，由部署者手动编辑。从 `.env.example` 复制并填入真实值：

```bash
cp .env.example .env
```

必填变量：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | SQLite 数据库文件路径 |
| `ADMIN_TOKEN` | 管理接口令牌（所有写操作需要 `X-Admin-Token` 头） |
| `NODE_ENV` | `development` / `production` / `test` |

Anki 连接（可选）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANKI_CONNECT_HOST` | AnkiConnect 地址 | `127.0.0.1` |
| `ANKI_CONNECT_PORT` | AnkiConnect 端口 | `8765` |

### `config.json` — 应用运行时配置

AI 提供商、Pipeline 阶段、搜索 API、审核阈值等运行时配置，由应用 UI（设置页面）自动管理，无需手动编辑。

从 `config.example.json` 复制到 `config.json` 即可获得预设的 5 家 AI 供应商模板：

```bash
cp config.example.json config.json
```

`config.json` 不会被 Git 追踪（已加入 `.gitignore`），`config.example.json` 作为模板推送到远程仓库。

> **优先级**：`.env` 中的环境变量会覆盖 `config.json` 中对应的值。例如 `ADMIN_TOKEN` 在 `.env` 中设置后，`config.json` 中的 `core.admin_token` 将被忽略。

桌面模式下，管理令牌由主进程通过 `contextBridge` 自动注入，无需手动配置。

详见 [docs/CONFIGURATION.md](./docs/CONFIGURATION.md)。

## 部署

### Docker（Web 部署）

```bash
cp .env.example .env.production
# 编辑 .env.production 填入生产配置

./scripts/start-docker-prod.ps1

# 或手动执行
docker compose --env-file .env.production build app
docker compose --env-file .env.production up -d --force-recreate app
```

### 桌面程序安装

从 [Releases](https://github.com/yelanyanyu/ad-fontes-manager/releases) 页面下载最新安装包：
- Windows: `Ad Fontes Manager Setup x.x.x.exe`
- Mac: `Ad Fontes Manager-x.x.x.dmg`

或从源码构建（参见[构建](#构建)）。

详见 [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)。

## 文档

- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 开发指南
- [docs/API.md](./docs/API.md) — API 文档
- [docs/DATABASE.md](./docs/DATABASE.md) — 数据库 Schema
- [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) — 配置系统
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) — 部署指南
- [docs/SECURITY.md](./docs/SECURITY.md) — 安全说明
- [docs/LOGGING.md](./docs/LOGGING.md) — 日志系统

## 贡献

本项目为开源项目，欢迎参与贡献。

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

提交请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

## 版本控制

使用 Git 进行版本管理。各版本发布记录见 [CHANGELOG.md](./CHANGELOG.md) 和 [GitHub Releases](https://github.com/yelanyanyu/ad-fontes-manager/releases)。

## 版权说明

本项目采用 [GNU Affero General Public License v3.0](./LICENSE) 许可证。个人和非商业用途可自由使用、修改和分发；商业用途（包括作为商业产品或服务的一部分提供）需另行授权。

## 鸣谢

- [Vue 3](https://vuejs.org/)
- [Electron](https://www.electronjs.org/)
- [Express](https://expressjs.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [js-yaml](https://github.com/nodeca/js-yaml)
- [anki-apkg-export](https://github.com/ewnd9/anki-apkg-export)
- [Shields.io](https://shields.io/) — 徽章生成
