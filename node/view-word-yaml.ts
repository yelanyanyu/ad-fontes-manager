/**
 * 查看数据库中词条的原始 YAML 数据
 * 使用方法: tsx view-word-yaml.ts <word_lemma>
 * 示例: tsx view-word-yaml.ts interrogate
 */

import { Pool } from 'pg';
import yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

// 读取 .env 文件
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  }
}

loadEnv();

const wordLemma = process.argv[2];

if (!wordLemma) {
  console.error('请提供要查询的词条名称');
  console.error('用法: tsx view-word-yaml.ts <word_lemma>');
  process.exit(1);
}

// 解析 DATABASE_URL
function parseDatabaseUrl(url: string) {
  const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) {
    throw new Error('无法解析 DATABASE_URL');
  }
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4]),
    database: match[5],
  };
}

async function viewWordYaml(lemma: string) {
  const dbConfig = process.env.DATABASE_URL 
    ? parseDatabaseUrl(process.env.DATABASE_URL)
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'ad_fontes',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
      };

  const pool = new Pool(dbConfig);

  try {
    // 查询数据库中的词条
    const dbResult = await pool.query(
      'SELECT id, lemma, original_yaml FROM words WHERE lower(lemma) = $1',
      [lemma.toLowerCase()]
    );

    if (dbResult.rows.length === 0) {
      console.log(`❌ 数据库中未找到词条: ${lemma}`);
      return;
    }

    const dbRecord = dbResult.rows[0];
    console.log(`\n📋 词条: ${dbRecord.lemma}`);
    console.log(`🆔 ID: ${dbRecord.id}`);
    console.log('\n' + '═'.repeat(60));
    console.log('📄 原始 YAML 数据:');
    console.log('═'.repeat(60) + '\n');
    
    if (dbRecord.original_yaml) {
      console.log(yaml.dump(dbRecord.original_yaml));
    } else {
      console.log('❌ 没有原始 YAML 数据');
    }

  } catch (error) {
    console.error('查询出错:', error);
  } finally {
    await pool.end();
  }
}

viewWordYaml(wordLemma);
