const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml') as { dump: (data: unknown) => string };

const dbModulePath = path.resolve(__dirname, '../db/index.ts');
const configPath = path.resolve(__dirname, '../utils/config.ts');
const repositoryPath = path.resolve(__dirname, '../services/word/WordRepositoryV2.ts');
const servicePath = path.resolve(__dirname, '../services/word/WordServiceV2.ts');
const drizzleDir = path.resolve(__dirname, '../../drizzle');

function buildValidWordData(lemma: string): Record<string, unknown> {
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

function loadServiceWithTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-service-v2-'));
  process.env.DATABASE_URL = path.join(tempDir, 'service.db');
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_TOKEN = 'test-admin-token';

  for (const modulePath of [dbModulePath, configPath, repositoryPath, servicePath]) {
    delete require.cache[modulePath];
  }

  const dbModule = require(dbModulePath);
  const migrationFile = fs.readdirSync(drizzleDir).find((file: string) => file.endsWith('.sql'));
  assert.ok(migrationFile, 'missing drizzle migration file');

  const migrationSql = fs
    .readFileSync(path.join(drizzleDir, migrationFile), 'utf8')
    .replaceAll('--> statement-breakpoint', '');

  dbModule.getSqlite().exec(migrationSql);

  return {
    service: require(servicePath),
    repository: require(repositoryPath),
    close() {
      dbModule.closeDb();
      fs.rmSync(tempDir, { recursive: true, force: true });
      for (const modulePath of [dbModulePath, configPath, repositoryPath, servicePath]) {
        delete require.cache[modulePath];
      }
    },
  };
}

test('WordServiceV2 saves and updates words through SQLite transactions', async () => {
  const { service, repository, close } = loadServiceWithTempDb();
  try {
    const originalYaml = yaml.dump(buildValidWordData('lumen'));

    const created = await service.saveWord({ id: 'req-create' }, originalYaml);
    assert.equal(created.success, true);
    assert.equal(created.status, 'created');
    assert.equal(created.lemma, 'lumen');
    assert.equal(created.language, 'en');

    const updatedData = buildValidWordData('lumen');
    (updatedData.yield as Record<string, unknown>).contextual_meaning = {
      en: 'unit of luminous flux',
      zh: '流明',
    };

    const updated = await service.saveWord({ id: 'req-update' }, yaml.dump(updatedData), true);
    assert.equal(updated.success, true);
    assert.equal(updated.status, 'updated');

    const stored = await repository.findByLemma('lumen', 'en');
    assert.equal(stored.revision_count, 2);
    assert.equal(stored.content.yield.contextual_meaning.en, 'unit of luminous flux');
  } finally {
    close();
  }
});

test('WordServiceV2 reports duplicate adds without leaving an open transaction', async () => {
  const { service, repository, close } = loadServiceWithTempDb();
  try {
    const lumenYaml = yaml.dump(buildValidWordData('lumen'));

    const created = await service.addWord({ id: 'req-add' }, 'lumen', lumenYaml);
    assert.equal(created.status, 'created');

    const duplicate = await service.addWord({ id: 'req-duplicate' }, 'lumen', lumenYaml);
    assert.equal(duplicate.status, 'duplicate');

    const page = await repository.listPaged({
      page: 1,
      limit: 10,
      search: 'lumen',
      sort: 'az',
      language: 'en',
    });
    assert.equal(page.total, 1);
  } finally {
    close();
  }
});
