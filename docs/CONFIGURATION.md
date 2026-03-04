# Ad Fontes Manager 配置说明文档

## 概述

本文档说明 Ad Fontes Manager 的统一配置系统。所有配置集中管理在 `config.yml` 文件中，支持通过环境变量覆盖。

## 配置文件位置

项目根目录下的 `config.yml` 文件：

```
ad-fontes-manager/
├── config.yml          # 主配置文件
├── web/
│   └── utils/
│       └── config.js   # 配置加载模块
└── docs/
    └── CONFIGURATION.md # 本文档
```

## 配置加载优先级

配置按以下优先级加载（高优先级覆盖低优先级）：

1. **环境变量** (如 `AD_FONTES_DATABASE_URL`)
2. **config.yml 文件**
3. **代码中的安全默认值**

## 配置结构

### 1. 核心配置 (core)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `core.env` | string | `development` | 运行环境，可选值：`development` \| `production` \| `test` |
| `core.admin_token` | string | `dev-token-not-for-production` | 管理员 API 访问令牌，生产环境必须修改 |

**环境变量映射：**
- `AD_FONTES_CORE_ENV` → `core.env`
- `AD_FONTES_ADMIN_TOKEN` → `core.admin_token`
- `NODE_ENV` → `core.env`
- `ADMIN_TOKEN` → `core.admin_token`

### 2. 服务器配置 (server)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `server.port` | integer | `8080` | API 服务器端口，范围：1024-65535 |
| `server.host` | string | `127.0.0.1` | 服务器绑定地址，`0.0.0.0` 监听所有接口 |
| `server.cors_origins` | array | `["*"]` | 允许的跨域来源，生产环境必须限制 |
| `server.rate_limit` | integer | `0` | 每分钟请求限制，0 表示禁用，生产环境建议 100-300 |
| `server.timeout_ms` | integer | `10000` | 请求超时（毫秒），范围：5000-60000 |

**环境变量映射：**
- `AD_FONTES_SERVER_PORT` / `PORT` / `SERVER_PORT` → `server.port`
- `AD_FONTES_SERVER_HOST` / `SERVER_HOST` → `server.host`
- `AD_FONTES_SERVER_CORS_ORIGINS` → `server.cors_origins`
- `AD_FONTES_SERVER_RATE_LIMIT` → `server.rate_limit`
- `AD_FONTES_SERVER_TIMEOUT_MS` → `server.timeout_ms`

### 3. 数据库配置 (database)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `database.url` | string | `null` | **必需** PostgreSQL 连接字符串 |
| `database.ssl` | boolean | `false` | 强制 SSL 连接，生产环境必须启用 |
| `database.pool_size` | integer | `null` | 连接池大小，null 时自动计算（dev=10, prod=20） |

**连接字符串格式：**
```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

**生产环境 SSL 示例：**
```
postgresql://user:pass@host:5432/db?sslmode=require
```

**环境变量映射：**
- `AD_FONTES_DATABASE_URL` / `DATABASE_URL` → `database.url`
- `AD_FONTES_DATABASE_SSL` / `DATABASE_SSL` → `database.ssl`
- `AD_FONTES_DATABASE_POOL_SIZE` → `database.pool_size`

### 4. 前端配置 (client)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `client.dev_port` | integer | `5173` | 前端开发服务器端口 |

**环境变量映射：**
- `AD_FONTES_CLIENT_DEV_PORT` / `CLIENT_DEV_PORT` → `client.dev_port`

### 5. 存储配置 (storage)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `storage.max_items` | integer | `100` | 浏览器 LocalStorage 最大条目数，范围：10-500 |

**环境变量映射：**
- `AD_FONTES_STORAGE_MAX_ITEMS` / `MAX_LOCAL_ITEMS` → `storage.max_items`

### 6. 日志配置 (logging)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `logging.level` | string | `info` | 日志级别，可选值：`debug` \| `info` \| `warn` \| `error` |
| `logging.dir` | string | `./logs` | 日志文件目录 |
| `logging.rotation.interval` | string | `1d` | 日志轮转间隔 |
| `logging.rotation.max_size` | string | `10M` | 单个日志文件最大大小 |
| `logging.rotation.max_files` | integer | `30` | 保留日志文件数量 |
| `logging.audit` | boolean | `true` | 是否启用安全审计日志 |

**环境变量映射：**
- `AD_FONTES_LOG_LEVEL` / `LOG_LEVEL` → `logging.level`
- `AD_FONTES_LOG_DIR` / `LOG_DIR` → `logging.dir`
- `AD_FONTES_LOG_AUDIT` → `logging.audit`

### 7. 功能开关 (features)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `features.local_draft` | boolean | `true` | 启用本地草稿功能 |
| `features.sync` | boolean | `true` | 启用数据同步功能 |
| `features.conflict_detection` | boolean | `true` | 启用冲突检测 |

### 8. 安全配置 (security)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `security.helmet` | boolean | `true` | 启用 Helmet 安全头 |
| `security.hsts` | boolean | `true` | 启用 HSTS（仅生产环境生效） |
| `security.min_password_length` | integer | `8` | 密码最小长度 |

## 配置示例

### 开发环境配置

```yaml
core:
  env: development
  admin_token: dev-token-not-for-production

