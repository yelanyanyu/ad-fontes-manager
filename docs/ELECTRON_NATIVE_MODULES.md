# Electron Native Modules 运行时 ABI 手册

> 适用范围：Electron 桌面构建、Web/dev 后端、`better-sqlite3` native addon  
> 当前关键版本：Node.js 22 ABI 127；Electron 39 ABI 140  
> 核心原则：ABI 不能真正统一，只能由脚本在不同运行时前自动切换

---

## 一句话结论

本项目同时支持 Web/dev 和 Electron desktop 两种运行时。`better-sqlite3` 是 C++
native addon，它的 `.node` 文件必须匹配“加载它的运行时 ABI”。

- Web/dev 后端由系统 Node.js 加载，当前 Node.js 22 需要 ABI **127**
- Desktop 后端由 Electron 39 内置 Node/V8 加载，需要 ABI **140**

所以根目录的：

```text
node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

不能同时兼容 127 和 140。可统一的是**构建流程**，不是 ABI 本身。

---

## 现在应该使用的命令

日常不用手动记 ABI，直接用这些入口：

```bash
pnpm run dev:web
pnpm run build:web
pnpm run start:web
pnpm run build:desktop:win
pnpm run build:desktop:mac
```

这些脚本会自动做 ABI 准备：

- Web/dev 入口先运行 `pnpm run native:node`
- Desktop 构建入口先运行 `pnpm run native:electron`
- Desktop 构建结束后，无论成功失败，都会运行 `pnpm run native:node` 恢复本地开发环境

手动诊断时才需要直接运行：

```bash
pnpm run native:node      # 确保根 node_modules 可被当前 Node.js 加载
pnpm run native:electron  # 为 Electron 运行时重编译 better-sqlite3
```

---

## 当前脚本分工

### `scripts/ensure-node-native.mjs`

对应命令：

```bash
pnpm run native:node
```

用途：

1. 先尝试用当前 Node.js 打开 `better-sqlite3` 内存数据库
2. 如果能加载，直接跳过
3. 如果不能加载，执行 `pnpm rebuild better-sqlite3`
4. rebuild 后再次验证能否加载

这保证 Web/dev 后端不会因为根 `node_modules` 仍是 Electron ABI 140 而崩。

注意：只执行 `require('better-sqlite3')` 不够。`better-sqlite3` 的 JS 入口可能先加载成功，
真正的 native `.node` 文件会在 `new Database(...)` 时加载。因此验证必须实际打开数据库：

```bash
node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close();"
```

### `scripts/ensure-electron-native.mjs`

对应命令：

```bash
pnpm run native:electron
```

用途：

1. 读取 `.forge-meta` 检查当前 ABI 是否已是 140
2. 如果已是 Electron ABI 140，直接跳过
3. 如果不是，先检查是否有进程正在加载 `better_sqlite3.node`
4. 如果发现锁定进程，自动终止这些进程
5. 执行 `@electron/rebuild` 重编译

这保证桌面构建不会因为 ABI 不匹配而闪退。

核心命令等价于：

```bash
npx @electron/rebuild --version <electron version> --which-module better-sqlite3 --force --build-from-source
```

### `scripts/rebuild-electron-native.mjs`

对应命令：

```bash
pnpm run rebuild:electron:native
```

强制重建（不检查当前 ABI，始终执行 rebuild）。用于手动修复或调试场景，日常应优先使用 `pnpm run native:electron`。

### `scripts/build-desktop.mjs`

对应命令：

```bash
pnpm run build:desktop:win
pnpm run build:desktop:mac
```

流程：

```text
node scripts/build-desktop.mjs win|mac
  ├── electron-vite build
  ├── pnpm run build:desktop:server
  ├── pnpm run native:electron
  ├── electron-builder --win|--mac
  └── finally: pnpm run native:node
```

`finally` 很重要：即使桌面构建失败，也要把根 `node_modules` 恢复到当前 Node.js 可用状态。

---

## `electron-builder.yml` 必须保持的设置

当前策略是：不要让 electron-builder 自己重编 native 依赖。native rebuild 只由我们的脚本负责。

```yaml
npmRebuild: false
buildDependenciesFromSource: false

asarUnpack:
  - '**/*.node'
