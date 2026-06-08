# API Documentation

Ad Fontes Manager REST API

## Base Info

- **Base URL**: `http://localhost:<port>/api`（Web 模式默认 8080，桌面模式默认 19876）
- **Content-Type**: `application/json`
- **Authentication**: 写操作需要 `X-Admin-Token` 请求头

---

## Words API

所有词条操作使用 v2 API (`/api/v2/words`)。旧的 v1 API 已移除。

### List Words

```http
GET /api/v2/words?page=1&limit=20&search=keyword&sort=newest&language=en
```

| Param    | Type   | Required | Description                          |
| -------- | ------ | -------- | ------------------------------------ |
| page     | number | no       | 页码，默认 1                         |
| limit    | number | no       | 每页条数，默认 20                    |
| search   | string | no       | 搜索关键词（部分匹配）               |
| sort     | string | no       | 排序：`newest`, `oldest`, `az`, `za` |
| language | string | no       | 语言：`en`, `de`。默认 `en`          |

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "lemma": "example",
      "language": "en",
      "part_of_speech": "noun",
      "content": { "yield": {...}, "etymology": {...} },
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20,
  "totalPages": 5
}
```

### Get Word Details (by Lemma)

```http
GET /api/v2/words/details?word=example&language=en
```

Response:

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "uuid",
    "lemma": "example",
    "language": "en",
    "yield": { "lemma": "example", "contextual_meaning": {...} },
    "etymology": { ... },
    "cognate_family": { ... },
    "application": { ... },
    "nuance": { ... }
  }
}
```

### Get Word by ID

```http
GET /api/v2/words/:id
```

### Check Existence

```http
GET /api/v2/words/check?word=test&language=en
```

Response: `{ "found": true, "lemma": "test", "language": "en", "data": {...} }`

### Validate YAML

```http
POST /api/v2/words/validate
Content-Type: application/json

{ "yaml": "yield:\n  lemma: example\n  ...", "repair": false }
```

`repair` 参数（可选，默认 `false`）：设为 `false` 时执行严格校验（不自动修复），用于编辑器实时校验；设为 `true` 时执行格式修复后再校验。

Response: `{ "valid": true, "errors": [], "language": "en" }`

### Save / Upsert Word

```http
POST /api/v2/words
X-Admin-Token: <token>
Content-Type: application/json

{
  "yaml": "yield:\n  lemma: example\n  ...",
  "forceUpdate": false
}
```

Response (success):

```json
{ "success": true, "id": "uuid", "lemma": "example", "language": "en", "status": "created" }
```

Response (conflict, when `forceUpdate` is false):

```json
{
  "status": "conflict",
  "diff": [...],
  "oldData": {...},
  "newData": {...}
}
```

### Add Word

```http
POST /api/v2/words/add
X-Admin-Token: <token>
Content-Type: application/json

{ "yaml": "yield:\n  lemma: example\n  ..." }
```

与 Save 的区别：不会检测冲突，直接新增。

### Delete Word

```http
DELETE /api/v2/words/:id
X-Admin-Token: <token>
```

Response: `{ "success": true }`

### Format Fix

```http
POST /api/v2/words/format-fix
Content-Type: application/json

{ "yaml": "yield:\n  lemma: example\n  ..." }
```

对 YAML 执行语法修复、区块提升等确定性格式修复。返回修复后的 YAML 和诊断信息。

---

## Anki Export

### AnkiConnect Proxy

```http
POST /api/anki/connect
Content-Type: application/json

{ "action": "deckNames", "version": 6 }
```

代理到本地的 AnkiConnect 服务。

### Export .apkg

```http
POST /api/anki/export-apkg
Content-Type: application/json

{ "payloads": [...], "deckName": "...", "modelName": "..." }
```

返回 `.apkg` 二进制流。

### Export .apkg by Word IDs

```http
POST /api/anki/export-apkg-by-ids
Content-Type: application/json

{
  "wordIds": ["uuid-1", "uuid-2"],
  "fieldMapping": [{ "source": "lemma", "target": "Front" }],
  "options": { "deckName": "...", "modelName": "...", "tags": [] },
  "modelFields": ["Front", "Back"],
  "selectedTemplate": { "name": "...", "front": "...", "back": "..." },
  "css": "..."
}
```

按词条 ID 列表批量导出，服务端直接从数据库读取词条内容构建 apkg。返回 `.apkg` 二进制流。

---

## Config

### Get Core Config

```http
GET /api/core/config
```

数据库 URL 不返回明文，仅返回 `hasDatabaseUrl: true/false`。

### Update Core Config

```http
POST /api/core/config
X-Admin-Token: <token>
```

---

## AI Config

### Get AI Config

```http
GET /api/v2/config/ai
```

返回 AI 配置，所有 API Key 做掩码处理（仅显示后 4 位）。

Response:

