# Ad Fontes Manager 开发指南

## 开发环境设置

### 前置要求

- Node.js 22 LTS 或更高版本
- npm 10 或更高版本
- Git
- （可选）Windows 桌面构建需要 Visual Studio Build Tools（用于编译 better-sqlite3 等原生模块）

### 安装

```bash
git clone <repository-url>
cd ad-fontes-manager
npm install
```

项目是 monorepo 结构，根目录 `npm install` 会安装所有依赖（包括 Electron、Vue、Express 等）。`better-sqlite3` 等原生模块由 `electron-builder` 的 `@electron/rebuild` 自动处理。

### 配置环境变量

```bash
cp .env.example .env
```

开发环境最小配置：

```bash
NODE_ENV=development
ADMIN_TOKEN=dev-token-not-for-production
DATABASE_URL=./data/ad_fontes.db
```

## 启动开发环境

### Web 模式

```bash
npm run dev:web
```

同时启动：
- Express 后端：`http://localhost:8080`（`tsx watch` 热重载）
- Vite 前端：`http://localhost:5173`（HMR）

也可分别启动：

```bash
npm run dev:server     # 仅后端
npm run dev:renderer   # 仅前端
```

### 桌面模式（Electron）

```bash
npm run dev:desktop
```

electron-vite 同时构建 main / preload / renderer，然后在 Electron 窗口中加载。Express 后端运行在主进程中，监听随机端口。

## 项目架构

### 依赖层次

```
src/renderer/  (Vue 3 前端)
      |
      | HTTP / window.electronAPI
      |
src/server/    (Express 5 后端)  ← 被 main 进程和 web 开发服务器共用
      |
      | Drizzle ORM
      |
web/db/        (SQLite via better-sqlite3)
```

### 关键目录

| 目录 | 用途 |
|------|------|
| `src/main/` | Electron 主进程：窗口管理、IPC、Express 生命周期 |
| `src/preload/` | contextBridge 预加载：暴露受限 API 给渲染进程 |
| `src/renderer/` | Vue 3 前端：组件、Store、Composable、工具函数 |
| `src/server/` | Express 后端入口（`createApp()` 工厂函数） |
| `web/services/` | 业务逻辑层（按领域垂直切片） |
| `web/routes/` | API 路由定义 |
| `web/controllers/` | 请求处理控制器 |
| `web/middleware/` | Express 中间件（错误处理、认证、限流） |
| `web/db/` | Drizzle ORM Schema + 连接管理 |
| `web/schemas/` | Zod 校验 Schema（word、config 等） |
| `web/utils/` | 工具函数、日志、配置加载 |
| `node/` | CLI 脚本（数据库初始化、YAML 加载等） |
| `drizzle/` | 数据库迁移文件 |

### 数据流

```
用户输入 (YAML)
    ↓
YAML 解析 (js-yaml)
    ↓
本地语法校验 → 300ms 防抖 → 服务端 Schema 校验 (Zod)
    ↓
冲突检测 (deep-diff, 可选 forceUpdate)
    ↓
直接写入 words_v2 (Drizzle ORM + better-sqlite3)
    ↓
响应返回
```

## 开发规范

### 代码风格

```bash
npm run lint        # ESLint 检查
npm run lint:fix    # 自动修复
npm run format      # Prettier 格式化
```

### 提交规范

使用 Conventional Commits：

```
type(scope): subject
```

| 类型 | 说明 |
|------|------|
| feat | 新功能 |
| fix | Bug 修复 |
| docs | 文档更新 |
| style | 代码格式 |
| refactor | 重构 |
| perf | 性能优化 |
| test | 测试相关 |
| chore | 构建/工具相关 |

示例：

```bash
git commit -m "feat(anki): add batch duplicate detection"
git commit -m "fix(editor): reload YAML on re-edit of same word"
git commit -m "refactor(desktop): use fixed port for localStorage persistence"
```

## 后端开发

### 添加 API 端点（v2 模式）

1. 在 `web/routes/` 中定义路由
2. 在 `web/controllers/` 中编写控制器
3. 在 `web/services/` 中实现业务逻辑
4. 在 `web/schemas/` 中用 Zod 定义校验规则（如有输入）
5. 在 `web/server.ts` 的 `createApp()` 中注册路由

### 控制器模式

