const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const Database = require('better-sqlite3') as typeof import('better-sqlite3');
const { Client } = require('pg') as {
  Client: new (config: { connectionString: string }) => {
    connect: () => Promise<void>;
    query: <T>(sql: string) => Promise<{ rows: T[]; rowCount: number | null }>;
    end: () => Promise<void>;
  };
};

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

interface PgWordRow {
  id: string;
  lemma: string;
  language: string;
  part_of_speech: string | null;
  content: unknown;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  revision_count: number | null;
}

const rootDir = path.resolve(__dirname, '../..');
const defaultSqlitePath = path.join(rootDir, 'web/data/ad_fontes.db');
const pgUrl = process.env.PG_DATABASE_URL || process.env.DATABASE_URL;
const sqlitePath = process.env.SQLITE_DATABASE_URL || defaultSqlitePath;

const toSqliteDateTime = (value: Date | string | null): string => {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
};

const ensureSqliteSchema = (db: import('better-sqlite3').Database): void => {
  const migrationPath = path.join(rootDir, 'drizzle/0000_empty_revanche.sql');
  const migrationSql = fs
    .readFileSync(migrationPath, 'utf8')
    .replaceAll('--> statement-breakpoint', '');

  db.exec(migrationSql);
};

async function importWordsV2(): Promise<void> {
  if (!pgUrl || !pgUrl.startsWith('postgres')) {
    throw new Error('Set PG_DATABASE_URL or a PostgreSQL DATABASE_URL before importing.');
  }

  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

  const pg = new Client({ connectionString: pgUrl });
  const sqlite = new Database(sqlitePath);

  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 5000');
    ensureSqliteSchema(sqlite);

    await pg.connect();
    const result = await pg.query<PgWordRow>(`
      SELECT id, lemma, language, part_of_speech, content, created_at, updated_at, revision_count
      FROM words_v2
      ORDER BY created_at ASC, id ASC
    `);

    const upsert = sqlite.prepare(`
      INSERT INTO words_v2 (
        id,
        lemma,
        language,
        part_of_speech,
        content,
        created_at,
        updated_at,
        revision_count
      )
      VALUES (
        @id,
        @lemma,
        @language,
        @part_of_speech,
        @content,
        @created_at,
        @updated_at,
        @revision_count
      )
      ON CONFLICT(lemma, language) DO UPDATE SET
        id = excluded.id,
        part_of_speech = excluded.part_of_speech,
        content = excluded.content,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        revision_count = excluded.revision_count
    `);

    const writeRows = sqlite.transaction((rows: PgWordRow[]) => {
      for (const row of rows) {
        upsert.run({
          id: row.id,
          lemma: row.lemma,
          language: row.language || 'en',
          part_of_speech: row.part_of_speech,
          content: JSON.stringify(row.content || {}),
          created_at: toSqliteDateTime(row.created_at),
          updated_at: toSqliteDateTime(row.updated_at),
          revision_count: row.revision_count || 1,
        });
      }
    });

    writeRows(result.rows);

    const byLanguage = sqlite
      .prepare(
        'SELECT language, COUNT(*) AS count FROM words_v2 GROUP BY language ORDER BY language'
      )
      .all() as Array<{ language: string; count: number }>;

    console.log(`Imported ${result.rowCount} rows from PostgreSQL words_v2.`);
    console.log(`SQLite path: ${sqlitePath}`);
    console.log(`SQLite counts: ${JSON.stringify(byLanguage)}`);
  } finally {
    await pg.end().catch(() => undefined);
    sqlite.close();
  }
}

void importWordsV2().catch((error: { message?: string; stack?: string }) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
