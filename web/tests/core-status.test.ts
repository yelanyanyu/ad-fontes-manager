const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const coreRoutePath = path.resolve(__dirname, '../routes/core.ts');
const dbModulePath = path.resolve(__dirname, '../db/index.ts');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL = process.env.DATABASE_URL || './data/ad_fontes_test.db';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';

function loadCoreRouterWithUnavailableDb(): any {
  const originalCore = require.cache[coreRoutePath];
  const originalDb = require.cache[dbModulePath];

  delete require.cache[coreRoutePath];
  delete require.cache[dbModulePath];

  const dbDownError = Object.assign(new Error('database unavailable'), { code: 'ECONNREFUSED' });
  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: {
      getDb: () => {
        throw dbDownError;
      },
      getSqlite: () => {
        throw dbDownError;
      },
      closeDb: () => {
        throw dbDownError;
      },
    },
  } as NodeModule;

  const coreRouter = require(coreRoutePath);

  delete require.cache[coreRoutePath];
  if (originalCore) {
    require.cache[coreRoutePath] = originalCore;
  }

  if (originalDb) {
    require.cache[dbModulePath] = originalDb;
  } else {
    delete require.cache[dbModulePath];
  }

  return coreRouter;
}

function invokeExpressHandler(handler: (...args: any[]) => void): Promise<Record<string, unknown>> {
  return new Promise(resolve => {
    let settled = false;

    const req = {
      id: 'req-status-1',
      method: 'GET',
      originalUrl: '/api/status',
      path: '/api/status',
      headers: {},
      ip: '127.0.0.1',
    };

    const res: Record<string, unknown> = {
      statusCode: 200,
      status(code: number) {
        (this as Record<string, unknown>).statusCode = code;
        return this;
      },
      json(payload: unknown) {
        if (!settled) {
          settled = true;
          resolve({ type: 'response', statusCode: this.statusCode, payload });
        }
        return this;
      },
    };

    handler(req, res, (error?: unknown) => {
      if (!settled) {
        settled = true;
        resolve({ type: 'next', error });
      }
    });
  });
}

test('GET /status propagates ServiceUnavailable when DB is down', async () => {
  const coreRouter = loadCoreRouterWithUnavailableDb();

  const statusLayer = coreRouter.stack.find(
    (layer: any) => layer.route && layer.route.path === '/status' && layer.route.methods?.get
  );

  assert.ok(statusLayer, 'missing GET /status route');

  const result = await invokeExpressHandler(statusLayer.route.stack[0].handle);

  assert.equal(result.type, 'next');
  assert.equal((result.error as any)?.statusCode, 503);
});

test('GET /health returns ok when DB is up', async () => {
  const dbModule = require.cache[dbModulePath];
  const coreModule = require.cache[coreRoutePath];

  delete require.cache[coreRoutePath];
  delete require.cache[dbModulePath];

  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: {
      getDb: () => ({}),
      getSqlite: () => ({ prepare: () => ({ get: () => ({ '1': 1 }) }) }),
      closeDb: () => undefined,
    },
  } as NodeModule;

  const coreRouter = require(coreRoutePath);
  const healthLayer = coreRouter.stack.find(
    (layer: any) => layer.route && layer.route.path === '/health' && layer.route.methods?.get
  );
  assert.ok(healthLayer, 'missing GET /health route');

  const result = await invokeExpressHandler(healthLayer.route.stack[0].handle);

  assert.equal(result.type, 'response');
  assert.equal((result.payload as any).status, 'ok');

  delete require.cache[coreRoutePath];
  delete require.cache[dbModulePath];

  if (coreModule) require.cache[coreRoutePath] = coreModule;
  if (dbModule) require.cache[dbModulePath] = dbModule;
});
