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

# 4. 启动开发服务器
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
- **分页功能**：客户端分页，自定义每页数量
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

## 配置

### 环境变量

```bash
# 必需
NODE_ENV=production
ADMIN_TOKEN=<32位随机字符串>
DATABASE_URL=postgresql://user:pass@host:5432/db

# 可选
API_PORT=8080
CLIENT_DEV_PORT=5173
MAX_LOCAL_ITEMS=100
```

### 本地配置

复制模板文件并编辑：

```bash
cp web/config.json.template web/config.json
```

## 项目结构

```
ad-fontes-manager
├── web/
│   ├── client/          # Vue 3 前端
│   ├── controllers/     # Express 控制器
│   ├── routes/          # API 路由
│   ├── services/        # 业务逻辑
│   └── server.js        # 后端入口
├── docs/
│   └── API.md           # API 文档
├── config.schema.yml    # 配置规范
└── README.md            # 本文件
```

## 文档

- [API 文档](./docs/API.md) - REST API 接口说明
- [开发文档](./DEVELOPMENT.md) - 架构说明和开发者指南
- [配置规范](./config.schema.yml) - 所有可配置参数
- [安全指南](./SECURITY.md) - 安全配置和最佳实践

## 数据库 Schema

```mermaid
erDiagram
    WORDS ||--|| ETYMOLOGIES : "词源信息"
    WORDS ||--|{ COGNATES : "同源词"
    WORDS ||--|{ EXAMPLES : "例句"
    WORDS ||--|{ SYNONYMS : "近义词"

    WORDS {
        uuid id PK
        text lemma "词元"
        jsonb original_yaml "原始 YAML"
        timestamp updated_at
    }
```

## Ad Fontes 生态

本项目是 Ad Fontes 三部曲之一：

1. **[Ad Fontes Prompts](https://github.com/yelanyanyu/ad-fontes-prompts)** - 核心提示词库
2. **[Ad Fontes Browser Extension](https://github.com/yelanyanyu/ad-fontes-browser-extension)** - 浏览器插件
3. **Ad Fontes Manager (本项目)** - 数据管理器

## 贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

[MIT License](./LICENSE)
