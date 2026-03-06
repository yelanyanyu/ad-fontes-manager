# 项目配置混乱检查与修正计划

## 诊断报告

### 发现的问题

#### 1. 配置文件位置混乱 ❌

**问题描述：**

* 项目根目录有 `.env` 和 `.env.production`

* `web/` 目录下也有 `.env` 文件

* 根据规范，应该只在**项目根目录**有 `.env` 文件.env.production **保留**，只删除 web/.env（多余的）。

**规范要求：**

```
项目根目录/.env           ← 唯一正确的位置
web/.env                  ← 多余，应该删除
```

#### 2. 废弃的 `config.json` 仍在使用 ❌

**问题描述：**

* `web/client/vite.config.ts` 第 24-33 行仍在读取 `config.json`

* `web/localStore.ts` 第 27 行使用 `config.json`

* 根据 CONFIGURATION.md，已经移除了 `config.yml` 支持，但 `config.json` 仍有残留

**代码位置：**

```typescript
// vite.config.ts 第 24-33 行
const configPath = path.resolve(currentDir, '../config.json');
let config: Record<string, unknown> = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
} catch (_error) {
  config = {};
}
const apiPort = Number(config.API_PORT || process.env.API_PORT || 8080);
```

#### 3. 环境变量命名不一致 ❌

**问题描述：**

* `vite.config.ts` 使用 `API_PORT` 和 `CLIENT_DEV_PORT`

* `config.ts` 使用 `PORT` 和 `CLIENT_DEV_PORT`

* 规范中说明 `PORT` 和 `SERVER_PORT` 是别名关系

**实际映射：**

```typescript
// config.ts 中的映射
PORT: 'server.port',
SERVER_PORT: 'server.port',
CLIENT_DEV_PORT: 'client.dev_port',
```

**但 vite.config.ts 中使用：**

```typescript
process.env.API_PORT  // 未在 config.ts 中定义！
process.env.CLIENT_DEV_PORT
```

#### 4. 前端端口配置不规范 ❌

**问题描述：**

* 规范要求前端端口通过 `CLIENT_DEV_PORT` 配置

* 但 `vite.config.ts` 先从 `config.json` 读取，再从环境变量读取

* 应该统一从环境变量读取

#### 5. 混合使用多种配置方式 ❌

**问题描述：**

| 文件                          | 使用的配置方式                    | 问题     |
| --------------------------- | -------------------------- | ------ |
| `web/utils/config.ts`       | 环境变量 → 代码默认值               | ✅ 规范   |
| `web/client/vite.config.ts` | config.json → 环境变量         | ❌ 废弃方式 |
| `web/localStore.ts`         | config.json                | ❌ 废弃方式 |
| `web/routes/core.ts`        | config.get() + process.env | ❌ 混合使用 |

### 配置规范回顾

根据 `docs/CONFIGURATION.md`：

1. **配置优先级**：系统环境变量 > `.env` 文件 > 代码默认值
2. **必需配置**：`DATABASE_URL`, `ADMIN_TOKEN`, `NODE_ENV`
3. **服务器端口**：`PORT` 或 `SERVER_PORT`（别名）
4. **前端端口**：`CLIENT_DEV_PORT`
5. **生产环境**：禁止 `.env` 文件，使用系统环境变量或 Docker env\_file

## 修正计划

### Phase 1: 清理废弃配置（P0）

#### 任务 1.1: 删除多余的 .env 文件

* **文件**: `web/.env`

* **操作**: 删除此文件，所有配置统一到项目根目录 `.env`

* **验证**: 确认 `web/` 目录下没有 `.env` 文件

#### 任务 1.2: 移除 config.json 依赖

* **文件**: `web/client/vite.config.ts`

* **修改**:

  * 删除第 24-30 行的 config.json 读取逻辑

  * 直接从 `process.env` 读取配置

  * 使用 `dotenv` 加载项目根目录的 `.env` 文件

**修改后代码：**

```typescript
// vite.config.ts
import dotenv from 'dotenv';
import path from 'path';

// 加载项目根目录的 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const apiPort = Number(process.env.PORT || process.env.SERVER_PORT || 8080);
const clientPort = process.env.CLIENT_DEV_PORT;
```

