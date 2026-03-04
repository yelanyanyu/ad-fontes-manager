# API 文档

Ad Fontes Manager REST API 文档

## 基础信息

- **基础 URL**: `http://localhost:8080/api`
- **内容类型**: `application/json`

## 单词管理

### 获取单词列表

```http
GET /words?page={page}&limit={limit}&search={keyword}&sort={sort}
```

**参数:**

| 名称 | 类型 | 必需 | 描述 |
|------|------|------|------|
| page | number | 否 | 页码，默认 1 |
| limit | number | 否 | 每页数量，默认 20 |
| search | string | 否 | 搜索关键词 |
| sort | string | 否 | 排序方式: `newest`, `oldest`, `alpha` |

**响应:**

```json
{
  "items": [
    {
      "id": "uuid",
      "lemma": "example",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

### 获取单词详情

```http
GET /words/:id
```

**参数:**

| 名称 | 类型 | 必需 | 描述 |
|------|------|------|------|
| id | string | 是 | 单词 UUID |

**响应:**

```json
{
  "id": "uuid",
  "lemma": "example",
  "etymology": { ... },
  "original_yaml": "..."
}
```

### 创建/更新单词

```http
POST /words
```

**请求体:**

```json
{
  "yaml": "yield:\n  lemma: example\n  ..."
}
```

**响应:**

```json
{
  "success": true,
  "id": "uuid"
}
```

### 删除单词

```http
DELETE /words/:id
```

**响应:**

```json
{
  "success": true
}
```

## 本地存储

### 获取本地记录

```http
GET /local
```

**响应:**

```json
[
  {
    "id": "uuid",
    "raw_yaml": "...",
    "updated_at": 1234567890
  }
]
```

### 保存到本地

```http
POST /local
```

**请求体:**

```json
{
  "yaml": "yield:\n  lemma: example\n  ...",
  "id": "uuid (可选)",
  "forceUpdate": false
}
```

**响应:**

```json
// 成功
{
  "success": true,
  "id": "uuid",
  "status": "local_saved"
}

// 冲突
{
  "status": "conflict",
  "diff": { ... },
  "oldData": { ... },
  "newData": { ... }
}
```

### 删除本地记录

```http
DELETE /local/:id
```

## 同步

### 检查冲突

```http
POST /sync/check
```

**请求体:**

```json
{
  "items": [
    { "id": "uuid", "raw_yaml": "..." }
  ]
}
```

**响应:**

```json
[
  {
    "id": "uuid",
    "status": "conflict|new|identical",
    "diff": { ... }
  }
]
```

### 执行同步

```http
POST /sync/execute
```

**请求体:**

```json
{
  "items": [
    { "id": "uuid", "raw_yaml": "..." }
  ],
  "forceUpdate": false
}
```

**响应:**

```json
{
  "success": 5,
  "failed": 0,
  "errors": []
}
```

## 配置管理

### 获取配置

```http
GET /config
```

**响应:**

```json
{
  "API_PORT": 8080,
  "CLIENT_DEV_PORT": 5173,
  "MAX_LOCAL_ITEMS": 100
}
```

### 更新配置

```http
POST /config
```

**请求头:**

```
X-Admin-Token: <your-admin-token>
```

**请求体:**

```json
{
  "database_url": "postgresql://...",
  "MAX_LOCAL_ITEMS": 100
}
```

**响应:**

```json
{
  "success": true
}
```

## 系统状态

### 检查数据库连接

```http
GET /status
```

**响应:**

```json
{
  "connected": true
}
```

### 健康检查

```http
GET /health
```

**响应:**

```json
{
  "status": "ok"
}
```

## 错误处理

### 错误响应格式

```json
{
  "success": false,
  "code": 400,
  "message": "错误描述"
}
```

### 状态码

| 状态码 | 描述 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 404 | 资源不存在 |
| 410 | 接口已废弃 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 |
