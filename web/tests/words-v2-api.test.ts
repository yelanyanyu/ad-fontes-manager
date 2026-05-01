import type { AddressInfo } from 'node:net';
import type { Request, Response, NextFunction } from 'express';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express') as typeof import('express');
const yaml = require('js-yaml') as { dump: (data: unknown) => string };

const ADMIN_TOKEN = 'test-admin-token';
const AUTH_HEADER = { 'x-admin-token': ADMIN_TOKEN };

const dbModulePath = path.resolve(__dirname, '../db/index.ts');
const configPath = path.resolve(__dirname, '../utils/config.ts');
const routePath = path.resolve(__dirname, '../routes/wordsV2.ts');
const controllerPath = path.resolve(__dirname, '../controllers/wordControllerV2.ts');
const servicePath = path.resolve(__dirname, '../services/word/WordServiceV2.ts');
const repositoryPath = path.resolve(__dirname, '../services/word/WordRepositoryV2.ts');
const writeAuthPath = path.resolve(__dirname, '../middleware/writeAuth.ts');
const drizzleDir = path.resolve(__dirname, '../../drizzle');
const modulePaths = [
  dbModulePath,
  configPath,
  routePath,
  controllerPath,
  servicePath,
  repositoryPath,
  writeAuthPath,
];

type HttpMethod = 'GET' | 'POST' | 'DELETE';

interface ApiResponse {
  status: number;
  data: unknown;
}

function buildEnglishWordData(lemma: string): Record<string, unknown> {
  return {
    root: { source: 'test' },
    yield: {
      user_word: lemma,
      lemma,
      syllabification: lemma,
      user_context_sentence: `The ${lemma} brightened the room.`,
      part_of_speech: 'noun',
      contextual_meaning: {
        en: 'light',
        zh: '光',
      },
      other_common_meanings: ['clarity'],
    },
    etymology: {
      root_and_affixes: {
        prefix: 'lu',
        root: 'men',
        suffix: 'n',
        structure_analysis: 'prefix + root + suffix',
      },
      historical_origins: {
        history_myth: 'myth',
        source_word: lemma,
        pie_root: 'leuk',
      },
      visual_imagery_zh: 'visual-image',
      meaning_evolution_zh: 'meaning-evolution',
    },
    cognate_family: {
      cognates: [{ word: 'illuminate', logic: 'shared light root' }],
    },
    application: {
      selected_examples: [
        {
          type: 'example',
          sentence: `A ${lemma} output chart.`,
          translation_zh: '照明输出表',
        },
      ],
    },
    nuance: {
      image_differentiation_zh: 'semantic-diff',
      synonyms: [{ word: 'light', meaning_zh: '光' }],
    },
  };
}

function buildGermanWordData(lemma: string): Record<string, unknown> {
  return {
    root: { source: 'test' },
    yield: {
      user_word: lemma,
      lemma,
      genus: 'N/A',
      syllabification: lemma,
      kasus: 'N/A',
      part_of_speech: 'Verb',
      user_context_sentence: `Wir wollen ${lemma} testen.`,
      contextual_meaning: {
        de: 'Eine Sache abschließen.',
        zh: '到此为止',
      },
      other_common_meanings: ['停止处理'],
    },
    etymology: {
      morphological_analysis: {
        word_formation: 'Derivatum',
        components: [{ element: 'wend', type: 'Wortstamm', de_meaning: '转向' }],
        structure_analysis: 'root + suffix',
      },
      historical_origins: {
        earliest_attestation: 'Mittelhochdeutsch',
        source_form: lemma,
        pgmc_root: '*wandijaną',
        pie_root: '*wendʰ-',
        sound_changes: 'test sound changes',
      },
      visual_imagery_zh: '一份文件停在桌角。',
      meaning_evolution_zh: '从转向到停止处理。',
    },
    cognate_family: {
      cognates: [{ word: 'English: to wend', logic: 'shared Germanic root' }],
    },
    application: {
      selected_examples: [
        {
          type: 'example',
          sentence: `Wir lassen ${lemma}.`,
          translation_zh: '我们到此为止。',
        },
      ],
    },
    nuance: {
      image_differentiation_zh: 'aufhören 是停下，bewendenlassen 是处理后放下。',
      synonyms: [{ word: 'aufhören', meaning_zh: '停止' }],
    },
    dialectal_notes: {
      low_german: 'rare',
    },
    observations: {
      register: 'formal',
    },
  };
}

function clearModuleCache() {
  for (const modulePath of modulePaths) {
    delete require.cache[modulePath];
  }
}

