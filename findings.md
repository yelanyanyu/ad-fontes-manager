# Findings: Ad Fontes Manager 项目分析

## 项目结构

```
d:\myCode\formal-projects\ad-fontes-manager\
├── docs/                       # 文档目录
│   └── API.md                  # API 接口文档
├── node/                       # Node.js 维护脚本
│   ├── init_db.js
│   ├── loader.js
│   ├── migrate_v2.js
│   └── package.json
├── web/                        # Web 应用主目录
│   ├── client/                 # 前端 Vue 应用
│   │   ├── src/
│   │   │   ├── components/     # UI 组件
│   │   │   ├── stores/         # Pinia 状态管理
│   │   │   ├── utils/          # 工具函数
│   │   │   ├── views/          # 页面视图
│   │   │   └── router/         # 路由配置
│   │   ├── package.json
│   │   └── vite.config.js
│   ├── controllers/            # 后端控制器
│   ├── db/                     # 数据库连接
│   ├── routes/                 # Express 路由
│   ├── services/               # 业务逻辑服务
│   ├── server.js               # 后端入口
│   └── package.json
├── schema.sql                  # 数据库 Schema
├── .env.example                # 环境变量示例
└── README.md
```

## 技术栈详情

### 后端
- Node.js 18+
- Express.js ^4.18.2
- PostgreSQL + pg ^8.11.3
- js-yaml ^4.1.0
- compromise ^14.14.5 (NLP)
- cors ^2.8.5
- deep-diff ^1.0.2

### 前端
- Vue 3 ^3.5.24
- Vite ^7.2.4
- Pinia ^3.0.4
- Vue Router ^4.6.4
- Tailwind CSS ^3.4.17
- Axios ^1.13.3
- marked ^17.0.1
- html-to-image ^1.11.13
- FontAwesome ^7.1.0
- Vitest ^2.1.9

## 关键文件位置

### 安全问题相关
- `web/db/index.js:12` - 数据库连接池初始化，x-db-url 请求头处理
- `web/routes/core.js:29` - /config 端点
- `web/server.js` - CORS 配置
- `web/config.json` - 敏感配置

### Bug 相关
- `web/services/wordService.js:146` - 变量使用错误
- `web/client/src/components/WordList/WordList.vue:390` - keyCode 使用
- `web/server.js:28` - clientPort 可能 undefined

### 性能相关
- `web/services/wordService.js:201-217` - 数据库查询
- `web/client/src/utils/request.js` - Axios 配置
- `web/client/src/main.js:7` - FontAwesome 导入
- `web/client/src/components/WordList/WordList.vue:34-44` - 计算属性
- `web/client/vite.config.js` - 构建配置

### 代码质量相关
- `web/client/src/utils/conflict.js` - YAML 排序逻辑
- `web/client/src/stores/wordStore.js` - 空 catch 块
- `web/client/src/components/WordEditor/WordEditor.vue` - 未使用导入

## 数据库 Schema

### 核心表
- **words**: 单词主表
- **etymologies**: 词源详情表 (1:1)
- **cognates**: 同源词表 (1:N)
- **examples**: 例句表 (1:N)
- **synonyms**: 近义词表 (1:N)

### 关键字段
- `lemma`: 单词（主键）
- `part_of_speech`: 词性
- `contextual_meaning_en`: 英文释义
- `revision_count`: 修订次数
- `created_at/updated_at`: 时间戳

## API 端点

### 核心 API (`/api/core`)
- GET `/health` - 健康检查
- POST `/config` - 更新配置 ⚠️ 无认证
- GET `/config` - 获取配置

### 单词 API (`/api/words`)
- GET `/` - 列表查询
- GET `/:lemma` - 详情查询
- POST `/` - 创建单词
- PUT `/:lemma` - 更新单词
- DELETE `/:lemma` - 删除单词

### 同步 API (`/api/sync`)
- POST `/` - 同步数据
- POST `/resolve` - 解决冲突

## 配置项

### 环境变量
- `DATABASE_URL` - PostgreSQL 连接字符串
- `MAX_LOCAL_ITEMS` - 本地存储最大条目数
- `NODE_ENV` - 运行环境

### 配置文件
- `web/config.json` - 数据库和本地存储配置
- `web/client/vite.config.js` - 前端构建配置
- `web/client/tailwind.config.js` - Tailwind 主题配置

## 已知限制

1. **Windows 脚本兼容性问题**: `NODE_ENV=production` 语法在 Windows 上无效
2. **缺少输入验证**: 没有使用 Joi/Zod 等验证库
3. **无速率限制**: 没有 express-rate-limit
4. **无 Helmet 中间件**: 缺少安全 HTTP 头
5. **测试覆盖率低**: 仅有一个测试文件

## 参考资料

- Express 安全最佳实践: https://expressjs.com/en/advanced/best-practice-security.html
- Vue 3 性能优化: https://vuejs.org/guide/best-practices/performance.html
- PostgreSQL 索引优化: https://www.postgresql.org/docs/current/indexes-types.html
