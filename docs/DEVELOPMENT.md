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

项目是 monorepo 结构，根目录 `npm install` 会安装所有依赖（包括 Electron、Vue、Express 等）。`better-sqlite3` 原生模块的 ABI 切换由脚本手动控制（参见下方「原生模块（ABI 切换）」章节）。

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

electron-vite 同时构建 main / preload / renderer，然后在 Electron 窗口中加载。Express 后端运行在主进程中，默认监听端口 19876。

### 生产模式（Web）

```bash
npm run build:web      # 构建前端
npm run start:web      # 启动生产后端（NODE_ENV=production）
```

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
data/          (SQLite via better-sqlite3)
```

### 关键目录

| 目录 | 用途 |
|------|------|
| `src/main/` | Electron 主进程：窗口管理、IPC、Express 生命周期、自动更新 |
| `src/preload/` | contextBridge 预加载：暴露受限 API 给渲染进程 |
| `src/renderer/` | Vue 3 前端：组件、Store、Composable、工具函数 |
| `src/server/` | Express 5 后端入口（`createApp()` 工厂函数） |
| `src/server/services/` | 业务逻辑层（按领域垂直切片：word, ai, anki） |
| `src/server/services/ai/` | AI 流水线：pipe, agents, tools, prompts, definitions, JobQueue |
| `src/server/routes/` | API 路由定义 |
| `src/server/controllers/` | 请求处理控制器 |
| `src/server/middleware/` | Express 中间件（错误处理、认证、限流、校验） |
| `src/server/db/` | Drizzle ORM Schema + 连接管理 |
| `src/server/schemas/` | Zod 校验 Schema（word、aiConfig、announcement 等） |
| `src/server/utils/` | 工具函数、日志、配置加载、格式修复 |
| `node/` | CLI 脚本（数据库初始化、YAML 加载等） |
| `drizzle/` | 数据库迁移文件 |
| `scripts/` | 构建和工具脚本（ABI 切换、桌面打包等） |

### 数据流

**手动编辑流程：**

```
用户输入 (YAML)
    ↓
YAML 解析 (js-yaml) + 重复键检测
    ↓
本地语法校验 → 300ms 防抖 → 服务端 Schema 校验 (Zod, strict 模式不自动修复)
    ↓
格式修复 (可选：语法修复 + 区块提升 + 其他确定性修复)
    ↓
冲突检测 (deep-diff, 可选 forceUpdate)
    ↓
直接写入 words_v2 (Drizzle ORM + better-sqlite3)
    ↓
响应返回
```

**AI 生成流程：**

```
用户输入 (单词 + 上下文 + 语言)
    ↓
POST /api/v2/generate/single → 创建 PipelineJob
    ↓
SequentialRunner 执行 3 阶段流水线：
  1. searching (fast model)   — 在线词源搜索 + 结构化研究
  2. pondering (balanced model) — 创意富化 + 同源词 + 例句
  3. auditing (expert model)   — 质量评分 + 修改建议
    ↓
SSE 实时推送进度 (step:start / step:tokens / step:reasoning / step:toolCall / step:complete / pipeline:complete)
    ↓
前端接收 YAML → 格式修复 → 填入编辑器 → 用户审查/修改 → 保存
```

**内容修复 (Content Fix) 流程：**

```
complete Job (overall_score < 6)
    ↓
POST /api/v2/generate/:jobId/fix → 创建 Fix Job
    ↓
fixing (expert model) — 根据 revision_notes 自动修复
    ↓
auditing (expert model) — 重新审核评分
    ↓
