const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const coreRoutePath = path.resolve(__dirname, '../routes/core.ts');
const configModulePath = path.resolve(__dirname, '../utils/config.ts');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test_db';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';

function freshRequire(modulePath: string): any {
  delete require.cache[modulePath];
  return require(modulePath);
}

function getRouteHandler(router: any, method: string, routePath: string): any {
  const routeLayer = router.stack.find(
    (layer: any) => layer.route && layer.route.path === routePath && layer.route.methods?.[method]
  );
  assert.ok(routeLayer, `missing route ${method.toUpperCase()} ${routePath}`);
  return routeLayer.route.stack[0].handle;
}

test('POST /anki/connect should relay payload to configured anki endpoint', async () => {
  process.env.ANKI_CONNECT_HOST = '127.0.0.1';
  process.env.ANKI_CONNECT_PORT = '8765';

  delete require.cache[configModulePath];
  const coreRouter = freshRequire(coreRoutePath);
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
});
