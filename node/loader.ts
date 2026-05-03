/**
 * YAML to SQLite words_v2 loader
 * 使用方法: npx tsx loader.ts <yaml_file> [--force]
 *   --force  覆盖已存在的 (lemma, language) 词条
 */
import Database from 'better-sqlite3';
import yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const rootDir = path.resolve(__dirname, '..');
const rawPath = process.env.DATABASE_URL || path.resolve(rootDir, 'data/ad_fontes.db');
const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(rootDir, rawPath);

const yamlFile = process.argv[2];
const forceUpdate = process.argv.includes('--force');

if (!yamlFile) {
  console.error('用法: npx tsx loader.ts <yaml_file> [--force]');
  console.error('  --force  覆盖已存在的 (lemma, language) 词条');
  process.exit(1);
}

if (!fs.existsSync(yamlFile)) {
  console.error(`File not found: ${yamlFile}`);
  process.exit(1);
}

interface WordRow {
  id: string;
  lemma: string;
  language: string;
  revision_count: number;
}

function detectLanguage(data: Record<string, unknown>): string {
  if ((data as { yield?: { language?: string } }).yield?.language === 'de') return 'de';
  if ((data as { yield?: { language?: string } }).yield?.language === 'en') return 'en';
  const cm = (data as { yield?: { contextual_meaning?: Record<string, unknown> } }).yield
    ?.contextual_meaning;
  if (cm?.de && !cm?.en) return 'de';
  return 'en';
}

function loadYamlToDb(): void {
  if (!fs.existsSync(resolvedPath)) {
    console.error(`SQLite database not found: ${resolvedPath}`);
    console.error('Run "npx tsx init_db.ts" first.');
    process.exit(1);
  }

  const yamlStr = fs.readFileSync(path.resolve(yamlFile), 'utf8');

  let data: Record<string, unknown>;
  try {
    data = yaml.load(yamlStr) as Record<string, unknown>;
  } catch (err) {
    console.error('YAML parse error:', (err as { message?: string }).message);
    process.exit(1);
  }

  if (!data || typeof data !== 'object') {
    console.error('YAML must be an object at the root level');
    process.exit(1);
  }

  const yieldData = (data as { yield?: Record<string, unknown> }).yield || {};
  const lemma = String(yieldData.lemma || '').trim();
  if (!lemma) {
    console.error('YAML missing yield.lemma');
    process.exit(1);
  }

  const language = detectLanguage(data);

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    const existing = db
      .prepare(
        'SELECT id, lemma, language, revision_count FROM words_v2 WHERE lower(lemma) = ? AND language = ?'
      )
      .get(lemma.toLowerCase(), language) as WordRow | undefined;

    if (existing && !forceUpdate) {
      console.log(
        `词条已存在: ${existing.lemma} (${existing.language}) ID=${existing.id} rev=${existing.revision_count}`
      );
      console.log('使用 --force 覆盖已存在的词条');
      return;
    }

    const now = new Date().toISOString();
    db.transaction(() => {
      if (existing) {
        db.prepare(
          `UPDATE words_v2
           SET part_of_speech = ?, content = ?, updated_at = ?, revision_count = revision_count + 1
           WHERE id = ?`
        ).run((yieldData.part_of_speech as string) || null, JSON.stringify(data), now, existing.id);
        console.log(
          `Updated: ${lemma} (${language}) ID=${existing.id} rev=${existing.revision_count + 1}`
        );
      } else {
        const id = crypto.randomUUID();
        db.prepare(
          `INSERT INTO words_v2 (id, lemma, language, part_of_speech, content, created_at, updated_at, revision_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
        ).run(
          id,
          lemma,
          language,
          (yieldData.part_of_speech as string) || null,
          JSON.stringify(data),
          now,
          now
        );
        console.log(`Created: ${lemma} (${language}) ID=${id}`);
      }
    })();
  } finally {
    db.close();
  }
}

loadYamlToDb();
