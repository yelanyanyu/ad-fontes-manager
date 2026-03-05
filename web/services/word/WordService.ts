const yaml = require('js-yaml') as { load: (content: string) => unknown };
const nlp = require('compromise') as (text: string) => {
  verbs: () => { toInfinitive: () => void };
  nouns: () => { toSingular: () => void };
  text: () => string;
};
const { getPool } = require('../../db') as { getPool: () => Promise<DbPoolLike> };
const conflictService = require('../conflictService') as {
  analyze: (oldData: unknown, newData: unknown) => { hasConflict: boolean; diff: unknown[] | undefined };
};
const validator = require('./WordValidator') as {
  validate: (data: unknown, wordLower: string) => { valid: boolean; errors: string[] };
};
const repository = require('./WordRepository') as WordRepositoryLike;
const assembler = require('./WordAssembler') as WordAssemblerLike;
const { createContextLogger } = require('../../utils/logger') as {
  createContextLogger: (context: Record<string, unknown>) => LoggerLike;
};

interface LoggerLike {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

interface RequestLike {
  id?: string;
  query?: Record<string, unknown>;
}

interface DbClientLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  release: () => void;
}

interface DbPoolLike {
  connect: () => Promise<DbClientLike>;
}

interface WordRepositoryLike {
  findByLemma: (
    req: RequestLike,
    lemma: string,
    client?: DbClientLike | null
  ) => Promise<Record<string, any> | null>;
  findById: (
    req: RequestLike,
    id: string | number,
    client?: DbClientLike | null
  ) => Promise<Record<string, unknown> | null>;
  create: (
    req: RequestLike,
    wordData: Record<string, unknown>,
    client: DbClientLike
  ) => Promise<{ id: string | number; lemma: string }>;
  update: (
    req: RequestLike,
    wordId: string | number,
    wordData: Record<string, unknown>,
    client: DbClientLike
  ) => Promise<void>;
  delete: (req: RequestLike, id: string | number) => Promise<void>;
  listAll: (req: RequestLike) => Promise<Record<string, unknown>[]>;
  listPaged: (
    req: RequestLike,
    options: { page: number; limit: number; search: string; sort: string }
  ) => Promise<Record<string, unknown>>;
  getDetails: (
    req: RequestLike,
    wordText: string,
    include?: string[]
  ) => Promise<Record<string, unknown> | null>;
  logUserRequest: (
    client: DbClientLike,
    wordId: string | number,
    userWord?: string,
    userContext?: string
  ) => Promise<void>;
}

interface WordAssemblerLike {
  extractWordData: (data: Record<string, any>) => Record<string, unknown>;
  updateChildren: (client: DbClientLike, wordId: string | number, data: Record<string, any>) => Promise<void>;
  extractUserContext: (data: Record<string, any>) => { userWord?: string; userContext?: string };
}

class WordService {
  async addWord(req: RequestLike, wordText: string, yamlStr: string): Promise<Record<string, unknown>> {
    const requestId = req.id || 'unknown';
    const logger = createContextLogger({ requestId, operation: 'addWord', word: wordText });

    const wordLower = String(wordText || '').trim().toLowerCase();
    if (!wordLower) {
      logger.warn({ word: wordText }, 'Add word failed: word is required');
      return { status: 'invalid', errors: ['word is required'] };
    }

    logger.debug({ word: wordText, wordLower }, 'Adding new word');

    let data: Record<string, any>;
    try {
      data = yaml.load(String(yamlStr || '')) as Record<string, any>;
    } catch (error) {
      const err = error as { message?: string };
      logger.error({ error: err.message, yaml: yamlStr?.substring(0, 200) }, 'YAML parse error');
      return { status: 'invalid', errors: ['yaml parse error'] };
    }

    const validation = validator.validate(data, wordLower);
    if (!validation.valid) {
      logger.warn({ errors: validation.errors }, 'Validation failed');
      return { status: 'invalid', errors: validation.errors };
    }

    const pool = await getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      logger.debug('Transaction started');

      const existing = await repository.findByLemma(req, wordLower, client);
      if (existing) {
        await client.query('ROLLBACK');
        logger.warn({ lemma: existing.lemma, id: existing.id }, 'Word already exists');
        return { status: 'duplicate', lemma: existing.lemma, id: existing.id };
      }

      const wordData = assembler.extractWordData(data);
      logger.debug({ wordData }, 'Extracted word data');

      const insertResult = await repository.create(req, wordData, client);
      const wordId = insertResult.id;

      await assembler.updateChildren(client, wordId, data);
      await client.query('COMMIT');

      logger.info(
        {
          id: wordId,
          lemma: insertResult.lemma,
          word: wordText,
        },
        'Word created successfully'
      );

      return { status: 'created', id: wordId, lemma: insertResult.lemma };
    } catch (error) {
      const err = error as { message?: string; code?: string; stack?: string };
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        const rollbackErr = rollbackError as { message?: string };
        logger.error({ error: rollbackErr.message }, 'Rollback failed');
      }

