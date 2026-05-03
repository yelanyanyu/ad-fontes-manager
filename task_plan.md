# Plan: Electron Desktop Migration

> **状态**: 待执行
> **目标**: 将 Ad Fontes Manager 从纯 Web 应用迁移为支持 Windows/Mac 桌面应用，同时保留 Web 模式。

---

## 设计决策（已确定，勿改）

| # | 决策 | 选择 |
|---|------|------|
| 1 | 框架 | Electron（包大小预期 <500MB） |
| 2 | Express 运行方式 | 主进程直接跑 Express（方案 A） |
| 3 | 前端加载 | `loadURL(http://localhost:PORT)`（方案 A） |
| 4 | 数据库位置 | `app.getPath('userData')`，用户可在设置中修改 |
| 5 | 构建打包 | electron-vite + electron-builder |
| 6 | 目录结构 | `src/main/` + `src/preload/` + `src/renderer/` + `src/server/` 平级 |
| 7 | 数据目录设置 | 可选目录 → 复制迁移 → 重启生效 |
| 8 | 开发体验 | 双模式：`dev:web` + `dev:desktop` |
| 9 | 启动时序 | 读配置 → 初始化 DB → Express `listen(0)` → `loadURL` |
| 10 | 原生模块 | electron-rebuild 重新编译 better-sqlite3 |
| 11 | v1 范围 | 基础桌面包 + 数据目录设置（无自动更新/托盘/多窗口） |
| 12 | CI/CD | GitHub Actions（public repo，免费） |

---

## 目标目录结构

```
ad-fontes-manager/
├── src/
│   ├── main/                       # Electron 主进程（桌面模式专用）
│   │   └── index.ts                # BrowserWindow 管理 + 启动 Express
│   ├── preload/                    # Electron preload 脚本（桌面模式专用）
│   │   └── index.ts                # contextBridge 暴露给渲染进程的 API
│   ├── renderer/                   # Vue 3 前端（Web + 桌面共享）
│   │   ├── index.html              # Vite 入口 HTML
│   │   ├── src/
│   │   │   ├── main.ts             # Vue 应用入口
│   │   │   ├── App.vue
│   │   │   ├── components/
│   │   │   ├── views/
│   │   │   ├── stores/
│   │   │   ├── services/
│   │   │   ├── composables/
│   │   │   ├── utils/
│   │   │   ├── router/
│   │   │   └── types/
│   │   └── ...
│   └── server/                     # Express 后端（Web + 桌面共享）
│       ├── app.ts                  # 工厂函数：createApp(options) → Express app
│       ├── standalone.ts           # Web 模式入口（读 env，启动监听）
│       ├── controllers/
│       ├── routes/
│       ├── services/
│       ├── middleware/
│       ├── db/
│       ├── schemas/
│       └── utils/
├── drizzle/                        # Drizzle 迁移文件（位置不变）
├── assets/                         # 桌面应用图标等静态资源
│   └── icon.png                    # 应用图标（≥512x512）
├── electron.vite.config.ts         # 桌面模式构建配置
├── electron-builder.yml            # electron-builder 打包配置
├── vite.config.ts                  # Web 模式 renderer 构建配置
├── package.json                    # 根 package.json（所有脚本统一管理）
├── tsconfig.json                   # 根 TypeScript 配置
├── tsconfig.node.json              # Node 端 TS 配置
├── .env                            # 开发环境变量（已有）
├── .github/workflows/
│   ├── build-desktop-win.yml       # Windows 桌面构建
│   └── build-desktop-mac.yml       # Mac 桌面构建
└── CHANGELOG.md                    # 更新日志（已有）
```

---

## Phase 1: 安装 Electron 依赖

### Step 1.1: 根 package.json
- 新建根 `package.json`，包含以下依赖和脚本：

**dependencies（共享 server 依赖，从 `web/package.json` 迁入）:**
```
better-sqlite3, drizzle-orm, express@5, cors, helmet,
http-errors, http-status-codes, js-yaml, anki-apkg-export,
compromise, zod, pino, pino-http, pino-pretty,
rotating-file-stream, dotenv, deep-diff
```

**devDependencies（新增）:**
```
electron, electron-vite, electron-builder, @electron/rebuild,
typescript, tsx, vite, @vitejs/plugin-vue, tailwindcss,
autoprefixer, postcss, concurrently, cross-env,
vitest, eslint, prettier, vue-tsc, drizzle-kit
```