```

原因：

- `npmRebuild: true` 会让 electron-builder 在我们显式 rebuild 之外再次介入
- Windows 上打包目录和根目录可能存在硬链接/文件占用问题
- native rebuild 的时机必须可控，否则容易出现构建成功但运行时 ABI 错误

`pnpm-workspace.yaml` 也必须保持：

```yaml
nodeLinker: hoisted
```

原因是 electron-builder 会读取磁盘上的 `node_modules` 来收集运行时依赖。pnpm 默认布局更严格，但桌面包需要在 `resources/app.asar` 里独立解析依赖，不能依赖开发机上的 `.pnpm` 链接结构。

`scripts/after-pack.mjs` 还会修补一组生产依赖小包。它们本来属于生产依赖图，但 pnpm + electron-builder 的组合可能漏掉这类深层 CommonJS 依赖。不要随手删掉 `pnpmRuntimeDependencyPatches`；如果删除后桌面启动时报 `Cannot find module 'ee-first'`、`Cannot find module 'wrappy'` 之类错误，就是这条保护线失效了。

---

## 常见故障 1：Web/dev 出现 ECONNRESET 或 ECONNREFUSED

### 现象

Vite 输出类似：

```text
[vite] http proxy error: /api/v2/words...
Error: read ECONNRESET
AggregateError [ECONNREFUSED]
```

### 真正原因

通常不是 Vite proxy 的问题，而是 Express 后端进程先崩了。常见根因是：

```text
better_sqlite3.node was compiled against a different Node.js version
using NODE_MODULE_VERSION 140. This version of Node.js requires
NODE_MODULE_VERSION 127.
```

也就是根 `node_modules` 还停留在 Electron ABI 140，但 Web/dev 后端由系统 Node.js 加载，需要 ABI 127。

### 处理

```bash
pnpm run native:node
pnpm run dev:web
```

验证：

```bash
node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close(); console.log('node abi ok')"
```

---

## 常见故障 2：Desktop 启动后闪退或首次 API 请求后退出

### 现象

桌面包能构建出来，但启动后几秒闪退，或前端页面加载后第一次 API 请求触发退出。

### 典型错误

```text
better_sqlite3.node was compiled against a different Node.js version
using NODE_MODULE_VERSION 127. This version of Node.js requires
NODE_MODULE_VERSION 140.
```

### 真正原因

打包给 Electron 的 `.node` 文件仍是 Node ABI 127，但 Electron 39 需要 ABI 140。

### 处理

使用桌面构建入口，不要直接跳过脚本调用 electron-builder：

```bash
pnpm run build:desktop:win
pnpm run build:desktop:mac
```

不要直接运行：

```bash
electron-builder --win
```

除非你已经手动确认 `pnpm run native:electron` 成功执行。

---

## 常见故障 3：`EPERM: operation not permitted, unlink better_sqlite3.node`

### 现象

`native:electron` 或桌面构建期间输出：

```text
Building modules: better-sqlite3
EPERM: operation not permitted, unlink
D:\...\node_modules\better-sqlite3\build\Release\better_sqlite3.node
```

### 真正原因

Windows 正在加载这个 native DLL，导致 `electron-rebuild` 无法删除/替换它。通常是某个 Node/Electron 进程还活着：

- `pnpm run dev:web`
- `pnpm run dev:server`
- `pnpm run dev:desktop`
- 之前启动的 `Ad Fontes Manager.exe`
- Electron preview window

当前 `scripts/rebuild-electron-native.mjs` 会提前检查并列出占用进程，例如：

```text
Processes currently loading this file:
- PID 45572: node (G:\99-programsFiles\nodejs\node.exe)
```

### 处理

先关闭相关终端或应用，然后重试：

```bash
pnpm run build:desktop:win
```

如果确认某个 PID 就是旧 dev server，可手动停止：

```powershell
Stop-Process -Id 45572
```

也可以查看可能的占用者：

```powershell
$target = (Resolve-Path .\node_modules\better-sqlite3\build\Release\better_sqlite3.node).Path
Get-Process | ForEach-Object {
  $p = $_
  try {
    $p.Modules |
      Where-Object { $_.FileName -eq $target } |
      ForEach-Object {
        [pscustomobject]@{
          Id = $p.Id
          ProcessName = $p.ProcessName
          Path = $p.Path
          Module = $_.FileName
        }
      }
  } catch {}
}
```

---

## 常见故障 4：`node-gyp failed to rebuild`

### 现象

`@electron/rebuild` 报：

```text
node-gyp failed to rebuild better-sqlite3
```

### 先区分两类原因

如果前面同时有：

```text
EPERM: operation not permitted, unlink better_sqlite3.node
```

那是文件锁问题，按上一节处理。

如果没有 EPERM，而是编译失败，通常是本机 C++ 构建环境问题。

### Windows 处理方向

安装或修复 Visual Studio Build Tools：

- Workload: **Desktop development with C++**
- MSVC toolchain
- Windows SDK
- Python 可被 `node-gyp` 找到

然后重试：

```bash
pnpm run native:electron
```

### macOS 处理方向

确保 Xcode Command Line Tools 可用：

```bash
xcode-select --install
```

然后重试：

```bash
pnpm run native:electron
```

---

## 常见故障 5：桌面启动时报 `Cannot find module`

### 现象

打包成功，但启动安装后的桌面应用时，主进程弹出：

```text
Cannot find module 'ee-first'
Require stack:
...resources\app.asar\node_modules\on-finished\index.js
...resources\app.asar\node_modules\express\index.js
...resources\app.asar\out\server\app.js
```

### 真正原因

这不是 Express 代码写错了，而是桌面包里的 `app.asar` 缺少运行时依赖。pnpm 的依赖布局和 electron-builder 的依赖裁剪结合时，可能漏掉深层依赖中的小包。典型例子是 `on-finished` 依赖 `ee-first`，但 `ee-first` 没被收进 `app.asar`。

### 处理

先确认本地依赖存在：

```powershell
Get-ChildItem .\node_modules\ee-first
```

再检查打包产物：

```powershell
node -e "const asar=require('@electron/asar'); const list=asar.listPackage('release/win-unpacked/resources/app.asar'); console.log(list.some(p=>p.includes('ee-first')) ? 'in asar' : 'missing')"
```

如果本地存在、asar 缺失，就更新 `scripts/after-pack.mjs` 里的 `pnpmRuntimeDependencyPatches`，然后重新运行：

```bash
pnpm run build:desktop:win
```

最后用临时目录加载打包后的 server 入口验证：

```powershell
node -e "const asar=require('@electron/asar'); const fs=require('fs'); const os=require('os'); const path=require('path'); const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ad-fontes-asar-repro-')); asar.extractAll('release/win-unpacked/resources/app.asar', dir); require(path.resolve(dir,'out/server/app.js')); console.log('server entry ok')"
```

---

## 为什么不通过“换同一个 Node 版本”解决？

可行性低，不推荐。

原因：

1. Electron 自带嵌入式 Node/V8，不直接使用系统 Node.js
2. Electron 的 ABI 由 Electron 版本决定
3. 系统 Node.js 的 ABI 由本机 Node 版本决定
4. 两者即使都叫 Node，也可能不是同一个 ABI
5. Electron 升级后 ABI 可能再次变化

因此不要把目标设为“统一 Node 版本”。正确目标是：

```text
在不同运行时启动/构建前，自动准备对应 ABI。
```

---

## 验证清单

### Web/dev 验证

```bash
pnpm run native:node
node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close(); console.log('node abi ok')"
pnpm run build:web
```

### Desktop 构建验证

```bash
pnpm run build:desktop:win
node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close(); console.log('node abi restored')"
```

Windows 桌面包还应手动启动：

```text
release/win-unpacked/Ad Fontes Manager.exe
```

启动后保持运行，并能正常请求 `/api/v2/words`，才算 Electron ABI 验证通过。

---

## 维护注意事项

1. 不要把 `electron-builder.yml` 改回 `npmRebuild: true`
2. 不要绕过 `pnpm run build:desktop:*` 直接运行 `electron-builder`
3. 桌面构建前关闭所有 dev server 和已启动的桌面应用
4. 桌面构建失败后仍应确认 `pnpm run native:node` 能通过
5. 升级 Electron、Node.js、better-sqlite3 时，重新验证本文所有命令
6. 升级 pnpm、electron-builder、Express 或其他 server 运行时依赖时，重新检查 `app.asar` 是否漏掉深层依赖

---

## 事故时间线摘要

- Electron 桌面运行需要 ABI 140，根 `node_modules` 默认是 Node ABI 127，导致桌面闪退
- 构建后根 `node_modules` 停在 ABI 140，导致 Web/dev 后端 `ECONNRESET` / `ECONNREFUSED`
- `electron-builder.yml` 一度保留 `npmRebuild: true`，与显式 rebuild 流程冲突
- Windows 下运行中的 Node 进程锁住 `better_sqlite3.node`，导致 `EPERM unlink`
- 当前方案改为脚本化切换：Web/dev 前 `native:node`，desktop 前 `native:electron`，desktop 后 `native:node`
- pnpm 迁移后，electron-builder 漏收 `ee-first` 等深层生产依赖，导致打包后主进程 `Cannot find module`