#### 任务 1.3: 更新 localStore.ts

* **文件**: `web/localStore.ts`

* **修改**:

  * 删除 `config.json` 依赖

  * 使用 `config.ts` 获取 `MAX_LOCAL_ITEMS`

**修改后代码：**

```typescript
// localStore.ts
const config = require('./utils/config.ts');
this.limit = config.get('storage.max_items', 100);
```

### Phase 2: 统一配置访问（P0）

#### 任务 2.1: 修复 routes/core.ts

* **文件**: `web/routes/core.ts`

* **问题**: 第 79 行混用 `config` 和 `process.env`

* **修改**: 统一使用 `config.get()`

**修改后代码：**

```typescript
// 第 79 行
hasDatabaseUrl: !!config.get('database.url'),
```

#### 任务 2.2: 修复 vite.config.ts 环境变量

* **文件**: `web/client/vite.config.ts`

* **问题**: 使用 `API_PORT` 而不是 `PORT`

* **修改**: 统一使用 `PORT` 或 `SERVER_PORT`

**修改后代码：**

```typescript
const apiPort = Number(process.env.PORT || process.env.SERVER_PORT || 8080);
```

### Phase 3: 更新文档和模板（P1）

#### 任务 3.1: 更新 .env.example

* **文件**: `.env.example`

* **操作**:

  * 确保包含所有必需的环境变量

  * 添加注释说明每个变量的用途

  * 删除废弃的 `API_PORT`

**更新后内容：**

```bash
# 核心配置
NODE_ENV=development
ADMIN_TOKEN=dev-token-not-for-production

# 数据库配置
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ad_fontes

# 服务器配置（可选）
PORT=8080                    # API 服务器端口
SERVER_HOST=127.0.0.1        # 绑定地址
SERVER_CORS_ORIGINS=["*"]    # 跨域来源
SERVER_RATE_LIMIT=0          # 速率限制

# 前端配置（可选）
CLIENT_DEV_PORT=5173         # 前端开发服务器端口

# 其他配置（可选）
LOG_LEVEL=debug
MAX_LOCAL_ITEMS=100
```

#### 任务 3.2: 删除废弃的 config.json 文件

* **操作**: 如果存在 `web/config.json`，删除它

### Phase 4: 验证和测试（P1）

#### 任务 4.1: 验证配置加载

* **测试**:

  1. 删除 `web/.env` 和 `config.json`
  2. 在项目根目录 `.env` 中设置测试值
  3. 启动前后端，验证配置正确加载

#### 任务 4.2: 验证端口配置

* **测试**:

  1. 修改 `.env` 中的 `PORT` 和 `CLIENT_DEV_PORT`
  2. 重启服务，验证端口生效

#### 任务 4.3: 验证生产环境检查

* **测试**:

  1. 设置 `NODE_ENV=production`
  2. 确认应用检测到 `.env` 文件会报错退出

## 文件变更清单

### 删除文件

* `web/.env` - 多余的配置文件

* `web/config.json` - 废弃的配置文件（如果存在）

### 修改文件

* `web/client/vite.config.ts` - 移除 config.json 依赖，统一环境变量

* `web/localStore.ts` - 移除 config.json 依赖

* `web/routes/core.ts` - 统一使用 config.get()

* `.env.example` - 更新模板

## 验收标准

* [ ] `web/` 目录下没有 `.env` 文件

* [ ] `web/` 目录下没有 `config.json` 文件

* [ ] 所有配置统一从项目根目录 `.env` 加载

* [ ] `vite.config.ts` 使用 `PORT` 而不是 `API_PORT`

* [ ] `routes/core.ts` 统一使用 `config.get()`

* [ ] `localStore.ts` 使用 `config.get()` 获取配置

* [ ] 开发环境端口配置正常工作

* [ ] 生产环境 `.env` 检测正常工作

## 风险与注意事项

1. **开发环境中断风险**：修改配置加载方式可能导致开发环境暂时无法启动
2. **端口冲突**：修改端口配置后需要确保新端口未被占用
3. **团队协作**：需要通知团队成员更新本地配置