      logger.error(
        {
          error: err.message,
          code: err.code,
          stack: err.stack,
        },
        'Database error during addWord'
      );

      if (err && err.code === '23505') {
        return { status: 'duplicate', lemma: wordLower };
      }

      return { status: 'error', error: err.message };
    } finally {
      client.release();
      logger.debug('Database connection released');
    }
  }

  async listWords(req: RequestLike): Promise<Record<string, unknown> | Record<string, unknown>[]> {
    const query = req.query || {};
    if (query.page || query.limit || query.search || query.sort) {
      return this.listWordsPaged(req);
    }
    return repository.listAll(req);
  }

  async listWordsPaged(req: RequestLike): Promise<Record<string, unknown>> {
    const query = req.query || {};
    const options = {
      page: parseInt(String(query.page || '1'), 10) || 1,
      limit: parseInt(String(query.limit || '20'), 10) || 20,
      search: String(query.search || '').trim(),
      sort: String(query.sort || 'newest').trim(),
    };
    return repository.listPaged(req, options);
  }

  async getWordById(req: RequestLike, id: string | number): Promise<Record<string, unknown>> {
    if (!id) throw new Error('Missing id');
    const word = await repository.findById(req, id);
    if (!word) throw new Error('Not found');
    return word;
  }

  async getWordDetails(req: RequestLike, wordText: string, include: string[] = []): Promise<Record<string, unknown>> {
    const details = await repository.getDetails(req, wordText, include);
    if (!details) throw new Error('Not found');
    return details;
  }

  async checkWord(req: RequestLike, userWord: string): Promise<Record<string, unknown>> {
    const doc = nlp(userWord);
    doc.verbs().toInfinitive();
    doc.nouns().toSingular();
    const lemma = doc.text().trim().toLowerCase() || userWord.toLowerCase();

    const existing = await repository.findByLemma(req, lemma);

    if (existing) {
      return { found: true, lemma, data: existing };
    }
    return { found: false, lemma };
  }

  async checkConflict(req: RequestLike, yamlStr: string): Promise<Record<string, unknown>> {
    if (!yamlStr) throw new Error('No content');
    const data = yaml.load(yamlStr) as Record<string, any>;
    const lemma = data?.yield?.lemma?.toLowerCase();
    if (!lemma) throw new Error('Missing lemma');

    const existing = await repository.findByLemma(req, lemma);
    if (!existing) return { status: 'created', lemma };

    const analysis = conflictService.analyze(existing.original_yaml, data);

    if (analysis.hasConflict) {
      return {
        status: 'conflict',
        lemma,
        diff: analysis.diff,
        oldData: existing.original_yaml,
        newData: data,
      };
    }

    return { status: 'ok', lemma };
  }

  async saveWord(req: RequestLike, yamlStr: string, forceUpdate = false): Promise<Record<string, unknown>> {
    const requestId = req.id || 'unknown';
    const logger = createContextLogger({ requestId, operation: 'saveWord', forceUpdate });

    if (!yamlStr) {
      logger.error('Save word failed: No YAML content');
      return { success: false, error: 'No YAML content' };
    }

    let data: Record<string, any>;
    try {
      data = yaml.load(yamlStr) as Record<string, any>;
    } catch (error) {
      const err = error as { message?: string; name?: string };
      logger.error(
        {
          error: err.message,
          errorType: err.name,
          yamlPreview: yamlStr?.substring(0, 500),
          yamlLength: yamlStr?.length,
        },
        'YAML parse error'
      );
      return { success: false, error: `Invalid YAML format: ${err.message}` };
    }

    const lemma = data?.yield?.lemma?.toLowerCase();
    if (!lemma) {
      logger.error('Save word failed: YAML missing yield.lemma');
      return { success: false, error: 'YAML missing yield.lemma' };
    }

    logger.debug({ lemma, forceUpdate, contentLength: yamlStr.length }, 'Saving word');

    const pool = await getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      logger.debug('Transaction started');

      const existing = await repository.findByLemma(req, lemma, client);
      const analysisRes = existing ? conflictService.analyze(existing.original_yaml, data) : null;

      if (existing && !forceUpdate && analysisRes?.hasConflict) {
        await client.query('ROLLBACK');
        logger.warn(
          {
            lemma,
            diff: analysisRes.diff,
            oldDataLength: String(existing.original_yaml || '').length,
            newDataLength: yamlStr?.length,
          },
          'Conflict detected'
        );
        return {
          status: 'conflict',
          diff: analysisRes.diff,
          oldData: existing.original_yaml,
          newData: data,
        };
      }

      let wordId: string | number;
      let status: string;

      if (existing) {
        wordId = existing.id as string | number;
        const shouldUpdate = Boolean(forceUpdate) || Boolean(analysisRes?.hasConflict);

        if (shouldUpdate) {
          logger.debug({ wordId, lemma, forceUpdate }, 'Updating existing word');
          const wordData = assembler.extractWordData(data);
          await repository.update(req, wordId, wordData, client);
          await assembler.updateChildren(client, wordId, data);
          status = 'updated';
        } else {
          logger.debug({ wordId, lemma }, 'No changes detected, logging only');
          status = 'logged';
        }
      } else {
        logger.debug({ lemma }, 'Creating new word');
        const wordData = assembler.extractWordData(data);
        const insertResult = await repository.create(req, wordData, client);
        wordId = insertResult.id;
        await assembler.updateChildren(client, wordId, data);
        status = 'created';
      }

      const userContext = assembler.extractUserContext(data);
      await repository.logUserRequest(client, wordId, userContext.userWord, userContext.userContext);

      await client.query('COMMIT');

      logger.info(
        {
          id: wordId,
          lemma,
          status,
          isNew: !existing,
        },
        'Word saved successfully'
      );

      return { success: true, id: wordId, lemma, status };
    } catch (error) {
      const err = error as { message?: string; code?: string; stack?: string };

      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        const rollbackErr = rollbackError as { message?: string };
        logger.error({ error: rollbackErr.message }, 'Rollback failed');
      }

      logger.error({ yaml: yamlStr }, 'Yaml input');

      logger.error(
        {
          error: err.message,
          code: err.code,
          stack: err.stack,
          lemma,
        },
        'Database error during saveWord'
      );

      return { success: false, error: err.message };
    } finally {
      client.release();
      logger.debug('Database connection released');
    }
  }

  async deleteWord(req: RequestLike, id: string | number): Promise<{ success: true }> {
    const requestId = req.id || 'unknown';
    const logger = createContextLogger({ requestId, operation: 'deleteWord', wordId: id });

    logger.debug({ wordId: id }, 'Deleting word');

    try {
      await repository.delete(req, id);
      logger.info({ wordId: id }, 'Word deleted successfully');
      return { success: true };
    } catch (error) {
      const err = error as { message?: string; code?: string };
      logger.error(
        {
          wordId: id,
          error: err.message,
          code: err.code,
        },
        'Delete word failed'
      );
      throw error;
    }
  }
}

module.exports = new WordService();
