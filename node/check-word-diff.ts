/**
 * 查询指定词条的缓存与数据库原始 YAML 是否有差别
 * 使用方法: tsx check-word-diff.ts <word_lemma>
 * 示例: tsx check-word-diff.ts interrogate
 */

import { Pool } from 'pg';
import yaml from 'js-yaml';
import { diff } from 'deep-diff';
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
  console.error('用法: tsx check-word-diff.ts <word_lemma>');
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

async function checkWordDiff(lemma: string) {
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
    // 1. 查询数据库中的词条
    const dbResult = await pool.query(
      'SELECT id, lemma, original_yaml FROM words WHERE lower(lemma) = $1',
      [lemma.toLowerCase()]
    );

    if (dbResult.rows.length === 0) {
      console.log(`❌ 数据库中未找到词条: ${lemma}`);
      return;
    }

    const dbRecord = dbResult.rows[0];
    console.log(`\n📋 数据库记录:`);
    console.log(`   ID: ${dbRecord.id}`);
    console.log(`   Lemma: ${dbRecord.lemma}`);
    console.log(`   Original YAML 存在: ${dbRecord.original_yaml ? '✅' : '❌'}`);

    // 2. 检查本地存储（如果存在）
    const localStoragePath = path.resolve(__dirname, '../web/client/public/local-storage/words.json');
    let localRecord = null;

    if (fs.existsSync(localStoragePath)) {
      const localData = JSON.parse(fs.readFileSync(localStoragePath, 'utf-8'));
      localRecord = localData.records?.find(
        (r: any) => r.lemma?.toLowerCase() === lemma.toLowerCase()
      );
    }

    if (localRecord) {
      console.log(`\n💾 本地存储记录:`);
      console.log(`   ID: ${localRecord.id}`);
      console.log(`   Lemma: ${localRecord.lemma}`);
      console.log(`   Raw YAML 存在: ${localRecord.raw_yaml ? '✅' : '❌'}`);
    } else {
      console.log(`\n💾 本地存储: 未找到记录`);
    }

    // 3. 对比数据
    if (dbRecord.original_yaml && localRecord?.raw_yaml) {
      const dbYaml = dbRecord.original_yaml;
      const localYaml = yaml.load(localRecord.raw_yaml);

      console.log(`\n🔍 开始对比数据...`);

      // 清理数据（移除用户相关字段）
      const cleanData = (data: any) => {
        if (!data || typeof data !== 'object') return data;
        const cleaned = { ...data };
        delete cleaned.user_word;
        delete cleaned.user_context_sentence;
        return cleaned;
      };

      const cleanDb = cleanData(dbYaml);
      const cleanLocal = cleanData(localYaml);

      const differences = diff(cleanLocal, cleanDb);

      if (differences) {
        console.log(`\n⚠️  发现差异 (${differences.length} 处):\n`);
        differences.forEach((d: any, index: number) => {
          console.log(`   [${index + 1}] 路径: ${d.path?.join('.') || 'root'}`);
          console.log(`       类型: ${d.kind}`);
          if (d.lhs !== undefined) console.log(`       本地值: ${JSON.stringify(d.lhs)}`);
          if (d.rhs !== undefined) console.log(`       数据库值: ${JSON.stringify(d.rhs)}`);
          console.log('');
        });
      } else {
        console.log(`\n✅ 数据完全一致（清理后）`);
      }

      // 4. 显示完整数据对比
      console.log(`\n📊 完整数据对比:`);
      console.log('─'.repeat(60));
      console.log('本地存储 YAML:');
      console.log(yaml.dump(localYaml).substring(0, 500) + '...');
      console.log('─'.repeat(60));
      console.log('数据库 Original YAML:');
      console.log(yaml.dump(dbYaml).substring(0, 500) + '...');
    } else {
      console.log(`\n⚠️  缺少对比数据，无法进行比较`);
      if (!dbRecord.original_yaml) {
        console.log(`   - 数据库中没有 original_yaml`);
      }
      if (!localRecord?.raw_yaml) {
        console.log(`   - 本地存储中没有 raw_yaml`);
      }
    }

  } catch (error) {
    console.error('查询出错:', error);
  } finally {
    await pool.end();
  }
}

checkWordDiff(wordLemma);
