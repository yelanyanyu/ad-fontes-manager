/**
 * 查看数据库中词条的内容 (YAML 格式输出)
 * 使用方法: npx tsx view-word-yaml.ts <word_lemma> [language]
 * 示例: npx tsx view-word-yaml.ts interrogate
 *       npx tsx view-word-yaml.ts See de
 */
import Database from 'better-sqlite3';
import yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const rootDir = path.resolve(__dirname, '..');
const rawPath = process.env.DATABASE_URL || path.resolve(rootDir, 'data/ad_fontes.db');
const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(rootDir, rawPath);

const wordLemma = process.argv[2];
const language = process.argv[3] || 'en';

if (!wordLemma) {
  console.error('请提供要查询的词条名称');
  console.error('用法: npx tsx view-word-yaml.ts <word_lemma> [language]');
  process.exit(1);
}

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

function viewWordYaml(lemma: string, lang: string): void {
  if (!fs.existsSync(resolvedPath)) {
    console.error(`SQLite database not found: ${resolvedPath}`);
    process.exit(1);
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');

  try {
    const rows = db
      .prepare('SELECT * FROM words_v2 WHERE lower(lemma) = ? AND language = ?')
      .all(lemma.toLowerCase(), lang) as WordRow[];

    if (rows.length === 0) {
      console.log(`❌ 数据库中未找到词条: ${lemma} (language: ${lang})`);
      return;
    }

    for (const row of rows) {
      let content: unknown;
      try {
        content = JSON.parse(row.content);
      } catch {
        content = row.content;
      }

      console.log(`\n📋 词条: ${row.lemma}`);
      console.log(`🆔 ID: ${row.id}`);
      console.log(`🌐 Language: ${row.language}`);
      console.log(`📝 Revision: ${row.revision_count}`);
      console.log(`📅 Updated: ${row.updated_at}`);
      console.log('\n' + '═'.repeat(60));
      console.log('📄 内容 (YAML):');
      console.log('═'.repeat(60) + '\n');
      console.log(yaml.dump(content));
    }
  } catch (error) {
    console.error('查询出错:', error);
  } finally {
    db.close();
  }
}

viewWordYaml(wordLemma, language);
