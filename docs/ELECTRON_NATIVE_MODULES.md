# Electron 桌面构建：Native Module ABI 踩坑实录

> **日期**: 2026-05-03
> **涉及包**: better-sqlite3 (native C++ addon)
> **核心问题**: Electron 构建成功 ≠ 运行时 native 模块可用

---

## 问题现象

桌面安装包构建成功，启动后几秒闪退。前端页面加载后第一次 API 请求触发闪退。

## 错误信息

```
better_sqlite3.node was compiled against a different Node.js version
using NODE_MODULE_VERSION 127. This version of Node.js requires
NODE_MODULE_VERSION 140.
```

## 根因

- Node.js 22 的 ABI 版本是 **127**
- Electron 39 内置 Node 运行时的 ABI 版本是 **140**
- `npm install` 下载的 `better-sqlite3` 预编译包是 Node ABI (127)
- Electron 主进程加载该 `.node` 文件时 ABI 不匹配，进程崩溃

## 排查思路

1. **先抓运行期日志，别盯着 build log**  
   build log 里的 warning 很容易误导。真正根因在 `desktop-runtime.log`。

2. **定位哪个 native 模块**  
   `better-sqlite3` 是整个项目唯一的 native C++ 模块，在 `src/server/db/index.ts` 中首次 `require()`。

3. **检查打包产物**  
   解压 `release/win-unpacked/resources/app.asar`，检查 `node_modules/better-sqlite3/build/Release/better_sqlite3.node` 的 ABI 版本。

## 修复方案

### 1. 强制 electron-builder 从源码构建 native 模块

`electron-builder.yml`:

```yaml
npmRebuild: false

asarUnpack:
  - "**/*.node"

afterPack: "./scripts/setup-native-modules.js"
```

### 2. 显式执行 Electron ABI rebuild

构建前用 `@electron/rebuild` 对 `better-sqlite3` 执行针对 Electron ABI 的重编译：

```bash
npx @electron/rebuild --version 39.2.7 --which-module better-sqlite3 --force --build-from-source
```

### 3. 打包后恢复 Node 开发 ABI（Windows 关键）

Windows 下 `npm rebuild better-sqlite3` 可能通过硬链接把 `release/win-unpacked` 里的 Electron ABI 文件也改回 Node ABI。

正确做法：
1. 打包完成后，立即保存 `release/win-unpacked/.../better_sqlite3.node` → 临时目录
2. 执行 `npm rebuild better-sqlite3` 恢复根 `node_modules` 为 Node ABI
3. 把临时目录中保存的 Electron ABI `.node` 文件写回 `release/win-unpacked`

对应脚本：
- `scripts/rebuild-electron-native.mjs` — 步骤 1
- `scripts/restore-native-after-desktop-build.mjs` — 步骤 2-3

### 4. 桌面模式与 Web 模式拆分

用 `ADFONTES_DESKTOP=1` 环境变量区分 Electron 运行环境和 Web 环境，避免：
- Electron 进程加载根 `.env` 触发 `process.exit(1)`（config.ts 生产模式检查）
- 日志目录、数据库路径等配置冲突

## 验证清单

每次桌面构建后必须验证两个运行时：

```bash
# 1. Electron 包内
# 启动 release/win-unpacked/Ad Fontes Manager.exe，8秒后仍运行即通过

# 2. 本地 Node 开发环境
node -e "require('better-sqlite3')"  # 必须通过
```

## 构建流程总结

```
npm run build:desktop:win
  ├── electron-vite build          # 编译 main/preload/renderer
  ├── tsc -p tsconfig.server-build.json  # 编译 server
  ├── npm run rebuild:electron:native    # @electron/rebuild → Electron ABI
  ├── electron-builder --win             # 打包安装程序
  └── npm run restore:native-after-desktop-build  # 恢复 Node ABI
```

## 核心教训

> Electron + native addon 的桌面构建，必须把 "Electron ABI rebuild" 和 "Node 开发 ABI 恢复" 作为显式构建步骤，而不是交给默认行为碰运气。

1. `npm install` 的预编译 native 包是 Node ABI，不能直接给 Electron 用
2. `electron-builder` 的 "preparing native dependencies" 不一定能正确 rebuild
3. Windows 硬链接可能导致 `npm rebuild` 污染已打包的 Electron 产物
4. 验证覆盖两个运行时：打包后的 Electron + 本地开发 Node
