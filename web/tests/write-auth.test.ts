const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const authModulePath = path.resolve(__dirname, '../middleware/writeAuth.ts');
const wordsRoutePath = path.resolve(__dirname, '../routes/words.ts');
const syncRoutePath = path.resolve(__dirname, '../routes/sync.ts');
const coreRoutePath = path.resolve(__dirname, '../routes/core.ts');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test_db';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';

function withAdminToken(token: string | undefined, fn: () => void): void {
  const previous = process.env.ADMIN_TOKEN;
  if (token === undefined) {
    delete process.env.ADMIN_TOKEN;
  } else {
    process.env.ADMIN_TOKEN = token;
  }

  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env.ADMIN_TOKEN;
    } else {
      process.env.ADMIN_TOKEN = previous;
    }
  }
}

function freshRequire(modulePath: string): any {
  delete require.cache[modulePath];
  return require(modulePath);
}

function hasRouteMiddleware(
  router: any,
  method: 'post' | 'put' | 'patch' | 'delete',
  routePath: string,
  middleware: (...args: any[]) => void
): boolean {
  const layer = router.stack.find(
    (item: any) => item.route && item.route.path === routePath && item.route.methods?.[method]
  );

  assert.ok(layer, `missing route ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack.some((stackLayer: any) => stackLayer.handle === middleware);
}

test('write auth middleware returns 401 when admin token is missing', () => {
  withAdminToken('test-admin-token', () => {
    const { requireWriteAccess } = freshRequire(authModulePath);

    const req = {
      headers: {},
      ip: '127.0.0.1',
      method: 'POST',
      originalUrl: '/api/words',
      id: 'req-1',
    };

    assert.throws(
      () => requireWriteAccess(req, {}, () => undefined),
      (error: any) => error && error.statusCode === 401
    );
  });
});

test('write auth middleware returns 403 when admin token is invalid', () => {
  withAdminToken('test-admin-token', () => {
    const { requireWriteAccess } = freshRequire(authModulePath);

    const req = {
      headers: { 'x-admin-token': 'wrong-token' },
      ip: '127.0.0.1',
      method: 'POST',
      originalUrl: '/api/words',
      id: 'req-2',
    };

    assert.throws(
      () => requireWriteAccess(req, {}, () => undefined),
      (error: any) => error && error.statusCode === 403
    );
  });
});

test('write auth middleware allows request with valid admin token', () => {
  withAdminToken('test-admin-token', () => {
    const { requireWriteAccess } = freshRequire(authModulePath);

    const req = {
      headers: { 'x-admin-token': 'test-admin-token' },
      ip: '127.0.0.1',
      method: 'POST',
      originalUrl: '/api/words',
      id: 'req-3',
    };

    let nextCalled = false;
    requireWriteAccess(req, {}, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
  });
});

test('all write routes are protected by requireWriteAccess middleware', () => {
  const authModule = freshRequire(authModulePath);
  const wordsRouter = freshRequire(wordsRoutePath);
  const syncRouter = freshRequire(syncRoutePath);
  const coreRouter = freshRequire(coreRoutePath);
  const middleware = authModule.requireWriteAccess;

  assert.equal(hasRouteMiddleware(wordsRouter, 'post', '/', middleware), true);
  assert.equal(hasRouteMiddleware(wordsRouter, 'post', '/add', middleware), true);
  assert.equal(hasRouteMiddleware(wordsRouter, 'delete', '/:id', middleware), true);

  assert.equal(hasRouteMiddleware(syncRouter, 'post', '/local', middleware), true);
  assert.equal(hasRouteMiddleware(syncRouter, 'delete', '/local/:id', middleware), true);
  assert.equal(hasRouteMiddleware(syncRouter, 'post', '/sync/execute', middleware), true);

  assert.equal(hasRouteMiddleware(coreRouter, 'post', '/config', middleware), true);
});
