# Ad Fontes Manager 配置系统

## 概述

遵循 12-Factor App 原则，所有配置通过环境变量管理。桌面模式下额外支持 `config.json` 存储用户级设置。

## 配置加载优先级

```
1. 系统环境变量（最高优先级）
2. .env 文件（仅开发环境）
3. Electron main 进程注入（桌面模式，ADMIN_TOKEN）
4. config.json（桌面模式，用户数据目录等持久化设置）
5. 代码默认值（最低优先级）
```

**注意**: 生产环境 (`NODE_ENV=production`) 禁止存在 `.env` 文件，应用会报错退出。

## 必需配置项

| 环境变量 | 说明 |
|----------|------|
| `DATABASE_URL` | SQLite 数据库文件路径 |
| `ADMIN_TOKEN` | API 访问令牌 |
| `NODE_ENV` | 运行环境：`development` / `production` / `test` |

桌面模式下 `ADMIN_TOKEN` 由主进程自动设置为 `dev-token-not-for-production`（开发）或从环境变量读取（生产构建）。

## 全部配置项

### 核心配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `NODE_ENV` | 是 | `development` | 运行环境 |
| `ADMIN_TOKEN` | 是 | - | API 访问令牌 |

### 服务器配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `PORT` | 否 | `8080`（Web）/ 随机（桌面） | API 端口 |
| `SERVER_HOST` | 否 | `127.0.0.1` | 绑定地址 |
| `SERVER_CORS_ORIGINS` | 否 | `["*"]` | CORS 来源 |
| `SERVER_RATE_LIMIT` | 否 | `0`（禁用） | 每分钟请求限制 |
| `SERVER_TIMEOUT_MS` | 否 | `10000` | 请求超时 |

### 数据库配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `DATABASE_URL` | 是 | `./data/ad_fontes.db` | SQLite 数据库路径 |

桌面模式下，数据库路径可通过设置页面的数据目录选择器修改，存储于 `<userData>/config.json`。

### Anki 配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `ANKI_CONNECT_HOST` | 否 | `127.0.0.1` | AnkiConnect 主机地址 |
| `ANKI_CONNECT_PORT` | 否 | `8765` | AnkiConnect 端口 |

### 日志配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `LOG_LEVEL` | 否 | `info` | 日志级别 |
| `LOG_DIR` | 否 | `./logs` | 日志目录 |
| `LOG_ROTATION_INTERVAL` | 否 | `1d` | 日志切分周期 |
| `LOG_ROTATION_MAX_SIZE` | 否 | `10M` | 单文件最大大小 |
| `LOG_ROTATION_MAX_FILES` | 否 | `30` | 保留日志文件数 |

### 前端配置（Web 模式）

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `VITE_ADMIN_TOKEN` | 否 | - | 前端内置的管理令牌 |
| `VITE_API_BASE_URL` | 否 | `http://localhost:8080/api` | API 基地址 |

### 存储配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `MAX_LOCAL_ITEMS` | 否 | `100` | 本地存储最大条目数 |

## 配置文件

### `.env`（开发环境）

```bash
cp .env.example .env
```

```bash
NODE_ENV=development
ADMIN_TOKEN=dev-token-not-for-production
DATABASE_URL=./data/ad_fontes.db
LOG_LEVEL=debug
PORT=8080
```

### `.env.production`（生产环境）

```bash
NODE_ENV=production
ADMIN_TOKEN=<openssl rand -hex 32>
DATABASE_URL=/app/data/ad_fontes.db
SERVER_CORS_ORIGINS=["https://yourdomain.com"]
SERVER_RATE_LIMIT=100
LOG_LEVEL=warn
```

### 桌面模式 `config.json`

存储于 `%APPDATA%/ad-fontes-manager/config.json`（Windows）或 `~/Library/Application Support/ad-fontes-manager/config.json`（Mac）：

```json
{
  "dataDir": "C:\\Users\\xxx\\AppData\\Roaming\\ad-fontes-manager\\data"
}
```

用户可在设置页面修改数据目录，应用会自动迁移数据。

## 配置验证

应用启动时自动验证必填项：

```
❌ 缺少必需的环境变量:
   - DATABASE_URL
   - ADMIN_TOKEN
```

## 安全建议

- 生产环境 `ADMIN_TOKEN` 至少 32 字符（`openssl rand -hex 32`）
- 限制 `SERVER_CORS_ORIGINS` 为实际域名
- 生产环境设置 `LOG_LEVEL=warn` 或 `error`
- `.env.production` 文件权限设为 `600`
- 定期轮换 `ADMIN_TOKEN`
