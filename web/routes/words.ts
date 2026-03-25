import type { Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

const express = require('express') as typeof import('express');
const router = express.Router();

const wordController = require('../controllers/wordController') as {
  list: (req: Request, res: Response) => Promise<void>;
  getDetails: (req: Request, res: Response) => Promise<void>;
  get: (req: Request, res: Response) => Promise<void>;
  save: (req: Request, res: Response) => Promise<void>;
  addWord: (req: Request, res: Response) => Promise<void>;
  delete: (req: Request, res: Response) => Promise<void>;
};

const { requireWriteAccess } = require('../middleware/writeAuth.ts') as {
  requireWriteAccess: (req: Request, res: Response, next: () => void) => void;
};

const { validateBody, validateQuery, validateParams } = require('../middleware/validate.ts') as {
  validateBody: (schema: ZodTypeAny) => (req: Request, res: Response, next: () => void) => void;
  validateQuery: (schema: ZodTypeAny) => (req: Request, res: Response, next: () => void) => void;
  validateParams: (schema: ZodTypeAny) => (req: Request, res: Response, next: () => void) => void;
};

const {
  WordIdParamsSchema,
  WordListQuerySchema,
  WordDetailsQuerySchema,
  SaveWordBodySchema,
  AddWordBodySchema,
} = require('../schemas/requests/words.ts') as {
  WordIdParamsSchema: ZodTypeAny;
  WordListQuerySchema: ZodTypeAny;
  WordDetailsQuerySchema: ZodTypeAny;
  SaveWordBodySchema: ZodTypeAny;
  AddWordBodySchema: ZodTypeAny;
};

// WordController methods are already wrapped by asyncHandler in controller layer.
router.get('/', validateQuery(WordListQuerySchema), (req: Request, res: Response) =>
  wordController.list(req, res)
);
router.get('/details', validateQuery(WordDetailsQuerySchema), (req: Request, res: Response) =>
  wordController.getDetails(req, res)
);
router.get('/:id', validateParams(WordIdParamsSchema), (req: Request, res: Response) =>
  wordController.get(req, res)
);
router.post(
  '/',
  requireWriteAccess,
  validateBody(SaveWordBodySchema),
  (req: Request, res: Response) => wordController.save(req, res)
);
router.post(
  '/add',
  requireWriteAccess,
  validateBody(AddWordBodySchema),
  (req: Request, res: Response) => wordController.addWord(req, res)
);
router.delete(
  '/:id',
  requireWriteAccess,
  validateParams(WordIdParamsSchema),
  (req: Request, res: Response) => wordController.delete(req, res)
);

module.exports = router;