```json
{
  "providers": [
    {
      "id": "deepseek",
      "name": "deepseek",
      "type": "openai",
      "baseUrl": "https://api.deepseek.com",
      "anthropicBaseUrl": "https://api.deepseek.com/anthropic",
      "apiKey": "****yz12",
      "models": [
        { "id": "deepseek-v4-pro[1m]", "name": "deepseek-v4-pro[1m]", "endpointType": "anthropic" }
      ]
    }
  ],
  "search": {
    "provider": "tavily",
    "apiKey": "****ab34",
    "autoDomains": true,
    "domains": { "common": ["etymonline.com"], "en": [], "de": [] }
  },
  "stages": {
    "fast": { "provider": "deepseek", "model": "deepseek-v4-flash[1m]", "reasoningEffort": "none" },
    "balanced": {
      "provider": "deepseek",
      "model": "deepseek-v4-pro[1m]",
      "reasoningEffort": "low"
    },
    "expert": {
      "provider": "deepseek",
      "model": "deepseek-v4-pro[1m]",
      "reasoningEffort": "medium"
    }
  },
  "review": {
    "threshold": 6,
    "thresholdByLanguage": { "en": 6, "de": 6 }
  }
}
```

### Update AI Config

```http
PUT /api/v2/config/ai
X-Admin-Token: <token>
Content-Type: application/json

{ ... }  // 完整或部分 AI 配置，与 GET 结构相同
```

### Test Provider Connectivity

```http
POST /api/v2/config/ai/test-provider
X-Admin-Token: <token>
Content-Type: application/json

{
  "providerId": "deepseek",
  "baseUrl": "https://api.deepseek.com",
  "anthropicBaseUrl": "https://api.deepseek.com/anthropic",
  "apiKey": "sk-xxx",
  "type": "openai",
  "modelEndpointType": "anthropic",
  "model": "deepseek-v4-pro[1m]"
}
```

超时 15 秒。成功返回 `{ "ok": true, "latencyMs": 1234 }`，失败返回 `{ "ok": false, "error": "...", "latencyMs": ... }`。

### Test Search API

```http
POST /api/v2/config/ai/test-search
X-Admin-Token: <token>
Content-Type: application/json

{
  "provider": "tavily",
  "apiKey": "tvly-xxx"
}
```

`provider` 可选值：`brave`、`tavily`。超时 15 秒。成功返回 `{ "ok": true, "latencyMs": 1234 }`，失败返回 `{ "ok": false, "error": "...", "latencyMs": ... }`。

---

## AI Generation

多阶段流水线 API，用于从零生成或完善词条 YAML。

### Start Generation

```http
POST /api/v2/generate/single
X-Admin-Token: <token>
Content-Type: application/json

{
  "word": "ephemeral",
  "context": "出现在 19 世纪自然文学中",
  "language": "en",
  "notes": "重点关注词根的视觉意象"
}
```

| Field    | Type   | Required | Description          |
| -------- | ------ | -------- | -------------------- |
| word     | string | yes      | 要生成的目标单词     |
| language | string | yes      | 语言：`en` 或 `de`   |
| context  | string | no       | 用户提供的上下文句子 |
| notes    | string | no       | 额外的生成指示       |

Response:

```json
{
  "jobId": "uuid",
  "queued": true,
  "position": 1
}
```

`queued` 为 false 且无 `position` 时表示立即开始执行。

### Stream Progress (SSE)

```http
GET /api/v2/generate/:jobId/stream
```

Server-Sent Events 端点，实时推送流水线进度。事件类型：

| Event               | Data                                                                                                                       | Description                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `job:queued`        | `{ position: number }`                                                                                                     | 任务排队中                                            |
| `job:started`       | `{}`                                                                                                                       | 任务开始执行                                          |
| `step:start`        | `{ step: string, message: string }`                                                                                        | 阶段开始（searching / pondering / auditing / fixing） |
| `step:tokens`       | `{ step: string, chunk: string }`                                                                                          | LLM 输出文本流                                        |
| `step:reasoning`    | `{ step: string, chunk: string }`                                                                                          | LLM 推理/思考过程流                                   |
| `step:tool-call`    | `{ step: string, toolCallId: string, toolName: string, input?: any, startTime: number }`                                   | Tool call 开始                                        |
| `step:tool-result`  | `{ step: string, toolCallId: string, toolName: string, output?: any, error?: string, warning?: string, duration: number }` | Tool call 结果                                        |
| `step:complete`     | `{ step: string, duration: number, summary: string, result?: any, rawText?: string, reasoningText?: string }`              | 阶段完成                                              |
| `step:error`        | `{ step: string, error: string, willRetry?: boolean }`                                                                     | 阶段失败（非 fixing 阶段将终止流水线）                |
| `pipeline:complete` | `{ yaml: string, scores: object }`                                                                                         | 流水线完成，含完整 YAML 和评分                        |
| `pipeline:stopped`  | `{ yaml: string, stoppedAtStage: string, reason: string }`                                                                 | 流水线因止损机制提前终止（保留部分结果）              |

### Cancel Job

```http
POST /api/v2/generate/:jobId/cancel
X-Admin-Token: <token>
```

取消正在运行或排队中的任务。

### Pause Job

