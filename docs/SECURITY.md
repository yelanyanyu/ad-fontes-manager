# 安全指南

## 认证机制

所有写操作（POST / PUT / PATCH / DELETE）需要 `X-Admin-Token` 请求头。

### Token 来源（按优先级）

**Web 模式：**

1. 环境变量 `ADMIN_TOKEN`
2. `localStorage` 中的 `ad_fontes_admin_token`
3. 开发模式 fallback：`dev-token-not-for-production`

**桌面模式：**

1. Electron 主进程设置 `process.env.ADMIN_TOKEN`
2. preload 通过 `window.electronAPI.adminToken` 暴露给渲染进程
3. 环境变量 `VITE_ADMIN_TOKEN`

### 生产环境要求

- `ADMIN_TOKEN` 至少 32 字符（`openssl rand -hex 32`）
- 永远不要使用默认 token 或示例中的值

## 环境变量

敏感配置通过环境变量注入，生产环境禁止 `.env` 文件：

```bash
export NODE_ENV=production
export DATABASE_URL=/app/data/ad_fontes.db
export ADMIN_TOKEN=$(openssl rand -hex 32)
```

以下配置已在 `.gitignore` 中排除：

- `.env`
- `.env.production`
- `*.db` 数据库文件

## Electron 安全

### contextBridge

渲染进程不能直接访问 Node.js API。所有系统级操作通过 preload 脚本暴露的有限接口完成：

```typescript
// preload/index.ts
contextBridge.exposeInMainWorld('electronAPI', {
  adminToken: ADMIN_TOKEN,
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  setDataDir: path => ipcRenderer.invoke('set-data-dir', path),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
});
```

### 安全原则

- `nodeIntegration` 保持关闭（默认）
- `contextIsolation` 保持开启（默认）
- 不暴露 `ipcRenderer.send` 或 `ipcRenderer.on` 给渲染进程
- 所有 IPC 使用 `invoke`/`handle` 模式（请求-响应）

## Helmet 安全头

生产环境启用 Helmet 中间件：

| 头                        | 值               | 说明         |
| ------------------------- | ---------------- | ------------ |
| Content-Security-Policy   | 配置中           | 防 XSS       |
| X-Frame-Options           | DENY             | 防点击劫持   |
| X-Content-Type-Options    | nosniff          | 防 MIME 嗅探 |
| Strict-Transport-Security | max-age=15552000 | 强制 HTTPS   |

## 数据库安全

- UUID 主键，防枚举
- Drizzle ORM 参数化查询，防 SQL 注入
- 数据库文件权限限制为运行用户可读写
- 桌面模式：数据库存储在应用数据目录，不对外暴露
- WAL 模式下，正常关闭会将日志合并到主文件

## 安全检查清单

- [ ] `ADMIN_TOKEN` 是加密安全的随机字符串（生产 ≥32 字符）
- [ ] `.env` 和 `.env.production` 在 `.gitignore` 中
- [ ] 生产环境不使用 `.env` 文件
- [ ] 桌面程序签名（发布时）
- [ ] HTTPS 已配置（Web 部署）
- [ ] `SERVER_CORS_ORIGINS` 已限制
- [ ] `SERVER_RATE_LIMIT` 已设置

## 报告安全问题

如发现安全漏洞，请不要创建公开 issue，直接联系维护者。
