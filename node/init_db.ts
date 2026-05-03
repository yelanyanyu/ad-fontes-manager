/**
 * Ad Fontes Manager - SQLite Database Initialization
 * Usage: npx tsx init_db.ts
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const rootDir = path.resolve(__dirname, '..');
const rawPath = process.env.DATABASE_URL || path.resolve(rootDir, 'data/ad_fontes.db');
const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(rootDir, rawPath);

async function init(): Promise<void> {
  console.log('Ad Fontes Manager - SQLite Database Initialization');
  console.log('='.repeat(50));
  console.log(`Database path: ${resolvedPath}`);
  console.log('');

  const dbDir = path.dirname(resolvedPath);
  if (!fs.existsSync(dbDir)) {
    console.log(`Creating data directory: ${dbDir}`);
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const exists = fs.existsSync(resolvedPath);
  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  try {
    const migrationDir = path.resolve(rootDir, 'drizzle');
    const migrationFiles = fs
      .readdirSync(migrationDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    if (migrationFiles.length === 0) {
      console.log('No migration files found in drizzle/ directory.');
      console.log('Run "cd web && npx drizzle-kit generate" to create migrations.');
      process.exit(1);
    }

    for (const file of migrationFiles) {
      const sql = fs
        .readFileSync(path.join(migrationDir, file), 'utf8')
        .replaceAll('--> statement-breakpoint', '');

      try {
        db.exec(sql);
        console.log(`  Applied: ${file}`);
      } catch (err) {
        const msg = (err as { message?: string }).message || '';
        if (msg.includes('already exists')) {
          console.log(`  Skipped (already applied): ${file}`);
        } else {
          throw err;
        }
      }
    }

    console.log('');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    console.log('Tables in database:');
    for (const t of tables) {
      const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM "${t.name}"`).get() as {
        cnt: number;
      };
      console.log(`  - ${t.name} (${countRow.cnt} rows)`);
    }

    console.log('');
    console.log('='.repeat(50));
    if (exists) {
      console.log('Database connection verified.');
    } else {
      console.log('Database initialized successfully!');
    }
    console.log('');
    console.log('Next steps:');
    console.log('  1. cd web && npm run dev');
    console.log('  2. Open http://localhost:5173 in your browser');
    console.log('');
  } finally {
    db.close();
  }
}

void init();
