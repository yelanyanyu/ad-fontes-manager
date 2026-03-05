import type { NextFunction, Request, Response } from 'express';

const express = require('express') as typeof import('express');
const router = express.Router();

const localStore = require('../localStore') as {
  saveConfig: (config: Record<string, unknown>) => void;
  getConfig: () => Record<string, unknown>;
};

const { getPool, resetPool } = require('../db') as {
  getPool: () => Promise<{ query: (sql: string, params?: unknown[]) => Promise<unknown> }>;
  resetPool: () => Promise<void>;
};

const { asyncHandler, Unauthorized, ServiceUnavailable } = require('../utils/errors.ts') as {
  asyncHandler: <T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) => T;
  Unauthorized: (message: string) => Error;
  ServiceUnavailable: (message: string) => Error;
};

const { loggers } = require('../utils/logger.ts') as {
  loggers: {
    auth: { error: (msg: string) => void; warn: (msg: string) => void };
    db: { error: (msg: string, error?: unknown) => void };
    system: { info: (msg: string) => void };
  };
};

const requireAdminAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const isProduction = process.env.NODE_ENV === 'production';
  const adminToken = process.env.ADMIN_TOKEN;
  const requestToken = req.headers['x-admin-token'];

  if (isProduction) {
    if (!adminToken) {
      loggers.auth.error('[Security] ADMIN_TOKEN not configured in production');
      throw ServiceUnavailable('Service unavailable: admin authentication not configured');
    }

    if (requestToken !== adminToken) {
      loggers.auth.warn(`[Security] Unauthorized config access attempt from ${req.ip}`);
      throw Unauthorized('Unauthorized: invalid admin token');
    }
  } else if (adminToken && requestToken !== adminToken) {
    loggers.auth.warn(`[Security] Unauthorized config access attempt from ${req.ip} (dev mode)`);
    throw Unauthorized('Unauthorized: invalid admin token');
  }

  next();
};

router.get(
  '/status',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      const pool = await getPool();
      await pool.query('SELECT 1');
      res.json({ connected: true });
    } catch (error) {
      const err = error as { message?: string };
      loggers.db.error('Database status check failed:', err.message);
      res.json({ connected: false, error: err.message });
    }
  })
);

router.post(
  '/config',
  requireAdminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as {
      database_url?: string;
      MAX_LOCAL_ITEMS?: number;
    };

    localStore.saveConfig({
      DATABASE_URL: body.database_url,
      MAX_LOCAL_ITEMS: body.MAX_LOCAL_ITEMS,
    });

    await resetPool();
    loggers.system.info('Database configuration updated');

    res.json({ success: true });
  })
);

router.get(
  '/config',
  asyncHandler(async (_req: Request, res: Response) => {
    const config = localStore.getConfig();
    const safeConfig = {
      MAX_LOCAL_ITEMS: config.MAX_LOCAL_ITEMS,
      API_PORT: config.API_PORT,
      CLIENT_DEV_PORT: config.CLIENT_DEV_PORT,
      hasDatabaseUrl: !!(config.DATABASE_URL || process.env.DATABASE_URL),
    };
    res.json(safeConfig);
  })
);

const wordController = require('../controllers/wordController') as {
  check: (req: Request, res: Response) => Promise<void>;
};
router.get('/check', (req: Request, res: Response) => wordController.check(req, res));

router.get(
  '/health',
  asyncHandler(async (_req: Request, res: Response) => {
    const pool = await getPool();
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  })
);

module.exports = router;
