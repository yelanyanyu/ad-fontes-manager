# 日志系统

## 概述

使用 **Pino** 作为日志框架，提供结构化 JSON 日志输出，支持日志轮转、多级别记录和请求追踪。

## 核心特性

- 结构化 JSON 日志，便于 ELK / Datadog 等聚合分析
- 多级别：`debug` / `info` / `warn` / `error` / `fatal`
- 日志轮转：按日期和大小自动轮转，旧日志自动 gzip 压缩
- 请求上下文追踪（requestId、userId、operation）
- 开发环境美化输出（pino-pretty），生产环境 JSON 文件输出
- 敏感信息自动脱敏

## 基础使用

```typescript
import { logger } from './utils/logger';

logger.info('Server started');
logger.error({ error: err.message }, 'Database connection failed');
```

带上下文的日志器：

```typescript
import { createContextLogger } from './utils/logger';

const log = createContextLogger({
  requestId: 'req-abc123',
  operation: 'saveWord',
});

log.debug({ lemma: 'example' }, 'Processing word');
```

## 日志级别

| 级别  | 数值 | 使用场景         |
| ----- | ---- | ---------------- |
| fatal | 60   | 系统崩溃         |
| error | 50   | 功能无法正常工作 |
| warn  | 40   | 潜在问题         |
| info  | 30   | 正常流程记录     |
| debug | 20   | 开发调试信息     |
| trace | 10   | 最详细追踪       |

## 环境变量

| 变量                     | 默认值   | 说明         |
| ------------------------ | -------- | ------------ |
| `LOG_LEVEL`              | `info`   | 日志级别     |
| `LOG_DIR`                | `./logs` | 日志文件目录 |
| `LOG_ROTATION_INTERVAL`  | `1d`     | 切分周期     |
| `LOG_ROTATION_MAX_SIZE`  | `10M`    | 单文件上限   |
| `LOG_ROTATION_MAX_FILES` | `30`     | 保留文件数   |

## HTTP 请求日志

Express 中间件自动记录所有 HTTP 请求，包含 method、URL、statusCode、responseTimeMs。敏感字段（password、token、authorization、cookie）自动脱敏。

## 最佳实践

1. 使用带上下文的子日志器追踪请求链路
2. 选择合适的日志级别，生产环境避免过多 debug 日志
3. 错误日志包含 stack trace
4. 不要手动记录密码、token 等敏感信息

## 更多信息

- [Pino 官方文档](https://getpino.io/)
