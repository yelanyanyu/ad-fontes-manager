const yaml = require('js-yaml') as { load: (content: string) => unknown };
const nlp = require('compromise') as (text: string) => {
  verbs: () => { toInfinitive: () => void };
  nouns: () => { toSingular: () => void };
  text: () => string;
};
const { getDb } = require('../../db') as { getDb: () => DbOrTxLike };
const conflictService = require('../conflictService') as {
  analyze: (
    oldData: unknown,
    newData: unknown
  ) => { hasConflict: boolean; diff: unknown[] | undefined };
};
const validator = require('./WordValidator') as {
  validate: (
    data: unknown,
    wordLower: string,
    language?: string
  ) => { valid: boolean; errors: string[] };
};
const repositoryV2 = require('./WordRepositoryV2') as WordRepositoryV2Like;
const assemblerV2 = require('./WordAssemblerV2') as WordAssemblerV2Like;
const { createContextLogger } = require('../../utils/logger') as {
  createContextLogger: (context: Record<string, unknown>) => LoggerLike;
};
const { prepareYamlForWordSave } = require('./formatFix') as {
  prepareYamlForWordSave: (
    wordText: string,
    yamlText: string
  ) => {
    ok: boolean;
    yaml?: string;
    data?: Record<string, any>;
    language?: string;
    changed: boolean;
    canSave: boolean;
    repairs: unknown[];
    diagnostics: unknown[];
  };
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
  validatedQuery?: Record<string, unknown>;
}

type DbOrTxLike = any;

interface WordRepositoryV2Like {
  findByLemma: (
    lemma: string,
    language: string,
    client?: DbOrTxLike | null
  ) => Record<string, any> | null;
  findById: (id: string, client?: DbOrTxLike | null) => Record<string, unknown> | null;
  create: (
    wordData: Record<string, unknown>,
    client?: DbOrTxLike | null
  ) => { id: string; lemma: string; language: string };
  update: (id: string, wordData: Record<string, unknown>, client?: DbOrTxLike | null) => void;
  delete: (id: string, client?: DbOrTxLike | null) => void;
  listPaged: (options: {
    page: number;
    limit: number;
    search: string;
    sort: string;
    language: string;
  }) => Record<string, unknown>;
}

const isUniqueConstraintError = (error: { code?: string; message?: string }): boolean =>
  error.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
  error.code === 'SQLITE_CONSTRAINT' ||
  String(error.message || '').includes('UNIQUE constraint failed');

interface WordAssemblerV2Like {
  extractWordData: (data: Record<string, any>, language: string) => Record<string, unknown>;
  extractUserContext: (data: Record<string, any>) => { userWord?: string; userContext?: string };
}

class WordServiceV2 {
  private _getQuery(req: RequestLike): Record<string, unknown> {
    return req.validatedQuery || req.query || {};
  }

  /**
   * Detect language from parsed YAML data.
   * Priority: 1) explicit yield.language, 2) contextual_meaning.de present, 3) default 'en'
   */
  detectLanguage(data: Record<string, any>): string {
    if (data?.yield?.language === 'de') return 'de';
    if (data?.yield?.language === 'en') return 'en';
    if (data?.yield?.contextual_meaning?.de && !data?.yield?.contextual_meaning?.en) return 'de';
    return 'en';
  }

  private _lemmatizeEn(word: string): string {
    const doc = nlp(word);
    doc.verbs().toInfinitive();
    doc.nouns().toSingular();
    return doc.text().trim().toLowerCase() || word.toLowerCase();
  }

  private _lemmatizeDe(word: string): string {
    return word.trim().toLowerCase();
  }

