const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { z } = require('zod') as typeof import('zod');

const validateModulePath = path.resolve(__dirname, '../middleware/validate.ts');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test_db';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';

function freshRequire(modulePath: string): any {
  delete require.cache[modulePath];
  return require(modulePath);
}

test('validateBody should replace req.body with parsed data', () => {
  const { validateBody } = freshRequire(validateModulePath);
  const middleware = validateBody(
    z.object({
      word: z.string().trim().min(1),
    })
  );

  const req = { body: { word: '  lumen  ' } };
  let nextCalled = false;

  middleware(req, {}, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.body, { word: 'lumen' });
});

test('validateBody should throw BadRequest with VALIDATION_ERROR code on invalid body', () => {
  const { validateBody } = freshRequire(validateModulePath);
  const middleware = validateBody(
    z.object({
      word: z.string().trim().min(1),
    })
  );

  const req = { body: { word: '   ' } };

  assert.throws(
    () => middleware(req, {}, () => undefined),
    (error: any) =>
      Boolean(error) && error.statusCode === 400 && error.data?.code === 'VALIDATION_ERROR'
  );
});

test('validateQuery should store parsed query on req.validatedQuery and res.locals', () => {
  const { validateQuery } = freshRequire(validateModulePath);
  const middleware = validateQuery(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      include: z.string().optional(),
    })
  );

  const req = { query: { page: '2', include: 'examples,cognates' } };
  const res = { locals: {} as Record<string, unknown> };
  let nextCalled = false;

  middleware(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual((req as any).validatedQuery, { page: 2, include: 'examples,cognates' });
  assert.deepEqual(res.locals.validatedQuery, { page: 2, include: 'examples,cognates' });
  assert.deepEqual(req.query, { page: '2', include: 'examples,cognates' });
});

test('validateQuery should work when req.query is getter-only (Express 5)', () => {
  const { validateQuery } = freshRequire(validateModulePath);
  const middleware = validateQuery(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
    })
  );

  const req: Record<string, unknown> = {};
  Object.defineProperty(req, 'query', {
    get() {
      return { page: '3' };
    },
    configurable: true,
    enumerable: true,
  });

  const res = { locals: {} as Record<string, unknown> };
  let nextCalled = false;
  assert.doesNotThrow(() =>
    middleware(req as any, res as any, () => {
      nextCalled = true;
    })
  );

  assert.equal(nextCalled, true);
  assert.deepEqual((req as any).validatedQuery, { page: 3 });
  assert.deepEqual(res.locals.validatedQuery, { page: 3 });
  assert.deepEqual((req as any).query, { page: '3' });
});

test('validateQuery should still expose parsed query through res.locals on non-extensible req', () => {
  const { validateQuery } = freshRequire(validateModulePath);
  const middleware = validateQuery(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).default(20),
    })
  );

  const queryStore: Record<string, unknown> = { page: '4', limit: '30', stale: 'x' };
  const req: Record<string, unknown> = {};
  const res = { locals: {} as Record<string, unknown> };

  Object.defineProperty(req, 'query', {
    get() {
      return queryStore;
    },
    enumerable: true,
    configurable: false,
  });
  Object.preventExtensions(req);

  let nextCalled = false;
  assert.doesNotThrow(() =>
    middleware(req as any, res as any, () => {
      nextCalled = true;
    })
  );

  assert.equal(nextCalled, true);
  assert.deepEqual(res.locals.validatedQuery, { page: 4, limit: 30 });
  assert.deepEqual(queryStore, { page: '4', limit: '30', stale: 'x' });
});

test('validateParams should replace req.params with parsed data', () => {
  const { validateParams } = freshRequire(validateModulePath);
  const middleware = validateParams(
    z.object({
      id: z.string().trim().min(1),
    })
  );

  const req = { params: { id: '  abc-123  ' } };
  let nextCalled = false;

  middleware(req, {}, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.params, { id: 'abc-123' });
});
