const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const viteConfigPath = path.resolve(__dirname, '../client/vite.config.ts');
const localStorePath = path.resolve(__dirname, '../localStore.ts');
const coreRoutePath = path.resolve(__dirname, '../routes/core.ts');
const runtimeConfigPath = path.resolve(__dirname, '../config.json');

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
