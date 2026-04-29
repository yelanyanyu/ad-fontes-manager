# API Documentation

Ad Fontes Manager REST API

## Base Info

- **Base URL**: `http://localhost:8080/api`
- **Content-Type**: `application/json`

---

## Words (v2 API, Recommended)

All word operations should use the v2 API (`/api/v2/words`). The v1 API (`/api/words`) is preserved for backward compatibility only.

### List Words

```http
GET /v2/words?page={page}&limit={limit}&search={keyword}&sort={sort}&language={lang}
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| page | number | no | Page number, default 1 |
| limit | number | no | Items per page, default 20 |
| search | string | no | Search keyword (partial match) |
| sort | string | no | Sort: `newest`, `oldest`, `az`, `za` |
| language | string | no | Language code: `en`, `de`. Default `en` |

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
GET /v2/words/details?word={lemma}&language={lang}
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
    "etymology": { "root_and_affixes": {...} },
    "cognate_family": {...},
    "application": {...},
    "nuance": {...}
  }
}
```

The `data` object contains the full YAML content expanded from JSONB. No separate `include` parameter needed.

### Get Word by ID

```http
GET /v2/words/:id
```

Response:

```json
{
  "id": "uuid",
  "lemma": "example",
  "language": "en",
  "part_of_speech": "noun",
  "content": { "yield": {...}, "etymology": {...} }
}
```

### Check Word Existence

```http
GET /v2/words/check?word={userWord}&language={lang}
```

Response:

```json
{ "found": true, "lemma": "example", "language": "en", "data": {...} }
```

### Create Word

```http
POST /v2/words/add
```

Requires `X-Admin-Token` header.

Request body:

```json
{
  "word": "example",
  "yaml": "yield:\n  lemma: example\n  ..."
}
```

Response (201):

```json
{ "code": 201, "message": "created", "data": { "id": "uuid", "lemma": "example", "language": "en" } }
```

Response (409 conflict):

```json
{ "success": false, "code": 409, "message": "Duplicate word" }
```

### Save / Update Word

```http
POST /v2/words
```

Requires `X-Admin-Token` header.

Request body:

```json
{
  "yaml": "yield:\n  lemma: example\n  ...",
  "forceUpdate": false
}
```

Response:

```json
{ "success": true, "id": "uuid", "lemma": "example", "language": "en", "status": "created" }
```

Conflict response (when `forceUpdate` is false and data has changed):

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
```

Requires `X-Admin-Token` header.

Response:

```json
{ "success": true }
```

### Language Filtering

All v2 list/detail endpoints support `language` parameter:

- `GET /v2/words?language=en` — English words only
- `GET /v2/words?language=de` — German words only
- `GET /v2/words/details?word=see&language=de` — lookup "see" as a German word

Same lemma can exist in multiple languages (e.g. English "see" and German "See").

---

## Words (v1 API, Legacy)

The v1 API uses the old 6-table schema. It is frozen for backward compatibility only.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/words` | List English words |
| GET | `/words/details` | Get details (requires `include` param) |
| GET | `/words/:id` | Get by ID |
| POST | `/words` | Save/update word |
| POST | `/words/add` | Add word |
| DELETE | `/words/:id` | Delete word |

---

## Local Storage

### List Local Records

```http
GET /local
```

### Save to Local

```http
POST /local
```

Request body:

```json
{
  "yaml": "yield:\n  lemma: example\n  ...",
  "id": "uuid (optional)",
  "forceUpdate": false
}
```

### Delete Local Record

```http
DELETE /local/:id
```

---

## Sync

### Check Conflicts

```http
POST /sync/check
```

Request body:

```json
{ "items": [{ "id": "uuid", "raw_yaml": "..." }] }
```

### Execute Sync

```http
POST /sync/execute
```

Request body:

```json
{ "items": [{ "id": "uuid", "raw_yaml": "..." }], "forceUpdate": false }
```

---

## Config

### Get Config

```http
GET /api/core/config
```

Note: Database URL is not returned for security; only `hasDatabaseUrl: true/false`.

### Update Config

```http
POST /api/core/config
```

Requires `X-Admin-Token` header.

---

## System

### Database Status

```http
GET /status
```

Response: `{ "connected": true }`

### Health Check

```http
GET /api/core/health
```

Response: `{ "status": "ok" }`

---

## Anki Export

### Connect via AnkiConnect

```http
POST /anki/connect
```

Proxy to AnkiConnect service. Used for deck/model listing and note operations.

### Export .apkg

```http
POST /anki/export-apkg
```

Generate `.apkg` file from payloads. Returns binary stream.

### Import Word to Anki

```http
POST /words/:id/anki
```

### Check Duplicate in Anki

```http
POST /words/:id/anki/check-duplicate
```

---

## Error Handling

Error response format:

```json
{ "success": false, "code": 400, "message": "Error description" }
```

| Status | Description |
|--------|-------------|
| 200 | Success |
| 400 | Bad request |
| 401 | Unauthorized (missing admin token) |
| 403 | Forbidden (invalid admin token) |
| 404 | Not found |
| 409 | Conflict (duplicate word) |
| 422 | Unprocessable (invalid YAML) |
| 429 | Rate limited |
| 500 | Internal server error |
| 503 | Service unavailable |
