# PostgreSQL → SQLite + Drizzle 可执行迁移计划

> **执行原则**：先建立可回滚的 SQLite/Drizzle 数据层，再迁移 v2 查询，再切换运行入口，最后删除旧 v1/PG 代码。不要把“换数据库、删旧系统、改路由、迁数据”塞进同一个提交里。

## 目标

把 Ad Fontes Manager 从 PostgreSQL + `pg` + 手写 SQL 迁移到 SQLite + Drizzle ORM，为后续 Windows 桌面端和移动端打包降低部署成本。

### 已确认约束

1. 数据模型最终只保留 `words_v2`。
2. 现有 PostgreSQL 中有生产/开发数据，必须提供可验证的数据迁移路径。
3. 新数据访问层使用 Drizzle ORM，不做 `pg.Pool` 兼容适配层。
4. 前端已主要使用 `/api/v2/words`，迁移应优先保证 v2 行为不变。

### 非目标

- 不在第一轮迁移中重做 UI、编辑器或 YAML 格式。
- 不引入 Prisma、TypeORM 等重量级 ORM。
- 不在数据迁移验证完成前删除 PostgreSQL 数据库。
- 不把 v1 API 作为新功能入口继续扩展。

## 当前代码事实

| 区域 | 当前状态 | 迁移策略 |
|---|---|---|
| `web/db/index.ts` | 导出 `getPool()` / `resetPool()`，内部使用 `pg.Pool` | 替换为 `getDb()` / `closeDb()`，返回 Drizzle SQLite 实例 |
| `web/services/word/WordRepositoryV2.ts` | v2 查询集中在 `words_v2`，仍使用原始 SQL | 第一优先级改为 Drizzle |
| `web/services/word/WordServiceV2.ts` | 事务使用 `pool.connect()` + `BEGIN` | 改为 `db.transaction()`，Repository 支持传入 `tx` |
| `web/routes/wordsV2.ts` | v2 API 主路由 | 迁移后先保持 `/api/v2/words` 兼容 |
| `web/routes/words.ts` | v1 旧路由 | v2 验证稳定后再删除或改为兼容转发 |
| `web/routes/core.ts` / `web/routes/sync.ts` | 健康检查和同步仍依赖 `getPool()` | 改为轻量 Drizzle 查询 |
| `web/localStore.ts` | JSON 文件本地存储 | 第二阶段迁到 SQLite `_local_words` 表 |
| `node/` 工具 | 仍用 `pg` 读取/写入 | 先保留 PG 只用于导出脚本，其他工具再逐个迁移 |
| `schema.sql` / `migrations/` | PG schema 和历史迁移 | SQLite 验证完成后再归档/删除 |

## 关键设计决策

### 1. 分两层数据库 API

新增 Drizzle 数据层时，不要让业务层直接处理 SQLite driver：

- `web/db/schema.ts`：Drizzle 表结构，唯一 schema source of truth。
- `web/db/index.ts`：打开/关闭 SQLite、执行 PRAGMA、导出 `getDb()`。
- `web/db/json.ts`：集中处理 JSON 字符串列的 parse/stringify。
- `web/services/word/WordRepositoryV2.ts`：唯一负责 `words_v2` CRUD 和查询条件转换。

这样 `content` 的 JSON 文本化不会散落到各个 route/service。

### 2. `content` 字段用 SQLite `text` 存 JSON 字符串

SQLite 没有 PostgreSQL `JSONB`。Drizzle schema 中：

```ts
content: text('content', { mode: 'json' }).$type<WordContent>().notNull()
```

如果当前 Drizzle 版本/driver 对 `mode: 'json'` 支持不稳定，则退回：

```ts
content: text('content').notNull()
```

并在 Repository 层使用 helper：

- 写入：`serializeWordContent(content)`
- 读取：`deserializeWordRow(row)`

### 3. 路由兼容期先保留 `/api/v2/words`

不要第一轮就把 `/api/v2/words` 改成 `/api/words`。推荐顺序：

1. SQLite 后端继续服务 `/api/v2/words`。
2. v2 API 测试和前端手动验证通过。
3. 再决定是否把 `/api/words` 映射到 v2。
4. 最后删除 v1 路由和相关测试。

这能把“数据库迁移”和“API 路径迁移”解耦。

### 4. PG 依赖先降级为迁移脚本依赖，不要立刻全删

`pg` 在迁移窗口中仍需要用于 `node/export-pg-to-sqlite.ts`。推荐：

