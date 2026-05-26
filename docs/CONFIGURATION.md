# Ad Fontes Manager 配置系统

## 概述

项目使用**双层配置文件**，各司其职：

| 文件 | 用途 | 谁编辑 | 是否 Git 追踪 |
|------|------|--------|---------------|
| `.env` | 基础设施配置（端口、数据库、令牌等） | 部署者手动编辑 | 否 |
| `config.json` | 应用运行时配置（AI 供应商、Pipeline 阶段等） | 应用 UI 自动管理 | 否 |
| `.env.example` | `.env` 模板 | 开发者 | 是 |
| `config.example.json` | `config.json` 模板 | 开发者 | 是 |

## 配置加载优先级

```
1. 系统环境变量（最高优先级）
2. .env 文件（仅开发环境，dotenv 加载）
3. Electron main 进程注入（桌面模式，ADMIN_TOKEN）
4. config.json（文件配置）
5. 代码默认值（最低优先级）
```

环境变量会覆盖 `config.json` 中对应的值。例如 `.env` 中设置了 `PORT=8080`，则 `config.json` 中的 `server.port` 被忽略。

**注意**: 生产环境 (`NODE_ENV=production`) 禁止存在 `.env` 文件，应用会报错退出。生产部署应使用系统环境变量或 Docker `env_file`。

---

## 快速开始

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 复制应用配置模板（可选，提供 AI 供应商预设）
cp config.example.json config.json

# 3. 按需编辑 .env 填入真实值
```

---

## 配置版本化与迁移

`config.json` 包含 `schemaVersion` 字段，标识当前配置结构的版本。当应用升级引入新的配置结构时，配置迁移逻辑会自动将旧版本的用户配置升级到新版本，同时保留用户的 API Key、自定义 Provider 等敏感数据。

迁移规则：
- 每次 schema 变更递增 `schemaVersion`
- 迁移是幂等的——可安全地多次运行
- 迁移不覆盖用户手动编辑的值（只添加新的默认值或修复已知的过时格式）
- 桌面应用在启动时自动执行迁移

### 配置导出

用户可通过设置页面将当前 `config.json` 导出为文件，用于备份或迁移到其他设备。导出时可选择是否包含 API Key 等敏感信息。

---

## `.env` — 基础设施配置

部署/环境相关，由部署者手动编辑。所有环境变量映射到 `config.json` 中的对应路径。

### 必需配置项

| 环境变量 | 映射路径 | 说明 |
|----------|----------|------|
| `NODE_ENV` | `core.env` | `development` / `production` / `test` |
| `ADMIN_TOKEN` | `core.admin_token` | API 访问令牌（所有写操作需要 `X-Admin-Token` 头） |
| `DATABASE_URL` | `database.url` | SQLite 数据库文件路径 |

桌面模式下 `ADMIN_TOKEN` 由主进程自动设置为 `dev-token-not-for-production`（开发）或从环境变量读取（生产构建）。

### 全部配置项

#### 核心配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `NODE_ENV` | 是 | `development` | 运行环境 |
| `ADMIN_TOKEN` | 是 | - | API 访问令牌 |

#### 服务器配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `PORT` | 否 | `8080`（Web）/ `19876`（桌面） | API 端口 |
| `SERVER_HOST` | 否 | `127.0.0.1` | 绑定地址 |
| `SERVER_CORS_ORIGINS` | 否 | `["http://localhost:5173"]` | CORS 来源 |
| `SERVER_RATE_LIMIT` | 否 | `0`（禁用） | 每分钟请求限制 |
| `SERVER_TIMEOUT_MS` | 否 | `10000` | 请求超时 |
| `HEALTHCHECK_HOST` | 否 | `127.0.0.1` | 内部健康检查目标地址 |
| `HEALTHCHECK_PORT` | 否 | `8080` | 内部健康检查目标端口 |

#### 数据库配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `DATABASE_URL` | 是 | `./data/ad_fontes.db` | SQLite 数据库路径 |
| `PG_DATABASE_URL` | 否 | - | PostgreSQL 源数据库 URL（仅用于一次性数据迁移脚本） |

桌面模式下，数据库路径可通过设置页面修改，变更存储于 `<userData>/config.json`。

#### Anki 配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `ANKI_CONNECT_HOST` | 否 | `127.0.0.1` | AnkiConnect 主机地址 |
| `ANKI_CONNECT_PORT` | 否 | `8765` | AnkiConnect 端口 |

#### 日志配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `LOG_LEVEL` | 否 | `info` | 日志级别 |
| `LOG_DIR` | 否 | `./logs` | 日志目录 |
| `LOG_ROTATION_INTERVAL` | 否 | `1d` | 日志切分周期 |
| `LOG_ROTATION_MAX_SIZE` | 否 | `10M` | 单文件最大大小 |
| `LOG_ROTATION_MAX_FILES` | 否 | `30` | 保留日志文件数 |

#### 安全配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `SECURITY_HELMET` | 否 | `true` | 启用 Helmet 安全头 |
| `SECURITY_HSTS` | 否 | `false` | 启用 HSTS |

#### 前端配置（Web 模式）

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `VITE_ADMIN_TOKEN` | 否 | - | 前端内置的管理令牌 |
| `VITE_API_BASE_URL` | 否 | `http://localhost:8080/api` | API 基地址 |
| `CLIENT_DEV_PORT` | 否 | `5173` | Vite 开发服务器端口 |

#### 存储配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `MAX_LOCAL_ITEMS` | 否 | `100` | 本地存储最大条目数 |

#### AI 运行配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `AI_QUEUE_CONCURRENCY` | 否 | `1` | AI JobQueue 全局并发池大小。设置为 `3` 表示最多 3 个 Generate/Fix/Audit-Fix Job 同时运行 |

