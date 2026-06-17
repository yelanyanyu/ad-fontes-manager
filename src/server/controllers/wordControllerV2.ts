import type { Request, Response } from 'express';
import { saveWordWithProvenance } from '../services/word/WordSaveProvenance';

const wordServiceV2 = require('../services/word/WordServiceV2') as {
  listWords: (req: Request) => Promise<unknown>;
  getWordDetails: (req: Request, word: string, language: string) => Promise<unknown>;
  getWordById: (req: Request, id: string) => Promise<unknown>;
  checkWord: (req: Request, userWord: string, language: string) => Promise<unknown>;
  saveWord: (
    req: Request,
    yamlStr: string,
    forceUpdate?: boolean,
    options?: { source?: 'import' }
  ) => Promise<Record<string, unknown>>;
  addWord: (req: Request, word: string, yamlStr: string) => Promise<Record<string, unknown>>;
  deleteWord: (req: Request, id: string) => Promise<unknown>;
  validateYaml: (
    req: Request,
    yamlStr: string,
    options?: {
      repair?: boolean;
      intent?: 'create' | 'update-existing';
      wordId?: string | number | null;
      baseWordSchemaVersion?: number | null;
    }
  ) => Promise<{ valid: boolean; errors: string[]; language?: string }>;
};
const { getQueue } = require('../services/ai/queue') as {
  getQueue: () => {
    markWorksetJobSynced: (
      jobId: string,
      wordId: string
    ) => 'updated' | 'not-found' | 'word-not-found';
  };
};

const { asyncHandler, BadRequest } = require('../utils/errors') as {
  asyncHandler: <T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) => T;
  BadRequest: (message: string, data?: unknown) => Error;
};

const { logger } = require('../utils/logger') as {
  logger: { debug: (obj: unknown, msg?: string) => void };
};

const toStringValue = (value: unknown): string => {
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
};

interface RequestWithValidatedQuery extends Request {
  validatedQuery?: Record<string, unknown>;
}

const getQuery = (req: Request): Record<string, unknown> =>
  (req as RequestWithValidatedQuery).validatedQuery || (req.query as Record<string, unknown>) || {};

class WordControllerV2 {
  list = asyncHandler(async (req: Request, res: Response) => {
    const words = await wordServiceV2.listWords(req);
    res.json(words);
  });

  getDetails = asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req);
    const word = toStringValue(query.word).trim();
    if (!word) {
      throw BadRequest('Word parameter required');
    }

    const language = toStringValue(query.language).trim() || 'en';
    const data = await wordServiceV2.getWordDetails(req, word, language);
    res.status(200).json({ code: 200, message: 'success', data });
  });

  get = asyncHandler(async (req: Request, res: Response) => {
    const word = await wordServiceV2.getWordById(req, toStringValue(req.params.id));
    res.json(word);
  });

  check = asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery(req);
    const userWord = toStringValue(query.word);
    if (!userWord) {
      throw BadRequest('Word parameter required');
    }

    const language = toStringValue(query.language).trim() || 'en';
    const result = await wordServiceV2.checkWord(req, userWord, language);
    res.json(result);
  });

  save = asyncHandler(async (req: Request, res: Response) => {
    const {
      yaml: yamlStr,
      forceUpdate,
      sourceJobId,
    } = req.body as {
      yaml?: string;
      forceUpdate?: boolean;
      sourceJobId?: string;
    };
    const source = toStringValue((req.query as Record<string, unknown>).source);

    logger.debug(
      { forceUpdate, source, yamlStr: String(yamlStr).substring(0, 50) },
      'saveV2 asyncHandler'
    );

    const result = await saveWordWithProvenance({
      req,
      yaml: yamlStr as string,
      forceUpdate,
      sourceJobId,
      saveWord: wordServiceV2.saveWord.bind(wordServiceV2),
      syncMarkerWriter: getQueue(),
      source: source === 'import' ? 'import' : undefined,
    });
    res.json(result);
  });

  addWord = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { word?: string; yaml?: string };
    const word = toStringValue(body.word).trim();
    const yamlStr = body.yaml || '';

    if (!word || !yamlStr) {
      throw BadRequest('Missing parameters');
    }

    const result = await wordServiceV2.addWord(req, word, yamlStr);

    if (result.status === 'duplicate') {
      res.status(409).json({
        success: false,
        code: 409,
        message: 'Duplicate word',
        data: { lemma: result.lemma },
      });
      return;
    }

    if (result.status === 'invalid') {
      res.status(422).json({
        success: false,
        code: 422,
        message: 'Invalid YAML',
        data: { errors: result.errors || [] },
      });
      return;
    }

    res.status(201).json({
      code: 201,
      message: 'created',
      data: { id: result.id, lemma: result.lemma, language: result.language },
    });
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    await wordServiceV2.deleteWord(req, toStringValue(req.params.id));
    res.json({ success: true });
  });

  validate = asyncHandler(async (req: Request, res: Response) => {
    const {
      yaml: yamlStr,
      repair,
      intent,
      wordId,
      baseWordSchemaVersion,
    } = req.body as {
      yaml?: string;
      repair?: boolean;
      intent?: 'create' | 'update-existing';
      wordId?: string | number | null;
      baseWordSchemaVersion?: number | null;
    };
    if (!yamlStr) {
      res.status(422).json({ valid: false, errors: ['YAML content is required'] });
      return;
    }
    const result = await wordServiceV2.validateYaml(req, yamlStr, {
      repair,
      intent,
      wordId,
      baseWordSchemaVersion,
    });
    res.json(result);
  });
}

module.exports = new WordControllerV2();
