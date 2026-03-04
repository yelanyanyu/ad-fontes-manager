# Etymos Manager 开发文档

本文档旨在帮助开发人员和 AI 助手快速理解 `Etymos Manager` (Ad Fontes Manager) 项目的架构、功能和运行机制。

## 1. 目录结构介绍

项目采用现代化的前后端分离架构（Vue 3 前端 + Express 后端）。

```text
ad-fontes-manager
├── docs/                       # 文档目录
│   └── API.md                  # API 接口文档
├── node/                       # Node.js 维护脚本
│   ├── init_db.js              # 数据库初始化
│   ├── loader.js               # 数据加载工具
│   ├── migrate_v2.js           # 迁移脚本
│   └── package.json
├── web/                        # Web 应用主目录
│   ├── client/                 # 前端 Vue 应用 (Vite + Vue 3)
│   │   ├── src/
│   │   │   ├── components/     # UI 组件
│   │   │   │   ├── Layout/     # 布局组件 (Header, Sidebar)
│   │   │   │   ├── WordEditor/ # 编辑器组件
│   │   │   │   ├── WordList/   # 列表组件
│   │   │   │   └── WordPreview/# 预览卡片组件
│   │   │   ├── stores/         # Pinia 状态管理
│   │   │   ├── utils/          # 工具函数
│   │   │   └── views/          # 页面视图
│   │   ├── package.json
│   │   └── vite.config.js
│   ├── controllers/            # 后端控制器
│   ├── db/                     # 数据库连接池
│   ├── routes/                 # Express 路由
│   ├── services/               # 业务逻辑服务层
│   ├── data/                   # 本地数据存储
│   ├── localStore.js           # 本地 JSON 存储引擎
│   └── server.js               # 后端入口
├── config.schema.yml           # 配置规范
├── task_plan.md               # 修复计划
├── findings.md                # 问题分析
├── progress.md                # 进度跟踪
├── CHANGELOG.md               # 变更日志
├── DEVELOPMENT.md             # 本文档
├── README.md                  # 项目说明
└── schema.sql                 # 数据库 Schema
```

## 2. 核心概念

**Etymos Manager** 是一个用于管理词源数据的 Web 工具。它允许用户通过 YAML 格式编写单词的深度解析（Yield, Etymology, Cognate, Application, Nuance），并将其保存到 PostgreSQL 数据库中。

### 核心特性
*   **YAML 编辑器**: 支持实时语法校验、自动格式化。
*   **双模存储**: 支持离线（本地 JSON）和在线（PostgreSQL）两种存储模式。
*   **同步机制**: 提供冲突检测、差异对比 (Diff) 和批量同步功能。
*   **预览功能**: 支持"精美卡片"和"Markdown 笔记"两种预览模式。
*   **响应式布局**: 带有可收起侧边栏的现代化 UI。

## 3. 技术栈详解

### 3.1 后端 (Node.js + Express)

| 组件 | 技术 | 用途 |
|------|------|------|
| 运行时 | Node.js 22 LTS | JavaScript 运行时 |
| 框架 | Express 5.x | Web 框架 |
| 数据库 | PostgreSQL 14+ | 主数据库 |
| 连接池 | pg (node-postgres) | PostgreSQL 客户端 |
| 配置 | dotenv | 环境变量管理 |

### 3.2 前端 (Vue 3 + Vite)

| 组件 | 技术 | 用途 |
|------|------|------|
| 框架 | Vue 3.5+ | 前端框架 |
| 构建 | Vite 7.x | 构建工具 |
| 状态 | Pinia 3.x | 状态管理 |
| 样式 | Tailwind CSS 3.4+ | CSS 框架 |
| 路由 | Vue Router 4.x | 客户端路由 |
| HTTP | Axios | HTTP 客户端 |
| YAML | js-yaml | YAML 解析 |

## 4. API 接口介绍

所有 API 均挂载在 `/api` 路径下。

### 4.1 核心与配置 (`/api/core`)
*   `GET /api/core/health`: 检查数据库连接状态。
*   `GET /api/core/config`: 获取服务器配置。
*   `POST /api/core/config`: 更新服务器配置（需要 admin_token）。

### 4.2 本地存储 (`/api/local`)
*   `GET /api/local`: 获取所有本地暂存的记录。
*   `POST /api/local`: 保存或更新本地记录。
*   `DELETE /api/local/:id`: 删除指定 ID 的本地记录。

### 4.3 同步与检测 (`/api/sync`)
*   `POST /api/sync`: 批量检测冲突并同步。
*   `POST /api/sync/resolve`: 解决同步冲突。

### 4.4 单词管理 (`/api/words`)
*   `GET /api/words`: 获取数据库中的单词列表。
    *   支持参数: `page`, `limit`, `search`, `sort`。
*   `GET /api/words/:lemma`: 获取单个单词详情。
*   `POST /api/words`: 保存单词到数据库。
*   `PUT /api/words/:lemma`: 更新单词。
*   `DELETE /api/words/:lemma`: 从数据库删除单词。

## 5. 项目运行流程

### 5.1 启动流程

1.  **环境准备**: 
    *   Node.js 22 LTS
    *   PostgreSQL 14+ (可选，支持纯本地模式)

2.  **依赖安装**:
    ```bash
    cd web
    npm install
    cd client && npm install
    ```

3.  **配置环境变量**:
    ```bash
    cp .env.example .env
    # 编辑 .env 文件
    ```