SSE 流式返回结果 → 用户审查
```

### AI 流水线架构

3 阶段流水线配置于 `src/server/services/ai/definitions/`（英语/德语 fix/audit-fix 各一份）。`SequentialRunner`（`pipe.ts`）按序执行各阶段，每阶段：

1. 通过 `modelResolver` 解析模型配置（`fast`/`balanced`/`expert` 对应实际模型）
2. 通过 `endpointResolver` 确定端点类型（OpenAI / Anthropic）
3. 通过 `prompts/loader.ts` 加载 Prompt 模板并注入变量
4. 通过 AI SDK `streamText()` 调用 LLM，传递 tools 和 reasoning 配置
5. 通过 SSE 向前端实时推送 tokens、reasoning、tool calls
6. 解析 LLM 输出（`agents/` 中的 parser），合并到 `PipelineContext`
7. 调用 `checkStopLoss()` 检查输出是否为空（止损机制）

**多厂商 AI 支持**：OpenAI 官方供应商使用 `@ai-sdk/openai`，第三方 OpenAI 兼容厂商（硅基流动、DashScope 等）使用 `@ai-sdk/openai-compatible`，Anthropic 格式模型使用 `@ai-sdk/anthropic`。`endpointResolver` 和 `createProvider` 自动选择正确的 SDK 包和端点。每个 model 可通过 `endpointType` 字段单独指定端点类型，provider 可通过 `anthropicBaseUrl` 字段设置 Anthropic 格式的独立端点。

**Tool 集成**：searching 阶段可调用 `searchEtymology` 和 `fetchPage` 两个 tool，tool call/results 通过 SSE 实时广播给前端。搜索支持 Brave Search API 和 Tavily Search API 两种后端。

**断点续传**：失败的 job 可通过 `POST /:jobId/resume` 从任意阶段重新开始，保留之前阶段的输出。`PipelineContext` 携带全部中间状态。

**Auto Fix**：审核阶段给出 `revision_notes` 后，`POST /:jobId/fix` 调用 `content-fixer` prompt 修复 YAML，重新走 fixing → auditing 两个阶段，结果通过 SSE 流式返回。

**Workset Improve**：对工作集中评分低于阈值的词条批量创建 Fix Job，每个 Job 继承源 Job 的 Improve Count + 1。

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

1. 在 `src/server/routes/` 中定义路由
2. 在 `src/server/controllers/` 中编写控制器
3. 在 `src/server/services/` 中实现业务逻辑
4. 在 `src/server/schemas/` 中用 Zod 定义校验规则（如有输入）
5. 在 `src/server/app.ts` 的 `createApp()` 中注册路由

### 控制器模式

```typescript
// src/server/controllers/exampleController.ts
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

- `src/server/utils/errors.ts` — `AppError` 基类、`asyncHandler` 包装器、`BadRequest` / `NotFound` 等快捷方法
- `src/server/middleware/errorHandler.ts` — 全局错误处理中间件

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
const dir = await window.electronAPI?.selectDirectory;

// 软件更新
const updateStatus = await window.electronAPI?.checkForUpdates();
```

始终做好 fallback 处理，确保在 Web 模式下不会报错。

### 多语言支持

通过 v2 API 支持多语言。添加新语言时需修改：

1. `src/renderer/src/stores/appStore.ts` — 扩展 `LanguageCode` 类型，添加 `SUPPORTED_LANGUAGES` 条目
2. `src/server/schemas/word/` — 添加新语言的 Zod Schema
3. `src/server/services/word/WordServiceV2.ts` — `detectLanguage()` 添加检测规则
4. `src/server/services/word/WordValidator.ts` — Schema 选择逻辑

## YAML 格式修复

编辑器和服务端均集成了格式修复（Format Fix）功能，分为两个层级：

### Basic Format Fix（确定性修复）

在保存前、Fill Editor 前、Workset Save 前自动运行（也可通过编辑器工具栏手动触发）。包括：
- YAML 语法修复（markdown fence、引号错误、标量格式）
- 区块提升（Section Promotion）：检测并纠正被错误嵌套在 `yield` 下的顶层区块
- 重复区块检测：发现重复的 YAML 映射键和顶层区块

Basic Format Fix 是确定性的，不涉及 LLM 调用。

### Enhanced Format Fix（LLM 修复）

用户手动触发，使用 LLM 进行更复杂的格式修复。适用于 Basic Format Fix 无法自动修复的情况。

### 编辑器校验

编辑器实时校验使用 **严格模式**（`repair: false`），即不自动修复地检测当前 YAML 的语法和 Schema 问题。校验有 300ms 防抖和请求去重，并提供实时状态指示器。

## 数据库

### Schema 管理

```bash
# 修改 src/server/db/schema.ts 后生成迁移
npx drizzle-kit generate