database:
  url: postgresql://postgres:password@localhost:5432/ad_fontes_dev

logging:
  level: debug
```

### 生产环境配置

```yaml
core:
  env: production
  admin_token: <your-32-char-token-here>

database:
  url: postgresql://user:pass@host:5432/ad_fontes?sslmode=require
  ssl: true

server:
  host: 0.0.0.0
  cors_origins:
    - "https://yourdomain.com"
  rate_limit: 100

logging:
  level: warn
```

### 测试环境配置

```yaml
core:
  env: test

database:
  url: postgresql://postgres:password@localhost:5432/ad_fontes_test

logging:
  level: error
```

## 环境变量使用

### 基本用法

```bash
# 设置数据库连接
export AD_FONTES_DATABASE_URL="postgresql://postgres:pass@localhost:5432/ad_fontes"

# 设置日志级别
export AD_FONTES_LOG_LEVEL=debug

# 启动应用
npm start
```

### Docker 环境

```dockerfile
ENV AD_FONTES_CORE_ENV=production
ENV AD_FONTES_DATABASE_URL=postgresql://user:pass@db:5432/ad_fontes
ENV AD_FONTES_SERVER_PORT=8080
```

### 使用 .env 文件

项目仍支持 `.env` 文件，但建议使用统一的 `config.yml`：

```bash
# .env 文件示例
AD_FONTES_DATABASE_URL=postgresql://postgres:pass@localhost:5432/ad_fontes
AD_FONTES_LOG_LEVEL=info
```

## 在代码中使用配置

### 后端 (Node.js)

```javascript
const config = require('./utils/config');

// 获取单个配置值
const dbUrl = config.get('database.url');
const port = config.get('server.port');

// 获取带默认值的配置
const timeout = config.get('server.timeout_ms', 10000);

// 获取完整配置对象
const allConfig = config.getAll();
```

### 配置热重载

```javascript
const config = require('./utils/config');

// 清除缓存并重新加载
config.reload();

// 或仅清除缓存
config.clearCache();
```

## 配置验证

启动应用时，配置模块会自动检查必需的配置项。如果缺少必需配置，会抛出错误：

```
Error: No database URL configured. Please set database.url in config.yml or AD_FONTES_DATABASE_URL environment variable.
```

## 迁移指南

### 从旧版配置迁移

1. **备份现有配置**
   ```bash
   cp web/config.json web/config.json.backup
   cp .env .env.backup
   ```

2. **创建新的 config.yml**
   参考上述配置示例，将旧配置迁移到 `config.yml`

3. **更新环境变量**（如使用）
   将旧的环境变量名更新为新的前缀格式：`AD_FONTES_`

4. **验证配置**
   ```bash
   npm start
   ```

5. **删除旧配置**（验证无误后）
   ```bash
   rm web/config.json
   # 保留 .env 用于敏感信息
   ```

## 故障排查

### 配置不生效

1. 检查配置文件路径是否正确
2. 检查 YAML 语法是否正确（使用在线 YAML 验证工具）
3. 检查环境变量是否覆盖
4. 查看启动日志中的配置加载信息

### 数据库连接失败

1. 检查 `database.url` 格式是否正确
2. 检查数据库服务是否运行
3. 检查网络连接和防火墙设置
4. 检查 SSL 配置（生产环境）

### 日志不输出

1. 检查 `logging.level` 设置
2. 检查日志目录权限
3. 检查磁盘空间

## 安全建议

1. **生产环境必须：**
   - 修改默认的 `admin_token`
   - 启用 `database.ssl`
   - 限制 `server.cors_origins`
   - 启用 `server.rate_limit`

2. **敏感信息处理：**
   - 使用环境变量注入敏感信息
   - 不要将包含密码的配置文件提交到版本控制
   - 定期轮换 `admin_token`

3. **日志安全：**
   - 生产环境设置 `logging.level` 为 `warn` 或更高
   - 启用 `logging.audit` 记录安全事件
   - 定期清理旧日志文件

## 更新日志

### v1.0.0
- 初始版本，统一配置系统
- 支持 YAML 配置文件
- 支持环境变量覆盖
- 实现配置加载优先级