- `web/package.json`：迁移完成后删除 `pg`。
- `node/package.json`：先保留 `pg`，仅供导出脚本使用；最终清理阶段再删除。

### 5. 删除旧代码必须放到最后

以下文件不要在 Drizzle 查询刚跑通时立即删除：

- `web/services/word/WordService.ts`
- `web/services/word/WordRepository.ts`
- `web/services/word/WordAssembler.ts`
- `web/controllers/wordController.ts`
- `web/routes/words.ts`
- `schema.sql`
- `migrations/`

等到 v2 API、同步、本地存储、CLI、数据迁移都验证通过后，再做单独 cleanup 提交。

## 里程碑总览

| 里程碑 | 目标 | 可验证产物 | 是否可回滚 |
|---|---|---|---|
| M0 盘点与安全网 | 明确查询点、测试基线、备份方式 | baseline 测试结果、PG 导出命令 | 是 |
| M1 Drizzle 基础设施 | SQLite schema 和 DB 初始化可用 | `drizzle` 迁移、空库启动 | 是 |
| M2 v2 Repository 迁移 | `words_v2` CRUD/list/details 走 Drizzle | Repository 单元测试通过 | 是 |
| M3 v2 Service + Route 迁移 | `/api/v2/words` 行为保持不变 | v2 API 集成测试通过 | 是 |
| M4 Core/Sync/LocalStore 迁移 | 健康检查、同步、本地缓存走 SQLite | sync/core 测试和手动验证 | 是 |
| M5 数据迁移 | PG `words_v2` 数据导入 SQLite | 行数、抽样、唯一约束验证 | 是 |
| M6 Node CLI 迁移 | 维护脚本使用 SQLite | CLI smoke 通过 | 是 |
| M7 切主入口与清理 | v1/PG 代码移除，文档更新 | lint/type-check/build 通过 | 否，需确认 |

## M0：盘点与安全网

### Task 0.1：确认当前工作区

运行：

```powershell
git status --short
```

预期：

- 只看到本次计划文件变更，或明确记录其他未提交文件。
- 若有其他人的修改，先不要覆盖。

### Task 0.2：建立查询迁移清单

运行：

```powershell
Get-ChildItem -Path web,node -Recurse -File -Include *.ts,*.js |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\.vite\\' } |
  Select-String -Pattern 'getPool|resetPool|pool\.query|words_v2|/api/v2/words|routes/words' |
  ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }
```

输出保存到开发记录中。重点确认这些文件：

- `web/db/index.ts`
- `web/services/word/WordRepositoryV2.ts`
- `web/services/word/WordServiceV2.ts`
- `web/routes/wordsV2.ts`
- `web/routes/core.ts`
- `web/routes/sync.ts`
- `web/localStore.ts`
- `node/loader.ts`
- `node/check-word-diff.ts`
- `node/view-word-yaml.ts`

### Task 0.3：跑迁移前基线

在 `web` 中运行：

```powershell
npm run type-check
npm run lint
npx tsx --test --test-concurrency=1 tests/words-v2-api.test.ts
npx tsx tests/word-validator.test.ts
```

如果 API 测试需要运行服务，先启动：

```powershell
npm run dev:server
```

记录：

- 哪些命令通过。
- 哪些命令因环境缺失失败。
- 失败是否与本次迁移无关。

### Task 0.4：备份 PostgreSQL 数据

在迁移前导出 PG 数据，至少保留 `words_v2`：

```powershell
pg_dump $env:DATABASE_URL --table=words_v2 --data-only --file=backup/words_v2_before_sqlite.sql
```

如果没有 `pg_dump`，至少执行行数和抽样导出：

```sql
SELECT COUNT(*) FROM words_v2;
SELECT id, lemma, language, part_of_speech, revision_count FROM words_v2 ORDER BY created_at DESC LIMIT 20;
```

验收：

- 有可恢复的备份文件，或有明确的数据导出替代方案。

## M1：Drizzle 基础设施

### Task 1.1：安装依赖

修改 `web/package.json`：

- 添加运行依赖：`drizzle-orm`、`better-sqlite3`
- 添加开发依赖：`drizzle-kit`、`@types/better-sqlite3`
- 暂时保留 `pg`，直到 M7 清理

修改 `node/package.json`：

- 添加运行依赖：`drizzle-orm`、`better-sqlite3`
- 暂时保留 `pg`，用于 M5 导出脚本

运行：

```powershell
cd web
npm install
cd ../node
npm install
```

验收：

