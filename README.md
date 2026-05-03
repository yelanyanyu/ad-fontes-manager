# Ad Fontes Manager

Ad Fontes Manager 是 Ad Fontes 英语/德语词汇学习体系中的词条管理工具。支持词条的 YAML 编辑、实时预览、本地与云端数据同步，以及导出到 Anki（AnkiConnect 或 `.apkg`）。

项目同时支持 **Web 应用** 和 **Windows / Mac 桌面程序**（Electron）两种运行模式，共享同一套后端和前端代码。

<img width="2560" height="1410" alt="screenshot" src="https://github.com/user-attachments/assets/97ea07fc-f1be-455f-91a2-4360efde1634" />

## 功能概览

- 词条管理：搜索、排序、分页、多语言（英语 / 德语）
- YAML 编辑器：实时语法校验 + 服务端 Schema 验证（300ms 防抖）
- 保存时自动冲突检测，支持差异对比和强制覆盖
- 预览单词卡片的 HTML 效果
- 单个词条导出到 AnkiConnect 或下载为 `.apkg`
- 批量操作：跨页选择、重复检测、批量导入/导出
- 批量任务在后台执行，关闭弹窗或切换页面不丢失进度
- 桌面模式下可自定义数据目录，配置随应用持久化

## 环境要求

- Node.js 22 LTS 或更高版本
- npm 10 或更高版本
- （可选）Anki + AnkiConnect 插件，用于 Anki 导出功能

## 快速开始（Web 开发模式）

```bash
git clone <repository-url>
cd ad-fontes-manager
npm install

# 配置环境变量
cp .env.example .env

# 启动开发环境（后端 + 前端）
npm run dev:web
```

启动后：
- 前端：`http://localhost:5173`
- 后端 API：`http://localhost:8080/api`

## 快速开始（桌面开发模式）

```bash
npm install
npm run dev:desktop
```

这会启动 Electron 窗口，内部加载 Vite 开发服务器和 Express 后端。

## 构建

```bash
# Web 前端构建
npm run build:web

# Windows 桌面程序
npm run build:desktop:win

# Mac 桌面程序
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
npm run build:desktop:win    # Windows 安装包
npm run build:desktop:mac    # Mac DMG

# 质量检查
npm run type-check           # TypeScript 类型检查
npm run lint                 # ESLint 检查
npm run lint:fix             # ESLint 自动修复
npm run test                 # Vitest 单元测试
npm run format               # Prettier 格式化

# 数据库
npm run import:pg-v2         # 从 PostgreSQL 迁移数据到 SQLite
```

## 项目结构

```text
ad-fontes-manager/
├── src/
│   ├── main/                # Electron 主进程
│   ├── preload/             # contextBridge 预加载脚本
│   ├── renderer/            # Vue 3 前端（Vite 7）
│   └── server/              # Express 5 后端
├── web/                     # Web 专用代码（旧结构，逐步迁移中）
│   ├── services/            # 业务逻辑层
│   ├── routes/              # API 路由
│   ├── controllers/         # 控制器
│   ├── middleware/          # Express 中间件
│   ├── db/                  # Drizzle ORM Schema + 连接管理
│   ├── schemas/             # Zod 校验 Schema
│   ├── utils/               # 工具函数 / 配置
│   ├── data/                # SQLite 数据库文件
│   └── tests/               # 集成测试
├── node/                    # CLI 维护脚本
├── drizzle/                 # Drizzle 迁移文件
├── docs/                    # 项目文档
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
| 数据库 | SQLite (better-sqlite3 + Drizzle ORM) |
| 校验 | Zod 4 |
| 日志 | Pino |
| YAML 处理 | js-yaml |
| Anki 导出 | anki-apkg-export + AnkiConnect |

## 数据库

单表设计 — `words_v2`，完整的 YAML 文档以 JSON 形式存储在 `content` 列中：

```
id (UUID PK) | lemma | language (en/de) | part_of_speech | content (JSON) | created_at | updated_at | revision_count
UNIQUE(lemma, language)
```

数据库文件位置：
- Web 开发：`web/data/ad_fontes.db`
- 桌面程序：`%APPDATA%/ad-fontes-manager/data/ad_fontes.db`（可自定义）

## 配置

项目遵循 12-Factor App 原则，通过环境变量配置。

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

桌面模式下，管理令牌由主进程通过 `contextBridge` 自动注入，无需手动配置。

## Docker 部署

```bash
cp .env.example .env.production
# 编辑 .env.production 填入生产配置

./scripts/start-docker-prod.ps1

# 或手动执行
docker compose --env-file .env.production build app
docker compose --env-file .env.production up -d --force-recreate app
```

## 文档

- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 开发指南
- [docs/API.md](./docs/API.md) — API 文档
- [docs/DATABASE.md](./docs/DATABASE.md) — 数据库 Schema
- [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) — 配置系统
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) — 部署指南
- [docs/SECURITY.md](./docs/SECURITY.md) — 安全说明
- [docs/LOGGING.md](./docs/LOGGING.md) — 日志系统

## 许可证

[MIT](./LICENSE)