**scripts:**
```json
{
  "dev:web": "concurrently \"npm run dev:server\" \"npm run dev:renderer\"",
  "dev:server": "cross-env NODE_ENV=development tsx src/server/standalone.ts",
  "dev:renderer": "vite",
  "dev:desktop": "electron-vite dev",
  "build:web:renderer": "vite build",
  "build:web:server": "cross-env NODE_ENV=production tsc -p tsconfig.node.json || echo 'ok'",
  "build:web": "npm run build:web:renderer",
  "build:desktop:win": "electron-vite build && electron-builder --win",
  "build:desktop:mac": "electron-vite build && electron-builder --mac",
  "start:web": "cross-env NODE_ENV=production tsx src/server/standalone.ts",
  "type-check": "vue-tsc --noEmit -p tsconfig.json",
  "lint": "eslint .",
  "test": "vitest run"
}
```

### Step 1.2: 安装
```bash
npm install
```

---

## Phase 2: 文件迁移 —— 后端（`web/` → `src/server/`）

### Step 2.1: 创建目录结构
在 `src/server/` 下创建：
```
src/server/
├── controllers/
├── routes/
├── services/anki/
├── middleware/
├── db/
├── schemas/requests/
├── schemas/word/
├── utils/
├── app.ts       （新建，从 server.ts 重构）
└── standalone.ts（新建，Web 模式启动入口）
```

### Step 2.2: 迁移文件（复制并调整 import 路径）

**从 `web/` 复制到 `src/server/`：**
- `web/controllers/wordControllerV2.ts` → `src/server/controllers/`
- `web/routes/core.ts` → `src/server/routes/`
- `web/routes/wordsV2.ts` → `src/server/routes/`
- `web/services/anki/` 下所有文件 → `src/server/services/anki/`
- `web/services/conflictService.ts` → `src/server/services/`
- `web/services/wordService.ts` → `src/server/services/`
- `web/services/word/` 下所有文件 → `src/server/services/word/`
- `web/middleware/errorHandler.ts` → `src/server/middleware/`
- `web/middleware/validate.ts` → `src/server/middleware/`
- `web/middleware/writeAuth.ts` → `src/server/middleware/`
- `web/db/index.ts` → `src/server/db/`
- `web/db/schema.ts` → `src/server/db/`
- `web/schemas/` 下所有文件 → `src/server/schemas/`
- `web/utils/config.ts` → `src/server/utils/`
- `web/utils/errors.ts` → `src/server/utils/`
- `web/utils/logger.ts` → `src/server/utils/`
- `web/data/` → 保留在 `web/data/`（历史数据，不动）

**注意：这些文件当前用 `require()` / `module.exports`（CommonJS）。保持 CJS 不变，Vite/esbuild 处理 CJS/ESM 互操作。**

### Step 2.3: 更新 `drizzle.config.ts`

```ts
export default {
  schema: './src/server/db/schema.ts',  // 更新路径
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './web/data/ad_fontes.db',  // 开发用，不动
  },
};
```

### Step 2.4: 重构 `src/server/app.ts`（工厂函数模式）

当前 `web/server.ts` 做了三件事：
1. 创建并配置 Express app
2. 根据环境 serve 静态文件或重定向
3. `app.listen()` 启动

**改为：**
- `src/server/app.ts` → 导出 `createApp(options)` 工厂函数，只做第 1 步
  - `options.dbPath: string` — 数据库文件路径
  - `options.isProduction: boolean` — 是否生产模式（影响 static serve 行为）
  - `options.distDir?: string` — 前端构建产物目录（生产模式下 serve）

```ts
// src/server/app.ts 示意
export function createApp(options: {
  dbPath: string;
  isProduction: boolean;
  distDir?: string;
}): Express {
  // 设置 DATABASE_URL 环境变量让 db 模块读取
  process.env.DATABASE_URL = options.dbPath;

  const app = express();
  // ... 所有中间件、路由（与当前 server.ts 相同，但去掉 app.listen）

  if (options.isProduction && options.distDir) {
    app.use(express.static(options.distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(options.distDir, 'index.html'));
    });
  }

  return app;
}
```

**关键改动：**
- db 模块（`db/index.ts`）当前通过 `config.get('database.url')` 获取 db 路径 → 改为也接受环境变量 `DATABASE_URL` 覆盖
- 去掉 `app.listen()`，由调用方决定何时监听
- 开发模式的 Vite 重定向逻辑留在 `standalone.ts` 中