  async addWord(
    req: RequestLike,
    wordText: string,
    yamlStr: string
  ): Promise<Record<string, unknown>> {
    const requestId = req.id || 'unknown';
    const logger = createContextLogger({ requestId, operation: 'addWordV2', word: wordText });

    const wordLower = String(wordText || '')
      .trim()
      .toLowerCase();
    if (!wordLower) {
      logger.warn({ word: wordText }, 'Add word failed: word is required');
      return { status: 'invalid', errors: ['word is required'] };
    }

    logger.debug({ word: wordText, wordLower }, 'Adding new word (v2)');

    const prepared = prepareYamlForWordSave(wordText, yamlStr);
    if (!prepared.ok || !prepared.data) {
      logger.warn({ diagnostics: prepared.diagnostics }, 'Add word failed: invalid YAML');
      return {
        status: 'invalid',
        errors: prepared.diagnostics.map(diagnostic =>
          typeof diagnostic === 'object' && diagnostic && 'message' in diagnostic
            ? String((diagnostic as { message?: unknown }).message)
            : String(diagnostic)
        ),
        diagnostics: prepared.diagnostics,
        repairs: prepared.repairs,
        yaml: prepared.yaml,
        changed: prepared.changed,
      };
    }

    const data = prepared.data;
    const language = prepared.language || this.detectLanguage(data);
    logger.debug({ language }, 'Detected language');

    const wordData = assemblerV2.extractWordData(data, language);
    logger.debug({ lemma: wordData.lemma, language }, 'Extracted word data');

    try {
      const db = getDb();
      logger.debug('Transaction started');

      return db.transaction((tx: DbOrTxLike) => {
        const existing = repositoryV2.findByLemma(wordLower, language, tx);
        if (existing) {
          logger.warn({ lemma: existing.lemma, id: existing.id }, 'Word already exists');
          return { status: 'duplicate', lemma: existing.lemma, id: existing.id };
        }

        const insertResult = repositoryV2.create(wordData, tx);

        logger.info(
          { id: insertResult.id, lemma: insertResult.lemma, language },
          'Word created successfully (v2)'
        );

        return { status: 'created', id: insertResult.id, lemma: insertResult.lemma, language };
      });
    } catch (error) {
      const err = error as { message?: string; code?: string; stack?: string };

      logger.error(
        { error: err.message, code: err.code, stack: err.stack },
        'Database error during addWord (v2)'
      );

      if (isUniqueConstraintError(err)) {
        return { status: 'duplicate', lemma: wordLower };
      }

      return { status: 'error', error: err.message };
    }
  }

  async listWords(req: RequestLike): Promise<Record<string, unknown> | Record<string, unknown>[]> {
    return this.listWordsPaged(req);
  }

  async listWordsPaged(req: RequestLike): Promise<Record<string, unknown>> {
    const query = this._getQuery(req);
    const options = {
      page: parseInt(String(query.page || '1'), 10) || 1,
      limit: parseInt(String(query.limit || '20'), 10) || 20,
      search: String(query.search || '').trim(),
      sort: String(query.sort || 'newest').trim(),
      language: String(query.language || 'en').toLowerCase(),
    };
    return repositoryV2.listPaged(options);
  }

  async getWordById(req: RequestLike, id: string): Promise<Record<string, unknown>> {
    if (!id) throw new Error('Missing id');
    const word = repositoryV2.findById(id);
    if (!word) throw new Error('Not found');
    return word;
  }

  async getWordDetails(
    req: RequestLike,
    wordText: string,
    language: string = 'en'
  ): Promise<Record<string, unknown>> {
    const result = repositoryV2.findByLemma(wordText, language);
    if (!result) throw new Error('Not found');

    // Return content JSONB directly �?it's the full YAML document
    const { content, ...meta } = result;
    return {
      ...meta,
      ...(content as Record<string, unknown>),
    };
  }