4.  **启动服务**:
    ```bash
    cd web
    npm run dev  # 开发模式
    # 或
    npm start    # 生产模式
    ```

### 5.2 数据流向

```mermaid
graph TD
    User["用户"] -->|编辑 YAML| Editor["WordEditor 组件"]
    Editor -->|保存| Router{"连接状态?"}
    
    Router -->|离线| LocalStore["LocalStorage"]
    Router -->|在线| API["API 层"]
    
    API -->|查询/写入| DB["PostgreSQL"]
    
    LocalStore -->|同步| SyncService["Sync 服务"]
    SyncService -->|检测冲突| ConflictCheck{"冲突?"}
    
    ConflictCheck -->|无冲突| API
    ConflictCheck -->|有冲突| ConflictModal["ConflictModal 组件"]
    ConflictModal -->|用户决策| User
    User -->|覆盖/跳过| SyncService
```

## 6. 前端架构

### 6.1 组件结构

```
src/components/
├── Layout/
│   ├── Header.vue          # 顶部导航栏
│   └── Sidebar.vue         # 侧边栏（可折叠）
├── WordEditor/
│   └── WordEditor.vue      # YAML 编辑器
├── WordList/
│   └── WordList.vue        # 单词列表（分页、搜索）
├── WordPreview/
│   └── WordPreview.vue     # 预览卡片
└── ui/
    ├── ConflictModal.vue   # 冲突解决弹窗
    └── ToastContainer.vue  # 通知提示
```

### 6.2 状态管理 (Pinia)

**appStore**: 应用级状态
- `dbConnected`: 数据库连接状态
- `toasts`: 通知消息队列
- `settings`: 用户设置

**wordStore**: 单词数据状态
- `localRecords`: 本地存储的单词
- `dbRecords`: 数据库中的单词
- `currentWord`: 当前编辑的单词
- `loading`: 加载状态

### 6.3 工具函数

```
src/utils/
├── conflict.js      # 冲突检测逻辑
├── generator.js     # 卡片/Markdown 生成
├── request.js       # Axios 封装
├── search.js        # 搜索算法
└── template.js      # 模板渲染
```

## 7. 后端架构

### 7.1 分层结构

```
web/
├── routes/           # 路由层 - 处理 HTTP 请求/响应
├── controllers/      # 控制器层 - 参数校验、调用服务
├── services/         # 服务层 - 业务逻辑
├── db/               # 数据层 - 数据库连接
└── localStore.js     # 本地存储层 - JSON 文件操作
```

### 7.2 关键服务

**wordService**: 单词核心业务逻辑
- `getWords()`: 分页查询单词列表
- `addWord()`: 添加新单词（含校验）
- `updateWord()`: 更新单词
- `deleteWord()`: 删除单词
- `getWordDetail()`: 获取单词详情（含关联数据）

**conflictService**: 冲突检测与解决
- `checkConflicts()`: 批量检测冲突
- `resolveConflict()`: 解决单个冲突

## 8. 配置系统

### 8.1 配置加载优先级

1. 环境变量 (`process.env`)
2. `.env` 文件
3. `config.json`（动态配置，可通过 API 修改）
4. 代码默认值

### 8.2 核心配置项

详见 [config.schema.yml](./config.schema.yml)。

必需配置：
```bash
NODE_ENV=production
ADMIN_TOKEN=<32位随机字符串>
DATABASE_URL=postgresql://user:pass@host:5432/db
```

## 9. 开发者指南

### 9.1 开发环境设置

```bash
# 1. 安装依赖
cd web && npm install
cd client && npm install

# 2. 创建 .env 文件
cd ..
cp .env.example .env
# 编辑 .env，设置开发环境配置

# 3. 启动开发服务器
npm run dev
```

### 9.2 代码规范

- **ESLint**: 代码质量检查
- **Prettier**: 代码格式化
- **Conventional Commits**: 提交信息规范

### 9.3 调试技巧

**前端调试**:
- 浏览器 Vue DevTools 查看 Pinia 状态
- 浏览器控制台查看 `window.__VUE__`

**后端调试**:
- 设置 `LOG_LEVEL=debug` 查看详细日志
- 使用 `console.log` 或断点调试

**数据库调试**:
- 查看 `web/data/local_words.json` 了解本地数据
- 使用 pgAdmin 或 psql 直接查询 PostgreSQL

## 10. 部署指南

### 10.1 Docker 部署

```bash
# 构建镜像
cd web
docker build -t ad-fontes-manager .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e ADMIN_TOKEN=<token> \
  -e DATABASE_URL=<url> \
  ad-fontes-manager
```

### 10.2 手动部署

```bash
# 1. 构建前端
cd web/client
npm run build

# 2. 设置环境变量
export NODE_ENV=production
export ADMIN_TOKEN=<token>
export DATABASE_URL=<url>

# 3. 启动服务
cd ..
npm start
```

## 11. 已知问题与修复计划

详见 [task_plan.md](./task_plan.md) 和 [findings.md](./findings.md)。

主要问题类别：
- **安全**: 配置端点认证、数据库连接安全
- **性能**: 数据库索引、请求缓存
- **代码质量**: ESLint 配置、错误处理

## 12. 相关文档

- [API 文档](./docs/API.md)
- [配置规范](./config.schema.yml)
- [修复计划](./task_plan.md)
- [问题分析](./findings.md)
- [进度跟踪](./progress.md)
- [变更日志](./CHANGELOG.md)

---

*本文档最后更新: 2026-03-04*
