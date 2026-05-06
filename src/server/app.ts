import type { Express, NextFunction, Request, Response } from 'express';

const express = require('express') as typeof import('express');
const path = require('node:path') as typeof import('node:path');
const cors = require('cors') as typeof import('cors');
const helmet = require('helmet') as typeof import('helmet').default;

const config = require('./utils/config') as {
  get: <T = unknown>(path: string, defaultValue?: T) => T;
};

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler') as {
  errorHandler: (err: unknown, req: Request, res: Response, next: NextFunction) => void;
  notFoundHandler: (req: Request, res: Response) => void;
};

const { httpLogger } = require('./utils/logger') as {
  httpLogger: ReturnType<typeof express.json>;
};

export interface CreateAppOptions {
  dbPath: string;
  isProduction: boolean;
  distDir?: string;
  redirectToClient?: boolean;
}

export function createApp(options: CreateAppOptions): Express {
  process.env.DATABASE_URL = options.dbPath;

  const app = express();
  const corsOrigins = config.get<string[] | string>('server.cors_origins', ['*']);
  const normalizedCorsOrigins = (Array.isArray(corsOrigins) ? corsOrigins : [corsOrigins]).map(
    origin => String(origin).trim()
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

  app.use(express.json({ limit: '50mb' }));
  app.use(
    cors(
      isCorsWildcard
        ? undefined
        : {
            origin: (
              origin: string | undefined,
              callback: (error: Error | null, allow?: boolean) => void
            ) => {
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

  app.use('/api', require('./routes/core'));
  app.use('/api', require('./routes/announcement'));
  app.use('/api/v2/words', require('./routes/wordsV2'));
  app.use('/api/v2', require('./routes/aiConfig'));

  if (options.isProduction && options.distDir) {
    app.use(express.static(options.distDir));

    app.get('/{*splat}', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(options.distDir as string, 'index.html'));
    });
  } else if (options.redirectToClient) {
    const clientPort = config.get<number>('client.dev_port', 5173);
    app.get('/{*splat}', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.redirect(`http://localhost:${clientPort}${req.originalUrl}`);
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
