/**
 * WordRepository - 数据访问与 SQL 封装
 * 唯一允许直接操作 db 连接池的模块
 */

const { getPool } = require('../../db');

class WordRepository {
  async findByLemma(req, lemma, client = null) {
    const dbClient = client || (await getPool(req));
    const result = await dbClient.query('SELECT * FROM words WHERE lower(lemma) = $1', [
      lemma.toLowerCase(),
    ]);
    return result.rows[0] || null;
  }

  async findById(req, id, client = null) {
    const dbClient = client || (await getPool(req));
    const result = await dbClient.query(
      'SELECT id, lemma, part_of_speech, syllabification, contextual_meaning_en, contextual_meaning_zh, other_common_meanings, image_differentiation_zh, created_at, updated_at, revision_count, original_yaml FROM words WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async create(req, wordData, client) {
    const {
      lemma,
      syllabification,
      partOfSpeech,
      contextualMeaningEn,
      contextualMeaningZh,
      otherCommonMeanings,
      imageDifferentiationZh,
      originalYaml,
    } = wordData;

    const result = await client.query(
      `
        INSERT INTO words (
          lemma, syllabification, part_of_speech,
          contextual_meaning_en, contextual_meaning_zh,
          other_common_meanings, image_differentiation_zh, original_yaml
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, lemma
      `,
      [
        lemma,
        syllabification,
        partOfSpeech,
        contextualMeaningEn,
        contextualMeaningZh,
        otherCommonMeanings || [],
        imageDifferentiationZh,
        originalYaml,
      ]
    );

    return result.rows[0];
  }

  async update(req, wordId, wordData, client) {
    const {
      partOfSpeech,
      syllabification,
      contextualMeaningEn,
      contextualMeaningZh,
      otherCommonMeanings,
      imageDifferentiationZh,
      originalYaml,
    } = wordData;

    await client.query(
      `
        UPDATE words SET 
          part_of_speech = $1, syllabification = $2, contextual_meaning_en = $3, 
          contextual_meaning_zh = $4, other_common_meanings = $5, image_differentiation_zh = $6,
          original_yaml = $7, revision_count = revision_count + 1, updated_at = now()
        WHERE id = $8
      `,
      [
        partOfSpeech,
        syllabification,
        contextualMeaningEn,
        contextualMeaningZh,
        otherCommonMeanings || [],
        imageDifferentiationZh,
        originalYaml,
        wordId,
      ]
    );
  }

  async delete(req, id, client = null) {
    const dbClient = client || (await getPool(req));
    await dbClient.query('DELETE FROM words WHERE id = $1', [id]);
  }

  async listAll(req) {
    const pool = await getPool(req);
    const result = await pool.query(`
      SELECT id, lemma, part_of_speech, syllabification, contextual_meaning_en, created_at, revision_count, original_yaml
      FROM words 
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  async listPaged(req, options) {
    const pool = await getPool(req);
    const { page = 1, limit = 20, search = '', sort = 'newest' } = options;

    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(200, Math.max(1, limit));
    const offset = (validatedPage - 1) * validatedLimit;

    const where = [];
    const params = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`lower(lemma) LIKE $${params.length}`);
    }

    let orderBy = 'created_at DESC';
    if (sort === 'az') orderBy = 'lemma ASC';
    if (sort === 'za') orderBy = 'lemma DESC';
    if (sort === 'newest') orderBy = 'created_at DESC';
    if (sort === 'oldest') orderBy = 'created_at ASC';

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM words ${whereSql}`,
      params
    );
    const total = countRes.rows[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / validatedLimit) || 1);

    const dataParams = [...params, validatedLimit, offset];
    const dataRes = await pool.query(
      `
        SELECT id, lemma, part_of_speech, syllabification, contextual_meaning_en, created_at, updated_at, revision_count
        FROM words
        ${whereSql}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      dataParams
    );

    return {
      items: dataRes.rows,
      page: validatedPage,
      limit: validatedLimit,
      total,
      totalPages,
    };
  }

  async getDetails(req, wordText, include = []) {
    const pool = await getPool(req);
    const inc = new Set(include.map(s => String(s || '').toLowerCase()));

    const selectFields = [
      'id',
      'lemma',
      'syllabification',
      'other_common_meanings',
      'image_differentiation_zh',
    ];
    if (inc.has('rawyaml')) {
      selectFields.push('original_yaml');
    }

    const wordRes = await pool.query(
      `SELECT ${selectFields.join(', ')} FROM words WHERE lower(lemma) = $1`,
      [String(wordText).toLowerCase()]
    );

    if (wordRes.rows.length === 0) {
      return null;
    }

    const base = wordRes.rows[0];
    const queries = [];
    const keys = [];

    if (inc.has('etymology')) {
      queries.push(
        pool.query(
          `SELECT prefix, root, suffix, structure_analysis, history_myth, source_word, pie_root, visual_imagery_zh, meaning_evolution_zh FROM etymologies WHERE word_id = $1`,
          [base.id]
        )
      );
      keys.push('etymology');
    }
    if (inc.has('cognates')) {
      queries.push(
        pool.query(`SELECT cognate_word, logic FROM cognates WHERE word_id = $1`, [base.id])
      );
      keys.push('cognates');
    }
    if (inc.has('examples')) {
      queries.push(
        pool.query(
          `SELECT example_type, sentence, translation_zh FROM examples WHERE word_id = $1`,
          [base.id]
        )
      );
      keys.push('examples');
    }
    if (inc.has('synonyms')) {
      queries.push(
        pool.query(`SELECT synonym_word, meaning_zh FROM synonyms WHERE word_id = $1`, [base.id])
      );
      keys.push('synonyms');
    }

    if (queries.length) {
      const results = await Promise.all(queries);
      results.forEach((r, i) => {
        const k = keys[i];
        base[k] = k === 'etymology' ? r.rows[0] || null : r.rows;
      });
    }

    return {
      lemma: base.lemma,
      syllabification: base.syllabification,
      other_common_meanings: base.other_common_meanings,
      image_differentiation_zh: base.image_differentiation_zh,
      ...(inc.has('rawyaml') ? { original_yaml: base.original_yaml } : {}),
      ...(inc.has('etymology') ? { etymology: base.etymology ?? null } : {}),
      ...(inc.has('cognates') ? { cognates: base.cognates ?? [] } : {}),
      ...(inc.has('examples') ? { examples: base.examples ?? [] } : {}),
      ...(inc.has('synonyms') ? { synonyms: base.synonyms ?? [] } : {}),
    };
  }

  async logUserRequest(client, wordId, userWord, userContext) {
    if (!userWord && !userContext) return;

    await client.query(
      `
        INSERT INTO user_requests (word_id, user_input, context_sentence)
        VALUES ($1, $2, $3)
      `,
      [wordId, userWord, userContext]
    );
  }
}

module.exports = new WordRepository();