- `web/package-lock.json` 和 `node/package-lock.json` 更新。
- Windows 上 `better-sqlite3` 安装成功；若失败，先解决 native build 工具链，不继续迁移。

### Task 1.2：新增 Drizzle schema

创建 `web/db/schema.ts`。

表结构至少包含：

- `words_v2`
  - `id`
  - `lemma`
  - `language`
  - `part_of_speech`
  - `content`
  - `created_at`
  - `updated_at`
  - `revision_count`
- `_local_words`
  - `id`
  - `raw_yaml`
  - `lemma_preview`
  - `updated_at`
- `_local_config`
  - `key`
  - `value`

索引：

- `UNIQUE (lemma, language)`
- `idx_words_v2_language`
- `idx_words_v2_created_at`
- `idx_words_v2_updated_at`
- 可选：`idx_words_v2_lemma`

注意：

- SQLite 中 `created_at` / `updated_at` 用 ISO string 或 `datetime('now')`，全项目保持一种格式。
- `part_of_speech` 在代码里映射成 `partOfSpeech`，DB 列仍是 `part_of_speech`。

### Task 1.3：新增 Drizzle 配置

创建 `drizzle.config.ts`：

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './web/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/ad_fontes.db',
  },
});
```

运行：

```powershell
cd web
npx drizzle-kit generate
```

如果从仓库根运行更方便，确保 `drizzle.config.ts` 的 `schema` 和 `out` 路径一致。

验收：

- 生成 `drizzle/` 迁移文件。
- 迁移文件中只包含 SQLite DDL，不包含 PG 语法。

### Task 1.4：重写 `web/db/index.ts`

目标 API：

```ts
const { getDb, getSqlite, closeDb } = require('../db');
```

要求：

- `getDb()` 同步返回 Drizzle 实例。
- `getSqlite()` 仅在必须执行原始 SQLite PRAGMA/迁移时使用。
- `closeDb()` 关闭连接并清空单例。
- 初始化时创建数据库目录。
- 初始化时执行：
  - `PRAGMA journal_mode = WAL`
  - `PRAGMA foreign_keys = ON`
  - `PRAGMA busy_timeout = 5000`
- 不再导出 `getPool()` / `resetPool()`，但可以在 M1 临时保留 deprecated wrapper，方便分阶段改调用点。

建议先临时保留：

```ts
const getPool = () => {
  throw new Error('getPool() has been removed. Use getDb() with Drizzle.');
};
```

这样遗漏调用点会快速暴露。

### Task 1.5：更新配置默认值

修改 `web/schemas/config.ts`：

- `database.url` 从 PG URL 校验改为非空字符串。
- 增加路径字符串说明，避免把相对路径误判为非法 URL。

修改 `web/utils/config.ts`：

- 默认 `database.url` 改为 `./data/ad_fontes.db`。
- 移除或忽略 PG-only 配置，例如 SSL、pool size。

修改 `.env.example`：

```env
DATABASE_URL=./data/ad_fontes.db
```

保留注释说明：

- `PG_DATABASE_URL` 仅用于一次性迁移脚本。

### M1 验证

运行：

```powershell
cd web
npm run type-check
npm run lint
```

如果 `getPool()` 调用尚未迁完，允许 type-check 失败，但必须只失败在已知调用点。

建议提交：

```powershell
git add web/package.json web/package-lock.json node/package.json node/package-lock.json web/db/schema.ts web/db/index.ts drizzle.config.ts drizzle web/schemas/config.ts web/utils/config.ts .env.example
git commit -m "feat(db): add sqlite drizzle foundation"
```

## M2：迁移 `WordRepositoryV2`

### Task 2.1：定义 Repository 行类型

在 `web/services/word/WordRepositoryV2.ts` 或相邻类型文件中定义：

- `WordRowV2`
- `InsertWordV2`
- `UpdateWordV2`
- `ListWordsParams`
- `ListWordsResult`

类型来源优先使用 Drizzle：

```ts
type WordRow = typeof wordsV2.$inferSelect;
type NewWordRow = typeof wordsV2.$inferInsert;
```

### Task 2.2：封装 row/content 转换

新增 helper，建议文件：

- `web/services/word/wordRowMapper.ts`

职责：

- `toDbContent(content)`
- `fromDbRow(row)`
- `normalizeLemma(lemma)`
- `toIsoTimestamp(value?)`

验收：

- JSON parse/stringify 只出现在 mapper/repository 层。
- route/service 不直接碰 SQLite JSON 字符串细节。

### Task 2.3：改写读取方法

按这个顺序改：

1. `findById(id)`
2. `findByLemma(lemma, language)`
3. `findDetailsByLemma(lemma, language)`
4. `list(params)`

Drizzle 查询注意点：

- PG `lower(lemma) = $1` 改为 Drizzle `sql` 或保存时统一小写比较。
- PG `ILIKE` 改为 SQLite `LIKE`；需要大小写无关时用 `lower(lemma) LIKE lower(...)`。
- PG `COUNT(*)::int` 改为 Drizzle `count()` 或手动 `Number(row.count)`.
- `and(...conditions)` 在 conditions 为空时要避免生成非法 where；封装 `buildWhere()`.

### Task 2.4：改写写入方法

按这个顺序改：

1. `create(data, tx?)`
2. `update(id, data, tx?)`
3. `delete(id, tx?)`
4. `upsert` 或 service 所需组合方法

要求：

- `create` 设置 `id = crypto.randomUUID()`，除非调用方已有 id。
- `update` 必须更新 `updated_at`，并递增 `revision_count`。
- 唯一冲突统一转换为业务层可识别错误，例如 `code = 'WORD_CONFLICT'`。
- 所有方法接受可选 `dbOrTx`，方便事务内复用。

### Task 2.5：新增 Repository 单元测试

创建 `web/tests/wordRepositoryV2.test.ts`。

测试使用临时 SQLite 文件或 `:memory:`：

- 创建英文词条。
- 创建同 lemma 不同 language 的德文词条。
- 同 lemma + language 冲突。
- 按 language 列表过滤。
- 搜索 lemma。
- 更新后 `revision_count` 增加。
- 删除后查不到。

运行：

```powershell
cd web
npx tsx --test tests/wordRepositoryV2.test.ts
```

### M2 验证

运行：

```powershell
cd web
npx tsx --test tests/wordRepositoryV2.test.ts
npm run type-check
```

建议提交：

```powershell
git add web/services/word/WordRepositoryV2.ts web/services/word/wordRowMapper.ts web/tests/wordRepositoryV2.test.ts
git commit -m "refactor(word): migrate v2 repository to drizzle"
```

## M3：迁移 `WordServiceV2` 和 v2 路由

### Task 3.1：改写事务边界

修改 `web/services/word/WordServiceV2.ts`：

- `const pool = await getPool()` → `const db = getDb()`
- `pool.connect()` / `BEGIN` / `COMMIT` / `ROLLBACK` → `db.transaction((tx) => { ... })`
- 在事务内调用 Repository 时传入 `tx`

注意：

- `better-sqlite3` 是同步 driver。Service 可以保留 async 方法签名，但内部不要假装 await SQLite 查询。
- 如果 route 已经 `await service.method()`，保留 async 签名可降低改动面。

### Task 3.2：更新冲突和错误处理

确认这些行为不变：

- 创建同 language + lemma 返回冲突。
- 同 lemma 不同 language 可共存。
- YAML 内容冲突仍使用现有 deep-diff 逻辑。
- validation 仍通过 `WordValidator.validate(data, wordLower, language)`。

SQLite 唯一约束错误可能包含：

- `SQLITE_CONSTRAINT_UNIQUE`
- `UNIQUE constraint failed`

统一转换成当前 API 使用的 HTTP 409 响应。

### Task 3.3：确认 `wordsV2` route 不改 contract

修改 `web/routes/wordsV2.ts` 时只做必要适配：

- 保持路径不变：`/api/v2/words`
- 保持响应 shape 不变。
- 保持 query 参数 `language=en|de`。
- 保持 `details?word=<lemma>&language=<lang>`。

不要在本阶段改前端 API 路径。

### Task 3.4：更新 v2 API 测试

修改 `web/tests/words-v2-api.test.ts`：

- 测试启动前使用临时 SQLite DB。
- 每个测试清理 `words_v2`。
- 不依赖 PG dev server。
- 保留 `--test-concurrency=1`，避免服务端口和 SQLite 文件竞争。

运行：

```powershell
cd web
npx tsx --test --test-concurrency=1 tests/words-v2-api.test.ts
npx tsx tests/word-validator.test.ts
```

### M3 验证

运行：

```powershell
cd web
npm run dev:server
```

手动验证：

- `GET http://localhost:8080/api/v2/words?language=en`
- `GET http://localhost:8080/api/v2/words?language=de`
- `POST http://localhost:8080/api/v2/words/add`
- `GET http://localhost:8080/api/v2/words/details?word=<lemma>&language=<lang>`

