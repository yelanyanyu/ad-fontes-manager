# Ad Fontes Manager

> 词源数据管理器 - Ad Fontes 英语学习生态系统的核心数据管理组件

Ad Fontes Manager 是一个全栈 Web 应用，专为管理、可视化和存储词源数据而设计。支持离线优先、冲突同步和精美卡片预览。

## 快速开始

### 环境要求

- **Node.js**: 22 LTS 或更高版本
- **npm**: 10.0.0 或更高版本
- **PostgreSQL**: 14+ (可选，支持离线模式)

### 安装与运行

```bash
# 1. 克隆项目
git clone <repository-url>
cd ad-fontes-manager

# 2. 安装依赖
cd web
npm install
cd client && npm install && cd ..

# 3. 配置环境
cp .env.example .env
# 编辑 .env 文件设置数据库连接

# 4. 初始化数据库（可选）
cd node && node init_db.js && cd ..

# 5. 启动开发服务器
npm run dev
```

服务启动后：
- 前端：`http://localhost:5173`
- API：`http://localhost:8080/api`

## 核心特性

### 离线优先架构
- **双重存储**：浏览器 LocalStorage + PostgreSQL
- **智能同步**：离线 -> 在线自动批量上传
- **冲突检测**：可视化差异对比工具
- **自动刷新**：冲突解决后编辑器自动更新

### 数据管理
- **YAML 编辑器**：实时预览和格式验证
- **搜索排序**：模糊搜索 + 多种排序方式
- **分页功能**：服务端分页，自定义每页数量
- **卡片预览**：精美单词卡片生成与下载

### 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | 22 LTS |
| 后端框架 | Express | 5.x |
| 数据库 | PostgreSQL | 14+ |
| 前端框架 | Vue | 3.5+ |
| 构建工具 | Vite | 7.x |
| 状态管理 | Pinia | 3.x |
| 样式 | Tailwind CSS | 3.4+ |
| 日志 | Pino | 10.x |

## 配置

本项目遵循 [12-Factor App](https://12factor.net/) 原则，使用环境变量管理配置。

### 快速配置

**开发环境**:
```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 编辑 .env，填入你的数据库密码
# DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ad_fontes

# 3. 启动服务
cd web && npm run dev
```

**生产环境**:
```bash
# 使用 Docker Compose
echo "NODE_ENV=production
ADMIN_TOKEN=$(openssl rand -hex 32)
DATABASE_URL=postgresql://user:pass@db:5432/db?sslmode=require" > .env.production

docker-compose up -d
```

### 必需配置项

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 |
| `ADMIN_TOKEN` | 管理员 API 令牌（生产环境 ≥32 字符） |
| `NODE_ENV` | 运行环境: `development` / `production` / `test` |

### 配置优先级

```
1. 系统环境变量 (最高优先级)
2. .env 文件 (仅开发环境)
3. 代码默认值 (最低优先级)
```

**注意**: 生产环境禁止 `.env` 文件，应用会立即退出并报错。

更多配置说明请参考 [配置文档](./docs/CONFIGURATION.md)。

## 项目结构

```
ad-fontes-manager
├── web/
│   ├── client/          # Vue 3 前端
│   ├── controllers/     # Express 控制器
│   ├── routes/          # API 路由
│   ├── services/        # 业务逻辑
│   ├── utils/           # 工具函数
│   │   ├── logger.js    # Pino 日志系统
│   │   └── config.js    # 配置管理
│   └── server.js        # 后端入口
├── docs/                # 文档目录
├── node/                # Node.js 工具脚本
│   ├── init_db.js       # 数据库初始化
│   ├── loader.js        # YAML 数据导入
│   └── migrate_v2.js    # 数据库迁移
├── schema.sql           # 数据库 Schema
└── README.md            # 本文件
```

## 文档

- [API 文档](./docs/API.md) - REST API 接口说明
- [数据库文档](./docs/DATABASE.md) - 数据库 Schema 和表结构
- [开发文档](./docs/DEVELOPMENT.md) - 架构说明和开发者指南
- [安全指南](./docs/SECURITY.md) - 安全配置和最佳实践
- [日志系统](./docs/LOGGING.md) - 后端日志配置和使用
- [配置说明](./docs/CONFIGURATION.md) - 统一配置系统说明
- [TypeScript 迁移](./docs/TYPESCRIPT_MIGRATION.md) - TypeScript 迁移指南
- [编辑器设置](./docs/EDITOR_SETUP.md) - 编辑器配置建议

## 数据库 Schema

```mermaid
erDiagram
    words ||--o| etymologies : has
    words ||--o{ cognates : has
    words ||--o{ examples : has
    words ||--o{ synonyms : has
    words ||--o{ user_requests : tracks

    words {
        uuid id PK
        text lemma UK
        text syllabification
        text part_of_speech
        jsonb original_yaml
        timestamptz created_at
        timestamptz updated_at
        int revision_count
    }

    etymologies {
        uuid word_id PK,FK
        text prefix
        text root
        text suffix
        text pie_root
        text visual_imagery_zh
    }

    cognates {
        uuid id PK
        uuid word_id FK
        text cognate_word
        text logic
    }

    examples {
        uuid id PK
        uuid word_id FK
        text example_type
        text sentence
    }

    synonyms {
        uuid id PK
        uuid word_id FK
        text synonym_word
    }

    user_requests {
        uuid id PK
        uuid word_id FK
        text user_input
        text context_sentence
    }
```

## 更新日志

查看 [CHANGELOG.md](./CHANGELOG.md) 了解详细更新历史。

## Ad Fontes 生态

本项目是 Ad Fontes 三部曲之一：

1. **[Ad Fontes Prompts](https://github.com/yelanyanyu/ad-fontes-prompts)** - 核心提示词库
2. **[Ad Fontes Browser Extension](https://github.com/yelanyanyu/ad-fontes-browser-extension)** - 浏览器插件
3. **Ad Fontes Manager (本项目)** - 数据管理器

## 贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

[MIT License](./LICENSE)
