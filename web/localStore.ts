const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const crypto = require('crypto') as typeof import('crypto');
const { eq, desc, sql } = require('drizzle-orm') as typeof import('drizzle-orm');
const { getDb, getSqlite } = require('./db') as {
  getDb: () => any;
  getSqlite: () => {
    prepare: (sql: string) => { get: () => unknown };
    exec: (sql: string) => void;
  };
};
const { localWords, localConfig } = require('./db/schema') as typeof import('./db/schema');
const config = require('./utils/config.ts') as {
  get: <T = unknown>(lookupPath: string, defaultValue?: T) => T;
  reload: () => Record<string, unknown>;
};

type LocalWordItem = {
  id: string;
  raw_yaml: string;
  lemma_preview: string | null;
  updated_at: number;
};

type LocalConfig = {
  DATABASE_URL?: string;
  API_PORT?: number;
  CLIENT_DEV_PORT?: number;
  MAX_LOCAL_ITEMS?: number;
  [key: string]: unknown;
};

type DrizzleLocalWordRow = {
  id: string;
  rawYaml: string;
  lemmaPreview: string | null;
  updatedAt: number;
};

type DrizzleConfigRow = {
  key: string;
  value: string;
};

const ensureTablesExist = (): void => {
  const sqlite = getSqlite();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS local_words (
      id TEXT PRIMARY KEY NOT NULL,
      raw_yaml TEXT NOT NULL,
      lemma_preview TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS local_config (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
};

const toLocalWordItem = (row: DrizzleLocalWordRow): LocalWordItem => ({
  id: row.id,
  raw_yaml: row.rawYaml,
  lemma_preview: row.lemmaPreview,
  updated_at: row.updatedAt,
});

const migrateOldJsonIfNeeded = (dataFile: string): void => {
  if (!fs.existsSync(dataFile)) return;

  const db = getDb();
  const countRow = db
    .select({ cnt: sql`count(*)` })
    .from(localWords)
    .get();
  if (Number(countRow?.cnt || 0) > 0) return;

  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    const items = JSON.parse(raw) as LocalWordItem[];

    if (!Array.isArray(items) || items.length === 0) return;

    const insertCount = items.reduce((n, item) => {
      try {
        db.insert(localWords)
          .values({
            id: item.id || crypto.randomUUID(),
            rawYaml: item.raw_yaml || '',
            lemmaPreview: item.lemma_preview || null,
            updatedAt: item.updated_at || Date.now(),
          })
          .run();
        return n + 1;
      } catch {
        return n;
      }
    }, 0);

    if (insertCount > 0) {
      const migratedPath = dataFile.replace(/\.json$/, '.json.migrated');
      fs.renameSync(dataFile, migratedPath);
      console.log(
        `[LocalStore] Migrated ${insertCount}/${items.length} items from ${path.basename(dataFile)} to SQLite. Old file: ${path.basename(migratedPath)}`
      );
    }
  } catch (error) {
    console.error('[LocalStore] JSON migration error:', error);
  }
};

class LocalStore {
  private dataFile: string;
  private limit: number;
  private migrated: boolean;

  constructor() {
    this.dataFile = path.join(__dirname, 'data', 'local_words.json');
    this.limit = Number(config.get<number>('storage.max_items', 100)) || 100;
    this.migrated = false;
  }

  private _ensureReady(): void {
    ensureTablesExist();
    if (!this.migrated) {
      migrateOldJsonIfNeeded(this.dataFile);
      this.migrated = true;
    }
  }

  getConfig(): LocalConfig {
    this._ensureReady();
    const db = getDb();
    const rows = db.select().from(localConfig).all() as DrizzleConfigRow[];
    const stored: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        stored[row.key] = JSON.parse(row.value);
      } catch {
        stored[row.key] = row.value;
      }
    }

    return {
      DATABASE_URL:
        (stored.DATABASE_URL as string) ||
        config.get<string | null>('database.url', null) ||
        undefined,
      API_PORT: Number(stored.API_PORT || config.get<number>('server.port', 8080)),
      CLIENT_DEV_PORT: Number(
        stored.CLIENT_DEV_PORT || config.get<number>('client.dev_port', 5173)
      ),
      MAX_LOCAL_ITEMS: Number(stored.MAX_LOCAL_ITEMS || this.limit),
      ...stored,
    };
  }

  saveConfig(nextConfig: Record<string, unknown>): void {
    this._ensureReady();
    const db = getDb();

    if (typeof nextConfig.DATABASE_URL === 'string' && nextConfig.DATABASE_URL.trim()) {
      process.env.DATABASE_URL = nextConfig.DATABASE_URL.trim();
    }

    if (nextConfig.MAX_LOCAL_ITEMS !== undefined && nextConfig.MAX_LOCAL_ITEMS !== null) {
      process.env.MAX_LOCAL_ITEMS = String(nextConfig.MAX_LOCAL_ITEMS);
      const parsed = Number.parseInt(String(nextConfig.MAX_LOCAL_ITEMS), 10);
      this.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
    }

    for (const [key, value] of Object.entries(nextConfig)) {
      if (value !== undefined && value !== null) {
        db.insert(localConfig)
          .values({ key, value: JSON.stringify(value) })
          .onConflictDoUpdate({ target: localConfig.key, set: { value: JSON.stringify(value) } })
          .run();
      }
    }

    config.reload();
  }

  getAll(): LocalWordItem[] {
    this._ensureReady();
    const db = getDb();
    const rows = db
      .select()
      .from(localWords)
      .orderBy(desc(localWords.updatedAt))
      .all() as DrizzleLocalWordRow[];

    return rows.map(toLocalWordItem);
  }

  findByLemma(lemma: string): LocalWordItem | null {
    if (!lemma) return null;
    this._ensureReady();

    const items = this.getAll();
    const target = lemma.toLowerCase();

    return (
      items.find(item => {
        if (item.lemma_preview) return item.lemma_preview.toLowerCase() === target;
        try {
          const match = item.raw_yaml.match(/lemma:\s*"?([^"\n]+)"?/);
          if (match && match[1].trim().toLowerCase() === target) return true;
        } catch {
          return false;
        }
        return false;
      }) || null
    );
  }

  save(rawYaml: string, id: string | null = null): string {
    this._ensureReady();
    const db = getDb();

    let lemma: string | null = null;
    try {
      const match = rawYaml.match(/lemma:\s*"?([^"\n]+)"?/);
      if (match) lemma = match[1].trim();
    } catch {
      lemma = null;
    }

    if (id) {
      const existing = db.select().from(localWords).where(eq(localWords.id, id)).get() as
        | DrizzleLocalWordRow
        | undefined;

      if (existing) {
        db.update(localWords)
          .set({
            rawYaml: rawYaml,
            lemmaPreview: lemma,
            updatedAt: Date.now(),
          })
          .where(eq(localWords.id, id))
          .run();
        return id;
      }
    }

    const countRow = db
      .select({ cnt: sql`count(*)` })
      .from(localWords)
      .get();
    if (Number(countRow?.cnt || 0) >= this.limit) {
      throw new Error(`Local storage limit reached (${this.limit}). Please sync or delete items.`);
    }

    const newId = crypto.randomUUID();
    db.insert(localWords)
      .values({
        id: newId,
        rawYaml: rawYaml,
        lemmaPreview: lemma,
        updatedAt: Date.now(),
      })
      .run();

    return newId;
  }

  delete(id: string): void {
    this._ensureReady();
    const db = getDb();
    db.delete(localWords).where(eq(localWords.id, id)).run();
  }

  clear(): void {
    this._ensureReady();
    const db = getDb();
    db.delete(localWords).run();
  }
}

module.exports = new LocalStore();