建议提交：

```powershell
git add web/services/word/WordServiceV2.ts web/routes/wordsV2.ts web/tests/words-v2-api.test.ts
git commit -m "refactor(word): run v2 service on sqlite"
```

## M4：迁移 Core、Sync、LocalStore

### Task 4.1：更新 core 健康检查

修改 `web/routes/core.ts`：

- `getPool()` → `getDb()`
- `SELECT 1` → `db.run(sql\`select 1\`)` 或查询 `words_v2` limit 1
- `resetPool()` → `closeDb()`

配置接口返回 SQLite 路径时，不要泄露绝对敏感路径给前端；可返回 basename 或标记。

更新 `web/tests/core-status.test.ts`：

- Mock `getDb()` / `closeDb()`。
- 保持 status 响应断言。

### Task 4.2：更新 sync 路由

修改 `web/routes/sync.ts`：

- 健康检查走 Drizzle。
- 批量同步调用 `WordServiceV2`。
- 删除本地项仍通过 LocalStore API，不直接操作表。

本阶段先保持 LocalStore 公开 API 不变：

- `getAll()`
- `findByLemma()`
- `save()`
- `delete()`
- `clear()`
- `getConfig()`
- `saveConfig()`

### Task 4.3：把 LocalStore 迁到 SQLite

