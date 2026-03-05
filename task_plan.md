**轻量级 12-Factor 配置系统 - 方案 A 实施规范**

## 架构概述
开发环境使用本地 `.env` 文件；生产环境通过 Docker Compose 加载服务器本地 `.env.production`（不提交 Git）。完全摒弃 `config.yml`，所有配置通过环境变量注入，应用启动时强制验证。

## 文件清单

| 文件 | 用途 | Git |
|------|------|-----|
| `.env` | 开发环境配置（真实值） | ❌ 忽略 |
| `.env.example` | 配置模板（假值/说明） | ✅ 提交 |
| `config.js` | 配置加载与验证逻辑 | ✅ 提交 |
| `docker-compose.yml` | 生产编排（引用外部 env） | ✅ 提交 |
| `.gitignore` | 排除 `.env` 等 | ✅ 提交 |

## 配置文件内容

### 1. .gitignore
```gitignore
.env
.env.local
.env.production
node_modules/
logs/
```

### 2. .env.example
```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
ADMIN_TOKEN=dev-token-change-in-production
```

### 3. config.js（配置中心）
```javascript
const fs = require('fs');

// 开发环境加载 .env，生产环境禁止
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
} else if (fs.existsSync('.env')) {
  console.error('❌ 生产环境禁止存在 .env 文件');
  process.exit(1);
}

// 必填项验证
const required = ['DATABASE_URL', 'ADMIN_TOKEN', 'NODE_ENV'];
const missing = required.filter(k => !process.env[k]);

if (missing.length) {
  console.error(`❌ 缺少环境变量: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = Object.freeze({
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.PORT || '8080'),
  databaseUrl: process.env.DATABASE_URL,
  adminToken: process.env.ADMIN_TOKEN,
  isProd: process.env.NODE_ENV === 'production',
});
```

### 4. docker-compose.yml（生产）
```yaml
version: '3.8'
services:
  app:
    build: .
    container_name: ad-fontes-app
    restart: unless-stopped
    env_file:
      - .env.production  # 仅服务器本地存在
    environment:
      - NODE_ENV=production
    ports:
      - "${PORT:-8080}:8080"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 3s
      retries: 3
```

### 5. Dockerfile（多阶段构建）
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
RUN apk add --no-cache dumb-init curl
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:8080/health || exit 1
ENTRYPOINT ["dumb-init", "node", "index.js"]
```

## 开发与生产工作流

### 开发（本地）
```bash
cp .env.example .env
# 编辑 .env 填入本地数据库真实信息
npm install
npm run dev
```

### 生产（首次部署）
```bash
# 在服务器执行（一次性）
echo "DATABASE_URL=postgresql://realuser:realpass@dbhost:5432/db
ADMIN_TOKEN=$(openssl rand -hex 32)
PORT=8080" > .env.production

chmod 600 .env.production
docker-compose up -d --build
```

### 生产（后续更新）
```bash
git pull
docker-compose up -d --build
```

## 安全约束（红线）

1. **Git 安全**：`.env` 和 `.env.production` 必须存在于 `.gitignore`，预提交钩子检查禁止提交含 `DATABASE_URL` 或 `ADMIN_TOKEN` 的文件
2. **生产禁用文件**：生产容器内不得存在 `.env` 文件，仅通过 `env_file` 注入
3. **Token 强度**：生产环境 `ADMIN_TOKEN` 必须 ≥ 32 字符，代码启动时校验长度
4. **权限控制**：服务器上 `.env.production` 权限设为 `600`（仅 root 可读）

## 验证命令

```bash
# 验证生产环境配置正确加载
docker-compose exec app env | grep ADMIN_TOKEN

# 验证应用健康
curl http://localhost:8080/health
```