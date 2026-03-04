/**
 * ============================================================================
 * Logger - Pino-based Structured Logging Module
 * ============================================================================
 *
 * 【功能简介】
 * 本模块提供基于 Pino 的结构化日志功能，支持 JSON 格式输出、日志轮转、
 * 多级别日志记录，以及请求上下文追踪。
 *
 * 【核心特性】
 * 1. 结构化 JSON 日志 - 便于 ELK Stack、Datadog 等工具分析
 * 2. 日志级别管理 - debug/info/warn/error/fatal
 * 3. 日志轮转 - 按日期和大小自动轮转
 * 4. 上下文传递 - 支持请求 ID、用户信息等追踪
 * 5. 环境适配 - 开发环境美化输出，生产环境 JSON 格式
 *
 * 【使用方式】
 * const { logger, httpLogger } = require('./utils/logger');
 *
 * // 基础日志
 * logger.info('Server started');
 * logger.error({ error: err.message }, 'Database connection failed');
 *
 * // 带上下文的日志
 * const childLogger = logger.child({ requestId: 'uuid', userId: 123 });
 * childLogger.info('Processing request');
 *
 * 【配置来源】
 * - 统一配置文件 (config.yml) 中的 logging 部分
 * - 环境变量 (AD_FONTES_LOG_LEVEL, AD_FONTES_LOG_DIR)
 * - 代码中的安全默认值
 * ============================================================================
 */

const pino = require('pino');
const fs = require('fs');
const { createStream } = require('rotating-file-stream');
const config = require('./config');

// 日志配置（从统一配置读取）
const LOG_LEVEL = config.get('logging.level', 'info');
const LOG_DIR = config.get('logging.dir', './logs');
const LOG_ROTATION = config.get('logging.rotation', {
  interval: '1d',
  max_size: '10M',
  max_files: 30,
});
const isProduction = config.get('core.env') === 'production';

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 解析轮转大小
function parseSize(sizeStr) {
  if (!sizeStr) return '10M';
  return sizeStr;
}

// 解析轮转间隔
function parseInterval(intervalStr) {
  if (!intervalStr) return '1d';
  return intervalStr;
}

// 日志轮转配置
const rotatingStream = createStream('app.log', {
  interval: parseInterval(LOG_ROTATION.interval),
  size: parseSize(LOG_ROTATION.max_size),
  compress: 'gzip',
  path: LOG_DIR,
  maxFiles: LOG_ROTATION.max_files || 30,
});

// 错误日志单独轮转
const errorRotatingStream = createStream('error.log', {
  interval: parseInterval(LOG_ROTATION.interval),
  size: parseSize(LOG_ROTATION.max_size),
  compress: 'gzip',
  path: LOG_DIR,
  maxFiles: LOG_ROTATION.max_files || 30,
});

// 基础配置
const baseConfig = {
  level: LOG_LEVEL,
  base: {
    pid: process.pid,
    env: config.get('core.env', 'development'),
  },
  //  redact 敏感字段
  redact: {
    paths: ['password', 'token', 'authorization', 'cookie', '*.password', '*.token'],
    remove: true,
  },
};

// 根据环境选择输出格式
let logger;

if (isProduction) {
  // 生产环境：JSON 格式 + 文件轮转
  logger = pino(
    {
      ...baseConfig,
      formatters: {
        level: label => ({ level: label.toUpperCase() }),
        bindings: bindings => ({
          pid: bindings.pid,
          host: bindings.hostname,
        }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream([
      { stream: rotatingStream, level: 'info' },
      { stream: errorRotatingStream, level: 'error' },
      { stream: process.stdout, level: LOG_LEVEL },
    ])
  );
} else {
  // 开发环境：美化格式 + 控制台输出
  logger = pino({
    ...baseConfig,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    },
  });
}

/**
 * HTTP 请求日志中间件配置
 * 使用 pino-http 记录所有 HTTP 请求
 */
const httpLogger = require('pino-http')({
  logger,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'silent';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} completed ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} failed ${res.statusCode} - ${err.message}`;
  },
  customAttributeKeys: {
    req: 'request',
    res: 'response',
    err: 'error',
    responseTime: 'responseTimeMs',
  },
  // 序列化请求信息
  serializers: {
    req: req => ({
      id: req.id,
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-request-id': req.headers['x-request-id'],
        'x-user-id': req.headers['x-user-id'],
      },
      remoteAddress: req.remoteAddress,
    }),
    res: res => ({
      statusCode: res.statusCode,
    }),
  },
  // 生成请求 ID
  genReqId: req => {
    return (
      req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
  },
});

/**
 * 创建带上下文的子日志器
 * @param {Object} context - 上下文对象，如 { requestId, userId, operation }
 * @returns {Object} 子日志器
 */
function createContextLogger(context) {
  return logger.child(context);
}

/**
 * 按模块创建日志器
 * @param {string} module - 模块名称
 * @returns {Object} 模块日志器
 */
function createModuleLogger(module) {
  return logger.child({ module });
}

// 预创建的模块日志器
const loggers = {
  word: createModuleLogger('word'),
  sync: createModuleLogger('sync'),
  db: createModuleLogger('db'),
  api: createModuleLogger('api'),
  auth: createModuleLogger('auth'),
  system: createModuleLogger('system'),
};

module.exports = {
  logger,
  httpLogger,
  createContextLogger,
  createModuleLogger,
  loggers,
};
