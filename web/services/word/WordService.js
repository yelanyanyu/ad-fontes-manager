/**
 * WordService - 业务流程编排与事务协调
 * 精简版：仅保留用例编排，移除所有 SQL 和验证细节
 */

const yaml = require('js-yaml');
const nlp = require('compromise');
const { getPool } = require('../../db');
const conflictService = require('../conflictService');
const validator = require('./WordValidator');
const repository = require('./WordRepository');
const assembler = require('./WordAssembler');

class WordService {
  async addWord(req, wordText, yamlStr) {
    const wordLower = String(wordText || '')
      .trim()
      .toLowerCase();
    if (!wordLower) return { status: 'invalid', errors: ['word is required'] };

    let data;
    try {
      data = yaml.load(String(yamlStr || ''));
    } catch {
      return { status: 'invalid', errors: ['yaml parse error'] };
    }

    const validation = validator.validate(data, wordLower);
    if (!validation.valid) {
      return { status: 'invalid', errors: validation.errors };
    }

    const pool = await getPool(req);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const existing = await repository.findByLemma(req, wordLower, client);
      if (existing) {
        await client.query('ROLLBACK');
        return { status: 'duplicate', lemma: existing.lemma, id: existing.id };
      }

      const wordData = assembler.extractWordData(data);
      const insertResult = await repository.create(req, wordData, client);
      const wordId = insertResult.id;

      await assembler.updateChildren(client, wordId, data);
      await client.query('COMMIT');

      return { status: 'created', id: wordId, lemma: insertResult.lemma };
    } catch (e) {
      await client.query('ROLLBACK');
      if (e && e.code === '23505') {
        return { status: 'duplicate', lemma: wordLower };
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async listWords(req) {
    if (req.query && (req.query.page || req.query.limit || req.query.search || req.query.sort)) {
      return this.listWordsPaged(req);
    }
    return repository.listAll(req);
  }

  async listWordsPaged(req) {
    const options = {
      page: parseInt(req.query.page || '1', 10) || 1,
      limit: parseInt(req.query.limit || '20', 10) || 20,
      search: (req.query.search || '').trim(),
      sort: (req.query.sort || 'newest').trim(),
    };
    return repository.listPaged(req, options);
  }

  async getWordById(req, id) {
    if (!id) throw new Error('Missing id');
    const word = await repository.findById(req, id);
    if (!word) throw new Error('Not found');
    return word;
  }

  async getWordDetails(req, wordText, include = []) {
    const details = await repository.getDetails(req, wordText, include);
    if (!details) throw new Error('Not found');
    return details;
  }

  async checkWord(req, userWord) {
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

  async checkConflict(req, yamlStr) {
    if (!yamlStr) throw new Error('No content');
    const data = yaml.load(yamlStr);
    const lemma = data.yield?.lemma?.toLowerCase();
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

  async saveWord(req, yamlStr, forceUpdate) {
    if (!yamlStr) throw new Error('No YAML content');
    const data = yaml.load(yamlStr);
    const lemma = data.yield?.lemma?.toLowerCase();
    if (!lemma) throw new Error('YAML missing yield.lemma');

    const pool = await getPool(req);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const existing = await repository.findByLemma(req, lemma, client);
      const analysis = existing ? conflictService.analyze(existing.original_yaml, data) : null;

      if (existing && !forceUpdate && analysis?.hasConflict) {
        await client.query('ROLLBACK');
        return {
          status: 'conflict',
          diff: analysis.diff,
          oldData: existing.original_yaml,
          newData: data,
        };
      }

      let wordId;
      let status;

      if (existing) {
        wordId = existing.id;
        const shouldUpdate = !!forceUpdate || !!analysis?.hasConflict;

        if (shouldUpdate) {
          const wordData = assembler.extractWordData(data);
          await repository.update(req, wordId, wordData, client);
          await assembler.updateChildren(client, wordId, data);
          status = 'updated';
        } else {
          status = 'logged';
        }
      } else {
        const wordData = assembler.extractWordData(data);
        const insertResult = await repository.create(req, wordData, client);
        wordId = insertResult.id;
        await assembler.updateChildren(client, wordId, data);
        status = 'created';
      }

      const userContext = assembler.extractUserContext(data);
      await repository.logUserRequest(
        client,
        wordId,
        userContext.userWord,
        userContext.userContext
      );

      await client.query('COMMIT');

      return { success: true, id: wordId, lemma, status };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteWord(req, id) {
    await repository.delete(req, id);
    return { success: true };
  }
}

module.exports = new WordService();
