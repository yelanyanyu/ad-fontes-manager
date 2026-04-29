import type { Request, Response } from 'express';
import type { ZodType } from 'zod';

const express = require('express') as typeof import('express');
const router = express.Router();

const wordControllerV2 = require('../controllers/wordControllerV2') as {
  list: (req: Request, res: Response) => Promise<void>;
  getDetails: (req: Request, res: Response) => Promise<void>;
  get: (req: Request, res: Response) => Promise<void>;
  check: (req: Request, res: Response) => Promise<void>;
  save: (req: Request, res: Response) => Promise<void>;
  addWord: (req: Request, res: Response) => Promise<void>;
  delete: (req: Request, res: Response) => Promise<void>;
};

const { requireWriteAccess } = require('../middleware/writeAuth.ts') as {
  requireWriteAccess: (req: Request, res: Response, next: () => void) => void;
};

const { validateBody, validateQuery, validateParams } = require('../middleware/validate.ts') as {
  validateBody: (schema: ZodType<unknown>) => (req: Request, res: Response, next: () => void) => void;
  validateQuery: (schema: ZodType<unknown>) => (req: Request, res: Response, next: () => void) => void;
  validateParams: (schema: ZodType<unknown>) => (req: Request, res: Response, next: () => void) => void;
};

const {
  WordIdParamsSchema,
  WordListQuerySchemaV2,
  WordDetailsQuerySchemaV2,
  SaveWordBodySchema,
  AddWordBodySchema,
} = require('../schemas/requests/words.ts') as {
  WordIdParamsSchema: ZodType<unknown>;
  WordListQuerySchemaV2: ZodType<unknown>;
  WordDetailsQuerySchemaV2: ZodType<unknown>;
  SaveWordBodySchema: ZodType<unknown>;
  AddWordBodySchema: ZodType<unknown>;
};

// v2 API — single-table JSONB storage, language-aware
router.get('/', validateQuery(WordListQuerySchemaV2), (req: Request, res: Response) =>
  wordControllerV2.list(req, res)
);
router.get('/details', validateQuery(WordDetailsQuerySchemaV2), (req: Request, res: Response) =>
  wordControllerV2.getDetails(req, res)
);
router.get('/check', (req: Request, res: Response) =>
  wordControllerV2.check(req, res)
);
router.get('/:id', validateParams(WordIdParamsSchema), (req: Request, res: Response) =>
  wordControllerV2.get(req, res)
);
router.post(
  '/',
  requireWriteAccess,
  validateBody(SaveWordBodySchema),
  (req: Request, res: Response) => wordControllerV2.save(req, res)
);
router.post(
  '/add',
  requireWriteAccess,
  validateBody(AddWordBodySchema),
  (req: Request, res: Response) => wordControllerV2.addWord(req, res)
);
router.delete(
  '/:id',
  requireWriteAccess,
  validateParams(WordIdParamsSchema),
  (req: Request, res: Response) => wordControllerV2.delete(req, res)
);

module.exports = router;
