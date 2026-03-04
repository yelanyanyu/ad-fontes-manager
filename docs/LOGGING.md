# 后端日志系统文档

## 概述

本项目使用 **Pino** 作为后端日志框架，提供高性能、结构化的 JSON 日志输出，支持日志轮转、多级别日志记录和请求上下文追踪。

## 核心特性

- **结构化 JSON 日志**：便于 ELK Stack、Datadog 等日志聚合工具分析
- **多级别日志**：支持 `debug`、`info`、`warn`、`error`、`fatal` 级别
- **日志轮转**：按日期和大小自动轮转，自动压缩旧日志
- **上下文追踪**：支持请求 ID、用户信息等上下文数据传递
- **环境适配**：开发环境美化输出，生产环境 JSON 格式
- **敏感信息脱敏**：自动过滤密码、Token 等敏感字段

## 快速开始

### 1. 基础使用

```javascript
const { logger, loggers } = require('./utils/logger');

// 基础日志
logger.info('Server started');
logger.error({ error: err.message }, 'Database connection failed');

// 使用预创建的模块日志器
loggers.word.info({ id: 123, lemma: 'apple' }, 'Word created');
loggers.db.debug({ query: 'SELECT * FROM words' }, 'Query executed');
```

### 2. 带上下文的日志

```javascript
const { createContextLogger } = require('./utils/logger');

// 创建带上下文的子日志器
const logger = createContextLogger({
  requestId: 'req-123456',
  userId: 789,
  operation: 'saveWord',
});

logger.info('Processing request');
// 输出: { "requestId": "req-123456", "userId": 789, "operation": "saveWord", "msg": "Processing request", ... }
```

### 3. 在 Express 中使用

日志中间件已集成到 `server.js`，自动记录所有 HTTP 请求：

```javascript
const { httpLogger } = require('./utils/logger');
app.use(httpLogger);
```

## 日志级别

| 级别  | 数值 | 使用场景                     |
| ----- | ---- | ---------------------------- |
| fatal | 60   | 系统崩溃，需要立即处理       |
| error | 50   | 错误，功能无法正常工作       |
| warn  | 40   | 警告，潜在问题               |
| info  | 30   | 一般信息，正常流程记录       |
| debug | 20   | 调试信息，开发时使用         |
| trace | 10   | 最详细的追踪信息             |

## 环境变量配置

| 变量名    | 默认值    | 说明                          |
| --------- | --------- | ----------------------------- |
| LOG_LEVEL | info      | 日志级别                      |
| LOG_DIR   | ./logs    | 日志文件目录                  |
| NODE_ENV  | -         | production 启用 JSON 文件输出 |

### 配置示例

```bash
# 开发环境（控制台美化输出）
LOG_LEVEL=debug npm run dev

# 生产环境（JSON 文件输出）
NODE_ENV=production LOG_LEVEL=info npm start
```

## 日志输出

### 开发环境

使用 `pino-pretty` 美化输出：

```
INFO: Server running on http://localhost:8080
DEBUG: Adding new word {"word":"apple","wordLower":"apple"}
INFO: Word created successfully {"id":123,"lemma":"apple","word":"apple"}
```

### 生产环境

JSON 格式输出到文件：

```json
{
  "level": "INFO",
  "time": "2024-01-15T08:30:00.123Z",
  "pid": 12345,
  "host": "server-01",
  "env": "production",
  "msg": "Word created successfully",
  "id": 123,
  "lemma": "apple",
  "word": "apple"
}
```

## 日志轮转

- **应用日志**：`logs/app.log`，每天轮转，保留 30 天
- **错误日志**：`logs/error.log`，单独记录错误级别日志
- **压缩**：旧日志自动 gzip 压缩
- **大小限制**：单个日志文件最大 10MB

## 在 Service 中使用

参考 `WordService.js` 的实现：

```javascript
const { createContextLogger } = require('../../utils/logger');

async someMethod(req, data) {
  // 创建带请求上下文的日志器
  const requestId = req.id || 'unknown';
  const logger = createContextLogger({
    requestId,
    operation: 'someMethod',
    entity: data.id,
  });

  logger.debug({ data }, 'Starting operation');

  try {
    // 业务逻辑
    logger.info({ result }, 'Operation completed');
    return result;
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
    }, 'Operation failed');
    throw error;
  }
}
```

## HTTP 请求日志

自动记录所有请求：

```json
{
  "level": "INFO",
  "request": {
    "id": "req-abc123",
    "method": "POST",
    "url": "/api/words",
    "headers": {
      "user-agent": "Mozilla/5.0...",
      "x-request-id": "req-abc123"
    }
  },
  "response": {
    "statusCode": 200
  },
  "responseTimeMs": 45,
  "msg": "POST /api/words completed 200"
}
```

## 敏感信息脱敏

以下字段会自动从日志中移除：

- `password`
- `token`
- `authorization`
- `cookie`
- `*.password`
- `*.token`

## 最佳实践

1. **始终使用上下文日志器**：便于追踪请求链路
2. **选择合适的日志级别**：避免生产环境输出过多 debug 日志
3. **记录关键信息**：包括操作对象 ID、操作结果等
4. **错误日志包含堆栈**：便于问题定位
5. **不要记录敏感信息**：依赖自动脱敏，但也要注意手动添加的字段

## 故障排查

### 日志不输出

检查 `LOG_LEVEL` 设置是否过高

### 日志文件未生成

检查 `LOG_DIR` 目录是否有写入权限

### 生产环境日志格式错误

确认 `NODE_ENV=production` 已设置

## 集成 ELK Stack

生产环境的 JSON 格式日志可直接被 Filebeat 收集：

```yaml
# filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /path/to/logs/*.log
    json.keys_under_root: true
    json.add_error_key: true
```

## 更多信息

- [Pino 官方文档](https://getpino.io/)
- [Pino HTTP 中间件](https://github.com/pinojs/pino-http)
- [日志轮转](https://github.com/iccicci/rotating-file-stream)
