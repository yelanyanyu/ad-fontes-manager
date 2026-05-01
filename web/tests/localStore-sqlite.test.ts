const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbModulePath = path.resolve(__dirname, '../db/index.ts');
const localStorePath = path.resolve(__dirname, '../localStore.ts');
const configPath = path.resolve(__dirname, '../utils/config.ts');
const drizzleDir = path.resolve(__dirname, '../../drizzle');

function loadStoreWithTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-ls-'));
  process.env.DATABASE_URL = path.join(tempDir, 'local.db');
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_TOKEN = 'test-admin-token';

  delete require.cache[localStorePath];
  delete require.cache[dbModulePath];
  delete require.cache[configPath];

  const dbModule = require(dbModulePath);
  const migrationFile = fs.readdirSync(drizzleDir).find((file: string) => file.endsWith('.sql'));
  assert.ok(migrationFile, 'missing drizzle migration file');

  const migrationSql = fs
    .readFileSync(path.join(drizzleDir, migrationFile), 'utf8')
    .replaceAll('--> statement-breakpoint', '');
  dbModule.getSqlite().exec(migrationSql);

  const store = require(localStorePath);

  return {
    store,
    close() {
      dbModule.closeDb();
      fs.rmSync(tempDir, { recursive: true, force: true });
      delete require.cache[localStorePath];
      delete require.cache[dbModulePath];
      delete require.cache[configPath];
    },
  };
}

test('LocalStore saves YAML and retrieves it by getAll', async () => {
  const { store, close } = loadStoreWithTempDb();
  try {
    const yaml = 'lemma: "hello"\nmeaning: "a greeting"\n';
    const id = store.save(yaml);

    assert.ok(id, 'should return an id');
    assert.equal(typeof id, 'string');

    const all = store.getAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].raw_yaml, yaml);
    assert.equal(all[0].lemma_preview, 'hello');
    assert.ok(all[0].updated_at > 0);
  } finally {
    close();
  }
});

test('LocalStore findByLemma finds by lemma preview', async () => {
  const { store, close } = loadStoreWithTempDb();
  try {
    store.save('lemma: "bonjour"\nmeaning: "hello in French"\n');
    store.save('lemma: "hola"\nmeaning: "hello in Spanish"\n');

    const found = store.findByLemma('bonjour');
    assert.ok(found, 'should find by lemma');
    assert.ok(found.raw_yaml.includes('bonjour'));

    const notFound = store.findByLemma('nonexistent');
    assert.equal(notFound, null);
  } finally {
    close();
  }
});

test('LocalStore updates existing item by id', async () => {
  const { store, close } = loadStoreWithTempDb();
  try {
    const id = store.save('lemma: "original"\n');
    const updatedId = store.save('lemma: "updated"\n', id);

    assert.equal(updatedId, id, 'should return same id on update');

    const all = store.getAll();
    assert.equal(all.length, 1);
    assert.ok(all[0].raw_yaml.includes('updated'));
  } finally {
    close();
  }
});

test('LocalStore delete removes the item', async () => {
  const { store, close } = loadStoreWithTempDb();
  try {
    const id = store.save('lemma: "delete-me"\n');
    assert.equal(store.getAll().length, 1);

    store.delete(id);
    assert.equal(store.getAll().length, 0);
  } finally {
    close();
  }
});

test('LocalStore clear removes all items', async () => {
  const { store, close } = loadStoreWithTempDb();
  try {
    store.save('lemma: "first"\n');
    store.save('lemma: "second"\n');
    assert.equal(store.getAll().length, 2);

    store.clear();
    assert.equal(store.getAll().length, 0);
  } finally {
    close();
  }
});

test('LocalStore config save and get round-trips', async () => {
  const { store, close } = loadStoreWithTempDb();
  try {
    const dbPath = process.env.DATABASE_URL;
    assert.ok(dbPath, 'DATABASE_URL should be set');

    store.saveConfig({ MAX_LOCAL_ITEMS: 50 });

    const cfg = store.getConfig();
    assert.equal(cfg.MAX_LOCAL_ITEMS, 50);
  } finally {
    close();
  }
});

test('LocalStore enforces storage limit', async () => {
  const { store, close } = loadStoreWithTempDb();
  try {
    store.saveConfig({ MAX_LOCAL_ITEMS: 3 });

    store.save('lemma: "a"\n');
    store.save('lemma: "b"\n');
    store.save('lemma: "c"\n');

    assert.throws(() => store.save('lemma: "d"\n'), /limit reached/);
  } finally {
    close();
  }
});

test('LocalStore findByLemma matches via raw_yaml regex fallback', async () => {
  const { store, close } = loadStoreWithTempDb();
  try {
    const yaml = 'lemma: "schadenfreude"\nmeaning: "joy at others misfortune"\n';
    store.save(yaml);

    const found = store.findByLemma('schadenfreude');
    assert.ok(found, 'should find by regex match in raw_yaml');
    assert.equal(found.lemma_preview, 'schadenfreude');
  } finally {
    close();
  }
});
