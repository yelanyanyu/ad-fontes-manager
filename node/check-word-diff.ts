/**
 * 查询指定词条内容，可选与 YAML 文件对比
 * 使用方法: npx tsx check-word-diff.ts <word_lemma> [yaml_file]
 * 示例: npx tsx check-word-diff.ts interrogate
 *       npx tsx check-word-diff.ts interrogate ../example.yml
 */
import Database from 'better-sqlite3';
import yaml from 'js-yaml';
import { diff } from 'deep-diff';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const rootDir = path.resolve(__dirname, '..');
const rawPath = process.env.DATABASE_URL || path.resolve(rootDir, 'web/data/ad_fontes.db');
const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(rootDir, rawPath);

const wordLemma = process.argv[2];
const yamlFile = process.argv[3];

if (!wordLemma) {
  console.error('请提供要查询的词条名称');
  console.error('用法: npx tsx check-word-diff.ts <word_lemma> [yaml_file]');
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

function checkWordDiff(lemma: string): void {
  if (!fs.existsSync(resolvedPath)) {
    console.error(`SQLite database not found: ${resolvedPath}`);
    process.exit(1);
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');

  try {
    const row = db
      .prepare('SELECT * FROM words_v2 WHERE lower(lemma) = ?')
      .get(lemma.toLowerCase()) as WordRow | undefined;

    if (!row) {
      console.log(`❌ 数据库中未找到词条: ${lemma}`);
      return;
    }

    let content: unknown;
    try {
      content = JSON.parse(row.content);
    } catch {
      content = row.content;
    }

    console.log(`\n📋 数据库记录:`);
    console.log(`   ID: ${row.id}`);
    console.log(`   Lemma: ${row.lemma}`);
    console.log(`   Language: ${row.language}`);
    console.log(`   Part of Speech: ${row.part_of_speech || 'N/A'}`);
    console.log(`   Revision: ${row.revision_count}`);
    console.log(`   Updated: ${row.updated_at}`);

    if (yamlFile) {
      const yamlPath = path.resolve(yamlFile);
      if (!fs.existsSync(yamlPath)) {
        console.log(`\n❌ YAML file not found: ${yamlPath}`);
        return;
      }

      const yamlStr = fs.readFileSync(yamlPath, 'utf8');
      const yamlData = yaml.load(yamlStr);

      console.log(`\n🔍 对比数据库内容 vs YAML 文件...`);

      const differences = diff(yamlData, content);

      if (differences) {
        console.log(`\n⚠️  发现差异 (${differences.length} 处):\n`);
        for (const d of differences.slice(0, 30)) {
          console.log(`   路径: ${(d as { path?: string[] }).path?.join('.') || 'root'}`);
          console.log(`   类型: ${(d as { kind: string }).kind}`);
          if ((d as { lhs?: unknown }).lhs !== undefined) {
            console.log(`   文件值: ${JSON.stringify((d as { lhs?: unknown }).lhs)}`);
          }
          if ((d as { rhs?: unknown }).rhs !== undefined) {
            console.log(`   数据库值: ${JSON.stringify((d as { rhs?: unknown }).rhs)}`);
          }
          console.log('');
        }
        if (differences.length > 30) {
          console.log(`   ... 和 ${differences.length - 30} 处更多差异`);
        }
      } else {
        console.log(`\n✅ 数据完全一致`);
      }

      console.log('\n─'.repeat(60));
      console.log('文件 YAML (前500字符):');
      console.log(yamlStr.substring(0, 500) + (yamlStr.length > 500 ? '...' : ''));
    } else {
      console.log('\n─'.repeat(60));
      console.log('数据库内容 (YAML):');
      console.log(yaml.dump(content));
    }
  } catch (error) {
    console.error('查询出错:', error);
  } finally {
    db.close();
  }
}

checkWordDiff(wordLemma);