### Step 2.5: 创建 `src/server/standalone.ts`（Web 模式入口）

```ts
// src/server/standalone.ts 示意
import { createApp } from './app';
import { config } from './utils/config';

const app = createApp({
  dbPath: config.get('database.url', './data/ad_fontes.db'),
  isProduction: config.get('core.env') === 'production',
  distDir: path.join(__dirname, '..', 'dist'),
});

const port = config.get('server.port', 8080);
const host = config.get('server.host', '0.0.0.0');

app.listen(port, host, () => {
  console.log(`Server: http://${host}:${port}`);
});
```

### Step 2.6: 更新 `src/server/db/index.ts` 支持环境变量优先

当前 `resolveDbPath()` 从 config 读 `database.url`。改为：
```ts
const resolveDbPath = (): string => {
  // 环境变量优先（Electron 通过 createApp 注入）
  if (process.env.DATABASE_URL) {
    return path.isAbsolute(process.env.DATABASE_URL)
      ? process.env.DATABASE_URL
      : path.resolve(__dirname, '..', process.env.DATABASE_URL);
  }
  const configuredPath = config.get<string>('database.url', './data/ad_fontes.db');
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, '..', configuredPath);
};
```

---

## Phase 3: 文件迁移 —— 前端（`web/client/` → `src/renderer/`）

### Step 3.1: 迁移文件

**从 `web/client/` 复制到 `src/renderer/`：**
- `web/client/index.html` → `src/renderer/index.html`
- `web/client/src/` 下所有文件 → `src/renderer/src/`
- `web/client/public/` → `src/renderer/public/`

### Step 3.2: 更新 `index.html`

确保 script 入口指向 `src/main.ts`：
```html
<script type="module" src="/src/main.ts"></script>
```

### Step 3.3: 更新 `src/renderer/src/utils/request.ts`（Axios baseURL）

当前 `baseURL: '/api'`，通过 Vite proxy 转发到后端。这个设置在 Web 模式（Vite dev server proxy）和桌面模式（Express 直接在同一端口 serve）**都正确**，无需修改。

### Step 3.4: router 的 history mode 确认

当前用 `createWebHistory`。因为桌面模式通过 `loadURL('http://localhost:PORT')` 访问，是 HTTP URL（不是 `file://`），history mode 正常工作。**无需修改。**

---

## Phase 4: Web 模式 Vite 配置

### Step 4.1: 创建根 `vite.config.ts`（Web 模式专用）

从 `web/client/vite.config.ts` 复制并调整：
```ts
import vue from '@vitejs/plugin-vue';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'src/renderer',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer/src'),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 8081}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
```

### Step 4.2: 迁移 `tailwind.config.ts`

从 `web/client/tailwind.config.ts` 移到项目根目录。content 路径更新为：
```ts
content: ['./src/renderer/index.html', './src/renderer/src/**/*.{vue,js,ts,jsx,tsx}'],
```

---

## Phase 5: Electron 桌面模式配置

### Step 5.1: 创建 `electron.vite.config.ts`

```ts
import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['better-sqlite3'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: 'src/renderer',
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
      },
    },
    css: {
      postcss: {
        plugins: [tailwindcss(), autoprefixer()],
      },
    },
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
  },
});
```

### Step 5.2: 创建 `electron-builder.yml`

```yaml
appId: com.adfontes.manager
productName: Ad Fontes Manager
copyright: MIT

directories:
  buildResources: assets
  output: release

files:
  - out/**/*

win:
  target:
    - target: nsis
      arch: [x64]
  icon: assets/icon.png

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  license: LICENSE

mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: assets/icon.png
  category: public.app-category.education

linux:
  target: []
```

### Step 5.3: 创建 `src/main/index.ts`（Electron 主进程）

