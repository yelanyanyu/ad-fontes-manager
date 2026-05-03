import path from 'node:path';
import fs from 'node:fs';

export interface DatabaseUrlParts {
  user: string;
  password: string;
  host: string;
  port: string;
  database: string;
}

export interface DbQueryResult<T extends Record<string, unknown> = Record<string, unknown>> {
  rows: T[];
}

export interface DbQueryClient {
  query: (sql: string, params?: unknown[]) => Promise<DbQueryResult>;
}

export interface DbPoolClient extends DbQueryClient {
  release: () => void;
}

const DB_URL_REGEX = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;

export function parseDatabaseUrl(dbUrl: string): DatabaseUrlParts | null {
  const match = dbUrl.match(DB_URL_REGEX);
  if (!match) {
    return null;
  }

  const [, user, password, host, port, database] = match;
  return { user, password, host, port, database };
}

export function resolveDbPath(dbUrl: string, projectRoot: string = process.cwd()): string {
  if (dbUrl.startsWith('postgres')) {
    throw new Error('PostgreSQL connections are no longer supported. Use a SQLite file path.');
  }
  if (path.isAbsolute(dbUrl)) return dbUrl;
  return path.resolve(projectRoot, dbUrl);
}

export function openSqliteDb(dbUrl: string) {
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  const dbPath = resolveDbPath(dbUrl);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}