```http
POST /api/v2/generate/:jobId/pause
X-Admin-Token: <token>
```

暂停正在运行的单个作业。暂停后可通过 `/queue/resume-all` 恢复。

### Resume Job

```http
POST /api/v2/generate/:jobId/resume
X-Admin-Token: <token>
Content-Type: application/json

{
  "fromStage": "pondering",
  "notes": "重新生成视觉意象部分",
  "userScore": 7
}
```

| Field     | Type   | Required | Description                                                |
| --------- | ------ | -------- | ---------------------------------------------------------- |
| fromStage | string | no       | 从哪个阶段重新开始：`searching` / `pondering` / `auditing` |
| notes     | string | no       | 更新的生成指示                                             |
| userScore | number | no       | 用户评分（0-10），回传给审核阶段                           |

### Resume Active Job

```http
POST /api/v2/generate/:jobId/resume-active
X-Admin-Token: <token>
```

恢复一个正在运行但被中断的作业（服务重启后使用）。

### Auto Fix

```http
POST /api/v2/generate/:jobId/fix
X-Admin-Token: <token>
```

根据审核阶段（auditing）的 `revision_notes` 自动修复 YAML。修复过程通过 SSE 流式返回（复用 stream 端点）。

Response:

```json
{
  "yaml": "yield:\n  lemma: ...\n..."
}
```

### Batch Generate

```http
POST /api/v2/generate/batch
X-Admin-Token: <token>
Content-Type: application/json

{
  "words": [
    { "word": "ephemeral", "language": "en", "context": "..." },
    { "word": "See", "language": "de", "context": "..." }
  ]
}
```

批量提交多个生成作业。每个 word 条目格式同 `/generate/single`。返回每个 job 的 ID 列表：

```json
{
  "jobIds": ["uuid-1", "uuid-2"],
  "count": 2
}
```

### Queue Overview

```http
GET /api/v2/generate/queue/overview
```

返回队列状态快照（queued / running / paused / error 数量）。

### Queue Management

```http
POST /api/v2/generate/queue/cancel-all
POST /api/v2/generate/queue/pause-all
POST /api/v2/generate/queue/resume-all
```

均需 `X-Admin-Token`。批量取消/暂停/恢复队列中所有作业。

### Queue History

```http
GET /api/v2/generate/queue/history
```

获取已完成/已取消的作业历史列表（分页）。

```http
GET /api/v2/generate/queue/history/:jobId
DELETE /api/v2/generate/queue/history/:jobId
POST /api/v2/generate/queue/history/clear
```

查看、删除单个历史作业或清空全部历史。均需 `X-Admin-Token`（除 GET）。

### User Review Score

```http
POST /api/v2/generate/queue/history/:jobId/user-review-score
X-Admin-Token: <token>
Content-Type: application/json

{ "userScore": 8 }
```

为用户覆盖 AI 审核评分。不影响原始的 AI Review Score，仅设置 User Review Score。

### Workset

```http
GET /api/v2/generate/workset/today
```

获取今日工作集——当日完成和部分完成的作业去重后按 Lemma + Language 分组的最新结果。

```http
POST /api/v2/generate/workset/save
X-Admin-Token: <token>
```

批量保存工作集中的词条到数据库。

```http
POST /api/v2/generate/workset/improve
X-Admin-Token: <token>
```

对工作集中评分低于阈值的词条批量创建 Content Fix 作业。

---

## Announcements

```http
GET /api/announcements
```

返回系统公告列表。公告默认来自 GitHub latest release note；如果公告来源暂不可达，接口仍返回本地缓存公告，并通过 `sourceNotice` 提供非阻塞提示。

```json
{
  "announcements": [
    {
      "version": 2000005,
      "date": "2026-06-08",
      "title": "2.0.5 更新公告",
      "body_md": "## [2.0.5] - 2026-06-08\n...",
      "dismissible": true
    }
  ],
  "sourceNotice": {
    "source": "github",
    "level": "warning",
    "message": "无法连接 GitHub Release，当前显示本地缓存公告。",
    "detail": "network unavailable"
  }
}
```

---

## System

### Health Check

```http
GET /api/core/health
```

Response: `{ "status": "ok" }`

### Database Status

```http
GET /api/status
```

Response: `{ "connected": true }`

### Version

```http
GET /api/core/version
```

Response: `{ "version": "2.0.5", "copyright": "Copyright © 2026 yelanyanyu(Github)" }`

### Word Check

```http
GET /api/core/check?word=test&language=en
```

检查词条是否存在。Response: `{ "found": true, ... }`

---

## Error Handling

```json
{ "success": false, "code": 400, "message": "Error description" }
```

| Status | Description                |
| ------ | -------------------------- |
| 200    | Success                    |
| 400    | Bad request                |
| 401    | Unauthorized（缺少 token） |
| 403    | Forbidden（无效 token）    |
| 404    | Not found                  |
| 409    | Conflict（重复词条）       |
| 422    | Unprocessable（YAML 无效） |
| 429    | Rate limited               |
| 500    | Internal server error      |
