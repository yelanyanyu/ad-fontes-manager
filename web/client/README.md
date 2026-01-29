# Ad Fontes Manager - Frontend Client

Ad Fontes Manager 的前端部分，基于 **Vue 3 + Vite** 构建，提供了一个现代化的界面来管理词源数据。它集成了 YAML 编辑器、实时预览、冲突解决和离线优先的数据同步功能。

## 📋 项目概述

此目录 (`web/client`) 包含了项目的用户界面代码。主要负责：

*   **数据展示**：以卡片或 Markdown 形式展示词源数据。
*   **交互编辑**：提供基于 YAML 的专业编辑器，支持实时校验。
*   **状态同步**：处理本地离线数据与后端数据库的同步逻辑。
*   **配置管理**：动态配置数据库连接和应用偏好。

**技术栈：**
*   **框架**: Vue 3 (Composition API, `<script setup>`)
*   **构建工具**: Vite
*   **样式**: Tailwind CSS + FontAwesome
*   **状态管理**: Pinia
*   **路由**: Vue Router
*   **HTTP 客户端**: Axios
*   **工具库**: js-yaml (YAML 解析), marked (Markdown 渲染)

## 🛠️ 环境要求

在开始之前，请确保您的开发环境满足以下要求：

*   **Node.js**: >= 16.0.0
*   **npm**: >= 7.0.0
*   **后端服务**: 推荐启动 `ad-fontes-manager` 后端 API 以获得完整功能（尽管前端支持部分离线操作）。

## 🚀 快速启动

### 1. 初始化项目

```bash
# 进入前端目录
cd web/client

# 安装依赖
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

*   默认访问地址: `http://localhost:5173`
*   开发服务器会自动代理 `/api` 请求到后端（默认端口 3000，可配置）。

### 3. 构建生产版本

```bash
npm run build
```

构建产物将输出到 `../dist` 目录，供后端服务器静态托管。

## 📂 项目结构

```text
web/client/
├── public/              # 静态资源 (favicon, robots.txt)
├── src/
│   ├── assets/          # 全局样式 (main.css)
│   ├── components/      # Vue 组件
│   │   ├── Layout/      # 布局组件 (Header, Sidebar)
│   │   ├── WordEditor/  # 核心编辑器组件
│   │   ├── WordList/    # 列表展示组件
│   │   ├── WordPreview/ # 预览卡片/Markdown 组件
│   │   └── ui/          # 通用 UI 组件 (Modal, Toast)
│   ├── router/          # 路由配置
│   ├── stores/          # Pinia 状态管理
│   │   ├── appStore.js  # 应用级状态 (Sidebar, Toasts)
│   │   └── wordStore.js # 核心业务状态 (数据加载, 同步)
│   ├── utils/           # 工具函数
│   │   ├── request.js   # Axios 封装 (拦截器, 错误处理)
│   │   ├── generator.js # Markdown/HTML 生成器
│   │   └── conflict.js  # 数据冲突检测算法
│   ├── views/           # 页面视图 (Home, Editor, Settings)
│   ├── App.vue          # 根组件
│   └── main.js          # 应用入口
├── vite.config.js       # Vite 配置 (代理, 别名)
└── tailwind.config.js   # Tailwind 主题配置
```

## 💻 核心开发工作流

### 1. 添加新页面/组件
*   在 `src/views` 创建页面组件。
*   在 `src/router/index.js` 注册路由。
*   通用 UI 组件放在 `src/components/ui`。

### 2. 调用 API
使用封装好的 `request` 工具，它会自动处理 baseURL 和错误提示。

```javascript
import request from '@/utils/request'

// GET 请求
const data = await request.get('/words', { params: { page: 1 } })

// POST 请求
await request.post('/words', { yaml: content })
```

### 3. 状态管理 (Pinia)
业务逻辑主要集中在 `stores/wordStore.js`。

```javascript
import { useWordStore } from '@/stores/wordStore'
const store = useWordStore()

// 调用 Action
await store.fetchDbRecords()

// 访问 State
console.log(store.dbRecords)
```

## ⚙️ 配置说明

### 代理配置 (`vite.config.js`)
开发环境下的 API 代理配置位于 `server.proxy`。它会自动尝试读取父目录的 `web/config.json` 或环境变量来确定后端端口。

```javascript
// 逻辑片段
const apiPort = config.API_PORT || process.env.API_PORT || 3000
// 代理 /api -> http://localhost:3000
```

### 样式配置 (`tailwind.config.js`)
可以在此文件中扩展 Tailwind 的主题颜色、字体等。

## ❓ 故障排除

**Q: 启动时报错 "backend not connected"？**
*   检查后端服务是否在端口 3000 (或配置的端口) 运行。
*   检查 `web/config.json` 中的 `API_PORT` 设置是否正确。

**Q: 依赖安装失败？**
*   尝试删除 `node_modules` 和 `package-lock.json` 后重新运行 `npm install`。
*   确保 Node.js 版本符合要求。

**Q: 样式未生效？**
*   确保 `npm run dev` 正在运行，Tailwind 需要实时编译。
*   检查组件是否包含在 `tailwind.config.js` 的 `content` 配置中。

## 📚 后续步骤

*   [Vue 3 官方文档](https://vuejs.org/)
*   [Vite 文档](https://vitejs.dev/)
*   [Tailwind CSS 文档](https://tailwindcss.com/)