# 迁移在服务启动时自动执行
```

v2 仅使用 `words_v2` 表和 `job_queue` 表。旧的 v1 表 (`words`) 和相关 schema 已移除。

### 数据库文件

- Web 开发：`data/ad_fontes.db`
- 桌面开发：取决于 `DATABASE_URL` 环境变量或 `config.json`
- WAL 模式下会有 `-wal` 和 `-shm` 伴随文件，属于正常现象

## 配置系统

项目使用双层配置（`.env` + `config.json`），详见 [docs/CONFIGURATION.md](./CONFIGURATION.md)。关键变化：

- `config.json` 包含 `schemaVersion` 字段，支持版本化配置迁移
- 桌面模式下，`config.json` 存储在 `<userData>/config.json`
- 升级时通过配置迁移保持用户设置（API Key、自定义 Provider 等）
- 支持配置导出用于备份或迁移到其他设备

## 桌面开发注意事项

### 原生模块（ABI 切换）

`better-sqlite3` 是 C++ 原生模块，它的 `.node` 文件必须匹配加载它的运行时 ABI：

| 运行时 | ABI 版本 |
|--------|---------|
| 系统 Node.js 22（Web/dev 后端） | 127 |
| Electron 39 内置 Node（桌面应用） | 140 |

**两套 ABI 不能共存。** 用以下脚本手动切换：

```bash
npm run native:node        # 为 Web/dev 准备 ABI 127
npm run native:electron    # 为 Electron 准备 ABI 140
```

日常开发不需要手动记 — `npm run dev:web` 和 `npm run build:desktop:win` 会自动调用对应脚本。

**桌面构建流程**：

```text
npm run build:desktop:win|mac
  ├── electron-vite build
  ├── npm run native:electron            # 切换到 Electron ABI 140
  ├── electron-builder                   # 打包
  └── finally: npm run native:node       # 恢复 Node ABI 127（无论构建成败）
```

**`electron-builder.yml` 必须保持**：

```yaml
npmRebuild: false              # 不由 electron-builder 重编原生模块
buildDependenciesFromSource: false
asarUnpack:
  - "**/*.node"                # .node 文件不打入 asar
```

**常见故障**：

| 现象 | 根因 | 处理 |
|------|------|------|
| Web/dev 报 `ECONNRESET` | 根 `node_modules` 处于 Electron ABI 140 | `npm run native:node` |
| 桌面启动后闪退 | 打包的 `.node` 是 Node ABI 127 | 确保用 `npm run build:desktop:win` 而非直接 `electron-builder` |
| `EPERM: operation not permitted, unlink` | Windows 进程正在加载该 `.node` | 关闭所有 dev server 和桌面应用后重试 |
| `node-gyp failed to rebuild` | C++ 编译环境不全 | Windows: 安装 VS Build Tools（Desktop development with C++）；macOS: `xcode-select --install` |

详细 ABI 说明和调试步骤见 [docs/ELECTRON_NATIVE_MODULES.md](./ELECTRON_NATIVE_MODULES.md)。

### 软件更新（仅桌面版）

桌面应用通过 `electron-updater` 支持自动更新：

- **自动检查**：启动时检查 GitHub Releases（24 小时最小间隔）
- **手动检查**：设置页面的"检查更新"按钮
- **自动下载**：发现新版本后在后台下载安装包
- **安装**：需要用户显式确认（不会自动安装）
- **跳过版本**：用户可选择跳过某个版本，自动提醒不再提示但手动检查仍可见
- 安装前检查队列状态，如有活跃 Job 会警告

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

Web 模式后端默认 8080，前端默认 5173。桌面模式后端默认 19876。修改方式：

```bash
PORT=8081 npm run dev:server
```

桌面模式端口通过 `DESKTOP_SERVER_PORT` 环境变量配置。

### 数据库初始化

如果 `data/ad_fontes.db` 不存在，服务启动时会自动创建并运行迁移。

### 桌面构建失败

1. 确认安装了 Visual Studio Build Tools（Windows，Desktop development with C++）或 Xcode Command Line Tools（Mac，`xcode-select --install`）
2. 检查 `@electron/rebuild` 日志中的原生模块编译输出
3. 确保 `electron-builder.yml` 中 `npmRebuild: false` 未改动
4. 构建前关闭所有 dev server 和已启动的桌面应用（避免 Windows `EPERM` 文件锁）
5. 构建后验证 ABI 恢复：`node -e "require('better-sqlite3'); console.log('node abi ok')"`
6. 详细故障排查见 [docs/ELECTRON_NATIVE_MODULES.md](./ELECTRON_NATIVE_MODULES.md)

## 外部资源

- [Vue 3 文档](https://vuejs.org/)
- [Express 5 文档](https://expressjs.com/)
- [Electron 文档](https://www.electronjs.org/)
- [Pinia 文档](https://pinia.vuejs.org/)
- [Drizzle ORM 文档](https://orm.drizzle.team/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
- [Vercel AI SDK 文档](https://sdk.vercel.ai/)
