import type { Request, Response } from 'express';

const express = require('express') as typeof import('express');
const router = express.Router();

const localStore = require('../localStore') as {
  getAll: () => Array<Record<string, any>>;
  findByLemma: (lemma: string) => Record<string, any> | null;
  save: (yaml: string, id?: string) => string;
  delete: (id: string) => void;
};

const yaml = require('js-yaml') as { load: (content: string) => unknown };

const { getPool } = require('../db') as {
  getPool: () => Promise<{ query: (sql: string, params?: unknown[]) => Promise<unknown> }>;
};

const wordService = require('../services/wordService') as {
  checkConflict: (req: Request, yamlStr: string) => Promise<Record<string, unknown>>;
  saveWord: (req: Request, yamlStr: string, forceUpdate?: boolean) => Promise<unknown>;
};

const { asyncHandler, BadRequest } = require('../utils/errors') as {
  asyncHandler: <T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) => T;
  BadRequest: (message: string, data?: unknown) => Error;
};

const { StatusCodes } = require('http-status-codes') as {
  StatusCodes: { GONE: number };
};

const conflictService = require('../services/conflictService') as {
  analyze: (oldData: unknown, newData: unknown) => { hasConflict: boolean; diff?: unknown[] };
};

const toStringValue = (value: unknown): string => {
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
};

router.get('/local', (_req: Request, res: Response) => {
  res.json(localStore.getAll());
});

router.post(
  '/local',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { yaml?: string; id?: string; forceUpdate?: boolean };
    const yamlStr = String(body.yaml || '');
    const id = body.id;
    const forceUpdate = body.forceUpdate;

    const data = yaml.load(yamlStr) as Record<string, any>;
    const lemma = data?.yield?.lemma as string | undefined;

    if (!forceUpdate) {
      let existing: Record<string, any> | null = null;

      if (id) {
        const items = localStore.getAll();
        existing = items.find(i => i.id === id) || null;
      } else if (lemma) {
        existing = localStore.findByLemma(lemma);
      }

      if (existing) {
        const oldData = yaml.load(String(existing.raw_yaml || ''));
        const analysis = conflictService.analyze(oldData, data);

        if (analysis.hasConflict) {
          return res.json({
            status: 'conflict',
            diff: analysis.diff,
            oldData,
            newData: data,
            id: existing.id,
          });
        }

        if (!id) {
          return res.json({ success: true, id: existing.id, status: 'logged' });
        }
      }
    }

    try {
      const savedId = localStore.save(yamlStr, id);
      res.json({ success: true, id: savedId, status: id ? 'updated' : 'local_saved' });
    } catch (error) {
      const err = error as { message?: string };
      if (String(err.message || '').includes('limit reached')) {
        throw BadRequest(String(err.message || 'limit reached'), { code: 'LIMIT_REACHED' });
      }
      throw error;
    }
  })
);

router.delete('/local/:id', (req: Request, res: Response) => {
  localStore.delete(toStringValue(req.params.id));
  res.json({ success: true });
});

router.post(
  '/sync/check',
  asyncHandler(async (req: Request, res: Response) => {
    const { items } = req.body as { items?: Array<{ id: string; raw_yaml: string }> };
    if (!Array.isArray(items)) {
      throw BadRequest('Items array required');
    }

    const results: Array<Record<string, unknown>> = [];
    const pool = await getPool();
    await pool.query('SELECT 1');

    for (const item of items) {
      try {
        const check = await wordService.checkConflict(req, item.raw_yaml);
        results.push({ id: item.id, ...check });
      } catch (error) {
        const err = error as { message?: string };
        results.push({ id: item.id, status: 'error', error: err.message });
      }
    }

    res.json(results);
  })
);

router.post(
  '/sync/execute',
  asyncHandler(async (req: Request, res: Response) => {
    const { items, forceUpdate } = req.body as {
      items?: Array<{ id: string; raw_yaml: string }>;
      forceUpdate?: boolean;
    };

    if (!Array.isArray(items)) {
      throw BadRequest('Items array required');
    }

    const results: { success: number; failed: number; errors: Array<{ id: string; error?: string }> } = {
      success: 0,
      failed: 0,
      errors: [],
    };

    const pool = await getPool();
    await pool.query('SELECT 1');

    for (const item of items) {
      try {
        await wordService.saveWord(req, item.raw_yaml, forceUpdate);
        localStore.delete(item.id);
        results.success++;
      } catch (error) {
        const err = error as { message?: string };
        results.failed++;
        results.errors.push({ id: item.id, error: err.message });
      }
    }

    res.json(results);
  })
);

router.post('/sync', (_req: Request, res: Response) => {
  res.status(StatusCodes.GONE).json({ error: 'Deprecated. Use /sync/check and /sync/execute' });
});

module.exports = router;
