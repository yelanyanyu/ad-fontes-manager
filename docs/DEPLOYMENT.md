# Ad Fontes Manager 部署指南

## 部署方式概览

| 方式 | 适用平台 | 产物 |
|------|----------|------|
| Docker Compose | 服务器 (Linux) | Web 应用 |
| 系统环境变量 | 服务器 (Linux) | Web 应用 |
| electron-builder | Windows / Mac | 桌面安装包 |

## 方式一：桌面程序构建

### Windows

```bash
npm install
npm run build:desktop:win
```

构建流程会自动：
1. 将 `better-sqlite3` 切换到 Electron 39 ABI 140
2. 执行 electron-vite build + electron-builder 打包
3. 构建结束后恢复 Node ABI（无论成功失败）

产物输出到 `release/`：
- `Ad Fontes Manager Setup 2.0.x.exe` — NSIS 安装程序
- `win-unpacked/` — 未打包的可执行目录

用户可选择安装目录和数据目录。数据库等持久化文件存储在 `%APPDATA%/ad-fontes-manager/`。

桌面版通过 `electron-updater` 支持自动更新——启动时检查 GitHub Releases，后台下载新版本，用户手动触发安装。

### Mac

```bash
npm install
npm run build:desktop:mac
```

产物输出到 `release/`：
- `Ad Fontes Manager-2.0.x.dmg` — DMG 安装镜像
- `mac/` — 未打包的 `.app` bundle

Mac 构建支持 x64 和 arm64 (Apple Silicon) 双架构。

> **注意**：桌面构建前请关闭所有 dev server 和已启动的桌面应用，否则 Windows 可能触发 `EPERM` 文件锁错误。不要直接运行 `electron-builder`，必须通过 `npm run build:desktop:*` 入口。

### CI/CD 自动构建

推送 `v*` 标签触发 GitHub Actions 自动构建 Windows + Mac 安装包，并发布为 GitHub Release（含 `latest.yml` 更新源）。

```bash
git tag v2.0.3
git push origin v2.0.3
```

### 桌面版升级与配置迁移

桌面版升级时，`config.json`（含用户 API Key、Provider 配置等）通过版本化迁移逻辑自动升级到新 schema，保留用户数据不丢失。

## 方式二：Docker Compose（Web 部署）

### 前置要求

- Docker 20.10+
- Docker Compose 2.0+

### 部署步骤

```bash
git clone https://github.com/yelanyanyu/ad-fontes-manager.git
cd ad-fontes-manager

# 创建生产配置
cat > .env.production << EOF
NODE_ENV=production
ADMIN_TOKEN=$(openssl rand -hex 32)
DATABASE_URL=/app/data/ad_fontes.db
SERVER_HOST=0.0.0.0
SERVER_CORS_ORIGINS=["https://yourdomain.com"]
SERVER_RATE_LIMIT=100
LOG_LEVEL=warn
SECURITY_HSTS=true
HEALTHCHECK_HOST=127.0.0.1
HEALTHCHECK_PORT=8080
EOF

chmod 600 .env.production

# 构建并启动
docker compose --env-file .env.production build app
docker compose --env-file .env.production up -d --force-recreate app
```

或使用便捷脚本：

```powershell
./scripts/start-docker-prod.ps1
```

### 更新

```bash
git pull origin main
docker compose --env-file .env.production build app
docker compose --env-file .env.production up -d --force-recreate app
docker image prune -f
```

## 方式三：Node.js 直接运行（Web 部署）

```bash
# 1. 构建前端
npm run build:web

# 2. 设置环境变量
export NODE_ENV=production
export ADMIN_TOKEN="$(openssl rand -hex 32)"
export DATABASE_URL="/app/data/ad_fontes.db"

# 3. 启动（使用 PM2 或其他进程管理器）
pm2 start dist/server/standalone.js --name ad-fontes-manager
pm2 save
```

## AnkiConnect 配置

使用 Anki 导出功能需要在运行 Anki 的机器上安装 AnkiConnect 插件（代码: `2055492159`）。

Docker 部署时，设置 `ANKI_CONNECT_HOST=host.docker.internal` 访问宿主机的 Anki。

本地或桌面部署时，默认 `ANKI_CONNECT_HOST=127.0.0.1:8765` 即可。

## 健康检查

```bash
curl http://localhost:8080/api/core/health
# {"status":"ok"}
```

## 备份与恢复

SQLite 数据库是单文件，直接复制即可：

```bash
# 备份（确保关闭应用）
cp /path/to/ad_fontes.db /backup/ad_fontes_$(date +%Y%m%d).db

# 注意：WAL 模式下，正常关闭应用后 -wal 和 -shm 文件会自动合并删除。
# 不要在应用运行时直接复制 .db 文件。
```

可通过设置页面导出 `config.json`（可选是否包含 API Key）用于配置备份。

## 配置检查清单

- [ ] `ADMIN_TOKEN` 已设置强密码（≥32 字符）
- [ ] `DATABASE_URL` 路径正确且有读写权限
- [ ] `SERVER_CORS_ORIGINS` 已限制（生产环境）
- [ ] `SERVER_RATE_LIMIT` 已设置（建议 100-300）
- [ ] `SECURITY_HSTS=true`（生产环境）
- [ ] 防火墙已配置，只开放必要端口
- [ ] AnkiConnect 已安装并配置（如需 Anki 导出）

## 故障排查

### 服务无法启动

1. 检查日志：`docker compose logs` 或 `pm2 logs`
2. 检查配置：确认必填环境变量已设置
3. 检查端口：`lsof -i :8080`

### 桌面程序白屏或闪退

1. 检查 `config.json` 中 `dataDir` 路径可访问
2. 确认 `ad_fontes.db` 存在于数据目录
3. **Native ABI 不匹配**：检查是否绕过构建脚本直接运行了 electron-builder，导致 `.node` 文件 ABI 错误。使用 `npm run build:desktop:win` 重新构建
4. 检查 `%APPDATA%/ad-fontes-manager/config.json` 是否可读写
5. 重新安装或清空 `%APPDATA%/ad-fontes-manager/`