#### 桌面配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `DESKTOP_SERVER_PORT` | 否 | `19876` | 桌面模式下 Express 后端监听端口 |

---

## `config.json` — 应用运行时配置

AI 提供商、Pipeline 阶段、搜索 API、审核阈值等运行时配置，由应用 UI（设置页面）自动管理，用户无需手动编辑。

### AI 配置结构

```json
{
  "schemaVersion": 1,
  "ai": {
    "queue_concurrency": 3,
    "providers": [
      {
        "id": "deepseek",
        "name": "deepseek",
        "type": "openai",
        "baseUrl": "https://api.deepseek.com",
        "anthropicBaseUrl": "https://api.deepseek.com/anthropic",
        "apiKey": "",
        "models": [
          { "id": "deepseek-v4-pro[1m]", "name": "deepseek-v4-pro[1m]", "endpointType": "anthropic" },
          { "id": "deepseek-v4-flash[1m]", "name": "deepseek-v4-flash[1m]", "endpointType": "anthropic" }
        ]
      }
    ],
    "search": {
      "provider": "tavily",
      "apiKey": "",
      "autoDomains": true,
      "domains": {
        "common": ["etymonline.com", "wiktionary.org", "merriam-webster.com"],
        "en": ["oed.com"],
        "de": []
      }
    },
    "stages": {
      "fast": {
        "provider": "deepseek",
        "model": "deepseek-v4-flash[1m]",
        "reasoningEffort": "none"
      },
      "balanced": {
        "provider": "deepseek",
        "model": "deepseek-v4-pro[1m]",
        "reasoningEffort": "low"
      },
      "expert": {
        "provider": "deepseek",
        "model": "deepseek-v4-pro[1m]",
        "reasoningEffort": "medium"
      }
    },
    "review": {
      "threshold": 6,
      "thresholdByLanguage": { "en": 6, "de": 6 }
    }
  }
}
```

**队列并发说明：**

`queue_concurrency` 是所有 AI Job 共享的全局并发池大小。它不是每个批次单独的并发数；多个批次、单词生成、Fix Job 和 Audit-Fix Job 都从同一个池里取槽位。桌面端推荐在设置页 `API -> 运行参数` 修改，保存后立即影响当前运行中的队列；Web/服务端部署也可以用 `AI_QUEUE_CONCURRENCY` 环境变量覆盖。

**Stage 配置说明：**

| Stage Key | 用途 | 流水线阶段 |
|-----------|------|-----------|
| `fast` | 快速模型 | searching（结构化研究/词源搜索） |
| `balanced` | 均衡模型 | pondering（创意富化） |
| `expert` | 专家模型 | auditing（质量审核）、fixing（自动修复） |

每个 stage 支持 `reasoningEffort` 字段（可选），取值：`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `auto`。仅对支持 reasoning/thinking 的模型生效。

**Model 配置说明：**

每个 model 支持可选的 `endpointType` 字段（`"openai"` 或 `"anthropic"`），用于按模型级别覆写端点类型。不设置时继承 provider 的 `type`。

**Provider 配置说明：**

每个 provider 支持可选的 `anthropicBaseUrl` 字段。当 provider 的 `type` 为 `openai` 但某些 model 的 `endpointType` 为 `anthropic` 时，`anthropicBaseUrl` 指定 Anthropic 格式 API 的端点地址。DeepSeek 等厂商同时提供 OpenAI 兼容端点和 Anthropic 兼容端点，此字段允许在一个 provider 内混用两种格式。

**搜索配置说明：**

`search.provider` 可选值：`"brave"`（Brave Search API）、`"tavily"`（Tavily Search API）。两种搜索后端均用于 searching 阶段的在线词源搜索。

完整的模板文件见仓库根目录下的 `config.example.json`。

### 预设供应商

`config.example.json` 中包含 5 家预设 AI 供应商模板，复制后即可在设置页面看到它们：

| 供应商 | ID | 类型 | 默认 baseUrl | 默认 anthropicBaseUrl |
|--------|-----|------|-------------|---------------------|
| DeepSeek | `deepseek` | openai | `https://api.deepseek.com` | `https://api.deepseek.com/anthropic` |
| OpenRouter | `openrouter` | openai | `https://openrouter.ai/api/v1` | - |
| Bailian (阿里云百炼) | `dashscope` | openai | `https://dashscope.aliyuncs.com/compatible-mode/v1/` | - |
| Silicon (硅基流动) | `silicon` | openai | `https://api.siliconflow.cn` | - |
| AiHubMix | `aihubmix` | openai | `https://aihubmix.com/v1` | - |

### 桌面模式

桌面程序的实际配置文件位于 `%APPDATA%/ad-fontes-manager/config.json`（Windows）或 `~/Library/Application Support/ad-fontes-manager/config.json`（Mac）。用户可在设置页面修改数据目录，应用会自动迁移数据。

桌面模式下还可通过设置页面配置**软件更新**行为：
- 自动检查更新（启动时）
- 自动下载更新
- 跳过特定版本

---

## 配置验证

应用启动时自动验证必填项，不通过则报错退出：

```
❌ 缺少必需的环境变量:
   - DATABASE_URL
   - ADMIN_TOKEN
```

---

## 安全建议

- 生产环境 `ADMIN_TOKEN` 至少 32 字符（`openssl rand -hex 32`）
- 限制 `SERVER_CORS_ORIGINS` 为实际域名
- 生产环境设置 `LOG_LEVEL=warn` 或 `error`
- 生产环境启用 `SECURITY_HSTS=true`
- 切勿将 `.env` 或含真实 API Key 的 `config.json` 提交到 Git
- 定期轮换 `ADMIN_TOKEN` 和 AI 供应商 API Key
