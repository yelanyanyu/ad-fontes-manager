# Plan: 清理过时代码和文件

> **状态**: 待执行
> **目标**: 删除已迁移到 `src/` 的旧 `web/` 代码、过时 Docker 配置、废弃脚本，迁移数据文件到新位置。

---

## Phase 1: 迁移数据文件

### Step 1.1: 创建 `data/` 目录并移动数据库
```bash
mkdir -p data
mv web/data/ad_fontes.db data/ad_fontes.db
mv web/data/local_words.json data/local_words.json
```

### Step 1.2: 删除空的 `web/data/`
```bash
rmdir web/data
```

### Step 1.3: 更新 `drizzle.config.ts`
将 `url: './web/data/ad_fontes.db'` 改为 `url: './data/ad_fontes.db'`

### Step 1.4: 更新 `.gitignore`
将 `web/data/ad_fontes.db` 改为 `data/ad_fontes.db`，将 `web/data/local_words.json` 改为 `data/local_words.json`

### Step 1.5: 更新 `.env.example`
将 `DATABASE_URL=./data/ad_fontes.db` 的注释更新（去掉 `web/` 前缀相关说明）

---

## Phase 2: 删除 `web/` 过时代码

### Step 2.1: 删除旧前端
```bash
rm -rf web/client
```

### Step 2.2: 删除旧后端
```bash
rm -rf web/controllers
rm -rf web/routes
rm -rf web/middleware
rm -rf web/services
rm -rf web/schemas
rm -rf web/db
rm -rf web/utils
```

### Step 2.3: 删除旧入口文件
```bash
rm web/server.ts
rm web/test-api.ts
```

### Step 2.4: 删除旧脚本和测试
```bash
rm -rf web/scripts
rm -rf web/tests
```

### Step 2.5: 删除旧配置和产物
```bash
rm web/package.json
rm web/package-lock.json
rm -rf web/node_modules
rm -rf web/dist
rm -rf web/logs
rm web/eslint.config.mjs
rm web/.prettierrc
rm web/tsconfig.json
rm web/.dockerignore
```

### Step 2.6: 删除空的 `web/` 目录（如果只剩 Dockerfile）
确认 `web/` 下只剩 `Dockerfile` 后，见 Phase 4 一起处理。

---

## Phase 3: 清理 `node/` 废弃脚本

### Step 3.1: 删除 `node/migrate_v2.ts`
```bash
rm node/migrate_v2.ts
```
该文件只是一个 stub —— print error + `process.exit(1)`，已无实际功能。

### Step 3.2: 更新 `node/` 脚本中的默认数据库路径
以下文件硬编码了 `web/data/ad_fontes.db`，改为 `data/ad_fontes.db`：
- `node/loader.ts` (line 16)
- `node/init_db.ts` (line 13)
- `node/view-word-yaml.ts` (line 16)
- `node/check-word-diff.ts` (line 17)
- `node/verify-sqlite-migration.ts`
- `node/utils/db-config.ts`

---

## Phase 4: 删除过时 Docker 配置

### Step 4.1: 删除 Docker 相关文件
```bash
rm web/Dockerfile
rm docker-compose.yml
rm scripts/start-docker-prod.ps1
rm -rf scripts  # 如果 scripts/ 已空
rmdir web       # 此时 web/ 应已空
```

---

## Phase 5: 更新 `package.json`

### Step 5.1: 删除 `import:pg-v2` script
删除这一行：
```json
"import:pg-v2": "tsx web/scripts/import-pg-words-v2-to-sqlite.ts",
```
该脚本已删除（Phase 2.4），且是一次性 PG→SQLite 迁移，不再需要。

---

## Phase 6: 验证

### Step 6.1: 确认引用完整性
```bash
# 确认没有代码引用 web/ 目录
grep -r "web/" --include="*.ts" --include="*.vue" --include="*.json" --include="*.yml" src/ node/ drizzle.config.ts package.json .gitignore .env.example 2>/dev/null
```

### Step 6.2: 确认数据文件在正确位置
```bash
ls -la data/ad_fontes.db
ls -la data/local_words.json
```

### Step 6.3: 确认项目能正常构建
```bash
npm run type-check
npm run dev:web
```

---

## 变更文件清单

| 操作 | 文件 | Phase |
|------|------|-------|
| 移动 | `web/data/ad_fontes.db` → `data/ad_fontes.db` | 1 |
| 移动 | `web/data/local_words.json` → `data/local_words.json` | 1 |
| 修改 | `drizzle.config.ts` | 1 |
| 修改 | `.gitignore` | 1 |
| 修改 | `.env.example` | 1 |
| 删除 | `web/client/` | 2 |
| 删除 | `web/controllers/` `routes/` `middleware/` `services/` `schemas/` `db/` `utils/` | 2 |
| 删除 | `web/server.ts` `web/test-api.ts` | 2 |
| 删除 | `web/scripts/` `web/tests/` | 2 |
| 删除 | `web/package.json` `package-lock.json` `node_modules/` | 2 |
| 删除 | `web/dist/` `web/logs/` | 2 |
| 删除 | `web/eslint.config.mjs` `.prettierrc` `tsconfig.json` `.dockerignore` | 2 |
| 删除 | `node/migrate_v2.ts` | 3 |
| 修改 | `node/loader.ts` | 3 |
| 修改 | `node/init_db.ts` | 3 |
| 修改 | `node/view-word-yaml.ts` | 3 |
| 修改 | `node/check-word-diff.ts` | 3 |
| 修改 | `node/verify-sqlite-migration.ts` | 3 |
| 修改 | `node/utils/db-config.ts` | 3 |
| 删除 | `web/Dockerfile` `docker-compose.yml` `scripts/` | 4 |
| 修改 | `package.json` | 5 |

## 不涉及的文件

- `src/` — 当前活跃代码，不动
- `drizzle/` — Drizzle ORM 迁移历史，必须保留
- `node/` 其他文件 — CLI 维护工具，保留

## 风险提示

- `web/data/ad_fontes.db` 是开发数据库，迁移前确认无未提交的本地修改
- Docker 部署方案（`docker-compose.yml` + `Dockerfile`）删除后如需恢复需重写
- `node/` 脚本中的数据库路径更新后需验证功能正常