修改 `web/localStore.ts`：

- `_local_words` 保存离线 YAML。
- `_local_config` 保存本地配置。
- 构造时确保表存在，或依赖 M1 migrations。
- 如果旧 `web/data/local_words.json` 存在且 `_local_words` 为空，自动导入一次。

迁移规则：

1. 读取旧 JSON。
2. 插入 `_local_words`。
3. 验证插入行数。
4. 不立即删除旧 JSON，改名为 `local_words.json.migrated` 或保留并记录日志。

### Task 4.4：补 LocalStore 测试

创建 `web/tests/localStore-sqlite.test.ts`：

- 保存 YAML 后能读取。
- 同 lemma 查找能命中。
- 删除后不存在。
- config 保存/读取正常。
- 旧 JSON 导入逻辑只执行一次。

运行：

```powershell
cd web
npx tsx --test tests/core-status.test.ts tests/localStore-sqlite.test.ts
```

### M4 验证

运行：

```powershell
cd web
npm run type-check
npm run lint
npx tsx --test tests/core-status.test.ts tests/localStore-sqlite.test.ts
```

手动验证：

- 保存一个本地词条。
- 刷新页面后本地词条仍存在。
- 执行同步后本地词条从 `_local_words` 删除并进入 `words_v2`。

建议提交：

```powershell
git add web/routes/core.ts web/routes/sync.ts web/localStore.ts web/tests/core-status.test.ts web/tests/localStore-sqlite.test.ts
git commit -m "refactor(sync): move core and local store to sqlite"
```

## M5：PG → SQLite 数据迁移

### Task 5.1：新增导出脚本

创建 `node/export-pg-to-sqlite.ts`。

输入：

- `PG_DATABASE_URL`：源 PostgreSQL。
- `DATABASE_URL`：目标 SQLite 文件路径。
- 可选 `--dry-run`：只读 PG 并输出统计。
- 可选 `--force`：目标表非空时允许覆盖或 upsert。

脚本流程：

1. 连接 PG。
2. 连接 SQLite。
3. 确认 SQLite schema 已存在。
4. 读取 `SELECT * FROM words_v2 ORDER BY created_at ASC`。
5. 将 PG `content` JSONB 转成 SQLite JSON 字符串。
6. 插入 SQLite `words_v2`。
7. 输出统计：
   - PG count
   - SQLite inserted count
   - skipped count
   - conflict count
   - language breakdown

### Task 5.2：新增验证脚本

创建 `node/verify-sqlite-migration.ts`。

检查：

- PG `words_v2` 总行数 = SQLite `words_v2` 总行数。
- 按 language 分组计数一致。
- 随机抽样 20 条，比对：
  - `id`
  - `lemma`
  - `language`
  - `part_of_speech`
  - `revision_count`
  - `content.yield.lemma`
- SQLite 唯一约束能阻止重复 `(lemma, language)`。

### Task 5.3：执行迁移

运行：

```powershell
cd node
$env:PG_DATABASE_URL="postgres://..."
$env:DATABASE_URL="../web/data/ad_fontes.db"
npx tsx export-pg-to-sqlite.ts --dry-run
npx tsx export-pg-to-sqlite.ts
npx tsx verify-sqlite-migration.ts
```

