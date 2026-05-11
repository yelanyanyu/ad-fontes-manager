# Job Queue System（作业队列系统）

## 概述

作业队列是 AI 生成流水线的持久化调度层。它将词条生成、修复、审核-修复等任务抽象为**作业（Job）**，通过 SQLite 持久化队列进行调度，支持并发控制、断路器、批量操作、SSE 实时进度推送。

### 设计文档

架构决策记录：[ADR-0001 — SQLite-backed Job Queue](./adr/0001-sqlite-backed-job-queue.md)

---

## 核心概念

| 术语 | 说明 |
|------|------|
| **Job（作业）** | 一个待执行的 AI 任务，包含类型、优先级、状态、输入参数 |
| **Queue（队列）** | SQLite `job_queue` 表中按优先级和创建时间排序的待处理作业集合 |
| **Pipeline（流水线）** | 多阶段 AI 处理流程，如 `searching → pondering → auditing` |
| **Concurrency Pool（并发池）** | `maxConcurrency` 限制的并发执行槽位 |
| **Circuit Breaker（断路器）** | 同一 Provider 连续失败 3 次后自动暂停调度，防止雪崩 |
| **SSE（Server-Sent Events）** | 作业进度实时推送协议 |

### 作业状态机

```
                    enqueue
                       │
                       ▼
┌────────────────── QUEUED ─────────────────────┐
│                      │                         │
│                tryDequeue                      │
│                      │                         │
│                      ▼                         │
│                  RUNNING ─── cancel ──────────┤
│                   │  │  │                      │
│         ┌─────────┘  │  └─────────┐           │
│         │            │            │           │
│    pipeline:    pipeline:    abort signal      │
│    complete      stopped    (cancel/pause)     │
│         │            │            │           │
│         ▼            ▼            ▼           │
│    COMPLETE      PARTIAL       ERROR          │
│         │            │        (cancel)        │
│         │            │            │           │
│    ┌────┴────┐ ┌─────┴─────┐     │           │
│    │  resume │ │  audit-fix│     │           │
│    │ (new id)│ │  (new job)│     │           │
│    │    │    │ │     │     │     │           │
│    │    ▼    │ │     ▼     │     │           │
│    │  QUEUED │ │  QUEUED   │     │           │
│    └─────────┘ └───────────┘     │           │
│                                  │           │
├── pauseBatch ──► PAUSED ◄────────┤           │
│                      │           │           │
│                 resumeBatch      │           │
│                      │           │           │
│                      ▼           │           │
│                    QUEUED        │           │
│                                  │           │
└── cancel / cancelBatch ──► CANCELLED ◄──────┘
```

---

## 作业类型（Job Type）

| 类型 | 流水线阶段 | 说明 |
|------|-----------|------|
| `generate` | searching → pondering → auditing | 从零生成词条 YAML |
| `fix` | fixing | 根据审核修改建议修复单个问题 |
| `audit-fix` | auditing → fixing | 审核已有词条并自动修复低分字段 |

---

## API 端点

### 生成与调试

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v2/generate/single` | 提交一个生成作业（409 = 重复） |
| GET | `/api/v2/generate/:jobId/stream` | SSE 进度流 |
| POST | `/api/v2/generate/:jobId/cancel` | 取消单个作业 |
| POST | `/api/v2/generate/:jobId/resume` | 从断点恢复（创建新作业） |
| POST | `/api/v2/generate/:jobId/fix` | 同步修复（返回 YAML） |

### 队列管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v2/generate/queue/overview` | 队列状态快照（queued/running/paused/error） |
| POST | `/api/v2/generate/queue/cancel-all` | 中断并取消所有活跃作业 |
| POST | `/api/v2/generate/queue/pause-all` | 暂停整个队列（运行中的安全中断→暂停） |
| POST | `/api/v2/generate/queue/resume-all` | 恢复所有暂停作业 |

---

## 数据库

`job_queue` 表在 [`ensureDatabaseSchema()`](../src/server/db/index.ts) 中随服务器启动自动创建。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | UUID 格式作业 ID |
| `batch_id` | TEXT | 批量操作分组标识 |
| `job_type` | TEXT | generate / fix / audit-fix |
| `priority` | TEXT | normal / high |
| `status` | TEXT | queued / running / complete / partial / error / paused / cancelled |
| `word` | TEXT | 目标词条 |
| `language` | TEXT | en / de |
| `context` | TEXT | 用户提供的上下文句子 |
| `notes` | TEXT | 用户备注 |
| `target_job_id` | TEXT | fix 类型的目标作业 ID |
| `target_word_id` | TEXT | audit-fix 类型的目标词条 ID |
| `provider_id` | TEXT | AI Provider 标识（用于断路器） |
| `result_yaml` | TEXT | 生成的 YAML 输出 |
| `result_scores` | TEXT | JSON 格式的评分结果 |
| `error` | TEXT | 错误信息 |
| `retry_count` | INTEGER | 重试次数 |
| `max_retries` | INTEGER | 最大重试次数（默认 2） |
| `started_at` | TEXT | 开始执行时间 |
| `completed_at` | TEXT | 完成时间 |
| `created_at` | TEXT | 创建时间 |