```ts
import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../server/app';

let mainWindow: BrowserWindow | null = null;
let serverInstance: ReturnType<typeof app.listen> | null = null;

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

function readDataDir(): string {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (config.dataDir && fs.existsSync(config.dataDir)) {
        return config.dataDir;
      }
    }
  } catch { /* fallback */ }
  const defaultDir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }
  return defaultDir;
}

function ensureConfig(): void {
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultDir = path.join(app.getPath('userData'), 'data');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ dataDir: defaultDir }, null, 2));
  }
}

async function createWindow(): Promise<void> {
  const dataDir = readDataDir();
  const dbPath = path.join(dataDir, 'ad_fontes.db');

  // 创建 Express app
  const serverApp = createApp({
    dbPath,
    isProduction: true,
    distDir: path.join(__dirname, '..', 'renderer'),
  });

  // 监听随机端口
  return new Promise((resolve) => {
    serverInstance = serverApp.listen(0, '127.0.0.1', () => {
      const address = serverInstance!.address() as { port: number };
      const port = address.port;

      mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 600,
        webPreferences: {
          preload: path.join(__dirname, '..', 'preload', 'index.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      mainWindow.loadURL(`http://localhost:${port}`);

      mainWindow.on('closed', () => {
        mainWindow = null;
      });

      resolve();
    });
  });
}

app.whenReady().then(async () => {
  ensureConfig();
  try {
    await createWindow();
  } catch (err) {
    dialog.showErrorBox(
      '启动失败',
      `无法启动 Ad Fontes Manager:\n${err instanceof Error ? err.message : String(err)}`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverInstance) {
    serverInstance.close();
  }
  app.quit();
});

app.on('before-quit', () => {
  if (serverInstance) {
    serverInstance.close();
  }
});
```

### Step 5.4: 创建 `src/preload/index.ts`

```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  setDataDir: (newPath: string) => ipcRenderer.invoke('set-data-dir', newPath),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
});
```

### Step 5.5: 在主进程中注册 IPC handlers

在 `src/main/index.ts` 的 `app.whenReady()` 中，`createWindow` 之前注册：

```ts
import { ipcMain } from 'electron';

ipcMain.handle('get-data-dir', () => readDataDir());

ipcMain.handle('set-data-dir', async (_event, newPath: string) => {
  // 验证路径
  if (!fs.existsSync(newPath)) {
    throw new Error('目录不存在');
  }
  // 如果目标目录没有 db 文件，复制过去
  const currentDir = readDataDir();
  const oldDb = path.join(currentDir, 'ad_fontes.db');
  const newDb = path.join(newPath, 'ad_fontes.db');
  if (fs.existsSync(oldDb) && !fs.existsSync(newDb)) {
    fs.copyFileSync(oldDb, newDb);
  }
  // 更新配置
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ dataDir: newPath }, null, 2));
  return { success: true, message: '数据目录已更新，请重启应用生效' };
});

ipcMain.handle('select-directory', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});
```

---

## Phase 6: 设置页面 —— 数据目录选择

### Step 6.1: 前端 Settings 页面（`src/renderer/src/views/SettingsView.vue`）

在现有 SettingsView 中新增"数据目录"区块（仅在 Electron 环境下显示）：

```vue
<script setup lang="ts">
// 检测是否在 Electron 环境
const isElectron = !!(window as any).electronAPI;

const dataDir = ref<string>('');
const statusMsg = ref<string>('');

async function loadDataDir() {
  if (!isElectron) return;
  dataDir.value = await (window as any).electronAPI.getDataDir();
}

async function selectAndSetDir() {
  if (!isElectron) return;
  const chosen = await (window as any).electronAPI.selectDirectory();
  if (!chosen) return;
  try {
    const result = await (window as any).electronAPI.setDataDir(chosen);
    statusMsg.value = result.message;
  } catch (e: any) {
    statusMsg.value = `错误: ${e.message}`;
  }
}

onMounted(loadDataDir);
</script>

<template>
  <!-- 现有设置内容 ... -->

  <!-- 数据目录设置（仅 Electron） -->
  <div v-if="isElectron" class="settings-section">
    <h3>数据目录</h3>
    <p>当前路径: {{ dataDir }}</p>
    <button @click="selectAndSetDir">选择新目录</button>
    <p v-if="statusMsg">{{ statusMsg }}</p>
  </div>
