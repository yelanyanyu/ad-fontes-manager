import type { NextFunction, Request, Response } from 'express';

const express = require('express') as typeof import('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');

const config = require('./utils/config.ts') as {
  get: <T = unknown>(path: string, defaultValue?: T) => T;
};

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler.ts') as {
  errorHandler: (err: unknown, req: Request, res: Response, next: NextFunction) => void;
  notFoundHandler: (req: Request, res: Response) => void;
};

const { httpLogger, loggers } = require('./utils/logger.ts') as {
  httpLogger: ReturnType<typeof express.json>;
  loggers: {
    system: {
      info: (payload: Record<string, unknown>) => void;
    };
  };
};

const app = express();
const corsOrigins = config.get<string[] | string>('server.cors_origins', ['*']);
const normalizedCorsOrigins = (Array.isArray(corsOrigins) ? corsOrigins : [corsOrigins]).map(origin =>
  String(origin).trim()
);
const isCorsWildcard = normalizedCorsOrigins.includes('*');
const requestLimitPerMinute = Number(config.get<number>('server.rate_limit', 0));
const requestTimeoutMs = Number(config.get<number>('server.timeout_ms', 10000));
const rateLimitWindowMs = 60_000;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

if (config.get<boolean>('security.helmet', true)) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: config.get<boolean>('security.hsts', true),
    })
  );
}

app.use(express.json());
app.use(
  cors(
    isCorsWildcard
      ? undefined
      : {
          origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
            if (!origin || normalizedCorsOrigins.includes(origin)) {
              callback(null, true);
              return;
            }
            callback(new Error('Not allowed by CORS'));
          },
        }
  )
);

if (Number.isFinite(requestLimitPerMinute) && requestLimitPerMinute > 0) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const current = rateLimitBuckets.get(key);

    if (!current || now >= current.resetAt) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + rateLimitWindowMs });
      next();
      return;
    }

    if (current.count >= requestLimitPerMinute) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        code: 429,
        message: `Rate limit exceeded. Max ${requestLimitPerMinute} requests per minute.`,
      });
      return;
    }

    current.count += 1;
    next();
  });
}

if (Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0) {
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setTimeout(requestTimeoutMs);
    next();
  });
}

app.use(httpLogger);

app.use('/api', require('./routes/core.ts'));
app.use('/api', require('./routes/sync.ts'));
app.use('/api/words', require('./routes/words.ts'));

if (config.get<string>('core.env') === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));

  app.get('/{*splat}', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  const clientPort = config.get<number>('client.dev_port');
  app.get('/{*splat}', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.redirect(`http://localhost:${clientPort}${req.originalUrl}`);
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

const apiPort = config.get<number>('server.port');
const serverHost = config.get<string>('server.host');

const server = app.listen(apiPort, serverHost, () => {
  loggers.system.info({
    msg: `Server running on http://${serverHost}:${apiPort}`,
    port: apiPort,
    host: serverHost,
    env: config.get<string>('core.env'),
    logLevel: config.get<string>('logging.level'),
  });
});

if (Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0) {
  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = Math.max(requestTimeoutMs + 1000, 60_000);
}
