const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const viteConfigPath = path.resolve(__dirname, '../client/vite.config.ts');
const localStorePath = path.resolve(__dirname, '../localStore.ts');
const coreRoutePath = path.resolve(__dirname, '../routes/core.ts');
const serverPath = path.resolve(__dirname, '../server.ts');
const configModulePath = path.resolve(__dirname, '../utils/config.ts');
const runtimeConfigPath = path.resolve(__dirname, '../config.json');
const envExamplePath = path.resolve(__dirname, '../../.env.example');

test('vite config reads ports from env (PORT/SERVER_PORT + CLIENT_DEV_PORT)', () => {
  const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');

  assert.equal(viteConfig.includes('config.json'), false);
  assert.equal(viteConfig.includes('process.env.API_PORT'), false);
  assert.equal(viteConfig.includes('process.env.PORT'), true);
  assert.equal(viteConfig.includes('process.env.SERVER_PORT'), true);
  assert.equal(viteConfig.includes('process.env.CLIENT_DEV_PORT'), true);
});

test('localStore does not depend on runtime config.json for limits', () => {
  const localStore = fs.readFileSync(localStorePath, 'utf8');

  assert.equal(localStore.includes("path.join(__dirname, 'config.json')"), false);
  assert.equal(localStore.includes('storage.max_items'), true);
});

test('core route reports database config only via centralized config module', () => {
  const coreRoute = fs.readFileSync(coreRoutePath, 'utf8');

  assert.equal(coreRoute.includes('process.env.DATABASE_URL'), false);
  assert.equal(coreRoute.includes(".get<string | null>('database.url'"), true);
});

test('legacy web/config.json runtime file is removed', () => {
  assert.equal(fs.existsSync(runtimeConfigPath), false);
});

test('.env.example lists the supported runtime env vars and excludes deprecated ones', () => {
  const envExample = fs.readFileSync(envExamplePath, 'utf8');
  const declaredKeys = new Set(
    [...envExample.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]+)=/gm)].map(match => match[1])
  );

  const expectedKeys = [
    'NODE_ENV',
    'ADMIN_TOKEN',
    'DATABASE_URL',
    'DATABASE_SSL',
    'DATABASE_POOL_SIZE',
    'PORT',
    'SERVER_PORT',
    'SERVER_HOST',
    'SERVER_CORS_ORIGINS',
    'SERVER_RATE_LIMIT',
    'SERVER_TIMEOUT_MS',
    'SECURITY_HELMET',
    'SECURITY_HSTS',
    'CLIENT_DEV_PORT',
    'MAX_LOCAL_ITEMS',
    'LOG_LEVEL',
    'LOG_DIR',
    'LOG_ROTATION_INTERVAL',
    'LOG_ROTATION_MAX_SIZE',
    'LOG_ROTATION_MAX_FILES',
  ];

  expectedKeys.forEach(key => assert.equal(declaredKeys.has(key), true, `${key} missing from .env.example`));
  ['LOG_ENABLE_FILE', 'LOG_FILE_PATH', 'LOG_AUDIT'].forEach(key =>
    assert.equal(declaredKeys.has(key), false, `${key} should not appear in .env.example`)
  );
});

test('server and config modules consume the documented env-backed options', () => {
  const serverSource = fs.readFileSync(serverPath, 'utf8');
  const configSource = fs.readFileSync(configModulePath, 'utf8');

  assert.equal(serverSource.includes("server.cors_origins"), true);
  assert.equal(serverSource.includes("server.rate_limit"), true);
  assert.equal(serverSource.includes("server.timeout_ms"), true);
  assert.equal(serverSource.includes("security.helmet"), true);
  assert.equal(serverSource.includes("security.hsts"), true);

  assert.equal(configSource.includes('LOG_ROTATION_INTERVAL'), true);
  assert.equal(configSource.includes('LOG_ROTATION_MAX_SIZE'), true);
  assert.equal(configSource.includes('LOG_ROTATION_MAX_FILES'), true);
  assert.equal(configSource.includes('SECURITY_HELMET'), true);
  assert.equal(configSource.includes('SECURITY_HSTS'), true);
  assert.equal(configSource.includes('LOG_AUDIT'), false);
});
