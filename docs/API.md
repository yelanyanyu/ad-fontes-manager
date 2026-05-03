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

### Get Config

```http
GET /api/core/config
```

数据库 URL 不返回明文，仅返回 `hasDatabaseUrl: true/false`。

### Update Config

```http
POST /api/core/config
X-Admin-Token: <token>
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
