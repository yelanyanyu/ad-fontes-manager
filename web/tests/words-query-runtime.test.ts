const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const wordsRoutePath = path.resolve(__dirname, '../routes/words.ts');
const wordControllerPath = path.resolve(__dirname, '../controllers/wordController.ts');
const wordServicePath = path.resolve(__dirname, '../services/wordService.ts');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test_db';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';

function loadWordsRouterWithMockedWordService(): any {
  const originalRoute = require.cache[wordsRoutePath];
  const originalController = require.cache[wordControllerPath];
  const originalService = require.cache[wordServicePath];

  delete require.cache[wordsRoutePath];
  delete require.cache[wordControllerPath];
  delete require.cache[wordServicePath];

  require.cache[wordServicePath] = {
    id: wordServicePath,
    filename: wordServicePath,
    loaded: true,
    exports: {
      listWords: async (req: any) => ({
        ok: true,
        source: req.validatedQuery ? 'validatedQuery' : 'query',
        query: req.validatedQuery || req.query || null,
      }),
      getWordDetails: async () => ({}),
      getWordById: async () => ({}),
      checkWord: async () => ({}),
      saveWord: async () => ({}),
      addWord: async () => ({ status: 'created', id: '1', lemma: 'lumen' }),
      deleteWord: async () => ({ success: true }),
    },
  } as any;

  const router = require(wordsRoutePath);

  delete require.cache[wordsRoutePath];
  delete require.cache[wordControllerPath];
  delete require.cache[wordServicePath];

  if (originalRoute) require.cache[wordsRoutePath] = originalRoute;
  if (originalController) require.cache[wordControllerPath] = originalController;
  if (originalService) require.cache[wordServicePath] = originalService;

  return router;
}

function invokeRouteLayer(routeLayer: any, req: any): Promise<Record<string, unknown>> {
  return new Promise(resolve => {
    let settled = false;
    const handlers = routeLayer.route.stack.map((stackLayer: any) => stackLayer.handle);
    const res: Record<string, any> = {
      locals: {},
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
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

    let index = 0;
    const next = (error?: unknown) => {
      if (settled) return;
      if (error) {
        settled = true;
        resolve({ type: 'next', error });
        return;
      }

      const handler = handlers[index++];
      if (!handler) {
        settled = true;
        resolve({ type: 'done' });
        return;
      }

      try {
        const maybePromise = handler(req, res, next);
        if (maybePromise && typeof maybePromise.then === 'function') {
          Promise.resolve(maybePromise).catch(next);
        }
      } catch (err) {
        next(err);
      }
    };

    next();
  });
}

test('GET /words returns data when req.query is getter-only at runtime', async () => {
  const wordsRouter = loadWordsRouterWithMockedWordService();
  const routeLayer = wordsRouter.stack.find(
    (layer: any) => layer.route && layer.route.path === '/' && layer.route.methods?.get
  );

  assert.ok(routeLayer, 'missing GET /words route');

  const req: Record<string, unknown> = {
    method: 'GET',
    originalUrl: '/api/words?page=1&limit=20&search=&sort=newest',
    id: 'req-words-getter-only',
  };

  Object.defineProperty(req, 'query', {
    get() {
      return { page: '1', limit: '20', search: '', sort: 'newest' };
    },
    enumerable: true,
    configurable: false,
  });

  const result = await invokeRouteLayer(routeLayer, req);

  assert.equal(result.type, 'response');
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.payload, {
    ok: true,
    source: 'validatedQuery',
    query: { page: 1, limit: 20, search: undefined, sort: 'newest' },
  });
});
