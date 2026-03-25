const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { z } = require('zod') as typeof import('zod');

const validateModulePath = path.resolve(__dirname, '../middleware/validate.ts');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test_db';
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

test('validateQuery should replace req.query with parsed data', () => {
  const { validateQuery } = freshRequire(validateModulePath);
  const middleware = validateQuery(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      include: z.string().optional(),
    })
  );

  const req = { query: { page: '2', include: 'examples,cognates' } };
  let nextCalled = false;

  middleware(req, {}, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.query, { page: 2, include: 'examples,cognates' });
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
