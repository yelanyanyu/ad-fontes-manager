# Ad Fontes Manager 配置系统文档

## 概述

Ad Fontes Manager 遵循 **12-Factor App** 原则，采用轻量级环境变量配置系统。所有配置通过环境变量管理，开发环境支持 `.env` 文件，生产环境禁止 `.env` 文件。

## 配置加载优先级

```
1. 系统环境变量 (最高优先级)
2. .env 文件 (仅开发环境)
3. 代码默认值 (最低优先级)
```

**注意**: 生产环境 (`NODE_ENV=production`) 禁止存在 `.env` 文件，应用会立即退出并报错。

## 必需配置项

应用启动时会强制验证以下配置项，缺少任何一项都会报错退出：

| 配置项 | 环境变量 | 说明 |
|--------|----------|------|
| 数据库连接 | `DATABASE_URL` | PostgreSQL 连接字符串 |
| 管理员令牌 | `ADMIN_TOKEN` | API 访问令牌，生产环境 ≥32 字符 |
| 运行环境 | `NODE_ENV` | `development` / `production` / `test` |

## 配置文件

### 1. `.env` 文件（开发环境专用）

**位置**: 项目根目录  
**用途**: 存储本地开发环境的敏感信息和个性化配置  
**特点**: 
- ❌ 不提交到 Git（已在 `.gitignore` 中配置）
- ✅ 仅在开发环境加载
- ✅ 优先级高于代码默认值

**创建方式**:
```bash
cp .env.example .env
# 编辑 .env 填入你的本地配置
```

**示例内容**:
```bash
# 核心配置
NODE_ENV=development
ADMIN_TOKEN=dev-token-not-for-production

# 数据库配置
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ad_fontes

# 可选配置
LOG_LEVEL=debug
PORT=8080
```

### 2. `.env.example` 文件

**位置**: 项目根目录  
**用途**: 作为 `.env` 的模板，展示所有可用的环境变量  
**特点**: 
- ✅ 提交到 Git
- ✅ 使用占位符代替真实值
- ✅ 供新开发者参考

### 3. `.env.production` 文件（生产环境专用）

**位置**: 服务器本地，项目根目录  
**用途**: 生产环境配置，通过 Docker Compose 加载  
**特点**: 
- ❌ 不提交到 Git
- ✅ 仅存在于服务器本地
- ✅ 文件权限应设为 `600`（仅 root 可读）

**创建方式**（在服务器上执行）:
```bash
echo "NODE_ENV=production
ADMIN_TOKEN=$(openssl rand -hex 32)
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
DATABASE_SSL=true
SERVER_CORS_ORIGINS=[\"https://yourdomain.com\"]
SERVER_RATE_LIMIT=100
LOG_LEVEL=warn" > .env.production

chmod 600 .env.production
```

## 配置项详细说明

### 核心配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `NODE_ENV` | ✅ | `development` | 运行环境: `development` \| `production` \| `test` |
| `ADMIN_TOKEN` | ✅ | - | 管理员 API 令牌，生产环境必须 ≥32 字符 |

### 服务器配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `PORT` | ❌ | `8080` | API 服务器端口 |
| `SERVER_PORT` | ❌ | `8080` | 同上（别名） |
| `SERVER_HOST` | ❌ | `127.0.0.1` | 绑定地址，`0.0.0.0` 监听所有接口 |
| `SERVER_CORS_ORIGINS` | ❌ | `["*"]` | 跨域来源，生产环境必须限制 |
| `SERVER_RATE_LIMIT` | ❌ | `0` | 每分钟请求限制，0=禁用 |
| `SERVER_TIMEOUT_MS` | ❌ | `10000` | 请求超时毫秒数 |

### 安全配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `SECURITY_HELMET` | ❌ | `true` | 是否启用 Helmet 安全头 |
| `SECURITY_HSTS` | ❌ | `true` | 是否发送 HSTS 头 |

### 数据库配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `DATABASE_URL` | ✅ | - | PostgreSQL 连接字符串 |
| `DATABASE_SSL` | ❌ | `false` | 强制 SSL，生产环境必须启用 |
| `DATABASE_POOL_SIZE` | ❌ | `null` | 连接池大小，null=自动计算 |