  async validateYaml(
    req: RequestLike,
    yamlStr: string,
    options: { repair?: boolean } = {}
  ): Promise<{
    valid: boolean;
    errors: string[];
    language?: string;
    yaml?: string;
    changed?: boolean;
    canSave?: boolean;
    repairs?: unknown[];
    diagnostics?: unknown[];
  }> {
    if (!yamlStr) {
      return { valid: false, errors: ['YAML content is required'] };
    }

    if (options.repair === false) {
      try {
        const data = yaml.load(yamlStr) as Record<string, any>;
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return {
            valid: false,
            errors: ['YAML must be an object'],
            yaml: yamlStr,
            changed: false,
            canSave: false,
            repairs: [],
            diagnostics: [
              {
                severity: 'error',
                code: 'yaml.not_object',
                path: 'root',
                message: 'YAML must be an object',
              },
            ],
          };
        }

        const language = this.detectLanguage(data);
        const lemma = data?.yield?.lemma;
        const wordLower = String(lemma || '')
          .trim()
          .toLowerCase();
        const validation = wordLower
          ? validator.validate(data, wordLower, language)
          : { valid: false, errors: ['yield.lemma is required'] };
        const diagnostics = validation.errors.map(error => ({
          severity: 'error',
          code: 'schema.invalid',
          path: 'root',
          message: error,
        }));

        return {
          valid: validation.valid,
          errors: validation.errors,
          language,
          yaml: yamlStr,
          changed: false,
          canSave: validation.valid,
          repairs: [],
          diagnostics,
        };
      } catch (error) {
        const err = error as { message?: string };
        const message = `YAML parse error: ${err.message}`;
        return {
          valid: false,
          errors: [message],
          yaml: yamlStr,
          changed: false,
          canSave: false,
          repairs: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'yaml.parse_error',
              path: 'root',
              message,
            },
          ],
        };
      }
    }

    const rawData = (() => {
      try {
        return yaml.load(yamlStr) as Record<string, any>;
      } catch {
        return null;
      }
    })();
    const lemma = rawData?.yield?.lemma || '';
    const result = prepareYamlForWordSave(String(lemma || ''), yamlStr);
    return {
      valid: result.ok,
      errors: result.diagnostics.map(diagnostic =>
        typeof diagnostic === 'object' && diagnostic && 'message' in diagnostic
          ? String((diagnostic as { message?: unknown }).message)
          : String(diagnostic)
      ),
      language: result.language,
      yaml: result.yaml,
      changed: result.changed,
      canSave: result.canSave,
      repairs: result.repairs,
      diagnostics: result.diagnostics,
    };
  }

  async checkWord(
    req: RequestLike,
    userWord: string,
    language: string = 'en'
  ): Promise<Record<string, unknown>> {
    const lemma = language === 'de' ? this._lemmatizeDe(userWord) : this._lemmatizeEn(userWord);

    const existing = repositoryV2.findByLemma(lemma, language);

    if (existing) {
      return { found: true, lemma, language, data: existing };
    }
    return { found: false, lemma, language };
  }

  async checkConflict(req: RequestLike, yamlStr: string): Promise<Record<string, unknown>> {
    if (!yamlStr) throw new Error('No content');
    const data = yaml.load(yamlStr) as Record<string, any>;
    const language = this.detectLanguage(data);
    const lemma = data?.yield?.lemma?.toLowerCase();
    if (!lemma) throw new Error('Missing lemma');

    const existing = repositoryV2.findByLemma(lemma, language);
    if (!existing) return { status: 'created', lemma, language };

    const analysis = conflictService.analyze(existing.content, data);

    if (analysis.hasConflict) {
      return {
        status: 'conflict',
        lemma,
        language,
        diff: analysis.diff,
        oldData: existing.content,
        newData: data,
      };
    }

    return { status: 'ok', lemma, language };
  }

  async saveWord(
    req: RequestLike,
    yamlStr: string,
    forceUpdate = false
  ): Promise<Record<string, unknown>> {
    const requestId = req.id || 'unknown';
    const logger = createContextLogger({ requestId, operation: 'saveWordV2', forceUpdate });

    if (!yamlStr) {
      logger.error('Save word failed: No YAML content');
      return { success: false, error: 'No YAML content' };
    }

    const prepared = prepareYamlForWordSave('', yamlStr);
    if (!prepared.ok || !prepared.data) {
      logger.warn({ diagnostics: prepared.diagnostics }, 'Validation failed in saveWord');
      return {
        success: false,
        error: 'Invalid YAML',
        errors: prepared.diagnostics.map(diagnostic =>
          typeof diagnostic === 'object' && diagnostic && 'message' in diagnostic
            ? String((diagnostic as { message?: unknown }).message)
            : String(diagnostic)
        ),
        diagnostics: prepared.diagnostics,
        repairs: prepared.repairs,
        yaml: prepared.yaml,
        changed: prepared.changed,
        canSave: prepared.canSave,
      };
    }

    const data = prepared.data;
    const language = prepared.language || this.detectLanguage(data);
    const lemma = String(
      (data.yield as Record<string, any> | undefined)?.lemma || ''
    ).toLowerCase();
    if (!lemma) {
      logger.error('Save word failed: YAML missing yield.lemma');
      return { success: false, error: 'YAML missing yield.lemma' };
    }

    logger.debug(
      { lemma, language, contentLength: prepared.yaml?.length || yamlStr.length },
      'Saving word (v2)'
    );

    try {
      const db = getDb();
      logger.debug('Transaction started');

      return db.transaction((tx: DbOrTxLike) => {
        const existing = repositoryV2.findByLemma(lemma, language, tx);
        const analysisRes = existing ? conflictService.analyze(existing.content, data) : null;

        if (existing && !forceUpdate && analysisRes?.hasConflict) {
          logger.warn({ lemma, language, diff: analysisRes.diff }, 'Conflict detected');
          return {
            status: 'conflict',
            diff: analysisRes.diff,
            oldData: existing.content,
            newData: data,
            yaml: prepared.yaml,
            changed: prepared.changed,
            repairs: prepared.repairs,
          };
        }

        let wordId: string;
        let status: string;

        if (existing) {
          wordId = existing.id as string;
          const shouldUpdate = Boolean(forceUpdate) || Boolean(analysisRes?.hasConflict);

          if (shouldUpdate) {
            logger.debug({ wordId, lemma, language, forceUpdate }, 'Updating existing word (v2)');
            const wordData = assemblerV2.extractWordData(data, language);
            repositoryV2.update(wordId, wordData, tx);
            status = 'updated';
          } else {
            logger.debug({ wordId, lemma }, 'No changes detected (v2)');
            status = 'logged';
          }
        } else {
          logger.debug({ lemma, language }, 'Creating new word (v2)');
          const wordData = assemblerV2.extractWordData(data, language);
          const insertResult = repositoryV2.create(wordData, tx);
          wordId = insertResult.id;
          status = 'created';
        }

        logger.info({ id: wordId, lemma, language, status }, 'Word saved successfully (v2)');

        return {
          success: true,
          id: wordId,
          lemma,
          language,
          status,
          yaml: prepared.yaml,
          changed: prepared.changed,
          repairs: prepared.repairs,
        };
      });
    } catch (error) {
      const err = error as { message?: string; code?: string; stack?: string };

      logger.error({ yaml: yamlStr }, 'Yaml input');

      logger.error(
        { error: err.message, code: err.code, stack: err.stack, lemma, language },
        'Database error during saveWord (v2)'
      );

      return { success: false, error: err.message };
    }
  }

  async deleteWord(req: RequestLike, id: string): Promise<{ success: true }> {
    const requestId = req.id || 'unknown';
    const logger = createContextLogger({ requestId, operation: 'deleteWordV2', wordId: id });

    logger.debug({ wordId: id }, 'Deleting word (v2)');

    try {
      repositoryV2.delete(id);
      logger.info({ wordId: id }, 'Word deleted successfully (v2)');
      return { success: true };
    } catch (error) {
      const err = error as { message?: string; code?: string };
      logger.error({ wordId: id, error: err.message, code: err.code }, 'Delete word failed (v2)');
      throw error;
    }
  }
}

module.exports = new WordServiceV2();