验收：

- 行数一致。
- language 分布一致。
- 抽样内容一致。
- 没有未解释的 skipped/conflict。

建议提交：

```powershell
git add node/export-pg-to-sqlite.ts node/verify-sqlite-migration.ts node/package.json node/package-lock.json
git commit -m "feat(db): add postgres to sqlite migration scripts"
```

## M6：迁移 Node CLI 工具

### Task 6.1：更新 `node/utils/db-config.ts`

目标：

- 从 `DATABASE_URL` 读取 SQLite 文件路径。
- 提供 `openSqliteDb()` 或 `getNodeDb()`。
- 不再默认读取 PG URL。

### Task 6.2：更新 `node/init_db.ts`

目标：

- 创建 SQLite 文件目录。
- 应用 Drizzle migration 或执行 schema 初始化。
- 输出数据库路径和表检查结果。

### Task 6.3：更新数据工具

逐个迁移：

- `node/loader.ts`
- `node/check-word-diff.ts`
- `node/view-word-yaml.ts`

要求：

- 只写入/读取 `words_v2`。
- `content` JSON 处理复用同类 helper，避免每个脚本手写 parse/stringify。
- 不再引用旧 6 表。

### Task 6.4：更新脚本命令

修改 `node/package.json`：

- 删除或替换 `migrate-v2`。
- 新增：
  - `export-pg-to-sqlite`
  - `verify-sqlite-migration`

### M6 验证

运行：

```powershell
cd node
npm run type-check
npm run lint
npm run init-db
npm run loader -- ../example.yml
npx tsx view-word-yaml.ts <lemma>
npx tsx check-word-diff.ts <lemma> ../example.yml
```

建议提交：

```powershell
git add node
git commit -m "refactor(cli): migrate node tools to sqlite"
```

## M7：切换主入口、清理旧代码、更新文档

### Task 7.1：决定 API 路径策略

推荐兼容策略：

- 保留 `/api/v2/words`。
- 将 `/api/words` 临时映射到 v2 route，或返回明确 deprecation。
- 前端当前若仍有 v1 fallback，保留一轮 release 后再删除。

修改 `web/server.ts`：

```ts
app.use('/api/v2/words', require('./routes/wordsV2.ts'));
app.use('/api/words', require('./routes/wordsV2.ts'));
```

如果选择直接删除 v1，必须同步更新这些测试：

- `web/tests/route-validation-wiring.test.ts`
- `web/tests/words-query-runtime.test.ts`
- `web/tests/write-auth.test.ts`
- `web/scripts/smoke-query-getter.ts`

### Task 7.2：删除旧 v1 代码

删除前再次搜索引用：

```powershell
Get-ChildItem -Path web,node -Recurse -File -Include *.ts,*.js |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\.vite\\' } |
  Select-String -Pattern 'WordService\.ts|WordRepository\.ts|WordAssembler\.ts|routes/words\.ts|controllers/wordController|getPool|resetPool'
```

确认无引用后删除：

- `web/services/word/WordService.ts`
- `web/services/word/WordRepository.ts`
- `web/services/word/WordAssembler.ts`
- `web/controllers/wordController.ts`
- `web/routes/words.ts`

同时更新：

- `web/services/word/index.ts`
- route 相关测试
- smoke scripts

### Task 7.3：清理 PG schema 和迁移

在确认 SQLite 数据迁移和应用验证通过后：

- 删除或归档 `schema.sql`
- 删除或归档 `migrations/`
- 删除 `node/migrate_v2.ts`
- 从 `web/package.json` 删除 `pg`
- 从 `node/package.json` 删除 `pg`，除非仍需要保留 PG 导出脚本

推荐不要直接丢失历史：

- 如果仓库仍需要记录 PG 迁移历史，移动到 `docs/archive/postgres/`。
- 如果确认 git 历史足够，直接删除。

### Task 7.4：更新 Docker

修改 `docker-compose.yml`：

- 移除 PostgreSQL service。
- 增加 SQLite 数据 volume，例如挂载 `./web/data:/app/data`。
- 更新环境变量：
  - `DATABASE_URL=/app/data/ad_fontes.db`

### Task 7.5：更新文档

至少更新：

- `README.md`
- `docs/DEVELOPMENT.md`（如果不存在则创建）
- `.env.example`

文档必须说明：