**连接字符串格式**:
```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

**生产环境 SSL 示例**:
```
postgresql://user:pass@host:5432/db?sslmode=require
```

### 前端配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `CLIENT_DEV_PORT` | ❌ | `5173` | 前端开发服务器端口 |

### 存储配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `MAX_LOCAL_ITEMS` | ❌ | `100` | LocalStorage 最大条目数 |

### 日志配置

| 环境变量 | 必需 | 默认值 | 说明 |
|----------|------|--------|------|
| `LOG_LEVEL` | ❌ | `info` | 日志级别: `debug` \| `info` \| `warn` \| `error` |
| `LOG_DIR` | ❌ | `./logs` | 日志文件目录 |
| `LOG_ROTATION_INTERVAL` | ❌ | `1d` | 日志切分周期 |
| `LOG_ROTATION_MAX_SIZE` | ❌ | `10M` | 单个日志文件最大大小 |
| `LOG_ROTATION_MAX_FILES` | ❌ | `30` | 保留的轮转日志文件数量 |

## 使用场景

### 场景 1: 本地开发（推荐）

使用 `.env` 文件管理本地配置：

```bash
# 1. 复制模板
cp .env.example .env

# 2. 编辑 .env，填入你的本地数据库密码
# DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ad_fontes

# 3. 启动开发服务器
cd web && npm run dev
```

### 场景 2: 生产部署（Docker）

```bash
# 1. 在服务器创建 .env.production
echo "NODE_ENV=production
ADMIN_TOKEN=$(openssl rand -hex 32)
DATABASE_URL=postgresql://user:pass@db:5432/ad_fontes?sslmode=require
DATABASE_SSL=true
SERVER_CORS_ORIGINS=[\"https://yourdomain.com\"]
SERVER_RATE_LIMIT=100
SECURITY_HSTS=true
LOG_LEVEL=warn" > .env.production

chmod 600 .env.production

# 2. 启动服务
docker-compose up -d --build
```

### 场景 3: 生产部署（系统环境变量）

```bash
# 设置环境变量
export NODE_ENV=production
export ADMIN_TOKEN="$(openssl rand -hex 32)"
export DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
export DATABASE_SSL="true"
export SERVER_CORS_ORIGINS='["https://yourdomain.com"]'
export SERVER_RATE_LIMIT="100"
export SECURITY_HSTS="true"

# 启动服务
cd web && npm start
```

### 场景 4: CI/CD 流水线

```bash
# 在 CI/CD 中设置环境变量
export NODE_ENV=test
export DATABASE_URL="postgresql://postgres:password@localhost:5432/ad_fontes_test"
export ADMIN_TOKEN="test-token"

# 运行测试
npm test
```

## 在代码中使用配置

### 后端 (Node.js)

```javascript
const config = require('./utils/config');

// 获取配置值
const dbUrl = config.get('database.url');
const port = config.get('server.port', 8080);

// 获取完整配置对象
const allConfig = config.getAll();
```

### 配置验证

应用启动时会自动验证配置：

```
# 缺少必需配置
❌ 缺少必需的环境变量:
   - DATABASE_URL
   - ADMIN_TOKEN

请通过以下方式设置:
   1. 创建 .env 文件（开发环境）
   2. 设置系统环境变量
   3. 使用 Docker env_file（生产环境）

# 生产环境 ADMIN_TOKEN 太短
❌ 生产环境 ADMIN_TOKEN 必须至少 32 字符
   当前长度: 12
   生成命令: openssl rand -hex 32

# 生产环境存在 .env 文件
❌ 生产环境禁止存在 .env 文件
   发现文件: /app/.env
   请使用系统环境变量或 Docker env_file 注入配置
```

## 安全建议

### 1. 敏感信息处理

- **永远不要**将 `.env` 或 `.env.production` 提交到 Git
- **永远不要**在代码中硬编码密码或令牌
- 使用占位符代替敏感信息

### 2. 生产环境必须

- 修改默认的 `ADMIN_TOKEN`（使用 `openssl rand -hex 32` 生成）
- 启用 `DATABASE_SSL=true`
- 限制 `SERVER_CORS_ORIGINS` 为实际域名
- 启用 `SERVER_RATE_LIMIT`（建议 100-300）
- 设置 `LOG_LEVEL=warn` 或 `error`
- 设置 `.env.production` 文件权限为 `600`

### 3. 定期维护

- 定期轮换 `ADMIN_TOKEN`
- 定期清理旧日志文件
- 定期检查日志目录与轮转策略是否符合保留要求

## 故障排查

### 配置不生效

1. 检查环境变量名是否正确（注意大小写）
2. 检查 `.env` 文件是否在项目根目录
3. 检查 `NODE_ENV` 设置

### 数据库连接失败

1. 检查 `DATABASE_URL` 格式
2. 检查数据库服务是否运行
3. 检查网络连接和防火墙
4. 检查 SSL 配置

### 生产环境启动失败

1. 确认 `.env` 文件不存在
2. 确认所有必需配置项已设置
3. 确认 `ADMIN_TOKEN` 长度 ≥32 字符

## 更新日志

### v2.0.0 (2026-03-05)
- 重构为 12-Factor 配置系统
- 移除 `config.yml` 支持
- 生产环境禁止 `.env` 文件
- 添加配置验证

### v1.0.0 (2026-01-26)
- 初始版本，统一配置系统
