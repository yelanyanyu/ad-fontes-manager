# API Documentation

Ad Fontes Manager REST API

## Base Info

- **Base URL**: `http://localhost:<port>/api`（Web 模式默认 8080，桌面模式端口随机）
- **Content-Type**: `application/json`
- **Authentication**: 写操作需要 `X-Admin-Token` 请求头

---

## Words v2 (Recommended)

所有词条操作应使用 v2 API (`/api/v2/words`)。v1 API (`/api/words`) 仅保留向后兼容，不再修改。

### List Words

```http
GET /v2/words?page=1&limit=20&search=keyword&sort=newest&language=en
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| page | number | no | 页码，默认 1 |
| limit | number | no | 每页条数，默认 20 |
| search | string | no | 搜索关键词（部分匹配） |
| sort | string | no | 排序：`newest`, `oldest`, `az`, `za` |
| language | string | no | 语言：`en`, `de`。默认 `en` |

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
GET /v2/words/details?word=example&language=en
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
GET /v2/words/:id
```

### Check Existence

```http
GET /v2/words/check?word=test&language=en
```

Response: `{ "found": true, "lemma": "test", "language": "en", "data": {...} }`

### Validate YAML

```http
POST /v2/words/validate
Content-Type: application/json

{ "yaml": "yield:\n  lemma: example\n  ..." }
```

Response: `{ "valid": true, "errors": [], "language": "en" }`

### Save / Upsert Word

```http
POST /v2/words
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

### Delete Word

```http
DELETE /v2/words/:id
X-Admin-Token: <token>
```

Response: `{ "success": true }`

---

## Words v1 (Legacy, Frozen)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/words` | 列表 |
| GET | `/words/details` | 详情（需要 `include` 参数） |
| GET | `/words/:id` | 按 ID 获取 |
| POST | `/words` | 保存/更新 |
| POST | `/words/add` | 新增 |
| DELETE | `/words/:id` | 删除 |

**不再修改 v1 端点。** 所有新功能在 v2 中实现。

---

## Anki Export

### AnkiConnect Proxy

```http
POST /anki/connect
Content-Type: application/json

{ "action": "deckNames", "version": 6 }
```

代理到本地的 AnkiConnect 服务。

### Export .apkg

```http
POST /anki/export-apkg
Content-Type: application/json

{ "payloads": [...], "deckName": "...", "modelName": "..." }
```

返回 `.apkg` 二进制流。

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
      "apiKey": "****yz12",
      "models": [
        { "id": "deepseek-v4-pro", "name": "deepseek-v4-pro[1m]" }
      ]
    }
  ],
  "search": {
    "provider": "brave",
    "apiKey": "****ab34",
    "autoDomains": true,
    "domains": { "common": ["etymonline.com"], "en": [], "de": [] }
  },
  "stages": {
    "fast": { "provider": "deepseek", "model": "deepseek-v4-flash", "reasoningEffort": "low" },
    "balanced": { "provider": "deepseek", "model": "deepseek-v4-pro", "reasoningEffort": "medium" },
    "expert": { "provider": "deepseek", "model": "deepseek-v4-pro", "reasoningEffort": "high" }
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
  "apiKey": "sk-xxx",
  "type": "openai"
}
```

超时 15 秒。成功返回 `{ "success": true }`，失败返回错误信息。

### Test Search API

```http
POST /api/v2/config/ai/test-search
X-Admin-Token: <token>
Content-Type: application/json

{
  "provider": "brave",
  "apiKey": "BSA-xxx"
}
```

超时 15 秒。成功返回 `{ "success": true }`，失败返回错误信息。

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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| word | string | yes | 要生成的目标单词 |
| language | string | yes | 语言：`en` 或 `de` |
| context | string | no | 用户提供的上下文句子 |
| notes | string | no | 额外的生成指示 |

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

| Event | Data | Description |
|-------|------|-------------|
| `job:queued` | `{ position: number }` | 任务排队中 |
| `job:started` | `{}` | 任务开始执行 |
| `step:start` | `{ step: string, message: string }` | 阶段开始（searching / pondering / auditing / fixing） |
| `step:tokens` | `{ step: string, chunk: string }` | LLM 输出文本流 |
| `step:reasoning` | `{ step: string, chunk: string }` | LLM 推理/思考过程流 |
| `step:tool-call` | `{ step: string, toolCallId: string, toolName: string, input?: any, startTime: number }` | Tool call 开始 |
| `step:tool-result` | `{ step: string, toolCallId: string, toolName: string, output?: any, error?: string, warning?: string, duration: number }` | Tool call 结果 |
| `step:complete` | `{ step: string, duration: number, summary: string, result?: any, rawText?: string, reasoningText?: string }` | 阶段完成 |
| `step:error` | `{ step: string, error: string, willRetry?: boolean }` | 阶段失败（非 fixing 阶段将终止流水线） |
| `pipeline:complete` | `{ yaml: string, scores: object }` | 流水线完成，含完整 YAML 和评分 |
| `pipeline:stopped` | `{ yaml: string, stoppedAtStage: string, reason: string }` | 流水线因止损机制提前终止（保留部分结果） |

### Cancel Job

```http
POST /api/v2/generate/:jobId/cancel
X-Admin-Token: <token>
```

取消正在运行或排队中的任务。

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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| fromStage | string | no | 从哪个阶段重新开始：`searching` / `pondering` / `auditing` |
| notes | string | no | 更新的生成指示 |
| userScore | number | no | 用户评分（0-10），回传给审核阶段 |

### Auto Fix

```http
POST /api/v2/generate/:jobId/fix
X-Admin-Token: <token>
```

根据审核阶段（auditing）的 `revision_notes` 自动修复 YAML。超时 180 秒。修复过程通过 SSE 流式返回（复用 stream 端点）。

Response:

```json
{
  "yaml": "yield:\n  lemma: ...\n..."
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
GET /status
```

Response: `{ "connected": true }`

---

## Error Handling

```json
{ "success": false, "code": 400, "message": "Error description" }
```

| Status | Description |
|--------|-------------|
| 200 | Success |
| 400 | Bad request |
| 401 | Unauthorized（缺少 token） |
| 403 | Forbidden（无效 token） |
| 404 | Not found |
| 409 | Conflict（重复词条） |
| 422 | Unprocessable（YAML 无效） |
| 429 | Rate limited |
| 500 | Internal server error |