- SQLite 数据文件位置。
- 如何初始化数据库。
- 如何从 PG 导入旧数据。
- 如何运行 Drizzle migration。
- 常用验证命令。
- 旧 PG 环境变量只用于迁移窗口。

### M7 验证

运行完整验证：

```powershell
cd web
npm run type-check
npm run lint
npx tsx --test tests/wordRepositoryV2.test.ts tests/core-status.test.ts tests/localStore-sqlite.test.ts
npx tsx --test --test-concurrency=1 tests/words-v2-api.test.ts
npm run build
```

如果前端测试需要：

```powershell
cd web/client
npm run type-check
npm run lint
npm run test
```

手动验证：

1. 启动 `cd web && npm run dev`。
2. 打开词表，确认按语言过滤正常。
3. 创建英文词条。
4. 创建同 lemma 德文词条。
5. 编辑词条并确认 revision 增加。
6. 删除词条。
7. 保存本地 YAML。
8. 同步本地 YAML 到数据库。
9. 重启服务后数据仍存在。

建议提交：

```powershell
git add .
git commit -m "refactor(db): remove postgres legacy data layer"
```

## 风险清单与缓解

### 风险 1：`better-sqlite3` native 安装失败

缓解：

- 先在 M1 单独安装验证。
- Windows 环境确认 Node 版本和构建工具链。
- 不要在安装失败时继续改业务代码。

### 风险 2：SQLite 同步写导致请求阻塞

缓解：

- 当前项目数据规模较小，`better-sqlite3` 可接受。
- 设置 WAL 和 busy timeout。
- 大批量导入只在 CLI 脚本中执行，不在请求路径执行。

### 风险 3：JSON 字段行为与 PG JSONB 不一致

缓解：

- Repository 层统一 parse/stringify。
- 增加内容抽样验证。
- 不在 SQLite 中做复杂 JSON 查询；必要时后续加 generated column 或 FTS。

### 风险 4：大小写搜索/唯一约束行为变化

缓解：

- 明确 `(lemma, language)` 的唯一约束是否大小写敏感。
- 如果要求大小写不敏感，schema 中使用 normalized lemma 列或 `COLLATE NOCASE`。
- Repository 测试覆盖 `See` / `see` 这类大小写样例。

### 风险 5：一次性删除 v1 导致前端 fallback 断裂

缓解：

- M7 前保留 v1 route 或将 `/api/words` 映射到 v2。
- 搜索并更新 `useWordEditorLoader.ts` 中的 v1 fallback。
- 删除 v1 放到最后单独提交。

### 风险 6：迁移脚本覆盖现有 SQLite 数据

缓解：

- 默认目标表非空时拒绝执行。
- 只有 `--force` 才允许覆盖/upsert。
- 迁移前备份 SQLite 文件。

## 最终验收标准

- `web` 不再依赖运行中的 PostgreSQL。
- `/api/v2/words` 所有现有行为保持兼容。
- `words_v2` 数据从 PG 迁移到 SQLite 后行数和抽样内容一致。
- `LocalStore` 从 JSON 文件迁到 SQLite，旧 JSON 不会静默丢失。
- Node CLI 工具可针对 SQLite 正常运行。
- `npm run type-check`、`npm run lint`、相关测试、`npm run build` 通过，或有明确记录的环境性失败。
- 文档能指导新开发者从零启动 SQLite 版本。

## 推荐执行顺序

1. M0：盘点和备份。
2. M1：Drizzle/SQLite 基础设施。
3. M2：Repository + 单元测试。
4. M3：Service/Route + v2 API 测试。
5. M4：Core/Sync/LocalStore。
6. M5：数据迁移脚本和真实迁移。
7. M6：Node CLI 工具。
8. M7：路由切换、旧代码清理、Docker/文档。

如果时间有限，第一天只做 M0-M3。做到这里时应用已经可以用 SQLite 服务核心 v2 API，风险最大的一段已经被单元测试和 API 测试夹住。后续 M4-M7 再稳稳推进，别让这头迁移小兽一口吞掉整个仓库。

## 当前执行状态（2026-05-01）

### 已完成

