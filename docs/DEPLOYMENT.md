# Ad Fontes Manager 部署指南

## 概述

本文档介绍如何将 Ad Fontes Manager 部署到生产环境。

## 部署方式

### 方式一: Docker Compose (推荐)

使用 Docker Compose 是最简单、最可靠的部署方式。

#### 1. 准备服务器

确保服务器已安装:
- Docker 20.10+
- Docker Compose 2.0+

```bash
# 检查版本
docker --version
docker-compose --version
```

#### 2. 克隆代码

```bash
git clone https://github.com/your-org/ad-fontes-manager.git
cd ad-fontes-manager
```

#### 3. 创建生产环境配置

在服务器上创建 `.env.production` 文件:

```bash
# 生成安全的 ADMIN_TOKEN
ADMIN_TOKEN=$(openssl rand -hex 32)

cat > .env.production << EOF
# 核心配置
NODE_ENV=production
ADMIN_TOKEN=${ADMIN_TOKEN}

# 数据库配置 (替换为实际值)
DATABASE_URL=postgresql://user:password@localhost:5432/ad_fontes?sslmode=require
DATABASE_SSL=true

# 服务器配置
PORT=8080
SERVER_HOST=0.0.0.0
SERVER_CORS_ORIGINS=["https://yourdomain.com"]
SERVER_RATE_LIMIT=100

# 日志配置
LOG_LEVEL=warn
LOG_DIR=./logs
LOG_AUDIT=true
EOF

# 设置文件权限 (仅 root 可读)
chmod 600 .env.production
```

**安全提示**: `.env.production` 文件包含敏感信息，务必设置权限为 `600`。

#### 4. 启动服务

```bash
# 构建并启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f

# 检查健康状态
docker-compose ps
```

#### 5. 更新部署

```bash
# 拉取最新代码
git pull origin main

# 重新构建并启动
docker-compose up -d --build

# 清理旧镜像
docker image prune -f
```

### 方式二: 系统环境变量

如果不使用 Docker，可以直接在服务器上运行 Node.js 应用。

#### 1. 准备环境

```bash
# 安装 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PM2 (进程管理器)
sudo npm install -g pm2
```

#### 2. 设置环境变量

```bash
# 编辑 /etc/environment 或使用 export
export NODE_ENV=production
export ADMIN_TOKEN="$(openssl rand -hex 32)"
export DATABASE_URL="postgresql://user:password@localhost:5432/ad_fontes?sslmode=require"
export DATABASE_SSL="true"
export SERVER_CORS_ORIGINS='["https://yourdomain.com"]'
export SERVER_RATE_LIMIT="100"
export LOG_LEVEL="warn"
```

#### 3. 启动应用

```bash
cd web
npm install --production
npm run build
pm2 start npm --name "ad-fontes-manager" -- start

# 保存 PM2 配置
pm2 save
pm2 startup
```

## 配置检查清单

部署前请确认:

- [ ] `ADMIN_TOKEN` 已设置为强密码 (≥32 字符)
- [ ] `DATABASE_URL` 指向正确的数据库
- [ ] `DATABASE_SSL` 在生产环境已启用
- [ ] `SERVER_CORS_ORIGINS` 已限制为实际域名
- [ ] `SERVER_RATE_LIMIT` 已设置 (建议 100-300)
- [ ] `LOG_LEVEL` 设置为 `warn` 或 `error`
- [ ] `.env.production` 文件权限为 `600`
- [ ] 防火墙已配置，只开放必要端口

## 健康检查

应用启动后会自动进行健康检查:

```bash
# 检查健康端点
curl http://localhost:8080/api/core/health

# 预期响应
{"status":"ok","timestamp":"2026-03-05T..."}
```

## 日志管理

### Docker 部署

```bash
# 查看实时日志
docker-compose logs -f

# 查看最近 100 行
docker-compose logs --tail=100

# 查看特定服务的日志
docker-compose logs -f app
```

### PM2 部署

```bash
# 查看日志
pm2 logs ad-fontes-manager

# 清空日志
pm2 flush
```

## 备份与恢复

### 数据库备份

```bash
# 使用 pg_dump 备份
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# 自动备份脚本 (添加到 crontab)
0 2 * * * pg_dump $DATABASE_URL > /backup/ad_fontes_$(date +\%Y\%m\%d).sql
```

### 配置备份

```bash
# 备份 .env.production
cp .env.production /secure/backup/.env.production.$(date +%Y%m%d)
```

## 故障排查

### 服务无法启动

1. 检查日志:
   ```bash
   docker-compose logs
   ```

2. 检查配置:
   ```bash
   # 确认所有必需变量已设置
   cat .env.production | grep -E "^(NODE_ENV|ADMIN_TOKEN|DATABASE_URL)="
   ```

3. 检查端口占用:
   ```bash
   sudo lsof -i :8080
   ```

### 数据库连接失败

1. 检查数据库服务状态
2. 验证 `DATABASE_URL` 格式
3. 检查网络连接和防火墙
4. 确认 SSL 配置正确

### 健康检查失败

1. 检查应用日志
2. 确认端口配置正确
3. 检查是否有启动错误

## 安全建议

1. **使用 HTTPS**: 生产环境必须使用 HTTPS
2. **定期更新**: 定期更新依赖和基础镜像
3. **防火墙配置**: 只开放必要端口 (80, 443, 22)
4. **定期轮换令牌**: 每 3-6 个月轮换一次 `ADMIN_TOKEN`
5. **监控日志**: 启用审计日志并定期检查
6. **备份策略**: 制定定期备份计划

## 更新日志

### 2026-03-05
- 初始部署文档
- 支持 Docker Compose 和系统环境变量两种部署方式
