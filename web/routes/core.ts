import type { NextFunction, Request, Response } from 'express';

const express = require('express') as typeof import('express');
const router = express.Router();
const appConfig = require('../utils/config.ts') as {
  get: <T = unknown>(lookupPath: string, defaultValue?: T) => T;
};
const { validateBody } = require('../middleware/validate.ts') as {
  validateBody: (schema: unknown) => (req: Request, res: Response, next: NextFunction) => void;
};
const { AnkiExportApkgBodySchema } = require('../schemas/requests/anki.ts') as {
  AnkiExportApkgBodySchema: unknown;
};
const { buildApkgBuffer, normalizeApkgFileName } = require('../services/anki/apkgService.ts') as {
  buildApkgBuffer: (input: {
    payloads: Array<{
      options: { deckName: string; modelName: string };
      fields: Record<string, string>;
      sourceWordId?: string;
      sourceLemma?: string;
    }>;
    modelFields: string[];
    selectedTemplate: { name: string; front: string; back: string };
  }) => Promise<Buffer>;
  normalizeApkgFileName: (value: string) => string;
};

const localStore = require('../localStore.ts') as {
  saveConfig: (config: Record<string, unknown>) => void;
  getConfig: () => Record<string, unknown>;
};

const { getSqlite, closeDb } = require('../db') as {
  getSqlite: () => { prepare: (sql: string) => { get: () => unknown } };
  closeDb: () => void;
};

const wordServiceV2 = require('../services/word/WordServiceV2') as {
  checkWord: (
    req: Request,
    userWord: string,
    language?: string
  ) => Promise<Record<string, unknown>>;
};

const { asyncHandler, ServiceUnavailable } = require('../utils/errors.ts') as {
  asyncHandler: <T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) => T;
  ServiceUnavailable: (message: string, data?: unknown) => Error;
};

const { createContextLogger, loggers } = require('../utils/logger.ts') as {
  createContextLogger: (context: Record<string, unknown>) => {
    info: (payload: Record<string, unknown>, message?: string) => void;
    debug: (payload: Record<string, unknown>, message?: string) => void;
    warn: (payload: Record<string, unknown>, message?: string) => void;
    error: (payload: Record<string, unknown>, message?: string) => void;
  };
  loggers: {
    db: { error: (msg: string, error?: unknown) => void };
    system: { info: (msg: string) => void };
    anki: {
      info: (payload: Record<string, unknown>, message?: string) => void;
      debug: (payload: Record<string, unknown>, message?: string) => void;
      warn: (payload: Record<string, unknown>, message?: string) => void;
      error: (payload: Record<string, unknown>, message?: string) => void;
    };
  };
};

const { requireWriteAccess } = require('../middleware/writeAuth.ts') as {
  requireWriteAccess: (req: Request, res: Response, next: NextFunction) => void;
};

const checkDbConnection = (): void => {
  const sqlite = getSqlite();
  sqlite.prepare('SELECT 1').get();
};

router.get(
  '/status',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      checkDbConnection();
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

    closeDb();
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

router.get(
  '/check',
  asyncHandler(async (req: Request, res: Response) => {
    const word = String((req.query as Record<string, unknown>).word || '');
    const language = String((req.query as Record<string, unknown>).language || 'en');
    if (!word) {
      return res.json({ found: false, error: 'word query parameter is required' });
    }
    const result = await wordServiceV2.checkWord(req, word, language);
    res.json(result);
  })
);

router.get(
  '/health',
  asyncHandler(async (_req: Request, res: Response) => {
    checkDbConnection();
    res.json({ status: 'ok' });
  })
);

router.post(
  '/anki/connect',
  asyncHandler(async (req: Request, res: Response) => {
    const host = appConfig.get<string>('anki.host');
    const port = appConfig.get<number>('anki.port');
    const upstreamUrl = `http://${host}:${port}/`;
    const requestId = (req as Request & { id?: string }).id;
    const route = req.originalUrl || req.url;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : undefined;
    const relayLogger = createContextLogger({
      module: 'anki',
      requestId,
      route,
      upstreamUrl,
    });

    relayLogger.info(
      {
        requestId,
        method: req.method,
        route,
        upstreamUrl,
        action,
      },
      'Relaying AnkiConnect request'
    );
    relayLogger.debug(
      {
        requestId,
        method: req.method,
        route,
        upstreamUrl,
        body,
      },
      'AnkiConnect request payload'
    );

    const upstream = await globalThis.fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = (await upstream.json()) as Record<string, unknown>;
    relayLogger.debug(
      {
        requestId,
        method: req.method,
        route,
        upstreamUrl,
        statusCode: upstream.status,
        response: payload,
      },
      'AnkiConnect response payload'
    );
    relayLogger.info(
      {
        requestId,
        method: req.method,
        route,
        upstreamUrl,
        statusCode: upstream.status,
        success: upstream.status >= 200 && upstream.status < 300,
      },
      'AnkiConnect request completed'
    );
    res.status(upstream.status).json(payload);
  })
);

router.post(
  '/anki/export-apkg',
  validateBody(AnkiExportApkgBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      fileName?: string;
      payloads: Array<{
        options: { deckName: string; modelName: string };
        fields: Record<string, string>;
        sourceWordId?: string;
        sourceLemma?: string;
      }>;
      modelFields: string[];
      selectedTemplate: { name: string; front: string; back: string };
    };
    const deckName = body.payloads[0]?.options.deckName || 'ad-fontes-export';
    const finalFileName = normalizeApkgFileName(body.fileName || `${deckName}.apkg`);
    const apkgBuffer = await buildApkgBuffer({
      payloads: body.payloads,
      modelFields: body.modelFields,
      selectedTemplate: body.selectedTemplate,
    });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${finalFileName}"`);
    res.setHeader('Content-Length', String(apkgBuffer.byteLength));
    res.status(200).send(apkgBuffer);
  })
);

module.exports = router;