- M0：确认 worktree 基于最新 `origin/master`；旧 `task_plan.md` 出现的原因是计划曾只存在于主工作区未提交修改中，`git worktree add` 不会带入未提交内容。
- M0：修复迁移前基线问题，`web` 的 `type-check`、`lint`、`word-validator` 已通过。
- M1：新增 SQLite/Drizzle 基础设施、schema、`drizzle.config.ts` 和初始 migration。
- M2：`WordRepositoryV2` 已迁移到 Drizzle，并新增 `web/tests/wordRepositoryV2.test.ts` 覆盖 CRUD、语言隔离、分页搜索、更新 revision、删除。
- M3：迁移 `WordServiceV2` 事务边界，从 `getPool()` / `client.query('BEGIN')` 切到 `getDb().transaction()`。
- M3：`web/tests/words-v2-api.test.ts` 已改为临时 SQLite + 临时 Express server 自举运行；覆盖 v2 API CRUD、重复检测、语言隔离、详情、强制更新和删除。
- M3：验证已通过：`web` 的 `type-check`、`lint`、`wordRepositoryV2`、`wordServiceV2-sqlite`、`words-v2-api`。
- M5：新增 `web/scripts/import-pg-words-v2-to-sqlite.ts`，已从 PostgreSQL `words_v2` 导入默认 SQLite：共 331 条，其中 `en=324`、`de=7`。
- M4：迁移 `core` / `sync` 路由和 `LocalStore` 到 SQLite。
  - `web/routes/core.ts`：`/status`、`/health`、`POST /config` 从 `getPool()` / `resetPool()` 切到 `getSqlite()` / `closeDb()`；`/check` 从旧 `wordController` 切到 `WordServiceV2.checkWord`。
  - `web/routes/sync.ts`：`/sync/check`、`/sync/execute` 从旧 `wordService`（v1，依赖 PG）切到 `WordServiceV2`。
  - `web/localStore.ts`：从 JSON 文件存储迁移到 SQLite `_local_words` / `_local_config` 表，保留旧 JSON 自动导入和 `.json.migrated` 重命名逻辑。
  - 测试：新增 `web/tests/localStore-sqlite.test.ts`（8 个用例），更新 `web/tests/core-status.test.ts` 适配 SQLite mock。
  - `.env`：`DATABASE_URL` 删除，web 和 node 各自使用正确的默认路径；旧 PG 连接串保留为 `PG_DATABASE_URL`。
  - 验证通过：`type-check`、`lint`、15 个测试（core-status 2 + localStore 8 + wordRepositoryV2 3 + wordServiceV2 2）全部通过。
- M5：数据迁移校验补充。
  - 新增 `node/verify-sqlite-migration.ts`：校验行数、语言分布、唯一约束、内容完整性、空字段。支持 `--pg-check` 跨库比对。
  - 校验结果：331 行，en=324，de=7，0 重复，20 条抽样 JSON 内容有效，唯一约束通过，0 error，0 warning。
- M6：迁移 `node/` CLI 工具到 SQLite。
  - `node/utils/db-config.ts`：新增 `resolveDbPath()`、`openSqliteDb()`，PG 连接抛错。
  - `node/init_db.ts`：从 PG `CREATE DATABASE` + `schema.sql` 改为 SQLite drizzle migration 应用 + 表检查。
  - `node/loader.ts`：从旧 6 表 PG loader 改为 `words_v2` SQLite loader，支持 `--force` 覆盖。
  - `node/check-word-diff.ts`：从 PG `words` 表改为 SQLite `words_v2`，可选 YAML 文件对比。
  - `node/view-word-yaml.ts`：从 PG `words` 表改为 SQLite `words_v2`，支持 language 过滤。
  - `node/migrate_v2.ts`：废弃，输出迁移指引。
  - `node/package.json`：删除 `migrate-v2`，新增 `verify-sqlite-migration`、`export-pg-to-sqlite`，添加 `@types/better-sqlite3`、`@types/js-yaml`、`@types/deep-diff`。
  - 验证通过：`type-check`、`lint`、`init_db`、`view-word-yaml`、`check-word-diff` smoke 全部通过。

### 尚未完成

- M7：切换主入口、清理 v1/PG 旧代码、更新 Docker 和文档。

### 当前可测试范围

- `/api/v2/words`、`/api/status`、`/api/health`、`/api/config`、`/api/check` 均已在 SQLite 上可测。
- `/api/local`、`/api/sync/check`、`/api/sync/execute` 已切换至 SQLite + WordServiceV2。
- `LocalStore` 已从 JSON 文件迁到 SQLite，旧 JSON 自动导入。
- 默认 SQLite 文件已有真实词库数据：`web/data/ad_fontes.db`（331 条，en=324，de=7）。
- Node CLI 工具全部迁移到 SQLite，PG 依赖仅保留在 `verify-sqlite-migration.ts` 的可选 PG 交叉校验路径和 `pg` npm 包中。
