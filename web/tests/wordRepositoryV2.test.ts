const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbModulePath = path.resolve(__dirname, '../db/index.ts');
const repositoryPath = path.resolve(__dirname, '../services/word/WordRepositoryV2.ts');
const configPath = path.resolve(__dirname, '../utils/config.ts');
const drizzleDir = path.resolve(__dirname, '../../drizzle');

const createContent = (lemma: string, language: string = 'en') => ({
  yield: {
    lemma,
    language,
    part_of_speech: language === 'de' ? 'Nomen' : 'noun',
  },
});

function loadRepositoryWithTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-repo-v2-'));
  process.env.DATABASE_URL = path.join(tempDir, 'repo.db');
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_TOKEN = 'test-admin-token';

  delete require.cache[dbModulePath];
  delete require.cache[repositoryPath];
  delete require.cache[configPath];

  const dbModule = require(dbModulePath);
  const migrationFile = fs.readdirSync(drizzleDir).find((file: string) => file.endsWith('.sql'));
  assert.ok(migrationFile, 'missing drizzle migration file');

  const migrationSql = fs
    .readFileSync(path.join(drizzleDir, migrationFile), 'utf8')
    .replaceAll('--> statement-breakpoint', '');

  dbModule.getSqlite().exec(migrationSql);

  const repository = require(repositoryPath);
  return {
    repository,
    close() {
      dbModule.closeDb();
      fs.rmSync(tempDir, { recursive: true, force: true });
      delete require.cache[dbModulePath];
      delete require.cache[repositoryPath];
      delete require.cache[configPath];
    },
  };
}

test('WordRepositoryV2 creates and finds words by lemma and language', async () => {
  const { repository, close } = loadRepositoryWithTempDb();
  try {
    const created = await repository.create({
      lemma: 'See',
      language: 'de',
      partOfSpeech: 'Nomen',
      content: createContent('See', 'de'),
    });

    assert.equal(created.lemma, 'See');
    assert.equal(created.language, 'de');

    const found = await repository.findByLemma('see', 'de');
    assert.equal(found.id, created.id);
    assert.equal(found.content.yield.lemma, 'See');
  } finally {
    close();
  }
});

test('WordRepositoryV2 keeps same lemma isolated by language', async () => {
  const { repository, close } = loadRepositoryWithTempDb();
  try {
    await repository.create({
      lemma: 'see',
      language: 'en',
      partOfSpeech: 'verb',
      content: createContent('see', 'en'),
    });
    await repository.create({
      lemma: 'See',
      language: 'de',
      partOfSpeech: 'Nomen',
      content: createContent('See', 'de'),
    });

    const english = await repository.findByLemma('see', 'en');
    const german = await repository.findByLemma('see', 'de');

    assert.equal(english.language, 'en');
    assert.equal(german.language, 'de');
    assert.notEqual(english.id, german.id);
  } finally {
    close();
  }
});

test('WordRepositoryV2 lists, searches, updates revision, and deletes', async () => {
  const { repository, close } = loadRepositoryWithTempDb();
  try {
    const first = await repository.create({
      lemma: 'gallantry',
      language: 'en',
      partOfSpeech: 'noun',
      content: createContent('gallantry', 'en'),
    });
    await repository.create({
      lemma: 'galaxy',
      language: 'en',
      partOfSpeech: 'noun',
      content: createContent('galaxy', 'en'),
    });
    await repository.create({
      lemma: 'Gallien',
      language: 'de',
      partOfSpeech: 'Nomen',
      content: createContent('Gallien', 'de'),
    });

    const page = await repository.listPaged({
      page: 1,
      limit: 10,
      search: 'gall',
      sort: 'az',
      language: 'en',
    });
    assert.equal(page.total, 1);
    assert.deepEqual(
      page.items.map((item: { lemma: string }) => item.lemma),
      ['gallantry']
    );

    await repository.update(first.id, {
      partOfSpeech: 'noun',
      content: { ...createContent('gallantry', 'en'), updated: true },
    });

    const updated = await repository.findById(first.id);
    assert.equal(updated.revision_count, 2);
    assert.equal(updated.content.updated, true);

    await repository.delete(first.id);
    assert.equal(await repository.findById(first.id), null);
  } finally {
    close();
  }
});
