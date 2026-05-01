import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const config = require('../utils/config.ts') as {
  get: <T = unknown>(path: string, defaultValue?: T) => T;
};

type SqliteDatabase = Database.Database;
type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let sqlite: SqliteDatabase | null = null;
let db: DrizzleDb | null = null;
let currentDbPath: string | null = null;

const resolveDbPath = (): string => {
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

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

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
