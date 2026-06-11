const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
const { and, asc, count, desc, eq, sql } = require('drizzle-orm') as typeof import('drizzle-orm');
const { getDb } = require('../../db') as {
  getDb: () => DrizzleLike;
};
const { wordsV2 } = require('../../db/schema') as typeof import('../../db/schema');
const { readWordSchemaVersion, isLatestWordSchemaVersion } =
  require('../../schemas/word/version') as {
    readWordSchemaVersion: (content: unknown) => number;
    isLatestWordSchemaVersion: (version: number) => boolean;
  };

type SortMode = 'az' | 'za' | 'newest' | 'oldest' | 'updated-newest' | 'updated-oldest' | string;
type WordRow = typeof wordsV2.$inferSelect;
type DrizzleLike = any;

interface WordRecord {
  id: string;
  lemma: string;
  language: string;
  part_of_speech: string | null;
  content: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  revision_count: number;
  word_schema_version: number;
  is_latest_schema: boolean;
}

interface CreateWordDataV2 {
  id?: string;
  lemma?: string;
  language?: string;
  partOfSpeech?: string | null;
  content: Record<string, unknown>;
}

interface UpdateWordDataV2 {
  partOfSpeech?: string | null;
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
  items: WordRecord[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const parseContent = (content: unknown): Record<string, unknown> => {
  if (typeof content === 'string') {
    return JSON.parse(content) as Record<string, unknown>;
  }
  return (content || {}) as Record<string, unknown>;
};

const toWordRecord = (row: WordRow | undefined): WordRecord | null => {
  if (!row) return null;
  const content = parseContent(row.content);
  const wordSchemaVersion = row.wordSchemaVersion ?? readWordSchemaVersion(content);
  return {
    id: row.id,
    lemma: row.lemma,
    language: row.language,
    part_of_speech: row.partOfSpeech,
    content,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    revision_count: row.revisionCount,
    word_schema_version: wordSchemaVersion,
    is_latest_schema: isLatestWordSchemaVersion(wordSchemaVersion),
  };
};

const getClient = (client?: DrizzleLike | null): DrizzleLike => client || getDb();

class WordRepositoryV2 {
  findByLemma(
    lemma: string,
    language: string,
    client: DrizzleLike | null = null
  ): WordRecord | null {
    const db = getClient(client);
    const row = db
      .select()
      .from(wordsV2)
      .where(
        and(sql`lower(${wordsV2.lemma}) = ${lemma.toLowerCase()}`, eq(wordsV2.language, language))
      )
      .get();
    return toWordRecord(row);
  }

  findById(id: string, client: DrizzleLike | null = null): WordRecord | null {
    const db = getClient(client);
    const row = db.select().from(wordsV2).where(eq(wordsV2.id, id)).get();
    return toWordRecord(row);
  }

  create(wordData: CreateWordDataV2, client: DrizzleLike | null = null): WordRecord {
    const db = getClient(client);
    const id = wordData.id || randomUUID();
    const values = {
      id,
      lemma: wordData.lemma || '',
      language: wordData.language || 'en',
      partOfSpeech: wordData.partOfSpeech ?? null,
      content: wordData.content,
      wordSchemaVersion: readWordSchemaVersion(wordData.content),
    };

    db.insert(wordsV2).values(values).run();

    const created = this.findById(id, db);
    if (!created) {
      throw new Error(`Failed to create word ${values.lemma}`);
    }
    return created;
  }

  update(id: string, wordData: UpdateWordDataV2, client: DrizzleLike | null = null): void {
    const db = getClient(client);
    db.update(wordsV2)
      .set({
        partOfSpeech: wordData.partOfSpeech ?? null,
        content: wordData.content,
        wordSchemaVersion: readWordSchemaVersion(wordData.content),
        updatedAt: sql`datetime('now')`,
        revisionCount: sql`${wordsV2.revisionCount} + 1`,
      })
      .where(eq(wordsV2.id, id))
      .run();
  }

  delete(id: string, client: DrizzleLike | null = null): void {
    const db = getClient(client);
    db.delete(wordsV2).where(eq(wordsV2.id, id)).run();
  }

  listPaged(options: ListPagedOptionsV2): PagedWordsResult {
    const db = getDb();
    const { page = 1, limit = 20, search = '', sort = 'updated-newest', language = 'en' } = options;

    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(200, Math.max(1, limit));
    const offset = (validatedPage - 1) * validatedLimit;

    const conditions = [eq(wordsV2.language, language)];
    if (search) {
      conditions.push(sql`lower(${wordsV2.lemma}) LIKE ${`%${search.toLowerCase()}%`}`);
    }

    let orderBy = desc(wordsV2.createdAt);
    if (sort === 'az') orderBy = asc(wordsV2.lemma);
    if (sort === 'za') orderBy = desc(wordsV2.lemma);
    if (sort === 'newest') orderBy = desc(wordsV2.createdAt);
    if (sort === 'oldest') orderBy = asc(wordsV2.createdAt);
    if (sort === 'updated-newest') orderBy = desc(wordsV2.updatedAt);
    if (sort === 'updated-oldest') orderBy = asc(wordsV2.updatedAt);

    const whereClause = and(...conditions);
    const totalRow = db.select({ total: count() }).from(wordsV2).where(whereClause).get();
    const total = Number(totalRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / validatedLimit) || 1);

    const rows = db
      .select()
      .from(wordsV2)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(validatedLimit)
      .offset(offset)
      .all();

    return {
      items: rows.map((row: WordRow) => toWordRecord(row) as WordRecord),
      page: validatedPage,
      limit: validatedLimit,
      total,
      totalPages,
    };
  }

  // NOTE: logUserRequest is not implemented for v2 because user_requests
  // has an FK constraint referencing old words.id. When old tables are retired,
  // create user_requests_v2 or drop the FK constraint.
}

module.exports = new WordRepositoryV2();
