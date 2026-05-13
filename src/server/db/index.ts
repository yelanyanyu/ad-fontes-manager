import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const config = require('../utils/config') as {
  get: <T = unknown>(path: string, defaultValue?: T) => T;
};

type SqliteDatabase = Database.Database;
type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let sqlite: SqliteDatabase | null = null;
let db: DrizzleDb | null = null;
let currentDbPath: string | null = null;

const ensureDatabaseSchema = (target: SqliteDatabase): void => {
  target.exec(`
    CREATE TABLE IF NOT EXISTS words_v2 (
      id TEXT PRIMARY KEY NOT NULL,
      lemma TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      part_of_speech TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      revision_count INTEGER NOT NULL DEFAULT 1
    );

    CREATE UNIQUE INDEX IF NOT EXISTS unique_lemma_lang_v2
      ON words_v2 (lemma, language);
    CREATE INDEX IF NOT EXISTS idx_words_v2_language
      ON words_v2 (language);
    CREATE INDEX IF NOT EXISTS idx_words_v2_lemma_lang
      ON words_v2 (lemma, language);
    CREATE INDEX IF NOT EXISTS idx_words_v2_lower_lemma_lang
      ON words_v2 (LOWER(lemma), language);
    CREATE INDEX IF NOT EXISTS idx_words_v2_created_at
      ON words_v2 (created_at);
    CREATE INDEX IF NOT EXISTS idx_words_v2_updated_at
      ON words_v2 (updated_at);

    CREATE TABLE IF NOT EXISTS job_queue (
      id TEXT PRIMARY KEY NOT NULL,
      batch_id TEXT,
      job_type TEXT NOT NULL CHECK(job_type IN ('generate', 'fix', 'audit-fix')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'high')),
      status TEXT NOT NULL DEFAULT 'queued',
      word TEXT,
      language TEXT,
      context TEXT,
      notes TEXT,
      target_job_id TEXT,
      target_word_id TEXT,
      provider_id TEXT,
      result_yaml TEXT,
      result_scores TEXT,
      progress_events TEXT,
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 2,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_job_queue_batch_id ON job_queue(batch_id);
    CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
    CREATE INDEX IF NOT EXISTS idx_job_queue_priority_created ON job_queue(priority, created_at);
    CREATE INDEX IF NOT EXISTS idx_job_queue_status_priority_created
      ON job_queue(status, priority, created_at);
    CREATE INDEX IF NOT EXISTS idx_job_queue_history_status_completed
      ON job_queue(status, completed_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_job_queue_word_language
      ON job_queue(word, language);
    CREATE INDEX IF NOT EXISTS idx_job_queue_workset_today
      ON job_queue(status, language, word, completed_at, created_at)
      WHERE result_yaml IS NOT NULL AND result_yaml <> '';
  `);

  // Migrate existing job_queue tables that may be missing columns added in later
  // schema versions.  ALTER TABLE … ADD COLUMN throws if the column already exists,
  // so we run each addition in a try/catch guard.
  const jobQueueAdditions = [
    'ALTER TABLE job_queue ADD COLUMN provider_id TEXT',
    'ALTER TABLE job_queue ADD COLUMN target_job_id TEXT',
    'ALTER TABLE job_queue ADD COLUMN target_word_id TEXT',
    'ALTER TABLE job_queue ADD COLUMN result_scores TEXT',
    'ALTER TABLE job_queue ADD COLUMN progress_events TEXT',
    'ALTER TABLE job_queue ADD COLUMN retry_count INTEGER DEFAULT 0',
    'ALTER TABLE job_queue ADD COLUMN max_retries INTEGER DEFAULT 2',
    'ALTER TABLE job_queue ADD COLUMN started_at TEXT',
    'ALTER TABLE job_queue ADD COLUMN completed_at TEXT',
  ];
  for (const sql of jobQueueAdditions) {
    try {
      target.exec(sql);
    } catch {
      // Column already exists — fine.
    }
  }
};

const resolveDbPath = (): string => {
  if (process.env.DATABASE_URL) {
    return path.isAbsolute(process.env.DATABASE_URL)
      ? process.env.DATABASE_URL
      : path.resolve(process.cwd(), process.env.DATABASE_URL);
  }

  const configuredPath = config.get<string>('database.url', './data/ad_fontes.db');
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, '..', configuredPath);
};

const openSqlite = (): SqliteDatabase => {
  const targetPath = resolveDbPath();

  if (sqlite && currentDbPath === targetPath) {
    return sqlite;
  }

  if (sqlite) {
    sqlite.close();
  }

  const dbDir = path.dirname(targetPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  sqlite = new Database(targetPath);
  currentDbPath = targetPath;

  try {
    sqlite.pragma('journal_mode = WAL');
  } catch {
    sqlite.pragma('journal_mode = DELETE');
  }
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  ensureDatabaseSchema(sqlite);

  return sqlite;
};

const getSqlite = (): SqliteDatabase => openSqlite();

const getDb = (): DrizzleDb => {
  const sqliteDb = openSqlite();
  if (!db || currentDbPath !== resolveDbPath()) {
    db = drizzle(sqliteDb, { schema });
  }
  return db;
};

const closeDb = (): void => {
  if (sqlite) {
    sqlite.close();
  }
  sqlite = null;
  db = null;
  currentDbPath = null;
};

module.exports = { getDb, getSqlite, closeDb };