</template>
```

### Step 6.2: 类型声明

在 `src/renderer/src/types/` 新增 `electron.d.ts`：
```ts
interface ElectronAPI {
  getDataDir: () => Promise<string>;
  setDataDir: (path: string) => Promise<{ success: boolean; message: string }>;
  selectDirectory: () => Promise<string | null>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
```

---

## Phase 7: 配置更新和清理

### Step 7.1: 更新 `.gitignore`

追加：
```
# Electron build output
out/
release/

# Electron user data (dev)
electron-user-data/

# Keep old web directory (legacy backward compat)
web/dist/
```

### Step 7.2: 更新 tsconfig.json

根 `tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue"],
  "exclude": ["node_modules", "out", "release", "dist"]
}
```

### Step 7.3: 删除或归档旧文件

- `web/package.json` → 依赖已迁移到根，删除
- `web/client/package.json` → 依赖已迁移到根，删除
- `web/client/vite.config.ts` → 已替换为根 `vite.config.ts` 和 `electron.vite.config.ts`
- `web/client/node_modules/` → 删除
- `web/node_modules/` → 删除
- `web/server.ts` → 已重构为 `src/server/app.ts` + `standalone.ts`
- 旧 `web/data/` → **保留**（历史数据不删）

### Step 7.4: 验证 Web 模式

```bash
npm run dev:web        # 浏览器打开 http://localhost:5173
npm run build:web      # 检查 dist/ 产物
npm run start:web      # 生产模式启动
```

---

## Phase 8: 桌面模式测试

### Step 8.1: 开发模式测试

```bash
npm run dev:desktop
# 应打开 Electron 窗口，加载应用，所有功能正常
```

### Step 8.2: 生产构建测试

```bash
npm run build:desktop:win
# 检查 release/ 目录下的 .exe 安装包
```

### Step 8.3: 验证清单

- [ ] 首次启动自动创建 `userData/data/` 和 `ad_fontes.db`
- [ ] Express API 正常工作（词条 CRUD、Anki 导出）
- [ ] Vue 前端加载正常，路由切换正常
- [ ] 设置页显示数据目录，可选新目录
- [ ] 更换数据目录后提示重启
- [ ] 重启后新路径生效

---

## Phase 9: CI/CD（GitHub Actions）

### Step 9.1: Windows 构建 workflow

`.github/workflows/build-desktop-win.yml`：
```yaml
name: Build Desktop (Windows)
on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build:desktop:win
      - uses: actions/upload-artifact@v4
        with:
          name: AdFontesManager-Windows
          path: release/*.exe
```

### Step 9.2: Mac 构建 workflow

`.github/workflows/build-desktop-mac.yml`：
```yaml
name: Build Desktop (Mac)
on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build:desktop:mac
      - uses: actions/upload-artifact@v4
        with:
          name: AdFontesManager-Mac
          path: release/*.dmg
```

---

## 变更文件清单

| 操作 | 文件 | Phase |
|------|------|-------|
| **新建** | `package.json`（根） | 1 |
| **新建** | `src/server/app.ts` | 2 |
| **新建** | `src/server/standalone.ts` | 2 |
| 迁移 | `web/controllers/` → `src/server/controllers/` | 2 |
| 迁移 | `web/routes/` → `src/server/routes/` | 2 |
| 迁移 | `web/services/` → `src/server/services/` | 2 |
| 迁移 | `web/middleware/` → `src/server/middleware/` | 2 |
| 迁移 | `web/db/` → `src/server/db/` | 2 |
| 迁移 | `web/schemas/` → `src/server/schemas/` | 2 |
| 迁移 | `web/utils/` → `src/server/utils/` | 2 |
| 修改 | `src/server/db/index.ts` | 2 |
| 修改 | `drizzle.config.ts` | 2 |
| 迁移 | `web/client/` → `src/renderer/` | 3 |
| **新建** | `vite.config.ts`（根） | 4 |
| 迁移 | `tailwind.config.ts` → 根 | 4 |
| **新建** | `electron.vite.config.ts` | 5 |
| **新建** | `electron-builder.yml` | 5 |
| **新建** | `src/main/index.ts` | 5 |
| **新建** | `src/preload/index.ts` | 5 |
| 修改 | `src/renderer/src/views/SettingsView.vue` | 6 |
| **新建** | `src/renderer/src/types/electron.d.ts` | 6 |
| 修改 | `.gitignore` | 7 |
| **新建** | `tsconfig.json`（根） | 7 |
| **新建** | `.github/workflows/build-desktop-win.yml` | 9 |
| **新建** | `.github/workflows/build-desktop-mac.yml` | 9 |
| 删除 | `web/package.json` | 7 |
| 删除 | `web/client/package.json` | 7 |
| 删除 | `web/client/vite.config.ts` | 7 |
| 删除 | `web/server.ts` | 7 |

## 不涉及的文件

- `web/data/` — 历史数据，保留不动
- `node/` — 独立的 node 工具，不动
- `drizzle/` 迁移文件 — 内容不变
- `docs/` — 文档不动
- `.env` — 保留
- `CHANGELOG.md` — 保留
