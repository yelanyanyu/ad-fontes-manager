import type { NextFunction, Request, Response } from 'express';

const express = require('express') as typeof import('express');
const os = require('node:os') as typeof import('node:os');
const path = require('node:path') as typeof import('node:path');
const fs = require('node:fs/promises') as typeof import('node:fs/promises');
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

const { asyncHandler, ServiceUnavailable, BadRequest } = require('../utils/errors.ts') as {
  asyncHandler: <T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) => T;
  ServiceUnavailable: (message: string, data?: unknown) => Error;
  BadRequest: (message: string, data?: unknown) => Error;
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
      rateLimitPerMinute: Number(appConfig.get<number>('server.rate_limit', 0)),
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

router.post(
  '/anki/connect',
  asyncHandler(async (req: Request, res: Response) => {
    const host = appConfig.get<string>('anki.host', '127.0.0.1');
    const port = appConfig.get<number>('anki.port', 8765);
    const upstreamUrl = `http://${host}:${port}/`;

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body ?? {}),
    });

    const payload = (await upstream.json()) as Record<string, unknown>;
    res.status(upstream.status).json(payload);
  })
);

router.post(
  '/anki/export-apkg',
  asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      deckName?: string;
      modelName?: string;
      includeSched?: boolean;
      fileName?: string;
    };
    const deckName = (body.deckName || '').trim();

    if (!deckName) {
      throw BadRequest('deckName is required for apkg export');
    }

    const host = appConfig.get<string>('anki.host', '127.0.0.1');
    const port = appConfig.get<number>('anki.port', 8765);
    const upstreamUrl = `http://${host}:${port}/`;

    const safeFileName = (body.fileName || `${deckName}.apkg`)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    const finalFileName = safeFileName.toLowerCase().endsWith('.apkg')
      ? safeFileName
      : `${safeFileName}.apkg`;
    const tempPath = path.join(
      os.tmpdir(),
      `ad-fontes-${Date.now()}-${Math.random().toString(36).slice(2)}.apkg`
    );

    try {
      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'exportPackage',
          version: 6,
          params: {
            deck: deckName,
            path: tempPath,
            includeSched: Boolean(body.includeSched),
          },
        }),
      });

      const ankiResult = (await upstream.json()) as {
        result?: boolean;
        error?: string | null;
      };
      if (!upstream.ok) {
        throw ServiceUnavailable('AnkiConnect request failed', {
          status: upstream.status,
          result: ankiResult,
        });
      }
      if (ankiResult.error) {
        throw BadRequest(`AnkiConnect error: ${ankiResult.error}`);
      }
      if (!ankiResult.result) {
        throw ServiceUnavailable('AnkiConnect exportPackage returned false');
      }

      const apkgBuffer = await fs.readFile(tempPath);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${finalFileName}"`);
      res.setHeader('Content-Length', String(apkgBuffer.byteLength));
      res.status(200).send(apkgBuffer);
    } finally {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  })
);

module.exports = router;

