const { getPool } = require('../../db') as {
  getPool: () => Promise<DbPoolLike>;
};

type SortMode = 'az' | 'za' | 'newest' | 'oldest' | string;

interface RequestLike {
  id?: string;
  query?: Record<string, unknown>;
}

interface DbQueryResult<T = Record<string, unknown>> {
  rows: T[];
}

interface DbClientLike {
  query: (sql: string, params?: unknown[]) => Promise<DbQueryResult>;
  release?: () => void;
}

interface DbPoolLike extends DbClientLike {
  connect: () => Promise<DbClientLike>;
}

interface WordRecord {
  id: string;
  lemma: string;
  language: string;
  part_of_speech: string | null;
  content: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  revision_count: number;
}

interface CreateWordDataV2 {
  lemma?: string;
  language?: string;
  partOfSpeech?: string;
  content: Record<string, unknown>;
}

interface UpdateWordDataV2 {
  partOfSpeech?: string;
  content: Record<string, unknown>;
}

interface ListPagedOptionsV2 {
  page?: number;
  limit?: number;
  search?: string;
  sort?: SortMode;
  language?: string;
}

interface PagedWordsResult {
  items: Record<string, unknown>[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

class WordRepositoryV2 {
  async findByLemma(
    lemma: string,
    language: string,
    client: DbClientLike | null = null
  ): Promise<WordRecord | null> {
    const dbClient = client || (await getPool());
    const result = await dbClient.query(
      'SELECT * FROM words_v2 WHERE lower(lemma) = $1 AND language = $2',
      [lemma.toLowerCase(), language]
    );
    return (result.rows[0] as unknown as WordRecord | undefined) || null;
  }

  async findById(
    id: string,
    client: DbClientLike | null = null
  ): Promise<WordRecord | null> {
    const dbClient = client || (await getPool());
    const result = await dbClient.query(
      'SELECT * FROM words_v2 WHERE id = $1',
      [id]
    );
    return (result.rows[0] as unknown as WordRecord | undefined) || null;
  }

  async create(
    wordData: CreateWordDataV2,
    client: DbClientLike
  ): Promise<WordRecord> {
    const { lemma, language, partOfSpeech, content } = wordData;

    const result = await client.query(
      `INSERT INTO words_v2 (lemma, language, part_of_speech, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, lemma, language`,
      [lemma, language, partOfSpeech, content]
    );

    return result.rows[0] as unknown as WordRecord;
  }

  async update(
    id: string,
    wordData: UpdateWordDataV2,
    client: DbClientLike
  ): Promise<void> {
    const { partOfSpeech, content } = wordData;

    await client.query(
      `UPDATE words_v2 SET
         part_of_speech = $1,
         content = $2,
         revision_count = revision_count + 1,
         updated_at = now()
       WHERE id = $3`,
      [partOfSpeech, content, id]
    );
  }

  async delete(
    id: string,
    client: DbClientLike | null = null
  ): Promise<void> {
    const dbClient = client || (await getPool());
    await dbClient.query('DELETE FROM words_v2 WHERE id = $1', [id]);
  }

  async listPaged(options: ListPagedOptionsV2): Promise<PagedWordsResult> {
    const pool = await getPool();
    const {
      page = 1,
      limit = 20,
      search = '',
      sort = 'newest',
      language = 'en',
    } = options;

    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(200, Math.max(1, limit));
    const offset = (validatedPage - 1) * validatedLimit;

    const where: string[] = ['language = $1'];
    const params: unknown[] = [language];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`lower(lemma) LIKE $${params.length}`);
    }

    let orderBy = 'created_at DESC';
    if (sort === 'az') orderBy = 'lemma ASC';
    if (sort === 'za') orderBy = 'lemma DESC';
    if (sort === 'newest') orderBy = 'created_at DESC';
    if (sort === 'oldest') orderBy = 'created_at ASC';

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM words_v2 ${whereSql}`,
      params
    );
    const totalRow = (countRes.rows[0] || {}) as { total?: number };
    const total = Number(totalRow.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / validatedLimit) || 1);

    const dataParams = [...params, validatedLimit, offset];
    const dataRes = await pool.query(
      `SELECT id, lemma, language, part_of_speech, content, created_at, updated_at, revision_count
       FROM words_v2
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT $${params.length + 1}
       OFFSET $${params.length + 2}`,
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

  async listAll(language: string = 'en'): Promise<Record<string, unknown>[]> {
    const pool = await getPool();
    const result = await pool.query(
      `SELECT id, lemma, language, part_of_speech, content, created_at, revision_count
       FROM words_v2
       WHERE language = $1
       ORDER BY created_at DESC`,
      [language]
    );
    return result.rows;
  }

  // NOTE: logUserRequest is not implemented for v2 because user_requests
  // has an FK constraint referencing old words.id. When old tables are retired,
  // create user_requests_v2 or drop the FK constraint.
}

module.exports = new WordRepositoryV2();
