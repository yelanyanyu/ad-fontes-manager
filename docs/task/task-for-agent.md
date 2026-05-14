# Task: Electron 打包时内联 Prompt 文件

> **状态**: 待实现

---

## 目标

将 `docs/prompts/` 下的所有 prompt 文件打入 Electron ASAR 包内，避免明文暴露在安装目录，同时确保桌面版 AI 功能在生产环境可用。

---

## 背景

`loader.ts` 当前从 `process.cwd() + 'docs/prompts'` 读取 prompt 文件。开发环境（`electron-vite dev`）正常工作，但生产 exe 中 `process.cwd()` 指向安装目录，`docs/prompts/` 不存在，AI 功能会报 `Prompt file not found`。

## 方案

构建时将 `docs/prompts/` 复制到 `out/server/prompts/`。`electron-builder.yml` 的 `files: - out/**/*` 自动将其打入 ASAR。运行时 `loader.ts` 双模式解析：开发用 `process.cwd()`，生产回退到 `__dirname`。

---

## 修改清单

### 1. `scripts/build-desktop.mjs`

在 `tsc` 与 `electron-builder` 之间加一步复制：

```js
import { cpSync } from 'node:fs';

// After tsc, before electron-builder:
cpSync('docs/prompts', 'out/server/prompts', { recursive: true });
```

### 2. `src/server/services/ai/prompts/loader.ts`

`promptsDir` 改为双模式解析：

```ts
const cwdPromptsDir = path.resolve(process.cwd(), 'docs', 'prompts');
// 开发环境 cwd 即项目根目录，docs/prompts 存在；生产 ASAR 内不存在，回退到 __dirname
const promptsDir = fs.existsSync(cwdPromptsDir)
  ? cwdPromptsDir
  : path.resolve(__dirname, '..', '..', '..', 'prompts');
```

`schemaFilesDir` 同理跟随 `promptsDir`。