```typescript
// web/controllers/exampleController.ts
import { Request, Response } from 'express';
import { asyncHandler, BadRequest } from '../utils/errors';

export const exampleController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const data = await someService.getList(req.query);
    res.json({ success: true, data });
  }),
};
```

### 错误处理

项目使用分层错误处理：

- `web/utils/errors.ts` — `AppError` 基类、`asyncHandler` 包装器、`BadRequest` / `NotFound` 等快捷方法
- `web/middleware/errorHandler.ts` — 全局错误处理中间件

```typescript
import { asyncHandler, NotFound } from '../utils/errors';

router.get('/:id', asyncHandler(async (req, res) => {
  const word = await service.getById(req.params.id);
  if (!word) throw NotFound('单词不存在');
  res.json(word);
}));
```

## 前端开发

### 组件结构

```vue
<script setup lang="ts">
import { ref } from 'vue';
const title = ref<string>('Example');
</script>

<template>
  <div class="example">
    <h1>{{ title }}</h1>
  </div>
</template>
```

### Store 模式（Pinia）

```typescript
// stores/exampleStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useExampleStore = defineStore('example', () => {
  const items = ref<Item[]>([]);
  const count = computed(() => items.value.length);
  const addItem = (item: Item) => items.value.push(item);
  return { items, count, addItem };
});
```

### 桌面 API 访问

在桌面模式下，通过 `window.electronAPI` 访问 Electron 功能：

```typescript
// 获取管理令牌
const token = window.electronAPI?.adminToken;

// 获取数据目录
const dataDir = await window.electronAPI?.getDataDir();

// 选择目录
const dir = await window.electronAPI?.selectDirectory();
```

始终做好 fallback 处理，确保在 Web 模式下不会报错。

### 多语言支持

通过 v2 API 支持多语言。添加新语言时需修改：

1. `src/renderer/src/stores/appStore.ts` — 扩展 `LanguageCode` 类型，添加 `SUPPORTED_LANGUAGES` 条目
2. `web/schemas/word/` — 添加新语言的 Zod Schema
3. `web/services/word/WordServiceV2.ts` — `detectLanguage()` 添加检测规则
4. `web/services/word/WordValidator.ts` — Schema 选择逻辑

## 数据库

### Schema 管理

```bash
# 修改 web/db/schema.ts 后生成迁移
npx drizzle-kit generate

# 迁移在服务启动时自动执行
```

### 数据库文件

- Web 开发：`web/data/ad_fontes.db`
- 桌面开发：取决于 `DATABASE_URL` 环境变量或 `config.json`
- WAL 模式下会有 `-wal` 和 `-shm` 伴随文件，属于正常现象

## 桌面开发注意事项

### 原生模块

`better-sqlite3` 是原生模块，需要针对 Electron 的 Node.js 版本重新编译。`electron-builder` 通过 `@electron/rebuild` 自动处理。如果遇到原生模块加载错误，运行：

```bash
npx @electron/rebuild
```

### IPC 通信

渲染进程不能直接访问 Node.js API。所有系统级操作通过 preload 暴露的 IPC 接口完成：

```
渲染进程 → window.electronAPI → preload (contextBridge) → ipcRenderer.invoke → 主进程 handler
```

### 调试

- 主进程：在 `src/main/index.ts` 中 `mainWindow.webContents.openDevTools()`
- 渲染进程：Electron DevTools 或 Vue DevTools

## 测试

```bash
npm run test           # Vitest 前端单元测试
npm run test-api       # API 接口测试（需要运行中的后端）
```

## 常见问题

### 端口冲突

Web 模式后端默认 8080，前端默认 5173。修改方式：

```bash
PORT=8081 npm run dev:server
```

桌面模式端口随机分配，无需手动处理。

### 数据库初始化

如果 `web/data/ad_fontes.db` 不存在，服务启动时会自动创建并运行迁移。

### 桌面构建失败

1. 确认安装了 Visual Studio Build Tools（Windows）或 Xcode Command Line Tools（Mac）
2. 检查 `@electron/rebuild` 日志中的原生模块编译输出
3. 确保 `electron-builder.yml` 中的配置正确

## 外部资源

- [Vue 3 文档](https://vuejs.org/)
- [Express 文档](https://expressjs.com/)
- [Electron 文档](https://www.electronjs.org/)
- [Pinia 文档](https://pinia.vuejs.org/)
- [Drizzle ORM 文档](https://orm.drizzle.team/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
