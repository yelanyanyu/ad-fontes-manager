const pino = require('pino') as typeof import('pino');
const fs = require('fs') as typeof import('fs');
const { createStream } = require('rotating-file-stream') as typeof import('rotating-file-stream');
const config = require('./config.ts') as {
  get: <T = unknown>(path: string, defaultValue?: T) => T;
};

const LOG_LEVEL = config.get('logging.level', 'info');
const LOG_DIR = config.get('logging.dir', './logs');
const LOG_ROTATION = config.get('logging.rotation', {
  interval: '1d',
  max_size: '10M',
  max_files: 30,
});
const isProduction = config.get('core.env') === 'production';

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function parseSize(sizeStr?: string): string {
  return sizeStr || '10M';
}

function parseInterval(intervalStr?: string): string {
  return intervalStr || '1d';
}

const rotatingStream = createStream('app.log', {
  interval: parseInterval((LOG_ROTATION as { interval?: string }).interval),
  size: parseSize((LOG_ROTATION as { max_size?: string }).max_size),
  compress: 'gzip',
  path: LOG_DIR,
  maxFiles: (LOG_ROTATION as { max_files?: number }).max_files || 30,
});

const errorRotatingStream = createStream('error.log', {
  interval: parseInterval((LOG_ROTATION as { interval?: string }).interval),
  size: parseSize((LOG_ROTATION as { max_size?: string }).max_size),
  compress: 'gzip',
  path: LOG_DIR,
  maxFiles: (LOG_ROTATION as { max_files?: number }).max_files || 30,
});

const baseConfig = {
  level: LOG_LEVEL,
  base: {
    pid: process.pid,
    env: config.get('core.env', 'development'),
  },
  redact: {
    paths: ['password', 'token', 'authorization', 'cookie', '*.password', '*.token'],
    remove: true,
  },
};

type PinoLogger = ReturnType<typeof pino>;
let logger: PinoLogger;

if (isProduction) {
  logger = pino(
    {
      ...baseConfig,
      formatters: {
        level: label => ({ level: String(label).toUpperCase() }),
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

const pinoHttp = require('pino-http') as (options: Record<string, unknown>) => unknown;

const httpLogger = pinoHttp({
  logger,
  customLogLevel: (_req: any, res: any, err: any) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'silent';
    return 'info';
  },
  customSuccessMessage: (req: any) => `${req.method} ${req.url} completed`,
  customErrorMessage: (req: any, res: any, err: any) =>
    `${req.method} ${req.url} failed ${res.statusCode} - ${err.message}`,
  customAttributeKeys: {
    req: 'request',
    res: 'response',
    err: 'error',
    responseTime: 'responseTimeMs',
  },
  serializers: {
    req: (req: any) => ({
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
    res: (res: any) => ({
      statusCode: res.statusCode,
    }),
  },
  genReqId: (req: any) =>
    req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
});

function createContextLogger(context: Record<string, unknown>): PinoLogger {
  return logger.child(context);
}

function createModuleLogger(module: string): PinoLogger {
  return logger.child({ module });
}

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
