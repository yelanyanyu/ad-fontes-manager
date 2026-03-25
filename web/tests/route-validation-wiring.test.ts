const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const wordsRoutePath = path.resolve(__dirname, '../routes/words.ts');
const syncRoutePath = path.resolve(__dirname, '../routes/sync.ts');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test_db';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';

function freshRequire(modulePath: string): any {
  delete require.cache[modulePath];
  return require(modulePath);
}

function getRouteLayer(router: any, method: string, routePath: string): any {
  return router.stack.find(
    (layer: any) => layer.route && layer.route.path === routePath && layer.route.methods?.[method]
  );
}

function routeUsesMiddlewareByName(
  router: any,
  method: string,
  routePath: string,
  middlewareName: string
): boolean {
  const routeLayer = getRouteLayer(router, method, routePath);
  assert.ok(routeLayer, `missing route ${method.toUpperCase()} ${routePath}`);

  return routeLayer.route.stack.some(
    (stackLayer: any) => stackLayer.handle?.name === middlewareName
  );
}

test('words routes should register zod validation middlewares on key endpoints', () => {
  const wordsRouter = freshRequire(wordsRoutePath);

  assert.equal(routeUsesMiddlewareByName(wordsRouter, 'get', '/', 'validateQueryMiddleware'), true);
  assert.equal(
    routeUsesMiddlewareByName(wordsRouter, 'get', '/details', 'validateQueryMiddleware'),
    true
  );
  assert.equal(
    routeUsesMiddlewareByName(wordsRouter, 'get', '/:id', 'validateParamsMiddleware'),
    true
  );
  assert.equal(routeUsesMiddlewareByName(wordsRouter, 'post', '/', 'validateBodyMiddleware'), true);
  assert.equal(
    routeUsesMiddlewareByName(wordsRouter, 'post', '/add', 'validateBodyMiddleware'),
    true
  );
  assert.equal(
    routeUsesMiddlewareByName(wordsRouter, 'delete', '/:id', 'validateParamsMiddleware'),
    true
  );
});

test('sync routes should register zod validation middlewares on key endpoints', () => {
  const syncRouter = freshRequire(syncRoutePath);

  assert.equal(
    routeUsesMiddlewareByName(syncRouter, 'post', '/local', 'validateBodyMiddleware'),
    true
  );
  assert.equal(
    routeUsesMiddlewareByName(syncRouter, 'delete', '/local/:id', 'validateParamsMiddleware'),
    true
  );
  assert.equal(
    routeUsesMiddlewareByName(syncRouter, 'post', '/sync/check', 'validateBodyMiddleware'),
    true
  );
  assert.equal(
    routeUsesMiddlewareByName(syncRouter, 'post', '/sync/execute', 'validateBodyMiddleware'),
    true
  );
});
