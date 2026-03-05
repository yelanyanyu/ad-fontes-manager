import type { Request, Response } from 'express';

const wordService = require('../services/wordService') as {
  listWords: (req: Request) => Promise<unknown>;
  getWordDetails: (req: Request, word: string, include: string[]) => Promise<unknown>;
  getWordById: (req: Request, id: string) => Promise<unknown>;
  checkWord: (req: Request, userWord: string) => Promise<unknown>;
  saveWord: (req: Request, yamlStr: string, forceUpdate?: boolean) => Promise<unknown>;
  addWord: (req: Request, word: string, yamlStr: string) => Promise<Record<string, unknown>>;
  deleteWord: (req: Request, id: string) => Promise<unknown>;
};

const { asyncHandler, BadRequest, Conflict, UnprocessableEntity } = require('../utils/errors') as {
  asyncHandler: <T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) => T;
  BadRequest: (message: string, data?: unknown) => Error;
  Conflict: (message: string, data?: unknown) => Error;
  UnprocessableEntity: (message: string, data?: unknown) => Error;
};

const { logger } = require('../utils/logger') as {
  logger: { debug: (obj: unknown, msg?: string) => void };
};

const toStringValue = (value: unknown): string => {
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
};

class WordController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const words = await wordService.listWords(req);
    res.json(words);
  });

  getDetails = asyncHandler(async (req: Request, res: Response) => {
    const word = toStringValue(req.query.word).trim();
    if (!word) {
      throw BadRequest('Word parameter required');
    }

    const includeRaw = toStringValue(req.query.include).trim();
    const include = includeRaw
      ? includeRaw
          .split(',')
          .map(s => s.trim().toLowerCase())
          .filter(Boolean)
      : [];

    const data = await wordService.getWordDetails(req, word, include);
    res.status(200).json({ code: 200, message: 'success', data });
  });

  get = asyncHandler(async (req: Request, res: Response) => {
    const word = await wordService.getWordById(req, toStringValue(req.params.id));
    res.json(word);
  });

  check = asyncHandler(async (req: Request, res: Response) => {
    const userWord = toStringValue(req.query.word);
    if (!userWord) {
      throw BadRequest('Word parameter required');
    }

    const result = await wordService.checkWord(req, userWord);
    res.json(result);
  });

  save = asyncHandler(async (req: Request, res: Response) => {
    const { yaml: yamlStr, forceUpdate } = req.body as {
      yaml?: string;
      forceUpdate?: boolean;
    };

    logger.debug(
      {
        forceUpdate,
        yamlStr: String(yamlStr).substring(0, 50),
      },
      'asyncHandler'
    );

    const result = await wordService.saveWord(req, yamlStr as string, forceUpdate);
    res.json(result);
  });

  addWord = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { word?: string; yaml?: string };
    const word = toStringValue(body.word).trim();
    const yamlStr = body.yaml || '';

    if (!word || !yamlStr) {
      throw BadRequest('Missing parameters');
    }

    const result = await wordService.addWord(req, word, yamlStr);

    if (result.status === 'duplicate') {
      throw Conflict('Duplicate word', { lemma: result.lemma });
    }

    if (result.status === 'invalid') {
      throw UnprocessableEntity('Invalid YAML', { errors: result.errors || [] });
    }

    res
      .status(201)
      .json({ code: 201, message: 'created', data: { id: result.id, lemma: result.lemma } });
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    await wordService.deleteWord(req, toStringValue(req.params.id));
    res.json({ success: true });
  });
}

module.exports = new WordController();
