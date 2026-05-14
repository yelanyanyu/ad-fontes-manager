import type { NextFunction, Request, Response } from 'express';

const express = require('express') as typeof import('express');
const router = express.Router();
const appConfig = require('../utils/config') as {
  get: <T = unknown>(lookupPath: string, defaultValue?: T) => T;
};
const { validateBody } = require('../middleware/validate') as {
  validateBody: (schema: unknown) => (req: Request, res: Response, next: NextFunction) => void;
};
const { AnkiExportApkgBodySchema } = require('../schemas/requests/anki') as {
  AnkiExportApkgBodySchema: unknown;
};
const { AnkiExportApkgByIdsBodySchema } = require('../schemas/requests/anki') as {
  AnkiExportApkgByIdsBodySchema: unknown;
};
const { buildApkgBuffer, normalizeApkgFileName } = require('../services/anki/apkgService') as {
  buildApkgBuffer: (input: {
    payloads: Array<{
      options: { deckName: string; modelName: string };
      fields: Record<string, string>;
      sourceWordId?: string;
      sourceLemma?: string;
    }>;
    modelFields: string[];
    selectedTemplate: { name: string; front: string; back: string };
    css: string;
  }) => Promise<Buffer>;
  normalizeApkgFileName: (value: string) => string;
};

const { getSqlite, closeDb } = require('../db') as {
  getSqlite: () => {
    prepare: (sql: string) => {
      get: () => unknown;
      all: (...params: unknown[]) => unknown[];
    };
  };
  closeDb: () => void;
};

const { buildAnkiFields } = require('../services/anki/fieldExtractor') as {
  buildAnkiFields: (
    data: Record<string, unknown>,
    mapping: Array<{ source: string; target: string }>
  ) => Record<string, string>;
};

const wordServiceV2 = require('../services/word/WordServiceV2') as {
  checkWord: (
    req: Request,
    userWord: string,
    language?: string
  ) => Promise<Record<string, unknown>>;
};

const { asyncHandler, BadRequest, ServiceUnavailable } = require('../utils/errors') as {
  asyncHandler: <T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) => T;
  BadRequest: (message: string, data?: unknown) => Error;
  ServiceUnavailable: (message: string, data?: unknown) => Error;
};

const { createContextLogger, loggers } = require('../utils/logger') as {
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

const { requireWriteAccess } = require('../middleware/writeAuth') as {
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

    if (typeof body.database_url === 'string' && body.database_url.trim()) {
      process.env.DATABASE_URL = body.database_url.trim();
    }
    if (body.MAX_LOCAL_ITEMS !== undefined && body.MAX_LOCAL_ITEMS !== null) {
      process.env.MAX_LOCAL_ITEMS = String(body.MAX_LOCAL_ITEMS);
    }

    closeDb();
    loggers.system.info('Database configuration updated');

    res.json({ success: true });
  })
);

router.get(
  '/config',
  asyncHandler(async (_req: Request, res: Response) => {
    const safeConfig = {
      MAX_LOCAL_ITEMS: Number(appConfig.get<number>('storage.max_items', 100)),
      API_PORT: Number(appConfig.get<number>('server.port', 8080)),
      CLIENT_DEV_PORT: Number(appConfig.get<number>('client.dev_port', 5173)),
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

router.get(
  '/version',
  asyncHandler(async (_req: Request, res: Response) => {
    let version = '0.0.0';
    try {
      const pkg = require('../../../package.json') as {
        version?: string;
      };
      version = pkg.version || version;
    } catch {
      // Return the fallback version.
    }
    const year = new Date().getFullYear();
    res.json({
      version,
      copyright: `Copyright © ${year} yelanyanyu(Github)`,
    });
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
      css: string;
    };
    const deckName = body.payloads[0]?.options.deckName || 'ad-fontes-export';
    const finalFileName = normalizeApkgFileName(body.fileName || `${deckName}.apkg`);
    const apkgBuffer = await buildApkgBuffer({
      payloads: body.payloads,
      modelFields: body.modelFields,
      selectedTemplate: body.selectedTemplate,
      css: body.css,
    });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${finalFileName}"`);
    res.setHeader('Content-Length', String(apkgBuffer.byteLength));
    res.status(200).send(apkgBuffer);
  })
);

type WordV2ExportRow = {
  id: string;
  lemma?: string;
  content: string | Record<string, unknown>;
};

const parseWordContent = (value: string | Record<string, unknown>): Record<string, unknown> => {
  if (typeof value !== 'string') return value;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid words_v2 content JSON');
  }
  return parsed as Record<string, unknown>;
};

const queryWordsV2ByIds = (wordIds: string[]): WordV2ExportRow[] => {
  const sqlite = getSqlite();
  const rows: WordV2ExportRow[] = [];
  const chunkSize = 500;

  for (let start = 0; start < wordIds.length; start += chunkSize) {
    const chunk = wordIds.slice(start, start + chunkSize);
    const placeholders = chunk.map(() => '?').join(', ');
    const chunkRows = sqlite
      .prepare(`SELECT id, lemma, content FROM words_v2 WHERE id IN (${placeholders})`)
      .all(...chunk) as WordV2ExportRow[];
    rows.push(...chunkRows);
  }

  const rowsById = new Map(rows.map(row => [String(row.id), row]));
  return wordIds.map(id => rowsById.get(id)).filter((row): row is WordV2ExportRow => Boolean(row));
};

router.post(
  '/anki/export-apkg-by-ids',
  validateBody(AnkiExportApkgByIdsBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      fileName?: string;
      wordIds: string[];
      fieldMapping: Array<{ source: string; target: string }>;
      options: { deckName: string; modelName: string; tags: string[] };
      modelFields: string[];
      selectedTemplate: { name: string; front: string; back: string };
      css: string;
    };

    const rows = queryWordsV2ByIds(body.wordIds);
    if (rows.length !== body.wordIds.length) {
      const foundIds = new Set(rows.map(row => String(row.id)));
      const missingIds = body.wordIds.filter(id => !foundIds.has(id));
      throw BadRequest('Some requested words were not found', {
        code: 'WORDS_NOT_FOUND',
        missingIds,
      });
    }

    const payloads = rows.map(row => {
      const content = parseWordContent(row.content);
      const yieldRecord = content.yield as Record<string, unknown> | undefined;
      const sourceLemma = String(yieldRecord?.lemma || row.lemma || row.id);

      return {
        fields: buildAnkiFields(content, body.fieldMapping),
        options: body.options,
        sourceWordId: row.id,
        sourceLemma,
      };
    });

    const finalFileName = normalizeApkgFileName(
      body.fileName || `${body.options.deckName || 'ad-fontes-export'}.apkg`
    );
    const apkgBuffer = await buildApkgBuffer({
      payloads,
      modelFields: body.modelFields,
      selectedTemplate: body.selectedTemplate,
      css: body.css,
    });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${finalFileName}"`);
    res.setHeader('Content-Length', String(apkgBuffer.byteLength));
    res.status(200).send(apkgBuffer);
  })
);

module.exports = router;
