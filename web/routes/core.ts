import type { NextFunction, Request, Response } from 'express';

const express = require('express') as typeof import('express');
const router = express.Router();
const appConfig = require('../utils/config.ts') as {
  get: <T = unknown>(lookupPath: string, defaultValue?: T) => T;
};

const localStore = require('../localStore.ts') as {
  saveConfig: (config: Record<string, unknown>) => void;
  getConfig: () => Record<string, unknown>;
};

const { getPool, resetPool } = require('../db') as {
  getPool: () => Promise<{ query: (sql: string, params?: unknown[]) => Promise<unknown> }>;
  resetPool: () => Promise<void>;
};

const { asyncHandler, ServiceUnavailable } = require('../utils/errors.ts') as {
  asyncHandler: <T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) => T;
  ServiceUnavailable: (message: string, data?: unknown) => Error;
};

const { loggers } = require('../utils/logger.ts') as {
  loggers: {
    db: { error: (msg: string, error?: unknown) => void };
    system: { info: (msg: string) => void };
  };
};

const { requireWriteAccess } = require('../middleware/writeAuth.ts') as {
  requireWriteAccess: (req: Request, res: Response, next: NextFunction) => void;
};

router.get(
  '/status',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const pool = await getPool();
      await pool.query('SELECT 1');
      res.json({ connected: true });
    } catch (error) {
      const err = error as { message?: string };
      loggers.db.error('Database status check failed:', err.message);
      throw ServiceUnavailable('Database unavailable', {
        connected: false,
        route: req.originalUrl || req.url,
      });
    }
  })
);

router.post(
  '/config',
  requireWriteAccess,
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
    const localConfig = localStore.getConfig();
    const safeConfig = {
      MAX_LOCAL_ITEMS: localConfig.MAX_LOCAL_ITEMS,
      API_PORT: localConfig.API_PORT,
      CLIENT_DEV_PORT: localConfig.CLIENT_DEV_PORT,
      hasDatabaseUrl: !!appConfig.get<string | null>('database.url', null),
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