---

## 并发与调度

### 出队规则

1. 按 `priority DESC, created_at ASC` 排序
2. 跳过 Provider 被断路器阻塞的作业
3. 乐观锁：`UPDATE ... WHERE status = 'queued'`
4. 最大并发数由 `maxConcurrency` 控制（默认 1，可通过 `ai.queue_concurrency` 配置）

### 重启恢复

服务启动时：
- 取消所有 `queued` 作业（来自上一个会话的残留）
- 将 `running` 作业重置为 `queued`（可被重新调度）
- `paused` 作业保持不变（用户意图保留）

### 断路器

同一 Provider 连续失败 3 次后触发：
- 该 Provider 的作业暂停调度
- 调用 `resetCircuitBreaker(providerId)` 手动重置
- 作业成功后自动重置失败计数

---

## SSE 事件协议

### 生命周期事件

| 事件 | 触发时机 | 数据格式 |
|------|---------|---------|
| `job:queued` | 作业进入等待队列 | `{ type: "job:queued", position: number }` |
| `job:started` | 作业开始执行 | `{ type: "job:started" }` |
| `pipeline:complete` | 流水线成功完成 | `{ type: "pipeline:complete", yaml: string, scores: object, totalDuration: number }` |
| `pipeline:stopped` | 流水线止损停止 | `{ type: "pipeline:stopped", yaml: string, stoppedAtStage: string, reason: string }` |

### 阶段事件

| 事件 | 说明 |
|------|------|
| `step:start` | 阶段开始（step, message） |
| `step:tokens` | 流式文本增量（step, chunk） |
| `step:reasoning` | 推理文本增量（step, chunk） |
| `step:tool-call` | 工具调用开始（step, toolCallId, toolName, input） |
| `step:tool-result` | 工具调用结果（step, toolCallId, output, error） |
| `step:complete` | 阶段完成（step, duration, summary, result, rawText） |
| `step:error` | 阶段失败（step, error, willRetry） |

### 协议细节

- `step:tokens` 和 `step:reasoning` 不存储（仅实时转发），以节省内存
- 延迟订阅者可以通过 `subscribe()` 重放历史事件（30 分钟 TTL）
- 连接通过 15 秒的 keepalive ping（`: keepalive\n\n`）保持活跃
- Fix 进度通过同一 SSE 连接发送（`step:start` / `step:complete`，step=`fixing`）

---

## 配置

| 配置键 | 默认值 | 说明 |
|--------|--------|------|
| `ai.queue_concurrency` | 1 | 最大并发作业数 |

桌面端口通过环境变量 `DESKTOP_SERVER_PORT` 配置（默认 19876），在 `src/main/index.ts` 和 `electron.vite.config.mts` 之间共享。

---

## ABI 管理

`better-sqlite3` 是一个原生 C++ 插件：
- **Node.js 22**：ABI 127
- **Electron 39**：ABI 140

所有开发和构建命令会自动检测并修复 ABI：

```bash
npm run dev:web        # 自动确保 Node ABI 127
npm run dev:desktop    # 自动确保 Electron ABI 140
npm run build:desktop:win  # 构建过程中自动切换 ABI
```

如果僵尸进程持有文件锁，重建脚本会自动终止它们。手动重建：

```bash
npm run rebuild:electron:native  # 强制重建 Electron ABI
npm run rebuild:node:native      # 强制重建 Node ABI
npm run native:node              # 自动检测 + 修复 Node ABI
```

详见 [ELECTRON_NATIVE_MODULES.md](./ELECTRON_NATIVE_MODULES.md)。

---

## 代码导航

| 文件 | 说明 |
|------|------|
| [src/server/services/ai/JobQueue.ts](../src/server/services/ai/JobQueue.ts) | 核心队列实现（~800 行） |
| [src/server/services/ai/JobQueue.test.ts](../src/server/services/ai/JobQueue.test.ts) | 单元 / 集成测试（24 项） |
| [src/server/controllers/generateController.ts](../src/server/controllers/generateController.ts) | HTTP 控制器（委托给 JobQueue） |
| [src/server/routes/generate.ts](../src/server/routes/generate.ts) | 路由定义 |
| [src/server/services/ai/queue.ts](../src/server/services/ai/queue.ts) | JobQueue 单例 + SqliteLike 适配器 |
| [src/server/db/index.ts](../src/server/db/index.ts) | 数据库初始化（含 job_queue DDL） |
| [drizzle/0002_add_job_queue.sql](../drizzle/0002_add_job_queue.sql) | Drizzle 迁移文件 |
| [src/server/db/schema.ts](../src/server/db/schema.ts) | Drizzle ORM Schema |
| [scripts/ensure-node-native.mjs](../scripts/ensure-node-native.mjs) | Node ABI 自动检测 + 修复 |
| [scripts/ensure-electron-native.mjs](../scripts/ensure-electron-native.mjs) | Electron ABI 自动检测 + 修复 |
| [scripts/rebuild-electron-native.mjs](../scripts/rebuild-electron-native.mjs) | 强制 Electron 重建 |
| [scripts/native-lock.mjs](../scripts/native-lock.mjs) | 文件锁定检测 + 进程终止 |
