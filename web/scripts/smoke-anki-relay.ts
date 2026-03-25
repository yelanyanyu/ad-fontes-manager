import assert from 'node:assert/strict';
import path from 'node:path';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test_db';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';
process.env.ANKI_CONNECT_HOST = process.env.ANKI_CONNECT_HOST || '127.0.0.1';
process.env.ANKI_CONNECT_PORT = process.env.ANKI_CONNECT_PORT || '8765';

const root = path.resolve(__dirname, '..');
const coreRoutePath = path.resolve(root, 'routes/core.ts');
const configModulePath = path.resolve(root, 'utils/config.ts');

const clearModule = (modulePath: string): void => {
  const cache = require.cache as Record<string, unknown>;
  delete cache[modulePath];
};

const getRouteHandler = (router: any, method: string, routePath: string): any => {
  const routeLayer = router.stack.find(
    (layer: any) => layer.route && layer.route.path === routePath && layer.route.methods?.[method]
  );
  if (!routeLayer) {
    throw new Error(`Missing route ${method.toUpperCase()} ${routePath}`);
  }
  return routeLayer.route.stack[0].handle;
};

const run = async (): Promise<void> => {
  clearModule(configModulePath);
  clearModule(coreRoutePath);

  const coreRouter = require(coreRoutePath);
  const handler = getRouteHandler(coreRouter, 'post', '/anki/connect');

  const originalFetch = global.fetch;
  let capturedUrl = '';
  let capturedBody = '';

  global.fetch = (async (url: unknown, init?: any) => {
    capturedUrl = String(url);
    capturedBody = typeof init?.body === 'string' ? init.body : '';
    return {
      status: 200,
      async json() {
        return { result: 6, error: null };
      },
    } as any;
  }) as typeof fetch;

  const req = { body: { action: 'version', version: 6 } } as any;
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const originalJson = res.json.bind(res);
      res.json = (payload: unknown) => {
        originalJson(payload);
        resolve();
        return res;
      };

      handler(req, res, (err: unknown) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(capturedUrl, 'http://127.0.0.1:8765/');
  assert.equal(capturedBody, JSON.stringify({ action: 'version', version: 6 }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { result: 6, error: null });
  console.log('smoke-anki-relay: ok');
};

run().catch((error: unknown) => {
  console.error('smoke-anki-relay: failed');
  console.error(error);
  process.exitCode = 1;
});