async function withTempApi<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-api-v2-'));
  process.env.DATABASE_URL = path.join(tempDir, 'api.db');
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  clearModuleCache();

  const dbModule = require(dbModulePath);
  const migrationFile = fs.readdirSync(drizzleDir).find((file: string) => file.endsWith('.sql'));
  assert.ok(migrationFile, 'missing drizzle migration file');

  const migrationSql = fs
    .readFileSync(path.join(drizzleDir, migrationFile), 'utf8')
    .replaceAll('--> statement-breakpoint', '');
  dbModule.getSqlite().exec(migrationSql);

  const app = express();
  app.use(express.json());
  app.use('/api/v2/words', require(routePath));
  app.use(
    (
      err: { statusCode?: number; message?: string; data?: unknown },
      _req: Request,
      res: Response,
      _next: NextFunction
    ) => {
      res.status(err.statusCode || 500).json({
        code: err.statusCode || 500,
        message: err.message || 'Internal Server Error',
        data: err.data,
      });
    }
  );

  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    return await run(`http://127.0.0.1:${address.port}/api/v2/words`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
    dbModule.closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
    clearModuleCache();
  }
}

async function api(
  baseUrl: string,
  method: HttpMethod,
  apiPath: string,
  body?: unknown
): Promise<ApiResponse> {
  const cleanPath = apiPath.startsWith('/') ? apiPath.slice(1) : apiPath;
  const url = new URL(cleanPath, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  const headers: Record<string, string> = { ...AUTH_HEADER };
  const init: RequestInit = { method, headers };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url.toString(), init);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

test('V2 API runs CRUD and language isolation on a temporary SQLite database', async () => {
  await withTempApi(async baseUrl => {
    const englishYaml = yaml.dump(buildEnglishWordData('gallantry'));
    const germanYaml = yaml.dump(buildGermanWordData('bewendenlassen'));

    const emptyEnglish = await api(baseUrl, 'GET', '?language=en&limit=5');
    assert.equal(emptyEnglish.status, 200);
    assert.deepEqual((emptyEnglish.data as { items: unknown[] }).items, []);

    const createdEnglish = await api(baseUrl, 'POST', '/add', {
      word: 'gallantry',
      yaml: englishYaml,
    });
    assert.equal(createdEnglish.status, 201);
    assert.equal(
      (createdEnglish.data as { data: { lemma: string; language: string } }).data.lemma,
      'gallantry'
    );
    assert.equal(
      (createdEnglish.data as { data: { lemma: string; language: string } }).data.language,
      'en'
    );

    const duplicateEnglish = await api(baseUrl, 'POST', '/add', {
      word: 'gallantry',
      yaml: englishYaml,
    });
    assert.equal(duplicateEnglish.status, 409);

    const createdGerman = await api(baseUrl, 'POST', '/add', {
      word: 'bewendenlassen',
      yaml: germanYaml,
    });
    assert.equal(createdGerman.status, 201);
    assert.equal((createdGerman.data as { data: { language: string } }).data.language, 'de');

    const englishSearch = await api(baseUrl, 'GET', '?search=gall&language=en');
    assert.equal((englishSearch.data as { total: number }).total, 1);

    const germanSearchFromEnglish = await api(baseUrl, 'GET', '?search=bewendenlassen&language=en');
    assert.equal((germanSearchFromEnglish.data as { total: number }).total, 0);

    const germanDetails = await api(baseUrl, 'GET', '/details?word=bewendenlassen&language=de');
    assert.equal(germanDetails.status, 200);
    const germanData = (germanDetails.data as { data: Record<string, unknown> }).data;
    assert.ok(germanData.etymology);
    assert.ok(germanData.dialectal_notes);

    const updatedData = buildEnglishWordData('gallantry');
    (updatedData.yield as Record<string, unknown>).contextual_meaning = {
      en: 'updated courage',
      zh: '更新后的勇气',
    };
    const updated = await api(baseUrl, 'POST', '/', {
      yaml: yaml.dump(updatedData),
      forceUpdate: true,
    });
    assert.equal(updated.status, 200);
    assert.equal((updated.data as { success: boolean; status: string }).success, true);
    assert.equal((updated.data as { success: boolean; status: string }).status, 'updated');

    const englishList = await api(baseUrl, 'GET', '?language=en&limit=10');
    const englishItems = (englishList.data as { items: Array<{ id: string; lemma: string }> })
      .items;
    assert.deepEqual(
      englishItems.map(item => item.lemma),
      ['gallantry']
    );

    const deleted = await api(baseUrl, 'DELETE', `/${englishItems[0].id}`);
    assert.equal(deleted.status, 200);

    const afterDelete = await api(baseUrl, 'GET', '?search=gallantry&language=en');
    assert.equal((afterDelete.data as { total: number }).total, 0);
  });
});
