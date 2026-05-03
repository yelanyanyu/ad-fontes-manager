/**
 * 校验 SQLite words_v2 数据完整性
 * 用法: npx tsx verify-sqlite-migration.ts [--pg-check]
 *   --pg-check  可选，连接 PG_DATABASE_URL 做跨库比对
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const rootDir = path.resolve(__dirname, '..');
const sqlitePath = process.env.SQLITE_PATH || path.resolve(rootDir, 'data/ad_fontes.db');
const pgUrl = process.env.PG_DATABASE_URL;
const doPgCheck = process.argv.includes('--pg-check');

interface WordRow {
  id: string;
  lemma: string;
  language: string;
  part_of_speech: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  revision_count: number;
}

let errors = 0;
let warnings = 0;

function log(level: 'ok' | 'warn' | 'err', msg: string): void {
  const prefix = { ok: '  ✓', warn: '  ⚠', err: '  ✗' }[level];
  console.log(`${prefix} ${msg}`);
  if (level === 'err') errors++;
  if (level === 'warn') warnings++;
}

function main(): void {
  if (!fs.existsSync(sqlitePath)) {
    console.error(`SQLite file not found: ${sqlitePath}`);
    process.exit(1);
  }

  console.log(`Verifying SQLite data at: ${sqlitePath}`);
  console.log('');

  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');

  try {
    // 1. Row count
    const totalRow = db.prepare('SELECT COUNT(*) AS cnt FROM words_v2').get() as {
      cnt: number;
    };
    const total = totalRow.cnt;
    console.log(`Total rows: ${total}`);
    if (total === 0) {
      log('err', 'words_v2 is empty');
    } else {
      log('ok', `words_v2 has ${total} rows`);
    }

    // 2. Language breakdown
    const byLang = db
      .prepare('SELECT language, COUNT(*) AS cnt FROM words_v2 GROUP BY language ORDER BY language')
      .all() as Array<{ language: string; cnt: number }>;
    console.log('Language breakdown:');
    for (const row of byLang) {
      console.log(`  ${row.language}: ${row.cnt}`);
      if (row.cnt === 0) log('warn', `Language '${row.language}' has zero rows`);
    }
    if (byLang.length === 0) {
      log('warn', 'No language groups found');
    }

    // 3. Unique constraint check
    const dupes = db
      .prepare(
        'SELECT lemma, language, COUNT(*) AS cnt FROM words_v2 GROUP BY lemma, language HAVING cnt > 1'
      )
      .all() as Array<{ lemma: string; language: string; cnt: number }>;
    if (dupes.length > 0) {
      log('err', `Found ${dupes.length} duplicate (lemma, language) pairs:`);
      for (const d of dupes) {
        console.log(`    ${d.lemma} (${d.language}): ${d.cnt} copies`);
      }
    } else {
      log('ok', 'No duplicate (lemma, language) pairs');
    }

    // 4. Unique constraint enforcement
    log('ok', 'Testing unique constraint enforcement...');
    try {
      db.prepare(
        `INSERT INTO words_v2 (id, lemma, language, content)
         SELECT id, lemma, language, content FROM words_v2 LIMIT 1`
      ).run();
      log('err', 'Unique constraint did not prevent duplicate insert');
    } catch (e) {
      const msg = (e as { message?: string }).message || '';
      if (msg.includes('UNIQUE constraint failed')) {
        log('ok', 'Unique constraint enforced correctly');
      } else {
        log('warn', `Unexpected error during constraint test: ${msg}`);
      }
    }

    // 5. Content validity check (random sample)
    const sampleSize = Math.min(20, total);
    const sample = db
      .prepare('SELECT * FROM words_v2 ORDER BY RANDOM() LIMIT ?')
      .all(sampleSize) as WordRow[];

    log('ok', `Sampling ${sampleSize} rows for content validation...`);
    let contentIssues = 0;
    for (const row of sample) {
      try {
        const parsed = JSON.parse(row.content);
        if (!parsed || typeof parsed !== 'object') {
          contentIssues++;
        }
        if (!row.id || !row.lemma || !row.language) {
          log('err', `Row ${row.id || 'unknown'}: missing required field`);
        }
        if (!row.created_at) {
          log('warn', `Row ${row.id}: missing created_at`);
        }
        if (row.revision_count < 1) {
          log('warn', `Row ${row.id}: revision_count = ${row.revision_count}`);
        }
      } catch {
        contentIssues++;
        log('err', `Row ${row.id}: content is not valid JSON`);
      }
    }
    if (contentIssues === 0) {
      log('ok', `All ${sampleSize} sampled rows have valid JSON content`);
    } else {
      log('err', `${contentIssues} rows have invalid content`);
    }

    // 6. Null/empty field check
    const nullLemma = db
      .prepare('SELECT COUNT(*) AS cnt FROM words_v2 WHERE lemma IS NULL OR lemma = ?')
      .get('') as { cnt: number };
    if (nullLemma.cnt > 0) {
      log('err', `${nullLemma.cnt} rows have empty or null lemma`);
    } else {
      log('ok', 'No empty lemma fields');
    }

    const nullLang = db
      .prepare('SELECT COUNT(*) AS cnt FROM words_v2 WHERE language IS NULL OR language = ?')
      .get('') as { cnt: number };
    if (nullLang.cnt > 0) {
      log('warn', `${nullLang.cnt} rows have empty language (defaults to 'en')`);
    } else {
      log('ok', 'No empty language fields');
    }

    // 7. Cross-check with PG (optional)
    if (doPgCheck && pgUrl) {
      console.log('');
      console.log('Cross-checking with PostgreSQL...');
      crossCheckWithPg(db, total, byLang).catch((err: { message?: string }) => {
        log('err', `PG cross-check failed: ${err.message}`);
      });
    } else if (doPgCheck && !pgUrl) {
      log('warn', '--pg-check requested but PG_DATABASE_URL is not set');
    }
  } finally {
    db.close();
  }

  console.log('');
  console.log('='.repeat(40));
  console.log(`Verification complete: ${errors} error(s), ${warnings} warning(s)`);
  if (errors > 0) {
    process.exit(1);
  }
}

async function crossCheckWithPg(
  _sqlite: Database.Database,
  sqliteTotal: number,
  sqliteByLang: Array<{ language: string; cnt: number }>
): Promise<void> {
  const { Client } = require('pg') as {
    Client: new (config: { connectionString: string }) => {
      connect: () => Promise<void>;
      query: <T>(sql: string) => Promise<{ rows: T[]; rowCount: number | null }>;
      end: () => Promise<void>;
    };
  };

  const pg = new Client({ connectionString: pgUrl! });
  try {
    await pg.connect();
    const pgCount = await pg.query<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM words_v2');
    const pgTotal = parseInt(pgCount.rows[0]?.cnt || '0', 10);

    console.log(`  PG total: ${pgTotal}, SQLite total: ${sqliteTotal}`);
    if (pgTotal === sqliteTotal) {
      log('ok', 'PG and SQLite row counts match');
    } else {
      log('err', `Row count mismatch: PG=${pgTotal}, SQLite=${sqliteTotal}`);
    }

    const pgLang = await pg.query<{ language: string; cnt: string }>(
      'SELECT language, COUNT(*) AS cnt FROM words_v2 GROUP BY language ORDER BY language'
    );
    for (const row of pgLang.rows) {
      const sqliteRow = sqliteByLang.find(r => r.language === row.language);
      const sqliteCnt = sqliteRow?.cnt || 0;
      const pgCnt = parseInt(row.cnt, 10);
      const mark = sqliteCnt === pgCnt ? '✓' : `MISMATCH (PG=${pgCnt}, SQLite=${sqliteCnt})`;
      console.log(`  ${row.language}: ${mark}`);
    }
  } finally {
    await pg.end().catch(() => undefined);
  }
}

main();
